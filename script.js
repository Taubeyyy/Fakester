document.addEventListener('DOMContentLoaded', () => {
    // Globale Variablen
    const ws = { socket: null };
    let myPlayerId = null;
    let myNickname = '';
    let isHost = false;
    let spotifyToken = null;
    let clientRoundTimer = null;

    // HTML-Elemente
    const elements = {
        screens: document.querySelectorAll('.screen'),
        nicknameInput: document.getElementById('nickname-input'),
        nicknameSubmitButton: document.getElementById('nickname-submit-button'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        showJoinButton: document.getElementById('show-join-button'),
        
        // Lobby
        lobbyPinDisplay: document.getElementById('lobby-pin'),
        playerList: document.getElementById('player-list'),
        hostSettings: document.getElementById('host-settings'),
        guestWaitingMessage: document.getElementById('guest-waiting-message'),
        playlistSelect: document.getElementById('playlist-select'),
        startGameButton: document.getElementById('start-game-button'),

        // Join Modal
        joinModalOverlay: document.getElementById('join-modal-overlay'),
        pinInput: document.getElementById('pin-input'),
        joinGameButton: document.getElementById('join-game-button'),
        closeModalButton: document.getElementById('close-modal-button'),
        
        // Spiel
        gameScreen: document.getElementById('game-screen'),
        roundInfo: document.getElementById('round-info'),
        timeLeft: document.getElementById('time-left'),
        artistGuess: document.getElementById('artist-guess'),
        titleGuess: document.getElementById('title-guess'),
        yearGuess: document.getElementById('year-guess'),
        submitGuessButton: document.getElementById('submit-guess-button'),

        // Ergebnisse
        resultScreen: document.getElementById('result-screen'),
        correctAnswerInfo: document.getElementById('correct-answer-info'),
        scoreboardList: document.getElementById('scoreboard-list')
    };

    // =================================================================
    // =========== APP INITIALISIERUNG & LOGIN-PRÜFUNG ===============
    // =================================================================
    async function initializeApp() {
        myNickname = localStorage.getItem('nickname');
        try {
            const response = await fetch('/api/status');
            if (!response.ok) throw new Error('Nicht eingeloggt');
            const data = await response.json();
            spotifyToken = data.token;
            if (myNickname) {
                showScreen('lobby-screen');
                connectToServer(() => sendMessage('create-game', { nickname: myNickname, token: spotifyToken }));
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

    // =================================================================
    // =========== WEBSOCKET-KOMMUNIKATION ===========================
    // =================================================================
    function connectToServer(onOpenCallback) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.socket = new WebSocket(`${protocol}//${window.location.host}`);
        ws.socket.onopen = onOpenCallback;
        ws.socket.onmessage = handleServerMessage;
        ws.socket.onerror = (err) => console.error("WebSocket Fehler:", err);
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
                elements.joinModalOverlay.classList.add('hidden');
                showScreen('lobby-screen');
                break;
            case 'lobby-update':
                updateLobby(payload);
                break;
            case 'error':
                alert(`Fehler: ${payload.message}`);
                break;
            case 'new-round':
                startRoundUI(payload);
                break;
            case 'guess-received':
                elements.submitGuessButton.disabled = true;
                elements.submitGuessButton.textContent = "Warte...";
                break;
            case 'round-result':
                showResultUI(payload);
                break;
            case 'game-over':
                // Hier könntest du einen "Game Over"-Screen erstellen und anzeigen
                alert("Spiel vorbei! Endstand siehe Konsole.");
                console.log("Endstand:", payload.scores);
                showScreen('home-screen'); // Zurück zum Start
                break;
        }
    }

    // =================================================================
    // =========== UI-UPDATE FUNKTIONEN ==============================
    // =================================================================
    function showScreen(screenId) {
        elements.screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
    }

    async function fetchAndDisplayPlaylists() {
        try {
            const response = await fetch('/api/playlists');
            const data = await response.json();
            elements.playlistSelect.innerHTML = data.items.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            sendSettingsUpdate();
        } catch (error) { elements.playlistSelect.innerHTML = `<option>Laden fehlgeschlagen</option>`; }
    }

    function updateLobby({ players, hostId, settings }) {
        isHost = myPlayerId === hostId;
        elements.playerList.innerHTML = players.map(p => {
            const hostIcon = p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : '';
            return `<li>${p.nickname}${hostIcon}</li>`;
        }).join('');
        elements.hostSettings.classList.toggle('hidden', !isHost);
        elements.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (isHost && settings.playlistId) {
            elements.playlistSelect.value = settings.playlistId;
        }
    }
    
    function startRoundUI({ round, totalRounds, guessTime }) {
        clearTimeout(clientRoundTimer);
        elements.roundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        elements.artistGuess.value = '';
        elements.titleGuess.value = '';
        elements.yearGuess.value = '';
        elements.submitGuessButton.disabled = false;
        elements.submitGuessButton.textContent = "Raten!";
        let time = guessTime;
        elements.timeLeft.textContent = time;
        clientRoundTimer = setInterval(() => {
            time--;
            elements.timeLeft.textContent = time;
            if (time <= 0) {
                clearTimeout(clientRoundTimer);
            }
        }, 1000);
        showScreen('game-screen');
    }

    function showResultUI({ song, scores }) {
        clearTimeout(clientRoundTimer);
        elements.correctAnswerInfo.textContent = `${song.artist} - ${song.title} (${song.year})`;
        elements.scoreboardList.innerHTML = scores.map(p => `<li><span>${p.nickname}</span><span>${p.score}</span></li>`).join('');
        showScreen('result-screen');
    }

    // =================================================================
    // =========== EVENT LISTENERS =====================================
    // =================================================================
    elements.nicknameSubmitButton.addEventListener('click', () => {
        myNickname = elements.nicknameInput.value.trim();
        if (myNickname) {
            localStorage.setItem('nickname', myNickname);
            elements.welcomeNickname.textContent = myNickname;
            showScreen('home-screen');
        }
    });

    elements.showJoinButton.addEventListener('click', () => {
        elements.pinInput.value = '';
        elements.joinModalOverlay.classList.remove('hidden');
    });

    elements.closeModalButton.addEventListener('click', () => elements.joinModalOverlay.classList.add('hidden'));

    elements.joinGameButton.addEventListener('click', () => {
        const pin = elements.pinInput.value;
        if (pin && myNickname) {
            connectToServer(() => sendMessage('join-game', { pin, nickname: myNickname }));
        }
    });
    
    function sendSettingsUpdate() {
        if (!isHost) return;
        const settings = { playlistId: elements.playlistSelect.value };
        sendMessage('update-settings', settings);
    }
    elements.playlistSelect.addEventListener('change', sendSettingsUpdate);

    elements.startGameButton.addEventListener('click', () => sendMessage('start-game'));

    elements.submitGuessButton.addEventListener('click', () => {
        const guess = {
            artist: elements.artistGuess.value.trim(),
            title: elements.titleGuess.value.trim(),
            year: parseInt(elements.yearGuess.value, 10)
        };
        if (isNaN(guess.year)) {
            alert("Bitte gib eine gültige Jahreszahl ein.");
            return;
        }
        sendMessage('submit-guess', { guess });
    });
});