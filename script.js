document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "";
    let achievements = [], userTitles = [];

    const DATA_KEYS = {
        FRIEND_ID: 'data-friend-id',
        REQUEST_ID: 'data-request-id',
        SENDER_ID: 'data-sender-id'
    };

    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        auth: {
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            showRegister: document.getElementById('show-register-form'),
            showLogin: document.getElementById('show-login-form'),
        },
        home: {
            logoutBtn: document.getElementById('corner-logout-button'),
            achievementsBtn: document.getElementById('achievements-button'),
            createRoomBtn: document.getElementById('show-create-button-action'),
            joinRoomBtn: document.getElementById('show-join-button'),
            profileTitleBtn: document.querySelector('.profile-title-button'),
            friendsBtn: document.getElementById('friends-button'),
            statsBtn: document.getElementById('stats-button'),
        },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'),
            playerList: document.getElementById('player-list'),
            hostSettings: document.getElementById('host-settings'),
            guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelect: document.getElementById('device-select'),
            playlistSelect: document.getElementById('playlist-select'),
            songCountInput: document.getElementById('song-count-input'),
            guessTimeInput: document.getElementById('guess-time-input'),
            startGameBtn: document.getElementById('start-game-button'),
            inviteFriendsBtn: document.getElementById('invite-friends-button'),
        },
        game: {
            round: document.getElementById('current-round'),
            totalRounds: document.getElementById('total-rounds'),
            timerBar: document.getElementById('timer-bar'),
            albumArt: document.getElementById('album-art'),
            guessArea: document.getElementById('game-guess-area'),
            submitBtn: document.getElementById('submit-guess-button'),
        },
        guestModal: {
            overlay: document.getElementById('guest-modal-overlay'),
            closeBtn: document.getElementById('close-guest-modal-button'),
            submitBtn: document.getElementById('guest-nickname-submit'),
            openBtn: document.getElementById('guest-mode-button'),
        },
        joinModal: {
            overlay: document.getElementById('join-modal-overlay'),
            closeBtn: document.getElementById('close-join-modal-button'),
            pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'),
            numpad: document.querySelector('#numpad-join'),
        },
        friendsModal: {
            overlay: document.getElementById('friends-modal-overlay'),
            closeBtn: document.getElementById('close-friends-modal-button'),
            addFriendInput: document.getElementById('add-friend-input'),
            addFriendBtn: document.getElementById('add-friend-button'),
            tabs: document.querySelectorAll('.tab-button'),
            tabContents: document.querySelectorAll('.tab-content'),
            friendsList: document.getElementById('friends-list'),
            requestsList: document.getElementById('requests-list'),
            requestsCount: document.getElementById('requests-count'),
        }
    };

    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => {
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
        const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);

    const connectWebSocket = () => {
        if (ws.socket && ws.socket.readyState === WebSocket.OPEN) return;
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        ws.socket = new WebSocket(`${protocol}://${location.host}`);
        ws.socket.onopen = () => console.log("WebSocket verbunden.");
        ws.socket.onmessage = (event) => handleWebSocketMessage(JSON.parse(event.data));
        ws.socket.onclose = () => setTimeout(() => connectWebSocket(), 3000);
        ws.socket.onerror = (err) => console.error("WebSocket Fehler:", err);
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        setLoading(false);
        switch (type) {
            case 'game-created':
                showScreen('lobby-screen');
                // lobby-update wird die UI füllen
                break;
            case 'join-success':
                showScreen('lobby-screen');
                break;
            case 'lobby-update':
                updateLobbyUI(payload);
                break;
            case 'new-round':
                setupNewRound(payload);
                break;
            case 'error':
                showToast(payload.message, true);
                break;
        }
    };
    
    const setupNewRound = (payload) => {
        elements.game.round.textContent = payload.round;
        elements.game.totalRounds.textContent = payload.totalRounds;
        elements.game.timerBar.style.transition = 'none';
        elements.game.timerBar.style.width = '100%';
        setTimeout(() => {
            elements.game.timerBar.style.transition = `width ${payload.guessTime}s linear`;
            elements.game.timerBar.style.width = '0%';
        }, 100);

        const guessArea = elements.game.guessArea;
        guessArea.innerHTML = '';

        if (payload.gameMode === 'quiz') {
            guessArea.innerHTML = `
                <input type="text" id="guess-title" placeholder="Songtitel...">
                <input type="text" id="guess-artist" placeholder="Künstler...">
                <input type="number" id="guess-year" placeholder="Jahr...">
            `;
            elements.game.submitBtn.classList.remove('hidden');
        } else if (payload.gameMode === 'popularity') {
            guessArea.innerHTML = `
                <p>Ist der nächste Song populärer oder weniger populär?</p>
                <div class="popularity-buttons">
                    <button class="button-secondary" id="guess-higher">Höher</button>
                    <button class="button-secondary" id="guess-lower">Tiefer</button>
                </div>
            `;
            elements.game.submitBtn.classList.add('hidden');
        }
        showScreen('game-screen');
    };

    const updateLobbyUI = ({ pin, hostId, players, settings }) => {
        elements.lobby.pinDisplay.textContent = pin;
        elements.lobby.playerList.innerHTML = '';
        players.forEach(player => {
            const isHost = player.id === hostId;
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            playerCard.innerHTML = `<i class="fa-solid ${isHost ? 'fa-crown' : 'fa-user'} player-icon ${isHost ? 'host' : ''}"></i><span class="player-name">${player.nickname}</span>`;
            elements.lobby.playerList.appendChild(playerCard);
        });
        const isCurrentUserHost = currentUser.id === hostId;
        elements.lobby.hostSettings.classList.toggle('hidden', !isCurrentUserHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isCurrentUserHost);

        if (isCurrentUserHost && settings) {
            elements.lobby.songCountInput.value = settings.songCount;
            elements.lobby.guessTimeInput.value = settings.guessTime;
        }
    };
    
    const initializeApp = async (user, isGuest = false) => {
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        await checkSpotifyStatus();
        loadGameData();
        showScreen('home-screen');
        connectWebSocket();
    };
    
    const checkSpotifyStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            spotifyToken = data.loggedIn ? data.token : null;
        } catch { spotifyToken = null; }
        document.getElementById('spotify-connect-button').classList.toggle('hidden', !!spotifyToken);
        elements.home.createRoomBtn.classList.toggle('hidden', !spotifyToken);
    };

    const handleAuthAction = async (action, form) => {
        setLoading(true);
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        try {
            const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
            if (error) throw error;
        } catch (error) { showToast(error.message, true); } 
        finally { setLoading(false); }
    };

    const handleLogout = async () => {
        setLoading(true);
        if (currentUser?.isGuest) return window.location.reload();
        await supabase.auth.signOut();
    };
    
    const handleNumpadInput = (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const key = target.dataset.key;
        const action = target.dataset.action;
        if (key && pinInput.length < 4) { pinInput += key; } 
        else if (action === 'clear') { pinInput = ""; } 
        else if (action === 'confirm') {
            if (pinInput.length === 4) {
                setLoading(true);
                ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
                elements.joinModal.overlay.classList.add('hidden');
            } else { showToast('PIN muss 4-stellig sein.', true); }
        }
        updatePinDisplay();
    };

    const updatePinDisplay = () => {
        elements.joinModal.pinDisplay.forEach((digit, index) => {
            digit.textContent = pinInput[index] || "";
        });
    };

    const loadGameData = () => {
        achievements = [ { id: 'first_game', icon: 'fa-play', title: 'Erste Schritte', desc: 'Spiele dein erstes Spiel.', unlocked: true }, { id: 'first_win', icon: 'fa-trophy', title: 'Sieger', desc: 'Gewinne dein erstes Spiel.', unlocked: false }, ];
        userTitles = [ { id: 'newbie', title: 'Neuling', desc: 'Standard-Titel.', unlocked: true }, { id: 'maestro', title: 'Maestro', desc: 'Erreiche 50 Siege.', unlocked: false }, ];
        renderAchievements();
        renderTitles();
    };

    const renderAchievements = () => { document.getElementById('achievement-grid').innerHTML = achievements.map(ach => `<div class="achievement-card ${ach.unlocked ? '' : 'locked'}"><div class="achievement-icon"><i class="fa-solid ${ach.icon}"></i></div><h3>${ach.title}</h3><p>${ach.desc}</p></div>`).join(''); };
    const renderTitles = () => {
        const list = document.getElementById('title-list');
        list.innerHTML = '';
        userTitles.forEach(title => {
            const item = document.createElement('div');
            item.className = `title-item ${title.unlocked ? '' : 'locked'}`;
            if (title.unlocked) {
                 item.addEventListener('click', () => {
                    document.getElementById('profile-title').textContent = title.title;
                    list.querySelector('.active')?.classList.remove('active');
                    item.classList.add('active');
                    showToast('Titel geändert!');
                 });
            }
            item.innerHTML = `<h3>${title.title}</h3><p>${title.desc}</p>`;
            list.appendChild(item);
        });
    };

    const setupFriendsModal = () => {
        elements.home.friendsBtn.addEventListener('click', () => {
            elements.friendsModal.overlay.classList.remove('hidden');
            loadFriendsAndRequests();
        });
        elements.friendsModal.closeBtn.addEventListener('click', () => elements.friendsModal.overlay.classList.add('hidden'));
        elements.friendsModal.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                elements.friendsModal.tabs.forEach(t => t.classList.remove('active'));
                elements.friendsModal.tabContents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
            });
        });
        elements.friendsModal.addFriendBtn.addEventListener('click', sendFriendRequest);
    };

    const sendFriendRequest = async () => {
        const username = elements.friendsModal.addFriendInput.value.trim();
        if (username.length < 3) return showToast('Benutzername ist zu kurz.', true);
        if (username === currentUser.username) return showToast('Du kannst dich nicht selbst hinzufügen.', true);
        setLoading(true);
        try {
            const { data: targetUser, error: findError } = await supabase.from('profiles').select('id').eq('username', username).single();
            if (findError || !targetUser) throw new Error('Benutzer nicht gefunden.');
            const orFilter = `or(and(user_id1.eq.${currentUser.id},user_id2.eq.${targetUser.id}),and(user_id1.eq.${targetUser.id},user_id2.eq.${currentUser.id}))`;
            const { data: existingFriendship, error: friendCheckError } = await supabase.from('friends').select().or(orFilter);
            if (friendCheckError) throw friendCheckError;
            if (existingFriendship && existingFriendship.length > 0) throw new Error('Ihr seid bereits Freunde.');
            const { error: requestError } = await supabase.from('friend_requests').insert({ sender_id: currentUser.id, receiver_id: targetUser.id });
            if (requestError) throw new Error(requestError.code === '23505' ? 'Anfrage bereits gesendet.' : requestError.message);
            showToast(`Anfrage an ${username} gesendet!`);
            elements.friendsModal.addFriendInput.value = '';
        } catch (error) { showToast(error.message, true); } 
        finally { setLoading(false); }
    };
    
    const loadFriendsAndRequests = async () => {
        if (!currentUser || currentUser.isGuest) return;
        setLoading(true);
        try {
            const { data: requests, error: reqError } = await supabase.from('friend_requests').select('id, sender_id, profiles(username)').eq('receiver_id', currentUser.id).eq('status', 'pending');
            if (reqError) throw reqError;
            const { data: friends, error: friendsError } = await supabase.rpc('get_friends', { user_id_param: currentUser.id });
            if (friendsError) throw friendsError;
            renderFriendsList(friends || []);
            renderRequestsList(requests || []);
            updateFriendRequestsBadge((requests || []).length);
        } catch (error) { showToast('Fehler beim Laden: ' + error.message, true); } 
        finally { setLoading(false); }
    };
    
    const renderFriendsList = (friends) => { elements.friendsModal.friendsList.innerHTML = friends.length === 0 ? '<li>Du hast noch keine Freunde.</li>' : friends.map(f => `<li><span>${f.username}</span><button ${DATA_KEYS.FRIEND_ID}="${f.id}" class="button-icon-small remove-friend"><i class="fa-solid fa-trash"></i></button></li>`).join(''); };
    const renderRequestsList = (requests) => { elements.friendsModal.requestsList.innerHTML = requests.length === 0 ? '<li>Keine neuen Anfragen.</li>' : requests.map(r => `<li><span>${r.profiles.username}</span><div><button ${DATA_KEYS.REQUEST_ID}="${r.id}" ${DATA_KEYS.SENDER_ID}="${r.sender_id}" class="button-icon-small accept"><i class="fa-solid fa-check"></i></button><button ${DATA_KEYS.REQUEST_ID}="${r.id}" class="button-icon-small decline"><i class="fa-solid fa-times"></i></button></div></li>`).join('');};
    const updateFriendRequestsBadge = (count) => { const badge = elements.friendsModal.requestsCount; badge.textContent = count; badge.classList.toggle('hidden', count === 0); };
    
    elements.friendsModal.requestsList.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const requestId = button.getAttribute(DATA_KEYS.REQUEST_ID);
        const senderId = button.getAttribute(DATA_KEYS.SENDER_ID);
        setLoading(true);
        try {
            if (button.classList.contains('accept')) {
                await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);
                await supabase.from('friends').insert({ user_id1: senderId, user_id2: currentUser.id });
                showToast('Anfrage angenommen!');
            } else if (button.classList.contains('decline')) {
                await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', requestId);
                showToast('Anfrage abgelehnt.');
            }
            loadFriendsAndRequests();
        } catch (error) { showToast('Fehler: ' + error.message, true); } 
        finally { setLoading(false); }
    });

    // NEUE EVENT LISTENERS FÜR LOBBY EINSTELLUNGEN
    const sendSettingsUpdate = () => {
        const settings = {
            deviceId: elements.lobby.deviceSelect.value,
            playlistId: elements.lobby.playlistSelect.value,
            songCount: parseInt(elements.lobby.songCountInput.value),
            guessTime: parseInt(elements.lobby.guessTimeInput.value)
        };
        ws.socket.send(JSON.stringify({ type: 'update-settings', payload: settings }));
    };

    const main = async () => {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

            elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
            elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
            elements.home.logoutBtn.addEventListener('click', handleLogout);
            elements.leaveGameButton.addEventListener('click', () => showScreen('home-screen'));
            elements.home.achievementsBtn.addEventListener('click', () => showScreen('achievements-screen'));
            elements.home.statsBtn.addEventListener('click', () => showScreen('stats-screen'));
            elements.home.profileTitleBtn.addEventListener('click', () => showScreen('title-selection-screen'));
            elements.guestModal.openBtn.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
            elements.guestModal.closeBtn.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
            elements.guestModal.submitBtn.addEventListener('click', () => {
                const name = document.getElementById('guest-nickname-input').value.trim();
                if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                elements.guestModal.overlay.classList.add('hidden');
                initializeApp({ id: 'guest-' + Date.now(), username: name }, true);
            });
            
            // GEÄNDERTER SPIELFLUSS
            elements.home.createRoomBtn.addEventListener('click', () => showScreen('mode-selection-screen'));
            document.querySelectorAll('.mode-box').forEach(box => {
                box.addEventListener('click', () => {
                    setLoading(true);
                    ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: box.dataset.mode } }));
                });
            });
            
            elements.home.joinRoomBtn.addEventListener('click', () => { pinInput = ""; updatePinDisplay(); elements.joinModal.overlay.classList.remove('hidden'); });
            elements.joinModal.closeBtn.addEventListener('click', () => elements.joinModal.overlay.classList.add('hidden'));
            elements.joinModal.numpad.addEventListener('click', handleNumpadInput);
            
            // LOBBY-EINSTELLUNGEN LISTENERS
            elements.lobby.deviceSelect.addEventListener('change', sendSettingsUpdate);
            elements.lobby.playlistSelect.addEventListener('change', sendSettingsUpdate);
            elements.lobby.songCountInput.addEventListener('change', sendSettingsUpdate);
            elements.lobby.guessTimeInput.addEventListener('change', sendSettingsUpdate);
            elements.lobby.startGameBtn.addEventListener('click', () => {
                setLoading(true);
                ws.socket.send(JSON.stringify({ type: 'start-game' }));
            });
            
            setupFriendsModal();

            supabase.auth.onAuthStateChange(async (event, session) => {
                setLoading(true);
                if (event === 'SIGNED_IN' && session) { await initializeApp(session.user); } 
                else if (event === 'SIGNED_OUT') { window.location.reload(); }
                setLoading(false);
            });

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                showScreen('auth-screen');
                setLoading(false);
            }
        } catch (error) {
            setLoading(false);
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p></div>`;
        }
    };

    main();
});
