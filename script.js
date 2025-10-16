document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let achievements = [], userTitles = [], currentGame = { pin: null, playerId: null };

    const DATA_KEYS = { FRIEND_ID: 'data-friend-id', REQUEST_ID: 'data-request-id', SENDER_ID: 'data-sender-id' };
    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), },
        home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelect: document.getElementById('device-select'), playlistSelect: document.getElementById('playlist-select'), startGameBtn: document.getElementById('start-game-button'), inviteFriendsBtn: document.getElementById('invite-friends-button'), refreshDevicesBtn: document.getElementById('refresh-devices-button'),
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), albumArt: document.getElementById('album-art'), guessArea: document.getElementById('game-guess-area'), submitBtn: document.getElementById('submit-guess-button'), },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), tabs: document.querySelectorAll('.tab-button'), tabContents: document.querySelectorAll('.tab-content'), friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'), requestsCount: document.getElementById('requests-count'), },
        inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list'), },
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')},
    };

    // --- HILFSFUNKTIONEN ---
    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => { elements.screens.forEach(s => s.classList.remove('active')); document.getElementById(screenId)?.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    
    // --- APP-INITIALISIERUNG & ZUSTAND ---
    const initializeApp = async (user, isGuest = false) => {
        sessionStorage.removeItem('fakesterGame');
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        document.body.classList.toggle('is-guest', isGuest);
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        if (!isGuest) { await checkSpotifyStatus(); }
        showScreen('home-screen');
        connectWebSocket();
    };

    const checkSpotifyStatus = async () => {
        try { const res = await fetch('/api/status'); const data = await res.json(); spotifyToken = data.loggedIn ? data.token : null; } catch { spotifyToken = null; }
        document.getElementById('spotify-connect-button').classList.toggle('hidden', !!spotifyToken);
        elements.home.createRoomBtn.classList.toggle('hidden', !spotifyToken);
    };

    // --- AUTH-LOGIK ---
    const handleAuthAction = async (action, form) => {
        setLoading(true);
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        try { const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } }); if (error) throw error; } 
        catch (error) { showToast(error.message, true); setLoading(false); }
    };
    const handleLogout = async () => { setLoading(true); if (currentUser?.isGuest) return window.location.reload(); await supabase.auth.signOut(); };

    // --- WEBSOCKET-LOGIK ---
    const connectWebSocket = () => { /* ... (WebSocket logic as provided before) ... */ };
    const handleWebSocketMessage = ({ type, payload }) => { /* ... (WebSocket message handling) ... */ };

    // --- MODAL- & BUTTON-LOGIK ---
    const handleNumpadInput = (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const key = target.dataset.key;
        const action = target.dataset.action;
        if (key && pinInput.length < 4) { pinInput += key; } 
        else if (action === 'clear') { pinInput = ""; } 
        else if (action === 'confirm' && pinInput.length === 4) {
            setLoading(true);
            ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
            elements.joinModal.overlay.classList.add('hidden');
        }
        updatePinDisplay();
    };
    const updatePinDisplay = () => { elements.joinModal.pinDisplay.forEach((d, i) => d.textContent = pinInput[i] || ""); };

    const setupFriendsModal = () => {
        elements.home.friendsBtn.addEventListener('click', () => {
            elements.friendsModal.overlay.classList.remove('hidden');
            // Hier könnte man die Freundesliste laden
        });
        elements.friendsModal.closeBtn.addEventListener('click', () => elements.friendsModal.overlay.classList.add('hidden'));
        // ... (restliche Friends-Modal-Logik)
    };
    
    // --- HAUPTFUNKTION (MAIN) ---
    const main = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

            // --- ALLE EVENT LISTENERS WERDEN HIER EINMALIG GESETZT ---
            elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
            elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
            elements.home.logoutBtn.addEventListener('click', handleLogout);
            elements.leaveGameButton.addEventListener('click', () => { showScreen('home-screen'); /* Hier ggf. disconnect vom Spiel senden */ });
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
            elements.home.joinRoomBtn.addEventListener('click', () => {
                pinInput = "";
                updatePinDisplay();
                elements.joinModal.overlay.classList.remove('hidden');
            });
            elements.joinModal.closeBtn.addEventListener('click', () => elements.joinModal.overlay.classList.add('hidden'));
            elements.joinModal.numpad.addEventListener('click', handleNumpadInput);
            document.querySelectorAll('.mode-box').forEach(box => {
                box.addEventListener('click', () => {
                    setLoading(true);
                    // Sicherstellen, dass WebSocket verbunden ist, bevor gesendet wird
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                        ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: box.dataset.mode } }));
                    } else {
                        showToast('Verbindung wird hergestellt, versuche es gleich erneut.', true);
                        connectWebSocket(); // Erneut versuchen zu verbinden
                    }
                });
            });
            elements.home.achievementsBtn.addEventListener('click', () => showScreen('achievements-screen'));
            elements.home.statsBtn.addEventListener('click', () => showScreen('stats-screen'));
            elements.home.profileTitleBtn.addEventListener('click', () => showScreen('title-selection-screen'));
            
            setupFriendsModal(); 

            // --- AUTHENTICATION LOGIC (FIXED) ---
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
