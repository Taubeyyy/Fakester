document.addEventListener('DOMContentLoaded', () => {
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false, spotifyToken = null;
    let countdownInterval = null, clientRoundTimer = null;

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
        pointsBreakdown: document.getElementById('points-breakdown'),
        scoreboardList: document.getElementById('scoreboard-list'),
        headerScoreboard: document.getElementById('live-header-scoreboard'),
        leaveButton: document.querySelector('.button-leave'),
    };
    let currentPin = '';

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
            case 'new-round': updateHeaderScoreboard(payload.scores, payload.hostId); startRoundUI(payload); break;
            case 'guess-received': elements.submitGuessButton.disabled = true; elements.submitGuessButton.textContent = "Warte..."; break;
            case 'round-result': updateHeaderScoreboard(payload.scores, payload.hostId); showResultUI(payload); break;
            case 'game-over': elements.headerScoreboard.classList.add('hidden'); alert("Spiel vorbei!"); showScreen('home-screen'); break;
        }
    }

    function showScreen(screenId) {
        elements.screens.forEach(s => s.classList.remove('active'));
        const activeScreen = document.getElementById(screenId);
        if (activeScreen) activeScreen.classList.add('active');

        const showLeaveButton = ['lobby-screen', 'game-screen', 'result-screen', 'countdown-screen'].includes(screenId);
        elements.leaveButton.classList.toggle('hidden', !showLeaveButton);
        const showHeaderScoreboard = ['game-screen', 'result-screen', 'countdown-screen'].includes(screenId);
        elements.headerScoreboard.classList.toggle('hidden', !showHeaderScoreboard);
    }

    async function fetchAndDisplayDevices() { /* ... (Code ist identisch) ... */ }
    async function fetchAndDisplayPlaylists() { /* ... (Code ist identisch) ... */ }
    function updateLobby({ pin, players, hostId, settings }) { /* ... (Code ist identisch) ... */ }
    function showCountdown({ round, totalRounds }) { /* ... (Code ist identisch) ... */ }
    function startRoundUI({ round, totalRounds, guessTime }) { /* ... (Code ist identisch) ... */ }

    function showResultUI({ song, scores }) {
        clearInterval(clientRoundTimer);
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

        elements.scoreboardList.innerHTML = scores.map(p => `<li><span>${p.nickname}</span><span>${p.score}</span></li>`).join('');
        showScreen('result-screen');
    }
    
    function updateHeaderScoreboard(players, hostId) {
        if (!players || !Array.isArray(players)) return;
        elements.headerScoreboard.innerHTML = players
            .sort((a, b) => b.score - a.score)
            .map(p => `<span>${p.nickname}: ${p.score}${p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : ''}</span>`)
            .join('');
    }
    
    function updatePinDisplay() { /* ... (Code ist identisch) ... */ }
    function sendSettingsUpdate() { /* ... (Code ist identisch) ... */ }
    
    // ... Alle Event Listeners sind identisch geblieben ...
});
