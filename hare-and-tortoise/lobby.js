(() => {
  'use strict';

  const API_URL = 'https://www.ariolasoft.com/hare-and-tortoise-api/index.php';
  const storage = window.HareTortoiseStorage;
  const levels = window.HareTortoiseWorlds[0].levels;
  const lobbyView = document.getElementById('lobby-view');
  const gameView = document.getElementById('game-view');
  const progressMap = document.getElementById('progress-map');
  const socialDialog = document.getElementById('social-dialog');
  const socialForm = document.getElementById('social-form');
  const socialFields = document.getElementById('social-fields');
  const leaveDialog = document.getElementById('leave-dialog');
  const serviceStatus = document.getElementById('service-status');
  const serviceNote = document.getElementById('service-note');
  const social = {
    player: { id: makeId(), token: makeToken(), name: 'Trail Player' },
    membership: null,
    previousMembership: null
  };
  const remote = { online: false, members: [], records: emptyRecords() };
  let progress = {};
  let dialogMode = 'player';
  let syncTimer;

  function makeId() {
    return crypto.randomUUID?.() || `player-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function makeToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function stars(record) {
    const count = Math.max(0, Math.min(3, Number(record?.stars) || 0));
    return `${'★'.repeat(count)}${'☆'.repeat(3 - count)}`;
  }

  function isUnlocked(index, track) {
    return index === 0 || Boolean(progress?.[levels[index - 1].id]?.[track]?.parBeaten);
  }

  function completedCount() {
    return levels.reduce((total, entry) => total + ['hare', 'tortoise'].filter(track => progress?.[entry.id]?.[track]?.parBeaten).length, 0);
  }

  function emptyRecords() {
    return { overall: { hare: [], tortoise: [] }, golden: { hare: [], tortoise: [] } };
  }

  function scoreLabel(value) {
    return Number.isFinite(value) ? `${Number(value).toFixed(2)}s` : '—';
  }

  function personalResult(record) {
    const parts = [stars(record)];
    if (Number.isFinite(record?.overall)) parts.push(scoreLabel(record.overall));
    if (Number.isFinite(record?.golden)) parts.push(`🦔 ${scoreLabel(record.golden)}`);
    return parts.join(' · ');
  }

  function renderProgress() {
    document.getElementById('progress-summary').textContent = `${completedCount()} / ${levels.length * 2} cleared`;
    progressMap.replaceChildren();
    for (const track of ['hare', 'tortoise']) {
      const row = document.createElement('section');
      row.className = `trail-row ${track}`;
      const heading = document.createElement('header');
      heading.innerHTML = `<span>${track === 'hare' ? '🐇' : '🐢'}</span><div><strong>The ${track === 'hare' ? 'Hare' : 'Tortoise'}</strong><small>${track === 'hare' ? 'Quick trail' : 'Scenic trail'}</small></div>`;
      const route = document.createElement('div');
      route.className = 'trail-levels';
      levels.forEach((entry, index) => {
        const unlocked = isUnlocked(index, track);
        const record = progress?.[entry.id]?.[track];
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = !unlocked;
        button.dataset.track = track;
        button.dataset.level = entry.id;
        button.className = `trail-stop${record?.parBeaten ? ' complete' : ''}`;
        button.innerHTML = `<b>${unlocked ? index + 1 : '🔒'}</b><span>${escapeHtml(entry.name)}</span><small>${unlocked ? personalResult(record) : `Beat level ${index}`}</small>`;
        route.append(button);
      });
      row.append(heading, route);
      progressMap.append(row);
    }
  }

  function localStandings() {
    const records = emptyRecords();
    for (const entry of levels) {
      for (const track of ['hare', 'tortoise']) {
        const result = progress?.[entry.id]?.[track];
        for (const category of ['overall', 'golden']) {
          const time = result?.[category];
          if (!Number.isFinite(time)) continue;
          records[category][track].push({ levelId: entry.id, playerId: social.player.id, playerNumber: 1, name: social.player.name, time });
        }
      }
    }
    return { members: [{ playerId: social.player.id, name: social.player.name, number: 1 }], records };
  }

  function standings() {
    return remote.online && social.membership ? remote : localStandings();
  }

  function renderRecordTable(category, track, data) {
    const winners = new Map((data.records?.[category]?.[track] || []).map(entry => [entry.levelId, entry]));
    document.getElementById(`${category}-${track}-board`).innerHTML = levels.map((level, index) => {
      const winner = winners.get(level.id);
      return `<tr><th scope="row">${index + 1}. ${escapeHtml(level.name)}</th><td>${winner ? `<i class="player-number" title="${escapeHtml(winner.name)}">${winner.playerNumber}</i>` : '—'}</td><td>${winner ? scoreLabel(winner.time) : '—'}</td></tr>`;
    }).join('');
  }

  function renderSummary(data) {
    const members = [...(data.members || [])].sort((left, right) => Number(left.number) - Number(right.number));
    const counts = new Map(members.map(member => [member.playerId, { hare: 0, tortoise: 0 }]));
    for (const category of ['overall', 'golden']) {
      for (const track of ['hare', 'tortoise']) {
        for (const winner of data.records?.[category]?.[track] || []) {
          if (counts.has(winner.playerId)) counts.get(winner.playerId)[track]++;
        }
      }
    }
    const maximum = {
      hare: Math.max(0, ...members.map(member => counts.get(member.playerId)?.hare || 0)),
      tortoise: Math.max(0, ...members.map(member => counts.get(member.playerId)?.tortoise || 0))
    };
    document.getElementById('records-summary').innerHTML = members.length ? members.map(member => {
      const result = counts.get(member.playerId) || { hare: 0, tortoise: 0 };
      const hareClass = maximum.hare > 0 && result.hare === maximum.hare ? ' class="record-leader"' : '';
      const tortoiseClass = maximum.tortoise > 0 && result.tortoise === maximum.tortoise ? ' class="record-leader"' : '';
      return `<tr><th scope="row">${escapeHtml(member.name)}</th><td${hareClass}>${result.hare}</td><td${tortoiseClass}>${result.tortoise}</td></tr>`;
    }).join('') : '<tr><th scope="row">No players yet</th><td>0</td><td>0</td></tr>';
    document.getElementById('player-key').innerHTML = members.map(member => `<span><i class="player-number">${member.number}</i>${escapeHtml(member.name)}</span>`).join('');
  }

  function renderBoards() {
    const shared = Boolean(remote.online && social.membership);
    const data = standings();
    for (const category of ['overall', 'golden']) {
      for (const track of ['hare', 'tortoise']) renderRecordTable(category, track, data);
    }
    renderSummary(data);
    document.getElementById('score-scope').textContent = shared ? social.membership.name : 'This device';
  }

  function renderService() {
    serviceStatus.textContent = remote.online ? 'Shared scores live' : 'Offline · local scores';
    serviceStatus.classList.toggle('offline', !remote.online);
    serviceNote.innerHTML = remote.online
      ? '<span aria-hidden="true">✓</span> Group membership and score tables are synchronised. Saved layouts remain on this device.'
      : '<span aria-hidden="true">↻</span> Shared service unavailable. Progress and layouts continue saving on this device.';
    const groupStatus = document.getElementById('group-status');
    if (groupStatus) groupStatus.textContent = remote.online
      ? 'Membership and scores are shared with this group.'
      : 'Showing the last group details saved on this device. Changes require a connection.';
  }

  function renderSocial() {
    document.getElementById('player-name').textContent = social.player.name;
    const empty = document.getElementById('group-empty');
    const member = document.getElementById('group-member');
    empty.classList.toggle('hidden', Boolean(social.membership));
    member.classList.toggle('hidden', !social.membership);
    if (social.membership) {
      document.getElementById('group-name').textContent = social.membership.name;
      const count = social.membership.memberCount ? ` · ${social.membership.memberCount} member${social.membership.memberCount === 1 ? '' : 's'}` : '';
      document.getElementById('group-code').textContent = `Invite code · ${social.membership.code}${count}`;
    }
    const rejoin = document.getElementById('rejoin-group');
    rejoin.classList.toggle('hidden', !social.previousMembership || Boolean(social.membership));
    if (social.previousMembership && !social.membership) rejoin.textContent = `Rejoin ${social.previousMembership.name || 'previous group'}`;
    renderService(); renderBoards();
  }

  async function saveSocial() {
    await storage.setState('social:v1', JSON.parse(JSON.stringify(social)));
  }

  async function api(action, payload = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Player-ID': social.player.id,
          'X-Player-Token': social.player.token
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const error = new Error(data.message || 'The shared score service could not complete that request.');
        error.code = data.error || `http_${response.status}`;
        throw error;
      }
      remote.online = true;
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function applyRemote(data) {
    const previous = social.membership || social.previousMembership;
    if (data.player?.name) social.player.name = data.player.name;
    social.membership = data.membership || null;
    if (data.previousGroupCode) {
      social.previousMembership = previous?.code === data.previousGroupCode
        ? previous
        : { name: 'previous group', code: data.previousGroupCode };
    } else if (social.membership) {
      social.previousMembership = null;
    }
    remote.members = data.members || [];
    remote.records = data.records || emptyRecords();
  }

  async function syncRemote() {
    try {
      const data = await api('sync', { name: social.player.name, progress });
      applyRemote(data);
      await saveSocial();
    } catch (_) {
      remote.online = false;
    }
    renderSocial();
  }

  function scheduleRemoteSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncRemote, 350);
  }

  function openGame(track, levelId) {
    lobbyView.classList.add('screen-hidden');
    gameView.classList.remove('screen-hidden');
    window.HareTortoiseGame?.open(track, levelId);
  }

  function openDialog(mode) {
    dialogMode = mode;
    const labels = {
      player: ['PLAYER', 'Edit player', 'This name appears on shared score tables.', 'Save'],
      create: ['NEW GROUP', 'Create a group', 'Choose a clubhouse name. You will receive an invitation code to share with friends.', 'Create group'],
      join: ['JOIN GROUP', 'Join a group', 'Enter the invitation code supplied by a friend.', 'Join group']
    }[mode];
    document.getElementById('social-eyebrow').textContent = labels[0];
    document.getElementById('social-title').textContent = labels[1];
    document.getElementById('social-intro').textContent = labels[2];
    document.getElementById('confirm-social').textContent = labels[3];
    if (mode === 'player') {
      socialFields.innerHTML = `<label>Display name<input name="playerName" maxlength="24" required autocomplete="nickname" value="${escapeHtml(social.player.name)}"></label>`;
    } else if (mode === 'create') {
      socialFields.innerHTML = '<label>Group name<input name="groupName" maxlength="32" required autocomplete="off" placeholder="The Prickly Racers"></label>';
    } else {
      socialFields.innerHTML = '<label>Invitation code<input name="inviteCode" maxlength="16" required autocomplete="off" placeholder="HEDGE-4K7PMQ"></label>';
    }
    socialDialog.showModal();
    socialFields.querySelector('input')?.focus();
  }

  function showDialogError(message) {
    document.getElementById('social-intro').textContent = message;
  }

  socialForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(socialForm);
    const confirm = document.getElementById('confirm-social');
    confirm.disabled = true;
    try {
      if (dialogMode === 'player') {
        social.player.name = String(values.get('playerName') || '').trim().slice(0, 24) || 'Trail Player';
        await saveSocial();
        await syncRemote();
      } else {
        const action = dialogMode === 'create' ? 'create-group' : 'join-group';
        const payload = dialogMode === 'create'
          ? { name: social.player.name, groupName: String(values.get('groupName') || '').trim().slice(0, 32) }
          : { name: social.player.name, inviteCode: String(values.get('inviteCode') || '').trim().toUpperCase().slice(0, 16) };
        const data = await api(action, payload);
        applyRemote(data);
        await saveSocial();
        renderSocial();
      }
      socialDialog.close();
    } catch (error) {
      remote.online = false;
      showDialogError(error.message);
      renderService();
    } finally {
      confirm.disabled = false;
    }
  });

  document.getElementById('edit-player').addEventListener('click', () => openDialog('player'));
  document.getElementById('create-group').addEventListener('click', () => openDialog('create'));
  document.getElementById('join-group').addEventListener('click', () => openDialog('join'));
  document.getElementById('cancel-social').addEventListener('click', () => socialDialog.close());
  document.getElementById('close-social').addEventListener('click', event => { event.preventDefault(); socialDialog.close(); });
  document.getElementById('lobby-return').addEventListener('click', () => {
    gameView.classList.add('screen-hidden');
    lobbyView.classList.remove('screen-hidden');
    renderProgress(); renderBoards(); scheduleRemoteSync();
  });
  progressMap.addEventListener('click', event => {
    const button = event.target.closest('button[data-track][data-level]');
    if (button && !button.disabled) openGame(button.dataset.track, button.dataset.level);
  });
  document.getElementById('leave-group').addEventListener('click', () => {
    document.getElementById('leave-error').classList.add('hidden');
    document.getElementById('leave-group-name').textContent = social.membership?.name || 'this group';
    leaveDialog.showModal();
  });
  document.getElementById('cancel-leave').addEventListener('click', () => leaveDialog.close());
  document.getElementById('close-leave').addEventListener('click', () => leaveDialog.close());
  document.getElementById('confirm-leave').addEventListener('click', async () => {
    const errorEl = document.getElementById('leave-error');
    try {
      const previous = social.membership;
      const data = await api('leave-group', { name: social.player.name });
      applyRemote(data);
      if (!social.previousMembership && previous) social.previousMembership = previous;
      await saveSocial();
      renderSocial();
      leaveDialog.close();
    } catch (error) {
      remote.online = false;
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
      renderService();
    }
  });
  document.getElementById('rejoin-group').addEventListener('click', async () => {
    if (!social.previousMembership?.code) return;
    try {
      const data = await api('join-group', { name: social.player.name, inviteCode: social.previousMembership.code });
      applyRemote(data);
      await saveSocial();
    } catch (_) {
      remote.online = false;
    }
    renderSocial();
  });
  window.addEventListener('hare-tortoise-progress', event => {
    progress = event.detail || {};
    renderProgress(); renderBoards(); scheduleRemoteSync();
  });

  async function init() {
    try {
      await storage.ready();
      const [savedSocial, savedProgress] = await Promise.all([storage.getState('social:v1'), storage.getState('progress:v2')]);
      if (savedSocial?.player?.id) {
        social.player = {
          id: savedSocial.player.id,
          token: savedSocial.player.token || makeToken(),
          name: String(savedSocial.player.name || 'Trail Player').slice(0, 24)
        };
        social.membership = savedSocial.membership || null;
        social.previousMembership = savedSocial.previousMembership || null;
      } else {
        await saveSocial();
      }
      progress = savedProgress || {};
      // Persist a newly generated device token before attempting the network.
      // Otherwise an offline first visit would create a different identity on reload.
      await saveSocial();
    } catch (_) {}
    renderSocial(); renderProgress();
    await syncRemote();
  }

  init();
})();
