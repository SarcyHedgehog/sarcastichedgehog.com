import { PhotonRoom } from "./photon-room.js";

const $ = (id) => document.getElementById(id);
const ui = {
  lobby: $("lobby"), game: $("game"), form: $("lobby-form"), name: $("display-name"), room: $("room-code"),
  mainActions: $("main-actions"), joinActions: $("join-actions"), error: $("lobby-error"), roomLabel: $("room-label"),
  status: $("connection-status"), title: $("question-title"), message: $("player-status"), feedback: $("feedback"),
  answers: $("answer-pad"), yes: $("true-button"), no: $("false-button"), players: $("player-list"), count: $("player-count"),
  claim: $("claim-host"), start: $("start-game"), next: $("next-question"), end: $("end-game"), reset: $("reset-game"),
  install: $("install-app"), ios: $("ios-install")
};
let room = null, state = null;

ui.name.value = localStorage.getItem("buzzer-name") || "";
const requested = new URLSearchParams(location.search).get("room");
if (requested) { showJoin(); ui.room.value = cleanCode(requested); }
$("show-join").onclick = showJoin;
$("back").onclick = () => { ui.joinActions.hidden = true; ui.mainActions.hidden = false; };
$("create-game").onclick = () => join(randomCode());
ui.form.onsubmit = (event) => { event.preventDefault(); join(cleanCode(ui.room.value)); };

async function join(code) {
  const name = ui.name.value.trim();
  if (!name) { ui.error.textContent = "Enter your name first."; ui.name.focus(); return; }
  if (code.length !== 5) { ui.error.textContent = "Game codes contain five letters."; return; }
  localStorage.setItem("buzzer-name", name); ui.error.textContent = "Connecting...";
  try {
    room = new PhotonRoom(window.APP_CONFIG || {}); wire(room); await room.connect({ roomCode: code, name });
    history.replaceState(null, "", `${location.pathname}?room=${code}`); ui.roomLabel.textContent = code; ui.lobby.hidden = true; ui.game.hidden = false;
  } catch (error) { ui.error.textContent = error.message; room?.disconnect(); room = null; }
}
function wire(next) {
  next.addEventListener("status", ({ detail }) => { ui.status.textContent = detail; ui.status.classList.toggle("online", detail === "Connected"); });
  next.addEventListener("error", ({ detail }) => ui.error.textContent = detail);
  next.addEventListener("snapshot", ({ detail }) => { state = detail; render(); });
}
function render() {
  if (!state || !room) return;
  const me = String(room.myActor()), isHost = Number(state.hostId) === Number(me), mine = state.players[me];
  const players = Object.values(state.players).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  ui.count.textContent = players.length;
  ui.players.innerHTML = players.map((player) => {
    const maySeeAnswer = isHost || String(player.id) === me;
    const mark = maySeeAnswer ? (player.currentAnswer === true ? "&#10003;" : player.currentAnswer === false ? "&#10007;" : "&ndash;") : (player.currentAnswer === null ? "&ndash;" : "&bull;");
    const markClass = maySeeAnswer ? (player.currentAnswer === true ? "yes" : player.currentAnswer === false ? "no" : "") : "";
    return `<div class="player ${player.id === state.hostId ? "host" : ""} ${String(player.id) === me ? "me" : ""}"><strong>${escapeHtml(player.name)}${player.id === state.hostId ? " - Host" : ""}</strong><span class="answer-mark ${markClass}">${mark}</span><span class="score">${player.score}</span></div>`;
  }).join("");
  ui.claim.hidden = state.hostId !== null; ui.start.hidden = !(isHost && state.gameState === "LOBBY"); ui.start.disabled = players.length < 2;
  ui.next.hidden = !(isHost && state.gameState === "TAKING_ANSWERS"); ui.end.hidden = !(isHost && ["QUESTION_SETUP", "TAKING_ANSWERS"].includes(state.gameState));
  ui.reset.hidden = !(isHost && state.gameState === "GAME_OVER"); ui.answers.hidden = state.gameState === "LOBBY" || state.gameState === "GAME_OVER";
  ui.yes.disabled = ui.no.disabled = true; ui.yes.classList.remove("selected", "muted"); ui.no.classList.remove("selected", "muted"); ui.feedback.hidden = true;
  const host = state.players[String(state.hostId)]?.name || "The host";
  if (state.gameState === "LOBBY") { ui.title.textContent = "Game lobby"; ui.message.textContent = isHost ? (players.length < 2 ? "Waiting for one more player..." : "Ready when you are.") : (state.hostId ? `${host} is hosting.` : "Choose who will host."); }
  if (state.gameState === "QUESTION_SETUP") { ui.title.textContent = `Question ${state.questionNumber}`; ui.message.textContent = isHost ? "Choose the correct answer" : `${host} is setting the answer...`; if (isHost) ui.yes.disabled = ui.no.disabled = false; showFeedback(mine); }
  if (state.gameState === "TAKING_ANSWERS") { ui.title.textContent = `Question ${state.questionNumber}`; ui.message.textContent = isHost ? `${answeredCount(players)} of ${Math.max(0, players.length - 1)} answered` : mine?.currentAnswer === null ? "What's the answer?" : "Answer locked in!"; if (!isHost && mine?.currentAnswer === null) ui.yes.disabled = ui.no.disabled = false; if (mine?.currentAnswer !== null) { (mine.currentAnswer ? ui.yes : ui.no).classList.add("selected"); (mine.currentAnswer ? ui.no : ui.yes).classList.add("muted"); } }
  if (state.gameState === "GAME_OVER") { ui.title.textContent = "Final scores"; ui.message.textContent = players.length ? `${players[0].name} leads with ${players[0].score}` : "Quiz complete"; }
}
function showFeedback(player) { if (!player || player.lastAnswerSubmitted === null || state.lastRoundCorrectAnswer === null) return; ui.feedback.innerHTML = `Question ${state.questionNumber - 1}: correct was <strong>${state.lastRoundCorrectAnswer ? "True" : "False"}</strong>. You said <strong>${player.lastAnswerSubmitted ? "True" : "False"}</strong>.`; ui.feedback.hidden = false; }
function answer(value) { if (state) room.command(Number(state.hostId) === room.myActor() ? "setAnswer" : "playerAnswer", value); }
ui.yes.onclick = () => answer(true); ui.no.onclick = () => answer(false); ui.claim.onclick = () => room?.command("claimHost"); ui.start.onclick = () => room?.command("startGame"); ui.next.onclick = () => room?.command("nextQuestion"); ui.end.onclick = () => room?.command("endGame"); ui.reset.onclick = () => room?.command("resetGame");
$("copy-invite").onclick = shareInvite;
$("leave-game").onclick = () => { room?.disconnect(); location.href = location.pathname; };
function showJoin() { ui.mainActions.hidden = true; ui.joinActions.hidden = false; ui.room.focus(); }
function randomCode() { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"; return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(""); }
function cleanCode(value) { return String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5); }
function answeredCount(players) { return players.filter((player) => player.id !== state.hostId && player.currentAnswer !== null).length; }
function escapeHtml(value) { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
async function shareInvite() {
  const button = $("copy-invite"), url = `${location.origin}${location.pathname}?room=${room.roomCode}`;
  const text = `Join my Buzzer game! Code: ${room.roomCode}`;
  try {
    if (navigator.share) { await navigator.share({ title: "Buzzer", text, url }); flashButton(button, "Shared"); return; }
    if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(`${text}\n${url}`);
    else fallbackCopy(`${text}\n${url}`);
    flashButton(button, "Copied");
  } catch (error) { if (error?.name !== "AbortError") flashButton(button, "Copy failed"); }
}
function fallbackCopy(text) { const area = document.createElement("textarea"); area.value = text; area.setAttribute("readonly", ""); area.style.cssText = "position:fixed;left:-9999px"; document.body.append(area); area.select(); const copied = document.execCommand("copy"); area.remove(); if (!copied) throw new Error("Copy unavailable"); }
function flashButton(button, message) { button.textContent = message; setTimeout(() => button.textContent = "Share invite", 1400); }
let installPrompt = null; addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; ui.install.hidden = false; }); ui.install.onclick = async () => { ui.install.hidden = true; await installPrompt?.prompt(); installPrompt = null; };
if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !matchMedia("(display-mode: standalone)").matches) ui.ios.hidden = false;
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
