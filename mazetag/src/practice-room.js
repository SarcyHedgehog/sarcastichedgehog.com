import { C } from "./constants.js";
import { MazeGameModel } from "./game-model.js";

export class PracticeRoom extends EventTarget {
  constructor({ name, maze, mapId }) { super(); this.name = name; this.maze = maze; this.mapId = mapId; this.actor = 1; }
  async connect() {
    this.model = new MazeGameModel({ maze: this.maze, mapId: this.mapId, seed: 424242 });
    this.model.addPlayer(this.actor, this.name);
    this.model.addPlayer(2, "Training Ghost");
    this.loop = setInterval(() => { this.driveGhost(); this.model.step(C.tickMs); this.emitSnapshot(); }, C.tickMs);
    this.dispatchEvent(new CustomEvent("status", { detail: "Practice" }));
    this.dispatchEvent(new CustomEvent("presence", { detail: [{ actor: 1, name: this.name }, { actor: 2, name: "Training Ghost" }] }));
    this.emitSnapshot();
  }
  driveGhost() { if (this.model.tickNumber % 14 === 0) this.model.setTurn(2, { turn: this.model.rng.random() > .5 ? "left" : "right", held: false }); }
  setTurn(input) { this.model.setTurn(this.actor, input); }
  emitSnapshot() { this.dispatchEvent(new CustomEvent("snapshot", { detail: this.model.snapshot() })); }
  myActor() { return this.actor; }
  isMaster() { return true; }
  disconnect() { clearInterval(this.loop); }
}
