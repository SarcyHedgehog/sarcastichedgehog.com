import { activeQuestion, voteCounts, winningIndex } from "./game-state.js";
import { createTransport } from "./transports/index.js";

const config = {
  MODE: "local",
  PHOTON_APP_ID: "",
  PHOTON_REGION: "eu",
  PHOTON_SDK_URL: "vendor/photon.min.js",
  BASE_URL: window.location.href.split("?")[0],
  DEBUG: false,
  ...(window.APP_CONFIG || {}),
};

class VoteTogetherApp {
  constructor(root) {
    this.root = root;
    this.transport = null;
    this.snapshot = null;
    this.username = null;
    this.roomCode = null;
    this.pendingVote = null;
    this.busy = false;
    this.notice = null;
    this.renderLobby();
    window.addEventListener("unhandledrejection", (event) => this.showError(event.reason));
  }

  renderLobby() {
    const params = new URLSearchParams(window.location.search);
    const savedName = localStorage.getItem("votetogether-username") || "";
    const room = params.get("room") || "";
    const modeLabel = config.MODE === "photon" || (config.MODE === "auto" && config.PHOTON_APP_ID)
      ? "Photon Realtime"
      : "Local multi-tab preview";

    this.root.innerHTML = `
      <section class="shell lobby-shell">
        <header class="brand-block">
          <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
          <p class="eyebrow">ONE QUESTION · ONE VOTE</p>
          <h1>Vote<span>Together</span></h1>
          <p class="tagline">Ask something. Share the room. Discover what everyone thinks.</p>
        </header>
        ${this.notice ? `<div class="notice ${this.notice.type}">${escapeHtml(this.notice.text)}</div>` : ""}
        <form id="join-form" class="glass-card join-card">
          <label>Name<input id="username" maxlength="24" autocomplete="nickname" value="${escapeAttribute(savedName)}" placeholder="Your name" required></label>
          <label>Password<input id="password" type="password" maxlength="80" autocomplete="current-password" placeholder="Your room identity" required></label>
          <label>Room code<input id="room" maxlength="32" autocapitalize="off" autocomplete="off" value="${escapeAttribute(room)}" placeholder="friends" required></label>
          <button class="primary-button" type="submit"><span>Join or create room</span><span aria-hidden="true">→</span></button>
          <p class="microcopy">A name and password identify you inside this room only.</p>
        </form>
        <div class="transport-chip"><span class="status-dot"></span>${escapeHtml(modeLabel)}</div>
      </section>`;

    this.root.querySelector("#join-form").addEventListener("submit", (event) => this.join(event));
  }

  async join(event) {
    event.preventDefault();
    if (this.busy) return;
    this.busy = true;
    const username = this.root.querySelector("#username").value.trim();
    const password = this.root.querySelector("#password").value;
    const roomCode = normalizeRoom(this.root.querySelector("#room").value);
    if (!username || !password || !roomCode) return;

    this.username = username;
    this.roomCode = roomCode;
    this.renderConnecting();

    try {
      const passwordHash = await sha256(password);
      this.transport = createTransport(config);
      const connection = await this.transport.connect({ roomCode, username, passwordHash });
      localStorage.setItem("votetogether-username", username);
      this.transport.subscribe((snapshot) => {
        this.snapshot = snapshot;
        this.renderRoom();
      });
      this.snapshot = connection.snapshot;
      this.updateShareUrl();
      this.renderRoom();
    } catch (error) {
      this.transport?.disconnect();
      this.transport = null;
      this.busy = false;
      this.renderLobby();
      this.showError(error);
    }
  }

  renderConnecting() {
    this.root.innerHTML = `
      <section class="shell centered-shell">
        <div class="orbital-loader"><span></span></div>
        <p class="eyebrow">CONNECTING</p>
        <h1 class="compact-title">Room <span>${escapeHtml(this.roomCode)}</span></h1>
        <p class="tagline">Finding everyone else…</p>
      </section>`;
  }

  renderRoom() {
    if (!this.snapshot?.state) return;
    const state = this.snapshot.state;
    const question = activeQuestion(state);
    const isHost = state.hostUsername === this.username;
    const hostOnline = state.hostUsername && this.snapshot.presence.includes(state.hostUsername);
    const online = [...new Set(this.snapshot.presence)].length;

    this.root.innerHTML = `
      <section class="shell room-shell">
        <header class="room-header">
          <div>
            <p class="eyebrow">VOTE TOGETHER</p>
            <h1 class="room-title">${escapeHtml(this.roomCode)}</h1>
          </div>
          <div class="header-actions">
            <button id="share" class="icon-button" title="Copy invitation" aria-label="Copy invitation">↗</button>
            <button id="leave" class="text-button">Leave</button>
          </div>
        </header>

        <div class="room-meta">
          <span><i class="status-dot"></i>${online} online</span>
          <span>${escapeHtml(this.snapshot.transport)}</span>
          <span>Revision ${state.revision}</span>
        </div>

        ${this.notice ? `<div class="notice ${this.notice.type}">${escapeHtml(this.notice.text)}</div>` : ""}

        <section class="identity-strip">
          <div><small>YOU ARE</small><strong>${escapeHtml(this.username)}</strong></div>
          <div><small>HOST</small><strong>${state.hostUsername ? `${escapeHtml(state.hostUsername)}${hostOnline ? "" : " · offline"}` : "Not claimed"}</strong></div>
        </section>

        ${this.renderHostClaim(state, isHost)}
        ${this.renderQuestion(question, isHost)}
        ${isHost ? this.renderHostControls(question) : ""}
        ${this.renderLeaderboard(state)}
        ${this.renderHistory(state)}

        <footer class="room-footer"><span>One poll</span><b>·</b><span>One vote</span><b>·</b><span>One shared result</span></footer>
      </section>`;
    this.attachRoomEvents();
  }

  renderHostClaim(state, isHost) {
    if (!state.hostUsername) {
      return `<button id="claim-host" class="claim-card"><span><small>ROOM NEEDS A HOST</small><strong>Take the question chair</strong></span><b>→</b></button>`;
    }
    if (isHost) return `<div class="host-ribbon"><span>◆</span>You hold the question chair</div>`;
    return "";
  }

  renderQuestion(question, isHost) {
    if (!question) {
      return `<section class="glass-card empty-state"><div class="empty-glyph">?</div><p class="eyebrow">THE ROOM IS READY</p><h2>${isHost ? "Ask the first question." : "Waiting for the host’s question."}</h2><p>Results appear for everyone the moment the host closes the poll.</p></section>`;
    }

    if (question.closed) return this.renderResults(question);
    if (isHost) {
      const count = Object.keys(question.votes).length;
      return `<section class="glass-card question-card live-question"><div class="question-kicker"><span class="live-dot"></span>LIVE POLL</div><h2>${escapeHtml(question.text)}</h2><div class="vote-count"><strong>${count}</strong><span>${count === 1 ? "vote" : "votes"} received</span></div><p class="quiet">Individual answers stay hidden until you close the poll.</p></section>`;
    }

    const myVote = question.votes[this.username];
    if (myVote) {
      return `<section class="glass-card empty-state voted-state"><div class="empty-glyph">✓</div><p class="eyebrow">VOTE LOCKED IN</p><h2>${escapeHtml(question.options[myVote.vote])}</h2><p>You predicted <strong>${escapeHtml(question.options[myVote.guess])}</strong> would be most popular.</p><div class="waiting-line"><span></span>Waiting for the shared result</div></section>`;
    }

    const predicting = this.pendingVote !== null;
    return `<section class="glass-card question-card"><div class="question-kicker"><span>${predicting ? "2" : "1"}</span>${predicting ? "PREDICT THE ROOM" : "YOUR VOTE"}</div><h2>${escapeHtml(question.text)}</h2><p class="instruction">${predicting ? "Which answer do you think everyone else will choose?" : "Choose the answer that feels right to you."}</p><div class="options-grid">${question.options.map((option, index) => `<button class="option-button ${predicting ? "prediction" : ""}" data-${predicting ? "guess" : "vote"}="${index}"><span>${String.fromCharCode(65 + index)}</span><strong>${escapeHtml(option)}</strong></button>`).join("")}</div>${predicting ? `<button id="change-vote" class="text-button back-button">← Change my vote</button>` : ""}</section>`;
  }

  renderResults(question) {
    const counts = voteCounts(question);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const winner = winningIndex(question);
    return `<section class="glass-card question-card results-card"><div class="question-kicker"><span>✓</span>SHARED RESULT</div><h2>${escapeHtml(question.text)}</h2><div class="results-list">${question.options.map((option, index) => {
      const percentage = total ? Math.round((counts[index] / total) * 100) : 0;
      return `<div class="result-row ${index === winner ? "winner" : ""}"><div class="result-label"><strong>${escapeHtml(option)}</strong><span>${counts[index]} · ${percentage}%</span></div><div class="result-track"><i style="width:${percentage}%"></i></div></div>`;
    }).join("")}</div>${winner < 0 ? `<p class="tie-note">A perfect tie—apparently the room contains multitudes.</p>` : `<p class="winner-note">The room chose <strong>${escapeHtml(question.options[winner])}</strong>.</p>`}</section>`;
  }

  renderHostControls(question) {
    return `<section class="glass-card host-controls"><div class="section-heading"><div><p class="eyebrow">HOST CONTROLS</p><h3>${question && !question.closed ? "The room is voting" : "Your next question"}</h3></div></div>${question && !question.closed ? `<button id="close-question" class="danger-button">Close poll & reveal result</button>` : `<form id="question-form"><label>Question<input id="question-text" maxlength="180" placeholder="What does everyone think?" required></label><label>Answers<textarea id="question-options" aria-label="Answers" rows="3" placeholder="Tea, Coffee, Something stronger" required></textarea><small>Separate answers with commas or new lines.</small></label><button class="primary-button" type="submit"><span>Open the poll</span><span>→</span></button></form>`}</section>`;
  }

  renderLeaderboard(state) {
    const users = Object.entries(state.users)
      .filter(([name]) => name !== state.hostUsername)
      .map(([name, score]) => ({ name, ...score, accuracy: score.pollsVoted ? Math.round(score.guessesCorrect / score.pollsVoted * 100) : 0 }))
      .sort((a, b) => b.accuracy - a.accuracy || b.guessesCorrect - a.guessesCorrect || a.name.localeCompare(b.name));
    if (!users.some((user) => user.pollsVoted)) return "";
    return `<section class="glass-card slim-card"><div class="section-heading"><div><p class="eyebrow">READING THE ROOM</p><h3>Prediction table</h3></div></div><ol class="leaderboard">${users.map((user, index) => `<li class="${user.name === this.username ? "me" : ""}"><b>${index + 1}</b><span>${escapeHtml(user.name)}</span><strong>${user.accuracy}% <small>${user.guessesCorrect}/${user.pollsVoted}</small></strong></li>`).join("")}</ol></section>`;
  }

  renderHistory(state) {
    const activeId = activeQuestion(state)?.id;
    const history = [...state.questions].reverse().filter((question) => question.closed && question.id !== activeId).slice(0, 8);
    if (!history.length) return "";
    return `<section class="glass-card slim-card"><div class="section-heading"><div><p class="eyebrow">EARLIER</p><h3>Room history</h3></div></div><div class="history-list">${history.map((question) => {
      const winner = winningIndex(question);
      return `<details><summary><span>${escapeHtml(question.text)}</span><b>${winner >= 0 ? escapeHtml(question.options[winner]) : "Tie"}</b></summary><div>${question.options.map((option, index) => `<p><span>${escapeHtml(option)}</span><strong>${voteCounts(question)[index]}</strong></p>`).join("")}</div></details>`;
    }).join("")}</div></section>`;
  }

  attachRoomEvents() {
    this.root.querySelector("#leave")?.addEventListener("click", () => this.leave());
    this.root.querySelector("#share")?.addEventListener("click", () => this.share());
    this.root.querySelector("#claim-host")?.addEventListener("click", () => this.command({ type: "claim-host" }));
    this.root.querySelector("#close-question")?.addEventListener("click", () => this.command({ type: "close-question" }));
    this.root.querySelector("#question-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = this.root.querySelector("#question-text").value;
      const options = this.root.querySelector("#question-options").value.split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
      this.command({ type: "add-question", text, options });
    });
    this.root.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", () => {
      this.pendingVote = Number(button.dataset.vote);
      this.renderRoom();
    }));
    this.root.querySelectorAll("[data-guess]").forEach((button) => button.addEventListener("click", () => {
      const voteIndex = this.pendingVote;
      this.pendingVote = null;
      this.command({ type: "vote", voteIndex, guessIndex: Number(button.dataset.guess) });
    }));
    this.root.querySelector("#change-vote")?.addEventListener("click", () => {
      this.pendingVote = null;
      this.renderRoom();
    });
  }

  async command(command) {
    try {
      this.notice = null;
      await this.transport.sendCommand(command);
    } catch (error) {
      this.showError(error);
    }
  }

  async share() {
    const url = new URL(config.BASE_URL || window.location.href);
    url.searchParams.set("room", this.roomCode);
    const text = `One question. One vote. Join my VoteTogether room “${this.roomCode}”: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "VoteTogether", text, url: url.toString() });
      else {
        await navigator.clipboard.writeText(text);
        this.showNotice("Invitation copied to the clipboard.", "success");
      }
    } catch (error) {
      if (error.name !== "AbortError") this.showError(error);
    }
  }

  leave() {
    this.transport?.disconnect();
    this.transport = null;
    this.snapshot = null;
    this.pendingVote = null;
    this.busy = false;
    this.renderLobby();
  }

  updateShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("room", this.roomCode);
    history.replaceState({}, "", url);
  }

  showNotice(text, type = "error") {
    this.notice = { text, type };
    if (this.snapshot) this.renderRoom();
    else this.renderLobby();
    window.setTimeout(() => {
      this.notice = null;
      if (this.snapshot) this.renderRoom();
      else this.renderLobby();
    }, 4500);
  }

  showError(error) {
    console.error(error);
    this.showNotice(error?.message || String(error));
  }
}

function normalizeRoom(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function escapeAttribute(value) { return escapeHtml(value); }

new VoteTogetherApp(document.querySelector("#app"));

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));
}
