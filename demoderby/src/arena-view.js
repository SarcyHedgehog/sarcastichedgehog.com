import { CAR, COLORS, WORLD } from "./constants.js";

export class ArenaView {
  constructor(canvas, audio) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.audio = audio;
    this.previous = null; this.current = null; this.receivedAt = 0; this.effects = []; this.trails = [];
    this.images = []; this.localActor = null; this.followActor = null; this.shake = 0; this.lastCountdown = null; this.lastPhase = null;
    this.loadCars(); this.resize(); window.addEventListener("resize", () => this.resize()); requestAnimationFrame(time => this.frame(time));
  }
  async loadCars() { const originals = await Promise.all(Array.from({ length: 8 }, (_, i) => loadImage(`assets/${i + 1}car.png`))); this.images = originals.map((image,index) => recolorCar(image,COLORS[index])); }
  setLocalActor(actor) { this.localActor = String(actor); }
  setFollowActor(actor) { this.followActor = actor ? String(actor) : null; }
  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2); const box = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, box.width * ratio); this.canvas.height = Math.max(1, box.height * ratio); this.pixelRatio = ratio;
  }
  update(snapshot) {
    if (!snapshot) return; const old = this.current; this.previous = old || snapshot; this.current = snapshot; this.receivedAt = performance.now();
    for (const event of snapshot.events || []) this.consumeEvent(event);
    const countdown = snapshot.phase === "countdown" ? Math.ceil(snapshot.phaseTime) : snapshot.phase === "playing" && this.lastPhase === "countdown" ? 0 : null;
    if (countdown !== null && countdown !== this.lastCountdown) { if (countdown > 0) this.audio.countdown(countdown); this.lastCountdown = countdown; }
    if (snapshot.phase === "results" && this.lastPhase !== "results") this.audio.fanfare(); this.lastPhase = snapshot.phase;
  }
  consumeEvent(event) {
    if (event.type === "collision") { this.spark(event.x, event.y, event.power); this.audio.hit(event.power); if ([event.a,event.b].includes(this.localActor) || [event.a,event.b].includes(this.followActor)) this.shake = Math.max(this.shake, 1 + event.power * 4); }
    if (event.type === "wall") { this.spark(event.x, event.y, event.power * 0.5); this.audio.wall(event.power); }
    if (event.type === "wreck") { const car = this.current?.cars?.[event.id]; if (car) this.smokeBurst(car.x, car.y); this.audio.wreck(); if (event.id === this.localActor || event.id === this.followActor) this.shake = 6; }
    if (event.type === "start") this.audio.startRace();
    if (event.type === "remove") this.audio.disappear();
  }
  spark(x, y, power = 0.5) { for (let i = 0; i < 8 + power * 18; i += 1) this.effects.push({ kind: "spark", x, y, vx: (Math.random() - 0.5) * 310 * power, vy: (Math.random() - 0.5) * 310 * power, age: 0, life: 0.25 + Math.random() * 0.45 }); }
  smokeBurst(x, y) { for (let i = 0; i < 24; i += 1) this.effects.push({ kind: "smoke", x, y, vx: (Math.random() - 0.5) * 70, vy: -25 - Math.random() * 60, age: 0, life: 1.5 + Math.random() }); }
  frame(time) { this.render(time); requestAnimationFrame(next => this.frame(next)); }
  render(time) {
    const ctx = this.ctx, width = this.canvas.width / this.pixelRatio, height = this.canvas.height / this.pixelRatio;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0); ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / WORLD.width, height / WORLD.height), ox = (width - WORLD.width * scale) / 2, oy = (height - WORLD.height * scale) / 2;
    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0, shakeY = this.shake ? (Math.random() - 0.5) * this.shake : 0; this.shake *= 0.88;
    ctx.save(); ctx.translate(ox + shakeX, oy + shakeY); ctx.scale(scale, scale); this.drawArena(ctx, time);
    if (this.current) { const alpha = Math.min(1, (performance.now() - this.receivedAt) / 80); for (const id of this.current.order || []) { const current = this.current.cars[id]; if (!current?.racing || current.visible === false) continue; const previous = this.previous?.cars?.[id] || current; this.drawCar(ctx, interpolateCar(previous, current, alpha), id, time); } }
    this.drawEffects(ctx, 1 / 60); ctx.restore();
  }
  drawArena(ctx, time) {
    const cx = WORLD.width / 2, cy = WORLD.height / 2, outerX = cx - WORLD.padding, outerY = cy - WORLD.padding, innerX = cx - WORLD.infield, innerY = cy - WORLD.infield * 0.66;
    const background = ctx.createRadialGradient(cx, cy, 80, cx, cy, 760); background.addColorStop(0, "#21252a"); background.addColorStop(1, "#07090b"); ctx.fillStyle = background; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.save(); ellipsePath(ctx, cx, cy, outerX, outerY); ctx.fillStyle = "#5c4b3d"; ctx.fill(); ctx.clip();
    this.asphalt ||= asphaltPattern(ctx); ctx.fillStyle = this.asphalt; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.globalAlpha = 0.22; ctx.strokeStyle = "#08090a"; ctx.lineWidth = 5; for (let i = 0; i < 34; i += 1) { ctx.beginPath(); ctx.ellipse(cx, cy, innerX + 30 + (i % 7) * 30, innerY + 18 + (i % 7) * 20, i * 0.17, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
    ellipsePath(ctx, cx, cy, innerX, innerY); ctx.fillStyle = "#202920"; ctx.fill(); ctx.strokeStyle = "#c7ae69"; ctx.lineWidth = 12; ctx.stroke();
    ctx.save(); ellipsePath(ctx, cx, cy, innerX - 10, innerY - 10); ctx.clip(); const grass = ctx.createLinearGradient(0, cy - innerY, 0, cy + innerY); grass.addColorStop(0, "#263526"); grass.addColorStop(1, "#111a13"); ctx.fillStyle = grass; ctx.fillRect(cx - innerX, cy - innerY, innerX * 2, innerY * 2);
    ctx.globalAlpha = 0.11; ctx.strokeStyle = "#b8d6a9"; ctx.lineWidth = 2; for (let y = cy - innerY; y < cy + innerY; y += 18) { ctx.beginPath(); ctx.moveTo(cx - innerX, y); ctx.lineTo(cx + innerX, y); ctx.stroke(); } ctx.restore();
    ctx.strokeStyle = "#e5d8a9"; ctx.lineWidth = 4; ctx.setLineDash([30, 25]); ctx.beginPath(); ctx.ellipse(cx, cy, (outerX + innerX) / 2, (outerY + innerY) / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    this.drawBarrier(ctx, cx, cy, outerX, outerY); this.drawInfield(ctx, time); this.drawFloodlights(ctx, time);
  }
  drawBarrier(ctx, cx, cy, rx, ry) { ctx.lineWidth = 18; ctx.strokeStyle = "#282c30"; ellipsePath(ctx, cx, cy, rx, ry); ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = "#e94a35"; ctx.setLineDash([38, 38]); ellipsePath(ctx, cx, cy, rx, ry); ctx.stroke(); ctx.setLineDash([]); }
  drawInfield(ctx, time) {
    const cx = WORLD.width / 2, cy = WORLD.height / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.04); ctx.fillStyle = "rgba(0,0,0,.45)"; roundRect(ctx, -184, -78, 368, 156, 18); ctx.fill();
    ctx.fillStyle = "#e8d56e"; ctx.font = "900 46px system-ui"; ctx.textAlign = "center"; ctx.fillText("DEMO DERBY", 0, -8); ctx.fillStyle = "#e34a34"; ctx.font = "800 18px system-ui"; ctx.fillText("LAST CAR MOVING WINS", 0, 30);
    ctx.restore();
  }
  drawFloodlights(ctx, time) { ctx.save(); ctx.globalCompositeOperation = "screen"; const pulse = 0.11 + Math.sin(time / 600) * 0.015; for (const [x, y] of [[80,80],[1120,80],[80,640],[1120,640]]) { const glow = ctx.createRadialGradient(x,y,0,x,y,170); glow.addColorStop(0, `rgba(255,239,180,${pulse * 2.3})`); glow.addColorStop(1,"rgba(255,239,180,0)"); ctx.fillStyle=glow;ctx.fillRect(x-170,y-170,340,340); } ctx.restore(); }
  drawCar(ctx, car, id, time) {
    ctx.save(); ctx.globalAlpha = car.destroyed ? Math.max(0, Math.min(1, (car.wreckTimer ?? 5) / 5)) : 1;
    const image = this.images[car.visualIndex % 8], local = id === this.localActor, followed = id === this.followActor;
    if (Math.abs(car.speed) > 80 && !car.destroyed && Math.random() < 0.18) this.trails.push({ x: car.x - Math.cos(car.angle) * 30, y: car.y - Math.sin(car.angle) * 30, age: 0, life: 1.6 });
    ctx.save(); ctx.translate(car.x + 5, car.y + 7); ctx.rotate(car.angle + Math.PI / 2); ctx.scale(1, 0.7); ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.beginPath(); ctx.ellipse(0, 0, 29, 42, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle + Math.PI / 2);
    if (local || followed) {
      ctx.strokeStyle = local ? "rgba(255,244,163,.58)" : "rgba(75,232,255,.5)"; ctx.lineWidth = 2; const x=24,y=38,l=9;
      ctx.beginPath();ctx.moveTo(-x+l,-y);ctx.lineTo(-x,-y);ctx.lineTo(-x,-y+l);ctx.moveTo(x-l,-y);ctx.lineTo(x,-y);ctx.lineTo(x,-y+l);ctx.moveTo(-x+l,y);ctx.lineTo(-x,y);ctx.lineTo(-x,y-l);ctx.moveTo(x-l,y);ctx.lineTo(x,y);ctx.lineTo(x,y-l);ctx.stroke();
    }
    if (image) {
      const drawX = -image.width * 0.35, drawY = -image.height * 0.35, drawWidth = image.width * 0.7, drawHeight = image.height * 0.7;
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    } else { ctx.fillStyle = car.color; roundRect(ctx, -20, -34, 40, 68, 8); ctx.fill(); }
    ctx.fillStyle = "#fff3a4"; ctx.shadowColor = "#fff3a4"; ctx.shadowBlur = 8; ctx.fillRect(-15, -31, 9, 5); ctx.fillRect(6, -31, 9, 5); ctx.shadowBlur = 0;
    ctx.fillStyle = "#151719"; ctx.fillRect(-15, 28, 30, 5);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(-5,-17); ctx.lineTo(5,-17); ctx.closePath(); ctx.fill();
    if (car.damage > 20) {
      const scars = Math.min(5, Math.ceil(car.damage / 20)); ctx.strokeStyle = `rgba(245,245,235,${0.22 + car.damage / 260})`; ctx.lineWidth = 1.5;
      for (let i = 0; i < scars; i += 1) { const offset = -17 + i * 8; ctx.beginPath(); ctx.moveTo(-13, offset); ctx.lineTo(12, offset + 8); ctx.moveTo(-10, offset + 7); ctx.lineTo(9, offset - 2); ctx.stroke(); }
    }
    if (car.destroyed) { ctx.strokeStyle = "#ff9c43"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16,-19);ctx.lineTo(16,19);ctx.moveTo(16,-19);ctx.lineTo(-16,19);ctx.stroke(); }
    ctx.restore();
    if (car.damage >= 55) { const amount = car.destroyed ? 4 : Math.min(3, Math.ceil((car.damage - 45) / 20)); for (let i = 0; i < amount; i += 1) { const sx=car.x+(Math.random()-.5)*14, sy=car.y-25-Math.random()*24, radius=8+Math.random()*12; const smoke=ctx.createRadialGradient(sx,sy,0,sx,sy,radius); smoke.addColorStop(0,"rgba(125,125,125,.2)");smoke.addColorStop(1,"rgba(90,90,90,0)");ctx.fillStyle=smoke;ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.fill(); } }
    ctx.font = "700 16px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,.8)"; ctx.fillText(car.name, car.x + 1, car.y - 49 + 1); ctx.fillStyle = "white"; ctx.fillText(car.name, car.x, car.y - 49); ctx.restore();
  }
  drawEffects(ctx, dt) {
    for (const trail of this.trails) { trail.age += dt; ctx.fillStyle = `rgba(15,15,15,${0.28 * (1 - trail.age / trail.life)})`; ctx.beginPath(); ctx.arc(trail.x, trail.y, 5, 0, Math.PI * 2); ctx.fill(); } this.trails = this.trails.filter(item => item.age < item.life);
    for (const fx of this.effects) { fx.age += dt; fx.x += fx.vx * dt; fx.y += fx.vy * dt; const fade = 1 - fx.age / fx.life; if (fx.kind === "spark") { ctx.strokeStyle = `rgba(255,204,75,${fade})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx.x,fx.y); ctx.lineTo(fx.x-fx.vx*.025,fx.y-fx.vy*.025);ctx.stroke(); } else { ctx.fillStyle=`rgba(95,95,95,${fade*.3})`;ctx.beginPath();ctx.arc(fx.x,fx.y,8+fx.age*18,0,Math.PI*2);ctx.fill(); } } this.effects = this.effects.filter(item => item.age < item.life);
  }
}
function interpolateCar(a, b, alpha) { const angleDelta = Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle)); return { ...b, x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha, angle: a.angle + angleDelta * alpha, speed: a.speed + (b.speed - a.speed) * alpha }; }
function ellipsePath(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
function roundRect(ctx, x, y, width, height, radius) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }
function loadImage(src) { return new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src; }); }
function recolorCar(image, color) {
  if (!image) return null; const canvas=document.createElement("canvas");canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;const target=hexToRgb(color);
  for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(data[i+3]&&r>85&&r>g*1.28&&r>b*1.18){const shade=Math.max(.2,Math.min(1.15,(r*.78+g*.14+b*.08)/205));data[i]=Math.min(255,target.r*shade);data[i+1]=Math.min(255,target.g*shade);data[i+2]=Math.min(255,target.b*shade);}}
  ctx.putImageData(pixels,0,0);return canvas;
}
function hexToRgb(hex){const value=parseInt(hex.slice(1),16);return{r:(value>>16)&255,g:(value>>8)&255,b:value&255};}
function asphaltPattern(ctx) { const tile = document.createElement("canvas"); tile.width = tile.height = 96; const c = tile.getContext("2d"); c.fillStyle="#35383a";c.fillRect(0,0,96,96);for(let i=0;i<260;i+=1){const shade=40+Math.random()*35;c.fillStyle=`rgba(${shade},${shade},${shade},.2)`;c.fillRect(Math.random()*96,Math.random()*96,Math.random()*2+1,Math.random()*2+1);}return ctx.createPattern(tile,"repeat"); }
