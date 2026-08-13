import { DiceGameModel, MAX_PLAYERS } from "./game-model.js";

const EVENT = Object.freeze({ HELLO:1, COMMAND:2, SNAPSHOT:3, REQUEST_STATE:4, PRIVATE_HAND:5 });
const STATE_PROPERTY = "pd2_state";
const NAME_PROPERTY = "pd2_name";

export class PhotonDiceRoom extends EventTarget {
  constructor(config = {}) { super(); this.config = config; this.latest = null; this.private = null; }
  async connect({ roomCode, name }) {
    const appId = this.config.PHOTON_APP_ID || this.config.APP_ID;
    if (!appId) throw new Error("Add PHOTON_APP_ID to config.js first.");
    await loadScript(this.config.PHOTON_SDK_URL || "vendor/photon.min.js");
    const Photon = window.Photon;
    if (!Photon?.LoadBalancing) throw new Error("Photon Realtime SDK did not load.");
    this.roomCode = normalizeRoom(roomCode); this.name = cleanName(name);
    const Client = Photon.LoadBalancing.LoadBalancingClient;
    this.client = new Client(Photon.ConnectionProtocol.Wss, appId, "poker-dice-2");
    this.client.setUserId(tabIdentity());
    this.client.setLogLevel(this.config.DEBUG ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);
    this.client.onStateChange = state => {
      const label = Client.StateToName?.(state) || String(state); this.status(label);
      if (state === Client.State.JoinedLobby) this.client.joinRoom(this.roomCode, { createIfNotExists:true }, { isVisible:false, maxPlayers:MAX_PLAYERS + 10, playerTTL:15_000, roomTTL:300_000 });
      if (state === Client.State.Disconnected) { this.clearTimers(); this.status("Disconnected"); }
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
      this.connectTimeout = setTimeout(() => reject(new Error("Photon connection timed out.")), 20_000);
      this.client.connectToNameServer({ region:this.config.PHOTON_REGION || "eu" });
    });
  }
  onJoinRoom(created) {
    clearTimeout(this.connectTimeout);
    this.client.myActor().setName(this.name); this.client.myActor().setCustomProperty(NAME_PROPERTY, this.name);
    if (created) { this.model = new DiceGameModel(); this.model.addPlayer(this.myActor(), this.name); this.model.setHost(this.myActor()); this.broadcast(); }
    else if (this.isMaster()) { this.restoreAsNewMaster(); }
    else { this.sendHello(); this.requestState(); }
    this.status("Connected"); this.emitPresence(); this.resolveConnect?.(); this.resolveConnect = null;
  }
  onActorJoin(actor) { if (this.isMaster()) { const name=String(actor.actorNr)===String(this.myActor())?this.name:(actor.getCustomProperty?.(NAME_PROPERTY)||actor.name||`Player ${actor.actorNr}`); this.model?.addPlayer(actor.actorNr,name); this.broadcast(); } this.emitPresence(); }
  onActorLeave(actor) { if (this.isMaster()) { this.model?.removePlayer(actor.actorNr); this.model?.setHost(this.myActor()); this.broadcast(); } setTimeout(()=>{ if(this.isMaster() && !this.model) this.restoreAsNewMaster(); },120); this.emitPresence(); }
  onEvent(code, content, actorNr) {
    if (code === EVENT.HELLO && this.isMaster()) { this.model?.addPlayer(actorNr, content?.name); this.broadcast(); }
    else if (code === EVENT.COMMAND && this.isMaster()) this.processCommand(actorNr, content);
    else if (code === EVENT.SNAPSHOT && !this.isMaster()) this.consumeSnapshot(content);
    else if (code === EVENT.REQUEST_STATE && this.isMaster()) this.broadcast(actorNr);
    else if (code === EVENT.PRIVATE_HAND && String(actorNr) !== String(this.myActor())) this.consumePrivate(content);
  }
  command(type, payload = {}) { const content={ type, payload }; if (this.isMaster()) this.processCommand(this.myActor(),content); else this.client.raiseEvent(EVENT.COMMAND,content,{targetActors:[this.client.myRoomMasterActorNr()]}); }
  processCommand(actor, content = {}) {
    if (!this.model || !content.type) return;
    const p=content.payload || {}; let changed=false, sendSecret=false;
    switch(content.type) {
      case "settings": changed=this.model.setSettings(actor,p); break;
      case "start": changed=this.model.startGame(actor); sendSecret=changed&&this.model.mode==="liar"; break;
      case "poker-roll": changed=this.model.pokerRoll(actor); break;
      case "poker-hold": changed=this.model.pokerHold(actor,Number(p.index)); break;
      case "poker-finish": changed=this.model.pokerFinish(actor); break;
      case "liar-accept": changed=this.model.liarAccept(actor); sendSecret=changed; break;
      case "liar-hold": changed=this.model.liarHold(actor,Number(p.index)); sendSecret=changed; break;
      case "liar-roll": changed=this.model.liarRoll(actor,p.held); sendSecret=changed; break;
      case "liar-claim": changed=this.model.liarClaim(actor,p.key); break;
      case "liar-challenge": changed=Boolean(this.model.liarChallenge(actor)); break;
      case "return-lobby": changed=this.model.returnToLobby(actor); break;
    }
    if (!changed) return;
    this.broadcast(); if(sendSecret) this.sendPrivate(this.model.currentActor);
    if(content.type==="poker-roll" && this.model.rollsUsed>=3) this.schedule(()=>this.processCommand(actor,{type:"poker-finish"}),1100);
    if(content.type==="liar-challenge") this.schedule(()=>{ if(this.model?.nextLiarRound()){ this.broadcast(); this.sendPrivate(this.model.currentActor); } },5000);
  }
  broadcast(targetActor=null) {
    if (!this.model || !this.isMaster()) return;
    const snapshot=this.model.publicSnapshot(); this.consumeSnapshot(snapshot);
    this.client.myRoom().setCustomProperty(STATE_PROPERTY,JSON.stringify(snapshot));
    const options=targetActor?{targetActors:[targetActor]}:{receivers:window.Photon.LoadBalancing.Constants.ReceiverGroup.Others};
    this.client.raiseEvent(EVENT.SNAPSHOT,snapshot,options);
  }
  sendPrivate(actor) {
    const hand=this.model?.privateHand(actor); if(!hand||actor==null)return;
    if(String(actor)===String(this.myActor())) this.consumePrivate(hand);
    else this.client.raiseEvent(EVENT.PRIVATE_HAND,hand,{targetActors:[Number(actor)]});
  }
  consumePrivate(hand) { this.private=hand; this.dispatchEvent(new CustomEvent("private-hand",{detail:hand})); }
  consumeSnapshot(snapshot) { if(!snapshot||(this.latest&&snapshot.revision<this.latest.revision))return; this.latest=snapshot; if(snapshot.liarStage!=="play"||String(snapshot.currentActor)!==String(this.myActor()))this.private=null; this.dispatchEvent(new CustomEvent("snapshot",{detail:snapshot})); }
  consumeRoomState() { const raw=this.client.myRoom().getCustomProperty(STATE_PROPERTY); if(!raw)return; try{this.consumeSnapshot(typeof raw==="string"?JSON.parse(raw):raw);}catch(error){this.error(`Could not restore table: ${error.message}`);} }
  restoreAsNewMaster() {
    const raw=this.client.myRoom().getCustomProperty(STATE_PROPERTY); this.model=new DiceGameModel();
    if(raw){try{this.model.restore(typeof raw==="string"?JSON.parse(raw):raw);}catch{} }
    this.rebuildPlayers(); this.model.setHost(this.myActor());
    if(this.model.mode==="liar" && this.model.phase==="liar-turn") this.model.startLiarRound(this.model.currentActor);
    this.broadcast(); if(this.model.mode==="liar")this.sendPrivate(this.model.currentActor);
  }
  rebuildPlayers() { const actors=Object.values(this.client.myRoomActors()); const live=new Set(actors.map(a=>String(a.actorNr))); Object.values(this.model.players).forEach(p=>{if(!live.has(p.id))this.model.removePlayer(p.id);}); actors.forEach(a=>this.model.addPlayer(a.actorNr,a.getCustomProperty(NAME_PROPERTY)||a.name)); }
  sendHello(){this.client.raiseEvent(EVENT.HELLO,{name:this.name},{targetActors:[this.client.myRoomMasterActorNr()]});}
  requestState(){this.client.raiseEvent(EVENT.REQUEST_STATE,null,{targetActors:[this.client.myRoomMasterActorNr()]});}
  emitPresence(){if(!this.client?.myRoomActors)return;this.dispatchEvent(new CustomEvent("presence",{detail:Object.values(this.client.myRoomActors()).map(a=>({actor:a.actorNr,name:a.getCustomProperty(NAME_PROPERTY)||a.name}))}));}
  schedule(fn,ms){clearTimeout(this.actionTimer);this.actionTimer=setTimeout(fn,ms);}
  clearTimers(){clearTimeout(this.actionTimer);clearTimeout(this.connectTimeout);}
  myActor(){return this.client.myActor().actorNr;}
  isMaster(){return this.client&&this.myActor()===this.client.myRoomMasterActorNr();}
  status(message){this.dispatchEvent(new CustomEvent("status",{detail:message}));}
  error(message){this.dispatchEvent(new CustomEvent("error",{detail:message}));this.rejectConnect?.(new Error(message));}
  disconnect(){this.clearTimers();this.client?.disconnect();}
}

function cleanName(value){return String(value||"Player").trim().replace(/[<>]/g,"").slice(0,18)||"Player";}
function normalizeRoom(value){return String(value||"ROYAL").toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,12)||"ROYAL";}
function tabIdentity(){let id=sessionStorage.getItem("poker-dice-tab-id");if(!id){id=globalThis.crypto?.randomUUID?.()||`pd-${Date.now()}-${Math.random()}`;sessionStorage.setItem("poker-dice-tab-id",id);}return id;}
async function loadScript(url){if(window.Photon?.LoadBalancing)return;await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=url;script.onload=resolve;script.onerror=()=>reject(new Error(`Could not load ${url}`));document.head.append(script);});}
