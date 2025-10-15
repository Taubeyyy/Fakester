document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen ---
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };

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
        },
        lobby: {
            deviceSelect: document.getElementById('device-select'),
            playlistSelect: document.getElementById('playlist-select'),
            refreshDevicesBtn: document.getElementById('refresh-devices-button'),
        },
    };

    // --- Hilfsfunktionen ---
    const showToast = (message, isError = false) => {
        Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "#e52d27" : "#00b09b", borderRadius: "8px" } }).showToast();
    };

    const showScreen = (screenId) => {
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
        const showLeaveButton = ['lobby-screen', 'achievements-screen', 'mode-selection-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };

    const setLoading = (isLoading) => {
        elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    };

    // --- WebSocket Logik ---
    const connectWebSocket = () => { /* ... unverändert ... */ };
    const handleWebSocketMessage = ({ type, payload }) => { /* ... unverändert ... */ };
    const updateLobby = ({ pin, players, hostId }) => { /* ... unverändert ... */ };

    // --- App-Logik ---
    const initializeApp = async (user, isGuest = false) => {
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        await checkSpotifyStatus();
        showScreen('home-screen');
        connectWebSocket();
    };

    const checkSpotifyStatus = async () => { /* ... unverändert ... */ };
    const loadSpotifyData = async (endpoint, selectElement) => { /* ... unverändert ... */ };
    const loadSpotifyDevices = () => loadSpotifyData('/api/devices', elements.lobby.deviceSelect);
    const loadSpotifyPlaylists = () => loadSpotifyData('/api/playlists', elements.lobby.playlistSelect, [{ value: 'liked-songs', name: '❤️ Geliked Songs' }]);

    // --- Auth-Logik (KORRIGIERT) ---
    const handleAuthAction = async (action, form) => {
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        setLoading(true);
        try {
            const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
            if (error) throw error;
        } catch (error) {
            setLoading(false);
            showToast(error.message, true);
        }
    };

    const handleLogout = async () => { /* ... unverändert ... */ };
    
    const setupAuthListener = () => {
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                await initializeApp(session.user);
            } else if (event === 'SIGNED_OUT') {
                window.location.reload();
            }
            setLoading(false);
        });
    };

    // --- Event Listeners ---
    const initializeEventListeners = () => {
        elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
        elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
        elements.home.logoutBtn.addEventListener('click', handleLogout);
        elements.leaveGameButton.addEventListener('click', () => showScreen('home-screen'));
        elements.home.achievementsBtn.addEventListener('click', () => showScreen('achievements-screen'));

        elements.home.profileTitleBtn.addEventListener('click', () => {
            showToast('Funktion zum Ändern des Titels kommt bald!');
        });

        elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
        elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });

        document.getElementById('guest-mode-button').addEventListener('click', () => document.getElementById('guest-modal-overlay').classList.remove('hidden'));
        document.getElementById('close-guest-modal-button').addEventListener('click', () => document.getElementById('guest-modal-overlay').classList.add('hidden'));
        document.getElementById('guest-nickname-submit').addEventListener('click', () => {
            const name = document.getElementById('guest-nickname-input').value.trim();
            if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
            document.getElementById('guest-modal-overlay').classList.add('hidden');
            initializeApp({ id: 'guest-' + Date.now(), username: name }, true);
        });
        
        elements.home.createRoomBtn.addEventListener('click', () => showScreen('mode-selection-screen'));
        
        document.querySelectorAll('.mode-box').forEach(box => {
            box.addEventListener('click', () => {
                setLoading(true);
                ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: box.dataset.mode } }));
            });
        });

        elements.home.joinRoomBtn.addEventListener('click', () => document.getElementById('join-modal-overlay').classList.remove('hidden'));
        
        elements.lobby.refreshDevicesBtn.addEventListener('click', loadSpotifyDevices);
    };

    // --- MAIN APP ---
    const main = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            const config = await response.json();

            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

            initializeEventListeners();
            setupAuthListener();

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                showScreen('auth-screen');
                setLoading(false);
            }
        } catch (error) {
            setLoading(false);
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>Ein kritischer Fehler ist aufgetreten: ${error.message}</p></div>`;
        }
    };

    main();
});
