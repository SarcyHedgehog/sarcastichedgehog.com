import { BRICK, C, TICK_MS } from "./constants.js?v=20260813-5";

export class PRNG {
  constructor(seed = 12345) { this.seed = seed | 0; }
  random() {
    this.seed = (this.seed + 0x6D2B79F5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return Math.floor(this.random() * (max - min + 1)) + min; }
}

const clone = (value) => structuredClone(value);

export class GameModel {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.rng = new PRNG(seed);
    this.tickNumber = 0;
    this.players = { 1: null, 2: null };
    this.inputs = {};
    this.paddleY = { 1: 0, 2: 0 };
    this.score = { 1: 0, 2: 0 };
    this.shrink = { 1: 0, 2: 0 };
    this.ball = this.newBall();
    this.bricks = this.makeBricks();
    this.portals = this.makePortals();
    this.delivery = { elapsed: 0, count: 0, active: false, phase: null, phaseMs: 0, flying: null, color: 0x0077ff };
    this.state = "waiting";
    this.countdownMs = 0;
    this.serveMs = 0;
    this.winMs = 0;
    this.servingPlayer = 1;
    this.lastStarter = 2;
  }

  newBall() { return { x: 0, y: 0, vx: 0, vy: 0, lastTouchedBy: null, lastPortalHit: null, portalCooldown: 0 }; }

  makeBricks() {
    const result = [];
    const rows = Math.round(C.courtDepth / C.brickDepth);
    const startX = -(C.wallColumns * C.brickWidth) / 2 + C.brickWidth / 2;
    for (let row = 0; row < rows; row++) for (let col = 0; col < C.wallColumns; col++) {
      const roll = this.rng.random();
      const type = roll < .10 ? "purple" : roll < .25 ? "red" : "green";
      result.push({ id: `${row}-${col}`, x: startX + col * C.brickWidth, y: C.courtDepth / 2 - C.brickDepth / 2 - row * C.brickDepth, width: C.brickWidth, depth: C.brickDepth, type, hits: type === "red" ? 2 : 1, color: BRICK[type] });
    }
    return result;
  }

  makePortals() {
    const speed = C.ballSpeed * .3;
    const build = (id, x, color) => ({ id, x, y: 0, radius: C.portalRadius, color, vx: (this.rng.random() > .5 ? 1 : -1) * speed, vy: (this.rng.random() > .5 ? 1 : -1) * speed });
    return { 1: build("1", -2.2, 0x0077ff), 2: build("2", 2.2, 0xffaa00) };
  }

  join(actor) {
    if (Object.values(this.players).includes(actor)) return this.roleOf(actor);
    const slot = !this.players[1] ? 1 : !this.players[2] ? 2 : 0;
    if (slot) this.players[slot] = actor;
    if (this.hasTwoPlayers() && ["waiting", "disconnected"].includes(this.state)) this.beginCountdown();
    return slot ? `player${slot}` : "spectator";
  }

  leave(actor) {
    const slot = this.playerNumber(actor);
    if (!slot) return;
    this.players[slot] = null;
    delete this.inputs[actor];
    this.state = "disconnected";
    this.ball.vx = this.ball.vy = 0;
    this.countdownMs = this.serveMs = this.winMs = 0;
  }

  roleOf(actor) { const n = this.playerNumber(actor); return n ? `player${n}` : "spectator"; }
  playerNumber(actor) { return Number(Object.keys(this.players).find((key) => this.players[key] === actor)) || 0; }
  hasTwoPlayers() { return Boolean(this.players[1] && this.players[2]); }
  setInput(actor, direction) { if (this.playerNumber(actor)) this.inputs[actor] = Math.max(-1, Math.min(1, Number(direction) || 0)); }

  beginCountdown() {
    if (!this.hasTwoPlayers()) return;
    this.state = "countdown";
    this.countdownMs = 5000;
    this.servingPlayer = this.lastStarter === 1 ? 2 : 1;
  }

  prepareServe() {
    if (!this.hasTwoPlayers()) return this.pauseForPlayer();
    const x = this.servingPlayer === 1 ? -C.paddleX + C.paddleThickness / 2 + C.ballRadius + .05 : C.paddleX - C.paddleThickness / 2 - C.ballRadius - .05;
    this.ball = { ...this.newBall(), x, y: this.paddleY[this.servingPlayer] };
    this.state = "serving_paused";
    this.serveMs = 1000;
  }

  executeServe() {
    if (this.state !== "serving_paused" || !this.hasTwoPlayers()) return;
    this.ball.vx = (this.servingPlayer === 1 ? 1 : -1) * C.ballSpeed;
    this.ball.lastTouchedBy = this.servingPlayer;
    this.state = "playing";
  }

  pauseForPlayer() { this.state = "disconnected"; this.ball.vx = this.ball.vy = 0; }

  step(dt = TICK_MS) {
    this.tickNumber++;
    if (!this.hasTwoPlayers() && !["waiting", "disconnected"].includes(this.state)) this.pauseForPlayer();
    if (this.state === "countdown") { this.countdownMs -= dt; if (this.countdownMs <= 0) { this.lastStarter = this.servingPlayer; this.prepareServe(); } return; }
    if (this.state === "serving_paused") { this.applyInputs(); this.ball.y = this.paddleY[this.servingPlayer]; this.serveMs -= dt; if (this.serveMs <= 0) this.executeServe(); return; }
    if (this.state.startsWith("won")) { this.winMs -= dt; if (this.winMs <= 0) this.beginCountdown(); return; }
    if (this.state !== "playing") return;
    this.applyInputs();
    this.updateTimers(dt);
    this.updatePortals();
    this.updateDelivery(dt);
    this.updateBall(dt / TICK_MS);
  }

  applyInputs() {
    for (const slot of [1, 2]) {
      const actor = this.players[slot];
      const direction = this.inputs[actor] || 0;
      const length = C.paddleLength * (this.shrink[slot] > 0 ? C.shrinkFactor : 1);
      const limit = C.courtDepth / 2 - length / 2;
      this.paddleY[slot] = Math.max(-limit, Math.min(limit, this.paddleY[slot] + direction * C.paddleSpeed));
    }
  }

  updateTimers(dt) {
    for (const slot of [1, 2]) this.shrink[slot] = Math.max(0, this.shrink[slot] - dt);
    this.ball.portalCooldown = Math.max(0, this.ball.portalCooldown - dt);
    if (!this.ball.portalCooldown) this.ball.lastPortalHit = null;
  }

  updatePortals() {
    for (const portal of Object.values(this.portals)) {
      portal.x += portal.vx; portal.y += portal.vy;
      const halfDepth = C.courtDepth / 2 - portal.radius;
      if (Math.abs(portal.y) > halfDepth) { portal.y = Math.sign(portal.y) * halfDepth; portal.vy *= -1; }
      const inner = portal.id === "1" ? -.9 : .9;
      const outer = portal.id === "1" ? -3.35 : 3.35;
      const min = Math.min(inner, outer), max = Math.max(inner, outer);
      if (portal.x < min || portal.x > max) { portal.x = Math.max(min, Math.min(max, portal.x)); portal.vx *= -1; }
    }
  }

  updateBall(scale) {
    this.ball.x += this.ball.vx * scale; this.ball.y += this.ball.vy * scale;
    const edge = C.courtDepth / 2 - C.ballRadius;
    if (Math.abs(this.ball.y) > edge) { this.ball.y = Math.sign(this.ball.y) * edge; this.ball.vy *= -1; }
    if (this.hitPaddle()) return;
    if (this.hitBrick()) return;
    this.hitPortal();
    if (this.ball.x < -C.courtWidth / 2 - C.ballRadius) this.pointTo(2);
    else if (this.ball.x > C.courtWidth / 2 + C.ballRadius) this.pointTo(1);
  }

  hitPaddle() {
    for (const slot of [1, 2]) {
      const movingToward = slot === 1 ? this.ball.vx < 0 : this.ball.vx > 0;
      if (!movingToward) continue;
      const px = slot === 1 ? -C.paddleX : C.paddleX;
      const length = C.paddleLength * (this.shrink[slot] > 0 ? C.shrinkFactor : 1);
      if (Math.abs(this.ball.x - px) < C.paddleThickness / 2 + C.ballRadius && Math.abs(this.ball.y - this.paddleY[slot]) < length / 2 + C.ballRadius) {
        this.ball.x = px + (slot === 1 ? 1 : -1) * (C.paddleThickness / 2 + C.ballRadius + .002);
        this.ball.vx *= -1;
        this.ball.vy = Math.max(-C.ballSpeed * 1.5, Math.min(C.ballSpeed * 1.5, this.ball.vy + ((this.ball.y - this.paddleY[slot]) / (length / 2)) * Math.abs(this.ball.vx) * .5));
        this.ball.lastTouchedBy = slot;
        return true;
      }
    }
    return false;
  }

  hitBrick() {
    for (let index = 0; index < this.bricks.length; index++) {
      const brick = this.bricks[index];
      const dx = this.ball.x - brick.x, dy = this.ball.y - brick.y;
      const ox = C.ballRadius + brick.width / 2 - Math.abs(dx), oy = C.ballRadius + brick.depth / 2 - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) { this.ball.x += Math.sign(dx || 1) * (ox + .002); this.ball.vx *= -1; }
      else { this.ball.y += Math.sign(dy || 1) * (oy + .002); this.ball.vy *= -1; }
      if (brick.type !== "black") {
        brick.hits--;
        if (brick.type === "purple") { const opponent = this.ball.lastTouchedBy === 1 ? 2 : 1; this.shrink[opponent] = C.shrinkMs; }
        if (brick.type === "red" && brick.hits === 1) { brick.type = "green"; brick.color = BRICK.green; }
        if (brick.hits <= 0) this.bricks.splice(index, 1);
      }
      else if (Math.abs(this.ball.vy) < C.ballSpeed * .12) {
        const speed=Math.max(C.ballSpeed,Math.hypot(this.ball.vx,this.ball.vy));
        const kick=Math.min(speed*.28,C.ballSpeed*.32);
        const direction=(this.tickNumber+Math.round((brick.x+brick.y)*100))%2===0?1:-1;
        this.ball.vy=direction*kick;
        this.ball.vx=Math.sign(this.ball.vx||1)*Math.sqrt(Math.max(.0001,speed*speed-kick*kick));
      }
      return true;
    }
    return false;
  }

  hitPortal() {
    if (this.ball.portalCooldown) return;
    for (const portal of Object.values(this.portals)) {
      if (Math.hypot(this.ball.x - portal.x, this.ball.y - portal.y) >= C.ballRadius + portal.radius) continue;
      const other = this.portals[portal.id === "1" ? 2 : 1];
      const speed = Math.hypot(this.ball.vx, this.ball.vy) || 1;
      this.ball.x = other.x + (this.ball.vx / speed) * (other.radius + C.ballRadius + .02);
      this.ball.y = other.y + (this.ball.vy / speed) * (other.radius + C.ballRadius + .02);
      this.ball.portalCooldown = C.portalCooldownMs; this.ball.lastPortalHit = other.id;
      break;
    }
  }

  pointTo(scorer) {
    this.score[scorer]++;
    if (this.score[scorer] >= C.winScore) {
      this.state = `won${scorer}`; this.winMs = 5000;
      this.ball.vx = this.ball.vy = 0;
      this.score = { 1: 0, 2: 0 }; this.bricks = this.makeBricks(); this.portals = this.makePortals(); this.shrink = { 1: 0, 2: 0 };
      this.delivery = { elapsed: 0, count: 0, active: false, phase: null, phaseMs: 0, flying: null, color: 0x0077ff };
    } else { this.servingPlayer = scorer === 1 ? 2 : 1; this.lastStarter = this.servingPlayer; this.prepareServe(); }
  }

  updateDelivery(dt) {
    const d = this.delivery;
    if (!d.active) {
      d.elapsed += dt;
      if (d.count >= C.maxBlackBricks || d.elapsed < C.blackBrickIntervalMs) return;
      d.active = true; d.phase = "growing"; d.phaseMs = 0; d.elapsed = 0;
      d.color = this.ball.lastTouchedBy === 2 ? 0xffaa00 : 0x0077ff;
    }
    d.phaseMs += dt;
    if (d.phase === "growing" && d.phaseMs >= 2000) {
      const row = this.rng.int(0, 9), col = this.rng.int(0, 4);
      d.phase = "flying"; d.phaseMs = 0;
      d.flying = { x: 0, y: 1.5, z: -3.5, targetX: -.5 + col * C.brickWidth, targetZ: 2.25 - row * C.brickDepth };
    } else if (d.phase === "flying") {
      const p = Math.min(1, d.phaseMs / 1500);
      d.flying.x += (d.flying.targetX - d.flying.x) * p;
      d.flying.z += (d.flying.targetZ - d.flying.z) * p;
      d.flying.y = .1 + Math.sin(p * Math.PI) * 1.4;
      if (p === 1) {
        this.bricks = this.bricks.filter((b) => Math.abs(b.x - d.flying.targetX) > .01 || Math.abs(b.y - d.flying.targetZ) > .01);
        this.bricks.push({ id: `black-${d.count}`, x: d.flying.targetX, y: d.flying.targetZ, width: C.brickWidth, depth: C.brickDepth, type: "black", hits: null, color: BRICK.black });
        d.count++; d.flying = null; d.phase = "closing"; d.phaseMs = 0;
      }
    } else if (d.phase === "closing" && d.phaseMs >= 1200) { d.active = false; d.phase = null; d.phaseMs = 0; }
  }

  snapshot() {
    return clone({ seed: this.seed, rngState: this.rng.seed, tickNumber: this.tickNumber, players: this.players, paddleY: this.paddleY, score: this.score, shrink: this.shrink, ball: this.ball, bricks: this.bricks, portals: this.portals, delivery: this.delivery, state: this.state, countdown: Math.max(0, Math.ceil(this.countdownMs / 1000)), countdownMs: this.countdownMs, serveMs: this.serveMs, winMs: this.winMs, servingPlayer: this.servingPlayer, lastStarter: this.lastStarter });
  }

  restore(snapshot) {
    Object.assign(this, clone(snapshot));
    this.rng = new PRNG(this.seed); this.rng.seed = snapshot.rngState ?? this.seed;
    this.inputs ||= {};
  }
}
