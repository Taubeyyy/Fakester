document.addEventListener('DOMContentLoaded', () => {
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false, spotifyToken = null;
    let countdownInterval = null, clientRoundTimer = null;
    let currentCustomInput = { value: '', type: null, target: null };
    let clientSideGuess = { artist: '', title: '', year: '' };
    let hasSubmittedGuess = false;

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
        helpModalOverlay: document.getElementById('help-modal-overlay'),
        helpModalTitle: document.getElementById('help-modal-title'),
        helpModalText: document.getElementById('help-modal-text'),
        helpModalClose: document.getElementById('help-modal-close'),
        helpButtons: document.querySelectorAll('.button-help'),
        countdownRoundInfo: document.getElementById('countdown-round-info'),
        countdownTimer: document.getElementById('countdown-timer'),
        roundInfo: document.getElementById('round-info'),
        timeLeft: document.getElementById('time-left'),
        artistGuess: document.getElementById('artist-guess'),
        titleGuess: document.getElementById('title-guess'),
        yearGuess: document.getElementById('year-guess'),
        readyButton: document.getElementById('ready-button'),
        readyStatus: document.getElementById('ready-status'),
        timelineScreen: document.getElementById('timeline-screen'),
        timelineContainer: document.getElementById('timeline-container'),
        timelineCurrentTitle: document.getElementById('timeline-current-title'),
        timelineCurrentArtist: document.getElementById('timeline-current-artist'),
        timelineRoundInfo: document.getElementById('timeline-round-info'),
        timelineTimeLeft: document.getElementById('timeline-time-left'),
        timelineReadyButton: document.getElementById('timeline-ready-button'),
        timelineReadyStatus: document.getElementById('timeline-ready-status'),
        popularityScreen: document.getElementById('popularity-screen'),
        popularityRoundInfo: document.getElementById('popularity-round-info'),
        popularityTimeLeft: document.getElementById('popularity-time-left'),
        prevSongTitle: document.getElementById('prev-song-title'),
        prevSongArtist: document.getElementById('prev-song-artist'),
        prevSongPopularity: document.getElementById('prev-song-popularity'),
        currentSongTitle: document.getElementById('current-song-title'),
        currentSongArtist: document.getElementById('current-song-artist'),
        guessHigherButton: document.getElementById('guess-higher-button'),
        guessLowerButton: document.getElementById('guess-lower-button'),
        popularityInstruction: document.getElementById('popularity-instruction'),
        correctAnswerInfo: document.getElementById('correct-answer-info'),
        pointsBreakdown: document.getElementById('points-breakdown'),
        scoreboardList: document.getElementById('scoreboard-list'),
        headerScoreboard: document.getElementById('live-header-scoreboard'),
        leaveButton: document.querySelector('.button-leave'),
    };
    let currentPin = '';

    const helpTexts = {
        pin: { title: "Lobby PIN", text: "Dies ist der vierstellige Code für deine Lobby. Andere Spieler können diesen Code eingeben, um deinem Spiel beizutreten, solange es noch nicht gestartet wurde." },
        device: { title: "Wiedergabegerät", text: "Wähle hier aus, auf welchem deiner Spotify-Geräte die Musik abgespielt werden soll. Stelle sicher, dass Spotify auf dem gewünschten Gerät (z.B. PC, Handy, Lautsprecher) geöffnet und aktiv ist. Wenn kein Gerät erscheint, öffne Spotify und klicke auf den Aktualisieren-Button (↻)." },
        playlist: { title: "Playlist", text: "Wähle die Playlist aus, aus der die Songs für das Quiz zufällig ausgewählt werden sollen. Es werden nur deine eigenen und von dir abonnierten Playlists angezeigt." },
        'song-count': { title: "Anzahl Songs", text: "Lege fest, wie viele Runden das Spiel dauern soll. 'Custom' erlaubt eine benutzerdefinierte Anzahl." },
        'guess-time': { title: "Ratezeit", text: "Stelle ein, wie viele Sekunden die Spieler in jeder Runde Zeit haben, um ihre Antwort einzugeben. 'Custom' erlaubt eine benutzerdefinierte Zeit." }
    };

    function showHelpModal(topic) {
        if (!helpTexts[topic]) return;
        elements.helpModalTitle.textContent = helpTexts[topic].title;
        elements.helpModalText.textContent = helpTexts[topic].text;
        elements.helpModalOverlay.classList.remove('hidden');
    }

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
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.socket = new WebSocket(`${protocol}//${window.location.host}`);
        ws.socket.onopen = onOpenCallback;
        ws.socket.onmessage = handleServerMessage;
        ws.socket.onerror = (event) => { console.error('WebSocket Fehler:', event); };
        ws.socket.onclose = (event) => { console.log(`WebSocket geschlossen. Code: ${event.code}`); };
    }
    
    function sendMessage(type, payload) { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type, payload })); } }
    
    async function handleServerMessage(event) {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
            case 'game-created': myPlayerId = payload.playerId; isHost = true; elements.lobbyPinDisplay.textContent = payload.pin; showScreen('lobby-screen'); await fetchAndDisplayDevices(); await fetchAndDisplayPlaylists(); break;
            case 'join-success': myPlayerId = payload.playerId; isHost = false; elements.lobbyPinDisplay.textContent = payload.pin; elements.joinModalOverlay.classList.add('hidden'); showScreen('lobby-screen'); break;
            case 'lobby-update': updateLobby(payload); break;
            case 'ready-update': elements.readyStatus.textContent = `${payload.readyCount}/${payload.totalPlayers} Spieler bereit`; elements.timelineReadyStatus.textContent = `${payload.readyCount}/${payload.totalPlayers} Spieler bereit`; break;
            case 'error': alert(`Fehler: ${payload.message}`); break;
            case 'round-countdown': showCountdown(payload); break;
            case 'new-round': 
                if (payload.gameMode === 'quiz') startRoundUI(payload);
                else if (payload.gameMode === 'timeline') startTimelineRound(payload);
                else if (payload.gameMode === 'popularity') startPopularityRound(payload);
                updateHeaderScoreboard(payload.scores, payload.hostId); 
                break;
            case 'guess-received': break;
            case 'round-result': updateHeaderScoreboard(payload.scores, payload.hostId); showResultUI(payload); break;
            case 'game-over': elements.headerScoreboard.classList.add('hidden'); alert("Spiel vorbei!"); showScreen('home-screen'); break;
        }
    }

    function showScreen(screenId) {
        elements.screens.forEach(s => s.classList.remove('active'));
        const activeScreen = document.getElementById(screenId);
        if (activeScreen) activeScreen.classList.add('active');
        const showLeaveButton = ['lobby-screen', 'game-screen', 'result-screen', 'countdown-screen', 'timeline-screen', 'mode-selection-screen', 'popularity-screen'].includes(screenId);
        elements.leaveButton.classList.toggle('hidden', !showLeaveButton);
        const showHeaderScoreboard = ['game-screen', 'result-screen', 'countdown-screen', 'timeline-screen', 'popularity-screen'].includes(screenId);
        elements.headerScoreboard.classList.toggle('hidden', !showHeaderScoreboard);
    }
    
    async function fetchAndDisplayDevices() {
        elements.refreshDevicesButton.disabled = true;
        elements.deviceSelect.innerHTML = `<option>Suche Geräte...</option>`;
        try {
            const response = await fetch('/api/devices', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!response.ok) { throw new Error(`Server-Antwort nicht ok: ${response.status}`); }
            const data = await response.json();
            if (data.devices && data.devices.length > 0) {
                elements.deviceSelect.innerHTML = data.devices.map(d => `<option value="${d.id}" ${d.is_active ? 'selected' : ''}>${d.name} (${d.type})</option>`).join('');
            } else {
                elements.deviceSelect.innerHTML = `<option value="">Keine aktiven Geräte. Öffne Spotify & klicke ↻.</option>`;
            }
        } catch (e) { console.error(`Fehler in fetchAndDisplayDevices: ${e.message}`); elements.deviceSelect.innerHTML = `<option value="">Geräte laden fehlgeschlagen</option>`; } finally { elements.refreshDevicesButton.disabled = false; sendSettingsUpdate(); }
    }

    async function fetchAndDisplayPlaylists() {
        try {
            const response = await fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!response.ok) throw new Error(`Server-Antwort nicht ok: ${response.status}`);
            const data = await response.json();
            if (data.items.length === 0) elements.playlistSelect.innerHTML = `<option value="">Keine Playlists gefunden</option>`;
            else elements.playlistSelect.innerHTML = data.items.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        } catch (e) { console.error(`Fehler in fetchAndDisplayPlaylists: ${e.message}`); elements.playlistSelect.innerHTML = `<option value="">Playlists laden fehlgeschlagen</option>`; }
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

    function showCountdown({ round }) {
        clearInterval(countdownInterval);
        elements.countdownRoundInfo.textContent = `Runde ${round}`;
        showScreen('countdown-screen');
        let count = 5;
        elements.countdownTimer.textContent = count;
        countdownInterval = setInterval(() => { count--; elements.countdownTimer.textContent = count; if (count <= 0) clearInterval(countdownInterval); }, 1000);
    }

    function startTimer(duration, displayElement, onEndCallback) {
        clearInterval(clientRoundTimer);
        let time = duration;
        displayElement.textContent = time;
        clientRoundTimer = setInterval(() => { time--; displayElement.textContent = time; if (time <= 0) { clearInterval(clientRoundTimer); if (onEndCallback) onEndCallback(); } }, 1000);
    }

    function startRoundUI({ round, totalRounds, guessTime, totalPlayers }) {
        hasSubmittedGuess = false;
        clientSideGuess = { artist: '', title: '', year: '' };
        elements.roundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        const inputs = [elements.artistGuess, elements.titleGuess, elements.yearGuess];
        inputs.forEach(input => { input.value = ''; input.disabled = false; });
        elements.readyButton.disabled = false;
        elements.readyStatus.textContent = `0/${totalPlayers} Spieler bereit`;
        startTimer(guessTime, elements.timeLeft, () => { if (!hasSubmittedGuess) { sendMessage('submit-guess', { guess: clientSideGuess }); hasSubmittedGuess = true; inputs.forEach(input => input.disabled = true); elements.readyButton.disabled = true; } });
        showScreen('game-screen');
    }

    function startTimelineRound({ round, totalRounds, guessTime, totalPlayers, timeline, currentSong }) {
        elements.timelineRoundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        elements.timelineReadyButton.disabled = false;
        elements.timelineReadyStatus.textContent = `0/${totalPlayers} Spieler bereit`;
        startTimer(guessTime, elements.timelineTimeLeft);
        elements.timelineContainer.innerHTML = '';
        let firstDropZone = document.createElement('div'); firstDropZone.className = 'drop-zone'; firstDropZone.dataset.index = 0; firstDropZone.innerHTML = '<i class="fa-solid fa-plus"></i>'; elements.timelineContainer.appendChild(firstDropZone);
        timeline.forEach((card, index) => {
            let cardElement = document.createElement('div'); cardElement.className = 'timeline-card'; cardElement.innerHTML = `<span class="song-info" title="${card.title}">${card.title}</span><span class="song-info" title="${card.artist}">${card.artist}</span><span class="song-year">${card.year}</span>`; elements.timelineContainer.appendChild(cardElement);
            let dropZone = document.createElement('div'); dropZone.className = 'drop-zone'; dropZone.dataset.index = index + 1; dropZone.innerHTML = '<i class="fa-solid fa-plus"></i>'; elements.timelineContainer.appendChild(dropZone);
        });
        elements.timelineCurrentTitle.textContent = currentSong.title;
        elements.timelineCurrentArtist.textContent = currentSong.artist;
        document.querySelectorAll('.drop-zone').forEach(zone => { zone.addEventListener('click', handleDropZoneClick); });
        showScreen('timeline-screen');
    }

    function startPopularityRound({ round, totalRounds, guessTime, previousSong, currentSong, isFirstRound }) {
        elements.popularityRoundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        [elements.guessHigherButton, elements.guessLowerButton].forEach(b => b.disabled = false);
        
        if (isFirstRound) {
            elements.prevSongTitle.textContent = currentSong.title;
            elements.prevSongArtist.textContent = currentSong.artist;
            elements.prevSongPopularity.textContent = currentSong.popularity;
            elements.currentSongTitle.textContent = "???";
            elements.currentSongArtist.textContent = "Nächste Runde geht's los!";
            elements.popularityInstruction.textContent = "Präge dir die Popularität dieses Songs ein...";
            [elements.guessHigherButton, elements.guessLowerButton].forEach(b => b.classList.add('hidden'));
        } else {
            elements.prevSongTitle.textContent = previousSong.title;
            elements.prevSongArtist.textContent = previousSong.artist;
            elements.prevSongPopularity.textContent = previousSong.popularity;
            elements.currentSongTitle.textContent = currentSong.title;
            elements.currentSongArtist.textContent = currentSong.artist;
            elements.popularityInstruction.textContent = "Ist dieser Song populärer oder weniger populär?";
            [elements.guessHigherButton, elements.guessLowerButton].forEach(b => b.classList.remove('hidden'));
        }
        startTimer(guessTime, elements.popularityTimeLeft, () => { [elements.guessHigherButton, elements.guessLowerButton].forEach(b => b.disabled = true); });
        showScreen('popularity-screen');
    }

    function handleDropZoneClick(event) {
        const clickedZone = event.currentTarget;
        document.querySelectorAll('.drop-zone').forEach(zone => zone.classList.remove('selected'));
        clickedZone.classList.add('selected');
        const index = clickedZone.dataset.index;
        sendMessage('submit-guess', { index: parseInt(index) });
    }

    function showResultUI({ song, scores, gameMode, hostId }) {
        clearInterval(clientRoundTimer);
        showScreen('result-screen');
        elements.scoreboardList.innerHTML = scores.map((p, index) => `<li class="${p.id === myPlayerId ? 'is-me' : ''}"><span class="scoreboard-rank">${index + 1}</span><span class="scoreboard-nickname">${p.nickname}${p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : ''}</span><span class="scoreboard-score">${p.score}</span></li>`).join('');

        if (gameMode === 'quiz') {
            document.getElementById('result-title').textContent = "Richtige Antwort";
            elements.correctAnswerInfo.textContent = `${song.artist} - ${song.title} (${song.year})`;
            const myResult = scores.find(p => p.id === myPlayerId);
            let breakdownHtml = '';
            if (myResult && myResult.pointsBreakdown) {
                const breakdown = myResult.pointsBreakdown;
                breakdownHtml += `<span>Künstler <span class="points">+${breakdown.artist || 0}</span></span>`;
                breakdownHtml += `<span>Titel <span class="points">+${breakdown.title || 0}</span></span>`;
                breakdownHtml += `<span>Jahr <span class="points">+${breakdown.year || 0}</span></span>`;
            } else { breakdownHtml = '<span>Keine Punkte in dieser Runde.</span>'; }
            elements.pointsBreakdown.innerHTML = breakdownHtml;
        } else if (gameMode === 'timeline') {
            document.getElementById('result-title').textContent = "Rundenende";
            elements.correctAnswerInfo.textContent = `Der Song war "${song.title}" aus dem Jahr ${song.year}.`;
            const myResult = scores.find(p => p.id === myPlayerId);
            elements.pointsBreakdown.innerHTML = myResult?.lastGuess?.wasCorrect ? '<span>Richtig platziert! <span class="points">+100</span></span>' : '<span>Leider falsch platziert.</span>';
        } else if (gameMode === 'popularity') {
            document.getElementById('result-title').textContent = "Rundenende";
            const myResult = scores.find(p => p.id === myPlayerId);
            const { wasCorrect, actual, previous } = myResult.lastGuess;
            elements.correctAnswerInfo.textContent = `Popularität von "${song.title}": ${actual}`;
            elements.pointsBreakdown.innerHTML = wasCorrect ? `<span>Richtig geraten! <span class="points">+100</span></span>` : `<span>Leider falsch. Die Popularität war ${actual > previous ? 'höher' : 'niedriger'} als ${previous}.</span>`;
        }
    }
    
    function updateHeaderScoreboard(players, hostId) {
        if (!players || !Array.isArray(players)) return;
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        const topPlayers = sortedPlayers.slice(0, 3);
        const medals = ['🥇', '🥈', '🥉'];
        elements.headerScoreboard.innerHTML = topPlayers.map((p, index) => `<div class="header-player"><span class="header-player-medal">${medals[index] || ''}</span><span class="header-player-name">${p.nickname}${p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : ''}</span><span class="header-player-score">${p.score}</span></div>`).join('');
    }
    
    function updatePinDisplay() { elements.pinDisplayDigits.forEach((digit, index) => { digit.textContent = currentPin[index] || ''; digit.classList.toggle('filled', currentPin.length > index); }); }
    function updateCustomInputDisplay() { elements.customInputDisplayDigits.forEach((digit, index) => { digit.textContent = currentCustomInput.value[index] || ''; digit.classList.toggle('filled', currentCustomInput.value.length > index); }); }

    function sendSettingsUpdate() {
        if (!isHost) return;
        const songCountBtn = document.querySelector('#song-count-options .option-btn.active');
        const guessTimeBtn = document.querySelector('#guess-time-options .option-btn.active');
        sendMessage('update-settings', { deviceId: elements.deviceSelect.value, playlistId: elements.playlistSelect.value, songCount: parseInt(songCountBtn.dataset.value), guessTime: parseInt(guessTimeBtn.dataset.value) });
    }
    
    elements.nicknameSubmitButton.addEventListener('click', () => { myNickname = elements.nicknameInput.value.trim(); if (myNickname) { localStorage.setItem('nickname', myNickname); initializeApp(); } });
    elements.welcomeNickname.addEventListener('click', () => { elements.nicknameInput.value = myNickname; showScreen('nickname-screen'); });
    elements.logoutButton.addEventListener('click', async () => { await fetch('/logout', { method: 'POST' }); spotifyToken = null; window.location.reload(); });
    elements.showCreateButtonAction.addEventListener('click', () => showScreen('mode-selection-screen'));
    elements.showJoinButton.addEventListener('click', () => { currentPin = ''; updatePinDisplay(); elements.joinModalOverlay.classList.remove('hidden'); });
    elements.modeBoxes.forEach(box => box.addEventListener('click', () => { const mode = box.dataset.mode; if (box.classList.contains('disabled')) return; connectToServer(() => sendMessage('create-game', { nickname: myNickname, token: spotifyToken, gameMode: mode })); }));
    elements.closeModalButtonExit.addEventListener('click', () => elements.joinModalOverlay.classList.add('hidden'));
    elements.numpadJoin.forEach(button => button.addEventListener('click', () => { const action = button.dataset.action; const value = button.textContent.trim(); if (action === 'clear') currentPin = ''; else if (action === 'backspace') currentPin = currentPin.slice(0, -1); else if (currentPin.length < 4 && !isNaN(parseInt(value))) currentPin += value; updatePinDisplay(); }));
    elements.joinGameButton.addEventListener('click', () => { myNickname = localStorage.getItem('nickname'); if (currentPin.length === 4 && myNickname) { connectToServer(() => sendMessage('join-game', { pin: currentPin, nickname: myNickname })); } });
    elements.songCountOptions.addEventListener('click', (e) => { const target = e.target.closest('.option-btn'); if (!target) return; if (target.dataset.action === 'custom') openCustomInputDialog('Anzahl Songs', 'song-count', target); else { document.querySelectorAll('#song-count-options .option-btn').forEach(btn => btn.classList.remove('active')); target.classList.add('active'); sendSettingsUpdate(); } });
    elements.guessTimeOptions.addEventListener('click', (e) => { const target = e.target.closest('.option-btn'); if (!target) return; if (target.dataset.action === 'custom') openCustomInputDialog('Ratezeit (Sek.)', 'guess-time', target); else { document.querySelectorAll('#guess-time-options .option-btn').forEach(btn => btn.classList.remove('active')); target.classList.add('active'); sendSettingsUpdate(); } });
    function openCustomInputDialog(title, type, target) { currentCustomInput = { value: '', type, target }; elements.customInputTitle.textContent = title; updateCustomInputDisplay(); elements.customInputModalOverlay.classList.remove('hidden'); }
    elements.numpadCustom.forEach(button => button.addEventListener('click', () => { const action = button.dataset.action; const value = button.textContent.trim(); if (action === 'clear') currentCustomInput.value = ''; else if (action === 'backspace') currentCustomInput.value = currentCustomInput.value.slice(0, -1); else if (currentCustomInput.value.length < 3 && !isNaN(parseInt(value))) currentCustomInput.value += value; updateCustomInputDisplay(); }));
    elements.customInputSubmit.addEventListener('click', () => { if (!currentCustomInput.value) return; const { target, value, type } = currentCustomInput; const parentSelector = `#${type}-options`; document.querySelectorAll(`${parentSelector} .option-btn`).forEach(btn => btn.classList.remove('active')); target.classList.add('active'); target.textContent = value; target.dataset.value = value; sendSettingsUpdate(); elements.customInputModalOverlay.classList.add('hidden'); });
    elements.customInputCancel.addEventListener('click', () => elements.customInputModalOverlay.classList.add('hidden'));
    elements.refreshDevicesButton.addEventListener('click', fetchAndDisplayDevices);
    elements.deviceSelect.addEventListener('change', sendSettingsUpdate);
    elements.playlistSelect.addEventListener('change', sendSettingsUpdate);
    elements.startGameButton.addEventListener('click', () => { if (!elements.deviceSelect.value) { alert("Bitte wähle zuerst ein Wiedergabegerät aus."); return; } sendMessage('start-game'); });
    [elements.artistGuess, elements.titleGuess, elements.yearGuess].forEach(input => input.addEventListener('input', () => { clientSideGuess.artist = elements.artistGuess.value.trim(); clientSideGuess.title = elements.titleGuess.value.trim(); clientSideGuess.year = parseInt(elements.yearGuess.value, 10) || 0; }));
    elements.readyButton.addEventListener('click', () => { if (hasSubmittedGuess) return; sendMessage('submit-guess', { guess: clientSideGuess }); sendMessage('player-ready'); hasSubmittedGuess = true; elements.readyButton.disabled = true; [elements.artistGuess, elements.titleGuess, elements.yearGuess].forEach(input => input.disabled = true); });
    elements.timelineReadyButton.addEventListener('click', () => { sendMessage('player-ready'); elements.timelineReadyButton.disabled = true; document.querySelectorAll('.drop-zone').forEach(zone => { zone.style.pointerEvents = 'none'; }); });
    elements.guessHigherButton.addEventListener('click', () => { sendMessage('submit-guess', { guess: 'higher' }); [elements.guessHigherButton, elements.guessLowerButton].forEach(b => b.disabled = true); });
    elements.guessLowerButton.addEventListener('click', () => { sendMessage('submit-guess', { guess: 'lower' }); [elements.guessHigherButton, elements.guessLowerButton].forEach(b => b.disabled = true); });
    elements.helpButtons.forEach(button => button.addEventListener('click', () => showHelpModal(button.dataset.topic)));
    elements.helpModalClose.addEventListener('click', () => elements.helpModalOverlay.classList.add('hidden'));
    elements.leaveButton.addEventListener('click', () => { if (ws.socket) { ws.socket.onclose = () => {}; ws.socket.close(); ws.socket = null; } window.location.reload(); });
});
