import { WORLD_WIDTH, WORLD_HEIGHT, wrap, wrappedDelta, wrappedDistance, seeded } from './world.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Simulation {
  constructor(seed = Date.now()) {
    this.random = seeded(seed);
    this.time = 0;
    this.state = 'ready';
    this.nextId = 1;
    this.entities = [];
    this.player = null;
    this.distance = 0;
    this.score = 0;
    this.rescued = 0;
    this.multiplier = 1;
    this.spawnBudget = 1;
    this.nextWaveId = 1;
    this.slowdown = 0;
    this.events = [];
  }

  start(name = 'Pilot') {
    this.time = this.distance = this.score = this.rescued = this.slowdown = 0;
    this.multiplier = 1;
    this.entities.length = 0;
    this.events.length = 0;
    this.player = this.add({
      type: 'player', name, x: 320, y: 300, vx: 175, vy: -185,
      radius: 27, facing: 1, lives: 2, maxLives: 2, shield: 0,
      invulnerable: 2.8, pitch: -.16,
    });
    this.state = 'playing';
    this.spawnBudget = .4;
    this.nextWaveId = 1;
    for (let i = 0; i < 34; i++) this.spawnScenery(i * 700 + this.random() * 400);
    this.events.push({type: 'message', text: 'CLEAR FOR TAKE-OFF', mood: 'good'});
  }

  add(data) {
    const entity = {id: this.nextId++, alive: true, age: 0, ...data};
    this.entities.push(entity);
    return entity;
  }

  spawnScenery(x) {
    this.add({type: 'scenery', kind: 'tree', x: wrap(x), y: 105, radius: 0, variant: (this.random() * 3) | 0});
  }

  spawnPowerup(x, direction) {
    let kind;
    if (this.player.lives < this.player.maxLives) kind = 'repair';
    else kind = this.random() < .72 ? 'shield' : 'slowdown';
    this.add({type: 'powerup', kind, x, y: 190 + this.random() * 470, vx: -direction * 12, vy: 0, radius: 23, phase: this.random() * 6.28});
  }

  spawnMonkeyMouth(x, direction) {
    const ceiling = this.random() < .28;
    this.add({
      type: 'enemy', kind: 'monkeyMouth', x,
      y: ceiling ? WORLD_HEIGHT + 250 : -250,
      vx: -direction * (48 + this.random() * 28), vy: 0, radius: 66,
      side: ceiling ? 'ceiling' : 'ground', state: 'warning', stateTime: 0,
      eyeY: ceiling ? WORLD_HEIGHT - 18 : 72,
      fullY: ceiling ? WORLD_HEIGHT - 145 : 185,
      phase: this.random() * 6.28,
    });
  }

  spawnEnemyWave(x, direction) {
    const kinds = ['businessBird', 'businessBird', 'witchPig', 'bombFish'];
    const kind = kinds[(this.random() * kinds.length) | 0];
    const waveId = this.nextWaveId++;
    const count = 3;
    const speed = 92 + this.random() * 38;
    const baseY = 255 + this.random() * 330;
    const amplitude = 72 + this.random() * 38;
    const frequency = 1.35 + this.random() * .8;
    const phase = this.random() * Math.PI * 2;

    for (let index = 0; index < count; index++) {
      // Put successive members farther ahead and slightly farther around the
      // same sine curve. They arrive as a readable procession instead of
      // converging on the player and forming an unavoidable clump.
      const memberPhase = phase + index * .72;
      const memberX = wrap(x + direction * index * 165);
      this.add({
        type: 'enemy', kind, waveId, waveIndex: index,
        x: memberX, y: baseY + Math.sin(memberPhase) * amplitude,
        vx: -direction * speed, vy: 0,
        radius: kind === 'bombFish' ? 29 : 31,
        phase: memberPhase, baseY, amplitude, frequency,
      });
    }
  }

  spawnAhead() {
    const p = this.player;
    const direction = p.facing || 1;
    const x = wrap(p.x + direction * (780 + this.random() * 720));
    const roll = this.random();

    if (roll < .17) {
      // The original birds run along the surface: rescuing them should require
      // a deliberate, risky swoop rather than an accidental mid-air pickup.
      const baseY = 103 + this.random() * 24;
      this.add({type: 'bird', x, y: baseY, baseY, vx: -direction * (15 + this.random() * 30), vy: 0, radius: 20, phase: this.random() * 6.28});
    } else if (roll < .26) {
      this.spawnPowerup(x, direction);
    } else if (roll < .38 && this.distance > 90) {
      this.spawnMonkeyMouth(x, direction);
    } else {
      this.spawnEnemyWave(x, direction);
    }
  }

  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.slowdown = Math.max(0, this.slowdown - dt);
    const worldSpeed = this.slowdown > 0 ? .55 : 1;
    const p = this.player;
    p.age += dt;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.shield = Math.max(0, p.shield - dt);

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (steer) p.facing = steer;
    const cruise = 190 + Math.min(125, this.distance / 35);
    p.vx += (p.facing * cruise - p.vx) * Math.min(1, dt * 2.2);
    p.vy += 510 * dt;
    if (input.lift) p.vy -= 970 * dt;
    p.vy = clamp(p.vy, -360, 440);
    p.pitch += ((input.lift ? -.32 : .2) - p.pitch) * Math.min(1, dt * 5);
    p.x = wrap(p.x + p.vx * dt);
    const floor = 82;
    const ceiling = WORLD_HEIGHT - 82;
    p.y = clamp(p.y - p.vy * dt, floor, ceiling);

    // The top of the play area is a flight ceiling, not a damaging surface.
    // Cancel only upward momentum so the copter can immediately descend again.
    if (p.y >= ceiling && p.vy < 0) p.vy = 0;
    if (p.y <= floor + 1) this.hitPlayer('THE GROUND HAS TEETH');

    const travelled = Math.abs(p.vx) * dt / 44;
    this.distance += travelled;
    this.score += travelled * this.multiplier;
    this.spawnBudget -= dt * worldSpeed * (1 + Math.min(1.7, this.distance / 900));
    if (this.spawnBudget <= 0) {
      this.spawnAhead();
      this.spawnBudget = .9 + this.random() * 1.25;
    }

    for (const e of this.entities) {
      if (!e.alive || e === p) continue;
      e.age += dt;

      if (e.type === 'enemy') {
        this.updateEnemy(e, p, dt, worldSpeed);
        const collidable = e.kind !== 'monkeyMouth' || e.state === 'emerge' || e.state === 'travel';
        if (collidable && wrappedDistance(p, e) < p.radius + e.radius) {
          if (p.shield > 0) {
            e.alive = false;
            this.score += 50 * this.multiplier;
            this.events.push({type: 'message', text: '+50 SHIELD STRIKE', mood: 'good'});
          } else {
            this.hitPlayer(e.kind === 'monkeyMouth' ? 'MONKEY MOUTH!' : 'HULL IMPACT');
          }
        }
      } else if (e.type === 'bird' || e.type === 'powerup') {
        e.x = wrap(e.x + e.vx * dt * worldSpeed);
        if (e.type === 'bird') {
          e.baseY ??= e.y;
          e.y = e.baseY + Math.sin(e.age * 5 + e.phase) * 3;
        }
        else e.y += Math.sin(e.age * 3 + e.phase) * 12 * dt;
        if (wrappedDistance(p, e) < p.radius + e.radius) this.collect(e, p);
      }
    }

    this.entities = this.entities.filter(e => e.alive && (e.type === 'scenery' || e === p || wrappedDistance(p, e) < 2600));
  }

  updateEnemy(e, p, dt, speed) {
    if (e.kind === 'businessBird' || e.kind === 'witchPig' || e.kind === 'bombFish') {
      e.x = wrap(e.x + e.vx * dt * speed);
      e.y = e.baseY + Math.sin(e.age * e.frequency + e.phase) * e.amplitude;
    } else if (e.kind === 'monkeyMouth') {
      e.stateTime += dt;
      const direction = e.side === 'ground' ? 1 : -1;
      if (e.state === 'warning') {
        e.y += direction * 310 * dt;
        if ((direction > 0 && e.y >= e.eyeY) || (direction < 0 && e.y <= e.eyeY)) {
          e.y = e.eyeY;
          e.state = 'hold';
          e.stateTime = 0;
        }
      } else if (e.state === 'hold' && e.stateTime >= 1.2) {
        e.state = 'emerge';
        e.stateTime = 0;
      } else if (e.state === 'emerge') {
        e.y += direction * 300 * dt;
        if ((direction > 0 && e.y >= e.fullY) || (direction < 0 && e.y <= e.fullY)) {
          e.y = e.fullY;
          e.state = 'travel';
          e.stateTime = 0;
        }
      } else if (e.state === 'travel') {
        e.x = wrap(e.x + e.vx * dt * speed);
      }
    }
  }

  collect(e, p) {
    e.alive = false;
    if (e.type === 'bird') {
      this.rescued++;
      this.multiplier = Math.min(10, this.multiplier + 1);
      this.score += 100 * this.multiplier;
      this.events.push({type: 'message', text: `BIRD RESCUED · ${this.multiplier}×`, mood: 'good'});
    } else if (e.kind === 'shield') {
      p.shield = 12.5;
      this.events.push({type: 'message', text: 'SHIELDS UP', mood: 'good', sound: 'shield'});
    } else if (e.kind === 'repair') {
      p.lives = Math.min(p.maxLives, p.lives + 1);
      this.events.push({type: 'message', text: 'HULL REPAIRED', mood: 'good', sound: 'repair'});
    } else if (e.kind === 'slowdown') {
      this.slowdown = 8;
      this.events.push({type: 'message', text: 'TIME DILATION', mood: 'good', sound: 'slowdown'});
    }
  }

  hitPlayer(message) {
    const p = this.player;
    if (p.invulnerable > 0 || this.state !== 'playing') return;
    p.lives--;
    p.invulnerable = 2.2;
    p.vy = -180;
    p.vx *= -.25;
    this.multiplier = Math.max(1, this.multiplier - 1);
    this.events.push({type: 'message', text: message, mood: 'bad'});
    if (p.lives <= 0) {
      this.state = 'gameover';
      this.events.push({type: 'gameover'});
    }
  }

  drainEvents() { return this.events.splice(0); }
}
