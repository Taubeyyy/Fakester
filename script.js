document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let achievements = [], userTitles = [], currentGame = { pin: null, playerId: null, isHost: false, gameMode: null };

    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3
    };

    const testAchievements = [
        { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' },
        { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig.' },
        { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' }
    ];
    const testTitles = [
        { id: 1, name: 'Neuling', achievement_id: null },
        { id: 2, name: 'Musik-Kenner', achievement_id: 2 },
        { id: 3, name: 'Legende', achievement_id: 3 }
    ];
    const PLACEHOLDER_IMAGE_URL = 'https://i.imgur.com/3EMVPIA.png';

    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), },
        home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelectBtn: document.getElementById('device-select-button'),
            playlistSelectBtn: document.getElementById('playlist-select-button'),
            startGameBtn: document.getElementById('start-game-button'),
            inviteFriendsBtn: document.getElementById('invite-friends-button'),
            songCountPresets: document.getElementById('song-count-presets'),
            guessTimePresets: document.getElementById('guess-time-presets'),
            answerTypePresets: document.getElementById('answer-type-presets'),
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), contentArea: document.getElementById('game-content-area') },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button') },
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')},
        achievements: { grid: document.getElementById('achievement-grid') },
        titles: { list: document.getElementById('title-list') },
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
        },
        infoModal: {
            overlay: document.getElementById('info-modal-overlay'),
            closeBtn: document.getElementById('close-info-modal-button'),
            title: document.getElementById('info-modal-title'),
            text: document.getElementById('info-modal-text'),
        },
        customConfirmModal: {
            overlay: document.getElementById('custom-confirm-modal-overlay'),
            title: document.getElementById('custom-confirm-title'),
            text: document.getElementById('custom-confirm-text'),
            okBtn: document.getElementById('custom-confirm-ok'),
            cancelBtn: document.getElementById('custom-confirm-cancel'),
        }
    };

    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => { elements.screens.forEach(s => s.classList.remove('active')); document.getElementById(screenId)?.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    
    const showCustomConfirm = (title, text) => {
        return new Promise((resolve) => {
            elements.customConfirmModal.title.textContent = title;
            elements.customConfirmModal.text.textContent = text;
            elements.customConfirmModal.overlay.classList.remove('hidden');

            elements.customConfirmModal.okBtn.onclick = () => {
                elements.customConfirmModal.overlay.classList.add('hidden');
                resolve(true);
            };
            elements.customConfirmModal.cancelBtn.onclick = () => {
                elements.customConfirmModal.overlay.classList.add('hidden');
                resolve(false);
            };
        });
    };

    const initializeApp = async (user, isGuest = false) => {
        sessionStorage.removeItem('fakesterGame');
        currentUser = { 
            id: user.id, 
            username: isGuest ? user.username : user.user_metadata.username,
            titleId: isGuest ? 1 : user.user_metadata.equipped_title_id || 1, 
            isGuest 
        };
        document.body.classList.toggle('is-guest', isGuest);
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        if (!isGuest) { 
            await checkSpotifyStatus(); 
            const { data: stats } = await supabase.from('profiles').select('games_played, wins, correct_answers').eq('id', currentUser.id).single();
            if (stats) {
                document.getElementById('stat-games-played-preview').textContent = stats.games_played || 0;
                document.getElementById('stat-wins-preview').textContent = stats.wins || 0;
                document.getElementById('stat-correct-answers-preview').textContent = stats.correct_answers || 0;
            }

            renderAchievements(); 
            renderTitles();
            const equippedTitle = testTitles.find(t => t.id === currentUser.titleId) || testTitles[0];
            document.getElementById('profile-title').textContent = equippedTitle.name;
        }
        showScreen('home-screen');
        connectWebSocket();
    };

    const checkSpotifyStatus = async () => {
        try { const res = await fetch('/api/status'); const data = await res.json(); spotifyToken = data.loggedIn ? data.token : null; } catch { spotifyToken = null; }
        document.getElementById('spotify-connect-button').classList.toggle('hidden', !!spotifyToken);
        elements.home.createRoomBtn.classList.toggle('hidden', !spotifyToken);
    };

    const handleAuthAction = async (action, form) => {
        setLoading(true);
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        try { const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username, equipped_title_id: 1 } } }); if (error) throw error; } 
        catch (error) { showToast(error.message, true); setLoading(false); }
    };
    const handleLogout = async () => { setLoading(true); if (currentUser?.isGuest) return window.location.reload(); await supabase.auth.signOut(); };

    const connectWebSocket = () => {
        if(ws.socket && ws.socket.readyState === WebSocket.OPEN) return;
        const wsUrl = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
        ws.socket = new WebSocket(wsUrl);

        ws.socket.onopen = () => {
            console.log('✅ WebSocket-Verbindung hergestellt.');
            if (currentUser && !currentUser.isGuest) { ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id } })); }
            const storedGame = JSON.parse(sessionStorage.getItem('fakesterGame'));
            if (storedGame) {
                currentGame = storedGame;
                ws.socket.send(JSON.stringify({ type: 'reconnect', payload: { pin: currentGame.pin, playerId: currentGame.playerId } }));
            }
        };
        ws.socket.onmessage = (event) => { try { const { type, payload } = JSON.parse(event.data); handleWebSocketMessage({ type, payload }); } catch (error) { console.error('Fehler bei Nachricht:', error); } };
        ws.socket.onclose = () => { console.warn('WebSocket-Verbindung getrennt.'); setTimeout(() => { if(sessionStorage.getItem('fakesterGame') || document.getElementById('home-screen').classList.contains('active')) connectWebSocket() }, 3000); };
        ws.socket.onerror = (error) => { console.error('WebSocket-Fehler:', error); if(document.getElementById('auth-screen').classList.contains('active')) return; };
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`Nachricht: ${type}`, payload);
        setLoading(false);
        elements.countdownOverlay.classList.add('hidden');

        switch (type) {
            case 'game-created':
            case 'join-success':
                currentGame = { pin: payload.pin, playerId: payload.playerId, isHost: payload.isHost, gameMode: payload.gameMode };
                sessionStorage.setItem('fakesterGame', JSON.stringify(currentGame));
                if (currentGame.isHost) { fetchHostData(); }
                elements.joinModal.overlay.classList.add('hidden');
                showScreen('lobby-screen');
                break;
            case 'lobby-update':
                elements.lobby.pinDisplay.textContent = payload.pin;
                renderPlayerList(payload.players, payload.hostId);
                updateHostSettings(payload.settings, currentGame.isHost, payload.gameMode);
                break;
            case 'round-countdown':
                showCountdown(payload.round, payload.totalRounds);
                break;
            case 'new-round':
                showScreen('game-screen');
                setupNewRound(payload);
                break;
            case 'round-result':
                showRoundResultAndLeaderboard(payload);
                break;
            case 'reconnect-success':
                currentGame = { pin: payload.pin, playerId: payload.playerId, isHost: payload.isHost, gameMode: payload.gameMode };
                sessionStorage.setItem('fakesterGame', JSON.stringify(currentGame));
                switch (payload.gameState) {
                    case 'LOBBY':
                        if (currentGame.isHost) { fetchHostData(); }
                        updateHostSettings(payload.settings, currentGame.isHost, payload.gameMode);
                        renderPlayerList(payload.players, payload.hostId);
                        showScreen('lobby-screen');
                        break;
                    case 'PLAYING':
                        setupNewRound(payload);
                        showScreen('game-screen');
                        break;
                    case 'RESULTS':
                        showRoundResultAndLeaderboard(payload);
                        showScreen('game-screen');
                        break;
                }
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

    function updateHostSettings(settings, isHost, gameMode) {
        elements.lobby.hostSettings.classList.toggle('hidden', !isHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (!isHost) return;

        const answerTypeContainer = document.getElementById('answer-type-container');
        answerTypeContainer.style.display = gameMode === 'quiz' ? 'flex' : 'none';

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
                customButton.classList.remove('active');
            }
        });

        elements.lobby.deviceSelectBtn.textContent = settings.deviceName || 'Gerät auswählen';
        elements.lobby.playlistSelectBtn.textContent = settings.playlistName || 'Playlist auswählen';

        elements.lobby.startGameBtn.disabled = !(settings.deviceId && settings.playlistId);
    }
    
    function showCountdown(round, total) {
        let text = `Runde ${round}`;
        if (total > 0) text += ` von ${total}`;

        elements.countdownOverlay.classList.remove('hidden');
        document.getElementById('countdown-text').textContent = text;
        let count = 5;
        const numEl = document.getElementById('countdown-number');
        numEl.textContent = count;
        const interval = setInterval(() => {
            count--;
            if (count > 0) numEl.textContent = count;
            else clearInterval(interval);
        }, 1000);
    }

    function setupNewRound(data) {
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds > 0 ? data.totalRounds : '∞';
        
        const sendGuess = (guessData) => {
            const payload = { guess: { ...guessData, timestamp: Date.now() } };
            ws.socket.send(JSON.stringify({ type: 'live-guess-update', payload }));
        };

        if (data.gameMode === 'timeline') {
            elements.game.contentArea.innerHTML = `
                <div class="timeline-guess-container">
                    <div class="song-to-place">
                        <div class="title">${data.currentSong.title}</div>
                        <div class="artist">${data.currentSong.artist}</div>
                    </div>
                    <div class="timeline-track-wrapper">
                        <div class="timeline-track" id="timeline-track"></div>
                    </div>
                </div>`;
            const timelineTrack = document.getElementById('timeline-track');
            timelineTrack.innerHTML += `<button class="drop-zone" data-index="0"><i class="fa-solid fa-plus"></i></button>`;
            data.timeline.forEach((song, index) => {
                timelineTrack.innerHTML += `
                    <div class="timeline-card">
                        <img src="${song.albumArtUrl || PLACEHOLDER_IMAGE_URL}" alt="Album Art">
                        <div class="year">${song.year}</div>
                        <div class="song-info">${song.title}</div>
                    </div>
                    <button class="drop-zone" data-index="${index + 1}"><i class="fa-solid fa-plus"></i></button>`;
            });
            document.querySelectorAll('.drop-zone').forEach(zone => {
                zone.addEventListener('click', () => {
                    document.querySelectorAll('.drop-zone').forEach(z => z.disabled = true);
                    zone.innerHTML = `<i class="fa-solid fa-check"></i>`;
                    sendGuess({ index: parseInt(zone.dataset.index) });
                });
            });

        } else {
            elements.game.contentArea.innerHTML = `
                <div class="album-art-container"><img id="album-art" src="${PLACEHOLDER_IMAGE_URL}" alt="Album Cover"></div>
                <div id="game-guess-area" class="guess-area"></div>`;
            const guessArea = document.getElementById('game-guess-area');

            if (data.gameMode === 'quiz' && data.answerType === 'multiple') {
                data.options.forEach(option => {
                    const button = document.createElement('button');
                    button.classList.add('mc-button');
                    button.innerHTML = `<span class="title">${option.title}</span><span class="artist">${option.artist}</span>`;
                    button.onclick = () => {
                        document.querySelectorAll('.mc-button').forEach(b => b.disabled = true);
                        sendGuess(option);
                    };
                    guessArea.appendChild(button);
                });
            } else {
                guessArea.innerHTML = `<input type="text" id="guess-title" placeholder="Titel des Songs..." autocomplete="off"><input type="text" id="guess-artist" placeholder="Künstler*in" autocomplete="off">`;
                const titleInput = document.getElementById('guess-title');
                const artistInput = document.getElementById('guess-artist');
                artistInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && titleInput.value && artistInput.value) {
                        titleInput.disabled = true;
                        artistInput.disabled = true;
                        sendGuess({ title: titleInput.value, artist: artistInput.value });
                    }
                });
            }
        }
        
        const timerBar = elements.game.timerBar;
        timerBar.style.transition = 'none'; timerBar.style.width = '100%';
        setTimeout(() => { timerBar.style.transition = `width ${data.guessTime}s linear`; timerBar.style.width = '0%'; }, 100);
    }
    
    function showRoundResultAndLeaderboard(data) {
        const me = data.scores.find(p => p.id === currentUser.id);
        const breakdown = me ? me.lastPointsBreakdown : { base: 0, time: 0, total: 0 };
        const leaderboardHtml = data.scores.map(p => `
            <div class="leaderboard-row ${p.id === currentUser.id ? 'me' : ''}">
                <span>${p.nickname} ${p.lives < 1 ? ' ausgeschieden' : ''}</span>
                <span>+${p.lastPointsBreakdown.total} (${p.score})</span>
            </div>`).join('');
        
        let resultHtml = ``;
        const pointsHtml = `<span>Punkte: +${breakdown.base}</span><span>Zeitbonus: +${breakdown.time}</span>`;
        const albumArt = data.song.albumArtUrl || PLACEHOLDER_IMAGE_URL;

        resultHtml = `
            <div class="result-info">
                <img src="${albumArt}" class="result-album-art">
                <h2>${data.song.title}</h2>
                <p>von ${data.song.artist} (${data.song.year})</p>
                <div class="points-breakdown">${pointsHtml}</div>
            </div>`;

        elements.game.contentArea.innerHTML = `
            ${resultHtml}
            <div class="leaderboard">
                <h3>Leaderboard</h3>
                ${leaderboardHtml}
            </div>
            <button id="ready-button" class="button-primary">Bereit</button>`;

        document.getElementById('ready-button').addEventListener('click', (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Warte auf andere...';
            ws.socket.send(JSON.stringify({ type: 'player-ready' }));
        });
    }

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
                    li.textContent = d.name;
                    li.dataset.id = d.id;
                    li.dataset.name = d.name;
                    deviceList.appendChild(li);
                });
                const activeDevice = devices.devices.find(d => d.is_active);
                if (activeDevice && !isRefresh) {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { deviceId: activeDevice.id, deviceName: activeDevice.name } }));
                }
            } else {
                deviceList.innerHTML = '<li>Keine aktiven Geräte gefunden.</li>';
            }

            const playlistList = elements.playlistSelectModal.list;
            playlistList.innerHTML = '';
            playlists.items.forEach(p => {
                const li = document.createElement('li');
                li.textContent = p.name;
                li.dataset.id = p.id;
                li.dataset.name = p.name;
                playlistList.appendChild(li);
            });

        } catch (error) {
            showToast('Fehler beim Laden der Spotify-Daten.', true);
        } finally {
            if(isRefresh) setLoading(false);
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

    const updateCustomValueDisplay = () => {
        elements.customValueModal.display.forEach((d, i) => d.textContent = customValueInput[i] || "");
    };

    function renderAchievements() {
        const userAchievements = [1];
        elements.achievements.grid.innerHTML = testAchievements.map(a => `
            <div class="stat-card ${userAchievements.includes(a.id) ? 'unlocked' : 'locked'}">
                <span class="stat-value">${a.name}</span>
                <span class="stat-label">${a.description}</span>
            </div>`).join('');
    }

    async function updateTitle(titleId) {
        if (currentUser.isGuest) return;
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ data: { equipped_title_id: titleId } });
        setLoading(false);

        if (error) {
            showToast('Fehler beim Speichern des Titels.', true);
        } else {
            currentUser.titleId = titleId;
            const selectedTitle = testTitles.find(t => t.id == titleId) || testTitles[0];
            document.getElementById('profile-title').textContent = selectedTitle.name;
            showToast(`Titel "${selectedTitle.name}" ausgerüstet!`);
        }
    }

    function renderTitles() {
        const userAchievements = [1, 2];
        let finalTitles = [...testTitles];
        if (currentUser && currentUser.username.toLowerCase() === 'taubey') {
            finalTitles.push({ id: 99, name: 'Entwickler', achievement_id: null });
        }
        elements.titles.list.innerHTML = finalTitles.map(t => {
            const isUnlocked = t.achievement_id === null || userAchievements.includes(t.achievement_id);
            const isEquipped = t.id === currentUser.titleId;
            const achievement = testAchievements.find(a => a.id === t.achievement_id);
            return `<div class="stat-card title-card ${isUnlocked ? 'unlocked' : 'locked'} ${isEquipped ? 'equipped' : ''}" data-title-id="${t.id}" data-unlocked="${isUnlocked}">
                        <span class="stat-value">${t.name}</span>
                        <span class="stat-label">${t.achievement_id ? `Von: "${achievement?.name}"` : 'Spezial-Titel'}</span>
                    </div>`;
        }).join('');

        document.querySelectorAll('.title-card[data-unlocked="true"]').forEach(card => {
            card.addEventListener('click', () => {
                const titleId = parseInt(card.dataset.titleId);
                document.querySelector('.title-card.equipped')?.classList.remove('equipped');
                card.classList.add('equipped');
                updateTitle(titleId);
            });
        });
    }

    const main = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && (!ws.socket || ws.socket.readyState === WebSocket.CLOSED)) {
                    console.log('App wieder sichtbar, prüfe Verbindung...');
                    connectWebSocket();
                }
            });

            elements.leaveGameButton.addEventListener('click', async () => {
                const activeScreen = document.querySelector('.screen.active').id;
                switch (activeScreen) {
                    case 'lobby-screen':
                    case 'game-screen':
                        const confirmed = await showCustomConfirm('Spiel verlassen', 'Möchtest du das aktuelle Spiel wirklich verlassen? Dies wird als Niederlage gewertet.');
                        if (confirmed) {
                            sessionStorage.removeItem('fakesterGame');
                            window.location.reload();
                        }
                        break;
                    case 'mode-selection-screen':
                        showScreen('home-screen');
                        break;
                    case 'game-type-selection-screen':
                        showScreen('mode-selection-screen');
                        break;
                    default:
                        showScreen('home-screen');
                        break;
                }
            });
            
            const friendsModal = document.querySelector('.friends-modal');
            const tabButtons = friendsModal.querySelectorAll('.tab-button');
            const tabContents = friendsModal.querySelectorAll('.tab-content');
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    tabContents.forEach(content => content.classList.remove('active'));
                    document.getElementById(button.dataset.tab).classList.add('active');
                });
            });

            document.querySelectorAll('.help-icon').forEach(icon => {
                icon.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    elements.infoModal.text.innerHTML = icon.getAttribute('title');
                    elements.infoModal.overlay.classList.remove('hidden');
                });
            });
            elements.infoModal.closeBtn.addEventListener('click', () => elements.infoModal.overlay.classList.add('hidden'));

            const allCustomButtons = document.querySelectorAll('[data-value="custom"]');
            allCustomButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const type = btn.dataset.type;
                    let title = 'Wert eingeben';
                    if (type === 'song-count') title = 'Anzahl Songs';
                    if (type === 'guess-time') title = 'Ratezeit (s)';
                    if (type === 'lives') title = 'Anzahl Leben';
                    openCustomValueModal(type, title);
                });
            });
            elements.customValueModal.numpad.addEventListener('click', handleCustomNumpad);
            elements.customValueModal.closeBtn.addEventListener('click', () => elements.customValueModal.overlay.classList.add('hidden'));
            elements.customValueModal.numpad.querySelector('[data-action="backspace"]').addEventListener('click', () => {
                customValueInput = customValueInput.slice(0, -1);
                updateCustomValueDisplay();
            });
            elements.customValueModal.confirmBtn.addEventListener('click', () => {
                if (!customValueInput) return;
                const value = parseInt(customValueInput);

                if (currentCustomType === 'lives') {
                    gameCreationSettings.lives = value;
                    elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                    const customBtn = elements.gameTypeScreen.livesPresets.querySelector('[data-value="custom"]');
                    if(customBtn) {
                        customBtn.classList.add('active');
                        customBtn.textContent = value;
                    }
                } else {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [currentCustomType]: value }}));
                }
                elements.customValueModal.overlay.classList.add('hidden');
            });
            
            elements.home.usernameContainer.addEventListener('click', () => {
                if(currentUser.isGuest) return;
                elements.changeNameModal.input.value = currentUser.username;
                elements.changeNameModal.overlay.classList.remove('hidden');
            });
             elements.home.profileTitleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentUser.isGuest) return;
                showScreen('title-selection-screen');
            });
            elements.changeNameModal.closeBtn.addEventListener('click', () => elements.changeNameModal.overlay.classList.add('hidden'));
            elements.changeNameModal.submitBtn.addEventListener('click', async () => {
                const newName = elements.changeNameModal.input.value.trim();
                if(newName.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                if(newName === currentUser.username) return elements.changeNameModal.overlay.classList.add('hidden');

                setLoading(true);
                const { data, error } = await supabase.auth.updateUser({ data: { username: newName } });
                setLoading(false);

                if(error) {
                    showToast(error.message, true);
                } else {
                    currentUser.username = newName;
                    document.getElementById('welcome-nickname').textContent = newName;
                    ws.socket.send(JSON.stringify({ type: 'update-nickname', payload: { newName } }));
                    showToast('Name erfolgreich geändert!');
                    elements.changeNameModal.overlay.classList.add('hidden');
                }
            });

            elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
            elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
            elements.home.logoutBtn.addEventListener('click', handleLogout);
            elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
            elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
            
            elements.guestModal.openBtn.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
            elements.guestModal.closeBtn.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
            elements.guestModal.submitBtn.addEventListener('click', () => {
                const name = document.getElementById('guest-nickname-input').value.trim();
                if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                elements.guestModal.overlay.classList.add('hidden');
                initializeApp({ id: 'guest-' + Date.now(), username: name }, true);
            });
            elements.home.joinRoomBtn.addEventListener('click', () => { pinInput = ""; document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = ""); elements.joinModal.overlay.classList.remove('hidden'); });
            elements.joinModal.closeBtn.addEventListener('click', () => elements.joinModal.overlay.classList.add('hidden'));
            elements.joinModal.numpad.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target) return;
                const key = target.dataset.key;
                const action = target.dataset.action;
                if (key && pinInput.length < 4) { pinInput += key; } 
                else if (action === 'clear') { pinInput = ""; } 
                else if (action === 'confirm' && pinInput.length === 4) {
                    setLoading(true);
                    ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
                }
                document.querySelectorAll('#join-pin-display .pin-digit').forEach((d, i) => d.textContent = pinInput[i] || "");
            });
            elements.home.friendsBtn.addEventListener('click', () => elements.friendsModal.overlay.classList.remove('hidden'));
            elements.friendsModal.closeBtn.addEventListener('click', () => elements.friendsModal.overlay.classList.add('hidden'));

            elements.home.createRoomBtn.addEventListener('click', () => showScreen('mode-selection-screen'));
            document.querySelectorAll('.mode-box').forEach(box => {
                box.addEventListener('click', (e) => {
                    if (e.currentTarget.disabled) return showToast('Dieser Modus ist bald verfügbar!');
                    selectedGameMode = box.dataset.mode;
                    elements.gameTypeScreen.pointsBtn.classList.remove('active');
                    elements.gameTypeScreen.livesBtn.classList.remove('active');
                    elements.gameTypeScreen.livesSettings.classList.add('hidden');
                    elements.gameTypeScreen.createLobbyBtn.disabled = true;
                    gameCreationSettings = { gameType: null, lives: 3 };
                    elements.gameTypeScreen.livesPresets.querySelector('[data-value="custom"]').textContent = 'Custom';
                    showScreen('game-type-selection-screen');
                });
            });

            elements.gameTypeScreen.pointsBtn.addEventListener('click', () => {
                elements.gameTypeScreen.pointsBtn.classList.add('active');
                elements.gameTypeScreen.livesBtn.classList.remove('active');
                elements.gameTypeScreen.livesSettings.classList.add('hidden');
                elements.gameTypeScreen.createLobbyBtn.disabled = false;
                gameCreationSettings.gameType = 'points';
            });
            elements.gameTypeScreen.livesBtn.addEventListener('click', () => {
                elements.gameTypeScreen.livesBtn.classList.add('active');
                elements.gameTypeScreen.pointsBtn.classList.remove('active');
                elements.gameTypeScreen.livesSettings.classList.remove('hidden');
                elements.gameTypeScreen.createLobbyBtn.disabled = false;
                gameCreationSettings.gameType = 'lives';
                elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b=>b.classList.remove('active'));
                elements.gameTypeScreen.livesPresets.querySelector('[data-value="3"]').classList.add('active');
            });
            elements.gameTypeScreen.livesPresets.addEventListener('click', e => {
                const btn = e.target.closest('.preset-button');
                if (!btn || btn.dataset.value === 'custom') return;
                elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                gameCreationSettings.lives = parseInt(btn.dataset.value);
            });
            elements.gameTypeScreen.createLobbyBtn.addEventListener('click', () => {
                setLoading(true);
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ 
                        type: 'create-game', 
                        payload: { user: currentUser, token: spotifyToken, gameMode: selectedGameMode, gameType: gameCreationSettings.gameType, lives: gameCreationSettings.lives } 
                    }));
                } else { 
                    showToast('Verbindung wird hergestellt...', true); 
                    setLoading(false); 
                    connectWebSocket(); 
                }
            });

            elements.home.achievementsBtn.addEventListener('click', () => showScreen('achievements-screen'));
            elements.home.statsBtn.addEventListener('click', () => showScreen('stats-screen'));
            
            elements.lobby.deviceSelectBtn.addEventListener('click', () => elements.deviceSelectModal.overlay.classList.remove('hidden'));
            elements.deviceSelectModal.closeBtn.addEventListener('click', () => elements.deviceSelectModal.overlay.classList.add('hidden'));
            elements.deviceSelectModal.refreshBtn.addEventListener('click', () => fetchHostData(true));
            elements.deviceSelectModal.list.addEventListener('click', (e) => {
                const li = e.target.closest('li');
                if(!li || !li.dataset.id) return;
                ws.socket.send(JSON.stringify({type: 'update-settings', payload: { deviceId: li.dataset.id, deviceName: li.dataset.name }}));
                elements.deviceSelectModal.overlay.classList.add('hidden');
            });

            elements.lobby.playlistSelectBtn.addEventListener('click', () => elements.playlistSelectModal.overlay.classList.remove('hidden'));
            elements.playlistSelectModal.closeBtn.addEventListener('click', () => elements.playlistSelectModal.overlay.classList.add('hidden'));
            elements.playlistSelectModal.list.addEventListener('click', (e) => {
                const li = e.target.closest('li');
                if(!li || !li.dataset.id) return;
                ws.socket.send(JSON.stringify({type: 'update-settings', payload: { playlistId: li.dataset.id, playlistName: li.dataset.name }}));
                elements.playlistSelectModal.overlay.classList.add('hidden');
            });

            [elements.lobby.songCountPresets, elements.lobby.guessTimePresets, elements.lobby.answerTypePresets].forEach(container => {
                container.addEventListener('click', e => {
                    const btn = e.target.closest('.preset-button');
                    if (!btn || btn.dataset.value === 'custom' || btn.disabled) return;
                    let key;
                    if (container.id.includes('song')) key = 'songCount';
                    else if (container.id.includes('time')) key = 'guessTime';
                    else if (container.id.includes('answer')) key = 'answerType';
                    if(key) ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [key]: btn.dataset.value }}));
                });
            });
            elements.lobby.startGameBtn.addEventListener('click', () => {
                ws.socket.send(JSON.stringify({ type: 'start-game' }));
                setLoading(true);
            });

            supabase.auth.onAuthStateChange(async (event, session) => {
                setLoading(true);
                if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
                    if (!currentUser || currentUser.id !== session.user.id) {
                         await initializeApp(session.user);
                    } else {
                        // Handle title update without full re-initialization
                        const newTitleId = session.user.user_metadata.equipped_title_id || 1;
                        if (currentUser.titleId !== newTitleId) {
                            currentUser.titleId = newTitleId;
                            const equippedTitle = testTitles.find(t => t.id === currentUser.titleId) || testTitles[0];
                            document.getElementById('profile-title').textContent = equippedTitle.name;
                            renderTitles();
                        }
                    }
                } else if (event === 'SIGNED_OUT' || !session) {
                    currentUser = null;
                    showScreen('auth-screen');
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
