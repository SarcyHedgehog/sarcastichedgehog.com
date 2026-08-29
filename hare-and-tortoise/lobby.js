(() => {
  'use strict';

  const storage = window.HareTortoiseStorage;
  const levels = window.HareTortoiseWorlds[0].levels;
  const lobbyView = document.getElementById('lobby-view');
  const gameView = document.getElementById('game-view');
  const progressMap = document.getElementById('progress-map');
  const socialDialog = document.getElementById('social-dialog');
  const socialForm = document.getElementById('social-form');
  const socialFields = document.getElementById('social-fields');
  const leaveDialog = document.getElementById('leave-dialog');
  const social = {
    player: { id: makeId(), name: 'Trail Player' },
    membership: null,
    previousMembership: null
  };
  let progress = {};
  let dialogMode = 'player';

  function makeId() {
    return crypto.randomUUID?.() || `player-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

  function totalFor(track) {
    const results = levels.map(entry => progress?.[entry.id]?.[track]?.overall).filter(Number.isFinite);
    return results.length ? results.reduce((sum, value) => sum + value, 0) : null;
  }

  function goldenCount(track) {
    return levels.filter(entry => Number.isFinite(progress?.[entry.id]?.[track]?.golden)).length;
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
        button.innerHTML = `<b>${unlocked ? index + 1 : '🔒'}</b><span>${escapeHtml(entry.name)}</span><small>${unlocked ? stars(record) : `Beat level ${index}`}</small>`;
        route.append(button);
      });
      row.append(heading, route);
      progressMap.append(row);
    }
  }

  function boardRow(track) {
    const total = totalFor(track);
    if (total == null) return '<li class="empty-score"><span>Complete a level to set your first score.</span></li>';
    return `<li><b>1</b><span>${escapeHtml(social.player.name)}<small>${goldenCount(track)} Golden Hedgehog${goldenCount(track) === 1 ? '' : 's'}</small></span><strong>${total.toFixed(2)}s</strong></li>`;
  }

  function renderBoards() {
    document.getElementById('hare-board').innerHTML = boardRow('hare');
    document.getElementById('tortoise-board').innerHTML = boardRow('tortoise');
    document.getElementById('score-scope').textContent = social.membership?.name || 'This device';
  }

  function renderSocial() {
    document.getElementById('player-name').textContent = social.player.name;
    const empty = document.getElementById('group-empty');
    const member = document.getElementById('group-member');
    empty.classList.toggle('hidden', Boolean(social.membership));
    member.classList.toggle('hidden', !social.membership);
    if (social.membership) {
      document.getElementById('group-name').textContent = social.membership.name;
      document.getElementById('group-code').textContent = `Invite code · ${social.membership.code}`;
    }
    const rejoin = document.getElementById('rejoin-group');
    rejoin.classList.toggle('hidden', !social.previousMembership || Boolean(social.membership));
    if (social.previousMembership && !social.membership) rejoin.textContent = `Rejoin ${social.previousMembership.name}`;
    renderBoards();
  }

  async function saveSocial() {
    await storage.setState('social:v1', JSON.parse(JSON.stringify(social)));
  }

  function openGame(track, levelId) {
    lobbyView.classList.add('screen-hidden');
    gameView.classList.remove('screen-hidden');
    window.HareTortoiseGame?.open(track, levelId);
  }

  function openDialog(mode) {
    dialogMode = mode;
    const labels = {
      player: ['PLAYER', 'Edit player', 'This name will appear on score tables.', 'Save'],
      create: ['NEW GROUP', 'Create a group', 'Choose a clubhouse name. An invitation code will be generated for later online sharing.', 'Create group'],
      join: ['JOIN GROUP', 'Join a group', 'Enter the group name and invitation code supplied by a friend.', 'Join group']
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
      socialFields.innerHTML = '<label>Group name<input name="groupName" maxlength="32" required autocomplete="off" placeholder="The Prickly Racers"></label><label>Invitation code<input name="inviteCode" maxlength="16" required autocomplete="off" placeholder="MEADOW-7K4P"></label>';
    }
    socialDialog.showModal();
    socialFields.querySelector('input')?.focus();
  }

  function inviteCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const suffix = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    return `MEADOW-${suffix}`;
  }

  socialForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(socialForm);
    if (dialogMode === 'player') {
      social.player.name = String(values.get('playerName') || '').trim().slice(0, 24) || 'Trail Player';
    } else {
      const name = String(values.get('groupName') || '').trim().slice(0, 32);
      const code = dialogMode === 'create' ? inviteCode() : String(values.get('inviteCode') || '').trim().toUpperCase().slice(0, 16);
      if (!name || !code) return;
      social.membership = { id: `group-${code.toLowerCase()}`, name, code, role: dialogMode === 'create' ? 'owner' : 'member', joinedAt: new Date().toISOString() };
      social.previousMembership = null;
    }
    await saveSocial();
    renderSocial();
    socialDialog.close();
  });

  document.getElementById('edit-player').addEventListener('click', () => openDialog('player'));
  document.getElementById('create-group').addEventListener('click', () => openDialog('create'));
  document.getElementById('join-group').addEventListener('click', () => openDialog('join'));
  document.getElementById('cancel-social').addEventListener('click', () => socialDialog.close());
  document.getElementById('close-social').addEventListener('click', event => { event.preventDefault(); socialDialog.close(); });
  document.getElementById('lobby-return').addEventListener('click', () => {
    gameView.classList.add('screen-hidden');
    lobbyView.classList.remove('screen-hidden');
    renderProgress(); renderBoards();
  });
  progressMap.addEventListener('click', event => {
    const button = event.target.closest('button[data-track][data-level]');
    if (button && !button.disabled) openGame(button.dataset.track, button.dataset.level);
  });
  document.getElementById('leave-group').addEventListener('click', () => {
    document.getElementById('leave-group-name').textContent = social.membership?.name || 'this group';
    leaveDialog.showModal();
  });
  document.getElementById('cancel-leave').addEventListener('click', () => leaveDialog.close());
  document.getElementById('close-leave').addEventListener('click', () => leaveDialog.close());
  document.getElementById('confirm-leave').addEventListener('click', async () => {
    social.previousMembership = social.membership;
    social.membership = null;
    await saveSocial();
    renderSocial();
    leaveDialog.close();
  });
  document.getElementById('rejoin-group').addEventListener('click', async () => {
    social.membership = social.previousMembership;
    social.previousMembership = null;
    await saveSocial();
    renderSocial();
  });
  window.addEventListener('hare-tortoise-progress', event => {
    progress = event.detail || {};
    renderProgress(); renderBoards();
  });

  async function init() {
    try {
      await storage.ready();
      const [savedSocial, savedProgress] = await Promise.all([storage.getState('social:v1'), storage.getState('progress:v2')]);
      if (savedSocial?.player?.id) {
        social.player = { id: savedSocial.player.id, name: String(savedSocial.player.name || 'Trail Player').slice(0, 24) };
        social.membership = savedSocial.membership || null;
        social.previousMembership = savedSocial.previousMembership || null;
      } else {
        await saveSocial();
      }
      progress = savedProgress || {};
    } catch (_) {}
    renderSocial(); renderProgress();
  }

  init();
})();
