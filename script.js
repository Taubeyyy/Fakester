document.addEventListener('DOMContentLoaded', () => {
    // Globale Variablen
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false;
    let spotifyToken = null, spotifyPlayer = null, spotifyDeviceId = null;
    let clientRoundTimer = null, currentPin = '';

    // HTML-Elemente
    const elements = {
        screens: document.querySelectorAll('.screen'),
        nicknameInput: document.getElementById('nickname-input'),
        nicknameSubmitButton: document.getElementById('nickname-submit-button'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        showJoinButton: document.getElementById('show-join-button'),
        lobbyPinDisplay: document.getElementById('lobby-pin'),
        playerList: document.getElementById('player-list'),
        hostSettings: document.getElementById('host-settings'),
        guestWaitingMessage: document.getElementById('guest-waiting-message'),
        playlistSelect: document.getElementById('playlist-select'),
        startGameButton: document.getElementById('start-game-button'),
        joinModalOverlay: document.getElementById('join-modal-overlay'),
        pinDisplayDigits: document.querySelectorAll('.pin-display .pin-digit'),
        numpadButtons: document.querySelectorAll('#numpad .num-btn'),
        joinGameButton: document.getElementById('join-game-button'),
        closeModalButton: document.getElementById('close-modal-button'),
        gameScreen: document.getElementById('game-screen'),
        roundInfo: document.getElementById('round-info'),
        timeLeft: document.getElementById('time-left'),
        artistGuess: document.getElementById('artist-guess'),
        titleGuess: document.getElementById('title-guess'),
        yearGuess: document.getElementById('year-guess'),
        submitGuessButton: document.getElementById('submit-guess-button'),
        resultScreen: document.getElementById('result-screen'),
        correctAnswerInfo: document.getElementById('correct-answer-info'),
        scoreboardList: document.getElementById('scoreboard-list'),
        liveScoreboard: document.getElementById('live-scoreboard'),
        leaveButtons: document.querySelectorAll('.button-leave'),
    };

    // =================================================================
    // =========== APP INITIALISIERUNG & SPOTIFY PLAYER ==============
    // =================================================================
    window.onSpotifyWebPlaybackSDKReady = () => {};

    function initializeSpotifyPlayer(token) {
        spotifyPlayer = new Spotify.Player({ name: 'Fakester Quiz', getOAuthToken: cb => { cb(token); }, volume: 0.5 });
        spotifyPlayer.addListener('ready', ({ device_id }) => { console.log('Spotify Player bereit mit ID:', device_id); spotifyDeviceId = device_id; });
        spotifyPlayer.addListener('not_ready', ({ device_id }) => console.log('Gerät offline:', device_id));
        spotifyPlayer.connect();
    }

    async function initializeApp() {
        myNickname = localStorage.getItem('nickname');
        try {
            const response = await fetch('/api/status');
            if (!response.ok) throw new Error('Nicht eingeloggt');
            const data = await response.json();
            spotifyToken = data.token;
            if (myNickname) {
                showScreen('lobby-screen');
                if (window.Spotify) { initializeSpotifyPlayer(spotifyToken); } else { window.onSpotifyWebPlaybackSDKReady = () => initializeSpotifyPlayer(spotifyToken); }
                connectToServer(() => sendMessage('create-game', { nickname: myNickname, token: spotifyToken }));
                fetchAndDisplayPlaylists();
            } else { showScreen('nickname-screen'); }
        } catch (error) {
            if (myNickname) { elements.welcomeNickname.textContent = myNickname; showScreen('home-screen'); } 
            else { showScreen('nickname-screen'); }
        }
    }
    initializeApp();

    // =================================================================
    // =========== WEBSOCKET-KOMMUNIKATION ===========================
    // =================================================================
    function connectToServer(onOpenCallback) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.socket = new WebSocket(`${protocol}//${window.location.host}`);
        ws.socket.onopen = onOpenCallback;
        ws.socket.onmessage = handleServerMessage;
    }

    function sendMessage(type, payload) {
        if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type, payload })); }
    }

    function handleServerMessage(event) {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case 'game-created':
            case 'join-success':
                myPlayerId = payload.playerId;
                elements.lobbyPinDisplay.textContent = payload.pin;
                elements.joinModalOverlay.classList.add('hidden');
                showScreen('lobby-screen');
                break;
            case 'lobby-update': updateLobby(payload); break;
            case 'error': alert(`Fehler: ${payload.message}`); break;
            case 'new-round':
                updateLiveScoreboard(payload.scores);
                startRoundUI(payload);
                if (isHost) { playTrack(payload.song.spotifyId); }
                break;
            case 'guess-received': elements.submitGuessButton.disabled = true; elements.submitGuessButton.textContent = "Warte..."; break;
            case 'round-result':
                updateLiveScoreboard(payload.scores);
                showResultUI(payload);
                break;
            case 'game-over':
                elements.liveScoreboard.classList.add('hidden');
                alert("Spiel vorbei!");
                showScreen('home-screen');
                break;
        }
    }

    // =================================================================
    // =========== UI-UPDATE & HELFERFUNKTIONEN ======================
    // =================================================================
    function showScreen(screenId) { elements.screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId)); }

    async function fetchAndDisplayPlaylists() {
        try {
            const response = await fetch('/api/playlists');
            const data = await response.json();
            elements.playlistSelect.innerHTML = data.items.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            sendSettingsUpdate();
        } catch (error) { elements.playlistSelect.innerHTML = `<option>Laden fehlgeschlagen</option>`; }
    }

    function playTrack(spotifyId) {
        if (!spotifyDeviceId) { console.error("Spotify Player nicht bereit."); return; }
        fetch(`https://api.spotify.com/v1/playlists/[playlist_id]/tracks?device_id=${spotifyDeviceId}`, { method: 'PUT', body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }), headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${spotifyToken}` } });
    }
    
    function updateLobby({ players, hostId, settings }) {
        isHost = myPlayerId === hostId;
        elements.playerList.innerHTML = players.map(p => { const hostIcon = p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : ''; return `<li>${p.nickname}${hostIcon}</li>`; }).join('');
        elements.hostSettings.classList.toggle('hidden', !isHost);
        elements.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (isHost && settings.playlistId) { elements.playlistSelect.value = settings.playlistId; }
    }
    
    function startRoundUI({ round, totalRounds, guessTime }) {
        clearTimeout(clientRoundTimer);
        elements.roundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        ['artistGuess', 'titleGuess', 'yearGuess'].forEach(id => elements[id].value = '');
        elements.submitGuessButton.disabled = false;
        elements.submitGuessButton.textContent = "Raten!";
        let time = guessTime;
        elements.timeLeft.textContent = time;
        clientRoundTimer = setInterval(() => { time--; elements.timeLeft.textContent = time; if (time <= 0) { clearInterval(clientRoundTimer); } }, 1000);
        showScreen('game-screen');
    }

    function showResultUI({ song, scores }) {
        clearInterval(clientRoundTimer);
        elements.correctAnswerInfo.textContent = `${song.artist} - ${song.title} (${song.year})`;
        elements.scoreboardList.innerHTML = scores.map(p => `<li><span>${p.nickname}</span><span>${p.score}</span></li>`).join('');
        showScreen('result-screen');
    }

    function updateLiveScoreboard(players) {
        elements.liveScoreboard.classList.remove('hidden');
        elements.liveScoreboard.innerHTML = '<ul>' + players.sort((a, b) => b.score - a.score).map(p => `<li><span>${p.nickname}</span><span>${p.score}</span></li>`).join('') + '</ul>';
    }

    function updatePinDisplay() {
        elements.pinDisplayDigits.forEach((digit, index) => { digit.textContent = currentPin[index] || ''; digit.classList.toggle('filled', currentPin.length > index); });
    }

    function sendSettingsUpdate() {
        if (!isHost) return;
        sendMessage('update-settings', { playlistId: elements.playlistSelect.value });
    }

    // =================================================================
    // =========== EVENT LISTENERS =====================================
    // =================================================================
    elements.nicknameSubmitButton.addEventListener('click', () => {
        myNickname = elements.nicknameInput.value.trim();
        if (myNickname) { localStorage.setItem('nickname', myNickname); elements.welcomeNickname.textContent = myNickname; showScreen('home-screen'); }
    });
    
    elements.showJoinButton.addEventListener('click', () => { currentPin = ''; updatePinDisplay(); elements.joinModalOverlay.classList.remove('hidden'); });
    elements.closeModalButton.addEventListener('click', () => elements.joinModalOverlay.classList.add('hidden'));
    
    elements.numpadButtons.forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            if (action === 'clear') { currentPin = ''; }
            else if (action === 'backspace') { currentPin = currentPin.slice(0, -1); }
            else if (currentPin.length < 4) { currentPin += button.textContent; }
            updatePinDisplay();
        });
    });

    elements.joinGameButton.addEventListener('click', () => {
        myNickname = localStorage.getItem('nickname');
        if (currentPin.length === 4 && myNickname) { connectToServer(() => sendMessage('join-game', { pin: currentPin, nickname: myNickname })); }
    });
    
    elements.playlistSelect.addEventListener('change', sendSettingsUpdate);
    elements.startGameButton.addEventListener('click', () => sendMessage('start-game'));

    elements.submitGuessButton.addEventListener('click', () => {
        const guess = { artist: elements.artistGuess.value.trim(), title: elements.titleGuess.value.trim(), year: parseInt(elements.yearGuess.value, 10) };
        if (isNaN(guess.year)) { alert("Bitte gib eine gültige Jahreszahl ein."); return; }
        sendMessage('submit-guess', { guess });
    });

    elements.leaveButtons.forEach(button => {
        button.addEventListener('click', () => { if (confirm("Möchtest du wirklich gehen?")) { sendMessage('leave-game', {}); window.location.reload(); } });
    });
});