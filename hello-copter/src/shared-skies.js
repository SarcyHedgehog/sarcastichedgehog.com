import { wrap } from './world.js';

const EVENT = Object.freeze({ HELLO: 1, POSE: 2 });
const NAME_PROPERTY = 'hc_name';

export class SharedSkies extends EventTarget {
  constructor(config = {}) { super(); this.config = config; this.remotes = new Map(); this.lastSend = 0; }

  async connect({ roomCode, name }) {
    if (!this.config.PHOTON_APP_ID) throw new Error('Shared Skies needs its own Photon Realtime App ID in config.js.');
    await loadScript(this.config.PHOTON_SDK_URL || 'vendor/photon.min.js');
    const Photon = window.Photon;
    if (!Photon?.LoadBalancing) throw new Error('Photon Realtime SDK did not load.');
    this.roomCode = normalizeRoom(roomCode); this.name = cleanName(name);
    const Client = Photon.LoadBalancing.LoadBalancingClient;
    this.client = new Client(Photon.ConnectionProtocol.Wss, this.config.PHOTON_APP_ID, 'hello-copter-1');
    this.client.setUserId(loadIdentity());
    this.client.setLogLevel(this.config.DEBUG ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);
    this.client.onStateChange = state => {
      this.status(Client.StateToName?.(state) || String(state));
      if (state === Client.State.JoinedLobby) this.client.joinRoom(this.roomCode, { createIfNotExists: true }, { isVisible: false, maxPlayers: 12, playerTTL: 10_000, roomTTL: 300_000 });
      if (state === Client.State.Disconnected) this.status('Disconnected');
    };
    this.client.onJoinRoom = () => this.onJoinRoom();
    this.client.onActorJoin = () => this.emitPresence();
    this.client.onActorLeave = actor => { this.remotes.delete(actor.actorNr); this.emitPresence(); };
    this.client.onEvent = (code, content, actorNr) => this.onEvent(code, content, actorNr);
    this.client.onError = (_code, message) => this.fail(message || 'Photon connection error');
    return new Promise((resolve, reject) => {
      this.resolveConnect = resolve; this.rejectConnect = reject;
      this.timeout = setTimeout(() => reject(new Error('Photon connection timed out.')), 20_000);
      this.client.connectToNameServer({ region: this.config.PHOTON_REGION || 'eu' });
    });
  }

  onJoinRoom() {
    clearTimeout(this.timeout);
    const actor = this.client.myActor(); actor.setName(this.name); actor.setCustomProperty(NAME_PROPERTY, this.name);
    this.client.raiseEvent(EVENT.HELLO, { name: this.name }, { receivers: window.Photon.LoadBalancing.Constants.ReceiverGroup.Others });
    this.status('Shared Skies'); this.emitPresence(); this.resolveConnect?.(); this.resolveConnect = null;
  }

  onEvent(code, content, actorNr) {
    if (actorNr === this.client?.myActor()?.actorNr) return;
    if (code === EVENT.HELLO) {
      const current = this.remotes.get(actorNr) || {};
      this.remotes.set(actorNr, { ...current, name: cleanName(content?.name), receivedAt: performance.now() });
      this.emitPresence();
    } else if (code === EVENT.POSE && content) {
      this.remotes.set(actorNr, {
        actorNr, name: cleanName(content.name), x: Number(content.x) || 0, y: Number(content.y) || 0,
        vx: Number(content.vx) || 0, vy: Number(content.vy) || 0, facing: content.facing < 0 ? -1 : 1,
        pitch: Number(content.pitch) || 0, lives: Number(content.lives) || 0,
        shield: Number(content.shield) || 0, receivedAt: performance.now(),
      });
      this.emitPresence();
    }
  }

  publish(player) {
    if (!player || !this.client?.isJoinedToRoom?.()) return;
    const now = performance.now(); if (now - this.lastSend < 80) return; this.lastSend = now;
    this.client.raiseEvent(EVENT.POSE, {
      name: this.name, x: Math.round(player.x * 10) / 10, y: Math.round(player.y * 10) / 10,
      vx: Math.round(player.vx * 10) / 10, vy: Math.round(player.vy * 10) / 10,
      facing: player.facing, pitch: Math.round(player.pitch * 1000) / 1000,
      lives: player.lives, shield: Math.round(player.shield * 10) / 10,
    }, { receivers: window.Photon.LoadBalancing.Constants.ReceiverGroup.Others });
  }

  pilots() {
    const now = performance.now(), values = [];
    for (const [actorNr, pose] of this.remotes) {
      const age = Math.min(.35, Math.max(0, (now - pose.receivedAt) / 1000));
      if (now - pose.receivedAt > 5000 || pose.x == null) continue;
      values.push({ ...pose, actorNr, x: wrap(pose.x + pose.vx * age), y: pose.y + pose.vy * age });
    }
    return values;
  }

  emitPresence() {
    const count = this.client?.myRoomActors ? Object.keys(this.client.myRoomActors()).length : 1;
    this.dispatchEvent(new CustomEvent('presence', { detail: count }));
  }
  status(detail) { this.dispatchEvent(new CustomEvent('status', { detail })); }
  fail(message) { this.dispatchEvent(new CustomEvent('error', { detail: message })); this.rejectConnect?.(new Error(message)); }
  disconnect() { this.client?.disconnect(); this.client = null; this.remotes.clear(); }
}

function cleanName(value) { return String(value || 'Pilot').trim().slice(0, 16) || 'Pilot'; }
function normalizeRoom(value) { return String(value || 'FLOCK').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'FLOCK'; }
function loadIdentity() {
  let id = localStorage.getItem('hello-copter-photon-id');
  if (!id) { id = globalThis.crypto?.randomUUID?.() || `hc-${Date.now()}-${Math.random()}`; localStorage.setItem('hello-copter-photon-id', id); }
  return id;
}
async function loadScript(url) {
  if (window.Photon?.LoadBalancing) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = url; script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${url}`)); document.head.append(script);
  });
}
