document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let achievements = [], userTitles = [], currentGame = { pin: null, playerId: null, isHost: false, gameMode: null };

    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3
    };

    const testAchievements = [ { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' }, { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig.' }, { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' }];
    const testTitles = [ { id: 1, name: 'Neuling', achievement_id: null }, { id: 2, name: 'Musik-Kenner', achievement_id: 2 }, { id: 3, name: 'Legende', achievement_id: 3 }];
    const PLACEHOLDER_IMAGE_URL = 'https://i.imgur.com/3EMVPIA.png';

    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), },
        home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), profileInfoBtn: document.getElementById('profile-info-button'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelect: document.getElementById('device-select'), playlistSelect: document.getElementById('playlist-select'), startGameBtn: document.getElementById('start-game-button'), inviteFriendsBtn: document.getElementById('invite-friends-button'), refreshDevicesBtn: document.getElementById('refresh-devices-button'),
            songCountPresets: document.getElementById('song-count-presets'),
            guessTimePresets: document.getElementById('guess-time-presets'),
            gameTypePresets: document.getElementById('game-type-presets'),
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), albumArt: document.getElementById('album-art'), guessArea: document.getElementById('game-guess-area'), submitBtn: document.getElementById('submit-guess-button'), },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), tabs: document.querySelectorAll('.friends-modal .tab-button'), tabContents: document.querySelectorAll('.friends-modal .tab-content'), friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'), requestsCount: document.getElementById('requests-count'), },
        inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list'), },
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
        }
    };

    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => { elements.screens.forEach(s => s.classList.remove('active')); document.getElementById(screenId)?.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    
    const initializeApp = async (user, isGuest = false) => {
        sessionStorage.removeItem('fakesterGame');
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        document.body.classList.toggle('is-guest', isGuest);
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        if (!isGuest) { await checkSpotifyStatus(); renderAchievements(); renderTitles(); }
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
        try { const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } }); if (error) throw error; } 
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
        ws.socket.onclose = () => { console.warn('WebSocket-Verbindung getrennt.'); setTimeout(() => { if(sessionStorage.getItem('fakesterGame')) connectWebSocket() }, 3000); };
        ws.socket.onerror = (error) => { console.error('WebSocket-Fehler:', error); showToast('Verbindungsfehler.', true); };
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
                showScreen('lobby-screen');
                break;
            case 'lobby-update':
                elements.lobby.pinDisplay.textContent = payload.pin;
                renderPlayerList(payload.players, payload.hostId);
                updateHostSettings(payload.settings, currentGame.isHost);
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
            case 'toast':
                showToast(payload.message, payload.isError);
                break;
            case 'error':
                showToast(payload.message, true);
                elements.joinModal.overlay.classList.add('hidden');
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

    function updateHostSettings(settings, isHost) {
        elements.lobby.hostSettings.classList.toggle('hidden', !isHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (!isHost) return;
        
        document.getElementById('game-type-setting-lobby').classList.add('hidden');

        ['song-count-presets', 'guess-time-presets'].forEach(id => {
            const container = document.getElementById(id);
            let valueToMatch = id.includes('song') ? settings.songCount : settings.guessTime;
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

        if (elements.lobby.deviceSelect.value !== settings.deviceId) elements.lobby.deviceSelect.value = settings.deviceId;
        if (elements.lobby.playlistSelect.value !== settings.playlistId) elements.lobby.playlistSelect.value = settings.playlistId;

        elements.lobby.startGameBtn.disabled = !(settings.deviceId && settings.playlistId);
    }
    
    function showCountdown(round, total) {
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

    function setupNewRound(data) {
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds > 0 ? data.totalRounds : '∞';
        elements.game.albumArt.src = PLACEHOLDER_IMAGE_URL;
        elements.game.submitBtn.classList.add('hidden');

        if (data.gameMode === 'quiz') {
            elements.game.guessArea.innerHTML = `
                <input type="text" id="guess-title" placeholder="Titel des Songs..." autocomplete="off">
                <input type="text" id="guess-artist" placeholder="Künstler*in" autocomplete="off">
                <input type="number" id="guess-year" placeholder="Jahr" autocomplete="off" inputmode="numeric">`;
            
            ['guess-title', 'guess-artist', 'guess-year'].forEach(id => {
                document.getElementById(id).addEventListener('input', () => {
                    const guess = {
                        title: document.getElementById('guess-title').value,
                        artist: document.getElementById('guess-artist').value,
                        year: document.getElementById('guess-year').value
                    };
                    ws.socket.send(JSON.stringify({type: 'live-guess-update', payload: { guess }}));
                });
            });
        }
        
        const timerBar = elements.game.timerBar;
        timerBar.style.transition = 'none';
        timerBar.style.width = '100%';
        setTimeout(() => {
            timerBar.style.transition = `width ${data.guessTime}s linear`;
            timerBar.style.width = '0%';
        }, 100);
    }
    
    function showRoundResultAndLeaderboard(data) {
        elements.game.albumArt.src = data.song.albumArtUrl;
        const me = data.scores.find(p => p.id === currentUser.id);
        const breakdown = me ? me.lastPointsBreakdown : { artist: 0, title: 0, year: 0, total: 0 };

        const leaderboardHtml = data.scores.map(p => `
            <div class="leaderboard-row ${p.id === currentUser.id ? 'me' : ''}">
                <span>${p.nickname} ${p.lives < 1 ? ' ausgeschieden' : ''}</span>
                <span>+${p.lastPointsBreakdown.total} (${p.score})</span>
            </div>
        `).join('');

        elements.game.guessArea.innerHTML = `
            <div class="result-info">
                <h2>${data.song.title}</h2>
                <p>von ${data.song.artist} (${data.song.year})</p>
                <div class="points-breakdown">
                    <span>Titel: +${breakdown.title}</span>
                    <span>Künstler: +${breakdown.artist}</span>
                    <span>Jahr: +${breakdown.year}</span>
                </div>
            </div>
            <div class="leaderboard">
                <h3>Leaderboard</h3>
                ${leaderboardHtml}
            </div>
            <button id="ready-button" class="button-primary">Bereit</button>
        `;

        document.getElementById('ready-button').addEventListener('click', (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Warte auf andere...';
            ws.socket.send(JSON.stringify({ type: 'player-ready' }));
        });
    }

    async function fetchHostData() {
        if (!spotifyToken) return;
        setLoading(true);
        try {
            const [devicesRes, playlistsRes] = await Promise.all([
                fetch('/api/devices', { headers: { 'Authorization': `Bearer ${spotifyToken}` } }),
                fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } })
            ]);
            if (!devicesRes.ok || !playlistsRes.ok) throw new Error('Spotify API Error');
            const devices = await devicesRes.json();
            const playlists = await playlistsRes.json();
            
            if (devices.devices && devices.devices.length > 0) {
                elements.lobby.deviceSelect.innerHTML = '<option value="">Gerät auswählen</option>' + devices.devices.map(d => `<option value="${d.id}" ${d.is_active ? 'selected' : ''}>${d.name}</option>`).join('');
                const activeDevice = devices.devices.find(d => d.is_active);
                if (activeDevice) {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { deviceId: activeDevice.id } }));
                }
            } else {
                elements.lobby.deviceSelect.innerHTML = '<option value="">Keine aktiven Geräte gefunden</option>';
            }
            elements.lobby.playlistSelect.innerHTML = '<option value="">Playlist auswählen</option>' + playlists.items.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        } catch (error) {
            showToast('Fehler beim Laden der Spotify-Daten.', true);
        } finally {
            setLoading(false);
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
        elements.achievements.grid.innerHTML = testAchievements.map(a => `
            <div class="stat-card">
                <span class="stat-value">${a.name}</span>
                <span class="stat-label">${a.description}</span>
            </div>`).join('');
    }
    function renderTitles() {
        elements.titles.list.innerHTML = testTitles.map(t => `
            <div class="stat-card">
                <span class="stat-value">${t.name}</span>
                <span class="stat-label">${t.achievement_id ? 'Freigeschaltet durch Erfolg' : 'Standard-Titel'}</span>
            </div>`).join('');
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

            // Alle Event Listeners...

            // Numpad für Custom Values
            document.querySelectorAll('[data-value="custom"]').forEach(btn => {
                const title = btn.dataset.type === 'song-count' ? 'Anzahl Songs' : btn.dataset.type === 'guess-time' ? 'Ratezeit (s)' : 'Anzahl Leben';
                btn.addEventListener('click', () => openCustomValueModal(btn.dataset.type, title));
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

            // Name ändern Modal
            elements.home.profileInfoBtn.addEventListener('click', () => {
                if(currentUser.isGuest) return;
                elements.changeNameModal.input.value = currentUser.username;
                elements.changeNameModal.overlay.classList.remove('hidden');
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

            // Auth
            elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
            elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
            elements.home.logoutBtn.addEventListener('click', handleLogout);
            elements.leaveGameButton.addEventListener('click', () => window.location.reload());
            elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
            elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
            
            // Guest Modal
            elements.guestModal.openBtn.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
            elements.guestModal.closeBtn.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
            elements.guestModal.submitBtn.addEventListener('click', () => {
                const name = document.getElementById('guest-nickname-input').value.trim();
                if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                elements.guestModal.overlay.classList.add('hidden');
                initializeApp({ id: 'guest-' + Date.now(), username: name }, true);
            });
            
            // Join Modal
            elements.home.joinRoomBtn.addEventListener('click', () => { pinInput = ""; updatePinDisplay(); elements.joinModal.overlay.classList.remove('hidden'); });
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
                updatePinDisplay();
                function updatePinDisplay() { elements.joinModal.pinDisplay.forEach((d, i) => d.textContent = pinInput[i] || ""); };
            });

            // Spiel erstellen Prozess
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

            // Home Screen Navigation
            elements.home.achievementsBtn.addEventListener('click', () => showScreen('achievements-screen'));
            elements.home.statsBtn.addEventListener('click', () => showScreen('stats-screen'));
            elements.home.profileTitleBtn.addEventListener('click', () => showScreen('title-selection-screen'));
            
            // Lobby Aktionen
            elements.lobby.refreshDevicesBtn.addEventListener('click', fetchHostData);
            ['device-select', 'playlist-select'].forEach(id => {
                document.getElementById(id).addEventListener('change', e => {
                    const key = id.includes('device') ? 'deviceId' : 'playlistId';
                    ws.socket.send(JSON.stringify({type: 'update-settings', payload: {[key]: e.target.value}}));
                });
            });
            [elements.lobby.songCountPresets, elements.lobby.guessTimePresets, elements.lobby.gameTypePresets].forEach(container => {
                container.addEventListener('click', e => {
                    const btn = e.target.closest('.preset-button');
                    if (!btn || btn.dataset.value === 'custom') return;
                    const key = container.id.includes('song') ? 'songCount' : container.id.includes('time') ? 'guessTime' : 'gameType';
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [key]: btn.dataset.value }}));
                });
            });
            elements.lobby.startGameBtn.addEventListener('click', () => {
                ws.socket.send(JSON.stringify({ type: 'start-game' }));
                setLoading(true);
            });

            // Supabase Auth State
            supabase.auth.onAuthStateChange(async (event, session) => {
                setLoading(true);
                if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
                    await initializeApp(session.user);
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
