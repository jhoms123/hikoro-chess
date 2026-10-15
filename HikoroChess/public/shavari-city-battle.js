(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const STORAGE_KEY = 'shavari-city-battle-local-v1';
    const courts = { carnelian: 'Carnelian court', turquoise: 'Turquoise court' };
    let engine, setup, state, journal = [], cursor = 0, flipped = false, symbolSet = 'shavari', selected = null, pendingLanding = null;
    let botSeat = null, botPaused = false, botThinking = false, botGeneration = 0, botWorker = null, botErrorPly = -1;
    let cells = [];

    function announce(message) {
        const notice = $('notice');
        notice.textContent = message;
        notice.hidden = !message;
    }

    function saveLocal() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 4, journal, cursor, flipped, botSeat, botPaused, symbolSet }));
        } catch {
            announce('Browser storage is unavailable. Save a game record before leaving this page.');
        }
    }

    function restoreLocal() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (![1, 2, 3, 4].includes(saved?.version) || !Array.isArray(saved.journal) || !Number.isInteger(saved.cursor)) return false;
            const restored = engine.replay(saved.journal, saved.cursor);
            if (!restored || !engine.replay(saved.journal)) return false;
            journal = saved.journal;
            cursor = saved.cursor;
            flipped = Boolean(saved.flipped);
            symbolSet = saved.version >= 4 && saved.symbolSet === 'hanzi' ? 'hanzi' : 'shavari';
            botSeat = saved.version >= 2 && ['carnelian', 'turquoise', 'both'].includes(saved.botSeat) ? saved.botSeat : null;
            botPaused = botSeat === 'both' && saved.version >= 3 && Boolean(saved.botPaused);
            $('local-opponent').value = botSeat || 'none';
            window.BotDifficulty?.show('shavari-city-battle', Boolean(botSeat));
            state = restored;
            return true;
        } catch {
            return false;
        }
    }

    function isBotTurn() { return Boolean(state && botSeat && (botSeat === 'both' || state.turn === botSeat)); }

    function cancelBot() {
        botGeneration++;
        botThinking = false;
        botErrorPly = -1;
        if (botWorker) { botWorker.terminate(); botWorker = null; }
    }

    function scheduleBot() {
        if (!isBotTurn() || botPaused || state.result || botThinking || botErrorPly === state.ply) return;
        const ticket = ++botGeneration;
        botThinking = true;
        selected = null;
        render();
        try {
            const worker = new Worker('/shavari-city-battle-bot-worker.js?v=20261015-city-stacks-hanzi-v1');
            botWorker = worker;
            worker.onmessage = event => {
                if (ticket !== botGeneration) return;
                botWorker = null;
                botThinking = false;
                worker.terminate();
                const action = event.data?.action;
                if (event.data?.error || !action) {
                    botErrorPly = state.ply;
                    announce('The Shavari bot could not find a move. Change the opponent setting or reload the match to retry.');
                    render();
                    return;
                }
                botErrorPly = -1;
                playMove(action, true);
            };
            worker.onerror = () => {
                if (ticket !== botGeneration) return;
                botWorker = null;
                botThinking = false;
                worker.terminate();
                botErrorPly = state.ply;
                announce('The Shavari bot worker could not start. Change the opponent setting or reload the match to retry.');
                render();
            };
            worker.postMessage({ id: ticket, setup, journal: journal.slice(0, cursor), cursor, ms: window.BotDifficulty?.get('shavari-city-battle') || 1000 });
        } catch {
            botThinking = false;
            botWorker = null;
            botErrorPly = state.ply;
            announce('The Shavari bot worker could not start. Change the opponent setting or reload the match to retry.');
            render();
        }
    }

    function labelVector(dx, dy) {
        const names = { '0,-1': 'north', '1,-1': 'northeast', '1,0': 'east', '1,1': 'southeast', '0,1': 'south', '-1,1': 'southwest', '-1,0': 'west', '-1,-1': 'northwest' };
        return names[dx + ',' + dy] || `Δ file ${dx > 0 ? '+' : ''}${dx}, Δ row ${dy > 0 ? '+' : ''}${dy}`;
    }

    function ruleSummary(piece) {
        const movement = piece.movement || {}, lines = [];
        for (const [kind, key] of [['Step', 'steps'], ['Jump', 'jumps'], ['Line', 'rays']]) {
            const entries = (movement[key] || []).map(rule => {
                const vector = labelVector(Number(rule.dx) || 0, Number(rule.dy) || 0);
                const distance = kind === 'Line' ? (rule.maxDistance ? ` · ${rule.maxDistance} squares` : ' · to the edge') : '';
                return `${vector}${distance}${rule.capture ? ' · can capture' : ' · no capture'}`;
            });
            if (entries.length) lines.push(`${kind}: ${entries.join('; ')}`);
        }
        return lines.join(' · ') || 'No movement rules in the supplied setup.';
    }

    function buildBoard() {
        const board = $('city-board');
        board.replaceChildren();
        cells = [];
        for (let y = 0; y < engine.ROWS; y++) {
            for (let x = 0; x < engine.COLS; x++) {
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'city-square';
                cell.dataset.x = String(x);
                cell.dataset.y = String(y);
                cell.setAttribute('role', 'gridcell');
                cell.tabIndex = x === Math.floor(engine.COLS / 2) && y === engine.ROWS - 1 ? 0 : -1;
                cell.addEventListener('click', () => choose({ x, y }));
                cell.addEventListener('keydown', event => moveFocus(event, x, y));
                cells.push(cell);
                board.append(cell);
            }
        }
        drawCoordinates();
    }

    function drawCoordinates() {
        $('files-top').replaceChildren();
        $('files-bottom').replaceChildren();
        $('ranks-left').replaceChildren();
        $('ranks-right').replaceChildren();
        for (let col = 0; col < engine.COLS; col++) {
            const file = engine.FILES[flipped ? engine.COLS - 1 - col : col];
            for (const id of ['files-top', 'files-bottom']) {
                const mark = document.createElement('span');
                mark.textContent = file;
                $(id).append(mark);
            }
        }
        for (let row = 0; row < engine.ROWS; row++) {
            const rank = flipped ? row + 1 : engine.ROWS - row;
            for (const id of ['ranks-left', 'ranks-right']) {
                const mark = document.createElement('span');
                mark.textContent = String(rank);
                $(id).append(mark);
            }
        }
    }

    function moveFocus(event, x, y) {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const sign = flipped ? -1 : 1;
        const nx = Math.max(0, Math.min(engine.COLS - 1, x + delta[0] * sign));
        const ny = Math.max(0, Math.min(engine.ROWS - 1, y + delta[1] * sign));
        const target = cells[engine.index(nx, ny)];
        cells.forEach(node => { node.tabIndex = node === target ? 0 : -1; });
        target.focus();
    }

    function choose(point) {
        if (!state || state.result || botThinking || isBotTurn()) return;
        const at = engine.index(point.x, point.y);
        if (selected) {
            const moves = engine.legalMoves(state, selected);
            const destination = moves.find(move => move.x === point.x && move.y === point.y);
            if (destination) {
                const action = { from: { ...selected }, to: { ...point } };
                if (destination.options.includes('capture') && destination.options.includes('cover')) {
                    pendingLanding = action;
                    $('capture-landing').hidden = false;
                    $('cover-landing').hidden = false;
                    $('landing-dialog').showModal();
                    $('cancel-landing').focus();
                } else {
                    playMove({ ...action, kind: destination.options[0] });
                }
                return;
            }
        }
        const stack = state.board[at];
        if (stack.length && stack[stack.length - 1].owner === state.turn) selected = point;
        else selected = null;
        render();
    }

    function playMove(action, fromBot = false) {
        if (fromBot ? !isBotTurn() : isBotTurn()) return;
        const next = engine.apply(state, action);
        if (!next) { announce('That move is no longer legal. Choose another highlighted square.'); render(); return; }
        journal = journal.slice(0, cursor);
        journal.push(action);
        cursor++;
        state = next;
        selected = null;
        pendingLanding = null;
        announce('');
        saveLocal();
        render();
        if (isBotTurn()) setTimeout(scheduleBot, 120);
    }

    function pieceCounts() {
        const counts = { carnelian: 0, turquoise: 0 };
        state.board.forEach(stack => stack.forEach(piece => { counts[piece.owner]++; }));
        return counts;
    }

    function renderStrips(counts) {
        const top = flipped ? 'carnelian' : 'turquoise';
        const bottom = flipped ? 'turquoise' : 'carnelian';
        for (const [position, side] of [['top', top], ['bottom', bottom]]) {
            const strip = $(`${position}-strip`);
            strip.className = `player-strip city-player-strip ${side}${state.turn === side && !state.result ? ' active' : ''}`;
            $(`${position}-name`).textContent = courts[side];
            $(`${position}-caption`).textContent = side === 'carnelian' ? 'Southern army · moves first' : 'Northern army';
            $(`${position}-count`).textContent = `${counts[side]} pieces`;
        }
        $('turnDot').className = `turn-dot ${state.turn}`;
        $('piece-counts').replaceChildren();
        for (const side of ['carnelian', 'turquoise']) {
            const item = document.createElement('span');
            item.className = `count-chip ${side}`;
            const mark = document.createElement('i');
            const label = document.createElement('strong');
            const number = document.createElement('small');
            label.textContent = courts[side];
            number.textContent = `${counts[side]} remaining`;
            item.append(mark, label, number);
            $('piece-counts').append(item);
        }
        $('building-count').textContent = `${state.buildings.filter(Boolean).length} city buildings block the lanes.`;
    }

    function pieceSymbol(type, className) {
        if (symbolSet === 'hanzi' && type?.hanzi) {
            const label = document.createElement('span');
            label.className = `${className} city-piece-hanzi`;
            label.textContent = type.hanzi;
            label.setAttribute('aria-hidden', 'true');
            return label;
        }
        if (type?.icon) {
            const image = document.createElement('img');
            image.className = className;
            image.src = `/assets/shavari/${type.icon}.svg`;
            image.alt = '';
            image.setAttribute('aria-hidden', 'true');
            return image;
        }
        const mark = document.createElement('span');
        mark.className = className;
        mark.textContent = type?.mark || type?.name?.slice(0, 2).toUpperCase() || '?';
        mark.setAttribute('aria-hidden', 'true');
        return mark;
    }

    function drawPiece(cell, stack) {
        const top = stack[stack.length - 1];
        const type = engine.types.get(top.typeId);
        if (!type) return;
        const token = document.createElement('span');
        token.className = `city-piece ${top.owner}`;
        token.style.setProperty('--piece-accent', type.accent || '#c6a465');
        token.append(pieceSymbol(type, 'city-piece-symbol'));
        if (stack.length > 1) {
            const badge = document.createElement('span');
            badge.className = 'city-stack-badge';
            badge.textContent = String(stack.length);
            token.append(badge);
        }
        cell.append(token);
        if (stack.length > 1) {
            const ribbon = document.createElement('span');
            ribbon.className = 'city-stack-ribbon';
            stack.slice(-3).forEach(piece => {
                const member = document.createElement('i');
                member.className = piece.owner;
                ribbon.append(member);
            });
            cell.append(ribbon);
        }
    }

    function renderBoard(moves) {
        const legal = new Map(moves.map(move => [engine.index(move.x, move.y), move]));
        cells.forEach((cell, i) => {
            const x = i % engine.COLS, y = Math.floor(i / engine.COLS), stack = state.board[i], move = legal.get(i);
            const isSelected = selected?.x === x && selected?.y === y;
            const isBuilding = state.buildings[i];
            const classes = ['city-square', (x + y) % 2 ? 'stone-dark' : 'stone-light'];
            if (isBuilding) classes.push('building-square');
            if (isSelected) classes.push('selected');
            if (move) {
                if (move.options.includes('capture')) classes.push('legal-capture');
                else if (move.options.includes('cover')) classes.push('legal-cover');
                else if (move.options.includes('stack')) classes.push('legal-stack');
                else classes.push('legal-move');
            }
            if ([state.lastMove?.from, state.lastMove?.to].some(point => point?.x === x && point?.y === y)) classes.push('last-move');
            cell.className = classes.join(' ');
            cell.style.gridColumnStart = String((flipped ? engine.COLS - 1 - x : x) + 1);
            cell.style.gridRowStart = String((flipped ? engine.ROWS - 1 - y : y) + 1);
            cell.replaceChildren();
            if (stack.length) drawPiece(cell, stack);
            if (move) {
                const marker = document.createElement('span');
                marker.className = 'city-target-mark';
                marker.setAttribute('aria-hidden', 'true');
                marker.textContent = move.options.includes('capture') ? '×' : move.options.includes('cover') ? '⊕' : move.options.includes('stack') ? '+' : '';
                cell.append(marker);
            }
            const names = stack.map(piece => `${courts[piece.owner]} ${engine.types.get(piece.typeId)?.name || piece.typeId}`);
            const place = engine.coord({ x, y });
            const occupant = names.length ? `${names.join(', ')}; ${stack.length} high` : isBuilding ? 'building' : 'empty';
            const action = move ? `; legal ${move.options.join(' or ')}` : '';
            cell.setAttribute('aria-label', `${place}: ${occupant}${action}`);
            cell.setAttribute('aria-pressed', String(isSelected));
            cell.title = `${place} · ${occupant}${action}`;
        });
        $('city-board').classList.toggle('flipped', flipped);
    }

    function renderSelection(moves) {
        const box = $('selected-detail');
        box.replaceChildren();
        if (!selected) { box.textContent = 'Choose one of the active court’s pieces.'; return; }
        const stack = state.board[engine.index(selected.x, selected.y)];
        const icons = document.createElement('div');
        icons.className = 'selection-pieces';
        stack.forEach(piece => {
            const type = engine.types.get(piece.typeId);
            const mark = pieceSymbol(type, `selection-mark ${piece.owner}`);
            mark.style.setProperty('--piece-accent', type?.accent || '#c6a465');
            mark.title = `${courts[piece.owner]} · ${type?.name || piece.typeId}`;
            icons.append(mark);
        });
        const text = document.createElement('div');
        const heading = document.createElement('strong');
        const description = document.createElement('small');
        heading.textContent = `${engine.coord(selected)} · ${stack.length === 1 ? 'Single piece' : `${stack.length}-piece formation`}`;
        description.textContent = `${courts[stack[stack.length - 1].owner]} controls · ${new Set(moves.map(move => `${move.x},${move.y}`)).size} legal destinations · whole formation moves`;
        text.append(heading, description);
        box.append(icons, text);
    }

    function renderHistory() {
        const history = $('move-log');
        const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 36;
        history.replaceChildren();
        state.history.slice(-120).forEach((move, i) => {
            const line = document.createElement('li');
            const number = document.createElement('span');
            const text = document.createElement('span');
            const marker = { move: '→', stack: '+', capture: '×', cover: '⊕' }[move.kind] || '→';
            number.className = 'ply-no';
            number.textContent = `${Math.max(0, state.history.length - 120) + i + 1}.`;
            text.textContent = `${courts[move.player]} · ${move.types.join('+')} ${engine.coord(move.from)} ${marker} ${engine.coord(move.to)}${move.captured.length ? ` · took ${move.captured.join('+')}` : ''}${move.height > 1 ? ` · ${move.height} high` : ''}`;
            line.append(number, text);
            history.append(line);
        });
        if (!state.history.length) {
            const empty = document.createElement('li');
            empty.className = 'empty-history';
            empty.textContent = 'The city is quiet. Make the first move.';
            history.append(empty);
        }
        if (nearBottom) history.scrollTop = history.scrollHeight;
        $('move-count').textContent = `${state.ply}${state.ply === 1 ? ' ply' : ' plies'}`;
        $('undo-move').disabled = cursor === 0;
        $('redo-move').disabled = cursor >= journal.length;
    }

    function renderStatus(moves) {
        if (state.result) {
            $('statusMain').textContent = state.result.winner ? `${courts[state.result.winner]} wins` : 'Draw';
            $('statusSub').textContent = state.result.reason;
        } else {
            const botMatch = botSeat === 'both';
            const movingLabel = botMatch ? `${courts[state.turn]} bot` : 'Shavari bot';
            $('statusMain').textContent = botPaused ? 'Bot match paused' : botThinking ? `${movingLabel} is thinking…` : isBotTurn() ? `${movingLabel} to move` : `${courts[state.turn]} to move`;
            $('statusSub').textContent = botPaused ? 'Resume the bot match when you are ready.' : botThinking ? 'Searching legal moves for the 16 × 17 city board…' : isBotTurn() ? 'The bot is choosing a move using the supplied City Battle rules.' : selected ? `${new Set(moves.map(move => `${move.x},${move.y}`)).size} legal destinations · tap a highlighted square.` : 'Select a piece, then tap one of its highlighted destinations.';
        }
        $('toggle-bot-match').hidden = botSeat !== 'both';
        $('toggle-bot-match').disabled = Boolean(state.result);
        $('toggle-bot-match').textContent = botPaused ? 'Resume bot match' : 'Pause bot match';
    }

    function render() {
        if (!state) return;
        const symbolToggle = $('toggle-piece-symbols');
        symbolToggle.textContent = symbolSet === 'hanzi' ? 'Use Shavari artwork' : 'Use Chinese characters';
        symbolToggle.setAttribute('aria-pressed', String(symbolSet === 'hanzi'));
        const moves = selected && !state.result ? engine.legalMoves(state, selected) : [];
        renderBoard(moves);
        renderSelection(moves);
        renderHistory();
        renderStatus(moves);
        renderStrips(pieceCounts());
    }

    function buildPieceGuide() {
        $('piece-guide').replaceChildren();
        for (const piece of setup.pieceTypes) {
            const card = document.createElement('article');
            card.className = 'city-guide-card';
            const badge = document.createElement('span');
            badge.className = 'guide-mark';
            badge.style.setProperty('--piece-accent', piece.accent || '#c6a465');
            badge.append(pieceSymbol(piece, 'guide-piece-symbol'));
            const copy = document.createElement('div');
            const title = document.createElement('h3');
            const moves = document.createElement('p');
            title.textContent = piece.name;
            moves.textContent = ruleSummary(piece);
            copy.append(title, moves);
            card.append(badge, copy);
            $('piece-guide').append(card);
        }
    }

    function rebuild() {
        const restored = engine.replay(journal, cursor);
        if (!restored) { announce('The saved move record no longer matches this setup. A new match is ready.'); journal = []; cursor = 0; state = engine.initial(); }
        else state = restored;
        selected = null;
        saveLocal();
        render();
    }

    function downloadRecord() {
        const data = {
            format: 'shavari-city-battle-record',
            schemaVersion: 1,
            setup: 'shavari-city-battle-setup.json',
            journal: journal.slice(0, cursor),
            result: state.result,
            updatedAt: new Date().toISOString()
        };
        const link = document.createElement('a');
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        link.href = url;
        link.download = 'shavari-city-battle-record.json';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        announce('Game record downloaded.');
    }

    function resetMatch() {
        cancelBot();
        botPaused = false;
        journal = [];
        cursor = 0;
        selected = null;
        state = engine.initial();
        announce('New match started. Carnelian moves first.');
        saveLocal();
        render();
    }

    async function start() {
        try {
            const response = await fetch('/shavari-city-battle-setup.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error('The City Battle setup file could not be loaded.');
            setup = await response.json();
            engine = window.ShavariCityBattleEngine.create(setup);
            state = engine.initial();
            buildBoard();
            const restored = restoreLocal();
            buildPieceGuide();
            render();
            if (!restored) saveLocal();
            if (isBotTurn()) scheduleBot();
            if (new URLSearchParams(location.search).has('showRules')) requestAnimationFrame(() => $('rules-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }));
        } catch (error) {
            $('statusMain').textContent = 'City Battle could not start';
            $('statusSub').textContent = error.message;
            announce('Reload this page to try again.');
        }
    }

    $('flip-board').addEventListener('click', () => { flipped = !flipped; drawCoordinates(); saveLocal(); render(); });
    $('toggle-piece-symbols').addEventListener('click', () => {
        symbolSet = symbolSet === 'hanzi' ? 'shavari' : 'hanzi';
        saveLocal();
        buildPieceGuide();
        render();
    });
    $('undo-move').addEventListener('click', () => {
        if (!cursor) return;
        cancelBot();
        cursor--;
        if (botSeat === 'both') {
            botPaused = true;
            announce('Bot match paused at the previous move.');
            rebuild();
            return;
        }
        let restored = engine.replay(journal, cursor);
        while (botSeat && cursor > 0 && restored?.turn === botSeat) { cursor--; restored = engine.replay(journal, cursor); }
        announce('Undid the last turn.');
        rebuild();
    });
    $('redo-move').addEventListener('click', () => {
        if (cursor >= journal.length) return;
        cancelBot();
        cursor++;
        if (botSeat === 'both') {
            botPaused = true;
            announce('Bot match paused at the restored move.');
            rebuild();
            return;
        }
        let restored = engine.replay(journal, cursor);
        while (botSeat && cursor < journal.length && restored?.turn === botSeat) { cursor++; restored = engine.replay(journal, cursor); }
        announce('Restored the next turn.');
        rebuild();
        if (isBotTurn()) scheduleBot();
    });
    $('save-record').addEventListener('click', downloadRecord);
    $('new-game').addEventListener('click', () => {
        if (cursor) $('confirm-dialog').showModal();
        else { resetMatch(); if (isBotTurn()) scheduleBot(); }
    });
    $('cancel-new').addEventListener('click', () => $('confirm-dialog').close());
    $('accept-new').addEventListener('click', () => { $('confirm-dialog').close(); resetMatch(); if (isBotTurn()) scheduleBot(); });
    $('cancel-landing').addEventListener('click', () => { pendingLanding = null; $('landing-dialog').close(); });
    $('capture-landing').addEventListener('click', () => { const action = pendingLanding; $('landing-dialog').close(); if (action) playMove({ ...action, kind: 'capture' }); });
    $('cover-landing').addEventListener('click', () => { const action = pendingLanding; $('landing-dialog').close(); if (action) playMove({ ...action, kind: 'cover' }); });
    $('toggle-bot-match').addEventListener('click', () => {
        if (botSeat !== 'both' || state.result) return;
        botPaused = !botPaused;
        if (botPaused) cancelBot();
        announce(botPaused ? 'Bot match paused.' : 'Bot match resumed.');
        saveLocal();
        render();
        if (!botPaused) scheduleBot();
    });
    $('local-opponent').addEventListener('change', () => {
        cancelBot();
        botSeat = ['carnelian', 'turquoise', 'both'].includes($('local-opponent').value) ? $('local-opponent').value : null;
        botPaused = false;
        window.BotDifficulty?.show('shavari-city-battle', Boolean(botSeat));
        selected = null;
        announce(botSeat === 'both' ? 'Bot vs Bot match started.' : botSeat ? `${courts[botSeat]} is controlled by the Shavari bot.` : 'Two-player pass-and-play selected.');
        saveLocal();
        render();
        if (isBotTurn()) scheduleBot();
    });
    window.BotDifficulty?.attach('shavari-city-battle', $('local-opponent-control'));
    window.BotDifficulty?.show('shavari-city-battle', Boolean(botSeat));
    start();
})();
