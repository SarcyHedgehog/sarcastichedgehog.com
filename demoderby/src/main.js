import { ArenaView } from "./arena-view.js";
import { AudioEngine } from "./audio-engine.js";
import { CAR, MAX_PLAYERS, MIN_PLAYERS } from "./constants.js";
import { PhotonRoom } from "./photon-room.js";
import { PracticeRoom } from "./practice-room.js";

const $ = selector => document.querySelector(selector);
const ui = { dialog: $("#join-dialog"), form: $("#join-form"), name: $("#driver-name"), code: $("#room-code"), error: $("#join-error"), connection: $("#connection"), invite: $("#invite"), install: $("#install"), room: $("#room-label"), standings: $("#standings"), events: $("#events"), phaseTitle: $("#phase-title"), phaseDetail: $("#phase-detail"), phaseCard: $("#phase-card"), damage: $("#damage"), damageLabel: $("#damage-label"), damageLedger: $("#damage-ledger"), speed: $("#speed"), reset: $("#reset"), spectator: $("#spectator-tools"), follow: $("#follow"), toast: $("#toast") };
const audio = new AudioEngine(), view = new ArenaView($("#arena"), audio), input = { forward: false, brake: false, left: false, right: false };
let room = null, latest = null, presence = [], previousEventTick = -1, deferredInstall = null;

const params = new URLSearchParams(location.search); ui.code.value = params.get("room") || "SMASH"; ui.name.value = localStorage.getItem("demoderby-name") || "Roadkill";
ui.form.addEventListener("submit", async event => {
  event.preventDefault(); await audio.unlock(); ui.error.textContent = ""; const button = ui.form.querySelector("button"); button.disabled = true;
  try {
    localStorage.setItem("demoderby-name", ui.name.value.trim()); room = new PhotonRoom(window.APP_CONFIG || {}); wireRoom(room);
    await room.connect({ roomCode: ui.code.value, name: ui.name.value }); view.setLocalActor(room.myActor()); history.replaceState(null, "", `${location.pathname}?room=${encodeURIComponent(room.roomCode)}`);
    ui.room.textContent = `ROOM ${room.roomCode}`; ui.dialog.close(); ui.invite.hidden = false; ui.reset.hidden = !room.isMaster();
  } catch (error) { ui.error.textContent = error.message; room?.disconnect(); room = null; }
  finally { button.disabled = false; }
});
$("#practice").addEventListener("click", async () => {
  await audio.unlock(); localStorage.setItem("demoderby-name", ui.name.value.trim()); room = new PracticeRoom(ui.name.value); wireRoom(room); await room.connect();
  view.setLocalActor(room.myActor()); ui.room.textContent = "PRACTICE ARENA"; ui.dialog.close(); ui.invite.hidden = true; ui.reset.hidden = false;
});
function wireRoom(next) {
  next.addEventListener("status", ({ detail }) => { ui.connection.textContent = friendlyStatus(detail); ui.connection.classList.toggle("online", detail === "Connected"); });
  next.addEventListener("error", ({ detail }) => { ui.error.textContent = detail; toast(detail); });
  next.addEventListener("presence", ({ detail }) => { presence = detail; renderStandings(latest); });
  next.addEventListener("snapshot", ({ detail }) => { latest = detail; view.update(detail); render(detail); });
}
function render(snapshot) {
  const myCar = snapshot.cars[String(room.myActor())]; const active = myCar?.racing && !myCar.destroyed && snapshot.phase === "playing";
  ui.damage.value = myCar?.damage || 0; ui.damageLabel.textContent = `${Math.round(myCar?.damage || 0)} / ${CAR.maxDamage}`; ui.speed.textContent = String(Math.round(Math.abs(myCar?.speed || 0) * 0.32)).padStart(3, "0"); renderDamageLedger(myCar, snapshot);
  document.body.classList.toggle("wrecked", !!myCar?.destroyed); document.body.classList.toggle("spectating", !myCar?.racing); ui.spectator.hidden = !!myCar?.racing;
  setPhase(snapshot); renderStandings(snapshot); renderEvents(snapshot); updateFollow(snapshot); ui.reset.hidden = !room.isMaster();
}
function setPhase(snapshot) {
  let title, detail, emphatic = false;
  if (snapshot.phase === "lobby") { title = "Waiting in the pits"; detail = `${snapshot.order.filter(id => snapshot.cars[id]?.connected).length} / ${MIN_PLAYERS} drivers ready`; }
  else if (snapshot.phase === "countdown") { title = String(Math.max(1, Math.ceil(snapshot.phaseTime))); detail = `Round ${snapshot.round} starts in`; emphatic = true; }
  else if (snapshot.phase === "playing") { title = "SMASH!"; detail = `${snapshot.racingCars ? snapshot.racingCars.length : snapshot.order.filter(id => snapshot.cars[id]?.racing && !snapshot.cars[id]?.destroyed).length} cars still moving`; }
  else { const winner = snapshot.cars[snapshot.winnerId]; title = winner ? `${winner.name} WINS` : "TOTAL WRITE-OFF"; detail = `Next round in ${Math.ceil(snapshot.phaseTime)}`; emphatic = true; }
  ui.phaseTitle.textContent = title; ui.phaseDetail.textContent = detail; ui.phaseCard.classList.toggle("emphatic", emphatic); ui.phaseCard.hidden = snapshot.phase === "playing";
}
function renderStandings(snapshot) {
  if (!snapshot) return; const cars = snapshot.order.map(id => snapshot.cars[id]).filter(Boolean).sort((a,b) => Number(a.destroyed)-Number(b.destroyed) || a.damage-b.damage);
  if (!cars.length) { ui.standings.innerHTML = '<li class="empty">No tyre marks yet.</li>'; return; }
  ui.standings.innerHTML = cars.map(car => `<li class="${car.destroyed ? "out" : ""} ${String(room.myActor()) === car.id ? "me" : ""}"><span class="car-dot" style="--car:${car.color}"></span><div><strong>${escapeHtml(car.name)}</strong><small>${car.racing ? car.destroyed ? "WRECKED" : `${Math.round(car.damage)} damage` : "Spectating"}</small></div><meter min="0" max="20" value="${car.damage}"></meter><b>${car.stats.wins}W</b></li>`).join("");
}
function renderEvents(snapshot) {
  if (snapshot.tickNumber === previousEventTick) return; previousEventTick = snapshot.tickNumber;
  for (const event of snapshot.events || []) {
    let text = ""; if (event.type === "join") text = `${event.name} rolled into the pits`; if (event.type === "leave") text = `${event.name} left the arena`;
    if (event.type === "collision") text = `${nameOf(event.a)} hit ${nameOf(event.b)}`; if (event.type === "wreck") text = `${nameOf(event.id)} was wrecked${event.attacker ? ` by ${nameOf(event.attacker)}` : ""}`; if (event.type === "winner") text = event.id ? `${nameOf(event.id)} is the last car moving` : "Nobody survived";
    if (text) { const li = document.createElement("li"); li.textContent = text; ui.events.prepend(li); while (ui.events.children.length > 7) ui.events.lastElementChild.remove(); }
    if (event.type === "collision" && (event.a === String(room.myActor()) || event.b === String(room.myActor())) && event.power > .35) navigator.vibrate?.(Math.round(25 + event.power * 70));
    if (event.type === "wreck" && event.id === String(room.myActor())) navigator.vibrate?.([120, 60, 220]);
  }
}
function renderDamageLedger(car, snapshot) {
  if (!car) { ui.damageLedger.innerHTML = '<div class="empty-ledger">No car assigned</div>'; return; }
  const ids = [...new Set([...Object.keys(car.damageCaused || {}), ...Object.keys(car.damageReceived || {})])].filter(id => (car.damageCaused?.[id] || 0) > 0 || (car.damageReceived?.[id] || 0) > 0);
  if (!ids.length) { ui.damageLedger.innerHTML = '<div class="empty-ledger">No contact yet</div>'; return; }
  ui.damageLedger.innerHTML = ids.map(id => { const opponent = snapshot.cars[id]; return `<div class="ledger-row" title="${escapeHtml(opponent?.name || "Opponent")}"><i style="--impact:${opponent?.color || "#aaa"}"></i><b>${formatDamage(car.damageCaused?.[id])}</b><b>${formatDamage(car.damageReceived?.[id])}</b></div>`; }).join("");
}
function formatDamage(value = 0) { return value < 10 ? value.toFixed(1) : Math.round(value).toString(); }
function updateFollow(snapshot) {
  if (!ui.spectator.hidden) { const value = ui.follow.value; const racers = snapshot.order.map(id => snapshot.cars[id]).filter(car => car?.racing); ui.follow.innerHTML = racers.map(car => `<option value="${car.id}">${escapeHtml(car.name)}${car.destroyed ? " — wrecked" : ""}</option>`).join(""); if (racers.some(car => car.id === value)) ui.follow.value = value; view.setFollowActor(ui.follow.value || racers[0]?.id); }
}
ui.follow.addEventListener("change", () => view.setFollowActor(ui.follow.value)); ui.reset.addEventListener("click", () => room?.reset());
ui.invite.addEventListener("click", async () => { const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(room.roomCode)}`; const share = { title: "DemoDerby", text: `Join my DemoDerby arena ${room.roomCode}`, url }; try { if (navigator.share) await navigator.share(share); else { await navigator.clipboard.writeText(url); toast("Arena link copied"); } } catch (error) { if (error.name !== "AbortError") { fallbackCopy(url); toast("Arena link copied"); } } });
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstall = event; ui.install.hidden = false; });
ui.install.addEventListener("click", async () => { if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; ui.install.hidden = true; } else toast("Use your browser’s Add to Home Screen command"); });
const keys = { ArrowUp:"forward", w:"forward", W:"forward", ArrowDown:"brake", s:"brake", S:"brake", ArrowLeft:"left", a:"left", A:"left", ArrowRight:"right", d:"right", D:"right" };
window.addEventListener("keydown", event => { if (!room || ui.dialog.open || !keys[event.key]) return; event.preventDefault(); changeInput(keys[event.key], true); });
window.addEventListener("keyup", event => { if (!room || !keys[event.key]) return; event.preventDefault(); changeInput(keys[event.key], false); });
window.addEventListener("blur", clearInput); document.querySelectorAll("[data-control]").forEach(button => { const key = button.dataset.control; const down = event => { event.preventDefault(); changeInput(key, true); }; const up = event => { event.preventDefault(); changeInput(key, false); }; button.addEventListener("pointerdown", down); button.addEventListener("pointerup", up); button.addEventListener("pointercancel", up); button.addEventListener("pointerleave", up); });
function changeInput(key, value) { if (input[key] === value) return; input[key] = value; room?.setInput(input); document.querySelector(`[data-control="${key}"]`)?.classList.toggle("pressed", value); }
function clearInput() { Object.keys(input).forEach(key => { input[key] = false; document.querySelector(`[data-control="${key}"]`)?.classList.remove("pressed"); }); room?.setInput(input); }
function nameOf(id) { return latest?.cars?.[id]?.name || "A driver"; }
function friendlyStatus(status) { if (status === "Connected") return "Live"; if (/connect/i.test(status)) return "Connecting"; return status; }
function toast(message) { ui.toast.textContent = message; ui.toast.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => ui.toast.classList.remove("show"), 2600); }
function fallbackCopy(value) { const area = document.createElement("textarea"); area.value=value;document.body.append(area);area.select();document.execCommand("copy");area.remove(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]); }
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
