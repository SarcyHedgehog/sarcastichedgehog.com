import { GameModel } from "./game-model.js?v=20260813-5";
import { SNAPSHOT_MS, TICK_MS } from "./constants.js?v=20260813-5";

const EVENT = Object.freeze({ HELLO: 1, INPUT: 2, SNAPSHOT: 3, REQUEST_STATE: 4, RESET: 5 });
const STATE_PROPERTY = "bp_state";
const NAME_PROPERTY = "bp_name";

export class PhotonRoom extends EventTarget {
  constructor(config) {
    super(); this.config = config; this.model = null; this.latest = null;
    this.loop = null; this.snapshotLoop = null; this.connected = false;
  }

  async connect({ roomCode, name }) {
    if (!this.config.PHOTON_APP_ID) throw new Error("Add PHOTON_APP_ID to config.js first.");
    await loadScript(this.config.PHOTON_SDK_URL || "vendor/photon.min.js");
    const Photon = window.Photon;
    if (!Photon?.LoadBalancing) throw new Error("Photon Realtime SDK did not load.");
    this.roomCode = normalizeRoom(roomCode); this.name = name.trim().slice(0, 20) || "Player";
    const Client = Photon.LoadBalancing.LoadBalancingClient;
    this.client = new Client(Photon.ConnectionProtocol.Wss, this.config.PHOTON_APP_ID, "breakpong-2");
    this.client.setUserId(createConnectionIdentity());
    this.client.setLogLevel(this.config.DEBUG ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);
    this.client.onStateChange = (state) => {
      this.status(Client.StateToName?.(state) || String(state));
      // Do not retain inactive actors. A retained actor looks like a second
      // player during a quick refresh/rejoin and can start a phantom match.
      if (state === Client.State.JoinedLobby) this.client.joinRoom(this.roomCode, { createIfNotExists: true }, { isVisible: false, maxPlayers: 12, playerTTL: 0, roomTTL: 300_000 });
      if (state === Client.State.Disconnected) { this.connected = false; this.stopAuthority(); this.status("Disconnected"); }
    };
    this.client.onJoinRoom = (created) => this.onJoinRoom(created);
    this.client.onActorJoin = (actor) => this.onActorJoin(actor);
    this.client.onActorLeave = (actor) => this.onActorLeave(actor);
    this.client.onActorPropertiesChange = () => this.emitPresence();
    this.client.onMyRoomPropertiesChange = () => { if (!this.isMaster()) this.consumeRoomState(); };
    this.client.onEvent = (code, content, actorNr) => this.onEvent(code, content, actorNr);
    this.client.onError = (_code, message) => this.error(message || "Photon connection error");
    this.client.onOperationResponse = (code, message) => { if (code) this.error(message || `Photon operation failed (${code})`); };
    return new Promise((resolve, reject) => {
      this.resolveConnect = resolve; this.rejectConnect = reject;
      this.timeout = setTimeout(() => reject(new Error("Photon connection timed out.")), 20_000);
      this.client.connectToNameServer({ region: this.config.PHOTON_REGION || "eu" });
    });
  }

  onJoinRoom(created) {
    clearTimeout(this.timeout); this.connected = true;
    this.client.myActor().setName(this.name);
    this.client.myActor().setCustomProperty(NAME_PROPERTY, this.name);
    if (created) {
      this.model = new GameModel(randomSeed());
      this.model.join(this.myActor()); this.startAuthority();
    } else if (this.isMaster()) {
      // Restore without publishing first. The room property can still contain
      // two departed players and a countdown; emitting that transient state
      // used to launch the camera intro before rebuildPlayers corrected it.
      this.consumeRoomState(false);
      this.model ||= new GameModel(randomSeed());
      if (!this.hasReturningPlayer()) this.model = new GameModel(randomSeed());
      this.rebuildPlayers(); this.startAuthority();
    } else {
      this.client.raiseEvent(EVENT.HELLO, { name: this.name }, { targetActors: [this.client.myRoomMasterActorNr()] });
      this.client.raiseEvent(EVENT.REQUEST_STATE, null, { targetActors: [this.client.myRoomMasterActorNr()] });
    }
    this.status("Connected"); this.emitPresence();
    this.resolveConnect?.(); this.resolveConnect = null; this.rejectConnect = null;
  }

  onActorJoin(actor) {
    if (this.isMaster() && this.model) { this.model.join(actor.actorNr); this.broadcast(true); }
    this.emitPresence();
  }

  onActorLeave(actor) {
    if (this.isMaster() && this.model) { this.model.leave(actor.actorNr); this.broadcast(true); }
    setTimeout(() => {
      if (this.connected && this.isMaster() && !this.loop) { this.consumeRoomState(false); this.rebuildPlayers(); this.startAuthority(); }
    }, 100);
    this.emitPresence();
  }

  onEvent(code, content, actorNr) {
    if (code === EVENT.HELLO && this.isMaster()) { this.model.join(actorNr); this.broadcast(true); }
    else if (code === EVENT.INPUT && this.isMaster()) this.model.setInput(actorNr, content.direction);
    else if (code === EVENT.SNAPSHOT && !this.isMaster()) this.consumeSnapshot(content);
    else if (code === EVENT.REQUEST_STATE && this.isMaster()) this.broadcast(true, actorNr);
    else if (code === EVENT.RESET && this.isMaster()) this.resetGame();
  }

  setInput(direction) {
    if (!this.connected) return;
    if (this.isMaster()) this.model?.setInput(this.myActor(), direction);
    else this.client.raiseEvent(EVENT.INPUT, { direction }, { targetActors: [this.client.myRoomMasterActorNr()] });
  }

  reset() {
    if (this.isMaster()) this.resetGame();
    else this.client.raiseEvent(EVENT.RESET, null, { targetActors: [this.client.myRoomMasterActorNr()] });
  }

  resetGame() {
    const players = { ...this.model.players };
    this.model = new GameModel(randomSeed()); this.model.players = players;
    if (this.model.hasTwoPlayers()) this.model.beginCountdown();
    this.broadcast(true);
  }

  startAuthority() {
    this.stopAuthority();
    if (!this.isMaster()) return;
    this.persistCounter = 0;
    this.loop = setInterval(() => this.model?.step(TICK_MS), TICK_MS);
    this.snapshotLoop = setInterval(() => { this.persistCounter = (this.persistCounter + 1) % 15; this.broadcast(this.persistCounter === 0); }, SNAPSHOT_MS);
    this.broadcast(true);
  }

  stopAuthority() { clearInterval(this.loop); clearInterval(this.snapshotLoop); this.loop = this.snapshotLoop = null; }

  rebuildPlayers() {
    if (!this.model) return;
    const actors = new Set(Object.keys(this.client.myRoomActors()).map(Number));
    for (const actor of Object.values(this.model.players)) if (actor && !actors.has(Number(actor))) this.model.leave(actor);
    for (const actor of actors) this.model.join(actor);
  }

  hasReturningPlayer() {
    if (!this.model) return false;
    const actors = new Set(Object.keys(this.client.myRoomActors()).map(Number));
    return Object.values(this.model.players).some((actor) => actor && actors.has(Number(actor)));
  }

  broadcast(persist = false, targetActor = null) {
    if (!this.model || !this.connected || !this.isMaster()) return;
    const snapshot = this.model.snapshot(); this.consumeSnapshot(snapshot);
    if (persist) this.client.myRoom().setCustomProperty(STATE_PROPERTY, JSON.stringify(snapshot));
    const options = targetActor ? { targetActors: [targetActor] } : { receivers: window.Photon.LoadBalancing.Constants.ReceiverGroup.Others };
    this.client.raiseEvent(EVENT.SNAPSHOT, snapshot, options);
  }

  consumeRoomState(emit = true) {
    const raw = this.client.myRoom().getCustomProperty(STATE_PROPERTY);
    if (!raw) return;
    try {
      const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (this.isMaster()) { this.model = new GameModel(snapshot.seed); this.model.restore(snapshot); }
      if (emit) this.consumeSnapshot(snapshot);
    } catch (error) { this.error(`Could not restore room: ${error.message}`); }
  }

  consumeSnapshot(snapshot) {
    if (!snapshot || (this.latest && snapshot.tickNumber < this.latest.tickNumber)) return;
    this.latest = snapshot;
    this.dispatchEvent(new CustomEvent("snapshot", { detail: snapshot }));
  }

  emitPresence() {
    if (!this.client?.myRoomActors) return;
    const actors = Object.values(this.client.myRoomActors()).map((a) => ({ actor: a.actorNr, name: a.getCustomProperty(NAME_PROPERTY) || a.name || `Guest ${a.actorNr}` }));
    this.dispatchEvent(new CustomEvent("presence", { detail: actors }));
  }

  role() {
    const player = this.latest && Number(Object.keys(this.latest.players).find((key) => Number(this.latest.players[key]) === this.myActor()));
    return player ? `Player ${player}` : "Spectator";
  }
  myActor() { return this.client.myActor().actorNr; }
  isMaster() { return this.client && this.myActor() === this.client.myRoomMasterActorNr(); }
  status(message) { this.dispatchEvent(new CustomEvent("status", { detail: message })); }
  error(message) { this.dispatchEvent(new CustomEvent("error", { detail: message })); this.rejectConnect?.(new Error(message)); }
  disconnect() { this.stopAuthority(); this.client?.disconnect(); }
}

function normalizeRoom(value) { return (value || "ARENA").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "ARENA"; }
function randomSeed() { const values=new Uint32Array(1);if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(values);else values[0]=Math.floor(Math.random()*0xffffffff);return values[0]; }
function createConnectionIdentity() { return globalThis.crypto?.randomUUID?.() || fallbackUuid(); }
function fallbackUuid() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0,4).join("")}-${hex.slice(4,6).join("")}-${hex.slice(6,8).join("")}-${hex.slice(8,10).join("")}-${hex.slice(10).join("")}`;
}
async function loadScript(url) {
  if (window.Photon?.LoadBalancing) return;
  await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = url; script.onload = resolve; script.onerror = () => reject(new Error(`Could not load ${url}`)); document.head.append(script); });
}
