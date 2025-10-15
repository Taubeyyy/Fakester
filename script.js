document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen ---
    let ws = { socket: null }, currentUser = null, spotifyToken = null, supabase;
    let gameSettings = { songCount: 10, guessTime: 30 };

    // --- DOM Elemente ---
    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        auth: {
            screen: document.getElementById('auth-screen'),
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            showRegister: document.getElementById('show-register-form'),
            showLogin: document.getElementById('show-login-form'),
        },
        home: {
            screen: document.getElementById('home-screen'),
            nickname: document.getElementById('welcome-nickname'),
            stats: document.querySelector('.player-stats'),
            gamesPlayed: document.getElementById('stat-games-played'),
            highscore: document.getElementById('stat-highscore'),
            loginSpotifyBtn: document.getElementById('show-create-button-login'),
            createBtn: document.getElementById('show-create-button-action'),
            joinBtn: document.getElementById('show-join-button'),
            logoutBtn: document.getElementById('corner-logout-button')
        },
        guestModal: {
            overlay: document.getElementById('guest-modal-overlay'),
            closeBtn: document.getElementById('close-guest-modal-button'),
            submitBtn: document.getElementById('guest-nickname-submit'),
            input: document.getElementById('guest-nickname-input'),
            openBtn: document.getElementById('guest-mode-button')
        },
        // ... (weitere Elemente bleiben gleich)
    };
    
    // --- Hilfsfunktionen ---
    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "#e52d27" : "#00b09b", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => {
        elements.screens.forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
        elements.leaveGameButton.classList.toggle('hidden', !['lobby-screen', 'mode-selection-screen'].includes(screenId));
    };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    
    // --- App-Logik ---
    const initializeApp = async (user, isGuest = false) => {
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        elements.home.nickname.textContent = currentUser.username;
        elements.home.stats.classList.toggle('guest', isGuest);
        if (!isGuest) await updateHomeScreenStats();
        await checkSpotifyStatus();
        showScreen('home-screen');
    };
    const initializeAppAsGuest = (nickname) => initializeApp({ id: 'guest-' + Date.now(), username: nickname }, true);
    const updateHomeScreenStats = async () => { /* ... bleibt unverändert ... */ };
    const checkSpotifyStatus = async () => { /* ... bleibt unverändert ... */ };
    const updateLobby = ({ pin, players, hostId }) => { /* ... bleibt unverändert ... */ };
    const loadSpotifyData = async (endpoint, selectElement) => { /* ... bleibt unverändert ... */ };
    const loadSpotifyDevices = () => loadSpotifyData('/api/devices', elements.lobby.deviceSelect);
    const loadSpotifyPlaylists = () => loadSpotifyData('/api/playlists', elements.lobby.playlistSelect);

    // --- Auth-Logik (KORRIGIERT) ---
    const handleAuthAction = async (action, form) => {
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        setLoading(true);
        try {
            const { data, error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
            if (error) throw error;
            if (data.user) await initializeApp(data.user);
        } catch (error) {
            showToast(error.message, true);
        } finally {
            setLoading(false); // Wird jetzt immer ausgeführt
        }
    };
    const handleLogout = async () => currentUser?.isGuest ? window.location.reload() : await supabase.auth.signOut();
    const setupAuthListener = () => supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) initializeApp(session.user);
        else if (event === 'SIGNED_OUT') window.location.reload();
    });

    // --- Numpad & Modal Logik ---
    // ... bleibt unverändert ...

    // --- Event Listeners (KORRIGIERT) ---
    const initializeEventListeners = () => {
        elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword, e.currentTarget); });
        elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp, e.currentTarget); });
        elements.home.logoutBtn.addEventListener('click', handleLogout);
        elements.leaveGameButton.addEventListener('click', () => showScreen('home-screen'));

        elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
        elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
        
        // Listener für Gast-Modal
        elements.guestModal.openBtn.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
        elements.guestModal.closeBtn.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.guestModal.submitBtn.addEventListener('click', () => {
            const name = elements.guestModal.input.value.trim();
            if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
            elements.guestModal.overlay.classList.add('hidden');
            initializeAppAsGuest(name);
        });
        
        // ... (Restliche Listener bleiben unverändert)
    };

    // --- MAIN APP (KORRIGIERT) ---
    const main = async () => {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            initializeEventListeners();
            setupAuthListener();
            connectWebSocket();

            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await initializeApp(session.user);
            } else {
                showScreen('auth-screen');
            }
        } catch (error) {
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p></div>`;
        } finally {
            setLoading(false); // Wird jetzt immer ausgeführt
        }
    };
    main();
});
