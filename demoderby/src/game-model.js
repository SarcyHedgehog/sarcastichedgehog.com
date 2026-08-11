import { CAR, COLORS, COUNTDOWN_SECONDS, FIXED_STEP, MAX_PLAYERS, MIN_PLAYERS, RESULTS_SECONDS, WORLD } from "./constants.js";
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const safeName = value => String(value || "Driver").trim().slice(0, 18) || "Driver";

export class DerbyModel {
  constructor(seed = Date.now() >>> 0) {
    this.seed = seed >>> 0; this.tickNumber = 0; this.phase = "lobby"; this.phaseTime = 0;
    this.round = 0; this.cars = {}; this.order = []; this.events = []; this.winnerId = null; this.collisionCooldowns = {};
  }
  addPlayer(id, name = "Driver") {
    const key = String(id);
    if (this.cars[key]) { this.cars[key].connected = true; this.cars[key].name = safeName(name); return this.cars[key]; }
    const slot = this.order.length; this.order.push(key); this.cars[key] = this.makeCar(key, name, slot);
    this.events.push({ type: "join", id: key, name: this.cars[key].name }); return this.cars[key];
  }
  removePlayer(id) {
    const car = this.cars[String(id)]; if (!car) return;
    car.connected = false; car.input = emptyInput(); if (this.phase === "lobby") this.deletePlayer(car.id);
    this.events.push({ type: "leave", id: car.id, name: car.name });
  }
  deletePlayer(id) { delete this.cars[id]; this.order = this.order.filter(key => key !== id); }
  setInput(id, input = {}) {
    const car = this.cars[String(id)]; if (!car || !car.connected) return;
    car.input = { forward: !!input.forward, brake: !!input.brake, left: !!input.left, right: !!input.right };
  }
  tick(dt = FIXED_STEP) {
    dt = clamp(Number(dt) || FIXED_STEP, 0, 0.05); this.tickNumber += 1; this.phaseTime = Math.max(0, this.phaseTime - dt);
    this.updateWrecks(dt); this.updateCollisionCooldowns(dt);
    if (this.phase === "lobby") this.updateLobby();
    else if (this.phase === "countdown") {
      if (this.activeConnected().length < MIN_PLAYERS) this.toLobby();
      else if (this.phaseTime <= 0) { this.phase = "playing"; this.events.push({ type: "start" }); }
    } else if (this.phase === "playing") this.updatePlaying(dt);
    else if (this.phase === "results" && this.phaseTime <= 0) this.beginRound();
  }
  updateLobby() { if (this.connectedCars().length >= MIN_PLAYERS) this.beginRound(); }
  beginRound() {
    const connected = this.connectedCars(); if (connected.length < MIN_PLAYERS) return this.toLobby();
    this.round += 1; this.phase = "countdown"; this.phaseTime = COUNTDOWN_SECONDS; this.winnerId = null;
    const racers = connected.slice(0, MAX_PLAYERS);
    racers.forEach((car, index) => this.resetCar(car, index, true, racers.length));
    connected.slice(MAX_PLAYERS).forEach(car => this.resetCar(car, 0, false));
    Object.values(this.cars).filter(car => !car.connected).forEach(car => this.deletePlayer(car.id));
    this.events.push({ type: "countdown", round: this.round });
  }
  toLobby() {
    this.phase = "lobby"; this.phaseTime = 0; this.winnerId = null;
    Object.values(this.cars).forEach(car => { car.racing = false; car.input = emptyInput(); });
  }
  updatePlaying(dt) {
    const racers = this.racingCars(); racers.filter(car => !car.destroyed).forEach(car => this.integrateCar(car, dt));
    for (let a = 0; a < racers.length; a += 1) for (let b = a + 1; b < racers.length; b += 1) this.collide(racers[a], racers[b]);
    const survivors = racers.filter(car => !car.destroyed && car.connected);
    if (racers.length >= MIN_PLAYERS && survivors.length <= 1) {
      this.winnerId = survivors[0]?.id || null; if (survivors[0]) survivors[0].stats.wins += 1;
      this.phase = "results"; this.phaseTime = RESULTS_SECONDS; this.events.push({ type: "winner", id: this.winnerId });
    }
  }
  updateWrecks(dt) {
    Object.values(this.cars).forEach(car => {
      if (!car.destroyed || car.visible === false) return;
      car.wreckTimer = Math.max(0, (car.wreckTimer ?? 5) - dt);
      if (car.wreckTimer <= 0) { car.visible = false; this.events.push({ type: "remove", id: car.id }); }
    });
  }
  updateCollisionCooldowns(dt) {
    this.collisionCooldowns ||= {};
    Object.keys(this.collisionCooldowns).forEach(key => { this.collisionCooldowns[key] -= dt; if (this.collisionCooldowns[key] <= 0) delete this.collisionCooldowns[key]; });
  }
  integrateCar(car, dt) {
    car.wallCooldown = Math.max(0, (car.wallCooldown || 0) - dt);
    const input = car.input; const speedRatio = clamp(Math.abs(car.speed) / Math.max(1, car.maxSpeed), 0, 1);
    if (input.forward) car.speed += CAR.acceleration * dt;
    if (input.brake) car.speed -= (car.speed > 0 ? CAR.brake : CAR.acceleration * 0.65) * dt;
    if (!input.forward && !input.brake) { const drag = CAR.drag * dt; car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag; }
    car.speed = clamp(car.speed, -CAR.reverseSpeed, car.maxSpeed);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (steer && Math.abs(car.speed) > 4) car.angle = wrapAngle(car.angle + steer * CAR.turnSpeed * (0.28 + speedRatio * 0.72) * Math.sign(car.speed) * dt);
    car.x += Math.cos(car.angle) * car.speed * dt; car.y += Math.sin(car.angle) * car.speed * dt; car.stats.distance += Math.abs(car.speed * dt);
    this.constrainToTrack(car);
  }
  constrainToTrack(car) {
    const cx = WORLD.width / 2, cy = WORLD.height / 2; const outerX = cx - WORLD.padding - CAR.radius * 0.7, outerY = cy - WORLD.padding - CAR.radius * 0.7;
    const innerX = WORLD.width / 2 - WORLD.infield + CAR.radius * 0.7, innerY = WORLD.height / 2 - WORLD.infield * 0.66 + CAR.radius * 0.7; const dx = car.x - cx, dy = car.y - cy;
    const outer = Math.sqrt((dx * dx) / (outerX * outerX) + (dy * dy) / (outerY * outerY));
    const inner = Math.sqrt((dx * dx) / (innerX * innerX) + (dy * dy) / (innerY * innerY)); let hit = false;
    if (outer > 1) { car.x = cx + dx / outer; car.y = cy + dy / outer; hit = true; }
    else if (inner < 1) { const scale = 1 / Math.max(inner, 0.001); car.x = cx + dx * scale; car.y = cy + dy * scale; hit = true; }
    if (hit) {
      const impact = Math.abs(car.speed); car.speed *= -0.28;
      if (car.wallCooldown <= 0) {
        const damage = impact > CAR.maxSpeed * 0.35 ? this.applyDamage(car, Math.min(0.65, impact / CAR.maxSpeed * 0.65), null, "wall") : 0;
        this.events.push({ type: "wall", id: car.id, x: car.x, y: car.y, power: impact / CAR.maxSpeed, damage }); car.wallCooldown = 0.45;
      }
    }
  }
  collide(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 0.001; if (distance >= CAR.radius * 2) return false;
    const nx = dx / distance, ny = dy / distance;
    const relative = Math.abs((a.speed * Math.cos(a.angle) - b.speed * Math.cos(b.angle)) * nx + (a.speed * Math.sin(a.angle) - b.speed * Math.sin(b.angle)) * ny);
    const overlap = CAR.radius * 2 - distance; if (!a.destroyed) { a.x -= nx * overlap * 0.52; a.y -= ny * overlap * 0.52; } if (!b.destroyed) { b.x += nx * overlap * 0.52; b.y += ny * overlap * 0.52; }
    const angleAB = Math.atan2(dy, dx); const hitA = hitZone(wrapAngle(angleAB - a.angle)); const hitB = hitZone(wrapAngle(angleAB + Math.PI - b.angle));
    const pairKey = [a.id,b.id].sort().join(":"); const canDamage = !this.collisionCooldowns[pairKey];
    const scale = clamp(relative / (CAR.maxSpeed * 0.65), 0.12, 1.2); const damageToA = canDamage ? this.applyDamage(a, zoneDamage(hitB) * scale, b, "car") : 0; const damageToB = canDamage ? this.applyDamage(b, zoneDamage(hitA) * scale, a, "car") : 0;
    if (canDamage) this.collisionCooldowns[pairKey] = 0.24;
    a.damageCaused[b.id] = (a.damageCaused[b.id] || 0) + damageToB; a.damageReceived[b.id] = (a.damageReceived[b.id] || 0) + damageToA;
    b.damageCaused[a.id] = (b.damageCaused[a.id] || 0) + damageToA; b.damageReceived[a.id] = (b.damageReceived[a.id] || 0) + damageToB;
    const oldA = a.speed, oldB = b.speed; if (!a.destroyed) a.speed = oldA * 0.35 + oldB * 0.22; if (!b.destroyed) b.speed = oldB * 0.35 + oldA * 0.22;
    a.stats.hits += 1; b.stats.hits += 1; this.events.push({ type: "collision", a: a.id, b: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power: scale, damageToA, damageToB }); return true;
  }
  applyDamage(car, amount, attacker = null, source = "car") {
    if (car.destroyed || amount <= 0) return 0; const before = car.damage; car.damage = clamp(car.damage + amount, 0, CAR.maxDamage);
    car.maxSpeed = car.damage >= 75 ? CAR.maxSpeed * 0.52 : CAR.maxSpeed * (1 - car.damage * 0.0064); if (attacker) attacker.stats.damageDealt += car.damage - before;
    if (car.damage >= CAR.maxDamage) { car.destroyed = true; car.visible = true; car.wreckTimer = 5; car.speed = 0; car.input = emptyInput(); car.stats.wrecks += 1; if (attacker) attacker.stats.knockouts += 1; this.events.push({ type: "wreck", id: car.id, attacker: attacker?.id || null, source }); }
    return car.damage - before;
  }
  resetCar(car, index, racing, total = 1) {
    if (racing) {
      const theta = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, total);
      const laneX = WORLD.width / 2 - (WORLD.padding + WORLD.infield) / 2;
      const laneY = WORLD.height / 2 - (WORLD.padding + WORLD.infield * 0.66) / 2;
      car.x = WORLD.width / 2 + Math.cos(theta) * laneX;
      car.y = WORLD.height / 2 + Math.sin(theta) * laneY;
      car.angle = theta + Math.PI / 2;
    } else { car.x = WORLD.width / 2; car.y = WORLD.height / 2; car.angle = 0; }
    car.speed = 0; car.damage = 0; car.maxSpeed = CAR.maxSpeed; car.destroyed = false; car.visible = true; car.wreckTimer = 0; car.wallCooldown = 0; car.damageCaused = {}; car.damageReceived = {}; car.racing = racing; car.input = emptyInput();
  }
  makeCar(id, name, slot) {
    return { id, name: safeName(name), color: COLORS[slot % COLORS.length], visualIndex: slot % 8, connected: true, racing: false, x: 160, y: WORLD.height / 2, angle: 0, speed: 0, damage: 0, maxSpeed: CAR.maxSpeed, destroyed: false, visible: true, wreckTimer: 0, wallCooldown: 0, damageCaused: {}, damageReceived: {}, input: emptyInput(), stats: { wins: 0, hits: 0, wrecks: 0, knockouts: 0, damageDealt: 0, distance: 0 } };
  }
  connectedCars() { return this.order.map(id => this.cars[id]).filter(car => car?.connected); }
  racingCars() { return this.order.map(id => this.cars[id]).filter(car => car?.racing); }
  activeConnected() { return this.racingCars().filter(car => car.connected && !car.destroyed); }
  snapshot() { const data = clone(this); data.events = this.events.splice(0); return data; }
  restore(snapshot) { Object.assign(this, clone(snapshot)); this.events = []; }
}
function emptyInput() { return { forward: false, brake: false, left: false, right: false }; }
function hitZone(relativeAngle) { const degrees = Math.abs(relativeAngle) * 180 / Math.PI; if (degrees < 48) return "front"; if (degrees > 132) return "rear"; return "side"; }
function zoneDamage(zone) { return zone === "front" ? 4 : zone === "side" ? 3 : 1; }
