(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const clockEl = document.getElementById('clock');
  const bestEl = document.getElementById('best');
  const objectiveEl = document.getElementById('objective');
  const messageEl = document.getElementById('message');
  const stallCountdownEl = document.getElementById('stall-countdown');
  const launchButton = document.getElementById('launch');
  const layoutDialog = document.getElementById('layout-dialog');
  const layoutList = document.getElementById('layout-list');
  const layoutNameInput = document.getElementById('layout-name');
  const saveLayoutForm = document.getElementById('save-layout-form');
  const saveStatusEl = document.getElementById('save-status');
  const layoutCountEl = document.getElementById('layout-count');
  const levelListEl = document.getElementById('level-list');
  const storage = window.HareTortoiseStorage;
  const worlds = window.HareTortoiseWorlds;
  const world = worlds[0];
  const levels = world.levels;
  const PHYSICS_VERSION = 2;
  const GAME_CONFIG = Object.freeze({
    stalledBall: Object.freeze({
      countdownSeconds: 10,
      settleSeconds: 0.75,
      movementRadius: 2
    })
  });

  let mode = 'hare';
  let activeTool = 'select';
  let selectedId = null;
  let running = false;
  let ball = null;
  let lastFrame = performance.now();
  let carrots = [];
  let hedgehog = null;
  let celebration = [];
  let audio;
  let storageReady = false;
  let savedLayouts = [];
  const saveTimers = {};
  const FIXED_STEP = 1 / 120;
  let simulationAccumulator = 0;
  const backgroundImageCache = new Map();

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  let currentLevelId = levels[0].id;
  let limits = pieceLimits(levels[0].id, mode);
  const courses = Object.fromEntries(levels.map(entry => [entry.id, {
    hare: freshPieces(entry.starter.hare),
    tortoise: freshPieces(entry.starter.tortoise)
  }]));
  const progress = Object.fromEntries(levels.map(entry => [entry.id, {
    hare: freshRecord(), tortoise: freshRecord()
  }]));
  const lastLevelByTrack = { hare: levels[0].id, tortoise: levels[0].id };

  function freshRecord() { return { overall: null, golden: null, stars: 0, parBeaten: false }; }
  function freshPieces(value) {
    return clone(value || []).map((piece, index) => ({ ...piece, id: index + 1, hits: 0, tired: false }));
  }
  function level(id = currentLevelId) { return levels.find(entry => entry.id === id) || levels[0]; }
  function pieces(track = mode, levelId = currentLevelId) { return courses[levelId][track]; }
  function record(track = mode, levelId = currentLevelId) { return progress[levelId][track]; }
  function nextId() { return Math.max(0, ...pieces().map(p => p.id)) + 1; }

  function validTrack(value) { return value === 'tortoise' ? 'tortoise' : 'hare'; }

  function pieceLimits(levelId = currentLevelId, track = mode) {
    const entry = level(levelId);
    if (!entry.availablePieces) return clone(entry.inventory || {});
    const totals = {};
    for (const type of Object.keys(entry.availablePieces)) {
      const placed = (entry.starter?.[track] || []).filter(piece => piece.type === type).length;
      totals[type] = entry.availablePieces[type] + placed;
    }
    return totals;
  }

  function sanitisePieces(value, levelId = currentLevelId, track = mode) {
    if (!Array.isArray(value)) return null;
    const inventory = pieceLimits(levelId, track);
    const allowed = new Set(Object.keys(inventory));
    const counts = { platform: 0, ramp: 0, spring: 0, pipe: 0 };
    const result = [];
    for (const raw of value) {
      if (!allowed.has(raw?.type) || counts[raw.type] >= inventory[raw.type]) continue;
      const x = Number(raw.x), y = Number(raw.y), angle = Number(raw.angle);
      if (![x, y, angle].every(Number.isFinite)) continue;
      counts[raw.type]++;
      result.push({
        id: result.length + 1,
        type: raw.type,
        x: Math.max(125, Math.min(985, x)),
        y: Math.max(110, Math.min(535, y)),
        angle,
        hits: 0,
        tired: false
      });
    }
    return result;
  }

  function courseSnapshot(track = mode, levelId = currentLevelId) {
    return {
      levelId,
      levelRevision: level(levelId).revision,
      track,
      physicsVersion: PHYSICS_VERSION,
      pieces: courses[levelId][track].map(({ type, x, y, angle }) => ({ type, x, y, angle }))
    };
  }

  function setSaveStatus(text) { saveStatusEl.textContent = text; }

  function updateClockEffect() {
    const active = Boolean(running && ball && ball.clockEffectRemaining > 0);
    const frozen = active && mode === 'hare';
    const fired = active && mode === 'tortoise';
    clockEl.classList.toggle('clock-frozen', frozen);
    clockEl.classList.toggle('clock-fired', fired);
    if (frozen) {
      clockEl.dataset.effect = '❄ TIME FROZEN';
      clockEl.setAttribute('aria-label', `${clockEl.textContent}, carrot bonus: time frozen`);
    } else if (fired) {
      clockEl.dataset.effect = '🔥 TIME ×2';
      clockEl.setAttribute('aria-label', `${clockEl.textContent}, carrot challenge: time running at double speed`);
    } else {
      delete clockEl.dataset.effect;
      clockEl.removeAttribute('aria-label');
    }
  }

  function hideStallCountdown() {
    stallCountdownEl.classList.add('hidden');
  }

  function updateStallCountdown(dt) {
    const config = GAME_CONFIG.stalledBall;
    const movedFromAnchor = Math.hypot(ball.x - ball.stallAnchorX, ball.y - ball.stallAnchorY);
    if (movedFromAnchor > config.movementRadius) {
      ball.stallAnchorX = ball.x;
      ball.stallAnchorY = ball.y;
      ball.stallStillFor = 0;
      ball.stallCountdownRemaining = config.countdownSeconds;
      hideStallCountdown();
      return;
    }

    ball.stallStillFor += dt;
    if (ball.stallStillFor < config.settleSeconds) {
      hideStallCountdown();
      return;
    }

    ball.stallCountdownRemaining = Math.max(0, ball.stallCountdownRemaining - dt);
    const secondsShown = String(Math.ceil(ball.stallCountdownRemaining));
    const secondsEl = stallCountdownEl.querySelector('strong');
    if (secondsEl.textContent !== secondsShown) secondsEl.textContent = secondsShown;
    stallCountdownEl.classList.remove('hidden');
    if (ball.stallCountdownRemaining <= 0) finish(false, 'stopped');
  }

  function scheduleDraftSave(track = mode, levelId = currentLevelId) {
    if (!storageReady) return;
    const snapshot = courseSnapshot(track, levelId);
    const timerKey = `${levelId}:${track}`;
    clearTimeout(saveTimers[timerKey]);
    setSaveStatus('Saving…');
    saveTimers[timerKey] = setTimeout(async () => {
      try {
        await storage.setState(`draft:${levelId}:${track}`, snapshot);
        setSaveStatus('Saved on this device');
      } catch (_) { setSaveStatus('Local save unavailable'); }
    }, 220);
  }

  async function saveProgress() {
    if (!storageReady) return;
    try {
      await storage.setState('progress:v2', clone(progress));
      setSaveStatus('Scores saved locally');
    } catch (_) { setSaveStatus('Local save unavailable'); }
  }

  function resetCollectibles() {
    carrots = level().carrots.map(item => ({ ...item, got: false }));
    hedgehog = level().goldenHedgehog ? { ...level().goldenHedgehog, got: false } : null;
  }

  function setMessage(title, body, hold = 2200) {
    messageEl.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
    messageEl.classList.remove('hidden');
    clearTimeout(setMessage.timer);
    if (hold) setMessage.timer = setTimeout(() => messageEl.classList.add('hidden'), hold);
  }

  function sound(kind) {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.connect(gain).connect(audio.destination);
      const settings = {
        launch: [180, 460, .18, 'sawtooth'],
        bounce: [260, 150, .08, 'triangle'],
        spring: [180, 720, .16, 'square'],
        collect: [520, 880, .12, 'sine'],
        win: [420, 940, .5, 'triangle'],
        fail: [170, 70, .4, 'sawtooth']
      }[kind] || [220, 180, .1, 'sine'];
      osc.type = settings[3];
      osc.frequency.setValueAtTime(settings[0], now);
      osc.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
      gain.gain.setValueAtTime(.07, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + settings[2]);
      osc.start(now); osc.stop(now + settings[2]);
    } catch (_) {}
  }

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height
    };
  }

  function pieceLength(piece) { return piece.type === 'platform' ? 155 : piece.type === 'ramp' ? 130 : piece.type === 'pipe' ? 124 : 105; }
  function segment(piece) {
    const half = pieceLength(piece) / 2;
    const dx = Math.cos(piece.angle) * half;
    const dy = Math.sin(piece.angle) * half;
    return { ax: piece.x - dx, ay: piece.y - dy, bx: piece.x + dx, by: piece.y + dy };
  }

  function transformPipePoints(piece, localPoints) {
    const cosine = Math.cos(piece.angle), sine = Math.sin(piece.angle);
    return localPoints.map(([x, y]) => [
      piece.x + x * cosine - y * sine,
      piece.y + x * sine + y * cosine
    ]);
  }

  function pipeGeometry(piece) {
    return { width: 68, points: transformPipePoints(piece, [[-62, 0], [0, 0], [0, 62]]) };
  }

  function pipeWalls(piece) {
    return [
      // The bevel replaces the square outer corner. An incoming sphere meets
      // the diagonal face and is guided into the downward leg of the elbow.
      transformPipePoints(piece, [[-62, -34], [-12, -34], [34, 12], [34, 62]]).map(([x, y]) => ({ x, y })),
      transformPipePoints(piece, [[-62, 34], [-34, 34], [-34, 62]]).map(([x, y]) => ({ x, y }))
    ];
  }

  function nearestPiece(point) {
    let winner = null, distance = 34;
    for (const piece of pieces()) {
      const d = Math.hypot(point.x - piece.x, point.y - piece.y);
      const reach = piece.type === 'pipe' ? 78 : distance;
      if (d < reach && (!winner || d < distance)) { winner = piece; distance = d; }
    }
    return winner;
  }

  function remaining(type) { return limits[type] - pieces().filter(p => p.type === type).length; }
  function updateTools() {
    for (const type of Object.keys(limits)) document.getElementById(`count-${type}`).textContent = remaining(type);
    const total = Object.keys(limits).reduce((n, type) => n + remaining(type), 0);
    document.getElementById('remaining').textContent = `${total} pieces available`;
    document.querySelectorAll('.tool').forEach(el => {
      const type = el.dataset.tool;
      el.disabled = type !== 'select' && (limits[type] || 0) <= 0;
      el.classList.toggle('selected', type === activeTool);
    });
  }

  let dragging = false;
  canvas.addEventListener('pointerdown', event => {
    if (running) return;
    const point = toWorld(event);
    const found = nearestPiece(point);
    if (activeTool === 'select') {
      selectedId = found?.id ?? null;
      dragging = Boolean(found);
    } else if (remaining(activeTool) > 0 && point.x > 115 && point.x < 995 && point.y > 95 && point.y < 540) {
      const angle = activeTool === 'ramp' ? -.35 : 0;
      const piece = { id: nextId(), type: activeTool, x: point.x, y: point.y, angle, hits: 0 };
      pieces().push(piece);
      selectedId = piece.id;
      activeTool = 'select';
      dragging = true;
      updateTools();
      sound('bounce');
    }
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging || running) return;
    const piece = pieces().find(p => p.id === selectedId);
    if (!piece) return;
    const point = toWorld(event);
    piece.x = Math.max(125, Math.min(985, point.x));
    piece.y = Math.max(110, Math.min(535, point.y));
  });
  canvas.addEventListener('pointerup', () => {
    if (dragging) scheduleDraftSave();
    dragging = false;
  });

  document.querySelectorAll('.tool').forEach(button => button.addEventListener('click', () => {
    activeTool = button.dataset.tool;
    selectedId = null;
    updateTools();
  }));
  document.getElementById('rotate').addEventListener('click', () => {
    if (running) return;
    const piece = pieces().find(p => p.id === selectedId);
    if (piece) { piece.angle += piece.type === 'pipe' ? Math.PI / 2 : Math.PI / 4; sound('bounce'); scheduleDraftSave(); }
  });
  document.getElementById('delete').addEventListener('click', () => {
    if (running || selectedId == null) return;
    const index = pieces().findIndex(p => p.id === selectedId);
    if (index >= 0) pieces().splice(index, 1);
    selectedId = null; updateTools(); scheduleDraftSave();
  });
  document.getElementById('reset').addEventListener('click', () => {
    courses[currentLevelId][mode] = freshPieces(level().starter[mode]); selectedId = null; running = false; ball = null;
    simulationAccumulator = 0;
    resetCollectibles(); updateTools(); launchButton.disabled = false; clockEl.textContent = '0.00s';
    updateClockEffect();
    scheduleDraftSave();
    setMessage('Course restored', `${level().name}'s starting layout is ready again.`);
  });

  function isLevelUnlocked(levelId, track = mode) {
    const index = levels.findIndex(entry => entry.id === levelId);
    return index <= 0 || progress[levels[index - 1].id][track].parBeaten;
  }

  function highestUnlocked(track = mode) {
    return [...levels].reverse().find(entry => isLevelUnlocked(entry.id, track))?.id || levels[0].id;
  }

  function renderLevelNav() {
    levelListEl.replaceChildren();
    levels.forEach((entry, index) => {
      const unlocked = isLevelUnlocked(entry.id);
      const result = progress[entry.id][mode];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `level-button${entry.id === currentLevelId ? ' active' : ''}`;
      button.disabled = !unlocked;
      button.dataset.level = entry.id;
      const status = unlocked
        ? (result.stars ? `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}` : `Par ${entry.scoring[mode].par}s`)
        : `🔒 Beat level ${index}`;
      button.innerHTML = `<span>${index + 1}</span><strong>${entry.name}</strong><small>${status}</small>`;
      button.addEventListener('click', () => selectLevel(entry.id));
      levelListEl.append(button);
    });
  }

  function selectLevel(levelId, announce = true) {
    if (!isLevelUnlocked(levelId)) return false;
    currentLevelId = levelId;
    lastLevelByTrack[mode] = levelId;
    limits = pieceLimits(currentLevelId, mode);
    running = false; ball = null; selectedId = null; activeTool = 'select';
    simulationAccumulator = 0; launchButton.disabled = false; clockEl.textContent = '0.00s';
    updateClockEffect();
    resetCollectibles(); updateTools(); updateBest(); renderLevelNav();
    if (storageReady) storage.setState(`lastLevel:${mode}`, levelId).catch(() => {});
    if (announce) setMessage(level().name, level().description || `Beat par to open the next ${mode} trail.`);
    return true;
  }

  function activateMode(track, announce = true) {
    mode = validTrack(track);
    const preferred = lastLevelByTrack[mode];
    currentLevelId = isLevelUnlocked(preferred, mode) ? preferred : highestUnlocked(mode);
    limits = pieceLimits(currentLevelId, mode);
    document.querySelectorAll('.mode').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    objectiveEl.textContent = mode === 'hare' ? 'FASTEST SUCCESSFUL RUN' : 'LONGEST VALID JOURNEY';
    activeTool = 'select'; selectedId = null; resetCollectibles(); updateTools(); updateBest(); renderLevelNav();
    if (storageReady) storage.setState('lastTrack', mode).catch(() => {});
    if (announce) setMessage(mode === 'hare' ? 'The Hare' : 'The Tortoise', mode === 'hare' ? 'Build the quickest reliable course.' : 'Reach the goal, but take your time.');
  }

  document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => {
    if (running) return;
    activateMode(button.dataset.mode);
  }));

  launchButton.addEventListener('click', () => {
    if (running) return;
    resetCollectibles();
    pieces().forEach(p => { p.hits = 0; p.tired = false; });
    selectedId = null;
    const launcher = level().launcher;
    ball = {
      x: launcher.x, y: launcher.y, vx: launcher.vx, vy: launcher.vy,
      radius: 18, trail: [], age: 0, scoreAge: 0, clockEffectRemaining: 0,
      stallAnchorX: launcher.x, stallAnchorY: launcher.y, stallStillFor: 0,
      stallCountdownRemaining: GAME_CONFIG.stalledBall.countdownSeconds
    };
    running = true; simulationAccumulator = 0; launchButton.disabled = true;
    updateClockEffect();
    hideStallCountdown();
    messageEl.classList.add('hidden'); sound('launch');
  });

  function collidePiece(piece) {
    if (piece.tired) return;
    if (piece.type === 'pipe') {
      let bounced = false;
      for (const wall of pipeWalls(piece)) {
        for (let index = 1; index < wall.length; index++) {
          bounced = collideStaticSegment(wall[index - 1].x, wall[index - 1].y, wall[index].x, wall[index].y) || bounced;
        }
      }
      if (bounced) {
        piece.hits++;
        sound('bounce');
        if (piece.hits >= 8) {
          piece.tired = true;
          setMessage('A tired elbow gave way', 'The pipe has had quite enough excitement.');
        }
      }
      return;
    }
    const s = segment(piece);
    const vx = s.bx - s.ax, vy = s.by - s.ay;
    const len2 = vx * vx + vy * vy;
    const rawT = ((ball.x - s.ax) * vx + (ball.y - s.ay) * vy) / len2;
    const t = Math.max(0, Math.min(1, rawT));
    const px = s.ax + t * vx, py = s.ay + t * vy;
    const dx = ball.x - px, dy = ball.y - py;
    const distance = Math.hypot(dx, dy);
    const thickness = 7;
    if (distance > ball.radius + thickness) return false;

    // Each construction piece is a solid capsule: both long faces and the
    // rounded ends collide. If the centre lands exactly on the segment, use
    // the face opposing its travel to choose a stable escape direction.
    let nx, ny;
    if (distance > .001) {
      nx = dx / distance;
      ny = dy / distance;
    } else {
      const faceX = Math.sin(piece.angle), faceY = -Math.cos(piece.angle);
      const facing = ball.vx * faceX + ball.vy * faceY;
      nx = facing > 0 ? -faceX : faceX;
      ny = facing > 0 ? -faceY : faceY;
    }
    const approach = ball.vx * nx + ball.vy * ny;
    if (approach >= 0) return;
    const boost = piece.type === 'spring' ? 1.42 : piece.type === 'ramp' ? .94 : .82;
    ball.x += nx * (ball.radius + thickness - distance);
    ball.y += ny * (ball.radius + thickness - distance);
    ball.vx = (ball.vx - 2 * approach * nx) * boost;
    ball.vy = (ball.vy - 2 * approach * ny) * boost;
    if (piece.type === 'spring') {
      ball.vx += nx * 120;
      ball.vy += ny * 120;
    }
    piece.hits++;
    sound(piece.type === 'spring' ? 'spring' : 'bounce');
    if (piece.hits >= 8) {
      piece.tired = true;
      setMessage('A tired piece gave way', 'Long loops need a more durable route.');
    }
  }

  function collideStaticSegment(ax, ay, bx, by, thickness = 7) {
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = Math.max(0, Math.min(1, ((ball.x - ax) * vx + (ball.y - ay) * vy) / len2));
    const px = ax + t * vx, py = ay + t * vy;
    const dx = ball.x - px, dy = ball.y - py;
    const distance = Math.hypot(dx, dy);
    if (distance > ball.radius + thickness) return;
    let nx = distance > .001 ? dx / distance : -vy / Math.sqrt(len2);
    let ny = distance > .001 ? dy / distance : vx / Math.sqrt(len2);
    if (ball.vx * nx + ball.vy * ny > 0) { nx *= -1; ny *= -1; }
    const approach = ball.vx * nx + ball.vy * ny;
    ball.x += nx * (ball.radius + thickness - distance);
    ball.y += ny * (ball.radius + thickness - distance);
    if (approach < 0) {
      ball.vx = (ball.vx - 2 * approach * nx) * .86;
      ball.vy = (ball.vy - 2 * approach * ny) * .86;
    }
    return approach < 0;
  }

  function tubeWalls(tube) {
    const half = tube.width / 2;
    const points = tube.points.map(([x, y]) => ({ x, y }));
    const segments = points.slice(0, -1).map((point, index) => {
      const next = points[index + 1];
      const length = Math.hypot(next.x - point.x, next.y - point.y) || 1;
      const dx = (next.x - point.x) / length, dy = (next.y - point.y) / length;
      return { dx, dy, nx: -dy, ny: dx };
    });
    return [-1, 1].map(sign => {
      const wall = [{ x: points[0].x + segments[0].nx * half * sign, y: points[0].y + segments[0].ny * half * sign }];
      for (let index = 1; index < points.length - 1; index++) {
        const before = segments[index - 1], after = segments[index];
        const a = { x: points[index].x + before.nx * half * sign, y: points[index].y + before.ny * half * sign };
        const b = { x: points[index].x + after.nx * half * sign, y: points[index].y + after.ny * half * sign };
        const cross = before.dx * after.dy - before.dy * after.dx;
        const t = Math.abs(cross) < .0001 ? 0 : ((b.x - a.x) * after.dy - (b.y - a.y) * after.dx) / cross;
        wall.push({ x: a.x + before.dx * t, y: a.y + before.dy * t });
      }
      const last = points.length - 1, segment = segments[segments.length - 1];
      wall.push({ x: points[last].x + segment.nx * half * sign, y: points[last].y + segment.ny * half * sign });
      return wall;
    });
  }

  function collideBlock(block) {
    const left = block.x - block.width / 2, right = block.x + block.width / 2;
    const top = block.y - block.height / 2, bottom = block.y + block.height / 2;
    const px = Math.max(left, Math.min(right, ball.x));
    const py = Math.max(top, Math.min(bottom, ball.y));
    let dx = ball.x - px, dy = ball.y - py, distance = Math.hypot(dx, dy);
    let nx, ny, penetration;
    if (distance > .001) {
      if (distance >= ball.radius) return;
      nx = dx / distance; ny = dy / distance; penetration = ball.radius - distance;
    } else {
      const edges = [
        { d: ball.x - left, nx: -1, ny: 0 }, { d: right - ball.x, nx: 1, ny: 0 },
        { d: ball.y - top, nx: 0, ny: -1 }, { d: bottom - ball.y, nx: 0, ny: 1 }
      ].sort((a, b) => a.d - b.d);
      ({ nx, ny } = edges[0]); penetration = ball.radius + edges[0].d;
    }
    ball.x += nx * penetration; ball.y += ny * penetration;
    const approach = ball.vx * nx + ball.vy * ny;
    if (approach < 0) {
      ball.vx = (ball.vx - 2 * approach * nx) * .84;
      ball.vy = (ball.vy - 2 * approach * ny) * .84;
    }
  }

  function collideFixedObjects() {
    for (const object of level().fixedObjects || []) {
      if (object.type === 'block' || object.type === 'crate') collideBlock(object);
      if (object.type === 'tube') {
        for (const wall of tubeWalls(object)) {
          for (let index = 1; index < wall.length; index++) {
            collideStaticSegment(wall[index - 1].x, wall[index - 1].y, wall[index].x, wall[index].y);
          }
        }
      }
    }
  }

  function starsFor(time, track = mode) {
    const stars = level().scoring[track].stars;
    if (track === 'hare') return time <= stars.three ? 3 : time <= stars.two ? 2 : time <= stars.one ? 1 : 0;
    return time >= stars.three ? 3 : time >= stars.two ? 2 : time >= stars.one ? 1 : 0;
  }

  function beatsPar(time, track = mode) {
    const par = level().scoring[track].par;
    return track === 'hare' ? time <= par : time >= par;
  }

  function ballTouchesGoal(goal) {
    const goalRadius = goal.radius || 34;
    return Math.hypot(ball.x - goal.x, ball.y - goal.y) <= ball.radius + goalRadius;
  }

  function finish(success, failureReason = 'meadow') {
    if (!running) return;
    running = false; launchButton.disabled = false;
    hideStallCountdown();
    updateClockEffect();
    const time = ball.scoreAge;
    if (success) {
      const collected = carrots.filter(c => c.got).length;
      const scoreTime = time;
      const result = record();
      const betterThan = value => value == null || (mode === 'hare' ? scoreTime < value : scoreTime > value);
      if (betterThan(result.overall)) result.overall = scoreTime;
      if (hedgehog?.got && betterThan(result.golden)) result.golden = scoreTime;
      const stars = starsFor(time);
      result.stars = Math.max(result.stars, stars);
      const newlyBeatPar = beatsPar(time) && !result.parBeaten;
      if (beatsPar(time)) result.parBeaten = true;
      const levelIndex = levels.findIndex(entry => entry.id === currentLevelId);
      const next = levels[levelIndex + 1];
      const unlockText = newlyBeatPar && next ? ` · ${next.name} unlocked!` : '';
      setMessage(`${'★'.repeat(stars)}${'☆'.repeat(3-stars)} Goal reached in ${time.toFixed(2)}s`, `${collected}/${carrots.length} carrots${hedgehog?.got ? ' · Golden Hedgehog found!' : ''}${unlockText}`, 4600);
      celebration = Array.from({ length: 50 }, (_, index) => {
        const spread = ((index * 37) % 101) / 100 - .5;
        const lift = ((index * 53) % 97) / 96;
        return {
          x: 1010,
          y: 430,
          vx: spread * 300,
          vy: -lift * 240,
          life: 1.5,
          color: index % 2 ? '#f3ca52' : mode === 'hare' ? '#ec8c3c' : '#8eb44a'
        };
      });
      sound('win'); updateBest(); renderLevelNav(); saveProgress();
    } else {
      const failureMessages = {
        timeout: 'The Hare ran out of time. Build a quicker route.',
        stopped: 'The sphere came to rest. Give it another nudge with the course.',
        meadow: 'The sphere touched the meadow. Adjust and try again.'
      };
      setMessage('Not quite a journey', failureMessages[failureReason], 3500);
      sound('fail');
    }
  }

  function updateBest() {
    const result = record();
    const par = level().scoring[mode].par;
    if (result.overall == null) {
      bestEl.textContent = `Best — · Par ${par}s`;
      return;
    }
    bestEl.textContent = `Best ${result.overall.toFixed(2)}s · Par ${par}s${result.golden == null ? '' : ` · 🦔 ${result.golden.toFixed(2)}s`}`;
  }

  function update(dt) {
    if (running && ball) {
      ball.age += dt;
      if (ball.clockEffectRemaining > 0) {
        ball.scoreAge += mode === 'hare' ? 0 : dt * 2;
        ball.clockEffectRemaining = Math.max(0, ball.clockEffectRemaining - dt);
      } else ball.scoreAge += dt;
      clockEl.textContent = `${ball.scoreAge.toFixed(2)}s`;
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const step = dt / steps;
        ball.vy += 255 * step;
        ball.vx *= Math.pow(.998, step * 60);
        ball.x += ball.vx * step; ball.y += ball.vy * step;
        for (const piece of [...pieces()]) collidePiece(piece);
        collideFixedObjects();
        if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx = Math.abs(ball.vx) * .82; }
        if (ball.x > canvas.width - ball.radius) { ball.x = canvas.width - ball.radius; ball.vx = -Math.abs(ball.vx) * .82; }
        const roof = 24;
        if (ball.y < roof + ball.radius) {
          ball.y = roof + ball.radius;
          ball.vy = Math.abs(ball.vy) * .84;
          sound('bounce');
        }
      }
      ball.trail.push({ x: ball.x, y: ball.y, life: 1 });
      if (ball.trail.length > 45) ball.trail.shift();
      ball.trail.forEach(p => p.life -= dt * 1.7);
      for (const carrot of carrots) if (!carrot.got && Math.hypot(ball.x-carrot.x, ball.y-carrot.y) < 34) {
        carrot.got = true;
        ball.clockEffectRemaining += level().scoring.carrotClockEffectSeconds;
        sound('collect');
      }
      updateClockEffect();
      if (hedgehog && !hedgehog.got && Math.hypot(ball.x-hedgehog.x, ball.y-hedgehog.y) < 34) { hedgehog.got = true; sound('collect'); }
      const goal = level().goal;
      if (ballTouchesGoal(goal)) finish(true);
      else if (ball.y > 590) finish(false, 'meadow');
      else if (mode === 'hare' && ball.scoreAge >= 25) finish(false, 'timeout');
      else updateStallCountdown(dt);
    }
    celebration.forEach(p => { p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 240*dt; p.life -= dt; });
    celebration = celebration.filter(p => p.life > 0);
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  }

  function drawBackground() {
    const background = level().background;
    if (background?.type === 'image' && background.image) {
      let image = backgroundImageCache.get(background.image);
      if (!image) {
        image = new Image();
        image.onload = draw;
        image.src = background.image;
        backgroundImageCache.set(background.image, image);
      }
      if (image.complete && image.naturalWidth) {
        ctx.drawImage(image, 0, 0, 1100, 620);
        drawGridAndRoof();
        return;
      }
    }
    const sky = ctx.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, '#a8d9dd'); sky.addColorStop(.68, '#d9ebc7'); sky.addColorStop(1, '#8fc071');
    ctx.fillStyle = sky; ctx.fillRect(0,0,1100,620);
    ctx.fillStyle = 'rgba(255,249,225,.7)';
    for (const cloud of [[150,100,1],[520,74,.75],[880,135,1.15]]) {
      ctx.beginPath();
      ctx.arc(cloud[0],cloud[1],30*cloud[2],0,Math.PI*2); ctx.arc(cloud[0]+35*cloud[2],cloud[1]-12,42*cloud[2],0,Math.PI*2); ctx.arc(cloud[0]+78*cloud[2],cloud[1],28*cloud[2],0,Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = '#76aa64';
    ctx.beginPath(); ctx.moveTo(0,470); ctx.quadraticCurveTo(180,360,350,470); ctx.quadraticCurveTo(540,340,720,470); ctx.quadraticCurveTo(920,345,1100,455); ctx.lineTo(1100,620); ctx.lineTo(0,620); ctx.fill();
    ctx.fillStyle = '#426f4d'; ctx.fillRect(0,560,1100,60);
    ctx.fillStyle = '#5b8e55';
    for (let x=0; x<1100; x+=22) { ctx.beginPath(); ctx.moveTo(x,560); ctx.lineTo(x+8,548-(x%3)*3); ctx.lineTo(x+12,560); ctx.fill(); }
    drawGridAndRoof();
  }

  function drawGridAndRoof() {
    ctx.strokeStyle = 'rgba(27,69,62,.12)'; ctx.lineWidth = 1;
    for (let x=25; x<1100; x+=50) { ctx.beginPath(); ctx.moveTo(x,80); ctx.lineTo(x,540); ctx.stroke(); }
    for (let y=90; y<540; y+=50) { ctx.beginPath(); ctx.moveTo(20,y); ctx.lineTo(1080,y); ctx.stroke(); }

    // A visible frame makes the playfield boundaries unambiguous. The top
    // rail is also a physical surface, so ambitious spheres stay in play.
    const roofGradient = ctx.createLinearGradient(0, 8, 0, 35);
    roofGradient.addColorStop(0, '#173f3b');
    roofGradient.addColorStop(.55, '#315f55');
    roofGradient.addColorStop(1, '#153a36');
    ctx.fillStyle = roofGradient;
    ctx.fillRect(0, 8, 1100, 27);
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillRect(0, 9, 1100, 3);
    ctx.fillStyle = '#f3ca52';
    for (let x = 34; x < 1100; x += 86) {
      ctx.beginPath(); ctx.arc(x, 21, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawLauncher() {
    const launcher = level().launcher;
    ctx.save(); ctx.translate(launcher.x - 16, launcher.y + 33);
    ctx.fillStyle = '#713e27'; roundedRect(-28,-18,55,72,12);
    ctx.fillStyle = '#f3ca52'; roundedRect(-18,-8,35,50,8);
    ctx.strokeStyle = '#513121'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(0,-4); ctx.lineTo(18,-50); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#173b3a'; ctx.font = '700 12px system-ui'; ctx.fillText('DROP-OFF', launcher.x - 49, launcher.y + 112);
  }

  function drawGoal() {
    const goal = level().goal;
    const radius = goal.radius || 34;
    ctx.strokeStyle = '#173b3a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(goal.x,goal.y,radius,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#f4e6c1'; ctx.beginPath(); ctx.arc(goal.x,goal.y,25,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#173b3a'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('GOAL',goal.x,goal.y+4); ctx.textAlign='left';
  }

  function drawFixedObject(object) {
    if (object.type === 'crate') {
      const left = object.x - object.width / 2, top = object.y - object.height / 2;
      ctx.save();
      ctx.fillStyle = '#9b6538'; ctx.strokeStyle = '#543b28'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.roundRect(left, top, object.width, object.height, 5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#d6a260'; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(left + 10, top + 10); ctx.lineTo(left + object.width - 10, top + object.height - 10);
      ctx.moveTo(left + object.width - 10, top + 10); ctx.lineTo(left + 10, top + object.height - 10);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,231,174,.28)'; ctx.fillRect(left + 7, top + 7, object.width - 14, 5);
      ctx.restore();
    }
    if (object.type === 'block') {
      const left = object.x - object.width / 2, top = object.y - object.height / 2;
      ctx.save();
      ctx.fillStyle = object.color || '#4f8f45';
      ctx.strokeStyle = '#255c39'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.roundRect(left, top, object.width, object.height, 10); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(222,245,190,.38)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(left + 16, top + 20); ctx.lineTo(left + object.width - 16, top + 20); ctx.stroke();
      ctx.fillStyle = 'rgba(20,73,42,.24)';
      for (let y = top + 42; y < top + object.height - 10; y += 28) {
        for (let x = left + 24; x < left + object.width - 10; x += 34) {
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    if (object.type === 'tube') {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      ctx.beginPath();
      object.points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = '#1f693a'; ctx.lineWidth = object.width + 18; ctx.stroke();
      ctx.strokeStyle = object.color || '#39a852'; ctx.lineWidth = object.width + 8; ctx.stroke();
      ctx.strokeStyle = '#d6eee0'; ctx.lineWidth = object.width - 18; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.restore();
    }
  }

  function drawPiece(piece) {
    if (piece.type === 'pipe') {
      const pipe = pipeGeometry(piece);
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      ctx.beginPath();
      pipe.points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      if (piece.tired) ctx.globalAlpha = .25;
      ctx.shadowColor = 'rgba(16,48,41,.32)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 5;
      if (piece.id === selectedId) {
        ctx.strokeStyle = '#fff7d0'; ctx.lineWidth = 88; ctx.stroke();
      }
      ctx.strokeStyle = '#205d38'; ctx.lineWidth = 82; ctx.stroke();
      ctx.strokeStyle = '#43a957'; ctx.lineWidth = 74; ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#d6eee0'; ctx.lineWidth = 54; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.46)'; ctx.lineWidth = 4; ctx.stroke();
      const deflector = pipeWalls(piece)[0];
      ctx.beginPath(); ctx.moveTo(deflector[1].x, deflector[1].y); ctx.lineTo(deflector[2].x, deflector[2].y);
      ctx.strokeStyle = '#43a957'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
      return;
    }
    const s = segment(piece);
    ctx.save();
    if (piece.tired) ctx.globalAlpha = .25;
    ctx.lineCap = 'round';
    ctx.strokeStyle = piece.id === selectedId ? '#fff7d0' : piece.type === 'spring' ? '#e4a03c' : '#244f48';
    ctx.lineWidth = piece.type === 'spring' ? 20 : 15;
    ctx.shadowColor = 'rgba(16,48,41,.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
    if (piece.type === 'spring') {
      const angle = piece.angle, len = pieceLength(piece), count = 8;
      ctx.beginPath();
      for (let i=0;i<=count;i++) {
        const t=i/count-.5; const along=t*len; const across=(i%2?1:-1)*9;
        const x=piece.x+Math.cos(angle)*along-Math.sin(angle)*across;
        const y=piece.y+Math.sin(angle)*along+Math.cos(angle)*across;
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }
      ctx.stroke();
    } else { ctx.beginPath(); ctx.moveTo(s.ax,s.ay); ctx.lineTo(s.bx,s.by); ctx.stroke(); }
    ctx.shadowColor='transparent';
    ctx.strokeStyle = piece.type === 'spring' ? '#f9d772' : '#7ca08d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.ax,s.ay); ctx.lineTo(s.bx,s.by); ctx.stroke();
    if (piece.hits > 4) { ctx.fillStyle='#b64d37'; ctx.beginPath(); ctx.arc(piece.x,piece.y,5+piece.hits,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }

  function drawCollectibles() {
    ctx.font = '27px serif'; ctx.textAlign = 'center';
    for (const item of carrots) if (!item.got) ctx.fillText('🥕', item.x, item.y);
    if (hedgehog && !hedgehog.got) { ctx.font='29px serif'; ctx.fillText('🦔', hedgehog.x, hedgehog.y); ctx.strokeStyle='rgba(243,202,82,.55)'; ctx.beginPath(); ctx.arc(hedgehog.x,hedgehog.y-9,24,0,Math.PI*2); ctx.stroke(); }
    ctx.textAlign='left';
  }

  function drawBall() {
    if (!ball) return;
    for (const p of ball.trail) { ctx.fillStyle = `rgba(255,248,215,${Math.max(0,p.life)*.22})`; ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2); ctx.fill(); }
    ctx.save(); ctx.translate(ball.x,ball.y);
    ctx.fillStyle='#fff4d4'; ctx.shadowColor='rgba(20,54,48,.35)'; ctx.shadowBlur=12; ctx.beginPath(); ctx.arc(0,0,ball.radius,0,Math.PI*2); ctx.fill();
    ctx.shadowColor='transparent'; ctx.strokeStyle=mode==='hare'?'#d96f2f':'#6f923d'; ctx.lineWidth=5; ctx.stroke();
    ctx.font='21px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(mode==='hare'?'🐇':'🐢',0,1); ctx.restore();
  }

  function draw() {
    drawBackground(); drawLauncher(); drawGoal(); (level().fixedObjects || []).forEach(drawFixedObject); drawCollectibles(); pieces().forEach(drawPiece); drawBall();
    for (const p of celebration) { ctx.globalAlpha=Math.max(0,p.life/1.5); ctx.fillStyle=p.color; ctx.fillRect(p.x,p.y,7,7); } ctx.globalAlpha=1;
  }

  function newLayoutId() {
    return crypto.randomUUID?.() || `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function makeLayout(name, id = newLayoutId()) {
    const now = new Date().toISOString();
    const snapshot = courseSnapshot();
    return {
      id,
      name,
      levelId: snapshot.levelId,
      levelRevision: snapshot.levelRevision,
      track: snapshot.track,
      physicsVersion: snapshot.physicsVersion,
      pieces: snapshot.pieces,
      createdAt: now,
      updatedAt: now
    };
  }

  function layoutButton(label, action, id, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.id = id;
    if (className) button.className = className;
    return button;
  }

  async function renderLayouts() {
    if (!storageReady) return;
    savedLayouts = await storage.listLayouts();
    layoutCountEl.textContent = `${savedLayouts.length} layout${savedLayouts.length === 1 ? '' : 's'}`;
    layoutList.replaceChildren();
    if (!savedLayouts.length) {
      const empty = document.createElement('p');
      empty.className = 'layout-empty';
      empty.textContent = 'No named layouts yet. Your current course is still recovered automatically.';
      layoutList.append(empty);
      return;
    }
    for (const layout of savedLayouts) {
      const row = document.createElement('article');
      row.className = 'layout-row';
      const details = document.createElement('div');
      details.className = 'layout-meta';
      const badge = document.createElement('span');
      badge.className = 'track-badge';
      badge.textContent = validTrack(layout.track) === 'hare' ? 'Hare' : 'Tortoise';
      const title = document.createElement('strong');
      title.textContent = layout.name;
      const date = document.createElement('small');
      const parsedDate = new Date(layout.updatedAt);
      const savedLevel = level(layout.levelId === 'training-meadow' ? 'green-1' : layout.levelId);
      date.textContent = `${savedLevel.name} · ${Number.isNaN(parsedDate.getTime()) ? 'Saved locally' : `Updated ${parsedDate.toLocaleDateString()}`}`;
      details.append(badge, title, date);
      const actions = document.createElement('div');
      actions.className = 'layout-actions';
      actions.append(
        layoutButton('Load', 'load', layout.id, 'load-layout'),
        layoutButton('Rename', 'rename', layout.id),
        layoutButton('Duplicate', 'duplicate', layout.id),
        layoutButton('Delete', 'delete', layout.id, 'delete-layout')
      );
      row.append(details, actions);
      layoutList.append(row);
    }
  }

  function loadLayout(layout) {
    const track = validTrack(layout.track);
    const levelId = layout.levelId === 'training-meadow' ? 'green-1' : layout.levelId;
    if (!levels.some(entry => entry.id === levelId)) throw new Error('This layout belongs to an unknown level.');
    const cleanPieces = sanitisePieces(layout.pieces, levelId, track);
    if (!cleanPieces) throw new Error('This layout is not valid.');
    running = false; ball = null; simulationAccumulator = 0;
    launchButton.disabled = false; clockEl.textContent = '0.00s';
    updateClockEffect();
    courses[levelId][track] = cleanPieces;
    lastLevelByTrack[track] = levelId;
    activateMode(track, false);
    if (!selectLevel(levelId, false)) throw new Error('Beat par on the previous level before loading this layout.');
    scheduleDraftSave(track, levelId);
    layoutDialog.close();
    setMessage('Layout loaded', `${layout.name} is ready on the ${track === 'hare' ? 'Hare' : 'Tortoise'} trail.`);
  }

  document.getElementById('layouts').addEventListener('click', async () => {
    if (!storageReady) {
      setMessage('Local saves unavailable', 'This browser could not open its save database.');
      return;
    }
    await storage.requestPersistence().catch(() => false);
    await renderLayouts();
    layoutDialog.showModal();
    layoutNameInput.focus();
  });
  document.getElementById('close-layouts').addEventListener('click', () => layoutDialog.close());
  layoutDialog.addEventListener('click', event => {
    if (event.target === layoutDialog) layoutDialog.close();
  });

  saveLayoutForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = layoutNameInput.value.trim();
    if (!name || !storageReady) return;
    await storage.putLayout(makeLayout(name));
    layoutNameInput.value = '';
    setSaveStatus('Named layout saved');
    await renderLayouts();
  });

  layoutList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button || !storageReady) return;
    const layout = savedLayouts.find(item => item.id === button.dataset.id);
    if (!layout) return;
    if (button.dataset.action === 'load') {
      loadLayout(layout);
      return;
    }
    if (button.dataset.action === 'rename') {
      const name = prompt('Rename this layout', layout.name)?.trim();
      if (!name) return;
      await storage.putLayout({ ...layout, name: name.slice(0, 42), updatedAt: new Date().toISOString() });
    } else if (button.dataset.action === 'duplicate') {
      const now = new Date().toISOString();
      await storage.putLayout({ ...clone(layout), id: newLayoutId(), name: `${layout.name} copy`.slice(0, 42), createdAt: now, updatedAt: now });
    } else if (button.dataset.action === 'delete') {
      if (!confirm(`Delete “${layout.name}” from this device?`)) return;
      await storage.deleteLayout(layout.id);
    }
    await renderLayouts();
  });

  async function restoreLocalData() {
    if (!storage) {
      setSaveStatus('Local save unavailable');
      return;
    }
    try {
      await storage.ready();
      const draftRequests = levels.flatMap(entry => ['hare', 'tortoise'].map(track => storage.getState(`draft:${entry.id}:${track}`)));
      const [oldHareDraft, oldTortoiseDraft, savedProgress, oldProgress, lastTrack, lastHareLevel, lastTortoiseLevel, ...drafts] = await Promise.all([
        storage.getState('draft:hare'),
        storage.getState('draft:tortoise'),
        storage.getState('progress:v2'),
        storage.getState('progress:training-meadow'),
        storage.getState('lastTrack'),
        storage.getState('lastLevel:hare'),
        storage.getState('lastLevel:tortoise'),
        ...draftRequests
      ]);
      let draftIndex = 0;
      for (const entry of levels) {
        for (const track of ['hare', 'tortoise']) {
          const draft = drafts[draftIndex++];
          const cleanPieces = draft?.levelId === entry.id ? sanitisePieces(draft.pieces, entry.id, track) : null;
          if (cleanPieces) courses[entry.id][track] = cleanPieces;
        }
      }
      for (const [track, oldDraft] of [['hare', oldHareDraft], ['tortoise', oldTortoiseDraft]]) {
        const cleanPieces = sanitisePieces(oldDraft?.pieces, 'green-1', track);
        if (cleanPieces && !drafts[['hare', 'tortoise'].indexOf(track)]) courses['green-1'][track] = cleanPieces;
      }
      for (const entry of levels) {
        for (const track of ['hare', 'tortoise']) {
          const saved = savedProgress?.[entry.id]?.[track];
          const target = progress[entry.id][track];
          for (const category of ['overall', 'golden']) {
            const value = saved?.[category];
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) target[category] = value;
          }
          target.stars = Math.max(0, Math.min(3, Number(saved?.stars) || 0));
          target.parBeaten = Boolean(saved?.parBeaten);
        }
      }
      for (const track of ['hare', 'tortoise']) {
        const target = progress['green-1'][track];
        for (const category of ['overall', 'golden']) {
          const value = oldProgress?.[track]?.[category];
          if (target[category] == null && typeof value === 'number' && Number.isFinite(value) && value >= 0) target[category] = value;
        }
      }
      if (levels.some(entry => entry.id === lastHareLevel)) lastLevelByTrack.hare = lastHareLevel;
      if (levels.some(entry => entry.id === lastTortoiseLevel)) lastLevelByTrack.tortoise = lastTortoiseLevel;
      storageReady = true;
      activateMode(lastTrack, false);
      setSaveStatus('Saved on this device');
    } catch (_) {
      storageReady = false;
      setSaveStatus('Local save unavailable');
    }
  }

  function frame(now) {
    const elapsed = Math.min(.1, (now - lastFrame) / 1000);
    lastFrame = now;
    simulationAccumulator += elapsed;
    while (simulationAccumulator >= FIXED_STEP) {
      update(FIXED_STEP);
      simulationAccumulator -= FIXED_STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }

  document.getElementById('world-name').textContent = world.name;
  document.getElementById('world-subtitle').textContent = world.subtitle;
  resetCollectibles(); updateTools(); updateBest(); renderLevelNav(); restoreLocalData(); requestAnimationFrame(frame);
})();
