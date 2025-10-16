document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen & Konstanten ---
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "";
    let achievements = [], userTitles = [];

    const DATA_KEYS = {
        FRIEND_ID: 'data-friend-id',
        REQUEST_ID: 'data-request-id',
        SENDER_ID: 'data-sender-id'
    };

    // --- DOM Elemente ---
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
        },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'),
            playerList: document.getElementById('player-list'),
            hostSettings: document.getElementById('host-settings'),
            guestWaitingMessage: document.getElementById('guest-waiting-message'),
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

    // --- Hilfsfunktionen ---
    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => {
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
        const showLeaveButton = ['lobby-screen', 'achievements-screen', 'mode-selection-screen', 'title-selection-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);

    // --- WebSocket Logik ---
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
            case 'join-success':
                showScreen('lobby-screen');
                break;
            case 'lobby-update':
                updateLobbyUI(payload);
                break;
            case 'error':
                showToast(payload.message, true);
                break;
            case 'friend-request-received':
                showToast(`Neue Freundschaftsanfrage von ${payload.sender_username}!`);
                updateFriendRequestsBadge();
                break;
            case 'friend-request-accepted':
                showToast(`${payload.username} hat deine Anfrage angenommen.`);
                break;
        }
    };

    // --- Lobby-Logik ---
    const updateLobbyUI = ({ pin, hostId, players }) => {
        elements.lobby.pinDisplay.textContent = pin;
        elements.lobby.playerList.innerHTML = '';

        players.forEach(player => {
            const isHost = player.id === hostId;
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            playerCard.innerHTML = `
                <i class="fa-solid ${isHost ? 'fa-crown' : 'fa-user'} player-icon ${isHost ? 'host' : ''}"></i>
                <span class="player-name">${player.nickname}</span>
            `;
            elements.lobby.playerList.appendChild(playerCard);
        });

        const isCurrentUserHost = currentUser.id === hostId;
        elements.lobby.hostSettings.classList.toggle('hidden', !isCurrentUserHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isCurrentUserHost);
    };
    
    // --- App-Logik ---
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

    // --- Auth Logik ---
    const handleAuthAction = async (action, form) => {
        setLoading(true);
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        try {
            const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
            if (error) throw error;
        } catch (error) {
            showToast(error.message, true);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        setLoading(true);
        if (currentUser?.isGuest) return window.location.reload();
        await supabase.auth.signOut();
    };
    
    // --- Numpad Logik ---
    const handleNumpadInput = (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const key = target.dataset.key;
        const action = target.dataset.action;

        if (key && pinInput.length < 4) {
            pinInput += key;
        } else if (action === 'clear') {
            pinInput = "";
        } else if (action === 'confirm') {
            if (pinInput.length === 4) {
                setLoading(true);
                ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
                elements.joinModal.overlay.classList.add('hidden');
            } else {
                showToast('PIN muss 4-stellig sein.', true);
            }
        }
        updatePinDisplay();
    };

    const updatePinDisplay = () => {
        elements.joinModal.pinDisplay.forEach((digit, index) => {
            digit.textContent = pinInput[index] || "";
        });
    };

    // --- Erfolge & Titel Logik ---
    const loadGameData = () => {
        achievements = [
            { id: 'first_game', icon: 'fa-play', title: 'Erste Schritte', desc: 'Spiele dein erstes Spiel.', unlocked: true },
            { id: 'first_win', icon: 'fa-trophy', title: 'Sieger', desc: 'Gewinne dein erstes Spiel.', unlocked: false },
            { id: 'correct_streak', icon: 'fa-fire', title: 'Heiß gelaufen', desc: 'Beantworte 5 Fragen in Folge richtig.', unlocked: false },
            { id: 'social', icon: 'fa-users', title: 'Gesellig', desc: 'Spiele in einer Lobby mit 4+ Spielern.', unlocked: false },
        ];

        userTitles = [
            { id: 'newbie', title: 'Neuling', desc: 'Standard-Titel für alle neuen Spieler.', unlocked: true },
            { id: 'maestro', title: 'Maestro', desc: 'Erreiche 50 Siege.', unlocked: false },
        ];

        renderAchievements();
        renderTitles();
    };

    const renderAchievements = () => {
        const grid = document.getElementById('achievement-grid');
        grid.innerHTML = '';
        achievements.forEach(ach => {
            const card = document.createElement('div');
            card.className = `achievement-card ${ach.unlocked ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="achievement-icon"><i class="fa-solid ${ach.icon}"></i></div>
                <h3>${ach.title}</h3>
                <p>${ach.desc}</p>
            `;
            grid.appendChild(card);
        });
    };

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
            item.innerHTML = `
                <h3>${title.title}</h3>
                <p>${title.desc}</p>
            `;
            list.appendChild(item);
        });
    };

    // --- Freunde System Logik ---
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
            const { data: targetUser, error: findError } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', username)
                .single();

            if (findError || !targetUser) throw new Error('Benutzer nicht gefunden.');
            
            const { data: existingFriendship, error: friendCheckError } = await supabase
                .from('friends')
                .select()
                .or(`(user_id1.eq.${currentUser.id},user_id2.eq.${targetUser.id}),(user_id1.eq.${targetUser.id},user_id2.eq.${currentUser.id})`);
            if(friendCheckError) throw friendCheckError;
            if(existingFriendship.length > 0) {
                showToast('Ihr seid bereits Freunde.', true);
                return;
            }

            const { error: requestError } = await supabase
                .from('friend_requests')
                .insert({ sender_id: currentUser.id, receiver_id: targetUser.id });

            if (requestError) {
                if (requestError.code === '23505') {
                    throw new Error('Anfrage bereits gesendet oder erhalten.');
                }
                throw requestError;
            }
            showToast(`Anfrage an ${username} gesendet!`);
            elements.friendsModal.addFriendInput.value = '';

        } catch (error) {
            showToast(error.message, true);
        } finally {
            setLoading(false);
        }
    };
    
    const loadFriendsAndRequests = async () => {
        if (!currentUser || currentUser.isGuest) return;
        setLoading(true);
        try {
            const { data: requests, error: reqError } = await supabase
                .from('friend_requests')
                .select('id, sender_id, profiles(username)')
                .eq('receiver_id', currentUser.id)
                .eq('status', 'pending');

            if (reqError) throw reqError;

            const { data: friends, error: friendsError } = await supabase
                .rpc('get_friends', { user_id_param: currentUser.id });
                
            if (friendsError) throw friendsError;
            
            renderFriendsList(friends || []);
            renderRequestsList(requests || []);
            updateFriendRequestsBadge((requests || []).length);

        } catch (error) {
            showToast('Fehler beim Laden der Freundesliste: ' + error.message, true);
        } finally {
            setLoading(false);
        }
    };
    
    const renderFriendsList = (friends) => {
        const friendsListEl = elements.friendsModal.friendsList;
        if (friends.length === 0) {
            friendsListEl.innerHTML = '<li>Du hast noch keine Freunde.</li>';
            return;
        }
        friendsListEl.innerHTML = friends.map(friend => `
            <li>
                <span>${friend.username}</span>
                <button ${DATA_KEYS.FRIEND_ID}="${friend.id}" class="button-icon-small remove-friend">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </li>
        `).join('');
    };

    const renderRequestsList = (requests) => {
        const requestsListEl = elements.friendsModal.requestsList;
        if (requests.length === 0) {
            requestsListEl.innerHTML = '<li>Keine neuen Anfragen.</li>';
            return;
        }
        requestsListEl.innerHTML = requests.map(request => `
            <li>
                <span>${request.profiles.username}</span>
                <div>
                    <button ${DATA_KEYS.REQUEST_ID}="${request.id}" ${DATA_KEYS.SENDER_ID}="${request.sender_id}" class="button-icon-small accept">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button ${DATA_KEYS.REQUEST_ID}="${request.id}" class="button-icon-small decline">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            </li>
        `).join('');
    };

    const updateFriendRequestsBadge = (count) => {
        const requestsCountEl = elements.friendsModal.requestsCount;
        if (count > 0) {
            requestsCountEl.textContent = count;
            requestsCountEl.classList.remove('hidden');
        } else {
            requestsCountEl.classList.add('hidden');
        }
    };
    
    elements.friendsModal.requestsList.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const requestId = button.getAttribute(DATA_KEYS.REQUEST_ID);
        const senderId = button.getAttribute(DATA_KEYS.SENDER_ID);

        setLoading(true);
        try {
            if (button.classList.contains('accept')) {
                const { error: updateError } = await supabase
                    .from('friend_requests')
                    .update({ status: 'accepted' })
                    .eq('id', requestId);
                if (updateError) throw updateError;
                
                const { error: insertError } = await supabase
                    .from('friends')
                    .insert({ user_id1: senderId, user_id2: currentUser.id });
                if (insertError) throw insertError;

                showToast('Freundschaftsanfrage angenommen!');

            } else if (button.classList.contains('decline')) {
                 const { error: declineError } = await supabase
                    .from('friend_requests')
                    .update({ status: 'declined' })
                    .eq('id', requestId);
                if (declineError) throw declineError;
                showToast('Anfrage abgelehnt.');
            }
            
            loadFriendsAndRequests();

        } catch (error) {
            showToast('Fehler: ' + error.message, true);
        } finally {
            setLoading(false);
        }
    });

    // --- MAIN APP START ---
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
            elements.home.profileTitleBtn.addEventListener('click', () => showScreen('title-selection-screen'));
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
            
            elements.home.createRoomBtn.addEventListener('click', () => showScreen('mode-selection-screen'));
            document.querySelectorAll('.mode-box').forEach(box => {
                box.addEventListener('click', () => {
                    setLoading(true);
                    ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: box.dataset.mode } }));
                });
            });
            
            elements.home.joinRoomBtn.addEventListener('click', () => {
                pinInput = "";
                updatePinDisplay();
                elements.joinModal.overlay.classList.remove('hidden');
            });
            elements.joinModal.closeBtn.addEventListener('click', () => elements.joinModal.overlay.classList.add('hidden'));
            elements.joinModal.numpad.addEventListener('click', handleNumpadInput);
            
            setupFriendsModal();

            supabase.auth.onAuthStateChange(async (event, session) => {
                setLoading(true);
                if (event === 'SIGNED_IN' && session) {
                    await initializeApp(session.user);
                } else if (event === 'SIGNED_OUT') {
                    window.location.reload();
                }
                setLoading(false);
            });

            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                // Already handled by onAuthStateChange
            } else {
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
