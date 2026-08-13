import { MazeView } from "./maze-view.js";
import { loadMaze, loadMapManifest } from "./maps.js";
import { PhotonRoom } from "./photon-room.js";
import { PracticeRoom } from "./practice-room.js";

const $ = selector => document.querySelector(selector);
const ui = { dialog: $("#join-dialog"), form: $("#join-form"), name: $("#runner-name"), code: $("#room-code"), map: $("#map-select"), error: $("#join-error"), connection: $("#connection"), room: $("#room-label"), hud: $("#hud"), status: $("#status"), clock: $("#clock"), scores: $("#scores"), controls: $("#controls"), spectator: $("#spectator"), invite: $("#invite"), toast: $("#toast") };
const view = new MazeView($("#maze"));
let room = null, latest = null, lastDirection = null;
const params = new URLSearchParams(location.search);
ui.code.value = params.get("room") || "LABYRINTH"; ui.name.value = localStorage.getItem("mazetag-name") || "Runner";
await populateMaps();

ui.form.addEventListener("submit", async event => { event.preventDefault(); await enter(false); });
$("#practice").addEventListener("click", () => enter(true));
async function enter(practice) {
  ui.error.textContent = ""; const buttons = ui.form.querySelectorAll("button"); buttons.forEach(button => button.disabled = true);
  try {
    const requestedMapId = ui.map.value, loaded = await loadMaze(requestedMapId), mapId = loaded.map.id, maze = loaded.maze, name = ui.name.value.trim() || "Runner"; localStorage.setItem("mazetag-name", name);
    room = practice ? new PracticeRoom({ name, maze, mapId }) : new PhotonRoom(window.APP_CONFIG || {}, maze, mapId); wireRoom(room);
    await room.connect({ roomCode: ui.code.value, name }); view.setLocalActor(room.myActor());
    if (!practice) history.replaceState(null, "", `${location.pathname}?room=${encodeURIComponent(room.roomCode)}&map=${encodeURIComponent(mapId)}`);
    ui.room.textContent = practice ? "PRACTICE MAZE" : `ROOM ${room.roomCode}`; ui.room.hidden = false; ui.dialog.close(); ui.hud.hidden = false; ui.invite.hidden = practice;
  } catch (error) { ui.error.textContent = error.message; room?.disconnect(); room = null; }
  finally { buttons.forEach(button => button.disabled = false); }
}
function wireRoom(next) {
  next.addEventListener("status", ({ detail }) => { ui.connection.textContent = friendlyStatus(detail); ui.connection.classList.toggle("online", detail === "Connected" || detail === "Practice"); });
  next.addEventListener("error", ({ detail }) => { ui.error.textContent = detail; toast(detail); });
  next.addEventListener("snapshot", ({ detail }) => { latest = detail; view.update(detail); render(detail); });
}
function render(snapshot) {
  const me = snapshot.players[String(room.myActor())], spectating = !me?.connected; view.setSpectating(spectating); ui.controls.hidden = spectating; ui.spectator.hidden = !spectating;
  ui.status.textContent = snapshot.phase === "playing" ? (me?.isIt ? "YOU ARE IT" : "RUN!") : snapshot.phase === "countdown" ? "NEXT ROUND" : "WAITING FOR RUNNERS";
  ui.clock.textContent = formatTime(Math.max(0, snapshot.phaseEndsAt - snapshot.time));
  ui.scores.innerHTML = snapshot.order.map(id => snapshot.players[id]).filter(player => player?.connected).sort((a,b) => b.score-a.score).map(player => `<li class="${player.id === String(room.myActor()) ? "me" : ""}"><i style="--runner:#${player.color.toString(16).padStart(6,"0")}"></i><span>${escapeHtml(player.name)}${player.isIt ? " · IT" : ""}</span><b>${player.score}</b></li>`).join("");
}
const keyTurns = { ArrowLeft:"left", a:"left", A:"left", ArrowRight:"right", d:"right", D:"right" };
addEventListener("keydown", event => { const turn = keyTurns[event.key]; if (!turn || !room || ui.dialog.open || event.repeat) return; event.preventDefault(); sendTurn(turn, true); });
addEventListener("keyup", event => { const turn = keyTurns[event.key]; if (!turn || !room) return; event.preventDefault(); sendTurn(turn, false); });
document.querySelectorAll("[data-turn]").forEach(button => { const turn = button.dataset.turn; const down = event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); sendTurn(turn, true); }; const up = event => { event.preventDefault(); sendTurn(turn, false); }; button.addEventListener("pointerdown", down); button.addEventListener("pointerup", up); button.addEventListener("pointercancel", up); });
function sendTurn(turn, held) { if (lastDirection === `${turn}:${held}`) return; lastDirection = `${turn}:${held}`; room?.setTurn({ turn, held }); document.querySelector(`[data-turn="${turn}"]`)?.classList.toggle("pressed", held); if (!held) lastDirection = null; }
ui.invite.addEventListener("click", async () => { const url = location.href, share = { title:"MazeTag", text:`Join my MazeTag room ${room.roomCode}`, url }; try { if (navigator.share) await navigator.share(share); else { await navigator.clipboard.writeText(url); toast("Maze link copied"); } } catch (error) { if (error.name !== "AbortError") toast("Copy the address from your browser"); } });
function friendlyStatus(value) { if (value === "Connected") return "Live"; if (/connect/i.test(value)) return "Connecting"; return value; }
function formatTime(ms) { const total = Math.ceil(ms / 1000), minutes = Math.floor(total / 60), seconds = total % 60; return `${minutes}:${String(seconds).padStart(2,"0")}`; }
function toast(message) { ui.toast.textContent = message; ui.toast.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => ui.toast.classList.remove("show"), 2400); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]); }
async function populateMaps() {
  try {
    const maps = await loadMapManifest(), requested = params.get("map");
    ui.map.innerHTML = maps.map(map => `<option value="${escapeHtml(map.id)}">${escapeHtml(map.title)}</option>`).join("");
    ui.map.value = maps.some(map => map.id === requested) ? requested : maps[0].id;
  } catch (error) { ui.map.innerHTML = '<option value="map1">Classic Maze</option>'; ui.error.textContent = error.message; }
}
