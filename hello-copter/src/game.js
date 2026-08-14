import { Simulation } from './simulation.js';
import { SharedSkies } from './shared-skies.js';
import { WORLD_HEIGHT, worldToScreen, wrappedDelta, wrap } from './world.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#game');
const ctx = canvas.getContext('2d');
const sim = new Simulation();

const imageSources = {
  chopper: 'assets/images/chopper.png',
  rescuedBird: 'assets/images/bird.png',
  sky: 'assets/images/background/sky.png',
  treesFar: 'assets/images/background/trees-far.png',
  treesMid: 'assets/images/background/trees-mid.png',
  treesNear: 'assets/images/background/trees-near.png',
  ground: 'assets/images/background/ground.png',
  enemyAtlas: 'assets/images/enemies/bird-dog-sun.png',
  witchPig: 'assets/images/enemies/witch-pig.png',
  bombFish: 'assets/images/enemies/bomb-fish.png',
  monkeyMouth: 'assets/images/enemies/monkey-mouth.png',
  repair: 'assets/images/powerups/repair.png',
  shield: 'assets/images/powerups/shield.png',
  slowdown: 'assets/images/powerups/slowdown.png',
  chopperShield: 'assets/images/powerups/chopper-shield.png',
};
const images = Object.fromEntries(Object.entries(imageSources).map(([name, src]) => {
  const image = new Image();
  image.src = src;
  return [name, image];
}));

const audio = {
  music: new Audio('assets/audio/music.mp3'),
  impact: new Audio('assets/audio/impact.mp3'),
  rescue: new Audio('assets/audio/rescue.mp3'),
  shield: new Audio('assets/audio/powerups/shield.mp3'),
  repair: new Audio('assets/audio/powerups/repair.mp3'),
  slowdown: new Audio('assets/audio/powerups/slowdown.mp3'),
};
audio.music.loop = true;
audio.music.volume = .22;
for (const name of ['impact', 'rescue', 'shield', 'repair', 'slowdown']) audio[name].volume = name === 'impact' ? .65 : .55;

const ui = {
  lobby: $('#lobby'), help: $('#help'), hud: $('#hud'), status: $('#status'),
  pausePanel: $('#pause-panel'), results: $('#results'), touch: $('#touch-controls'),
  message: $('#message'),
};
const input = {lift: false, left: false, right: false};
let running = false, paused = false, previous = performance.now(), accumulator = 0, messageTimer = 0;
let flightMode = 'solo', skies = null, pilotCount = 1;
const camera = {x: 0, y: WORLD_HEIGHT / 2};

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

function setControl(name, value) { input[name] = value; }
addEventListener('keydown', event => {
  if (['Space', 'ArrowUp'].includes(event.code)) { event.preventDefault(); setControl('lift', true); }
  if (['KeyA', 'ArrowLeft'].includes(event.code)) setControl('left', true);
  if (['KeyD', 'ArrowRight'].includes(event.code)) setControl('right', true);
  if (['Escape', 'KeyP'].includes(event.code) && running) togglePause();
});
addEventListener('keyup', event => {
  if (['Space', 'ArrowUp'].includes(event.code)) setControl('lift', false);
  if (['KeyA', 'ArrowLeft'].includes(event.code)) setControl('left', false);
  if (['KeyD', 'ArrowRight'].includes(event.code)) setControl('right', false);
});
canvas.addEventListener('pointerdown', () => running && !paused && setControl('lift', true));
addEventListener('pointerup', () => setControl('lift', false));
document.querySelectorAll('[data-control]').forEach(button => {
  const control = button.dataset.control;
  button.addEventListener('pointerdown', event => { event.stopPropagation(); setControl(control, true); });
  button.addEventListener('pointerup', () => setControl(control, false));
  button.addEventListener('pointercancel', () => setControl(control, false));
});

$('#how').onclick = () => { ui.lobby.classList.add('hidden'); ui.help.classList.remove('hidden'); };
$('#close-help').onclick = () => { ui.help.classList.add('hidden'); ui.lobby.classList.remove('hidden'); };
$('#launch').onclick = startGame;
$('#again').onclick = startGame;
$('#pause').onclick = togglePause;
$('#resume').onclick = togglePause;
$('#quit').onclick = toLobby;
$('#result-lobby').onclick = toLobby;
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
  flightMode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('selected', item === button));
  $('#room-field').classList.toggle('hidden', flightMode !== 'shared');
  $('#lobby-error').classList.add('hidden');
});

async function startGame() {
  const launch = $('#launch');
  const error = $('#lobby-error');
  error.classList.add('hidden');
  skies?.disconnect(); skies = null; pilotCount = 1;
  if (flightMode === 'shared') {
    launch.disabled = true; launch.textContent = 'CONTACTING TOWER…';
    try {
      skies = new SharedSkies(window.APP_CONFIG || {});
      skies.addEventListener('presence', event => { pilotCount = event.detail; });
      skies.addEventListener('error', event => showMessage(event.detail, 'bad'));
      await skies.connect({ roomCode: $('#room').value, name: $('#name').value });
    } catch (problem) {
      skies?.disconnect(); skies = null;
      error.textContent = problem.message; error.classList.remove('hidden');
      launch.disabled = false; launch.textContent = 'LAUNCH'; return;
    }
    launch.disabled = false; launch.textContent = 'LAUNCH';
  }
  sim.start($('#name').value.trim() || 'Pilot');
  running = true;
  paused = false;
  camera.x = sim.player.x;
  camera.y = sim.player.y;
  ui.lobby.classList.add('hidden');
  ui.results.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.status.classList.remove('hidden');
  ui.touch.classList.remove('hidden');
  $('#network-status').classList.toggle('hidden', flightMode !== 'shared');
  previous = performance.now();
  accumulator = 0;
  audio.music.currentTime = 0;
  audio.music.play().catch(() => {});
}

function toLobby() {
  running = false;
  paused = false;
  audio.music.pause();
  skies?.disconnect(); skies = null; pilotCount = 1;
  ui.pausePanel.classList.add('hidden');
  ui.results.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.status.classList.add('hidden');
  ui.touch.classList.add('hidden');
  ui.lobby.classList.remove('hidden');
}

function togglePause() {
  paused = !paused;
  ui.pausePanel.classList.toggle('hidden', !paused);
  input.lift = input.left = input.right = false;
}

function showMessage(text, mood, sound) {
  ui.message.textContent = text;
  ui.message.className = `message ${mood || ''}`;
  messageTimer = 1.65;
  if (sound) playSound(sound);
  else if (text.includes('RESCUED')) playSound('rescue');
  else if (mood === 'bad') playSound('impact');
}

function playSound(name) {
  const source = audio[name];
  if (!source) return;
  const sound = source.cloneNode();
  sound.volume = source.volume;
  sound.play().catch(() => {});
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - previous) / 1000);
  previous = now;
  if (running && !paused) {
    accumulator += dt;
    while (accumulator >= 1 / 60) { sim.update(1 / 60, input); accumulator -= 1 / 60; }
    skies?.publish(sim.player);
    for (const event of sim.drainEvents()) {
      if (event.type === 'message') showMessage(event.text, event.mood, event.sound);
      if (event.type === 'gameover') endGame();
    }
    const player = sim.player;
    camera.x = wrap(camera.x + wrappedDelta(camera.x, player.x) * Math.min(1, dt * 3.2));
    camera.y += (player.y - camera.y) * Math.min(1, dt * 2.2);
    updateHud();
  }
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) ui.message.classList.add('hidden');
  }
  render(now / 1000);
}
requestAnimationFrame(frame);

function updateHud() {
  const player = sim.player;
  $('#distance').textContent = String(Math.floor(sim.distance)).padStart(4, '0');
  $('#rescued').textContent = sim.rescued;
  $('#multiplier').textContent = `${sim.multiplier}×`;
  $('#score').textContent = String(Math.floor(sim.score)).padStart(6, '0');
  $('#lives').innerHTML = '<i class="life"></i>'.repeat(player.lives);
  $('#shield-meter span').style.width = `${Math.min(100, player.shield / 12.5 * 100)}%`;
  $('#shield-meter').style.opacity = player.shield > 0 ? 1 : .28;
  $('#direction').textContent = sim.slowdown > 0 ? `TIME DILATION ${Math.ceil(sim.slowdown)}s` : player.facing > 0 ? 'FLYING EAST' : 'FLYING WEST';
  $('#network-status').textContent = `SHARED SKIES · ${pilotCount} PILOT${pilotCount === 1 ? '' : 'S'}`;
}

function endGame() {
  running = false;
  audio.music.pause();
  skies?.disconnect(); skies = null; pilotCount = 1;
  ui.hud.classList.add('hidden');
  ui.status.classList.add('hidden');
  ui.touch.classList.add('hidden');
  $('#result-distance').textContent = Math.floor(sim.distance);
  $('#result-score').textContent = Math.floor(sim.score);
  $('#result-rescued').textContent = sim.rescued;
  $('#result-title').textContent = sim.rescued ? `${sim.rescued} safely rescued.` : 'The flock awaits.';
  setTimeout(() => ui.results.classList.remove('hidden'), 650);
}

function ready(image) { return image?.complete && image.naturalWidth; }

function render(time) {
  const width = innerWidth, height = innerHeight;
  drawSky(width, height);
  if (!sim.player) return;
  drawWorld(width, height, time);
}

function drawSky(width, height) {
  if (ready(images.sky)) {
    const scale = Math.max(width / images.sky.naturalWidth, height / images.sky.naturalHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (images.sky.naturalWidth - sourceWidth) / 2;
    const sourceY = (images.sky.naturalHeight - sourceHeight) / 2;
    ctx.drawImage(images.sky, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#31a5ed');
    gradient.addColorStop(1, '#f36dad');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawParallax(image, speed, groundY, scale, alpha = 1) {
  if (!ready(image)) return;
  const size = 256 * scale;
  const offset = -wrap(camera.x * speed, size);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let x = offset - size; x < innerWidth + size; x += size) ctx.drawImage(image, x, groundY - size, size, size);
  ctx.restore();
}

function drawGround(width, height, groundY) {
  ctx.fillStyle = '#397b4e';
  ctx.fillRect(0, groundY, width, height - groundY);
  if (ready(images.ground)) {
    const tileWidth = 68;
    const offset = -wrap(camera.x * .96, tileWidth);
    for (let x = offset - tileWidth; x < width + tileWidth; x += tileWidth) ctx.drawImage(images.ground, x, groundY - 7, tileWidth, 544);
  }
}

function drawWorld(width, height, time) {
  const groundY = height * .5 + (camera.y - 80);
  drawParallax(images.treesFar, .10, groundY + 40, 1.55, .72);
  drawParallax(images.treesMid, .24, groundY + 32, 1.25, .88);
  drawParallax(images.treesNear, .46, groundY + 25, 1.05, 1);
  drawGround(width, height, groundY);

  for (const entity of sim.entities) {
    if (!entity.alive || entity === sim.player) continue;
    const point = worldToScreen(entity, camera, {width, height});
    if (point.x < -220 || point.x > width + 220) continue;
    if (entity.type === 'scenery') drawScenery(entity, point);
    else if (entity.type === 'bird') drawBird(point, time, entity);
    else if (entity.type === 'powerup') drawPowerup(point, entity, time);
    else if (entity.type === 'enemy') drawEnemy(point, entity, time);
  }
  for (const remote of skies?.pilots() || []) drawRemotePlayer(worldToScreen(remote, camera, {width, height}), remote, time);
  drawPlayer(worldToScreen(sim.player, camera, {width, height}), sim.player, time);
  if (skies) drawRadar(width, height);
}

function drawRemotePlayer(point, entity, time) {
  if (point.x < -100 || point.x > innerWidth + 100) return;
  ctx.save();
  ctx.translate(point.x, point.y); ctx.scale(entity.facing, 1); ctx.rotate(entity.pitch * entity.facing);
  ctx.globalAlpha = .76; ctx.shadowBlur = 13; ctx.shadowColor = '#69ffe1';
  drawSheet(images.chopper, Math.floor(time * 9) % 8, 8, 128, 128, -56, -56, 112, 112);
  ctx.restore();
  ctx.save(); ctx.font = '800 10px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#e9fffa';
  ctx.fillText(entity.name || 'Pilot', point.x, point.y - 45); ctx.restore();
}

function drawRadar(width, height) {
  const pilots = skies.pilots(); if (!pilots.length) return;
  const radarWidth = Math.min(230, width * .34), left = width / 2 - radarWidth / 2, top = height - 28;
  ctx.save(); ctx.fillStyle = '#062333aa'; ctx.strokeStyle = '#ffffff35'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(left, top, radarWidth, 9, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(width / 2 - 1, top + 2, 2, 5);
  for (const pilot of pilots) {
    const dx = wrappedDelta(sim.player.x, pilot.x);
    const x = left + radarWidth / 2 + dx / 12000 * (radarWidth / 2);
    ctx.fillStyle = '#6fffd6'; ctx.beginPath(); ctx.arc(x, top + 4.5, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawScenery(entity, point) {
  const image = [images.treesFar, images.treesMid, images.treesNear][entity.variant % 3];
  if (!ready(image)) return;
  ctx.save();
  ctx.globalAlpha = .58;
  ctx.drawImage(image, point.x - 90, point.y - 170, 180, 180);
  ctx.restore();
}

function drawSheet(image, frame, columns, cellWidth, cellHeight, x, y, width, height) {
  if (!ready(image)) return false;
  const sx = (frame % columns) * cellWidth;
  const sy = Math.floor(frame / columns) * cellHeight;
  ctx.drawImage(image, sx, sy, cellWidth, cellHeight, x, y, width, height);
  return true;
}

function drawPlayer(point, entity, time) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.scale(entity.facing, 1);
  ctx.rotate(entity.pitch * entity.facing);
  if (entity.invulnerable > 0 && Math.floor(time * 10) % 2) ctx.globalAlpha = .35;
  if (entity.shield > 0) {
    const frame = Math.floor(time * 10) % 4;
    ctx.save();
    ctx.globalAlpha = entity.shield < 3 && Math.floor(time * 9) % 2 ? .35 : .88;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#36e9ff';
    drawSheet(images.chopperShield, frame, 2, 128, 128, -68, -68, 136, 136);
    ctx.restore();
  }
  if (!drawSheet(images.chopper, Math.floor(time * 9) % 8, 8, 128, 128, -64, -64, 128, 128)) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(0, 0, 34, 18, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawBird(point, time, entity) {
  ctx.save();
  ctx.translate(point.x, point.y);
  const frame = 3 + Math.floor(time * 10 + entity.phase) % 5;
  drawSheet(images.rescuedBird, frame, 8, 128, 128, -42, -42, 84, 84);
  ctx.restore();
}

function drawPowerup(point, entity, time) {
  const image = images[entity.kind];
  ctx.save();
  ctx.translate(point.x, point.y + Math.sin(time * 3 + entity.phase) * 5);
  const glow = entity.kind === 'shield' ? '#31dcff' : entity.kind === 'slowdown' ? '#7fff72' : '#ff5c78';
  ctx.shadowBlur = 20;
  ctx.shadowColor = glow;
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.beginPath(); ctx.arc(0, 0, 31, 0, Math.PI * 2); ctx.fill();
  if (ready(image)) ctx.drawImage(image, -27, -27, 54, 54);
  ctx.restore();
}

function drawEnemy(point, entity, time) {
  ctx.save();
  ctx.translate(point.x, point.y);
  const facing = entity.vx > 0 ? 1 : -1;
  ctx.scale(facing, entity.side === 'ceiling' ? -1 : 1);

  if (entity.kind === 'businessBird') {
    const frame = Math.floor(time * 11 + entity.phase) % 13;
    drawSheet(images.enemyAtlas, frame, 8, 128, 128, -48, -48, 96, 96);
  } else if (entity.kind === 'witchPig') {
    // The recovered sheet has thirteen painted cells; the last three are
    // transparent. Cycling all sixteen made the sprite visibly blink out.
    const frame = Math.floor(time * 10 + entity.phase) % 13;
    drawSheet(images.witchPig, frame, 4, 128, 128, -52, -52, 104, 104);
  } else if (entity.kind === 'bombFish') {
    // Six rows are populated in the 8x8 atlas. The remaining sixteen slots
    // are intentionally empty rather than animation frames.
    const frame = Math.floor(time * 12 + entity.phase) % 48;
    drawSheet(images.bombFish, frame, 8, 64, 64, -40, -40, 80, 80);
  } else if (entity.kind === 'monkeyMouth') {
    const frame = Math.floor(time * 8 + entity.phase) % 16;
    drawSheet(images.monkeyMouth, frame, 4, 512, 512, -116, -116, 232, 232);
  }
  ctx.restore();
}
