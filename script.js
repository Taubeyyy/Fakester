document.addEventListener('DOMContentLoaded', async () => {
    // --- Supabase Konfiguration wird vom Server geladen ---
    let supabase;

    async function initializeSupabase() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error('Konfiguration konnte nicht geladen werden.');
            }
            const config = await response.json();
            
            // KORRIGIERT: Der Supabase Client wird hier korrekt mit dem globalen Objekt initialisiert.
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            // Starte den Auth State Listener, nachdem Supabase initialisiert ist
            setupAuthListener();
        } catch (error) {
            console.error("Fehler bei der Initialisierung von Supabase:", error);
            document.body.innerHTML = '<h1>Fehler: Anwendung konnte nicht geladen werden. Bitte versuche es später erneut.</h1>';
        }
    }

    // --- Globale Variablen ---
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false, spotifyToken = null, currentUser = null;
    let countdownInterval = null, clientRoundTimer = null;
    let currentCustomInput = { value: '', type: null, target: null };
    let clientSideGuess = { artist: '', title: '', year: '' };
    let hasSubmittedGuess = false;
    let hostSettingsState = { deviceId: null, playlistId: null };

    // --- DOM Elemente ---
    const elements = {
        screens: document.querySelectorAll('.screen'),
        authScreen: document.getElementById('auth-screen'),
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        showRegisterForm: document.getElementById('show-register-form'),
        showLoginForm: document.getElementById('show-login-form'),
        logoutButton: document.getElementById('logout-button'),
        guestModeButton: document.getElementById('guest-mode-button'),
        guestModalOverlay: document.getElementById('guest-modal-overlay'),
        closeGuestModalButton: document.getElementById('close-guest-modal-button'),
        guestNicknameInput: document.getElementById('guest-nickname-input'),
        guestNicknameSubmit: document.getElementById('guest-nickname-submit'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        showCreateButtonLogin: document.getElementById('show-create-button-login'),
        showCreateButtonAction: document.getElementById('show-create-button-action'),
        showJoinButton: document.getElementById('show-join-button'),
        modeBoxes: document.querySelectorAll('.mode-box'),
        lobbyPinDisplay: document.getElementById('lobby-pin'),
        playerList: document.getElementById('player-list'),
        hostSettings: document.getElementById('host-settings'),
        refreshDevicesButton: document.getElementById('refresh-devices-button'),
        quizTypeSetting: document.getElementById('quiz-type-setting'),
        quizTypeOptions: document.getElementById('quiz-type-options'),
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
        freeTextInputs: document.getElementById('free-text-inputs'),
        artistGuess: document.getElementById('artist-guess'),
        titleGuess: document.getElementById('title-guess'),
        yearGuess: document.getElementById('year-guess'),
        multipleChoiceInputs: document.getElementById('multiple-choice-inputs'),
        mcArtistOptions: document.getElementById('mc-artist-options'),
        mcTitleOptions: document.getElementById('mc-title-options'),
        mcYearOptions: document.getElementById('mc-year-options'),
        readyButton: document.getElementById('ready-button'),
        readyStatus: document.getElementById('ready-status'),
        timelineContainer: document.getElementById('timeline-container'),
        timelineCurrentTitle: document.getElementById('timeline-current-title'),
        timelineCurrentArtist: document.getElementById('timeline-current-artist'),
        timelineRoundInfo: document.getElementById('timeline-round-info'),
        timelineTimeLeft: document.getElementById('timeline-time-left'),
        timelineReadyButton: document.getElementById('timeline-ready-button'),
        timelineReadyStatus: document.getElementById('timeline-ready-status'),
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
        backToHomeButton: document.getElementById('back-to-home-button'),
        playerStats: document.querySelector('.player-stats'),
        statGamesPlayed: document.getElementById('stat-games-played'),
        statHighscore: document.getElementById('stat-highscore'),
    };
    let currentPin = '';

    const helpTexts = { pin: { title: "Lobby PIN", text: "Dies ist der vierstellige Code für deine Lobby. Andere Spieler können diesen Code eingeben, um deinem Spiel beizutreiten, solange es noch nicht gestartet wurde." }, device: { title: "Wiedergabegerät", text: "Wähle hier aus, auf welchem deiner Spotify-Geräte die Musik abgespielt werden soll. Stelle sicher, dass Spotify auf dem gewünschten Gerät (z.B. PC, Handy, Lautsprecher) geöffnet und aktiv ist. Wenn kein Gerät erscheint, öffne Spotify und klicke auf den Aktualisieren-Button (↻)." }, playlist: { title: "Playlist", text: "Wähle die Playlist aus, aus der die Songs für das Quiz zufällig ausgewählt werden sollen. Es werden nur deine eigenen und von dir abonnierten Playlists angezeigt." }, 'song-count': { title: "Anzahl Songs", text: "Lege fest, wie viele Runden das Spiel dauern soll. 'Custom' erlaubt eine benutzerdefinierte Anzahl." }, 'guess-time': { title: "Ratezeit", text: "Stelle ein, wie viele Sekunden die Spieler in jeder Runde Zeit haben, um ihre Antwort einzugeben. 'Custom' erlaubt eine benutzerdefinierte Zeit." } };

    // --- Hilfsfunktionen ---
    function showToast(message, isError = false) { Toastify({ text: message, duration: 3000, close: true, gravity: "top", position: "center", stopOnFocus: true, style: { background: isError ? "linear-gradient(to right, #FF4500, #FF6347)" : "linear-gradient(to right, #00b09b, #96c93d)" } }).showToast(); }
    function showHelpModal(topic) { if (!helpTexts[topic]) return; elements.helpModalTitle.textContent = helpTexts[topic].title; elements.helpModalText.textContent = helpTexts[topic].text; elements.helpModalOverlay.classList.remove('hidden'); }

    // --- Auth-Logik ---
    async function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const { error } = await supabase.auth.signInWithPassword({ email: `${username}@fakester.app`, password });
        if (error) showToast(error.message, true);
        else { showToast('Erfolgreich angemeldet!'); elements.loginForm.reset(); }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        
        const { data: { user }, error } = await supabase.auth.signUp({
            email: `${username}@fakester.app`,
            password,
            options: { data: { username: username } }
        });

        if (error) showToast(error.message, true);
        else if (user) {
            const { error: profileError } = await supabase.from('profiles').insert({ id: user.id, username: username });
            if (profileError) showToast(profileError.message, true);
            else {
                showToast('Konto erfolgreich erstellt! Du wirst angemeldet.');
                elements.registerForm.reset();
            }
        }
    }

    async function handleLogout() {
        if (currentUser && !currentUser.isGuest) {
            await supabase.auth.signOut();
        }
        await fetch('/logout', { method: 'POST' });
        spotifyToken = null;
        window.location.reload();
    }
    
    function handleGuestLogin() {
        const guestNickname = elements.guestNicknameInput.value.trim();
        if (guestNickname.length < 3) {
            showToast('Dein Gast-Name muss mindestens 3 Zeichen lang sein.', true);
            return;
        }
        elements.guestModalOverlay.classList.add('hidden');
        initializeAppAsGuest(guestNickname);
    }
    
    // --- Session- und App-Initialisierung ---
    async function initializeApp(user) {
        currentUser = {
            id: user.id,
            username: user.user_metadata.username,
            isGuest: false
        };
        myPlayerId = currentUser.id;
        myNickname = currentUser.username;
        
        elements.playerStats.classList.remove('guest');
        await updateHomeScreenStats();
        await checkSpotifyStatus();
        
        elements.welcomeNickname.textContent = myNickname;
        showScreen('home-screen');
    }

    async function initializeAppAsGuest(nickname) {
        currentUser = {
            id: 'guest-' + Date.now(),
            username: nickname,
            isGuest: true
        };
        myPlayerId = currentUser.id;
        myNickname = currentUser.username;

        elements.playerStats.classList.add('guest');
        await checkSpotifyStatus();
        elements.welcomeNickname.textContent = `${myNickname} (Gast)`;
        showScreen('home-screen');
    }

    async function updateHomeScreenStats() {
        if (!currentUser || currentUser.isGuest) return;
        const { data, error } = await supabase
            .from('profiles')
            .select('games_played, highscore')
            .eq('id', currentUser.id)
            .single();

        if (data) {
            elements.statGamesPlayed.textContent = data.games_played || 0;
            elements.statHighscore.textContent = data.highscore || 0;
        }
    }

    async function checkSpotifyStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            if (!data.loggedIn) throw new Error('Nicht eingeloggt');
            spotifyToken = data.token;
            elements.showCreateButtonLogin.classList.add('hidden');
            elements.showCreateButtonAction.classList.remove('hidden');
        } catch (error) {
            elements.showCreateButtonLogin.classList.remove('hidden');
            elements.showCreateButtonAction.classList.add('hidden');
        } finally {
            elements.logoutButton.classList.remove('hidden');
        }
    }

    // --- Auth State Listener ---
    function setupAuthListener() {
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (session && session.user) {
                initializeApp(session.user);
            } else if (!currentUser || !currentUser.isGuest) {
                currentUser = null;
                showScreen('auth-screen');
            }
        });
    }

    function setupCustomSelects() {
        document.querySelectorAll('.custom-select').forEach(select => {
            const trigger = select.querySelector('.custom-select-trigger');
            const options = select.querySelector('.custom-options');
            
            trigger.addEventListener('click', () => {
                const isOpen = select.classList.contains('open');
                closeAllSelects();
                if (!isOpen) select.classList.add('open');
            });

            options.addEventListener('click', e => {
                if (e.target.classList.contains('custom-option')) {
                    const selectedOption = e.target;
                    const value = selectedOption.dataset.value;
                    const type = select.dataset.type;

                    options.querySelector('.selected')?.classList.remove('selected');
                    selectedOption.classList.add('selected');
                    trigger.querySelector('span').textContent = selectedOption.textContent;
                    hostSettingsState[type] = value;
                    select.classList.remove('open');
                    sendSettingsUpdate();
                }
            });
        });

        window.addEventListener('click', e => {
            if (!e.target.closest('.custom-select-wrapper')) {
                closeAllSelects();
            }
        });
    }
    
    function closeAllSelects() { document.querySelectorAll('.custom-select.open').forEach(select => select.classList.remove('open')); }
    
    function populateCustomSelect(type, data, defaultText, selectedValue) {
        const wrapper = document.getElementById(`${type}-select-wrapper`);
        const select = wrapper.querySelector('.custom-select');
        const optionsContainer = select.querySelector('.custom-options');
        const triggerSpan = select.querySelector('.custom-select-trigger span');
        
        optionsContainer.innerHTML = '';
        if (data.length > 0) {
            data.forEach(item => {
                const optionEl = document.createElement('div');
                optionEl.className = 'custom-option';
                optionEl.dataset.value = item.value;
                optionEl.textContent = item.text;
                if (item.value === selectedValue) {
                    optionEl.classList.add('selected');
                    triggerSpan.textContent = item.text;
                }
                optionsContainer.appendChild(optionEl);
            });
            if (!selectedValue && data[0]) {
                optionsContainer.children[0].classList.add('selected');
                triggerSpan.textContent = data[0].text;
                hostSettingsState[type] = data[0].value;
            }
        } else {
            triggerSpan.textContent = defaultText;
            hostSettingsState[type] = null;
        }
    }
    
    // --- WebSocket-Logik ---
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
            case 'error': showToast(payload.message, true); break;
            case 'round-countdown': showCountdown(payload); break;
            case 'new-round': 
                if (payload.gameMode === 'quiz') startRoundUI(payload);
                else if (payload.gameMode === 'timeline') startTimelineRound(payload);
                else if (payload.gameMode === 'popularity') startPopularityRound(payload);
                updateHeaderScoreboard(payload.scores, payload.hostId); 
                break;
            case 'guess-received': break;
            case 'round-result': updateHeaderScoreboard(payload.scores, payload.hostId); showResultUI(payload); break;
            case 'game-over': elements.headerScoreboard.classList.add('hidden'); showEndScreen(payload.scores); break;
        }
    }

    // --- Spielablauf-UI ---
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
        try {
            const response = await fetch('/api/devices', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!response.ok) throw new Error(`Server-Antwort nicht ok: ${response.status}`);
            const data = await response.json();
            const devices = data.devices.map(d => ({ value: d.id, text: `${d.name} (${d.type})`, selected: d.is_active }));
            const selectedDevice = devices.find(d => d.selected)?.value;
            populateCustomSelect('deviceId', devices, 'Keine Geräte. Spotify öffnen & ↻', selectedDevice);
        } catch (e) { 
            console.error(`Fehler in fetchAndDisplayDevices: ${e.message}`); 
            populateCustomSelect('deviceId', [], 'Laden fehlgeschlagen', null);
        } finally { 
            elements.refreshDevicesButton.disabled = false; 
            sendSettingsUpdate(); 
        }
    }

    async function fetchAndDisplayPlaylists() {
        try {
            const response = await fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!response.ok) throw new Error(`Server-Antwort nicht ok: ${response.status}`);
            const data = await response.json();
            const playlists = data.items.map(p => ({ value: p.id, text: p.name, selected: false }));
            populateCustomSelect('playlistId', playlists, 'Keine Playlists gefunden', playlists[0]?.value);
        } catch (e) { 
            console.error(`Fehler in fetchAndDisplayPlaylists: ${e.message}`);
            populateCustomSelect('playlistId', [], 'Laden fehlgeschlagen', null);
        } finally {
            sendSettingsUpdate();
        }
    }
    
    function updateLobby({ pin, players, hostId, settings, gameMode }) {
        elements.lobbyPinDisplay.textContent = pin;
        elements.playerList.innerHTML = players.map(p => { const hostIcon = p.id === hostId ? ' <i class="fa-solid fa-crown"></i>' : ''; return `<li><span>${p.nickname}</span>${hostIcon}</li>`; }).join('');
        elements.hostSettings.classList.toggle('hidden', !isHost);
        elements.guestWaitingMessage.classList.toggle('hidden', isHost);

        elements.quizTypeSetting.style.display = (gameMode === 'quiz' && isHost) ? 'block' : 'none';

        if (isHost && settings) {
            hostSettingsState.deviceId = settings.deviceId;
            hostSettingsState.playlistId = settings.playlistId;
            document.querySelectorAll('#quiz-type-options .option-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.value === settings.quizType));
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

    function startRoundUI({ round, totalRounds, guessTime, totalPlayers, quizType, mcOptions }) {
        hasSubmittedGuess = false;
        clientSideGuess = { artist: '', title: '', year: '' };
        elements.roundInfo.textContent = `Runde ${round} / ${totalRounds}`;
        elements.readyButton.disabled = false;
        elements.readyStatus.textContent = `0/${totalPlayers} Spieler bereit`;

        if (quizType === 'mc') {
            elements.freeTextInputs.classList.add('hidden');
            elements.multipleChoiceInputs.classList.remove('hidden');
            setupMcButtons(mcOptions);
        } else {
            elements.multipleChoiceInputs.classList.add('hidden');
            elements.freeTextInputs.classList.remove('hidden');
            const inputs = [elements.artistGuess, elements.titleGuess, elements.yearGuess];
            inputs.forEach(input => { input.value = ''; input.disabled = false; });
        }
        
        startTimer(guessTime, elements.timeLeft, () => { if (!hasSubmittedGuess) { submitGuess(); } });
        showScreen('game-screen');
    }

    function submitGuess() {
        if (hasSubmittedGuess) return;
        sendMessage('submit-guess', { guess: clientSideGuess });
        sendMessage('player-ready');
        hasSubmittedGuess = true;
        elements.readyButton.disabled = true;
        [elements.artistGuess, elements.titleGuess, elements.yearGuess].forEach(input => input.disabled = true);
        document.querySelectorAll('.mc-option-btn').forEach(btn => btn.classList.add('disabled'));
    }

    function setupMcButtons(options) {
        const { mcArtistOptions, mcTitleOptions, mcYearOptions } = elements;
        mcArtistOptions.innerHTML = ''; mcTitleOptions.innerHTML = ''; mcYearOptions.innerHTML = '';
        options.artist.forEach(opt => mcArtistOptions.appendChild(createMcButton(opt, 'artist')));
        options.title.forEach(opt => mcTitleOptions.appendChild(createMcButton(opt, 'title')));
        options.year.forEach(opt => mcYearOptions.appendChild(createMcButton(opt, 'year')));
    }

    function createMcButton(value, type) {
        const button = document.createElement('button');
        button.className = 'mc-option-btn';
        button.textContent = value;
        button.dataset.value = value;
        button.dataset.type = type;
        button.addEventListener('click', () => handleMcSelection(button, type, value));
        return button;
    }

    function handleMcSelection(clickedButton, type, value) {
        if (hasSubmittedGuess) return;
        clientSideGuess[type] = value;
        const parent = clickedButton.parentElement;
        parent.querySelectorAll('.mc-option-btn').forEach(btn => btn.classList.remove('selected'));
        clickedButton.classList.add('selected');
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

            document.querySelectorAll('.mc-option-btn').forEach(btn => {
                const { type, value } = btn.dataset;
                const isCorrect = (type === 'artist' && value === song.artist) ||
                                (type === 'title' && value === song.title) ||
                                (type === 'year' && parseInt(value) === song.year);
                
                if (isCorrect) { btn.classList.add('correct'); } 
                else if (btn.classList.contains('selected')) { btn.classList.add('incorrect'); } 
                else { btn.classList.add('not-the-answer'); }
            });
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
    
    async function showEndScreen(scores) {
        showScreen('end-screen');
        const myFinalScore = scores.find(p => p.id === myPlayerId)?.score || 0;
        
        if (currentUser && !currentUser.isGuest) {
            const { data } = await supabase.from('profiles').select('games_played, highscore').eq('id', currentUser.id).single();
            const newGamesPlayed = (data.games_played || 0) + 1;
            const newHighscore = Math.max(data.highscore || 0, myFinalScore);
            await supabase.from('profiles').update({ games_played: newGamesPlayed, highscore: newHighscore }).eq('id', currentUser.id);
        }

        const [first, second, third] = scores;
        const podiumElements = { 1: document.getElementById('podium-player-1'), 2: document.getElementById('podium-player-2'), 3: document.getElementById('podium-player-3') };
        
        Object.values(podiumElements).forEach(el => { el.classList.remove('revealed'); el.querySelector('.podium-nickname').textContent = '...'; el.querySelector('.podium-score').textContent = ''; });

        const revealPlayer = (rank, player) => {
            if (player) {
                const el = podiumElements[rank];
                el.querySelector('.podium-nickname').textContent = player.nickname;
                el.querySelector('.podium-score').textContent = `${player.score} Punkte`;
                el.classList.add('revealed');
            }
        };
        
        setTimeout(() => revealPlayer(3, third), 500);
        setTimeout(() => revealPlayer(2, second), 1500);
        setTimeout(() => revealPlayer(1, first), 2500);
    }
    
    function updatePinDisplay() { elements.pinDisplayDigits.forEach((digit, index) => { digit.textContent = currentPin[index] || ''; digit.classList.toggle('filled', currentPin.length > index); }); }
    function updateCustomInputDisplay() { elements.customInputDisplayDigits.forEach((digit, index) => { digit.textContent = currentCustomInput.value[index] || ''; digit.classList.toggle('filled', currentCustomInput.value.length > index); }); }

    function sendSettingsUpdate() {
        if (!isHost) return;
        const songCountBtn = document.querySelector('#song-count-options .option-btn.active');
        const guessTimeBtn = document.querySelector('#guess-time-options .option-btn.active');
        const quizTypeBtn = document.querySelector('#quiz-type-options .option-btn.active');
        sendMessage('update-settings', { 
            deviceId: hostSettingsState.deviceId, 
            playlistId: hostSettingsState.playlistId, 
            songCount: parseInt(songCountBtn.dataset.value), 
            guessTime: parseInt(guessTimeBtn.dataset.value),
            quizType: quizTypeBtn ? quizTypeBtn.dataset.value : 'free'
        });
    }
    
    // --- Event Listeners ---
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.showRegisterForm.addEventListener('click', (e) => { e.preventDefault(); elements.loginForm.classList.add('hidden'); elements.registerForm.classList.remove('hidden'); });
    elements.showLoginForm.addEventListener('click', (e) => { e.preventDefault(); elements.registerForm.classList.add('hidden'); elements.loginForm.classList.remove('hidden'); });
    elements.logoutButton.addEventListener('click', handleLogout);
    elements.guestModeButton.addEventListener('click', () => { elements.guestModalOverlay.classList.remove('hidden'); });
    elements.closeGuestModalButton.addEventListener('click', () => { elements.guestModalOverlay.classList.add('hidden'); });
    elements.guestNicknameSubmit.addEventListener('click', handleGuestLogin);
    
    elements.showCreateButtonAction.addEventListener('click', () => showScreen('mode-selection-screen'));
    elements.showJoinButton.addEventListener('click', () => { currentPin = ''; updatePinDisplay(); elements.joinModalOverlay.classList.remove('hidden'); });
    elements.modeBoxes.forEach(box => box.addEventListener('click', () => { const mode = box.dataset.mode; if (box.classList.contains('disabled')) return; connectToServer(() => sendMessage('create-game', { user: currentUser, token: spotifyToken, gameMode: mode })); }));
    elements.closeModalButtonExit.addEventListener('click', () => elements.joinModalOverlay.classList.add('hidden'));
    elements.numpadJoin.forEach(button => button.addEventListener('click', () => { const action = button.dataset.action; const value = button.textContent.trim(); if (action === 'clear') currentPin = ''; else if (action === 'backspace') currentPin = currentPin.slice(0, -1); else if (currentPin.length < 4 && !isNaN(parseInt(value))) currentPin += value; updatePinDisplay(); }));
    elements.joinGameButton.addEventListener('click', () => { if (currentPin.length === 4 && currentUser) { connectToServer(() => sendMessage('join-game', { pin: currentPin, user: currentUser })); } });
    
    function handleOptionSelection(e, containerId) {
        const target = e.target.closest('.option-btn');
        if (!target) return;
        if (target.dataset.action === 'custom') {
            const type = target.dataset.type;
            const title = type === 'song-count' ? 'Anzahl Songs' : 'Ratezeit (Sek.)';
            openCustomInputDialog(title, type, target);
        } else {
            document.querySelectorAll(`#${containerId} .option-btn`).forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            sendSettingsUpdate();
        }
    }
    elements.quizTypeOptions.addEventListener('click', (e) => handleOptionSelection(e, 'quiz-type-options'));
    elements.songCountOptions.addEventListener('click', (e) => handleOptionSelection(e, 'song-count-options'));
    elements.guessTimeOptions.addEventListener('click', (e) => handleOptionSelection(e, 'guess-time-options'));

    function openCustomInputDialog(title, type, target) { currentCustomInput = { value: '', type, target }; elements.customInputTitle.textContent = title; updateCustomInputDisplay(); elements.customInputModalOverlay.classList.remove('hidden'); }
    elements.numpadCustom.forEach(button => button.addEventListener('click', () => { const action = button.dataset.action; const value = button.textContent.trim(); if (action === 'clear') currentCustomInput.value = ''; else if (action === 'backspace') currentCustomInput.value = currentCustomInput.value.slice(0, -1); else if (currentCustomInput.value.length < 3 && !isNaN(parseInt(value))) currentCustomInput.value += value; updateCustomInputDisplay(); }));
    elements.customInputSubmit.addEventListener('click', () => { if (!currentCustomInput.value) return; const { target, value, type } = currentCustomInput; const parentSelector = `#${type}-options`; document.querySelectorAll(`${parentSelector} .option-btn`).forEach(btn => btn.classList.remove('active')); target.classList.add('active'); target.textContent = value; target.dataset.value = value; sendSettingsUpdate(); elements.customInputModalOverlay.classList.add('hidden'); });
    elements.customInputCancel.addEventListener('click', () => elements.customInputModalOverlay.classList.add('hidden'));
    elements.refreshDevicesButton.addEventListener('click', fetchAndDisplayDevices);
    elements.startGameButton.addEventListener('click', () => { if (!hostSettingsState.deviceId || !hostSettingsState.playlistId) { showToast("Bitte wähle ein Gerät und eine Playlist aus.", true); return; } sendMessage('start-game'); });
    [elements.artistGuess, elements.titleGuess, elements.yearGuess].forEach(input => input.addEventListener('input', () => { clientSideGuess.artist = elements.artistGuess.value.trim(); clientSideGuess.title = elements.titleGuess.value.trim(); clientSideGuess.year = parseInt(elements.yearGuess.value, 10) || 0; }));
    elements.readyButton.addEventListener('click', submitGuess);
    elements.timelineReadyButton.addEventListener('click', () => { sendMessage('player-ready'); elements.timelineReadyButton.disabled = true; document.querySelectorAll('.drop-zone').forEach(zone => { zone.style.pointerEvents = 'none'; }); });
    elements.guessHigherButton.addEventListener('click', () => { sendMessage('submit-guess', { guess: 'higher' }); [elements.guessHigherButton, elements.guessLowerButton].forEach(b => b.disabled = true); });
    elements.guessLowerButton.addEventListener('click', () => { sendMessage('submit-guess', { guess: 'lower' }); [elements.guessHigherButton, elements.guessLowerButton].forEach(b => b.disabled = true); });
    elements.helpButtons.forEach(button => button.addEventListener('click', () => showHelpModal(button.dataset.topic)));
    elements.helpModalClose.addEventListener('click', () => elements.helpModalOverlay.classList.add('hidden'));
    elements.leaveButton.addEventListener('click', () => { if (ws.socket) { ws.socket.onclose = () => {}; ws.socket.close(); ws.socket = null; } window.location.reload(); });
    elements.backToHomeButton.addEventListener('click', () => { if (currentUser && !currentUser.isGuest) { updateHomeScreenStats(); } showScreen('home-screen'); });
    
    // --- STARTPUNKT DER ANWENDUNG ---
    setupCustomSelects();
    await initializeSupabase();
});
