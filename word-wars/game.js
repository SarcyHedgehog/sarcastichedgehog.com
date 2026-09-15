(() => {
  'use strict';

  const CONFIG = {
    columns: 8,
    maxColumnHeight: 8,
    startingLetters: 20,
    refillLetters: 8,
    barrierDropEveryTurns: 14,
    arrivalHighlightMs: 2600,
    spyRevealMs: 5000,
    specialUnlockTurns: { remove: 3, move: 5, spy: 7 },
    specialRates: { remove: 0.06, move: 0.06, spy: 0.12 },
    maxAttackTiles: 4,
    // English dictionary-entry frequencies. Values are relative weights and
    // are normalised by weightedLetter, so they do not need to total 100.
    letterWeights: {
      A: 7.8, B: 2.0, C: 4.0, D: 3.8, E: 11.0, F: 1.4, G: 3.0,
      H: 2.3, I: 8.6, J: 0.25, K: 0.97, L: 5.3, M: 2.7, N: 7.2,
      O: 6.1, P: 2.8, Q: 0.19, R: 7.3, S: 8.7, T: 6.7, U: 3.3,
      V: 1.0, W: 0.91, X: 0.27, Y: 1.6, Z: 0.44
    }
  };

  const $ = (selector) => document.querySelector(selector);
  const screens = [...document.querySelectorAll('.screen')];
  let state;
  let toastTimer;
  let spyTimer;
  let tileSequence = 0;
  let localSession = null;
  let syncInFlight = false;
  const SESSION_KEY = 'word-wars-online-session-v1';
  const remoteApiEndpoint = String(window.WORD_WARS_CONFIG?.apiEndpoint || '').trim();
  const apiProtocol = location.protocol === 'http:' || location.protocol === 'https:' ? location.protocol : 'http:';
  const apiHost = location.hostname || '127.0.0.1';
  const API_ORIGIN = location.port === '8767' ? '' : `${apiProtocol}//${apiHost}:8767`;
  const API_BASE = `${API_ORIGIN}/api`;

  function rememberSession(session) {
    localSession = session;
    if (!session) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      code: session.code,
      playerIndex: session.playerIndex,
      playerToken: session.playerToken,
      revision: session.revision
    }));
  }

  function restoreSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!saved || !/^[A-Z2-9]{6}$/.test(saved.code) || !saved.playerToken) return null;
      return saved;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function makeTileId() {
    tileSequence += 1;
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `tile-${Date.now().toString(36)}-${tileSequence.toString(36)}`;
  }

  function nextRandom() {
    state.rngSeed |= 0;
    state.rngSeed = state.rngSeed + 0x6D2B79F5 | 0;
    let t = Math.imul(state.rngSeed ^ state.rngSeed >>> 15, 1 | state.rngSeed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  function weightedLetter() {
    const entries = Object.entries(CONFIG.letterWeights);
    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = nextRandom() * totalWeight;
    for (const [letter, weight] of entries) {
      roll -= weight;
      if (roll < 0) return letter;
    }
    return entries[entries.length - 1][0];
  }

  function newState(names, minWordLength) {
    const players = names.map((name, index) => ({
      name,
      board: Array.from({ length: CONFIG.columns }, () => []),
      incoming: [],
      refillDue: false,
      introducedSpecials: [],
      seedOffset: index
    }));
    state = {
      players,
      rngSeed: 2012,
      current: 0,
      turn: 1,
      barrierDrops: 0,
      selection: [],
      words: [],
      minWordLength,
      resolution: null,
      turnPrepared: true,
      outcome: null
    };
    players.forEach(player => { player.spyGlasses = 0; });
    players.forEach(player => addTiles(player, CONFIG.startingLetters, 'existing'));
  }

  function nextSpecial() {
    const roll = nextRandom();
    let threshold = 0;
    for (const special of ['remove', 'move', 'spy']) {
      threshold += CONFIG.specialRates[special];
      if (state.turn >= CONFIG.specialUnlockTurns[special] && roll < threshold) return special;
    }
    return null;
  }

  function addTiles(player, count, origin, sourceLetters = []) {
    const introductionPlan = origin === 'attack' ? [] : ['remove', 'move', 'spy'].filter(special => (
      state.turn >= CONFIG.specialUnlockTurns[special] && !player.introducedSpecials.includes(special)
    ));
    for (let i = 0; i < count; i += 1) {
      const target = i % CONFIG.columns;
      const letter = sourceLetters[i % sourceLetters.length] || weightedLetter();
      const special = origin === 'attack' ? null : (introductionPlan[i] || nextSpecial());
      if (special && !player.introducedSpecials.includes(special)) player.introducedSpecials.push(special);
      player.board[target].push({ id: makeTileId(), letter, origin, special });
    }
  }

  function showScreen(id) {
    screens.forEach(screen => screen.classList.toggle('active', screen.id === id));
    window.scrollTo(0, 0);
  }

  function currentPlayer() { return state.players[state.current]; }
  function opponent() { return state.players[1 - state.current]; }
  function tileCount(player) { return player.board.reduce((sum, column) => sum + column.length, 0); }
  function tallest(player) { return Math.max(0, ...player.board.map(column => column.length)); }
  function overflowLimit() { return CONFIG.maxColumnHeight - state.barrierDrops; }
  function hasOverflowed(player) { return tallest(player) >= overflowLimit(); }
  function attackValue(length) {
    return length > state.minWordLength ? Math.min(CONFIG.maxAttackTiles, length - state.minWordLength) : 0;
  }

  function render() {
    const player = currentPlayer();
    $('#current-player').textContent = player.name;
    $('#opponent-name').textContent = opponent().name;
    $('#turn-number').textContent = state.turn;
    $('#opponent-count').textContent = tileCount(opponent());
    $('#opponent-danger').style.width = `${Math.min(100, tallest(opponent()) / CONFIG.maxColumnHeight * 100)}%`;
    $('#spy-count').textContent = player.spyGlasses;
    $('#spy-button').hidden = player.spyGlasses < 1;
    renderBarrierStatus();
    renderBoard();
    renderBuilder();
    renderWords();
  }

  function renderBarrierStatus() {
    const turnsRemaining = CONFIG.barrierDropEveryTurns - ((state.turn - 1) % CONFIG.barrierDropEveryTurns);
    const safeRows = Math.max(0, overflowLimit() - 1);
    $('#safe-rows').textContent = safeRows;
    $('#bar-countdown').textContent = turnsRemaining;
    $('#bar-countdown-unit').textContent = turnsRemaining === 1 ? 'turn' : 'turns';
    requestAnimationFrame(positionOverflowLine);
  }

  function positionOverflowLine() {
    const board = $('#letter-board');
    const line = $('#overflow-line');
    if (!board || !line) return;
    const tileSize = sizeLetterBoard(board);
    const topPadding = 24;
    line.style.top = `${topPadding + state.barrierDrops * (tileSize + 3)}px`;
  }

  function sizeLetterBoard(board) {
    if (!board.clientWidth) return 0;
    const style = getComputedStyle(board);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const columnGap = parseFloat(style.columnGap) || 0;
    const rowGap = 3;
    const contentWidth = board.clientWidth - horizontalPadding;
    const tileSize = (contentWidth - columnGap * (CONFIG.columns - 1)) / CONFIG.columns;
    const contentHeight = tileSize * CONFIG.maxColumnHeight + rowGap * (CONFIG.maxColumnHeight - 1);
    board.style.height = `${Math.ceil(contentHeight + verticalPadding + borderHeight)}px`;
    renderRowGuides(board, tileSize, rowGap, parseFloat(style.paddingBottom));
    return tileSize;
  }

  function renderRowGuides(board, tileSize, rowGap, bottomPadding) {
    board.querySelectorAll('.row-guide').forEach(guide => guide.remove());
    for (let row = 1; row <= CONFIG.maxColumnHeight; row += 1) {
      const guide = document.createElement('i');
      guide.className = 'row-guide';
      guide.style.bottom = `${bottomPadding + row * tileSize + (row - 1) * rowGap}px`;
      board.append(guide);
    }
  }

  function renderBoard() {
    const board = $('#letter-board');
    board.replaceChildren();
    currentPlayer().board.forEach((column, columnIndex) => {
      const columnEl = document.createElement('div');
      columnEl.className = 'letter-column';
      column.forEach((tile, tileIndex) => {
        const button = document.createElement('button');
        button.className = 'tile';
        button.type = 'button';
        const letter = document.createElement('span');
        letter.className = 'tile-letter';
        letter.textContent = tile.letter;
        button.append(letter);
        if (tile.special) {
          button.classList.add(`special-${tile.special}`);
          const badge = document.createElement('span');
          badge.className = 'special-badge';
          badge.textContent = specialSymbol(tile.special);
          button.append(badge);
        }
        button.setAttribute('aria-label', `${specialName(tile.special)} letter ${tile.letter}`.trim());
        if (state.selection.some(item => item.id === tile.id)) button.classList.add('selected');
        if (state.words.some(word => word.tiles.some(item => item.id === tile.id))) button.classList.add('in-word');
        if (tile.origin === 'fresh') button.classList.add('arrival-fresh');
        if (tile.origin === 'attack') button.classList.add('arrival-attack');
        button.addEventListener('click', () => selectTile(columnIndex, tileIndex, tile));
        columnEl.append(button);
      });
      board.append(columnEl);
    });
    requestAnimationFrame(positionOverflowLine);
  }

  function specialSymbol(special) {
    return { remove: '×', move: '↔', spy: '◉' }[special] || '';
  }

  function specialName(special) {
    return { remove: 'Pink removal', move: 'Gold relocation', spy: 'Red spy' }[special] || '';
  }

  function selectTile(column, index, tile) {
    const alreadyUsed = state.words.some(word => word.tiles.some(item => item.id === tile.id));
    if (alreadyUsed) return;
    const existing = state.selection.findIndex(item => item.id === tile.id);
    if (existing >= 0) state.selection.splice(existing, 1);
    else state.selection.push({ ...tile, column, index });
    renderBoard();
    renderBuilder();
  }

  function renderBuilder() {
    const holder = $('#current-word');
    holder.replaceChildren();
    holder.classList.toggle('empty', state.selection.length === 0);
    state.selection.forEach(tile => {
      const letter = document.createElement('span');
      letter.className = `word-letter${tile.special ? ` special-${tile.special}` : ''}`;
      letter.textContent = tile.letter;
      if (tile.special) {
        const badge = document.createElement('i');
        badge.textContent = specialSymbol(tile.special);
        letter.append(badge);
      }
      holder.append(letter);
    });
    const validLength = state.selection.length >= state.minWordLength;
    $('#add-word-button').disabled = !validLength;
    const attack = attackValue(state.selection.length);
    $('#builder-hint').textContent = validLength
      ? `${state.selection.length} letters${attack ? ` · sends ${attack} attack tile${attack === 1 ? '' : 's'}` : ''}`
      : `Choose at least ${state.minWordLength} letters`;
  }

  function addWord() {
    if (state.selection.length < state.minWordLength) return;
    state.words.push({
      text: state.selection.map(tile => tile.letter).join(''),
      tiles: [...state.selection],
      attack: attackValue(state.selection.length)
    });
    state.selection = [];
    render();
  }

  function renderWords() {
    const list = $('#word-list');
    list.replaceChildren();
    if (!state.words.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = 'No words assembled yet.';
      list.append(empty);
    } else {
      state.words.forEach(word => {
        const chip = document.createElement('span');
        chip.className = `word-chip${word.attack ? ' attack' : ''}`;
        chip.textContent = word.attack ? `${word.text}  +${word.attack}` : word.text;
        list.append(chip);
      });
    }
    const attacks = state.words.reduce((sum, word) => sum + word.attack, 0);
    $('#attack-total').textContent = attacks;
    renderPendingPowers();
    $('#submit-turn-button').disabled = state.words.length === 0;
  }

  function renderPendingPowers() {
    const holder = $('#pending-powers');
    holder.replaceChildren();
    const usedTiles = state.words.flatMap(word => word.tiles);
    const powers = [
      { type: 'remove', count: usedTiles.filter(tile => tile.special === 'remove').length, label: 'removal ready' },
      { type: 'move', count: usedTiles.filter(tile => tile.special === 'move').length, label: 'move ready' }
    ];
    const spyPairs = state.words.filter(word => word.tiles.filter(tile => tile.special === 'spy').length >= 2).length;
    powers.push({ type: 'spy', count: spyPairs, label: 'Spy Glass earned' });
    powers.filter(power => power.count > 0).forEach(power => {
      const chip = document.createElement('span');
      chip.className = `pending-power special-${power.type}`;
      chip.innerHTML = `<b>${specialSymbol(power.type)}</b><span>${power.count > 1 ? `${power.count} ` : ''}${power.label}</span>`;
      holder.append(chip);
    });
    const unpairedSpies = state.words.reduce((sum, word) => sum + (word.tiles.filter(tile => tile.special === 'spy').length % 2), 0);
    if (unpairedSpies) {
      const chip = document.createElement('span');
      chip.className = 'pending-power special-spy incomplete';
      chip.innerHTML = '<b>◉</b><span>1 of 2 red</span>';
      holder.append(chip);
    }
  }

  function undo() {
    if (state.selection.length) {
      state.selection.pop();
    } else if (state.words.length) {
      state.selection = state.words.pop().tiles;
    }
    render();
  }

  function removeUsedTiles(player) {
    const usedIds = new Set(state.words.flatMap(word => word.tiles.map(tile => tile.id)));
    player.board = player.board.map(column => column.filter(tile => !usedIds.has(tile.id)));
  }

  function submitTurn() {
    const player = currentPlayer();
    const enemy = opponent();
    const attacks = state.words.reduce((sum, word) => sum + word.attack, 0);
    const usedTiles = state.words.flatMap(word => word.tiles);
    const removals = usedTiles.filter(tile => tile.special === 'remove').length;
    const moves = usedTiles.filter(tile => tile.special === 'move').length;
    const spyGlasses = state.words.filter(word => word.tiles.filter(tile => tile.special === 'spy').length >= 2).length;
    removeUsedTiles(player);

    if (tileCount(player) === 0) return finish(player, `${player.name} cleared every letter from the board.`);
    state.resolution = {
      player,
      enemy,
      removals,
      moves,
      spyGlasses,
      attacks,
      stats: {
        lettersPlayed: usedTiles.length,
        removalsUsed: 0,
        movesUsed: 0,
        spyEarned: spyGlasses,
        attacksSent: 0
      },
      attackPool: usedTiles.map(tile => ({ id: tile.id, letter: tile.letter })),
      selectedAttacks: new Set(),
      moveSourceId: null
    };
    advanceResolution();
  }

  function advanceResolution() {
    const resolution = state.resolution;
    if (resolution.removals > 0) return showResolution('remove');
    if (resolution.moves > 0) return showResolution('move');
    if (resolution.spyGlasses > 0) {
      resolution.player.spyGlasses += resolution.spyGlasses;
      notify(`${resolution.spyGlasses} Spy Glass${resolution.spyGlasses === 1 ? '' : 'es'} earned`);
      resolution.spyGlasses = 0;
    }
    if (resolution.attacks > 0) return showResolution('attack');
    finalizeTurn();
  }

  function showResolution(mode) {
    state.resolution.mode = mode;
    state.resolution.moveSourceId = null;
    showScreen('resolution-screen');
    $('#resolution-board-wrap').hidden = mode === 'attack';
    $('#attack-picker').hidden = mode !== 'attack';
    $('#column-targets').hidden = true;
    $('#confirm-power-button').hidden = mode !== 'attack';
    $('#skip-power-button').textContent = mode === 'attack' ? 'Auto select' : 'Skip';

    if (mode === 'remove') {
      setPowerCopy('×', '', 'Pink tile', 'Remove a tile', 'Choose one remaining tile. Its special power will not activate.');
      $('#resolution-progress').textContent = `${state.resolution.removals} removal${state.resolution.removals === 1 ? '' : 's'} available`;
      renderResolutionBoard();
    } else if (mode === 'move') {
      setPowerCopy('↔', 'move', 'Gold tile', 'Relocate a tile', 'Choose a tile, then choose the column where it should land.');
      $('#resolution-progress').textContent = `${state.resolution.moves} move${state.resolution.moves === 1 ? '' : 's'} available`;
      renderResolutionBoard();
    } else {
      setPowerCopy('➜', 'attack', 'Word attack', 'Choose your ammunition', `Select exactly ${state.resolution.attacks} used letter${state.resolution.attacks === 1 ? '' : 's'} to send.`);
      renderAttackPicker();
    }
  }

  function setPowerCopy(symbol, style, kicker, title, instruction) {
    $('#power-emblem').textContent = symbol;
    $('#power-emblem').className = `power-emblem ${style}`.trim();
    $('#power-kicker').textContent = kicker;
    $('#power-title').textContent = title;
    $('#power-instruction').textContent = instruction;
  }

  function renderResolutionBoard() {
    const holder = $('#resolution-board');
    const resolution = state.resolution;
    holder.replaceChildren();
    resolution.player.board.forEach(column => {
      const columnEl = document.createElement('div');
      columnEl.className = 'letter-column';
      column.forEach(tile => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `tile${tile.special ? ` special-${tile.special}` : ''}`;
        if (tile.id === resolution.moveSourceId) button.classList.add('move-source');
        const letter = document.createElement('span');
        letter.className = 'tile-letter';
        letter.textContent = tile.letter;
        button.append(letter);
        if (tile.special) {
          const badge = document.createElement('span');
          badge.className = 'special-badge';
          badge.textContent = specialSymbol(tile.special);
          button.append(badge);
        }
        button.addEventListener('click', () => resolveBoardTile(tile));
        columnEl.append(button);
      });
      holder.append(columnEl);
    });
    requestAnimationFrame(() => sizeLetterBoard(holder));
  }

  function resolveBoardTile(tile) {
    const resolution = state.resolution;
    if (resolution.mode === 'remove') {
      removeTileById(resolution.player, tile.id);
      resolution.removals -= 1;
      resolution.stats.removalsUsed += 1;
      if (tileCount(resolution.player) === 0) return finish(resolution.player, `${resolution.player.name} cleared every letter from the board.`);
      return advanceResolution();
    }
    resolution.moveSourceId = tile.id;
    $('#power-instruction').textContent = `Move ${tile.letter}: choose its destination column.`;
    renderResolutionBoard();
    renderColumnTargets(tile);
  }

  function removeTileById(player, id) {
    player.board = player.board.map(column => column.filter(tile => tile.id !== id));
  }

  function renderColumnTargets(tile) {
    const holder = $('#column-targets');
    holder.hidden = false;
    holder.replaceChildren();
    state.resolution.player.board.forEach((column, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = index + 1;
      const sourceColumn = state.resolution.player.board.findIndex(items => items.some(item => item.id === tile.id));
      button.disabled = index === sourceColumn || column.length + 1 >= overflowLimit();
      button.addEventListener('click', () => completeMove(tile, index));
      holder.append(button);
    });
  }

  function completeMove(tile, destination) {
    removeTileById(state.resolution.player, tile.id);
    state.resolution.player.board[destination].push(tile);
    state.resolution.moves -= 1;
    state.resolution.stats.movesUsed += 1;
    state.resolution.moveSourceId = null;
    advanceResolution();
  }

  function renderAttackPicker() {
    const holder = $('#attack-picker');
    const resolution = state.resolution;
    holder.replaceChildren();
    resolution.attackPool.forEach(tile => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'attack-choice';
      button.textContent = tile.letter;
      button.classList.toggle('selected', resolution.selectedAttacks.has(tile.id));
      button.addEventListener('click', () => {
        if (resolution.selectedAttacks.has(tile.id)) resolution.selectedAttacks.delete(tile.id);
        else if (resolution.selectedAttacks.size < resolution.attacks) resolution.selectedAttacks.add(tile.id);
        renderAttackPicker();
      });
      holder.append(button);
    });
    $('#resolution-progress').textContent = `${resolution.selectedAttacks.size} of ${resolution.attacks} selected`;
    $('#confirm-power-button').disabled = resolution.selectedAttacks.size !== resolution.attacks;
  }

  function confirmAttacks() {
    const resolution = state.resolution;
    const letters = resolution.attackPool.filter(tile => resolution.selectedAttacks.has(tile.id)).map(tile => tile.letter);
    resolution.enemy.incoming.push(...letters);
    resolution.stats.attacksSent += letters.length;
    resolution.attacks = 0;
    advanceResolution();
  }

  function autoSelectAttacks() {
    const resolution = state.resolution;
    resolution.selectedAttacks = new Set(resolution.attackPool.slice(0, resolution.attacks).map(tile => tile.id));
    confirmAttacks();
  }

  function skipPower() {
    if (state.resolution.mode === 'remove') state.resolution.removals -= 1;
    else if (state.resolution.mode === 'move') state.resolution.moves -= 1;
    else return autoSelectAttacks();
    advanceResolution();
  }

  function finalizeTurn() {
    const { player, stats } = state.resolution;
    $('#review-player').textContent = player.name;
    renderStaticBoard($('#review-board'), player, { cascade: true });
    renderReviewSummary(stats);
    showScreen('turn-review-screen');
  }

  function renderReviewSummary(stats) {
    const entries = [
      [`${stats.lettersPlayed}`, 'letters played'],
      [`${stats.attacksSent}`, 'attack tiles sent']
    ];
    if (stats.removalsUsed) entries.push([`${stats.removalsUsed}`, 'tiles removed']);
    if (stats.movesUsed) entries.push([`${stats.movesUsed}`, 'tiles moved']);
    if (stats.spyEarned) entries.push([`${stats.spyEarned}`, 'Spy Glass earned']);
    const holder = $('#review-summary');
    holder.replaceChildren();
    entries.forEach(([value, label]) => {
      const item = document.createElement('div');
      item.innerHTML = `<b>${value}</b><span>${label}</span>`;
      holder.append(item);
    });
  }

  function handoffTurn() {
    const { player } = state.resolution;
    player.refillDue = true;
    const next = 1 - state.current;
    const waiting = state.players[next];
    const incomingCount = waiting.incoming.length;
    $('#handoff-player').textContent = waiting.name;
    $('#handoff-summary').textContent = incomingCount
      ? `${incomingCount} attack tile${incomingCount === 1 ? ' is' : 's are'} waiting to land.`
      : 'No enemy tiles this time. Fresh letters will arrive when you begin.';
    state.current = next;
    state.turn += 1;
    state.selection = [];
    state.words = [];
    state.resolution = null;
    state.turnPrepared = false;
    if (localSession) {
      saveLocalMatch();
      showRemoteWait();
      return;
    }
    showScreen('handoff-screen');
  }

  function beginNextTurn() {
    if (applyScheduledBarrierDrop()) return;
    const player = currentPlayer();
    state.turnPrepared = true;
    if (player.incoming.length) {
      const incoming = [...player.incoming];
      player.incoming = [];
      addTiles(player, incoming.length, 'attack', incoming);
      if (hasOverflowed(player)) return finish(opponent(), `${player.name} hit the overflow line while receiving the incoming attack.`);
    }
    if (player.refillDue) {
      addTiles(player, CONFIG.refillLetters, 'fresh');
      player.refillDue = false;
      if (hasOverflowed(player)) return finish(opponent(), `${player.name} hit the overflow line while receiving fresh letters.`);
    }
    showScreen('game-screen');
    render();
    settleArrivals(player);
    if (localSession) saveLocalMatch();
  }

  function applyScheduledBarrierDrop() {
    const scheduledDrops = Math.floor((state.turn - 1) / CONFIG.barrierDropEveryTurns);
    if (scheduledDrops <= state.barrierDrops) return false;
    state.barrierDrops = scheduledDrops;
    const overflowed = state.players.filter(hasOverflowed);
    if (overflowed.length === 2) {
      finish(null, `The overflow line dropped to row ${overflowLimit()}. Both towers crossed it together.`);
      return true;
    }
    if (overflowed.length === 1) {
      const loser = overflowed[0];
      const winner = state.players.find(player => player !== loser);
      finish(winner, `The overflow line dropped to row ${overflowLimit()}, overflowing ${loser.name}’s tower.`);
      return true;
    }
    notify(`Overflow ceiling lowered — ${Math.max(0, overflowLimit() - 1)} safe rows remain`);
    return false;
  }

  function settleArrivals(player) {
    const arrivingIds = new Set(
      player.board.flat().filter(tile => tile.origin !== 'existing').map(tile => tile.id)
    );
    if (!arrivingIds.size) return;
    setTimeout(() => {
      player.board.flat().forEach(tile => {
        if (arrivingIds.has(tile.id)) tile.origin = 'existing';
      });
      if (currentPlayer() === player && $('#game-screen').classList.contains('active')) render();
      if (localSession && currentPlayer() === player) saveLocalMatch();
    }, CONFIG.arrivalHighlightMs);
  }

  function finish(winner, reason) {
    state.outcome = { winnerIndex: winner ? state.players.indexOf(winner) : null, reason };
    renderOutcome(state.outcome);
    if (localSession) saveLocalMatch();
  }

  function renderOutcome(outcome) {
    const winner = outcome.winnerIndex === null ? null : state.players[outcome.winnerIndex];
    const title = $('#result-title');
    title.replaceChildren();
    if (winner) {
      const name = document.createElement('span');
      name.id = 'winner-name';
      name.textContent = winner.name;
      title.append(name, ' wins!');
    } else {
      title.textContent = 'The battle is a draw';
    }
    $('#win-reason').textContent = outcome.reason;
    showScreen('result-screen');
  }

  async function apiRequest(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (localSession?.playerToken) headers['X-Player-Token'] = localSession.playerToken;
    const response = await fetch(apiUrl(path), { ...options, headers });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.error || 'Network request failed');
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function apiUrl(path) {
    if (!remoteApiEndpoint) return `${API_BASE}${path}`;
    const route = path.match(/^\/matches(?:\/([A-Z2-9]{6}))?(?:\/(join|state))?$/);
    if (!route) throw new Error('Unsupported API route');
    const [, code, suffix] = route;
    const action = !code ? 'create' : suffix || 'get';
    const url = new URL(remoteApiEndpoint);
    url.searchParams.set('action', action);
    if (code) url.searchParams.set('code', code);
    return url.toString();
  }

  async function saveLocalMatch() {
    if (!localSession) return;
    localSession.saving = true;
    try {
      const record = await apiRequest(`/matches/${localSession.code}/state`, {
        method: 'PUT',
        body: JSON.stringify({ revision: localSession.revision, state })
      });
      localSession.revision = record.revision;
      rememberSession(localSession);
    } catch (error) {
      console.error('Unable to save online match', error);
      if (error.status === 409) setTimeout(() => localSession && syncLocalMatch(localSession.code), 0);
      else notify('Could not send this turn. Check your connection.');
    } finally {
      if (localSession) localSession.saving = false;
    }
  }

  async function createLocalMatch() {
    const name = $('#multiplayer-name').value.trim() || 'Player 1';
    const minWordLength = Number(document.querySelector('input[name="multiplayer-word-length"]:checked').value);
    try {
      const record = await apiRequest('/matches', {
        method: 'POST',
        body: JSON.stringify({ hostName: name, minWordLength })
      });
      rememberSession({ code: record.code, playerIndex: 0, playerToken: record.playerToken, revision: record.revision });
      $('#lobby-code').textContent = record.code;
      showScreen('lobby-screen');
    } catch (error) {
      console.error(error);
      notify('Could not create the battle. Check your connection.');
    }
  }

  async function joinLocalMatch() {
    const code = $('#join-code').value.trim().toUpperCase();
    try {
      const waiting = await apiRequest(`/matches/${code}`);
      if (waiting.status !== 'waiting') throw new Error('Battle is not waiting');
      const name = $('#multiplayer-name').value.trim() || 'Player 2';
      newState([waiting.hostName, name], waiting.minWordLength);
      const record = await apiRequest(`/matches/${code}/join`, {
        method: 'POST',
        body: JSON.stringify({ name, state })
      });
      rememberSession({ code, playerIndex: 1, playerToken: record.playerToken, revision: record.revision });
      showRemoteWait();
    } catch (error) {
      console.error(error);
      notify(error.status === 404 || error.status === 409 ? 'That battle is not available.' : 'Check the battle code and your connection.');
    }
  }

  function showRemoteWait() {
    $('#remote-player').textContent = state.players[state.current].name;
    $('#remote-code').textContent = localSession.code;
    showScreen('remote-wait-screen');
  }

  async function syncLocalMatch(code) {
    if (!localSession || localSession.code !== code || localSession.saving || syncInFlight) return;
    syncInFlight = true;
    try {
      const record = await apiRequest(`/matches/${code}`);
      localSession.revision = record.revision;
      rememberSession(localSession);
      if (record.status === 'waiting' || !record.state) return;
      state = record.state;
      if (state.outcome) {
        renderOutcome(state.outcome);
        return;
      }
      if (state.current !== localSession.playerIndex) {
        showRemoteWait();
        return;
      }
      if (!state.turnPrepared) beginNextTurn();
      else {
        showScreen('game-screen');
        render();
      }
    } catch (error) {
      console.error('Unable to refresh online match', error);
    } finally {
      syncInFlight = false;
    }
  }

  function setSetupMode(multiplayer) {
    $('#setup-form').hidden = multiplayer;
    $('#multiplayer-form').hidden = !multiplayer;
    $('#passplay-mode').classList.toggle('active', !multiplayer);
    $('#multiplayer-mode').classList.toggle('active', multiplayer);
  }

  function leaveLocalView() {
    rememberSession(null);
    showScreen('setup-screen');
  }

  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function useSpyGlass() {
    const player = currentPlayer();
    if (player.spyGlasses < 1) return;
    player.spyGlasses -= 1;
    $('#spy-opponent-name').textContent = opponent().name;
    renderStaticBoard($('#spy-board'), opponent());
    $('#spy-dialog').showModal();
    render();
    clearTimeout(spyTimer);
    spyTimer = setTimeout(() => {
      if ($('#spy-dialog').open) $('#spy-dialog').close();
    }, CONFIG.spyRevealMs);
  }

  function renderStaticBoard(holder, player, options = {}) {
    holder.replaceChildren();
    player.board.forEach(column => {
      const columnEl = document.createElement('div');
      columnEl.className = 'letter-column';
      column.forEach((tile, tileIndex) => {
        const tileEl = document.createElement('div');
        tileEl.className = `tile${tile.special ? ` special-${tile.special}` : ''}`;
        if (options.cascade) {
          tileEl.classList.add('cascade-tile');
          tileEl.style.animationDelay = `${(column.length - tileIndex - 1) * 55}ms`;
        }
        const letter = document.createElement('span');
        letter.className = 'tile-letter';
        letter.textContent = tile.letter;
        tileEl.append(letter);
        if (tile.special) {
          const badge = document.createElement('span');
          badge.className = 'special-badge';
          badge.textContent = specialSymbol(tile.special);
          tileEl.append(badge);
        }
        columnEl.append(tileEl);
      });
      holder.append(columnEl);
    });
    requestAnimationFrame(() => sizeLetterBoard(holder));
  }

  $('#setup-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const one = $('#player-one').value.trim() || 'Player 1';
      const two = $('#player-two').value.trim() || 'Player 2';
      const minWordLength = Number(document.querySelector('input[name="minimum-word-length"]:checked').value);
      newState([one, two], minWordLength);
      rememberSession(null);
      showScreen('game-screen');
      render();
    } catch (error) {
      console.error('Unable to start Word Wars', error);
      notify('The battle could not start. Please reload and try again.');
    }
  });
  $('#add-word-button').addEventListener('click', addWord);
  $('#undo-button').addEventListener('click', undo);
  $('#submit-turn-button').addEventListener('click', submitTurn);
  $('#skip-power-button').addEventListener('click', skipPower);
  $('#confirm-power-button').addEventListener('click', confirmAttacks);
  $('#review-continue-button').addEventListener('click', handoffTurn);
  $('#continue-button').addEventListener('click', beginNextTurn);
  $('#rematch-button').addEventListener('click', leaveLocalView);
  $('#rules-button').addEventListener('click', () => $('#rules-dialog').showModal());
  $('#close-rules').addEventListener('click', () => $('#rules-dialog').close());
  $('#spy-button').addEventListener('click', useSpyGlass);
  $('#close-spy').addEventListener('click', () => $('#spy-dialog').close());
  $('#passplay-mode').addEventListener('click', () => setSetupMode(false));
  $('#multiplayer-mode').addEventListener('click', () => setSetupMode(true));
  $('#create-local-match').addEventListener('click', createLocalMatch);
  $('#join-local-match').addEventListener('click', joinLocalMatch);
  $('#lobby-code').addEventListener('click', () => navigator.clipboard?.writeText($('#lobby-code').textContent));
  $('#cancel-lobby').addEventListener('click', () => {
    leaveLocalView();
  });
  $('#leave-local-match').addEventListener('click', leaveLocalView);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('#rules-dialog').open) $('#rules-dialog').close();
  });
  window.addEventListener('resize', () => {
    document.querySelectorAll('.screen.active .letter-board, dialog[open] .letter-board').forEach(sizeLetterBoard);
    positionOverflowLine();
  });
  setInterval(() => {
    if (localSession) syncLocalMatch(localSession.code);
  }, 1200);

  localSession = restoreSession();
  if (localSession) syncLocalMatch(localSession.code);

  // Exposed only to make the validation seam explicit for the next build.
  window.WordWarsPrototype = { CONFIG, notify };
})();
