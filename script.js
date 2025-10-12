document.addEventListener('DOMContentLoaded', () => {
    // Globale Variablen
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false;
    let spotifyToken = null;

    // HTML-Elemente
    const elements = {
        screens: document.querySelectorAll('.screen'),
        nicknameInput: document.getElementById('nickname-input'),
        nicknameSubmitButton: document.getElementById('nickname-submit-button'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        logoutButton: document.getElementById('logout-button'),
        showCreateButtonLogin: document.getElementById('show-create-button-login'),
        showCreateButtonAction: document.getElementById('show-create-button-action'),
        showJoinButton: document.getElementById('show-join-button'),
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
        pinDisplayDigits: document.querySelectorAll('.pin-display .pin-digit'),
        numpadButtons: document.querySelectorAll('#numpad .num-btn'),
        joinGameButton: document.getElementById('join-game-button'),
        closeModalButton: document.getElementById('close-modal-button'),
        closeModalButtonExit: document.getElementById('close-modal-button-exit'),
        countdownRoundInfo: document.getElementById('countdown-round-info'),
        countdownTimer: document.getElementById('countdown-timer'),
        roundInfo: document.getElementById('round-info'),
        timeLeft: document.getElementById('time-left'),
        artistGuess: document.getElementById('artist-guess'),
        titleGuess: document.getElementById('title-guess'),
        yearGuess: document.getElementById('year-guess'),
        submitGuessButton: document.getElementById('submit-guess-button'),
        correctAnswerInfo: document.getElementById('correct-answer-info'),
        scoreboardList: document.getElementById('scoreboard-list'),
        liveScoreboard: document.getElementById('live-scoreboard'),
        leaveButton: document.querySelector('.button-leave'),
    };
    let currentPin = '';
    let clientRoundTimer = null;

    async function initializeApp() {
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
    function connectToServer(onOpenCallback) { const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; ws.socket = new WebSocket(`${protocol}//${window.location.host}`); ws.socket.onopen = onOpenCallback; ws.socket.onmessage = handleServerMessage; }
    function sendMessage(type, payload) { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type, payload })); } }
    function handleServerMessage(event) {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case 'game-created': myPlayerId = payload.playerId; isHost = true; elements.lobbyPinDisplay.textContent = payload.pin; showScreen('lobby-screen'); fetchAndDisplayDevices(); fetchAndDisplayPlaylists(); break;
            case 'join-success': myPlayerId = payload.playerId; isHost = false; elements.lobbyPinDisplay.textContent = payload.pin; elements.joinModalOverlay.classList.add('hidden'); showScreen('lobby-screen'); break;
            case 'lobby-update': updateLobby(payload); break;
            case 'error': alert(`Fehler: ${payload.message}`); break;
            case 'round-countdown': showCountdown(payload); break;
            case 'new-round': updateLiveScoreboard(payload.scores); startRoundUI(payload); break;
            case 'guess-received': elements.submitGuessButton.disabled = true; elements.submitGuessButton.textContent = "Warte..."; break;
            case 'round-result': updateLiveScoreboard(payload.scores); showResultUI(payload); break;
            case 'game-over': elements.liveScoreboard.classList.add('hidden'); alert("Spiel vorbei!"); showScreen('home-screen'); break;
        }
    }
    function showScreen(screenId) {
        elements.screens.forEach(s => s.classList.toggle('active', s.id === screenId));
        const showLeaveButton = ['lobby-screen', 'game-screen', 'result-screen', 'countdown-screen'].includes(screenId);
        elements.leaveButton.classList.toggle('hidden', !showLeaveButton);
    }
    async function fetchAndDisplayDevices() {
        elements.refreshDevicesButton.disabled = true;
        elements.deviceSelect.innerHTML = `<option>Suche Geräte...</option>`;
        try {
            const response = await fetch('/api/devices', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!response.ok) throw new Error('Server-Antwort nicht ok');
            const data = await response.json();
            if (data.devices && data.devices.length > 0) {
                elements.deviceSelect.innerHTML = data.devices.map(d => `<option value="${d.id}" ${d.is_active ? 'selected' : ''}>${d.name} (${d.type})</option>`).join('');
            } else {
                elements.deviceSelect.innerHTML = `<option value="">Keine aktiven Geräte. Öffne Spotify & klicke ↻.</option>`;
            }
        } catch (e) { elements.deviceSelect.innerHTML = `<option value="">Geräte laden fehlgeschlagen</option>`; }
        finally { elements.refreshDevicesButton.disabled = false; sendSettingsUpdate(); }
    }
    async function fetchAndDisplayPlaylists() {
        try {
            const response = await fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            const data = await response.json();
            if (data.items.length === 0) {
                elements.playlistSelect.innerHTML = `<option value="">Keine Playlists gefunden</option>`;
            } else {
                elements.playlistSelect.innerHTML = data.items.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            }
            sendSettingsUpdate();
        } catch (e) { elements.playlistSelect.innerHTML = `<option value="">Playlists laden fehlgeschlagen</option>`; }
    }
    function updateLobby({ pin, players, hostId, settings }) {
        elements.lobbyPinDisplay.textContent = pin;
        elements.playerList.innerHTML = players.map(p => { const hostIcon = p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : ''; return `<li><span>${p.nickname}</span>${hostIcon}</li>`; }).join('');
        elements.hostSettings.classList.toggle('hidden', !isHost);
        elements.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (isHost && settings) {
            if (settings.deviceId) elements.deviceSelect.value = settings.deviceId;
            if (settings.playlistId) elements.playlistSelect.value = settings.playlistId;
            document.querySelectorAll('#song-count-options .option-btn').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.value) === settings.songCount));
            document.querySelectorAll('#guess-time-options .option-btn').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.value) === settings.guessTime));
        }
    }
    function showCountdown({ round, totalRounds }) {
        elements.countdownRoundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        showScreen('countdown-screen');
        let count = 5;
        elements.countdownTimer.textContent = count;
        const interval = setInterval(() => { count--; elements.countdownTimer.textContent = count; if (count <= 0) { clearInterval(interval); } }, 1000);
    }
    function startRoundUI({ round, totalRounds, guessTime }) {
        clearTimeout(clientRoundTimer);
        elements.roundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        ['artistGuess', 'titleGuess', 'yearGuess'].forEach(id => document.getElementById(id).value = '');
        elements.submitGuessButton.disabled = false;
        elements.submitGuessButton.textContent = "Raten!";
        let time = guessTime;
        elements.timeLeft.textContent = time;
        clientRoundTimer = setInterval(() => { time--; elements.timeLeft.textContent = time; if (time <= 0) { clearInterval(clientRoundTimer); } }, 1000);
        showScreen('game-screen');
    }
    function showResultUI({ song, scores }) {
        clearTimeout(clientRoundTimer);
        elements.correctAnswerInfo.textContent = `${song.artist} - ${song.title} (${song.year})`;
        elements.scoreboardList.innerHTML = scores.map(p => `<li><span>${p.nickname}</span><span>${p.score}</span></li>`).join('');
        showScreen('result-screen');
    }
    function updateLiveScoreboard(players) { elements.liveScoreboard.classList.remove('hidden'); elements.liveScoreboard.innerHTML = '<ul>' + players.sort((a, b) => b.score - a.score).map(p => `<li><span>${p.nickname}</span><span>${p.score}</span></li>`).join('') + '</ul>'; }
    function updatePinDisplay() { elements.pinDisplayDigits.forEach((digit, index) => { digit.textContent = currentPin[index] || ''; digit.classList.toggle('filled', currentPin.length > index); }); }
    function sendSettingsUpdate() {
        if (!isHost) return;
        const songCount = document.querySelector('#song-count-options .option-btn.active').dataset.value;
        const guessTime = document.querySelector('#guess-time-options .option-btn.active').dataset.value;
        sendMessage('update-settings', { deviceId: elements.deviceSelect.value, playlistId: elements.playlistSelect.value, songCount: parseInt(songCount), guessTime: parseInt(guessTime) });
    }
    
    // --- EVENT LISTENERS ---
    
    elements.nicknameSubmitButton.addEventListener('click', () => { myNickname = elements.nicknameInput.value.trim(); if (myNickname) { localStorage.setItem('nickname', myNickname); initializeApp(); } });
    elements.welcomeNickname.addEventListener('click', () => { elements.nicknameInput.value = myNickname; showScreen('nickname-screen'); });
    elements.logoutButton.addEventListener('click', async () => { await fetch('/logout', { method: 'POST' }); spotifyToken = null; window.location.reload(); });
    elements.showCreateButtonAction.addEventListener('click', () => { connectToServer(() => { sendMessage('create-game', { nickname: myNickname, token: spotifyToken }); }); });
    elements.showJoinButton.addEventListener('click', () => { currentPin = ''; updatePinDisplay(); elements.joinModalOverlay.classList.remove('hidden'); });
    
    const closeModal = () => elements.joinModalOverlay.classList.add('hidden');
    elements.closeModalButton.addEventListener('click', closeModal);
    elements.closeModalButtonExit.addEventListener('click', closeModal);

    elements.numpadButtons.forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            const value = button.textContent.trim();
            if (action === 'clear') {
                currentPin = '';
            } else if (action === 'backspace') {
                currentPin = currentPin.slice(0, -1);
            } else if (currentPin.length < 4 && !isNaN(parseInt(value))) {
                currentPin += value;
            }
            updatePinDisplay();
        });
    });

    elements.joinGameButton.addEventListener('click', () => { myNickname = localStorage.getItem('nickname'); if (currentPin.length === 4 && myNickname) { connectToServer(() => sendMessage('join-game', { pin: currentPin, nickname: myNickname })); } });
    elements.refreshDevicesButton.addEventListener('click', fetchAndDisplayDevices);
    elements.deviceSelect.addEventListener('change', sendSettingsUpdate);
    elements.playlistSelect.addEventListener('change', sendSettingsUpdate);
    elements.songCountOptions.addEventListener('click', (e) => {
        if (e.target.classList.contains('option-btn')) {
            document.querySelectorAll('#song-count-options .option-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            sendSettingsUpdate();
        }
    });
    elements.guessTimeOptions.addEventListener('click', (e) => {
        if (e.target.classList.contains('option-btn')) {
            document.querySelectorAll('#guess-time-options .option-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            sendSettingsUpdate();
        }
    });
    elements.startGameButton.addEventListener('click', () => {
        if (!elements.deviceSelect.value) {
            alert("Bitte wähle zuerst ein Wiedergabegerät aus. Öffne Spotify auf einem Gerät und klicke auf den Aktualisieren-Button ↻.");
            return;
        }
        sendMessage('start-game');
    });
    elements.submitGuessButton.addEventListener('click', () => {
        const guess = { artist: elements.artistGuess.value.trim(), title: elements.titleGuess.value.trim(), year: parseInt(elements.yearGuess.value, 10) };
        if (isNaN(guess.year)) { alert("Bitte gib eine gültige Jahreszahl ein."); return; }
        sendMessage('submit-guess', { guess });
    });
    elements.leaveButton.addEventListener('click', () => {
        if (ws.socket) {
            ws.socket.onclose = () => {};
            ws.socket.close();
            ws.socket = null;
        }
        showScreen('home-screen');
    });
});
