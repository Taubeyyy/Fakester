document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, userProfile = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    
    // Globale Speicher für DB-Daten
    let userUnlockedAchievementIds = []; 
    let friendsList = []; // Wird jetzt aus DB befüllt
    let friendRequests = []; // Wird jetzt aus DB befüllt
    
    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
    let screenHistory = ['auth-screen'];

    // Callback für das Bestätigungs-Modal
    let confirmationCallback = null;

    // Temporary variables for game creation
    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3
    };

    // =========================================================================================
    // SPIEL-INHALTE (ERWEITERT)
    // =========================================================================================
    const achievementsList = [
        { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' },
        { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig.' },
        { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' },
        { id: 4, name: 'Historiker', description: 'Gewinne eine Timeline-Runde.' },
        { id: 5, name: 'Trendsetter', description: 'Gewinne eine Fame-Runde.' },
        { id: 6, name: 'Musik-Lexikon', description: 'Beantworte 500 Fragen richtig.'},
        { id: 7, name: 'Unbesiegbar', description: 'Gewinne 5 Spiele in Folge.'}, // Logik noch nicht implementiert
        { id: 8, name: 'Jahrhundert-Genie', description: 'Errate das Jahr 25 Mal exakt.'},
        { id: 9, name: 'Perfektionist', description: 'Erziele 225 Punkte in einer Runde (Original).'},
        { id: 10, name: 'Sozial', description: 'Füge deinen ersten Freund hinzu.'}
    ];

    const titlesList = [
        { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1 },
        { id: 2, name: 'Musik-Kenner', unlockType: 'achievement', unlockValue: 2 },
        { id: 3, name: 'Legende', unlockType: 'achievement', unlockValue: 3 },
        { id: 4, name: 'Zeitreisender', unlockType: 'achievement', unlockValue: 4 },
        { id: 5, 'name': 'Star-Experte', unlockType: 'achievement', unlockValue: 5 },
        { id: 6, name: 'Lexikon', unlockType: 'achievement', unlockValue: 6 },
        { id: 7, name: 'Genie', unlockType: 'achievement', unlockValue: 8 },
        { id: 8, name: 'Perfektionist', unlockType: 'achievement', unlockValue: 9 },
        { id: 9, name: 'Best Buddy', unlockType: 'achievement', unlockValue: 10 },
        { id: 10, name: 'Kenner', unlockType: 'level', unlockValue: 10 },
        { id: 11, name: 'Experte', unlockType: 'level', unlockValue: 20 },
        { id: 12, name: 'Meister', unlockType: 'level', unlockValue: 30 },
        { id: 13, name: 'Großmeister', unlockType: 'level', unlockValue: 40 },
        { id: 14, name: 'Maestro', unlockType: 'level', unlockValue: 50 },
        { id: 99, name: 'Entwickler', unlockType: 'special', unlockValue: 'Taubey' }
    ];
    
    const iconsList = [
        { id: 1, iconClass: 'fa-user', unlockType: 'level', unlockValue: 1, description: 'Standard-Icon' },
        { id: 2, iconClass: 'fa-music', unlockType: 'level', unlockValue: 5, description: 'Erreiche Level 5' },
        { id: 3, iconClass: 'fa-star', unlockType: 'level', unlockValue: 10, description: 'Erreiche Level 10' },
        { id: 4, iconClass: 'fa-trophy', unlockType: 'level', unlockValue: 15, description: 'Erreiche Level 15' },
        { id: 5, iconClass: 'fa-crown', unlockType: 'level', unlockValue: 20, description: 'Erreiche Level 20' },
        { id: 6, iconClass: 'fa-headphones', unlockType: 'achievement', unlockValue: 2, description: 'Erfolg: Besserwisser' },
        { id: 7, iconClass: 'fa-guitar', unlockType: 'achievement', unlockValue: 3, description: 'Erfolg: Seriensieger' },
        { id: 8, iconClass: 'fa-bolt', unlockType: 'level', unlockValue: 25, description: 'Erreiche Level 25' },
        { id: 9, iconClass: 'fa-record-vinyl', unlockType: 'level', unlockValue: 30, description: 'Erreiche Level 30' },
        { id: 10, iconClass: 'fa-radio', unlockType: 'level', unlockValue: 35, description: 'Erreiche Level 35' },
        { id: 11, iconClass: 'fa-microphone-lines', unlockType: 'level', unlockValue: 40, description: 'Erreiche Level 40' },
        { id: 12, iconClass: 'fa-compact-disc', unlockType: 'level', unlockValue: 45, description: 'Erreiche Level 45' },
        { id: 13, iconClass: 'fa-dragon', unlockType: 'level', unlockValue: 50, description: 'Erreiche Level 50' },
        { id: 14, iconClass: 'fa-ghost', unlockType: 'achievement', unlockValue: 7, description: 'Erfolg: Unbesiegbar' },
        { id: 15, iconClass: 'fa-clock-rotate-left', unlockType: 'achievement', unlockValue: 4, description: 'Erfolg: Historiker' },
    ];

    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), },
        home: { 
            logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), 
            createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), 
            usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), 
            friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'),
            profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'),
            profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'),
            levelProgressBtn: document.getElementById('level-progress-button'),
        },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelectBtn: document.getElementById('device-select-button'),
            playlistSelectBtn: document.getElementById('playlist-select-button'),
            startGameBtn: document.getElementById('start-game-button'),
            inviteFriendsBtn: document.getElementById('invite-friends-button'),
            songCountPresets: document.getElementById('song-count-presets'),
            guessTimePresets: document.getElementById('guess-time-presets'),
            answerTypeContainer: document.getElementById('answer-type-container'),
            answerTypePresets: document.getElementById('answer-type-presets'),
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), gameContentArea: document.getElementById('game-content-area') },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: { 
            overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), 
            addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), 
            friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'),
            tabs: document.querySelectorAll('.friends-modal .tab-button'), tabContents: document.querySelectorAll('.friends-modal .tab-content'),
            requestsCount: document.getElementById('requests-count'),
        },
        inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list') },
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')},
        achievements: { grid: document.getElementById('achievement-grid') },
        titles: { list: document.getElementById('title-list') },
        icons: { list: document.getElementById('icon-list') },
        levelProgress: { list: document.getElementById('level-progress-list') },
        gameTypeScreen: {
            pointsBtn: document.getElementById('game-type-points'),
            livesBtn: document.getElementById('game-type-lives'),
            livesSettings: document.getElementById('lives-settings-container'),
            livesPresets: document.getElementById('lives-count-presets'),
            createLobbyBtn: document.getElementById('create-lobby-button'),
        },
        changeNameModal: {
            overlay: document.getElementById('change-name-modal-overlay'),
            closeBtn: document.getElementById('close-change-name-modal-button'),
            submitBtn: document.getElementById('change-name-submit'),
            input: document.getElementById('change-name-input'),
        },
        deviceSelectModal: {
            overlay: document.getElementById('device-select-modal-overlay'),
            closeBtn: document.getElementById('close-device-select-modal'),
            list: document.getElementById('device-list'),
            refreshBtn: document.getElementById('refresh-devices-button-modal'),
        },
        playlistSelectModal: {
            overlay: document.getElementById('playlist-select-modal-overlay'),
            closeBtn: document.getElementById('close-playlist-select-modal'),
            list: document.getElementById('playlist-list'),
            search: document.getElementById('playlist-search'),
            pagination: document.getElementById('playlist-pagination'),
        },
        leaveConfirmModal: {
            overlay: document.getElementById('leave-confirm-modal-overlay'),
            confirmBtn: document.getElementById('confirm-leave-button'),
            cancelBtn: document.getElementById('cancel-leave-button'),
        },
        confirmationModal: { // NEUES Modal
            overlay: document.getElementById('confirmation-modal-overlay'),
            title: document.getElementById('confirmation-title'),
            text: document.getElementById('confirmation-text'),
            confirmBtn: document.getElementById('confirmation-confirm-button'),
            cancelBtn: document.getElementById('confirmation-cancel-button'),
        },
        stats: {
            gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'),
            highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'),
            gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'),
        }
    };

    // =========================================================================================
    // HELPER FUNCTIONS (Toast, Navigation, Modal)
    // =========================================================================================
    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    
    const showScreen = (screenId) => {
        const currentScreen = screenHistory[screenHistory.length - 1];
        if (screenId !== currentScreen) screenHistory.push(screenId);
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
        const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };
    
    const goBack = () => {
        if (screenHistory.length > 1) {
            screenHistory.pop();
            const previousScreenId = screenHistory[screenHistory.length - 1];
            elements.screens.forEach(s => s.classList.remove('active'));
            document.getElementById(previousScreenId)?.classList.add('active');
            const showLeaveButton = !['auth-screen', 'home-screen'].includes(previousScreenId);
            elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
        }
    };
    
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);

    // NEUE Funktion für das Bestätigungs-Modal
    const showConfirmationModal = (title, text, onConfirm) => {
        elements.confirmationModal.title.textContent = title;
        elements.confirmationModal.text.textContent = text;
        confirmationCallback = onConfirm; // Speichert, was beim Klick auf "Ja" passieren soll
        elements.confirmationModal.overlay.classList.remove('hidden');
    };

    // =========================================================================================
    // INITIALISIERUNG & AUTHENTIFIZIERUNG
    // =========================================================================================
    const initializeApp = async (user, isGuest = false) => {
        localStorage.removeItem('fakesterGame');
        document.body.classList.toggle('is-guest', isGuest);

        if (isGuest) {
            currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest };
            document.getElementById('welcome-nickname').textContent = currentUser.username;
        } else {
            currentUser = { id: user.id, username: user.user_metadata.username, isGuest };
            await loadUserProfile(); // Lädt Profil, Stats, Erfolge, etc. aus der DB
            
            document.getElementById('welcome-nickname').textContent = userProfile.username;
            if (currentUser.username !== userProfile.username) {
                 currentUser.username = userProfile.username;
            }

            await checkSpotifyStatus(); 
            renderAchievements(); 
            renderTitles();
            renderIcons();
            renderLevelProgressList();
            updateStatsDisplay();
            
            equipTitle(userProfile.equipped_title_id || 1, false); // false = nicht in DB speichern (kommt ja von dort)
            equipIcon(userProfile.equipped_icon_id || 1, false);
            updatePlayerProgress(0, false); // UI mit DB-Daten initialisieren
        }
        
        showScreen('home-screen');
        connectWebSocket();
    };

    const loadUserProfile = async () => {
        if (!currentUser || currentUser.isGuest) return;
        setLoading(true);
        try {
            // 1. Profil & Stats laden
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single();
            
            if (profileError) throw profileError;
            userProfile = profileData;

            // 2. Erfolge laden
            const { data: achievementsData, error: achievementsError } = await supabase
                .from('user_achievements')
                .select('achievement_id') // Du hast 'id' als Spaltenname, aber 'achievement_id' wäre logischer. Korrigiere, falls nötig.
                .eq('id', currentUser.id); // Annahme: 'id' ist die user_id

            if (achievementsError) throw achievementsError;
            // Annahme: achievementsData ist [{achievement_id: 1}, {achievement_id: 3}]
            // Wenn die Spalte 'id' die user_id ist und 'achievement_id' den Erfolg speichert:
            userUnlockedAchievementIds = achievementsData.map(a => a.achievement_id); 
            
        } catch (error) {
            console.error("Fehler beim Laden des Profils:", error);
            showToast("Fehler beim Laden deines Profils.", true);
            await supabase.auth.signOut(); // Fallback zum Logout
        } finally {
            setLoading(false);
        }
    };

    const checkSpotifyStatus = async () => {
        try { const res = await fetch('/api/status'); const data = await res.json(); spotifyToken = data.loggedIn ? data.token : null; } catch { spotifyToken = null; }
        document.getElementById('spotify-connect-button').classList.toggle('hidden', !!spotifyToken);
        elements.home.createRoomBtn.classList.toggle('hidden', !spotifyToken);
    };

    const handleAuthAction = async (action, form, isRegister = false) => {
        setLoading(true);
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        
        let options = {};
        if (isRegister) {
            options = { data: { username: username } }; // Hier wird der Username für den Trigger gesetzt
        }

        try {
            const { error } = await action({ email: `${username}@fakester.app`, password, options });
            if (error) throw error;
            // Supabase onAuthStateChange (unten) übernimmt den Rest
        } catch (error) {
            console.error('Supabase Auth Error:', error);
            showToast(error.message, true);
        } finally {
            setLoading(false);
        }
    };
    
    const handleLogout = async () => { 
        setLoading(true); 
        if (currentUser?.isGuest) return window.location.reload(); 
        await supabase.auth.signOut(); 
        await fetch('/logout', { method: 'POST' }); // Spotify-Cookie löschen
    };

    // =========================================================================================
    // WEBSOCKET & SPIEL-LOGIK
    // =========================================================================================
    const connectWebSocket = () => {
        if(ws.socket && ws.socket.readyState === WebSocket.OPEN) return;
        const wsUrl = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
        ws.socket = new WebSocket(wsUrl);

        ws.socket.onopen = () => {
            console.log('✅ WebSocket-Verbindung hergestellt.');
            if (currentUser && !currentUser.isGuest) { 
                ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id, username: currentUser.username } })); 
            }
            const storedGame = JSON.parse(localStorage.getItem('fakesterGame'));
            if (storedGame) {
                currentGame = storedGame;
                showToast('Verbinde erneut mit dem Spiel...');
                ws.socket.send(JSON.stringify({ type: 'reconnect', payload: { pin: currentGame.pin, playerId: currentGame.playerId, user: currentUser } }));
            }
        };
        ws.socket.onmessage = (event) => { try { const data = JSON.parse(event.data); handleWebSocketMessage(data); } catch (error) { console.error('Fehler bei Nachricht:', error); } };
        ws.socket.onclose = () => { console.warn('WebSocket-Verbindung getrennt.'); setTimeout(() => { if(!document.getElementById('auth-screen').classList.contains('active')) connectWebSocket() }, 3000); };
        ws.socket.onerror = (error) => { console.error('WebSocket-Fehler:', error); };
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`Nachricht: ${type}`, payload);
        setLoading(false);
        if (type !== 'round-countdown') elements.countdownOverlay.classList.add('hidden');

        switch (type) {
            case 'game-created':
            case 'join-success':
                currentGame = { ...currentGame, pin: payload.pin, playerId: payload.playerId, isHost: payload.isHost, gameMode: payload.gameMode };
                localStorage.setItem('fakesterGame', JSON.stringify(currentGame));
                if (currentGame.isHost) { fetchHostData(); }
                elements.joinModal.overlay.classList.add('hidden');
                showScreen('lobby-screen');
                break;
            case 'lobby-update':
                elements.lobby.pinDisplay.textContent = payload.pin;
                renderPlayerList(payload.players, payload.hostId);
                updateHostSettings(payload.settings, currentGame.isHost);
                break;
            case 'game-starting':
                showScreen('game-screen');
                setupPreRound(payload);
                break;
            case 'round-countdown':
                showCountdown(payload.round, payload.totalRounds);
                break;
            case 'new-round':
                showScreen('game-screen');
                setupNewRound(payload);
                break;
            case 'round-result':
                showRoundResult(payload);
                break;
            case 'game-over':
                localStorage.removeItem('fakesterGame');
                const myFinalScore = payload.scores.find(s => s.id === currentUser.id)?.score || 0;
                showToast(`Spiel vorbei! Du hast ${myFinalScore} XP erhalten!`);
                // Der Server speichert die Stats. Wir müssen sie nur neu laden.
                loadUserProfile(); // Lädt XP, Level, Stats neu
                setTimeout(() => {
                    screenHistory = ['home-screen'];
                    showScreen('home-screen');
                }, 5000);
                break;
            case 'invite-received':
                showInvitePopup(payload.from, payload.pin);
                break;
            case 'friend-request-received': // Neue Nachricht vom Server
                showToast(`${payload.from} hat dir eine Freundschaftsanfrage gesendet!`);
                loadFriendsData(); // Freundesliste im Modal aktualisieren
                break;
            case 'toast':
                showToast(payload.message, payload.isError);
                break;
            case 'error':
                showToast(payload.message, true);
                pinInput = "";
                document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = "");
                break;
        }
    };

    function renderPlayerList(players, hostId) {
        // ... (Funktion bleibt unverändert) ...
        const playerList = elements.lobby.playerList;
        const existingPlayerIds = new Set([...playerList.querySelectorAll('.player-card')].map(el => el.dataset.playerId));
        const incomingPlayerIds = new Set(players.map(p => p.id));

        existingPlayerIds.forEach(id => {
            if (!incomingPlayerIds.has(id)) {
                playerList.querySelector(`[data-player-id="${id}"]`)?.remove();
            }
        });

        players.forEach(player => {
            let card = playerList.querySelector(`[data-player-id="${player.id}"]`);
            if (!card) {
                card = document.createElement('div');
                card.dataset.playerId = player.id;
                card.classList.add('player-card', 'new');
                playerList.appendChild(card);
            }
            
            const isHost = player.id === hostId;
            card.className = `player-card ${!player.isConnected ? 'disconnected' : ''} ${isHost ? 'host' : ''}`;
            card.innerHTML = `<i class="fa-solid fa-user player-icon ${isHost ? 'host' : ''}"></i><span class="player-name">${player.nickname}</span>`;
        });
    }

    function updateHostSettings(settings, isHost) {
        // ... (Funktion bleibt unverändert) ...
        elements.lobby.hostSettings.classList.toggle('hidden', !isHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (!isHost) return;

        elements.lobby.answerTypeContainer.classList.toggle('hidden', currentGame.gameMode !== 'quiz');

        ['song-count-presets', 'guess-time-presets', 'answer-type-presets'].forEach(id => {
            const container = document.getElementById(id);
            if(!container) return;
            
            let valueToMatch;
            if (id.includes('song')) valueToMatch = settings.songCount;
            else if (id.includes('time')) valueToMatch = settings.guessTime;
            else if (id.includes('answer')) valueToMatch = settings.answerType;

            let customButton = container.querySelector('[data-value="custom"]');
            let matchFound = false;
            container.querySelectorAll('.preset-button').forEach(btn => {
                const isActive = btn.dataset.value == valueToMatch;
                btn.classList.toggle('active', isActive);
                if(isActive) matchFound = true;
            });
            if (!matchFound && customButton) {
                customButton.classList.add('active');
                customButton.textContent = valueToMatch + (id.includes('time') ? 's' : '');
            } else if (customButton) {
                customButton.textContent = 'Custom';
            }
        });

        elements.lobby.deviceSelectBtn.textContent = settings.deviceName || 'Gerät auswählen';
        elements.lobby.playlistSelectBtn.textContent = settings.playlistName || 'Playlist auswählen';

        elements.lobby.startGameBtn.disabled = !(settings.deviceId && settings.playlistId);
    }
    
    function showCountdown(round, total) {
        // ... (Funktion bleibt unverändert) ...
        let text = `Runde ${round}`;
        if (total > 0) text += ` von ${total}`;

        elements.countdownOverlay.classList.remove('hidden');
        document.getElementById('countdown-text').textContent = text;
        let count = 3;
        const numEl = document.getElementById('countdown-number');
        numEl.textContent = count;
        const interval = setInterval(() => {
            count--;
            if (count > 0) numEl.textContent = count;
            else clearInterval(interval);
        }, 1000);
    }

    function setupPreRound(data) {
        // ... (Funktion bleibt unverändert) ...
        const gameArea = elements.game.gameContentArea;
        const { firstSong, guessTime } = data;
        elements.game.round.textContent = 'Start';
        elements.game.totalRounds.textContent = 'Song';

        gameArea.innerHTML = `
            <div class="result-info">
                <h2>${firstSong.title}</h2>
                <p>von ${firstSong.artist} (${firstSong.year})</p>
                ${currentGame.gameMode === 'popularity' ? `<p>Popularität: ${firstSong.popularity}</p>` : ''}
            </div>
            <div class="timeline-scroll-container">
                <div class="timeline-track" style="justify-content: center;">
                    <div class="timeline-card">
                        <img src="${firstSong.albumArtUrl || ''}" alt="Album Art">
                        <div class="year">${firstSong.year}</div>
                    </div>
                </div>
            </div>
            <button id="ready-button" class="button-primary">Bereit</button>
        `;

        document.getElementById('ready-button').addEventListener('click', (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Warte auf andere...';
            ws.socket.send(JSON.stringify({ type: 'player-ready' }));
        });
        
        const timerBar = elements.game.timerBar;
        timerBar.style.transition = 'none';
        timerBar.style.width = '100%';
        setTimeout(() => {
            timerBar.style.transition = `width ${guessTime}s linear`;
            timerBar.style.width = '0%';
        }, 100);
    }

    function setupNewRound(data) {
        // ... (Funktion bleibt unverändert) ...
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds > 0 ? data.totalRounds : '∞';
        
        const gameArea = elements.game.gameContentArea;
        if (data.gameMode === 'quiz') {
            gameArea.innerHTML = `<div class="album-art-container">${PLACEHOLDER_ICON}</div><div id="game-guess-area" class="guess-area"></div>`;
            const guessArea = document.getElementById('game-guess-area');
            if (data.mcOptions) {
                guessArea.innerHTML = ['title', 'artist', 'year'].map(key => `
                    <div class="mc-group">
                        <label>${key.charAt(0).toUpperCase() + key.slice(1)}</label>
                        <div class="mc-options-grid" id="mc-${key}">
                            ${data.mcOptions[key].map(opt => `<button class="mc-option-button" data-key="${key}" data-value="${opt}">${opt}</button>`).join('')}
                        </div>
                    </div>`).join('');

                document.querySelectorAll('.mc-option-button').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll(`#mc-${btn.dataset.key} .mc-option-button`).forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const guess = {
                            title: document.querySelector('#mc-title .active')?.dataset.value || '',
                            artist: document.querySelector('#mc-artist .active')?.dataset.value || '',
                            year: document.querySelector('#mc-year .active')?.dataset.value || '',
                        };
                        ws.socket.send(JSON.stringify({ type: 'live-guess-update', payload: { guess } }));
                    });
                });
            } else {
                guessArea.innerHTML = `<input type="text" id="guess-title" placeholder="Titel des Songs..." autocomplete="off"><input type="text" id="guess-artist" placeholder="Künstler*in" autocomplete="off"><input type="number" id="guess-year" placeholder="Jahr" autocomplete="off" inputmode="numeric">`;
                ['guess-title', 'guess-artist', 'guess-year'].forEach(id => {
                    document.getElementById(id).addEventListener('input', () => {
                        const guess = { title: document.getElementById('guess-title').value, artist: document.getElementById('guess-artist').value, year: document.getElementById('guess-year').value };
                        ws.socket.send(JSON.stringify({ type: 'live-guess-update', payload: { guess } }));
                    });
                });
            }
        } else if (data.gameMode === 'timeline') {
            // ... (Funktion bleibt unverändert) ...
        } else if (data.gameMode === 'popularity') {
            // ... (Funktion bleibt unverändert) ...
        }
        
        const timerBar = elements.game.timerBar;
        timerBar.style.transition = 'none';
        timerBar.style.width = '100%';
        setTimeout(() => {
            timerBar.style.transition = `width ${data.guessTime}s linear`;
            timerBar.style.width = '0%';
        }, 100);
    }
    
    function showRoundResult(data) {
        // ... (Funktion bleibt unverändert) ...
        const gameArea = elements.game.gameContentArea;
        const me = data.scores.find(p => p.id === currentUser.id);
        const resultText = data.wasCorrect ? 'Richtig!' : 'Falsch!';
        const colorClass = data.wasCorrect ? 'var(--success-color)' : 'var(--danger-color)';

        const leaderboardHtml = `
            <div class="leaderboard">
                <h3>Leaderboard</h3>
                ${data.scores.map(p => `
                    <div class="leaderboard-row ${p.id === currentUser.id ? 'me' : ''}">
                        <span>${p.nickname} ${p.lives < 1 ? ' ausgeschieden' : ''}</span>
                        <span>${p.lastPointsBreakdown ? '+' + p.lastPointsBreakdown.total : ''} (${p.score})</span>
                    </div>`).join('')}
            </div>
            <button id="ready-button" class="button-primary">Weiter</button>`;

        if (currentGame.gameMode === 'quiz') {
            gameArea.querySelector('.album-art-container').innerHTML = `<img id="album-art" src="${data.song.albumArtUrl}" alt="Album Cover">`;
            const breakdown = me ? me.lastPointsBreakdown : { artist: 0, title: 0, year: 0, total: 0 };
            document.getElementById('game-guess-area').innerHTML = `
                <div class="result-info">
                    <h2>${data.song.title}</h2>
                    <p>von ${data.song.artist} (${data.song.year})</p>
                    <div class="points-breakdown">
                        <span>Titel: +${breakdown.title}</span><span>Künstler: +${breakdown.artist}</span><span>Jahr: +${breakdown.year}</span>
                    </div>
                </div>${leaderboardHtml}`;
        } else if (currentGame.gameMode === 'timeline') {
            // ... (Funktion bleibt unverändert) ...
        } else {
             // ... (Funktion bleibt unverändert) ...
        }

        document.getElementById('ready-button').addEventListener('click', (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Warte auf andere...';
            ws.socket.send(JSON.stringify({ type: 'player-ready' }));
        });
    }

    // =========================================================================================
    // SPOTIFY & LOBBY-EINSTELLUNGEN
    // =========================================================================================
    async function fetchHostData(isRefresh = false) {
        if (!spotifyToken) return;
        if(isRefresh) setLoading(true);
        try {
            const [devicesRes, playlistsRes] = await Promise.all([
                fetch('/api/devices', { headers: { 'Authorization': `Bearer ${spotifyToken}` } }),
                fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } })
            ]);
            if (!devicesRes.ok || !playlistsRes.ok) throw new Error('Spotify API Error');
            const devices = await devicesRes.json();
            const playlists = await playlistsRes.json();
            
            const deviceList = elements.deviceSelectModal.list;
            deviceList.innerHTML = '';
            if (devices.devices && devices.devices.length > 0) {
                devices.devices.forEach(d => {
                    const li = document.createElement('li');
                    li.textContent = d.name; li.dataset.id = d.id; li.dataset.name = d.name;
                    deviceList.appendChild(li);
                });
                const activeDevice = devices.devices.find(d => d.is_active);
                if (activeDevice && !isRefresh) {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { deviceId: activeDevice.id, deviceName: activeDevice.name } }));
                }
            } else {
                deviceList.innerHTML = '<li>Keine aktiven Geräte gefunden.</li>';
            }
            
            renderPaginatedPlaylists(playlists.items);

        } catch (error) { showToast('Fehler beim Laden der Spotify-Daten.', true); } 
        finally { if(isRefresh) setLoading(false); }
    }
    
    let allPlaylists = [];
    let currentPage = 1;
    const itemsPerPage = 8;
    function renderPaginatedPlaylists(playlists, page = 1) {
        allPlaylists = playlists;
        currentPage = page;
        
        const listEl = elements.playlistSelectModal.list;
        const paginationEl = elements.playlistSelectModal.pagination;
        listEl.innerHTML = '';
        paginationEl.innerHTML = '';

        const searchTerm = elements.playlistSelectModal.search.value.toLowerCase();
        const filteredPlaylists = allPlaylists.filter(p => p.name.toLowerCase().includes(searchTerm));

        const totalPages = Math.ceil(filteredPlaylists.length / itemsPerPage);
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedItems = filteredPlaylists.slice(start, end);

        paginatedItems.forEach(p => {
            const li = document.createElement('li');
            li.textContent = p.name; li.dataset.id = p.id; li.dataset.name = p.name;
            listEl.appendChild(li);
        });

        if (totalPages > 1) {
            paginationEl.innerHTML = `
                <button id="prev-page" class="button-icon" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
                <span>Seite ${currentPage} / ${totalPages}</span>
                <button id="next-page" class="button-icon" ${currentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
            `;
        }
    }

    function openCustomValueModal(type, title) {
        currentCustomType = type;
        elements.customValueModal.title.textContent = title;
        customValueInput = "";
        updateCustomValueDisplay();
        elements.customValueModal.overlay.classList.remove('hidden');
    }

    const handleCustomNumpad = (e) => {
        const key = e.target.closest('button')?.dataset.key;
        if (key && customValueInput.length < 3) customValueInput += key;
        updateCustomValueDisplay();
    };

    const updateCustomValueDisplay = () => { elements.customValueModal.display.forEach((d, i) => d.textContent = customValueInput[i] || ""); };
    
    // =========================================================================================
    // PROFIL, STATS, LEVEL & UNLOCKS (MIT DB VERKNÜPFT)
    // =========================================================================================

    function renderAchievements() {
        elements.achievements.grid.innerHTML = achievementsList.map(a => {
            const isUnlocked = userUnlockedAchievementIds.includes(a.id);
            return `<div class="stat-card ${!isUnlocked ? 'locked' : ''}"><span class="stat-value">${a.name}</span><span class="stat-label">${a.description}</span></div>`;
        }).join('');
    }

    async function equipTitle(titleId, saveToDb = true) {
        const title = titlesList.find(t => t.id === titleId);
        if (title) {
            document.getElementById('profile-title').textContent = title.name;
            if (saveToDb && userProfile.equipped_title_id !== titleId) {
                userProfile.equipped_title_id = titleId;
                const { error } = await supabase.from('profiles').update({ equipped_title_id: titleId }).eq('id', currentUser.id);
                if (error) showToast("Fehler beim Speichern des Titels.", true);
            }
        }
        renderTitles();
    }

    function renderTitles() {
        const equippedTitleId = userProfile.equipped_title_id || 1;
        
        elements.titles.list.innerHTML = titlesList.map(t => {
            let isUnlocked = checkUnlock(t);
            if (!isUnlocked) return ''; // Zeige nur freigeschaltete Titel an

            const isEquipped = t.id === equippedTitleId;
            return `<div class="title-card ${isEquipped ? 'equipped' : ''}" data-title-id="${t.id}"><span class="stat-value">${t.name}</span></div>`;
        }).join('');
    }

    async function equipIcon(iconId, saveToDb = true) {
        const icon = iconsList.find(i => i.id === iconId);
        if(icon){
            elements.home.profileIcon.className = `fa-solid ${icon.iconClass}`;
            if (saveToDb && userProfile.equipped_icon_id !== iconId) {
                userProfile.equipped_icon_id = iconId;
                const { error } = await supabase.from('profiles').update({ equipped_icon_id: iconId }).eq('id', currentUser.id);
                if (error) showToast("Fehler beim Speichern des Icons.", true);
            }
        }
        renderIcons();
    }

    function renderIcons() {
        const equippedIconId = userProfile.equipped_icon_id || 1;
        
        elements.icons.list.innerHTML = iconsList.map(icon => {
            let isUnlocked = checkUnlock(icon);
            const isEquipped = icon.id === equippedIconId;
            
            return `
                <div class="icon-card ${!isUnlocked ? 'locked' : ''} ${isEquipped ? 'equipped' : ''}" data-icon-id="${icon.id}">
                    <div class="icon-preview"><i class="fa-solid ${icon.iconClass}"></i></div>
                    <span class="stat-label">${isUnlocked ? 'Verfügbar' : icon.description}</span>
                </div>
            `;
        }).join('');
    }

    // Prüft, ob ein Item (Titel/Icon) freigeschaltet ist
    function checkUnlock(item) {
        if (!item.unlockType) return true; // Standard-Items
        if (currentUser.isGuest) return item.unlockType === 'level' && item.unlockValue === 1;
        
        const currentLevel = getLevelForXp(userProfile.xp);
        let isUnlocked = false;
        
        if(item.unlockType === 'level') isUnlocked = currentLevel >= item.unlockValue;
        else if(item.unlockType === 'achievement') isUnlocked = userUnlockedAchievementIds.includes(item.unlockValue);
        else if(item.unlockType === 'special') isUnlocked = currentUser.username.toLowerCase() === item.unlockValue.toLowerCase();

        // Admin-Override
        if (currentUser.username.toLowerCase() === 'taubey') isUnlocked = true;
        
        return isUnlocked;
    }

    // XP & Level Formeln
    function getLevelForXp(xp) {
        if (xp < 0) return 1;
        return Math.floor(Math.pow(xp / 100, 0.7)) + 1;
    }
    function getXpForLevel(level) {
        if (level <= 1) return 0;
        return Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100);
    }

    function updatePlayerProgress(xpGained, showNotification = true) {
        // Diese Funktion aktualisiert nur noch die UI. Die DB wird vom Server aktualisiert.
        // Wenn xpGained > 0, ist es ein Spielende. Wir laden die Daten neu.
        if (xpGained > 0) {
            loadUserProfile(); // Lädt die neuen Stats vom Server
        }
        
        if (!userProfile) return;

        const currentXp = userProfile.xp;
        const currentLevel = getLevelForXp(currentXp);
        const oldLevel = getLevelForXp(currentXp - xpGained);
        
        const xpForCurrentLevel = getXpForLevel(currentLevel);
        const xpForNextLevel = getXpForLevel(currentLevel + 1);
        const xpInCurrentLevel = currentXp - xpForCurrentLevel;
        const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
        const xpPercentage = Math.max(0, Math.min(100, (xpInCurrentLevel / xpNeededForNextLevel) * 100));

        elements.home.profileLevel.textContent = currentLevel;
        elements.home.profileXpFill.style.width = `${xpPercentage}%`;

        if (showNotification && currentLevel > oldLevel) {
            showToast(`Level Up! Du hast Level ${currentLevel} erreicht!`);
            // UI neu rendern, um Unlocks anzuzeigen
            renderIcons();
            renderTitles();
            renderLevelProgressList();
        }
    }
    
    // NEUE Funktion: Rendert die Level-Fortschritts-Seite
    function renderLevelProgressList() {
        if (!userProfile) return;
        const MAX_LEVEL = 50;
        const listEl = elements.levelProgress.list;
        listEl.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp);

        for (let level = 1; level <= MAX_LEVEL; level++) {
            const xpNeeded = getXpForLevel(level);
            const titles = titlesList.filter(t => t.unlockType === 'level' && t.unlockValue === level);
            const icons = iconsList.filter(i => i.unlockType === 'level' && i.unlockValue === level);
            const isUnlocked = level <= currentLevel;
            
            let unlocksHtml = '';
            if (titles.length > 0) {
                unlocksHtml += titles.map(t => `<div class="unlock-item"><i class="fa-solid fa-id-badge"></i> Titel: ${t.name}</div>`).join('');
            }
            if (icons.length > 0) {
                unlocksHtml += icons.map(i => `<div class="unlock-item"><i class="fa-solid ${i.iconClass}"></i> Icon: ${i.description}</div>`).join('');
            }
            if (unlocksHtml === '') {
                unlocksHtml = '<div class="unlock-item" style="color: var(--text-muted-color);">Keine Belohnung</div>';
            }

            listEl.innerHTML += `
                <div class="level-progress-card ${isUnlocked ? 'unlocked' : ''}">
                    <div class="level-header">
                        <h3>Level ${level}</h3>
                        <span class="xp-label">${xpNeeded.toLocaleString('de-DE')} XP</span>
                    </div>
                    <div class="level-unlocks">
                        ${unlocksHtml}
                    </div>
                </div>
            `;
        }
    }

    function updateStatsDisplay() {
        if (!userProfile) return;
        const statsData = {
            games: userProfile.games_played,
            wins: userProfile.wins,
            highscore: userProfile.highscore,
            correct: userProfile.correct_answers,
            avgScore: userProfile.games_played > 0 ? Math.round((userProfile.highscore / userProfile.games_played)) : 0 // Annahme: highscore ist total score? Besser wäre eine 'total_score' Spalte
        };
        
        // TODO: "avgScore" braucht eine "total_score"-Spalte in der DB. Aktuell nutze ich 'highscore' als Platzhalter.
        // Du solltest 'highscore' durch 'total_score' ersetzen, wenn du das in der DB hinzufügst.
        
        elements.stats.gamesPlayed.textContent = statsData.games;
        elements.stats.wins.textContent = statsData.wins;
        elements.stats.winrate.textContent = statsData.games > 0 ? `${Math.round((statsData.wins / statsData.games) * 100)}%` : '0%';
        elements.stats.highscore.textContent = statsData.highscore;
        elements.stats.correctAnswers.textContent = statsData.correct;
        elements.stats.avgScore.textContent = statsData.avgScore; // Siehe TODO
        
        elements.stats.gamesPlayedPreview.textContent = statsData.games;
        elements.stats.winsPreview.textContent = statsData.wins;
        elements.stats.correctAnswersPreview.textContent = statsData.correct;
    }
    
    // =========================================================================================
    // FREUNDE & SOCIAL (MIT DB VERKNÜPFT)
    // =========================================================================================
    
    function showInvitePopup(from, pin) {
        // ... (Funktion bleibt unverändert) ...
        const container = document.getElementById('invite-popup-container');
        const popup = document.createElement('div');
        popup.className = 'invite-popup';
        popup.innerHTML = `
            <p><strong>${from}</strong> hat dich in eine Lobby eingeladen!</p>
            <div class="modal-actions">
                <button class="button-danger">Ablehnen</button>
                <button class="button-primary">Annehmen</button>
            </div>`;
        
        popup.querySelector('.button-danger').addEventListener('click', () => popup.remove());
        popup.querySelector('.button-primary').addEventListener('click', () => {
            ws.socket.send(JSON.stringify({ type: 'invite-response', payload: { accepted: true, pin, user: currentUser }}));
            popup.remove();
        });

        container.appendChild(popup);
    }
    
    async function loadFriendsData() {
        if (!currentUser || currentUser.isGuest) return;

        // 1. Lade offene Anfragen (wo ich der Empfänger bin)
        const { data: requests, error: reqError } = await supabase
            .from('friend_requests')
            .select('sender_id, sender:profiles(username)') // Holt direkt den Username des Senders
            .eq('receiver_id', currentUser.id);
        
        if (reqError) console.error("Fehler beim Laden der Anfragen:", reqError);
        else renderRequestsList(requests || []);

        // 2. Lade bestehende Freunde
        const { data: friendsData, error: friendsError } = await supabase
            .from('friends')
            .select('user_id1, user_id2') // Angepasst an deine Spaltennamen
            .or(`user_id1.eq.${currentUser.id},user_id2.eq.${currentUser.id}`); // Angepasst

        if (friendsError) return console.error("Fehler beim Laden der Freunde:", friendsError);

        // 3. Finde die IDs meiner Freunde heraus
        const friendIds = friendsData.map(f => 
            f.user_id1 === currentUser.id ? f.user_id2 : f.user_id1 // Angepasst
        );

        if (friendIds.length === 0) {
            renderFriendsList([]); // Leere Liste rendern
            return;
        }

        // 4. Lade die Profile meiner Freunde
        const { data: friendProfiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', friendIds);

        if (profilesError) console.error("Fehler beim Laden der Freundesprofile:", profilesError);
        else renderFriendsList(friendProfiles || []);
    }

    // Neue Render-Funktion für Anfragen (ersetzt Dummy-Logik)
    function renderRequestsList(requests) {
        friendRequests = requests; // Speichern für Klick-Events
        const listEl = elements.friendsModal.requestsList;
        const countEl = elements.friendsModal.requestsCount;

        if (requests.length === 0) {
            listEl.innerHTML = '<li>Keine offenen Anfragen.</li>';
            countEl.classList.add('hidden');
            countEl.textContent = '0';
            return;
        }
        
        countEl.textContent = requests.length;
        countEl.classList.remove('hidden');

        listEl.innerHTML = requests.map((req, index) => `
            <li>
                <div class="friend-info">
                    <span>${req.sender.username}</span>
                    <span class="friend-status">Möchte dein Freund sein</span>
                </div>
                <div class="friend-actions">
                    <button class="button-icon button-small accept-request" data-index="${index}" title="Annehmen"><i class="fa-solid fa-check"></i></button>
                    <button class="button-icon button-small button-danger decline-request" data-index="${index}" title="Ablehnen"><i class="fa-solid fa-times"></i></button>
                </div>
            </li>
        `).join('');
    }

    // renderFriendsList angepasst (ersetzt Dummy-Logik)
    function renderFriendsList(friends) {
        friendsList = friends; // Speichern für Klick-Events
        const listEl = elements.friendsModal.friendsList; 
        
        if (friends.length === 0) {
            listEl.innerHTML = '<li>Noch keine Freunde hinzugefügt.</li>';
            return;
        }

        // TODO: Online-Status vom Server abgleichen (erfordert mehr Logik in server.js)
        listEl.innerHTML = friends.map((friend, index) => `
            <li>
                <div class="friend-info">
                    <span>${friend.username}</span>
                    <span class="friend-status">Offline</span> </div>
                <div class="friend-actions">
                    <button class="button-icon button-small button-danger remove-friend" data-index="${index}" title="Freund entfernen"><i class="fa-solid fa-trash"></i></button>
                </div>
            </li>
        `).join('');
    }

    // =========================================================================================
    // MAIN APP INITIALIZATION AND EVENT LISTENERS
    // =========================================================================================
    const main = async () => {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            document.body.addEventListener('click', async (e) => {
                const target = e.target;
                
                // --- Navigation ---
                if (target.closest('#leave-game-button')) {
                    const inGame = document.getElementById('lobby-screen').classList.contains('active') || document.getElementById('game-screen').classList.contains('active');
                    if (inGame) {
                        elements.leaveConfirmModal.overlay.classList.remove('hidden');
                    } else {
                        goBack();
                    }
                }
                if (target.closest('#confirm-leave-button')) {
                    localStorage.removeItem('fakesterGame');
                    window.location.reload();
                }
                if (target.closest('#cancel-leave-button')) {
                    elements.leaveConfirmModal.overlay.classList.add('hidden');
                }
                
                // --- Modals (Allgemein) ---
                if (target.closest('.help-icon')) showToast(target.closest('.help-icon').title);
                if (target.closest('#guest-mode-button')) elements.guestModal.overlay.classList.remove('hidden');
                if (target.closest('#close-guest-modal-button')) elements.guestModal.overlay.classList.add('hidden');
                if (target.closest('#guest-nickname-submit')) {
                    const name = document.getElementById('guest-nickname-input').value.trim();
                    if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                    elements.guestModal.overlay.classList.add('hidden');
                    initializeApp({ id: 'guest-' + Date.now(), username: name }, true);
                }
                if (target.closest('#show-join-button')) {
                    pinInput = ""; 
                    document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = ""); 
                    elements.joinModal.overlay.classList.remove('hidden');
                }
                if (target.closest('#close-join-modal-button')) elements.joinModal.overlay.classList.add('hidden');
                
                // --- Bestätigungs-Modal (NEU) ---
                if (target.closest('#confirmation-cancel-button')) {
                    elements.confirmationModal.overlay.classList.add('hidden');
                    confirmationCallback = null;
                }
                if (target.closest('#confirmation-confirm-button')) {
                    if (confirmationCallback) confirmationCallback();
                    elements.confirmationModal.overlay.classList.add('hidden');
                    confirmationCallback = null;
                }

                // --- Freunde-Modal (NEU mit DB-Logik) ---
                if (target.closest('#friends-button')) {
                    loadFriendsData(); // Lädt die echten Daten
                    elements.friendsModal.overlay.classList.remove('hidden');
                    elements.friendsModal.tabs[0].click(); // Ersten Tab aktivieren
                }
                if (target.closest('#close-friends-modal-button')) elements.friendsModal.overlay.classList.add('hidden');
                
                if (target.closest('#add-friend-button')) {
                    const friendName = elements.friendsModal.addFriendInput.value.trim();
                    if (friendName.length < 3) return showToast('Name ist zu kurz.', true);
                    if (friendName.toLowerCase() === currentUser.username.toLowerCase()) return showToast('Du kannst dich nicht selbst hinzufügen.', true);
                    
                    ws.socket.send(JSON.stringify({ type: 'add-friend', payload: { friendName }}));
                    elements.friendsModal.addFriendInput.value = '';
                }
                
                // Tab-Wechsel
                const tabBtn = target.closest('.friends-modal .tab-button');
                if (tabBtn) {
                    elements.friendsModal.tabs.forEach(b => b.classList.remove('active'));
                    tabBtn.classList.add('active');
                    elements.friendsModal.tabContents.forEach(c => c.classList.remove('active'));
                    document.getElementById(tabBtn.dataset.tab).classList.add('active');
                }

                // Anfrage Annehmen
                const acceptBtn = target.closest('.accept-request');
                if (acceptBtn) {
                    const request = friendRequests[acceptBtn.dataset.index];
                    ws.socket.send(JSON.stringify({ type: 'accept-friend-request', payload: { senderId: request.sender_id }}));
                    acceptBtn.closest('li').remove(); // UI direkt aktualisieren
                }
                
                // Anfrage Ablehnen (NEU mit Modal)
                const declineBtn = target.closest('.decline-request');
                if (declineBtn) {
                    const request = friendRequests[declineBtn.dataset.index];
                    showConfirmationModal('Anfrage ablehnen?', `Möchtest du die Freundschaftsanfrage von ${request.sender.username} wirklich ablehnen?`, () => {
                        ws.socket.send(JSON.stringify({ type: 'decline-friend-request', payload: { senderId: request.sender_id }}));
                        declineBtn.closest('li').remove();
                    });
                }
                
                // Freund Entfernen (NEU mit Modal)
                const removeBtn = target.closest('.remove-friend');
                if (removeBtn) {
                    const friend = friendsList[removeBtn.dataset.index];
                    showConfirmationModal('Freund entfernen?', `Möchtest du ${friend.username} wirklich aus deiner Freundesliste entfernen?`, () => {
                        ws.socket.send(JSON.stringify({ type: 'remove-friend', payload: { friendId: friend.id }}));
                        removeBtn.closest('li').remove();
                    });
                }

                // --- Freunde Einladen ---
                if (target.closest('#invite-friends-button')) {
                    // Filtert die geladene Freundesliste. TODO: Online-Status
                    const onlineFriends = friendsList.filter(f => f.status === 'online'); // 'status' existiert noch nicht
                    // HACK: Zeige erstmal alle Freunde an
                    elements.inviteFriendsModal.list.innerHTML = friendsList.map(f => `<li><span>${f.username}</span><button class="button-primary button-small" data-friend-id="${f.id}" data-friend-name="${f.username}">Einladen</button></li>`).join('');
                    if (friendsList.length === 0) {
                        elements.inviteFriendsModal.list.innerHTML = '<li>Du hast noch keine Freunde.</li>';
                    }
                    elements.inviteFriendsModal.overlay.classList.remove('hidden');
                }
                if (target.closest('#close-invite-modal-button')) elements.inviteFriendsModal.overlay.classList.add('hidden');
                
                const inviteBtn = target.closest('#online-friends-list button');
                if(inviteBtn) {
                    ws.socket.send(JSON.stringify({ type: 'invite-friend', payload: { friendId: inviteBtn.dataset.friendId, friendName: inviteBtn.dataset.friendName } }));
                }

                // --- Profil & Unlocks ---
                if (target.closest('#username-container')) {
                    if(currentUser && !currentUser.isGuest) {
                        elements.changeNameModal.input.value = currentUser.username;
                        elements.changeNameModal.overlay.classList.remove('hidden');
                    }
                }
                 if (target.closest('.profile-title-button')) {
                    if (currentUser && !currentUser.isGuest) showScreen('title-selection-screen');
                }
                 if (target.closest('#profile-picture-button')) {
                    if (currentUser && !currentUser.isGuest) showScreen('icon-selection-screen');
                }
                if (target.closest('#level-progress-button')) { // NEU
                    if (currentUser && !currentUser.isGuest) showScreen('level-progress-screen');
                }

                if (target.closest('#close-change-name-modal-button')) elements.changeNameModal.overlay.classList.add('hidden');
                if (target.closest('#change-name-submit')) {
                    const newName = elements.changeNameModal.input.value.trim();
                    if(newName.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                    if(newName === currentUser.username) return elements.changeNameModal.overlay.classList.add('hidden');
                    
                    setLoading(true);
                    // 1. Auth-User aktualisieren
                    const { error: authError } = await supabase.auth.updateUser({ data: { username: newName } });
                    // 2. Profile-Tabelle aktualisieren
                    const { error: profileError } = await supabase.from('profiles').update({ username: newName }).eq('id', currentUser.id);
                    setLoading(false);

                    if(authError || profileError) { showToast(authError?.message || profileError?.message, true); } 
                    else {
                        currentUser.username = newName;
                        userProfile.username = newName;
                        document.getElementById('welcome-nickname').textContent = newName;
                        ws.socket.send(JSON.stringify({ type: 'update-nickname', payload: { newName } }));
                        showToast('Name erfolgreich geändert!');
                        elements.changeNameModal.overlay.classList.add('hidden');
                    }
                }
                if (target.closest('#corner-logout-button')) handleLogout();
                if (target.closest('#achievements-button')) showScreen('achievements-screen');
                if (target.closest('#stats-button')) showScreen('stats-screen');
                if (target.closest('#show-create-button-action')) showScreen('mode-selection-screen');
                
                const titleCard = target.closest('.title-card');
                if (titleCard) equipTitle(parseInt(titleCard.dataset.titleId));
                
                const iconCard = target.closest('.icon-card:not(.locked)');
                if (iconCard) equipIcon(parseInt(iconCard.dataset.iconId));
                
                // --- Spielerstellung ---
                const modeBox = target.closest('.mode-box');
                if (modeBox) {
                    selectedGameMode = modeBox.dataset.mode;
                    showScreen('game-type-selection-screen');
                    elements.gameTypeScreen.pointsBtn.classList.remove('active');
                    elements.gameTypeScreen.livesBtn.classList.remove('active');
                    elements.gameTypeScreen.createLobbyBtn.disabled = true;
                }
                if (target.closest('#game-type-points')) {
                    elements.gameTypeScreen.pointsBtn.classList.add('active'); elements.gameTypeScreen.livesBtn.classList.remove('active');
                    elements.gameTypeScreen.livesSettings.classList.add('hidden'); elements.gameTypeScreen.createLobbyBtn.disabled = false;
                    gameCreationSettings.gameType = 'points';
                }
                 if (target.closest('#game-type-lives')) {
                    elements.gameTypeScreen.livesBtn.classList.add('active'); elements.gameTypeScreen.pointsBtn.classList.remove('active');
                    elements.gameTypeScreen.livesSettings.classList.remove('hidden'); elements.gameTypeScreen.createLobbyBtn.disabled = false;
                    gameCreationSettings.gameType = 'lives';
                    elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b=>b.classList.remove('active'));
                    elements.gameTypeScreen.livesPresets.querySelector('[data-value="3"]').classList.add('active');
                }
                 if (target.closest('#lives-count-presets .preset-button')) {
                    const btn = target.closest('#lives-count-presets .preset-button');
                    if (btn.dataset.value === 'custom') {
                        openCustomValueModal('lives', 'Anzahl Leben');
                    } else {
                        elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        gameCreationSettings.lives = parseInt(btn.dataset.value);
                    }
                }
                if (target.closest('#create-lobby-button')) {
                    setLoading(true);
                    ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: selectedGameMode, gameType: gameCreationSettings.gameType, lives: gameCreationSettings.lives } }));
                }

                // --- Lobby-Einstellungen ---
                if (target.closest('#device-select-button')) elements.deviceSelectModal.overlay.classList.remove('hidden');
                if (target.closest('#close-device-select-modal')) elements.deviceSelectModal.overlay.classList.add('hidden');
                if (target.closest('#refresh-devices-button-modal')) fetchHostData(true);
                const deviceLi = target.closest('#device-list li');
                if (deviceLi && deviceLi.dataset.id) {
                    ws.socket.send(JSON.stringify({type: 'update-settings', payload: { deviceId: deviceLi.dataset.id, deviceName: deviceLi.dataset.name }}));
                    elements.deviceSelectModal.overlay.classList.add('hidden');
                }
                
                if (target.closest('#playlist-select-button')) elements.playlistSelectModal.overlay.classList.remove('hidden');
                if (target.closest('#close-playlist-select-modal')) elements.playlistSelectModal.overlay.classList.add('hidden');
                const playlistLi = target.closest('#playlist-list li');
                if (playlistLi && playlistLi.dataset.id) {
                    ws.socket.send(JSON.stringify({type: 'update-settings', payload: { playlistId: playlistLi.dataset.id, playlistName: playlistLi.dataset.name }}));
                    elements.playlistSelectModal.overlay.classList.add('hidden');
                }
                
                const presetBtn = target.closest('.preset-button');
                if (presetBtn && presetBtn.dataset.value === 'custom' && !presetBtn.closest('#lives-count-presets')) {
                    const type = presetBtn.dataset.type;
                    let title = 'Wert eingeben';
                    if (type === 'song-count') title = 'Anzahl Songs';
                    else if (type === 'guess-time') title = 'Ratezeit (s)';
                    openCustomValueModal(type, title);
                } else if (presetBtn && !presetBtn.closest('#lives-count-presets')) {
                    const container = presetBtn.parentElement;
                    let key;
                    if (container.id.includes('song')) key = 'songCount';
                    else if (container.id.includes('time')) key = 'guessTime';
                    else if (container.id.includes('answer')) key = 'answerType';
                    if(key) ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [key]: presetBtn.dataset.value }}));
                }
                
                if (target.closest('#start-game-button')) {
                    ws.socket.send(JSON.stringify({ type: 'start-game' }));
                    setLoading(true);
                }
            });

            // --- Numpad-Listener ---
            elements.joinModal.numpad.addEventListener('click', (e) => {
                const target = e.target.closest('button'); if (!target) return;
                const key = target.dataset.key; const action = target.dataset.action;
                if (key && pinInput.length < 4) { pinInput += key; } 
                else if (action === 'clear') { pinInput = ""; } 
                else if (action === 'confirm' && pinInput.length === 4) {
                    setLoading(true);
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                        ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
                    } else {
                        showToast('Verbindung wird hergestellt... Erneut versuchen.', true);
                        connectWebSocket(); setLoading(false);
                    }
                }
                document.querySelectorAll('#join-pin-display .pin-digit').forEach((d, i) => d.textContent = pinInput[i] || "");
            });
            
            elements.customValueModal.numpad.addEventListener('click', handleCustomNumpad);
            elements.customValueModal.closeBtn.addEventListener('click', () => elements.customValueModal.overlay.classList.add('hidden'));
            elements.customValueModal.numpad.querySelector('[data-action="backspace"]').addEventListener('click', () => { customValueInput = customValueInput.slice(0, -1); updateCustomValueDisplay(); });
            elements.customValueModal.confirmBtn.addEventListener('click', () => {
                if (!customValueInput) return;
                const value = parseInt(customValueInput);
                if (currentCustomType === 'lives') {
                    gameCreationSettings.lives = value;
                    const customBtn = elements.gameTypeScreen.livesPresets.querySelector('[data-value="custom"]');
                    if(customBtn) { customBtn.textContent = value; customBtn.classList.add('active'); }
                } else {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [currentCustomType.replace('song-count', 'songCount').replace('guess-time', 'guessTime')]: value }}));
                }
                elements.customValueModal.overlay.classList.add('hidden');
            });
            
            // --- Playlist-Suche/Pagination ---
            elements.playlistSelectModal.search.addEventListener('input', () => renderPaginatedPlaylists(allPlaylists));
            elements.playlistSelectModal.pagination.addEventListener('click', (e) => {
                if (e.target.closest('#next-page')) {
                    renderPaginatedPlaylists(allPlaylists, currentPage + 1);
                } else if (e.target.closest('#prev-page')) {
                    renderPaginatedPlaylists(allPlaylists, currentPage - 1);
                }
            });

            // --- Auth Forms ---
            elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget, false); });
            elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget, true); });
            elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
            elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
            
            // --- App-Lebenszyklus ---
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!ws.socket || ws.socket.readyState === WebSocket.CLOSED)) connectWebSocket(); });

            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log('Auth Event:', event, session);
                const storedGame = localStorage.getItem('fakesterGame');
                if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) {
                    if (!currentUser || currentUser.id !== session.user.id || event === 'USER_UPDATED') {
                       await initializeApp(session.user);
                    }
                } else if (event === 'SIGNED_OUT' || (!session && !storedGame)) {
                    currentUser = null;
                    userProfile = null;
                    localStorage.clear(); // Clear all local storage on logout
                    screenHistory = ['auth-screen'];
                    showScreen('auth-screen');
                    document.body.classList.add('is-guest'); // Zeige Gast-Inhalte
                }
                setLoading(false);
            });
        } catch (error) {
            setLoading(false);
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p></div>`;
        }
    };
    main();
});

