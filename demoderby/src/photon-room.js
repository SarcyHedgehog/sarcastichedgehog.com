import { DerbyModel } from "./game-model.js";
import { FIXED_STEP, MAX_PLAYERS, SNAPSHOT_MS } from "./constants.js";
const EVENT = Object.freeze({ HELLO: 1, INPUT: 2, SNAPSHOT: 3, REQUEST_STATE: 4, RESET: 5 });
const STATE_PROPERTY = "dd_state";
const NAME_PROPERTY = "dd_name";

export class PhotonRoom extends EventTarget {
  constructor(config) { super(); this.config = config; this.model = null; this.latest = null; this.connected = false; this.loop = null; this.snapshotLoop = null; }
  async connect({ roomCode, name }) {
    if (!this.config.PHOTON_APP_ID) throw new Error("Add PHOTON_APP_ID to config.js first.");
    await loadScript(this.config.PHOTON_SDK_URL || "vendor/photon.min.js");
    const Photon = window.Photon; if (!Photon?.LoadBalancing) throw new Error("Photon Realtime SDK did not load.");
    this.roomCode = normalizeRoom(roomCode); this.name = cleanName(name);
    const Client = Photon.LoadBalancing.LoadBalancingClient;
    this.client = new Client(Photon.ConnectionProtocol.Wss, this.config.PHOTON_APP_ID, "demoderby-2");
    this.client.setUserId(loadIdentity()); this.client.setLogLevel(this.config.DEBUG ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);
    this.client.onStateChange = state => {
      this.status(Client.StateToName?.(state) || String(state));
      if (state === Client.State.JoinedLobby) this.client.joinRoom(this.roomCode, { createIfNotExists: true }, { isVisible: false, maxPlayers: MAX_PLAYERS + 4, playerTTL: 30_000, roomTTL: 300_000 });
      if (state === Client.State.Disconnected) { this.connected = false; this.stopAuthority(); this.status("Disconnected"); }
    };
    this.client.onJoinRoom = created => this.onJoinRoom(created);
    this.client.onActorJoin = actor => this.onActorJoin(actor);
    this.client.onActorLeave = actor => this.onActorLeave(actor);
    this.client.onActorPropertiesChange = () => { this.emitPresence(); if (this.isMaster()) this.syncNames(); };
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
    clearTimeout(this.timeout); this.connected = true; this.client.myActor().setName(this.name); this.client.myActor().setCustomProperty(NAME_PROPERTY, this.name);
    if (created) { this.model = new DerbyModel(randomSeed()); this.model.addPlayer(this.myActor(), this.name); this.startAuthority(); }
    else if (this.isMaster()) { this.consumeRoomState(); this.model ||= new DerbyModel(randomSeed()); this.rebuildPlayers(); this.startAuthority(); }
    else { this.sendHello(); this.requestState(); }
    this.status("Connected"); this.emitPresence(); this.resolveConnect?.(); this.resolveConnect = null; this.rejectConnect = null;
  }
  onActorJoin(actor) { if (this.isMaster() && this.model) { this.model.addPlayer(actor.actorNr, actor.name); this.broadcast(true); } this.emitPresence(); }
  onActorLeave(actor) {
    if (this.isMaster() && this.model) { this.model.removePlayer(actor.actorNr); this.broadcast(true); }
    setTimeout(() => { if (this.connected && this.isMaster() && !this.loop) { this.consumeRoomState(); this.rebuildPlayers(); this.startAuthority(); } }, 150);
    this.emitPresence();
  }
  onEvent(code, content, actorNr) {
    if (code === EVENT.HELLO && this.isMaster()) { this.model.addPlayer(actorNr, content?.name); this.broadcast(true); }
    else if (code === EVENT.INPUT && this.isMaster()) this.model?.setInput(actorNr, content);
    else if (code === EVENT.SNAPSHOT && !this.isMaster()) this.consumeSnapshot(content);
    else if (code === EVENT.REQUEST_STATE && this.isMaster()) this.broadcast(true, actorNr);
    else if (code === EVENT.RESET && this.isMaster()) this.resetGame();
  }
  sendHello() { this.client.raiseEvent(EVENT.HELLO, { name: this.name }, { targetActors: [this.client.myRoomMasterActorNr()] }); }
  requestState() { this.client.raiseEvent(EVENT.REQUEST_STATE, null, { targetActors: [this.client.myRoomMasterActorNr()] }); }
  setInput(input) { if (!this.connected) return; if (this.isMaster()) this.model?.setInput(this.myActor(), input); else this.client.raiseEvent(EVENT.INPUT, input, { targetActors: [this.client.myRoomMasterActorNr()] }); }
  reset() { if (this.isMaster()) this.resetGame(); else this.client.raiseEvent(EVENT.RESET, null, { targetActors: [this.client.myRoomMasterActorNr()] }); }
  resetGame() { const old = this.model; this.model = new DerbyModel(randomSeed()); for (const car of old?.connectedCars() || []) this.model.addPlayer(car.id, car.name); this.broadcast(true); }
  startAuthority() {
    this.stopAuthority(); if (!this.isMaster()) return; this.persistCounter = 0;
    this.loop = setInterval(() => this.model?.tick(FIXED_STEP), FIXED_STEP * 1000);
    this.snapshotLoop = setInterval(() => { this.persistCounter = (this.persistCounter + 1) % 15; this.broadcast(this.persistCounter === 0); }, SNAPSHOT_MS);
    this.broadcast(true);
  }
  stopAuthority() { clearInterval(this.loop); clearInterval(this.snapshotLoop); this.loop = this.snapshotLoop = null; }
  rebuildPlayers() {
    if (!this.model) return; const actors = this.client.myRoomActors(); const current = new Set(Object.keys(actors).map(Number));
    Object.values(this.model.cars).forEach(car => { if (!current.has(Number(car.id))) this.model.removePlayer(car.id); });
    current.forEach(actor => this.model.addPlayer(actor, actors[actor]?.getCustomProperty(NAME_PROPERTY) || actors[actor]?.name)); this.syncNames();
  }
  syncNames() {
    if (!this.model) return; const actors = this.client.myRoomActors();
    Object.values(actors).forEach(actor => { const car = this.model.cars[String(actor.actorNr)]; if (car) car.name = cleanName(actor.getCustomProperty(NAME_PROPERTY) || actor.name); });
  }
  broadcast(persist = false, targetActor = null) {
    if (!this.model || !this.connected || !this.isMaster()) return; const snapshot = this.model.snapshot(); this.consumeSnapshot(snapshot);
    if (persist) this.client.myRoom().setCustomProperty(STATE_PROPERTY, JSON.stringify(snapshot));
    const options = targetActor ? { targetActors: [targetActor] } : { receivers: window.Photon.LoadBalancing.Constants.ReceiverGroup.Others };
    this.client.raiseEvent(EVENT.SNAPSHOT, snapshot, options);
  }
  consumeRoomState() {
    const raw = this.client.myRoom().getCustomProperty(STATE_PROPERTY); if (!raw) return;
    try { const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw; if (this.isMaster()) { this.model = new DerbyModel(snapshot.seed); this.model.restore(snapshot); } this.consumeSnapshot(snapshot); }
    catch (error) { this.error(`Could not restore the arena: ${error.message}`); }
  }
  consumeSnapshot(snapshot) { if (!snapshot || (this.latest && snapshot.tickNumber < this.latest.tickNumber)) return; this.latest = snapshot; this.dispatchEvent(new CustomEvent("snapshot", { detail: snapshot })); }
  emitPresence() {
    if (!this.client?.myRoomActors) return;
    const actors = Object.values(this.client.myRoomActors()).map(actor => ({ actor: actor.actorNr, name: actor.getCustomProperty(NAME_PROPERTY) || actor.name || `Driver ${actor.actorNr}` }));
    this.dispatchEvent(new CustomEvent("presence", { detail: actors }));
  }
  myActor() { return this.client.myActor().actorNr; }
  isMaster() { return this.client && this.myActor() === this.client.myRoomMasterActorNr(); }
  status(message) { this.dispatchEvent(new CustomEvent("status", { detail: message })); }
  error(message) { this.dispatchEvent(new CustomEvent("error", { detail: message })); this.rejectConnect?.(new Error(message)); }
  disconnect() { this.stopAuthority(); this.client?.disconnect(); }
}
function cleanName(value) { return String(value || "Driver").trim().slice(0, 18) || "Driver"; }
function normalizeRoom(value) { return String(value || "SMASH").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "SMASH"; }
function randomSeed() { const values = new Uint32Array(1); if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values); else values[0] = Math.floor(Math.random() * 0xffffffff); return values[0]; }
function loadIdentity() { let id = localStorage.getItem("demoderby-id"); if (!id) { id = globalThis.crypto?.randomUUID?.() || fallbackUuid(); localStorage.setItem("demoderby-id", id); } return id; }
function fallbackUuid() { const bytes = new Uint8Array(16); if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes); else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128; const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")); return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`; }
async function loadScript(url) { if (window.Photon?.LoadBalancing) return; await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = url; script.onload = resolve; script.onerror = () => reject(new Error(`Could not load ${url}`)); document.head.append(script); }); }

