// --- On-Screen Debug Konsole ---
window.onerror = function(message, source, lineno, colno, error) {
    const consoleElement = document.getElementById('debug-console');
    if (consoleElement) {
        const entry = document.createElement('div');
        entry.className = 'log-entry error';
        const fileName = source.split('/').pop();
        entry.innerHTML = `<strong>Fehler:</strong> ${message}<br><strong>Datei:</strong> ${fileName} (Zeile ${lineno})`;
        consoleElement.appendChild(entry);
    }
    return true;
};
function debugLog(message) {
    const consoleElement = document.getElementById('debug-console');
    if (consoleElement) {
        const entry = document.createElement('div');
        entry.className = 'log-entry info';
        entry.textContent = `LOG: ${message}`;
        consoleElement.appendChild(entry);
    }
}
// --- Ende der Debug Konsole ---

document.addEventListener('DOMContentLoaded', () => {
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false, spotifyToken = null;
    let countdownInterval = null, clientRoundTimer = null;
    let currentCustomInput = { value: '', type: null, target: null };

    const elements = {
        screens: document.querySelectorAll('.screen'),
        nicknameInput: document.getElementById('nickname-input'),
        nicknameSubmitButton: document.getElementById('nickname-submit-button'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        logoutButton: document.getElementById('logout-button'),
        showCreateButtonLogin: document.getElementById('show-create-button-login'),
        showCreateButtonAction: document.getElementById('show-create-button-action'),
        showJoinButton: document.getElementById('show-join-button'),
        modeSelectionScreen: document.getElementById('mode-selection-screen'),
        modeBoxes: document.querySelectorAll('.mode-box'),
        lobbyPinDisplay: document.getElementById('lobby-pin'),
        playerList: document.getElementById('player-list'),
        hostSettings: document.getElementById('host-settings'),
        deviceSelect: document.getElementById('device-select'),
        refreshDevicesButton: document.getElementById('refresh-devices-button'),
        playlistSelect: document.getElementById('playlist-select'),
        songCountOptions: document.getElementById('song-count-options'),
        guessTimeOptions: document.getElementById('guess-time-options'),
        startGameButton: document.getElementById('start-game-button'),
        guestWaitingMessage: document.getElementById('guest-waiting-message'),
        joinModalOverlay: document.getElementById('join-modal-overlay'),
        pinDisplayDigits: document.querySelectorAll('#join-modal-overlay .pin-digit'),
        numpadJoin: document.querySelectorAll('#numpad-join .num-btn'),
        joinGameButton: document.getElementById('join-game-button'),
        closeModalButtonExit: document.getElementById('close-modal-button-exit'),
        customInputModalOverlay: document.getElementById('custom-input-modal-overlay'),
        customInputTitle: document.getElementById('custom-input-title'),
        customInputDisplayDigits: document.querySelectorAll('#custom-input-display .pin-digit'),
        numpadCustom: document.querySelectorAll('#numpad-custom .num-btn'),
        customInputSubmit: document.getElementById('custom-input-submit'),
        customInputCancel: document.getElementById('custom-input-cancel'),
        countdownRoundInfo: document.getElementById('countdown-round-info'),
        countdownTimer: document.getElementById('countdown-timer'),
        roundInfo: document.getElementById('round-info'),
        timeLeft: document.getElementById('time-left'),
        artistGuess: document.getElementById('artist-guess'),
        titleGuess: document.getElementById('title-guess'),
        yearGuess: document.getElementById('year-guess'),
        submitGuessButton: document.getElementById('submit-guess-button'),
        readyButton: document.getElementById('ready-button'),
        readyStatus: document.getElementById('ready-status'),
        timelineScreen: document.getElementById('timeline-screen'),
        timelineContainer: document.getElementById('timeline-container'),
        timelineCurrentTitle: document.getElementById('timeline-current-title'),
        timelineCurrentArtist: document.getElementById('timeline-current-artist'),
        correctAnswerInfo: document.getElementById('correct-answer-info'),
        pointsBreakdown: document.getElementById('points-breakdown'),
        scoreboardList: document.getElementById('scoreboard-list'),
        headerScoreboard: document.getElementById('live-header-scoreboard'),
        leaveButton: document.querySelector('.button-leave'),
    };
    let currentPin = '';

    async function initializeApp() {
        elements.joinModalOverlay.classList.add('hidden');
        elements.customInputModalOverlay.classList.add('hidden');
        myNickname = localStorage.getItem('nickname');
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            if (!data.loggedIn) throw new Error('Nicht eingeloggt');
            spotifyToken = data.token;
            elements.showCreateButtonLogin.classList.add('hidden');
            elements.showCreateButtonAction.classList.remove('hidden');
            elements.logoutButton.classList.remove('hidden');
            if (myNickname) {
                elements.welcomeNickname.textContent = myNickname;
                showScreen('home-screen');
            } else {
                showScreen('nickname-screen');
            }
        } catch (error) {
            elements.showCreateButtonLogin.classList.remove('hidden');
            elements.showCreateButtonAction.classList.add('hidden');
            elements.logoutButton.classList.add('hidden');
            if (myNickname) {
                elements.welcomeNickname.textContent = myNickname;
                showScreen('home-screen');
            } else {
                showScreen('nickname-screen');
            }
        }
    }
    initializeApp();

    function connectToServer(onOpenCallback) {
        debugLog('Versuche, eine WebSocket-Verbindung aufzubauen...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.socket = new WebSocket(`${protocol}//${window.location.host}`);
        ws.socket.onopen = () => {
            debugLog('WebSocket-Verbindung erfolgreich geöffnet.');
            onOpenCallback();
        };
        ws.socket.onmessage = handleServerMessage;
        ws.socket.onerror = (event) => { window.onerror('WebSocket Fehler.', 'script.js', 0, 0, event); };
        ws.socket.onclose = (event) => { debugLog(`WebSocket geschlossen. Code: ${event.code}`); };
    }
    
    function sendMessage(type, payload) { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type, payload })); } }
    
    function handleServerMessage(event) {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case 'game-created': myPlayerId = payload.playerId; isHost = true; elements.lobbyPinDisplay.textContent = payload.pin; showScreen('lobby-screen'); fetchAndDisplayDevices(); fetchAndDisplayPlaylists(); break;
            case 'join-success': myPlayerId = payload.playerId; isHost = false; elements.lobbyPinDisplay.textContent = payload.pin; elements.joinModalOverlay.classList.add('hidden'); showScreen('lobby-screen'); break;
            case 'lobby-update': updateLobby(payload); break;
            case 'ready-update': elements.readyStatus.textContent = `${payload.readyCount}/${payload.totalPlayers} Spieler bereit`; break;
            case 'error': alert(`Fehler: ${payload.message}`); break;
            case 'round-countdown': showCountdown(payload); break;
            case 'new-round': 
                if (payload.gameMode === 'timeline') { startTimelineRound(payload); } 
                else { startRoundUI(payload); }
                updateHeaderScoreboard(payload.scores, payload.hostId); 
                break;
            case 'guess-received': if(elements.submitGuessButton) { elements.submitGuessButton.disabled = true; } break;
            case 'round-result': updateHeaderScoreboard(payload.scores, payload.hostId); showResultUI(payload); break;
            case 'game-over': elements.headerScoreboard.classList.add('hidden'); alert("Spiel vorbei!"); showScreen('home-screen'); break;
        }
    }

    function showScreen(screenId) {
        elements.screens.forEach(s => s.classList.remove('active'));
        const activeScreen = document.getElementById(screenId);
        if (activeScreen) activeScreen.classList.add('active');
        const showLeaveButton = ['lobby-screen', 'game-screen', 'result-screen', 'countdown-screen', 'timeline-screen', 'mode-selection-screen'].includes(screenId);
        elements.leaveButton.classList.toggle('hidden', !showLeaveButton);
        const showHeaderScoreboard = ['game-screen', 'result-screen', 'countdown-screen', 'timeline-screen'].includes(screenId);
        elements.headerScoreboard.classList.toggle('hidden', !showHeaderScoreboard);
    }
    
    async function fetchAndDisplayDevices() { /* ... (Code ist identisch) ... */ }
    async function fetchAndDisplayPlaylists() { /* ... (Code ist identisch) ... */ }
    function updateLobby({ pin, players, hostId, settings }) { /* ... (Code ist identisch) ... */ }
    function showCountdown({ round, totalRounds }) { /* ... (Code ist identisch) ... */ }

    function startRoundUI({ round, totalRounds, guessTime, totalPlayers }) {
        clearInterval(clientRoundTimer);
        elements.roundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        ['artist-guess', 'title-guess', 'year-guess'].forEach(id => document.getElementById(id).value = '');
        elements.submitGuessButton.disabled = false;
        elements.readyButton.disabled = false;
        elements.readyStatus.textContent = `0/${totalPlayers} Spieler bereit`;
        let time = guessTime;
        elements.timeLeft.textContent = time;
        clientRoundTimer = setInterval(() => { time--; elements.timeLeft.textContent = time; if (time <= 0) { clearInterval(clientRoundTimer); } }, 1000);
        showScreen('game-screen');
    }

    function startTimelineRound({ timeline, currentSong }) {
        elements.timelineContainer.innerHTML = '';
        let firstDropZone = document.createElement('div');
        firstDropZone.className = 'drop-zone';
        firstDropZone.dataset.index = 0;
        firstDropZone.innerHTML = '<i class="fa-solid fa-plus"></i>';
        elements.timelineContainer.appendChild(firstDropZone);
        timeline.forEach((card, index) => {
            let cardElement = document.createElement('div');
            cardElement.className = 'timeline-card';
            cardElement.innerHTML = `<span class="song-info" title="${card.title}">${card.title}</span><span class="song-info" title="${card.artist}">${card.artist}</span><span class="song-year">${card.year}</span>`;
            elements.timelineContainer.appendChild(cardElement);
            let dropZone = document.createElement('div');
            dropZone.className = 'drop-zone';
            dropZone.dataset.index = index + 1;
            dropZone.innerHTML = '<i class="fa-solid fa-plus"></i>';
            elements.timelineContainer.appendChild(dropZone);
        });
        elements.timelineCurrentTitle.textContent = currentSong.title;
        elements.timelineCurrentArtist.textContent = currentSong.artist;
        document.querySelectorAll('.drop-zone').forEach(zone => { zone.addEventListener('click', handleDropZoneClick, { once: true }); });
        showScreen('timeline-screen');
    }

    function handleDropZoneClick(event) {
        const index = event.currentTarget.dataset.index;
        sendMessage('submit-guess', { index: parseInt(index) });
        document.querySelectorAll('.drop-zone').forEach(zone => { zone.style.pointerEvents = 'none'; zone.style.opacity = '0.5'; });
    }

    function showResultUI({ song, scores, gameMode, timeline, myGuess, wasCorrect }) {
        clearInterval(clientRoundTimer);
        showScreen('result-screen');
        elements.scoreboardList.innerHTML = scores.map(p => `<li><span>${p.nickname}</span><span>${p.score}</span></li>`).join('');

        if (gameMode === 'timeline') {
            elements.correctAnswerInfo.textContent = `Der Song war "${song.title}" aus dem Jahr ${song.year}.`;
            let breakdownHtml = wasCorrect ? '<span><span class="points">Richtig platziert!</span></span>' : '<span>Leider falsch platziert.</span>';
            elements.pointsBreakdown.innerHTML = breakdownHtml;
        } else {
            elements.correctAnswerInfo.textContent = `${song.artist} - ${song.title} (${song.year})`;
            const myResult = scores.find(p => p.id === myPlayerId);
            let breakdownHtml = '';
            if (myResult && myResult.pointsBreakdown) {
                const breakdown = myResult.pointsBreakdown;
                if(breakdown.artist > 0) breakdownHtml += `<span>Künstler: <span class="points">+${breakdown.artist}</span></span>`;
                if(breakdown.title > 0) breakdownHtml += `<span>Titel: <span class="points">+${breakdown.title}</span></span>`;
                if(breakdown.year > 0) breakdownHtml += `<span>Jahr: <span class="points">+${breakdown.year}</span></span>`;
                if (breakdown.artist === 0 && breakdown.title === 0 && breakdown.year === 0) {
                    breakdownHtml = '<span>Leider keine Punkte in dieser Runde.</span>';
                }
            }
            elements.pointsBreakdown.innerHTML = breakdownHtml;
        }
    }
    
    function updateHeaderScoreboard(players, hostId) {
        if (!players || !Array.isArray(players)) return;
        elements.headerScoreboard.innerHTML = players
            .sort((a, b) => b.score - a.score)
            .map(p => `<span>${p.nickname}: ${p.score}${p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : ''}</span>`)
            .join('');
    }
    
    function updatePinDisplay() { elements.pinDisplayDigits.forEach((digit, index) => { digit.textContent = currentPin[index] || ''; digit.classList.toggle('filled', currentPin.length > index); }); }
    
    function updateCustomInputDisplay() {
        elements.customInputDisplayDigits.forEach((digit, index) => {
            digit.textContent = currentCustomInput.value[index] || '';
            digit.classList.toggle('filled', currentCustomInput.value.length > index);
        });
    }

    function sendSettingsUpdate() {
        if (!isHost) return;
        const songCountBtn = document.querySelector('#song-count-options .option-btn.active');
        const guessTimeBtn = document.querySelector('#guess-time-options .option-btn.active');
        sendMessage('update-settings', { 
            deviceId: elements.deviceSelect.value, 
            playlistId: elements.playlistSelect.value, 
            songCount: parseInt(songCountBtn.dataset.value), 
            guessTime: parseInt(guessTimeBtn.dataset.value) 
        });
    }
    
    // --- EVENT LISTENERS ---
    elements.nicknameSubmitButton.addEventListener('click', () => { myNickname = elements.nicknameInput.value.trim(); if (myNickname) { localStorage.setItem('nickname', myNickname); initializeApp(); } });
    elements.welcomeNickname.addEventListener('click', () => { elements.nicknameInput.value = myNickname; showScreen('nickname-screen'); });
    elements.logoutButton.addEventListener('click', async () => { await fetch('/logout', { method: 'POST' }); spotifyToken = null; window.location.reload(); });
    elements.showCreateButtonAction.addEventListener('click', () => showScreen('mode-selection-screen'));
    elements.showJoinButton.addEventListener('click', () => { currentPin = ''; updatePinDisplay(); elements.joinModalOverlay.classList.remove('hidden'); });
    
    elements.modeBoxes.forEach(box => {
        box.addEventListener('click', () => {
            const mode = box.dataset.mode;
            debugLog(`Spielmodus-Box geklickt: "${mode}"`);
            if (box.classList.contains('disabled')) {
                alert('Dieser Spielmodus ist noch nicht verfügbar.');
                return;
            }
            connectToServer(() => {
                debugLog(`Sende 'create-game' Nachricht für Modus: ${mode}`);
                sendMessage('create-game', { nickname: myNickname, token: spotifyToken, gameMode: mode });
            });
        });
    });

    const closeModal = () => elements.joinModalOverlay.classList.add('hidden');
    elements.closeModalButtonExit.addEventListener('click', closeModal);

    elements.numpadJoin.forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            const value = button.textContent.trim();
            if (action === 'clear') { currentPin = ''; } 
            else if (action === 'backspace') { currentPin = currentPin.slice(0, -1); } 
            else if (currentPin.length < 4 && !isNaN(parseInt(value))) { currentPin += value; }
            updatePinDisplay();
        });
    });

    elements.joinGameButton.addEventListener('click', () => { myNickname = localStorage.getItem('nickname'); if (currentPin.length === 4 && myNickname) { connectToServer(() => sendMessage('join-game', { pin: currentPin, nickname: myNickname })); } });
    
    elements.songCountOptions.addEventListener('click', (e) => {
        const target = e.target.closest('.option-btn');
        if (!target) return;
        if (target.dataset.action === 'custom') { openCustomInputDialog('Anzahl Songs', 'song-count', target); } 
        else { document.querySelectorAll('#song-count-options .option-btn').forEach(btn => btn.classList.remove('active')); target.classList.add('active'); sendSettingsUpdate(); }
    });

    elements.guessTimeOptions.addEventListener('click', (e) => {
        const target = e.target.closest('.option-btn');
        if (!target) return;
        if (target.dataset.action === 'custom') { openCustomInputDialog('Ratezeit (Sek.)', 'guess-time', target); } 
        else { document.querySelectorAll('#guess-time-options .option-btn').forEach(btn => btn.classList.remove('active')); target.classList.add('active'); sendSettingsUpdate(); }
    });

    function openCustomInputDialog(title, type, target) {
        currentCustomInput = { value: '', type, target };
        elements.customInputTitle.textContent = title;
        updateCustomInputDisplay();
        elements.customInputModalOverlay.classList.remove('hidden');
    }

    elements.numpadCustom.forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            const value = button.textContent.trim();
            if (action === 'clear') { currentCustomInput.value = ''; } 
            else if (action === 'backspace') { currentCustomInput.value = currentCustomInput.value.slice(0, -1); } 
            else if (currentCustomInput.value.length < 3 && !isNaN(parseInt(value))) { currentCustomInput.value += value; }
            updateCustomInputDisplay();
        });
    });

    elements.customInputSubmit.addEventListener('click', () => {
        if (!currentCustomInput.value) return;
        const { target, value, type } = currentCustomInput;
        const parentSelector = `#${type}-options`;
        document.querySelectorAll(`${parentSelector} .option-btn`).forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
        target.textContent = value;
        target.dataset.value = value;
        sendSettingsUpdate();
        elements.customInputModalOverlay.classList.add('hidden');
    });

    elements.customInputCancel.addEventListener('click', () => elements.customInputModalOverlay.classList.add('hidden'));

    elements.refreshDevicesButton.addEventListener('click', fetchAndDisplayDevices);
    elements.deviceSelect.addEventListener('change', sendSettingsUpdate);
    elements.playlistSelect.addEventListener('change', sendSettingsUpdate);
    
    elements.startGameButton.addEventListener('click', () => {
        if (!elements.deviceSelect.value) { alert("Bitte wähle zuerst ein Wiedergabegerät aus."); return; }
        sendMessage('start-game');
    });

    elements.submitGuessButton.addEventListener('click', () => {
        const guess = { artist: elements.artistGuess.value.trim(), title: elements.titleGuess.value.trim(), year: parseInt(elements.yearGuess.value, 10) || 0 };
        sendMessage('submit-guess', { guess });
    });

    elements.readyButton.addEventListener('click', () => {
        sendMessage('player-ready');
        elements.readyButton.disabled = true;
    });

    elements.leaveButton.addEventListener('click', () => {
        if (ws.socket) { ws.socket.onclose = () => {}; ws.socket.close(); ws.socket = null; }
        showScreen('home-screen');
    });
});
