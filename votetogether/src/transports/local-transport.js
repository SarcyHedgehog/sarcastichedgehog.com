import { applyCommand, authenticateUser, createInitialState } from "../game-state.js";

const HEARTBEAT_MS = 8_000;
const PRESENCE_TTL_MS = 24_000;

export class LocalTransport {
  constructor() {
    this.kind = "local";
    this.roomCode = null;
    this.username = null;
    this.clientId = crypto.randomUUID();
    this.listeners = new Set();
    this.channel = null;
    this.heartbeat = null;
    this.snapshot = null;
  }

  async connect({ roomCode, username, passwordHash }) {
    this.roomCode = roomCode;
    this.username = username;
    this.channel = new BroadcastChannel(this.channelName());
    this.channel.addEventListener("message", () => this.refresh());

    const auth = await this.withRoomLock(() => {
      const state = this.loadState();
      const result = authenticateUser(state, username, passwordHash);
      if (result.changed) this.saveState(result.state);
      return result;
    });

    if (auth.result === "bad_password") {
      this.channel.close();
      this.channel = null;
      throw new Error("Username taken or incorrect password.");
    }

    this.touchPresence();
    this.heartbeat = window.setInterval(() => this.touchPresence(), HEARTBEAT_MS);
    window.addEventListener("beforeunload", () => this.removePresence(), { once: true });
    this.refresh();
    return { authResult: auth.result, snapshot: this.snapshot };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.snapshot) listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async sendCommand(command) {
    const result = await this.withRoomLock(() => {
      const state = this.loadState();
      const applied = applyCommand(state, command, { username: this.username });
      if (applied.changed) this.saveState(applied.state);
      return applied;
    });
    if (result.error) throw new Error(result.error);
    this.channel.postMessage({ type: "state" });
    this.refresh();
  }

  disconnect() {
    window.clearInterval(this.heartbeat);
    this.removePresence();
    this.channel?.close();
  }

  resetRoom() {
    localStorage.removeItem(this.stateKey());
    localStorage.removeItem(this.presenceKey());
    this.channel?.postMessage({ type: "state" });
  }

  refresh() {
    this.snapshot = {
      state: this.loadState(),
      presence: this.readPresence().map((entry) => entry.username),
      transport: "Local multi-tab",
      connected: true,
    };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  touchPresence() {
    const now = Date.now();
    const presence = this.readPresence(false).filter((entry) => entry.expiresAt > now);
    const withoutMe = presence.filter((entry) => entry.clientId !== this.clientId);
    withoutMe.push({ clientId: this.clientId, username: this.username, expiresAt: now + PRESENCE_TTL_MS });
    localStorage.setItem(this.presenceKey(), JSON.stringify(withoutMe));
    this.channel?.postMessage({ type: "presence" });
    this.refresh();
  }

  removePresence() {
    if (!this.roomCode) return;
    const presence = this.readPresence(false).filter((entry) => entry.clientId !== this.clientId);
    localStorage.setItem(this.presenceKey(), JSON.stringify(presence));
    this.channel?.postMessage({ type: "presence" });
  }

  readPresence(prune = true) {
    let value = [];
    try { value = JSON.parse(localStorage.getItem(this.presenceKey()) || "[]"); } catch { value = []; }
    if (!prune) return value;
    const live = value.filter((entry) => entry.expiresAt > Date.now());
    if (live.length !== value.length) localStorage.setItem(this.presenceKey(), JSON.stringify(live));
    return live;
  }

  loadState() {
    try {
      const stored = localStorage.getItem(this.stateKey());
      return stored ? JSON.parse(stored) : createInitialState(this.roomCode);
    } catch {
      return createInitialState(this.roomCode);
    }
  }

  saveState(state) {
    localStorage.setItem(this.stateKey(), JSON.stringify(state));
  }

  stateKey() { return `votetogether:local:${this.roomCode}:state`; }
  presenceKey() { return `votetogether:local:${this.roomCode}:presence`; }
  channelName() { return `votetogether:${this.roomCode}`; }

  async withRoomLock(callback) {
    if (navigator.locks?.request) {
      return navigator.locks.request(`votetogether:${this.roomCode}`, callback);
    }
    return callback();
  }
}
