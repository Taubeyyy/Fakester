document.addEventListener('DOMContentLoaded', () => {
    // Globale Variablen
    const ws = { socket: null };
    let myPlayerId = null;
    let myNickname = '';
    let isHost = false;
    let spotifyToken = null;

    // HTML-Elemente
    const elements = {
        screens: document.querySelectorAll('.screen'),
        nicknameInput: document.getElementById('nickname-input'),
        nicknameSubmitButton: document.getElementById('nickname-submit-button'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        playlistSelect: document.getElementById('playlist-select'),
        hostSettings: document.getElementById('host-settings'),
        guestWaitingMessage: document.getElementById('guest-waiting-message'),
        lobbyPinDisplay: document.getElementById('lobby-pin'),
        playerList: document.getElementById('player-list'),
        playerCount: document.getElementById('player-count'),
        startGameButton: document.getElementById('start-game-button')
        // Füge hier weitere Elemente hinzu
    };

    // App initialisieren
    async function initializeApp() {
        myNickname = localStorage.getItem('nickname');
        
        try {
            const response = await fetch('/api/status');
            if (!response.ok) throw new Error('Nicht eingeloggt');
            const data = await response.json();
            spotifyToken = data.token;

            if (myNickname) {
                showScreen('lobby-screen');
                connectToServer(() => {
                    sendMessage('create-game', { nickname: myNickname, token: spotifyToken });
                });
                fetchAndDisplayPlaylists();
            } else {
                showScreen('nickname-screen');
            }
        } catch (error) {
            if (myNickname) {
                elements.welcomeNickname.textContent = myNickname;
                showScreen('home-screen');
            } else {
                showScreen('nickname-screen');
            }
        }
    }
    
    initializeApp();

    // ---- FUNKTIONEN ----
    function showScreen(screenId) {
        elements.screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
    }

    async function fetchAndDisplayPlaylists() {
        try {
            const response = await fetch('/api/playlists');
            const data = await response.json();
            elements.playlistSelect.innerHTML = data.items
                .map(p => `<option value="${p.id}">${p.name}</option>`)
                .join('');
            // Sende initiale Einstellung nach dem Laden
            sendSettingsUpdate();
        } catch (error) {
            elements.playlistSelect.innerHTML = `<option>Laden fehlgeschlagen</option>`;
        }
    }

    function connectToServer(onOpenCallback) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.socket = new WebSocket(`${protocol}//${window.location.host}`);
        ws.socket.onopen = onOpenCallback;
        ws.socket.onmessage = handleServerMessage;
    }

    function sendMessage(type, payload) {
        if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
            ws.socket.send(JSON.stringify({ type, payload }));
        }
    }

    function handleServerMessage(event) {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case 'game-created':
            case 'join-success':
                myPlayerId = payload.playerId;
                elements.lobbyPinDisplay.textContent = payload.pin;
                showScreen('lobby-screen');
                break;
            case 'lobby-update':
                isHost = myPlayerId === payload.hostId;
                elements.playerCount.textContent = payload.players.length;
                elements.playerList.innerHTML = payload.players.map(p => `<li>${p.nickname}</li>`).join('');
                elements.hostSettings.classList.toggle('hidden', !isHost);
                elements.guestWaitingMessage.classList.toggle('hidden', isHost);
                break;
        }
    }

    function sendSettingsUpdate() {
        if (!isHost) return;
        const settings = {
            playlistId: document.getElementById('playlist-select').value,
            songCount: parseInt(document.getElementById('song-count-select').value, 10),
            guessTime: parseInt(document.getElementById('guess-time-select').value, 10)
        };
        sendMessage('update-settings', settings);
    }
    
    // ---- EVENT LISTENERS ----
    elements.nicknameSubmitButton.addEventListener('click', () => {
        myNickname = elements.nicknameInput.value.trim();
        if (myNickname) {
            localStorage.setItem('nickname', myNickname);
            elements.welcomeNickname.textContent = myNickname;
            showScreen('home-screen');
        }
    });

    // Event Listener für Einstellungsänderungen
    document.getElementById('playlist-select').addEventListener('change', sendSettingsUpdate);
    document.getElementById('song-count-select').addEventListener('change', sendSettingsUpdate);
    document.getElementById('guess-time-select').addEventListener('change', sendSettingsUpdate);

    elements.startGameButton.addEventListener('click', () => sendMessage('start-game'));
});