document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // =========== SPOTIFY SDK & LOGIN LOGIK (FINAL) =============
    // =================================================================
    
    // WICHTIG: Füge hier deine Client ID aus dem Spotify Dashboard ein!
    const CLIENT_ID = "ec63d6f7ae1c4b888cefcccedd291b53"; 
    const REDIRECT_URI = window.location.origin + window.location.pathname;
    const SCOPES = [
        "streaming", "user-read-email", "user-read-private",
        "user-read-playback-state", "user-modify-playback-state"
    ];

    let spotifyPlayer = null;
    let spotifyDeviceId = null;
    let accessToken = null;

    window.onSpotifyWebPlaybackSDKReady = () => {
        const token = getAccessTokenFromUrl();
        if (token) {
            accessToken = token;
            initializeSpotifyPlayer(token);
        }
    };

    function getAccessTokenFromUrl() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (token) {
            window.location.hash = ''; // Bereinige die URL
            return token;
        }
        return null;
    }
    
    function spotifyLogin() {
        localStorage.setItem('nickname_before_login', myNickname);
        const authUrl = `https://api.spotify.com/v1/users/XXXXXXXX/playlists?response_type=token&client_id=${CLIENT_ID}&scope=${SCOPES.join('%20')}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
        window.location = authUrl;
    }

    function initializeSpotifyPlayer(token) {
        spotifyPlayer = new Spotify.Player({
            name: 'Song Quiz Deluxe Player',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });

        spotifyPlayer.addListener('ready', ({ device_id }) => {
            console.log('Spotify Player ist bereit mit Geräte-ID:', device_id);
            spotifyDeviceId = device_id;
            const nickname = localStorage.getItem('nickname_before_login');
            if (nickname) {
                myNickname = nickname;
                welcomeNickname.textContent = myNickname;
                showScreen('home-screen'); // Zeige jetzt den Home-Screen
                connectToServerAndCreateGame();
                localStorage.removeItem('nickname_before_login');
            }
        });

        spotifyPlayer.addListener('not_ready', ({ device_id }) => console.log('Gerät ist offline:', device_id));
        spotifyPlayer.addListener('authentication_error', ({ message }) => {
            console.error('Authentifizierungsfehler:', message);
            alert("Login abgelaufen. Bitte Seite neu laden und erneut einloggen.");
        });
        spotifyPlayer.addListener('account_error', ({ message }) => {
            console.error('Account-Fehler:', message);
            alert("Fehler mit dem Spotify-Account. Es wird ein Premium-Account benötigt.");
        });

        spotifyPlayer.connect();
    }
    
    function playTrack(spotifyId) {
        if (!spotifyDeviceId) {
            alert("Spotify Player nicht bereit. Bitte öffne deine Spotify App, klicke auf das 'Geräte'-Symbol, wähle den 'Song Quiz Deluxe Player' und starte die Runde erneut.");
            return;
        }
        fetch(`https://api.spotify.com/v1/playlists/[playlist_id]/tracks?device_id=${spotifyDeviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        });
    }

    // =================================================================
    // =========== SPIEL-LOGIK & EVENT LISTENERS (VOLLSTÄNDIG) =============
    // =================================================================
    
    const screens = document.querySelectorAll('.screen');
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false, countdownInterval = null, timeLeftInterval = null;

    const scoreboard = document.getElementById('scoreboard'), scoreboardList = document.getElementById('scoreboard-list'),
    nicknameScreen = document.getElementById('nickname-screen'), nicknameInput = document.getElementById('nickname-input'), 
    nicknameSubmitButton = document.getElementById('nickname-submit-button'),
    welcomeNickname = document.getElementById('welcome-nickname'), showCreateButton = document.getElementById('show-create-button'),
    showJoinButton = document.getElementById('show-join-button'), lobbyPinDisplay = document.getElementById('lobby-pin'),
    playerList = document.getElementById('player-list'), playerCount = document.getElementById('player-count'),
    hostSettings = document.getElementById('host-settings'), guestWaitingMessage = document.getElementById('guest-waiting-message'),
    categorySelect = document.getElementById('category-select'), songCountSelect = document.getElementById('song-count-select'),
    guessTimeSelect = document.getElementById('guess-time-select'), startGameButton = document.getElementById('start-game-button'),
    joinModalOverlay = document.getElementById('join-modal-overlay'), closeModalButton = document.getElementById('close-modal-button'),
    pinDisplaySpans = document.querySelectorAll('.pin-display-box span'), numberpadButtons = document.querySelectorAll('.numberpad .num-btn'),
    joinGameButton = document.getElementById('join-game-button'), joinErrorMessage = document.getElementById('join-error-message'),
    submitGuessButton = document.getElementById('submit-guess-button'), readyButton = document.getElementById('ready-button'),
    timeLeftDisplay = document.getElementById('time-left'), backToHomeButton = document.getElementById('back-to-home-button');

    // Initialen Screen festlegen
    if (!getAccessTokenFromUrl()) {
        showScreen('nickname-screen');
    }

    function showScreen(screenId) {
        screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
    }

    function connectToServer(isHost, actionPayload) {
        if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
            sendMessage(actionPayload.type, actionPayload.payload);
            return;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.socket = new WebSocket(`${protocol}//${window.location.host}`);
        ws.socket.onopen = () => {
            console.log("WebSocket-Verbindung hergestellt.");
            sendMessage(actionPayload.type, actionPayload.payload);
        };
        ws.socket.onmessage = handleServerMessage;
        ws.socket.onclose = () => {
             alert("Verbindung zum Server verloren. Bitte lade die Seite neu.");
             showScreen('nickname-screen');
             scoreboard.classList.remove('visible');
        };
    }

    function connectToServerAndCreateGame() {
        connectToServer(true, { type: 'create-game', payload: { nickname: myNickname } });
    }
    
    function sendMessage(type, payload) {
        if (ws.socket && ws.socket.readyState === WebSocket.OPEN) ws.socket.send(JSON.stringify({ type, payload }));
    }
    
    function handleServerMessage(event) {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case 'game-created':
            case 'join-success':
                myPlayerId = payload.playerId;
                lobbyPinDisplay.textContent = payload.pin;
                joinModalOverlay.classList.add('hidden');
                showScreen('lobby-screen');
                scoreboard.classList.add('visible');
                break;
            case 'lobby-update':
                isHost = myPlayerId === payload.hostId;
                playerCount.textContent = payload.players.length;
                updateScoreboard(payload.players);
                playerList.innerHTML = payload.players.map(p => {
                    const isMe = p.id === myPlayerId, isHostIcon = p.id === payload.hostId ? '<i class="fa-solid fa-crown host-crown"></i>' : '';
                    return `<li data-id="${p.id}">${isHostIcon}<span class="nickname ${isMe ? 'editable-nickname' : ''}">${p.nickname}</span></li>`;
                }).join('');
                document.querySelector(`#player-list li[data-id="${myPlayerId}"] .nickname`)?.addEventListener('click', makeNicknameEditable, { once: true });
                hostSettings.classList.toggle('hidden', !isHost);
                guestWaitingMessage.classList.toggle('hidden', isHost);
                if (isHost) updateLobbySettings(payload.settings, payload.categories);
                break;
            case 'error':
                joinErrorMessage.textContent = payload.message;
                joinErrorMessage.classList.remove('hidden');
                break;
            case 'game-countdown':
                showScreen('countdown-screen');
                let count = 5;
                const countdownTimer = document.getElementById('countdown-timer');
                countdownTimer.textContent = count;
                countdownInterval = setInterval(() => {
                    count--;
                    countdownTimer.textContent = count > 0 ? count : 'GO!';
                    if (count < 0) clearInterval(countdownInterval);
                }, 1000);
                break;
            case 'new-round':
                clearInterval(timeLeftInterval);
                showScreen('game-screen');
                document.getElementById('round-info').textContent = `Runde ${payload.round} / ${payload.totalRounds}`;
                ['artist-guess', 'title-guess', 'year-guess'].forEach(id => document.getElementById(id).value = '');
                submitGuessButton.disabled = false;
                readyButton.disabled = true;
                readyButton.innerHTML = '<i class="fa-solid fa-forward"></i> Fertig';
                startGuessTimer(payload.guessTime);
                if (payload.song.spotifyId) {
                    playTrack(payload.song.spotifyId);
                }
                break;
            case 'guess-received':
                submitGuessButton.disabled = true;
                readyButton.disabled = false;
                break;
            case 'round-result':
            case 'game-over':
                if (spotifyPlayer) spotifyPlayer.pause();
                clearInterval(timeLeftInterval);
                if(type === 'round-result') {
                    showScreen('result-screen');
                    document.getElementById('correct-answer-info').innerHTML = `<p><strong>${payload.song.artist} - ${payload.song.title}</strong> (${payload.song.year})</p>`;
                    updateScoreboard(payload.scores);
                } else {
                    showScreen('game-over-screen');
                    document.getElementById('final-scores-list').innerHTML = payload.scores.map(p => `<li><span>${p.nickname}</span><span>${p.score}</span></li>`).join('');
                }
                break;
        }
    }

    nicknameSubmitButton.addEventListener('click', () => {
        myNickname = nicknameInput.value.trim();
        if (myNickname) {
            welcomeNickname.textContent = myNickname;
            showScreen('home-screen');
        }
    });

    showCreateButton.addEventListener('click', () => spotifyLogin());
    showJoinButton.addEventListener('click', () => {
        currentPin = "";
        updatePinDisplay();
        joinErrorMessage.classList.add('hidden');
        joinModalOverlay.classList.remove('hidden');
    });
    backToHomeButton.addEventListener('click', () => showScreen('home-screen'));

    function makeNicknameEditable(e) { /* ... unverändert ... */ }
    let currentPin = "";
    function updatePinDisplay() { /* ... unverändert ... */ }
    numberpadButtons.forEach(button => { /* ... unverändert ... */ });
    closeModalButton.addEventListener('click', () => joinModalOverlay.classList.add('hidden'));
    joinModalOverlay.addEventListener('click', e => e.target === joinModalOverlay && joinModalOverlay.classList.add('hidden'));
    joinGameButton.addEventListener('click', () => {
        if (currentPin.length === 4) connectToServer(false, { type: 'join-game', payload: { pin: currentPin, nickname: myNickname } });
    });

    [categorySelect, songCountSelect, guessTimeSelect].forEach(el => { /* ... unverändert ... */ });
    startGameButton.addEventListener('click', () => sendMessage('start-game'));
    function updateLobbySettings(settings, categoriesFromServer) { /* ... unverändert ... */ }
    function startGuessTimer(seconds) { /* ... unverändert ... */ }
    function updateScoreboard(scores) { /* ... unverändert ... */ }
    submitGuessButton.addEventListener('click', () => { /* ... unverändert ... */ });
    readyButton.addEventListener('click', () => { /* ... unverändert ... */ });
    
    const themeToggleButton = document.getElementById('theme-toggle');
    themeToggleButton.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        themeToggleButton.innerHTML = isDarkMode ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });
    
    // Initialen Theme-Status beim Laden der Seite setzen
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    themeToggleButton.innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
});
