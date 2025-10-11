document.addEventListener('DOMContentLoaded', () => {
    // Globale Variablen
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false;
    let spotifyToken = null;
    let spotifyPlayer = null, spotifyDeviceId = null;
    let clientRoundTimer = null, currentPin = '';

    const elements = {
        screens: document.querySelectorAll('.screen'),
        nicknameInput: document.getElementById('nickname-input'),
        nicknameSubmitButton: document.getElementById('nickname-submit-button'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        showCreateButtonLogin: document.getElementById('show-create-button-login'),
        showCreateButtonAction: document.getElementById('show-create-button-action'),
        showJoinButton: document.getElementById('show-join-button'),
        lobbyPinDisplay: document.getElementById('lobby-pin'),
        playerList: document.getElementById('player-list'),
        hostSettings: document.getElementById('host-settings'),
        guestWaitingMessage: document.getElementById('guest-waiting-message'),
        playlistSelect: document.getElementById('playlist-select'),
        songCountOptions: document.getElementById('song-count-options'),
        guessTimeOptions: document.getElementById('guess-time-options'),
        startGameButton: document.getElementById('start-game-button'),
        joinModalOverlay: document.getElementById('join-modal-overlay'),
        pinDisplayDigits: document.querySelectorAll('.pin-display .pin-digit'),
        numpadButtons: document.querySelectorAll('#numpad .num-btn'),
        joinGameButton: document.getElementById('join-game-button'),
        closeModalButton: document.getElementById('close-modal-button'),
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
        leaveButtons: document.querySelectorAll('.button-leave'),
    };

    async function initializeSpotifyPlayer(token) {
        if (!token) return;
        spotifyPlayer = new Spotify.Player({ name: 'Fakester Quiz', getOAuthToken: cb => { cb(token); }, volume: 0.5 });
        
        spotifyPlayer.addListener('ready', async ({ device_id }) => {
            console.log('Spotify Player bereit mit ID:', device_id);
            spotifyDeviceId = device_id;
            
            // NEU: Wiedergabe auf dieses Gerät übertragen, damit der Ton hier ankommt
            try {
                const response = await fetch('/api/transfer', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${spotifyToken}`
                    },
                    body: JSON.stringify({ deviceId: device_id })
                });

                if(response.ok) {
                    console.log("Wiedergabe erfolgreich auf Browser übertragen.");
                } else {
                    console.error("Fehler bei der Wiedergabe-Übertragung.");
                }

            } catch (e) {
                console.error("Netzwerkfehler bei der Wiedergabe-Übertragung:", e);
            }

            if (isHost) {
                sendMessage('player-ready', { deviceId: device_id });
            }
        });

        spotifyPlayer.addListener('not_ready', ({ device_id }) => console.log('Gerät offline:', device_id));
        spotifyPlayer.addListener('authentication_error', ({ message }) => console.error(message));
        spotifyPlayer.addListener('account_error', ({ message }) => { alert("Spotify-Fehler: " + message); });
        spotifyPlayer.connect();
    }
    
    async function initializeApp() {
        myNickname = localStorage.getItem('nickname');
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            if (!data.loggedIn) throw new Error('Nicht eingeloggt');
            
            spotifyToken = data.token;
            document.cookie = "spotify_access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            
            elements.showCreateButtonLogin.classList.add('hidden');
            elements.showCreateButtonAction.classList.remove('hidden');
            
            if (myNickname) {
                elements.welcomeNickname.textContent = myNickname;
                showScreen('home-screen');
            } else {
                showScreen('nickname-screen');
            }
        } catch (error) {
            elements.showCreateButtonLogin.classList.remove('hidden');
            elements.showCreateButtonAction.classList.add('hidden');
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
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.socket = new WebSocket(`${protocol}//${window.location.host}`);
        ws.socket.onopen = onOpenCallback;
        ws.socket.onmessage = handleServerMessage;
    }
    function sendMessage(type, payload) { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type, payload })); } }
    function handleServerMessage(event) {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case 'game-created':
                myPlayerId = payload.playerId;
                isHost = true;
                elements.lobbyPinDisplay.textContent = payload.pin;
                elements.joinModalOverlay.classList.add('hidden');
                showScreen('lobby-screen');
                if (window.Spotify) { initializeSpotifyPlayer(spotifyToken); } else { window.onSpotifyWebPlaybackSDKReady = () => initializeSpotifyPlayer(spotifyToken); }
                break;
            case 'join-success':
                myPlayerId = payload.playerId;
                isHost = false;
                elements.lobbyPinDisplay.textContent = payload.pin;
                elements.joinModalOverlay.classList.add('hidden');
                showScreen('lobby-screen');
                break;
            case 'lobby-update': updateLobby(payload); break;
            case 'error': alert(`Fehler: ${payload.message}`); break;
            case 'round-countdown': showCountdown(payload); break;
            case 'new-round':
                updateLiveScoreboard(payload.scores);
                startRoundUI(payload);
                if (isHost) { playTrack(payload.song.spotifyId); }
                break;
            case 'guess-received': elements.submitGuessButton.disabled = true; elements.submitGuessButton.textContent = "Warte..."; break;
            case 'round-result': updateLiveScoreboard(payload.scores); showResultUI(payload); break;
            case 'game-over': elements.liveScoreboard.classList.add('hidden'); alert("Spiel vorbei!"); showScreen('home-screen'); break;
        }
    }

    function showScreen(screenId) { elements.screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId)); }
    async function fetchAndDisplayPlaylists() {
        if (!spotifyToken) { elements.playlistSelect.innerHTML = `<option>Fehler: Kein Token</option>`; return; }
        try {
            const response = await fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!response.ok) throw new Error('Antwort nicht ok');
            const data = await response.json();
            if (data.items.length === 0) { elements.playlistSelect.innerHTML = `<option>Keine Playlists gefunden</option>`; return; }
            elements.playlistSelect.innerHTML = data.items.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            sendSettingsUpdate();
        } catch (error) { elements.playlistSelect.innerHTML = `<option>Laden fehlgeschlagen</option>`; }
    }
    function playTrack(spotifyId) { 
        if (!spotifyDeviceId) { alert("Fehler: Spotify Player ist nicht aktiv."); return; }
        sendMessage('play-track', { spotifyId, deviceId: spotifyDeviceId });
    }
    function updateLobby({ players, hostId, settings }) {
        elements.playerList.innerHTML = players.map(p => { const hostIcon = p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : ''; return `<li><span>${p.nickname}</span>${hostIcon}</li>`; }).join('');
        elements.hostSettings.classList.toggle('hidden', !isHost);
        elements.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (isHost && settings) {
            if(settings.playlistId) elements.playlistSelect.value = settings.playlistId;
            document.querySelectorAll('#song-count-options .option-btn').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.value) === settings.songCount));
            document.querySelectorAll('#guess-time-options .option-btn').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.value) === settings.guessTime));
        }
    }
    function showCountdown({ round, totalRounds }) {
        elements.countdownRoundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        showScreen('countdown-screen');
        let count = 5;
        elements.countdownTimer.textContent = count;
        const interval = setInterval(() => {
            count--;
            elements.countdownTimer.textContent = count;
            if (count <= 0) { clearInterval(interval); }
        }, 1000);
    }
    function startRoundUI({ round, totalRounds, guessTime }) {
        clearTimeout(clientRoundTimer); elements.roundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        ['artistGuess', 'titleGuess', 'yearGuess'].forEach(id => elements[id].value = '');
        elements.submitGuessButton.disabled = false; elements.submitGuessButton.textContent = "Raten!";
        let time = guessTime; elements.timeLeft.textContent = time;
        clientRoundTimer = setInterval(() => { time--; elements.timeLeft.textContent = time; if (time <= 0) { clearInterval(clientRoundTimer); } }, 1000);
        showScreen('game-screen');
    }
    function showResultUI({ song, scores }) {
        clearInterval(clientRoundTimer);
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
        sendMessage('update-settings', { playlistId: elements.playlistSelect.value, songCount: parseInt(songCount), guessTime: parseInt(guessTime) });
    }
    elements.nicknameSubmitButton.addEventListener('click', () => { myNickname = elements.nicknameInput.value.trim(); if (myNickname) { localStorage.setItem('nickname', myNickname); initializeApp(); } });
    elements.welcomeNickname.addEventListener('click', () => { elements.nicknameInput.value = myNickname; showScreen('nickname-screen'); });
    elements.showCreateButtonAction.addEventListener('click', () => { connectToServer(() => { sendMessage('create-game', { nickname: myNickname, token: spotifyToken }); fetchAndDisplayPlaylists(); }); });
    elements.showJoinButton.addEventListener('click', () => { currentPin = ''; updatePinDisplay(); elements.joinModalOverlay.classList.remove('hidden'); });
    elements.closeModalButton.addEventListener('click', () => elements.joinModalOverlay.classList.add('hidden'));
    elements.numpadButtons.forEach(button => { button.addEventListener('click', () => { const action = button.dataset.action; if (action === 'clear') { currentPin = ''; } else if (action === 'backspace') { currentPin = currentPin.slice(0, -1); } else if (currentPin.length < 4) { currentPin += button.textContent; } updatePinDisplay(); }); });
    elements.joinGameButton.addEventListener('click', () => { myNickname = localStorage.getItem('nickname'); if (currentPin.length === 4 && myNickname) { connectToServer(() => sendMessage('join-game', { pin: currentPin, nickname: myNickname })); } });
    elements.playlistSelect.addEventListener('change', sendSettingsUpdate);
    elements.songCountOptions.addEventListener('click', (e) => { if (e.target.classList.contains('option-btn')) { document.querySelectorAll('#song-count-options .option-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); sendSettingsUpdate(); } });
    elements.guessTimeOptions.addEventListener('click', (e) => { if (e.target.classList.contains('option-btn')) { document.querySelectorAll('#guess-time-options .option-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); sendSettingsUpdate(); } });
    elements.startGameButton.addEventListener('click', () => sendMessage('start-game'));
    elements.submitGuessButton.addEventListener('click', () => { const guess = { artist: elements.artistGuess.value.trim(), title: elements.titleGuess.value.trim(), year: parseInt(elements.yearGuess.value, 10) }; if (isNaN(guess.year)) { alert("Bitte gib eine gültige Jahreszahl ein."); return; } sendMessage('submit-guess', { guess }); });
    elements.leaveButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (ws.socket) { ws.socket.close(); ws.socket = null; }
            myNickname = localStorage.getItem('nickname');
            if (myNickname) { elements.welcomeNickname.textContent = myNickname; showScreen('home-screen'); } else { showScreen('nickname-screen'); }
            elements.liveScoreboard.classList.add('hidden');
        });
    });
});
