import { FIXED_STEP, SNAPSHOT_MS } from "./constants.js";
import { DerbyModel } from "./game-model.js";

export class PracticeRoom extends EventTarget {
  constructor(name) { super(); this.name = name || "Roadkill"; this.roomCode = "PRACTICE"; this.model = new DerbyModel(424242); this.connected = false; }
  async connect() {
    this.connected = true; this.model.addPlayer(1, this.name);
    ["Crusher", "Mayhem", "Banger"].forEach((name, index) => this.model.addPlayer(index + 2, name));
    this.dispatchEvent(new CustomEvent("status", { detail: "Connected" })); this.emitPresence(); this.start();
  }
  start() {
    this.stop(); this.aiClock = 0;
    this.loop = setInterval(() => { this.aiClock += FIXED_STEP; if (this.aiClock >= 0.12) { this.aiClock = 0; this.driveBots(); } this.model.tick(FIXED_STEP); }, FIXED_STEP * 1000);
    this.snapshots = setInterval(() => this.broadcast(), SNAPSHOT_MS); this.broadcast();
  }
  driveBots() {
    const live = this.model.racingCars().filter(car => !car.destroyed);
    for (const bot of live.filter(car => car.id !== "1")) {
      const targets = live.filter(car => car.id !== bot.id); if (!targets.length) continue;
      const target = targets.sort((a,b) => distance(bot,a)-distance(bot,b))[0]; const desired = Math.atan2(target.y-bot.y,target.x-bot.x); const delta = Math.atan2(Math.sin(desired-bot.angle),Math.cos(desired-bot.angle)); const near = distance(bot,target) < 95;
      this.model.setInput(bot.id, { forward: !near || Math.random() > .1, brake: near && Math.abs(delta) > 1.5, left: delta < -.08, right: delta > .08 });
    }
  }
  broadcast() { const snapshot = this.model.snapshot(); this.latest = snapshot; this.dispatchEvent(new CustomEvent("snapshot", { detail: snapshot })); }
  emitPresence() { this.dispatchEvent(new CustomEvent("presence", { detail: Object.values(this.model.cars).map(car => ({ actor: Number(car.id), name: car.name })) })); }
  setInput(input) { this.model.setInput(1, input); }
  reset() { const name = this.name; this.stop(); this.model = new DerbyModel(424242); this.model.addPlayer(1,name); ["Crusher","Mayhem","Banger"].forEach((bot,index)=>this.model.addPlayer(index+2,bot)); this.start(); }
  myActor() { return 1; }
  isMaster() { return true; }
  stop() { clearInterval(this.loop); clearInterval(this.snapshots); }
  disconnect() { this.stop(); this.connected = false; }
}
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
