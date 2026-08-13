import { applyCommand, authenticateUser, createInitialState } from "../game-state.js";

const EVENT = { AUTH: 1, AUTH_RESULT: 2, COMMAND: 3, SNAPSHOT: 4, STATE_REQUEST: 5 };
const STATE_PROPERTY = "vt_state";
const USER_PROPERTY = "vt_user";

export class PhotonTransport {
  constructor(config) {
    this.kind = "photon";
    this.config = config;
    this.listeners = new Set();
    this.authenticatedActors = new Map();
    this.snapshot = null;
    this.resolveConnect = null;
    this.rejectConnect = null;
  }

  async connect({ roomCode, username, passwordHash }) {
    if (!this.config.PHOTON_APP_ID) throw new Error("Add PHOTON_APP_ID to config.js first.");
    await loadPhotonSdk(this.config.PHOTON_SDK_URL || "vendor/photon.min.js");
    if (!window.Photon?.LoadBalancing) throw new Error("Photon JavaScript SDK did not load.");

    this.roomCode = roomCode;
    this.username = username;
    this.passwordHash = passwordHash;
    const Photon = window.Photon;
    const Client = Photon.LoadBalancing.LoadBalancingClient;
    const State = Client.State;
    this.client = new Client(Photon.ConnectionProtocol.Wss, this.config.PHOTON_APP_ID, "votetogether-1");
    this.client.setUserId(username);
    this.client.setLogLevel(this.config.DEBUG ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);

    this.client.onStateChange = (state) => {
      if (state === State.JoinedLobby) {
        this.client.joinRoom(
          roomCode,
          { createIfNotExists: true },
          { isVisible: false, maxPlayers: 20, roomTTL: 300_000, playerTTL: 60_000 },
        );
      }
      if (state === State.Disconnected && this.rejectConnect) {
        this.rejectConnect(new Error("Disconnected before joining the room."));
      }
    };
    this.client.onJoinRoom = (createdByMe) => this.onJoinRoom(createdByMe);
    this.client.onEvent = (code, content, actorNr) => this.onEvent(code, content, actorNr);
    this.client.onMyRoomPropertiesChange = () => this.consumeRoomState();
    this.client.onActorJoin = () => this.emitSnapshot();
    this.client.onActorPropertiesChange = () => {
      this.rebuildAuthenticatedActors();
      this.emitSnapshot();
    };
    this.client.onActorLeave = () => {
      this.rebuildAuthenticatedActors();
      this.emitSnapshot();
      if (this.isMaster()) this.broadcastSnapshot();
    };
    this.client.onError = (_code, message) => this.fail(new Error(message || "Photon connection error."));
    this.client.onOperationResponse = (errorCode, errorMessage) => {
      if (errorCode) this.fail(new Error(errorMessage || `Photon operation failed (${errorCode}).`));
    };

    const joined = new Promise((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
      window.setTimeout(() => reject(new Error("Photon connection timed out.")), 20_000);
    });
    // Cloud clients must discover the regional Master server through Photon’s
    // Name Server. connect() is only for an explicitly configured Master URL.
    this.client.connectToNameServer({ region: this.config.PHOTON_REGION || "eu" });
    return joined;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.snapshot) listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async sendCommand(command) {
    if (this.isMaster()) return this.processCommand(command, this.myActorNumber());
    this.client.raiseEvent(EVENT.COMMAND, command, { targetActors: [this.client.myRoomMasterActorNr()] });
  }

  disconnect() { this.client?.disconnect(); }

  onJoinRoom(createdByMe) {
    this.client.myActor().setName(this.username);
    if (createdByMe) {
      this.state = createInitialState(this.roomCode);
      this.persistState();
    } else {
      this.consumeRoomState();
    }
    if (this.isMaster()) this.processAuthentication(this.username, this.passwordHash, this.myActorNumber());
    else this.client.raiseEvent(EVENT.AUTH, { username: this.username, passwordHash: this.passwordHash }, { targetActors: [this.client.myRoomMasterActorNr()] });
  }

  onEvent(code, content, actorNr) {
    if (code === EVENT.AUTH && this.isMaster()) this.processAuthentication(content.username, content.passwordHash, actorNr);
    if (code === EVENT.AUTH_RESULT) this.finishAuthentication(content);
    if (code === EVENT.COMMAND && this.isMaster()) this.processCommand(content, actorNr);
    if (code === EVENT.SNAPSHOT) this.consumeState(content.state);
    if (code === EVENT.STATE_REQUEST && this.isMaster()) this.broadcastSnapshot();
  }

  processAuthentication(username, passwordHash, actorNr) {
    if (!this.state) this.consumeRoomState();
    const auth = authenticateUser(this.state || createInitialState(this.roomCode), username, passwordHash);
    if (auth.changed) {
      this.state = auth.state;
      this.persistState();
    }
    if (auth.result !== "bad_password") {
      this.authenticatedActors.set(actorNr, username);
    }
    if (actorNr === this.myActorNumber()) this.finishAuthentication({ result: auth.result });
    else this.client.raiseEvent(EVENT.AUTH_RESULT, { result: auth.result, username }, { targetActors: [actorNr] });
    this.broadcastSnapshot();
  }

  finishAuthentication({ result, username = this.username }) {
    if (result === "bad_password") {
      this.fail(new Error("Username taken or incorrect password."));
      this.client.leaveRoom();
      return;
    }
    this.client.myActor().setCustomProperty(USER_PROPERTY, username);
    const resolved = this.resolveConnect;
    this.resolveConnect = null;
    this.rejectConnect = null;
    this.emitSnapshot();
    resolved?.({ authResult: result, snapshot: this.snapshot });
  }

  processCommand(command, actorNr) {
    const username = this.authenticatedActors.get(actorNr)
      || this.client.myRoomActors()[actorNr]?.getCustomProperty(USER_PROPERTY);
    const applied = applyCommand(this.state, command, { username });
    if (!applied.changed) {
      if (actorNr === this.myActorNumber()) throw new Error(applied.error);
      return;
    }
    this.state = applied.state;
    this.persistState();
    this.broadcastSnapshot();
  }

  persistState() {
    this.client.myRoom().setCustomProperty(STATE_PROPERTY, JSON.stringify(this.state));
  }

  consumeRoomState() {
    const raw = this.client.myRoom().getCustomProperty(STATE_PROPERTY);
    if (raw) this.consumeState(raw);
    else if (!this.isMaster()) this.client.raiseEvent(EVENT.STATE_REQUEST, null, { targetActors: [this.client.myRoomMasterActorNr()] });
  }

  consumeState(raw) {
    try { this.state = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
    this.emitSnapshot();
  }

  broadcastSnapshot() {
    if (!this.state) return;
    this.client.raiseEvent(EVENT.SNAPSHOT, { state: JSON.stringify(this.state) }, {
      receivers: window.Photon.LoadBalancing.Constants.ReceiverGroup.All,
    });
    this.emitSnapshot();
  }

  emitSnapshot() {
    if (!this.state) return;
    const presence = Object.values(this.client.myRoomActors())
      .map((actor) => actor.getCustomProperty(USER_PROPERTY) || actor.name)
      .filter(Boolean);
    this.snapshot = { state: this.state, presence, transport: "Photon Realtime", connected: true };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  rebuildAuthenticatedActors() {
    this.authenticatedActors.clear();
    Object.entries(this.client.myRoomActors()).forEach(([actorNr, actor]) => {
      const username = actor.getCustomProperty(USER_PROPERTY);
      if (username) this.authenticatedActors.set(Number(actorNr), username);
    });
  }

  isMaster() { return this.myActorNumber() === this.client.myRoomMasterActorNr(); }
  myActorNumber() { return this.client.myActor().actorNr; }

  fail(error) {
    const reject = this.rejectConnect;
    this.resolveConnect = null;
    this.rejectConnect = null;
    reject?.(error);
  }
}

async function loadPhotonSdk(url) {
  if (window.Photon?.LoadBalancing) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load Photon SDK from ${url}.`));
    document.head.appendChild(script);
  });
}
