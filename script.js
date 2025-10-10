// =================================================================
// =========== DEBUG-FENSTER FUNKTIONEN ========================
// =================================================================
function logToScreen(message, isError = false) {
    const logContainer = document.getElementById('debug-log');
    if (logContainer) {
        const p = document.createElement('p');
        p.textContent = `> ${message}`;
        if (isError) p.className = 'error';
        logContainer.appendChild(p);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

window.onerror = function(message, source, lineno, colno, error) {
    logToScreen(`FEHLER: ${message} in Zeile ${lineno}`, true);
    return true;
};

logToScreen("script.js wird geladen...");

document.addEventListener('DOMContentLoaded', () => {
    logToScreen("DOM ist geladen. Starte App-Logik...");

    // =================================================================
    // =========== SPOTIFY SDK & LOGIN LOGIK (FINAL) =============
    // =================================================================
    
    const CLIENT_ID = "ec63d6f7ae1c4b888cefcccedd291b53en"; 
    const REDIRECT_URI = window.location.origin + window.location.pathname.replace('index.html', '');
    const SCOPES = [
        "streaming", "user-read-email", "user-read-private",
        "user-read-playback-state", "user-modify-playback-state"
    ];

    let spotifyPlayer = null;
    let spotifyDeviceId = null;
    let accessToken = null;

    window.onSpotifyWebPlaybackSDKReady = () => {
        logToScreen("Spotify SDK ist bereit.");
        const token = getAccessTokenFromUrl();
        if (token) {
            accessToken = token;
            logToScreen("Access Token gefunden. Initialisiere Player...");
            initializeSpotifyPlayer(token);
        } else {
            logToScreen("Kein Access Token gefunden. Warte auf Nutzeraktion.");
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
        logToScreen("Speichere Nickname und starte Spotify Login...");
        localStorage.setItem('nickname_before_login', myNickname);
        const authUrl = `https://api.spotify.com/v1/users/XXXXXXXX/playlists?response_type=token&client_id=${CLIENT_ID}&scope=${SCOPES.join('%20')}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
        window.location = authUrl;
    }

    function initializeSpotifyPlayer(token) {
        spotifyPlayer = new Spotify.Player({
            name: 'Fakester Song Quiz',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });

        spotifyPlayer.addListener('ready', ({ device_id }) => {
            logToScreen(`Spotify Player ist bereit mit Geräte-ID: ${device_id}`);
            spotifyDeviceId = device_id;
            const nickname = localStorage.getItem('nickname_before_login');
            if (nickname) {
                myNickname = nickname;
                welcomeNickname.textContent = myNickname;
                showScreen('home-screen');
                connectToServerAndCreateGame();
                localStorage.removeItem('nickname_before_login');
            }
        });

        spotifyPlayer.addListener('not_ready', ({ device_id }) => logToScreen(`Gerät ist offline: ${device_id}`, true));
        spotifyPlayer.addListener('authentication_error', ({ message }) => logToScreen(`Authentifizierungsfehler: ${message}`, true));
        spotifyPlayer.addListener('account_error', ({ message }) => logToScreen(`Account-Fehler: ${message}`, true));

        spotifyPlayer.connect().then(success => {
            if (success) logToScreen("Verbindung zum Spotify Player erfolgreich.");
        });
    }
    
    function playTrack(spotifyId) {
        if (!spotifyDeviceId) {
            logToScreen("Spotify Player nicht aktiv. Bitte in Spotify App auswählen.", true);
            alert("Spotify Player nicht bereit. Bitte öffne deine Spotify App, klicke auf das 'Geräte'-Symbol, wähle den 'Fakester Song Quiz' Player und starte die Runde erneut.");
            return;
        }
        fetch(`https://api.spotify.com/v1/playlists/[playlist_id]/tracks?device_id=${spotifyDeviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        });
    }

    // =================================================================
    // =========== SPIEL-LOGIK & EVENT LISTENERS =====================
    // =================================================================
    
    const screens = document.querySelectorAll('.screen');
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false, countdownInterval = null, timeLeftInterval = null;

    const scoreboard = document.getElementById('scoreboard'), scoreboardList = document.getElementById('scoreboard-list'),
    nicknameInput = document.getElementById('nickname-input'), nicknameSubmitButton = document.getElementById('nickname-submit-button'),
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
    timeLeftDisplay = document.getElementById('time-left'), backToHomeButton = document.getElementById('back-to-home-button'),
    themeToggleButton = document.getElementById('theme-toggle');

    if (!getAccessTokenFromUrl()) {
        showScreen('nickname-screen');
        logToScreen("Zeige initialen Nickname-Screen.");
    }

    function showScreen(screenId) {
        screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
    }

    function connectToServer(action) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.socket = new WebSocket(`${protocol}//${window.location.host}`);
        ws.socket.onopen = () => {
            logToScreen("WebSocket-Verbindung hergestellt.");
            action();
        };
        ws.socket.onmessage = handleServerMessage;
        ws.socket.onclose = () => { logToScreen("WebSocket-Verbindung getrennt.", true); };
        ws.socket.onerror = () => { logToScreen("WebSocket-Fehler.", true); };
    }

    function connectToServerAndCreateGame() {
        connectToServer(() => sendMessage('create-game', { nickname: myNickname }));
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
        logToScreen("'Weiter' geklickt!");
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

    function makeNicknameEditable(e) {
        const element = e.target;
        const input = document.createElement('input');
        input.type = 'text'; input.value = element.textContent;
        element.replaceWith(input);
        input.focus();
        const save = () => {
            const newNickname = input.value.trim();
            if (newNickname && newNickname !== myNickname) sendMessage('change-nickname', { newNickname });
            input.replaceWith(element);
            element.addEventListener('click', makeNicknameEditable, { once: true });
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => e.key === 'Enter' && e.target.blur());
    }

    let currentPin = "";
    function updatePinDisplay() {
        pinDisplaySpans.forEach((span, i) => {
            span.textContent = currentPin[i] || "";
            span.classList.toggle('filled', !!currentPin[i]);
});
    }

    numberpadButtons.forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            if (action === 'clear') currentPin = "";
            else if (action === 'backspace') currentPin = currentPin.slice(0, -1);
            else if (currentPin.length < 4) currentPin += button.textContent;
            updatePinDisplay();
        });
    });

    closeModalButton.addEventListener('click', () => joinModalOverlay.classList.add('hidden'));
    joinModalOverlay.addEventListener('click', e => { if (e.target === joinModalOverlay) joinModalOverlay.classList.add('hidden'); });
    joinGameButton.addEventListener('click', () => {
        if (currentPin.length === 4) connectToServer(() => sendMessage('join-game', { pin: currentPin, nickname: myNickname }));
    });

    [categorySelect, songCountSelect, guessTimeSelect].forEach(el => {
        el.addEventListener('change', () => sendMessage('update-settings', {
            category: categorySelect.value,
            songCount: parseInt(songCountSelect.value),
            guessTime: parseInt(guessTimeSelect.value)
        }));
    });
    
    startGameButton.addEventListener('click', () => sendMessage('start-game'));
    
    function updateLobbySettings(settings, categoriesFromServer) {
        categorySelect.innerHTML = categoriesFromServer.map(c => `<option value="${c}" ${c === settings.category ? 'selected' : ''}>${c}</option>`).join('');
        songCountSelect.value = settings.songCount;
        guessTimeSelect.value = settings.guessTime;
    }

    function startGuessTimer(seconds) {
        let timeLeft = seconds;
        timeLeftDisplay.textContent = timeLeft;
        timeLeftInterval = setInterval(() => {
            timeLeft--;
            timeLeftDisplay.textContent = timeLeft;
            if (timeLeft <= 0) clearInterval(timeLeftInterval);
        }, 1000);
    }
    function updateScoreboard(scores) {
        scoreboardList.innerHTML = scores.sort((a, b) => b.score - a.score)
            .map(p => `<li><span>${p.nickname}</span><span class="score">${p.score}</span></li>`).join('');
    }
    submitGuessButton.addEventListener('click', () => {
        const guess = {
            artist: document.getElementById('artist-guess').value.trim(),
            title: document.getElementById('title-guess').value.trim(),
            year: parseInt(document.getElementById('year-guess').value, 10)
        };
        if (isNaN(guess.year)) { alert("Bitte gib eine gültige Jahreszahl ein."); return; }
        sendMessage('submit-guess', { guess });
    });
    readyButton.addEventListener('click', () => {
        sendMessage('player-ready');
        readyButton.disabled = true;
        readyButton.innerHTML = '<i class="fa-solid fa-check"></i> Warten...';
    });
    
    themeToggleButton.addEventListener('click', () => {
        logToScreen("Theme-Button geklickt!");
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        themeToggleButton.innerHTML = isDarkMode ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    themeToggleButton.innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    
    logToScreen("Event Listeners angehängt.");
});

logToScreen("script.js geladen.");