import { C, MAX_PLAYERS } from "./constants.js";
import { MazeGameModel } from "./game-model.js";

const EVENT = Object.freeze({ HELLO: 1, TURN: 2, SNAPSHOT: 3, REQUEST_STATE: 4 });
const STATE_PROPERTY = "mt_state";
const NAME_PROPERTY = "mt_name";

export class PhotonRoom extends EventTarget {
  constructor(config, maze, mapId) { super(); this.config = config; this.maze = maze; this.mapId = mapId; this.latest = null; }
  async connect({ roomCode, name }) {
    if (!this.config.PHOTON_APP_ID) throw new Error("Add PHOTON_APP_ID to config.js first, or use Practice Maze.");
    await loadScript(this.config.PHOTON_SDK_URL || "vendor/photon.min.js");
    const Photon = window.Photon;
    if (!Photon?.LoadBalancing) throw new Error("Photon Realtime SDK did not load.");
    this.roomCode = normalizeRoom(roomCode); this.name = cleanName(name);
    const Client = Photon.LoadBalancing.LoadBalancingClient;
    this.client = new Client(Photon.ConnectionProtocol.Wss, this.config.PHOTON_APP_ID, "mazetag-2");
    this.client.setUserId(loadIdentity());
    this.client.setLogLevel(this.config.DEBUG ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);
    this.client.onStateChange = state => {
      const label = Client.StateToName?.(state) || String(state); this.status(label);
      if (state === Client.State.JoinedLobby) this.client.joinRoom(this.roomCode, { createIfNotExists: true }, { isVisible: false, maxPlayers: MAX_PLAYERS + 8, playerTTL: 30_000, roomTTL: 300_000 });
      if (state === Client.State.Disconnected) { this.stopAuthority(); this.status("Disconnected"); }
    };
    this.client.onJoinRoom = created => this.onJoinRoom(created);
    this.client.onActorJoin = actor => this.onActorJoin(actor);
    this.client.onActorLeave = actor => this.onActorLeave(actor);
    this.client.onActorPropertiesChange = () => this.emitPresence();
    this.client.onMyRoomPropertiesChange = () => { if (!this.isMaster()) this.consumeRoomState(); };
    this.client.onEvent = (code, content, actorNr) => this.onEvent(code, content, actorNr);
    this.client.onError = (_code, message) => this.error(message || "Photon connection error");
    return new Promise((resolve, reject) => {
      this.resolveConnect = resolve; this.rejectConnect = reject;
      this.timeout = setTimeout(() => reject(new Error("Photon connection timed out.")), 20_000);
      this.client.connectToNameServer({ region: this.config.PHOTON_REGION || "eu" });
    });
  }
  onJoinRoom(created) {
    clearTimeout(this.timeout); this.client.myActor().setName(this.name); this.client.myActor().setCustomProperty(NAME_PROPERTY, this.name);
    if (created) { this.model = new MazeGameModel({ maze: this.maze, mapId: this.mapId, seed: randomSeed() }); this.model.addPlayer(this.myActor(), this.name); this.startAuthority(); }
    else if (this.isMaster()) { this.consumeRoomState(); this.model ||= new MazeGameModel({ maze: this.maze, mapId: this.mapId, seed: randomSeed() }); this.rebuildPlayers(); this.startAuthority(); }
    else { this.sendHello(); this.requestState(); }
    this.status("Connected"); this.emitPresence(); this.resolveConnect?.(); this.resolveConnect = null;
  }
  onActorJoin(actor) { if (this.isMaster() && this.model && this.model.connectedPlayers().length < MAX_PLAYERS) { this.model.addPlayer(actor.actorNr, actor.name); this.broadcast(true); } this.emitPresence(); }
  onActorLeave(actor) { if (this.isMaster()) { this.model?.removePlayer(actor.actorNr); this.broadcast(true); } setTimeout(() => { if (this.isMaster() && !this.loop) { this.consumeRoomState(); this.rebuildPlayers(); this.startAuthority(); } }, 150); this.emitPresence(); }
  onEvent(code, content, actorNr) {
    if (code === EVENT.HELLO && this.isMaster()) { if (this.model.connectedPlayers().length < MAX_PLAYERS) this.model.addPlayer(actorNr, content?.name); this.broadcast(true); }
    else if (code === EVENT.TURN && this.isMaster()) this.model?.setTurn(actorNr, content);
    else if (code === EVENT.SNAPSHOT && !this.isMaster()) this.consumeSnapshot(content);
    else if (code === EVENT.REQUEST_STATE && this.isMaster()) this.broadcast(true, actorNr);
  }
  sendHello() { this.client.raiseEvent(EVENT.HELLO, { name: this.name }, { targetActors: [this.client.myRoomMasterActorNr()] }); }
  requestState() { this.client.raiseEvent(EVENT.REQUEST_STATE, null, { targetActors: [this.client.myRoomMasterActorNr()] }); }
  setTurn(input) { if (this.isMaster()) this.model?.setTurn(this.myActor(), input); else this.client.raiseEvent(EVENT.TURN, input, { targetActors: [this.client.myRoomMasterActorNr()] }); }
  startAuthority() { this.stopAuthority(); if (!this.isMaster()) return; let persist = 0; this.loop = setInterval(() => this.model?.step(C.tickMs), C.tickMs); this.snapshotLoop = setInterval(() => { persist = (persist + 1) % 20; this.broadcast(persist === 0); }, C.snapshotMs); this.broadcast(true); }
  stopAuthority() { clearInterval(this.loop); clearInterval(this.snapshotLoop); this.loop = this.snapshotLoop = null; }
  rebuildPlayers() { const actors = this.client.myRoomActors(); const live = new Set(Object.keys(actors).map(String)); for (const player of this.model.connectedPlayers()) if (!live.has(player.id)) this.model.removePlayer(player.id); for (const actor of Object.values(actors)) if (this.model.connectedPlayers().length < MAX_PLAYERS) this.model.addPlayer(actor.actorNr, actor.getCustomProperty(NAME_PROPERTY) || actor.name); }
  broadcast(persist = false, targetActor = null) { if (!this.model || !this.isMaster()) return; const snapshot = this.model.snapshot(); this.consumeSnapshot(snapshot); if (persist) this.client.myRoom().setCustomProperty(STATE_PROPERTY, JSON.stringify(snapshot)); const options = targetActor ? { targetActors: [targetActor] } : { receivers: window.Photon.LoadBalancing.Constants.ReceiverGroup.Others }; this.client.raiseEvent(EVENT.SNAPSHOT, snapshot, options); }
  consumeRoomState() { const raw = this.client.myRoom().getCustomProperty(STATE_PROPERTY); if (!raw) return; try { const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw; if (this.isMaster()) { this.model = new MazeGameModel({ maze: snapshot.maze, mapId: snapshot.mapId, seed: snapshot.seed }); this.model.restore(snapshot); } this.consumeSnapshot(snapshot); } catch (error) { this.error(`Could not restore maze: ${error.message}`); } }
  consumeSnapshot(snapshot) { if (!snapshot || (this.latest && snapshot.tickNumber < this.latest.tickNumber)) return; this.latest = snapshot; this.dispatchEvent(new CustomEvent("snapshot", { detail: snapshot })); }
  emitPresence() { if (!this.client?.myRoomActors) return; const actors = Object.values(this.client.myRoomActors()).map(actor => ({ actor: actor.actorNr, name: actor.getCustomProperty(NAME_PROPERTY) || actor.name || `Runner ${actor.actorNr}` })); this.dispatchEvent(new CustomEvent("presence", { detail: actors })); }
  myActor() { return this.client.myActor().actorNr; }
  isMaster() { return this.client && this.myActor() === this.client.myRoomMasterActorNr(); }
  status(message) { this.dispatchEvent(new CustomEvent("status", { detail: message })); }
  error(message) { this.dispatchEvent(new CustomEvent("error", { detail: message })); this.rejectConnect?.(new Error(message)); }
  disconnect() { this.stopAuthority(); this.client?.disconnect(); }
}

function cleanName(value) { return String(value || "Runner").trim().slice(0, 18) || "Runner"; }
function normalizeRoom(value) { return String(value || "LABYRINTH").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "LABYRINTH"; }
function randomSeed() { const values = new Uint32Array(1); globalThis.crypto?.getRandomValues?.(values); return values[0] || Math.floor(Math.random() * 0xffffffff); }
function loadIdentity() { let id = localStorage.getItem("mazetag-photon-id"); if (!id) { id = globalThis.crypto?.randomUUID?.() || `mt-${Date.now()}-${Math.random()}`; localStorage.setItem("mazetag-photon-id", id); } return id; }
async function loadScript(url) { if (window.Photon?.LoadBalancing) return; await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = url; script.onload = resolve; script.onerror = () => reject(new Error(`Could not load ${url}`)); document.head.append(script); }); }
