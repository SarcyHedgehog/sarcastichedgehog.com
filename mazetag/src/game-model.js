import { C, DIRECTIONS, PLAYER_COLORS, WALL } from "./constants.js";
import { PRNG } from "./prng.js";
import { TurnBuffer } from "./turn-buffer.js";

const opposite = direction => (direction + 2) % 4;
const turnDirection = (direction, turn) => (direction + (turn === "left" ? 3 : 1)) % 4;

export class MazeGameModel {
  constructor({ maze, mapId = "map1", seed = Date.now() }) {
    if (!Array.isArray(maze) || maze.length !== C.gridSize * C.gridSize) throw new Error("Maze data must contain 256 cells.");
    this.maze = maze.slice();
    this.mapId = mapId;
    this.seed = seed;
    this.rng = new PRNG(seed);
    this.time = 0;
    this.tickNumber = 0;
    this.players = {};
    this.order = [];
    this.cubes = [];
    this.phase = "waiting";
    this.phaseEndsAt = 0;
    this.winners = [];
    this.spawnInitialCubes();
  }

  addPlayer(actor, name = "Runner") {
    const id = String(actor);
    if (this.players[id]) { this.players[id].connected = true; this.players[id].name = cleanName(name); return this.players[id]; }
    const colorIndex = this.order.length % PLAYER_COLORS.length;
    const spawn = this.findEmptyCell();
    const player = {
      id, name: cleanName(name), connected: true, color: PLAYER_COLORS[colorIndex], colorIndex,
      gridX: spawn.x, gridY: spawn.y, fromX: spawn.x, fromY: spawn.y, targetX: spawn.x, targetY: spawn.y,
      direction: 2, segmentStartedAt: this.time, score: 0, isIt: false, immuneUntil: 0,
      trail: [], turn: new TurnBuffer(C.turnBufferMs)
    };
    this.players[id] = player;
    this.order.push(id);
    this.chooseNextMove(player);
    if (this.connectedPlayers().length >= 2 && this.phase === "waiting") this.startRound();
    return player;
  }

  removePlayer(actor) {
    const player = this.players[String(actor)];
    if (!player) return;
    player.connected = false;
    if (player.isIt) this.assignIt();
    if (this.connectedPlayers().length < 2) this.phase = "waiting";
  }

  setTurn(actor, input = {}) {
    const player = this.players[String(actor)];
    if (!player?.connected) return;
    const intent = input.turn;
    if (input.held === false) player.turn.release(intent, this.time);
    else player.turn.press(intent, this.time);
  }

  step(dt = C.tickMs) {
    this.time += dt;
    this.tickNumber += 1;
    if (this.phase === "playing" && this.time >= this.phaseEndsAt) this.endRound();
    if (this.phase === "countdown" && this.time >= this.phaseEndsAt) this.startRound();
    for (const player of this.connectedPlayers()) this.movePlayer(player);
    if (this.phase === "playing") { this.checkTags(); this.checkCubes(); }
    if (this.cubes.length < C.maxBlueCubes && this.rng.random() < C.cubeSpawnChance) this.spawnCube();
  }

  movePlayer(player) {
    const duration = C.msPerCell / (player.isIt ? C.itSpeedMultiplier : 1);
    if (this.time - player.segmentStartedAt < duration) return;
    player.gridX = player.targetX;
    player.gridY = player.targetY;
    this.chooseNextMove(player);
  }

  chooseNextMove(player) {
    const exits = this.exitsAt(player.gridX, player.gridY);
    let chosen = null;
    const intent = player.turn.peek(this.time);
    if (intent) {
      const wanted = turnDirection(player.direction, intent);
      chosen = exits.find(exit => exit.direction === wanted) || null;
      if (chosen) player.turn.consume(this.time);
    }
    if (!chosen) chosen = exits.find(exit => exit.direction === player.direction) || null;
    if (!chosen) {
      const forwardish = exits.filter(exit => exit.direction !== opposite(player.direction));
      chosen = forwardish.length ? forwardish[Math.floor(this.rng.random() * forwardish.length)] : exits[0];
    }
    if (!chosen) return;
    player.trail.unshift({ x: player.gridX, y: player.gridY, at: this.time });
    player.trail.length = Math.min(player.trail.length, C.trailLength);
    player.fromX = player.gridX;
    player.fromY = player.gridY;
    player.targetX = player.gridX + chosen.dx;
    player.targetY = player.gridY + chosen.dy;
    player.direction = chosen.direction;
    player.segmentStartedAt = this.time;
  }

  exitsAt(x, y) {
    const cell = this.wallInfo(x, y);
    return DIRECTIONS.map((delta, direction) => ({ ...delta, direction })).filter(exit => !hasWall(cell, exit.direction));
  }

  wallInfo(x, y) {
    if (x < 0 || y < 0 || x >= C.gridSize || y >= C.gridSize) return 15;
    return this.maze[y * C.gridSize + x] ?? 15;
  }

  isOpenCell(x, y) { const value = this.wallInfo(x, y); return value !== 0 && value !== 15; }
  findEmptyCell() {
    for (let attempt = 0; attempt < 512; attempt += 1) {
      const x = Math.floor(this.rng.random() * C.gridSize), y = Math.floor(this.rng.random() * C.gridSize);
      if (this.isOpenCell(x, y) && !this.connectedPlayers().some(player => player.gridX === x && player.gridY === y)) return { x, y };
    }
    return { x: 1, y: 1 };
  }

  startRound() {
    if (this.connectedPlayers().length < 2) { this.phase = "waiting"; return; }
    this.phase = "playing";
    this.phaseEndsAt = this.time + C.roundMs;
    this.winners = [];
    for (const player of this.connectedPlayers()) { player.score = 0; player.isIt = false; player.immuneUntil = 0; }
    this.assignIt();
  }

  endRound() {
    const players = this.connectedPlayers();
    const high = Math.max(...players.map(player => player.score), 0);
    this.winners = players.filter(player => player.score === high).map(player => player.id);
    this.phase = "countdown";
    this.phaseEndsAt = this.time + C.nextRoundMs;
  }

  assignIt(excludeId = null) {
    const candidates = this.connectedPlayers().filter(player => player.id !== excludeId);
    for (const player of this.connectedPlayers()) player.isIt = false;
    if (!candidates.length) return;
    candidates[Math.floor(this.rng.random() * candidates.length)].isIt = true;
  }

  checkTags() {
    const players = this.connectedPlayers();
    const it = players.find(player => player.isIt);
    if (!it) return this.assignIt();
    const tagged = players.find(player => player.id !== it.id && player.gridX === it.gridX && player.gridY === it.gridY && player.immuneUntil <= this.time);
    if (!tagged) return;
    const transfer = Math.ceil(tagged.score / 2);
    tagged.score -= transfer;
    it.score += transfer;
    it.isIt = false;
    it.immuneUntil = this.time + C.immunityMs;
    tagged.isIt = true;
    this.reversePlayer(it);
    this.reversePlayer(tagged);
  }

  reversePlayer(player) {
    const direction = opposite(player.direction), delta = DIRECTIONS[direction];
    if (!hasWall(this.wallInfo(player.gridX, player.gridY), direction)) {
      player.fromX = player.gridX; player.fromY = player.gridY; player.targetX = player.gridX + delta.dx; player.targetY = player.gridY + delta.dy; player.direction = direction; player.segmentStartedAt = this.time;
    }
  }

  checkCubes() {
    for (const player of this.connectedPlayers()) {
      const index = this.cubes.findIndex(cube => cube.x === player.gridX && cube.y === player.gridY);
      if (index < 0) continue;
      player.score += 1;
      this.cubes.splice(index, 1);
      this.spawnCube();
    }
  }

  spawnInitialCubes() { while (this.cubes.length < C.maxBlueCubes) if (!this.spawnCube()) break; }
  spawnCube() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const x = Math.floor(this.rng.random() * C.gridSize), y = Math.floor(this.rng.random() * C.gridSize);
      if (this.isOpenCell(x, y) && !this.cubes.some(cube => cube.x === x && cube.y === y)) {
        this.cubes.push({ id: `c${this.tickNumber}-${attempt}-${Math.floor(this.rng.random() * 1e6)}`, x, y }); return true;
      }
    }
    return false;
  }

  connectedPlayers() { return this.order.map(id => this.players[id]).filter(player => player?.connected); }

  snapshot() {
    const players = {};
    for (const [id, player] of Object.entries(this.players)) players[id] = { ...player, turn: player.turn.snapshot() };
    return { seed: this.seed, rngSeed: this.rng.seed, mapId: this.mapId, maze: this.maze, time: this.time, tickNumber: this.tickNumber, players, order: this.order.slice(), cubes: structuredClone(this.cubes), phase: this.phase, phaseEndsAt: this.phaseEndsAt, winners: this.winners.slice() };
  }

  restore(snapshot) {
    this.seed = snapshot.seed; this.rng = new PRNG(snapshot.rngSeed); this.time = snapshot.time; this.tickNumber = snapshot.tickNumber; this.order = snapshot.order.slice(); this.cubes = structuredClone(snapshot.cubes); this.phase = snapshot.phase; this.phaseEndsAt = snapshot.phaseEndsAt; this.winners = snapshot.winners.slice();
    this.players = {};
    for (const [id, value] of Object.entries(snapshot.players)) { const turn = new TurnBuffer(C.turnBufferMs); turn.restore(value.turn); this.players[id] = { ...value, turn }; }
  }
}

export function interpolatedPosition(player, modelTime) {
  const duration = C.msPerCell / (player.isIt ? C.itSpeedMultiplier : 1);
  const progress = Math.max(0, Math.min(1, (modelTime - player.segmentStartedAt) / duration));
  return { x: player.fromX + (player.targetX - player.fromX) * progress, y: player.fromY + (player.targetY - player.fromY) * progress };
}

function hasWall(cell, direction) { return Boolean(cell & [WALL.north, WALL.east, WALL.south, WALL.west][direction]); }
function cleanName(value) { return String(value || "Runner").trim().slice(0, 18) || "Runner"; }
