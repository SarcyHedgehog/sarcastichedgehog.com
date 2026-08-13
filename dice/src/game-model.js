import { ALL_CLAIMS, claimByKey, claimIsTrue, compareClaims, compareHands, evaluateHand } from "./rules.js";

export const MAX_PLAYERS = 6;

export class DiceGameModel {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.phase = "lobby";
    this.mode = "poker";
    this.settings = { rerolls: 2 };
    this.players = {};
    this.order = [];
    this.host = null;
    this.currentActor = null;
    this.dice = [6, 6, 6, 6, 6];
    this.held = [false, false, false, false, false];
    this.rollsUsed = 0;
    this.currentClaim = null;
    this.liarStage = null;
    this.reveal = null;
    this.round = 0;
    this.revision = 0;
  }

  addPlayer(actor, name) {
    const id = String(actor);
    if (this.players[id]) { this.players[id].connected = true; this.players[id].name = cleanName(name); return; }
    const canPlay = this.phase === "lobby" && this.activePlayers().length < MAX_PLAYERS;
    this.players[id] = { id, name: cleanName(name), connected: true, spectator: !canPlay, eliminated: false, finalHand: null, finalDice: null };
    if (canPlay) this.order.push(id);
    if (!this.host) this.host = id;
    this.touch();
  }

  removePlayer(actor) {
    const id = String(actor), player = this.players[id]; if (!player) return;
    player.connected = false; player.spectator = true; player.eliminated = true;
    if (this.host === id) this.host = this.connectedPlayers()[0]?.id || null;
    if (this.phase !== "lobby" && this.currentActor === id) this.recoverTurnAfterDeparture(id);
    this.checkSoleSurvivor(); this.touch();
  }

  setHost(actor) { const id = String(actor); if (this.players[id]?.connected) this.host = id; }
  setSettings(actor, { mode, rerolls } = {}) {
    if (!this.isHost(actor) || this.phase !== "lobby") return false;
    if (["poker", "liar"].includes(mode)) this.mode = mode;
    if ([1, 2].includes(Number(rerolls))) this.settings.rerolls = Number(rerolls);
    this.touch(); return true;
  }

  startGame(actor) {
    if (!this.isHost(actor) || this.phase !== "lobby" || this.activePlayers().length < 2) return false;
    this.order = this.activePlayers().map(player => player.id);
    this.playersForGame().forEach(player => { player.eliminated = false; player.finalHand = null; player.finalDice = null; });
    this.round = 1; this.reveal = null; this.currentClaim = null;
    if (this.mode === "poker") this.startPokerTurn(this.order[0]); else this.startLiarRound(this.order[0]);
    this.touch(); return true;
  }

  startPokerTurn(actor) {
    this.phase = "poker-turn"; this.currentActor = String(actor); this.dice = [6,6,6,6,6]; this.held = [false,false,false,false,false]; this.rollsUsed = 0;
  }
  pokerRoll(actor) {
    if (!this.isTurn(actor) || this.phase !== "poker-turn" || this.rollsUsed >= 3) return false;
    this.dice = this.dice.map((value, index) => this.held[index] ? value : this.roll()); this.rollsUsed++; this.touch(); return true;
  }
  pokerHold(actor, index) {
    if (!this.isTurn(actor) || this.phase !== "poker-turn" || this.rollsUsed < 1 || this.rollsUsed >= 3 || index < 0 || index > 4) return false;
    this.held[index] = !this.held[index]; this.touch(); return true;
  }
  pokerFinish(actor) {
    if (!this.isTurn(actor) || this.phase !== "poker-turn" || this.rollsUsed < 1) return false;
    const player = this.players[String(actor)]; player.finalHand = evaluateHand(this.dice); player.finalDice = [...this.dice].sort((a,b)=>b-a);
    const index = this.order.indexOf(String(actor));
    const next = this.order.slice(index + 1).find(id => this.players[id]?.connected && !this.players[id]?.spectator);
    if (next) this.startPokerTurn(next); else { this.phase = "results"; this.currentActor = null; }
    this.touch(); return true;
  }

  startLiarRound(starter) {
    const active = this.activePlayers();
    if (active.length <= 1) { this.phase = "results"; this.currentActor = null; return; }
    const chosen = active.some(p => p.id === String(starter)) ? String(starter) : active[0].id;
    this.phase = "liar-turn"; this.currentActor = chosen; this.currentClaim = null; this.reveal = null; this.liarStage = "play";
    this.dice = [this.roll(),this.roll(),this.roll(),this.roll(),this.roll()]; this.held = [false,false,false,false,false]; this.rollsUsed = 0;
  }
  liarAccept(actor) {
    if (!this.isTurn(actor) || this.phase !== "liar-turn" || this.liarStage !== "decision" || !this.currentClaim) return false;
    if (!ALL_CLAIMS.some(claim => compareClaims(claim, this.currentClaim) > 0)) return false;
    this.liarStage = "play"; this.held = [false,false,false,false,false]; this.rollsUsed = 0; this.touch(); return true;
  }
  liarHold(actor, index) {
    if (!this.isTurn(actor) || this.phase !== "liar-turn" || this.liarStage !== "play" || index < 0 || index > 4 || this.rollsUsed >= this.settings.rerolls) return false;
    this.held[index] = !this.held[index]; this.touch(); return true;
  }
  liarRoll(actor, held) {
    if (!this.isTurn(actor) || this.phase !== "liar-turn" || this.liarStage !== "play" || this.rollsUsed >= this.settings.rerolls) return false;
    const keep = Array.isArray(held) && held.length === 5 ? held.map(Boolean) : this.held;
    this.dice = this.dice.map((value,index) => keep[index] ? value : this.roll()); this.held = keep; this.rollsUsed++; this.touch(); return true;
  }
  liarClaim(actor, key) {
    if (!this.isTurn(actor) || this.phase !== "liar-turn" || this.liarStage !== "play") return false;
    const declared = claimByKey(key); if (!declared || (this.currentClaim && compareClaims(declared, this.currentClaim) <= 0)) return false;
    this.currentClaim = { ...declared, actor: String(actor), player: this.players[String(actor)].name };
    const next = this.nextActive(String(actor)); if (!next) return false;
    this.currentActor = next; this.liarStage = "decision"; this.held = [false,false,false,false,false]; this.rollsUsed = 0; this.touch(); return true;
  }
  liarChallenge(actor) {
    if (!this.isTurn(actor) || this.phase !== "liar-turn" || this.liarStage !== "decision" || !this.currentClaim) return null;
    const challenger = String(actor), claimant = this.currentClaim.actor, actual = evaluateHand(this.dice), trueClaim = claimIsTrue(actual, this.currentClaim);
    const loser = trueClaim ? challenger : claimant, winner = trueClaim ? claimant : challenger;
    if (this.players[loser]) { this.players[loser].eliminated = true; this.players[loser].spectator = true; }
    this.phase = "liar-reveal"; this.liarStage = "reveal"; this.currentActor = null;
    this.reveal = { dice:[...this.dice], actual, claim:{...this.currentClaim}, trueClaim, loser, loserName:this.players[loser]?.name, winner, winnerName:this.players[winner]?.name };
    this.touch(); return this.reveal;
  }
  nextLiarRound() {
    if (this.phase !== "liar-reveal") return false;
    if (this.activePlayers().length <= 1) { this.phase = "results"; this.currentActor = null; this.touch(); return true; }
    const starter = this.reveal?.winner; this.round++; this.startLiarRound(starter); this.touch(); return true;
  }

  returnToLobby(actor) {
    if (!this.isHost(actor) || this.phase !== "results") return false;
    this.phase = "lobby"; this.currentActor = null; this.currentClaim = null; this.reveal = null; this.round = 0;
    this.order = this.connectedPlayers().slice(0,MAX_PLAYERS).map(player => player.id);
    Object.values(this.players).forEach(player => { player.spectator = !player.connected || !this.order.includes(player.id); player.eliminated = false; player.finalHand = null; player.finalDice = null; });
    this.touch(); return true;
  }

  publicSnapshot() {
    return JSON.parse(JSON.stringify({ revision:this.revision, phase:this.phase, mode:this.mode, settings:this.settings, players:this.players, order:this.order, host:this.host, currentActor:this.currentActor, dice:this.mode === "poker" || this.phase === "liar-reveal" ? this.dice : null, held:this.mode === "poker" ? this.held : null, rollsUsed:this.rollsUsed, currentClaim:this.currentClaim, liarStage:this.liarStage, reveal:this.reveal, round:this.round }));
  }
  restore(snapshot) {
    for (const key of ["revision","phase","mode","settings","players","order","host","currentActor","dice","held","rollsUsed","currentClaim","liarStage","reveal","round"]) if (snapshot[key] !== undefined) this[key] = JSON.parse(JSON.stringify(snapshot[key]));
    if (!Array.isArray(this.dice)) this.dice = [this.roll(),this.roll(),this.roll(),this.roll(),this.roll()];
  }
  privateHand(actor) { return this.phase === "liar-turn" && this.liarStage === "play" && this.isTurn(actor) ? { dice:[...this.dice], held:[...this.held], rollsUsed:this.rollsUsed } : null; }
  results() {
    if (this.mode === "liar") return this.activePlayers();
    return this.playersForGame().filter(p=>p.finalHand).sort((a,b)=>compareHands(b.finalHand,a.finalHand));
  }
  activePlayers() { return this.playersForGame().filter(player => player.connected && !player.spectator && !player.eliminated); }
  connectedPlayers() { return Object.values(this.players).filter(player=>player.connected); }
  playersForGame() { return this.order.map(id=>this.players[id]).filter(Boolean); }
  isHost(actor) { return String(actor) === String(this.host); }
  isTurn(actor) { return String(actor) === String(this.currentActor); }
  nextActive(actor) { const active = this.activePlayers().map(p=>p.id); if (!active.length) return null; const index = active.indexOf(String(actor)); return active[(index + 1 + active.length) % active.length]; }
  checkSoleSurvivor() { if (this.mode === "liar" && this.phase !== "lobby" && this.activePlayers().length <= 1) { this.phase="results"; this.currentActor=null; } }
  recoverTurnAfterDeparture(actor) { if (this.mode === "liar") this.startLiarRound(this.nextActive(actor)); else { const next=this.order.slice(this.order.indexOf(String(actor))+1).find(id=>this.players[id]?.connected&&!this.players[id]?.spectator); next?this.startPokerTurn(next):(this.phase="results",this.currentActor=null); } }
  roll() { return Math.max(1, Math.min(6, Math.floor(this.random() * 6) + 1)); }
  touch() { this.revision++; }
}

function cleanName(value) { return String(value || "Player").trim().replace(/[<>]/g, "").slice(0,18) || "Player"; }
