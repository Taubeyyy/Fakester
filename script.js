document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen ---
    let ws = { socket: null }, currentUser = null, spotifyToken = null, supabase;

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
            createBtn: document.getElementById('show-create-button-action'),
            joinBtn: document.getElementById('show-join-button'),
            logoutBtn: document.getElementById('corner-logout-button'),
            achievementsBtn: document.getElementById('achievements-button'),
        },
        lobby: {
            deviceSelect: document.getElementById('device-select'),
            playlistSelect: document.getElementById('playlist-select'),
            refreshDevicesBtn: document.getElementById('refresh-devices-button'),
        },
        helpIcons: document.querySelectorAll('.help-icon')
    };
    
    // --- Hilfsfunktionen ---
    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "#e52d27" : "#00b09b", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => {
        elements.screens.forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
        const showLeaveButton = ['lobby-screen', 'mode-selection-screen', 'achievements-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    
    // --- App-Logik ---
    const initializeApp = async (user, isGuest = false) => {
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        // ... weitere UI-Updates
        await checkSpotifyStatus();
        showScreen('home-screen');
    };
    
    const checkSpotifyStatus = async () => {
        try {
            const res = await fetch('/api/status');
            if (!res.ok) throw new Error();
            const data = await res.json();
            spotifyToken = data.loggedIn ? data.token : null;
        } catch { spotifyToken = null; }
        document.getElementById('show-create-button-login').classList.toggle('hidden', !!spotifyToken);
        document.getElementById('show-create-button-action').classList.toggle('hidden', !spotifyToken);
    };

    const loadSpotifyData = async (endpoint, selectElement, specialOptions = []) => {
        try {
            if (!spotifyToken) return showToast("Spotify-Token fehlt.", true);
            const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!res.ok) throw new Error(`API-Anfrage an ${endpoint} fehlgeschlagen: ${res.statusText}`);
            const data = await res.json();
            const items = data.devices || data.items;
            let html = specialOptions.map(opt => `<option value="${opt.value}">${opt.name}</option>`).join('');
            if (items && items.length > 0) {
                html += items.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
            }
            selectElement.innerHTML = html || `<option value="">Nichts gefunden</option>`;
        } catch(err) {
            console.error(err);
            selectElement.innerHTML = `<option value="">Fehler beim Laden</option>`;
            showToast("Daten konnten nicht geladen werden. Ist Spotify aktiv?", true);
        }
    };
    const loadSpotifyDevices = () => loadSpotifyData('/api/devices', elements.lobby.deviceSelect);
    const loadSpotifyPlaylists = () => loadSpotifyData('/api/playlists', elements.lobby.playlistSelect, [{ value: 'liked-songs', name: '❤️ Geliked Songs' }]);

    // --- Auth-Logik ---
    const handleAuthAction = async (action, form) => {
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        setLoading(true);
        try {
            const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
            if (error) throw error;
            // Der AuthListener übernimmt die Weiterleitung.
        } catch (error) {
            setLoading(false);
            showToast(error.message, true);
        }
    };
    const handleLogout = async () => {
        setLoading(true);
        if (currentUser?.isGuest) return window.location.reload();
        await supabase.auth.signOut();
    };
    
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
        elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword, e.currentTarget); });
        elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp, e.currentTarget); });
        elements.home.logoutBtn.addEventListener('click', handleLogout);
        elements.leaveGameButton.addEventListener('click', () => showScreen('home-screen'));
        elements.home.achievementsBtn.addEventListener('click', () => showScreen('achievements-screen'));

        // ... (andere Listener bleiben gleich, hier nur die wichtigsten)
        document.getElementById('guest-mode-button').addEventListener('click', () => {
             document.getElementById('guest-modal-overlay').classList.remove('hidden');
        });
        document.getElementById('close-guest-modal-button').addEventListener('click', () => {
             document.getElementById('guest-modal-overlay').classList.add('hidden');
        });
        document.getElementById('guest-nickname-submit').addEventListener('click', () => {
            const name = document.getElementById('guest-nickname-input').value.trim();
            if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
            document.getElementById('guest-modal-overlay').classList.add('hidden');
            initializeApp( { id: 'guest-' + Date.now(), username: name }, true);
        });
        
        elements.lobby.refreshDevicesBtn.addEventListener('click', loadSpotifyDevices);
        elements.helpIcons.forEach(icon => icon.onclick = () => showHelp(icon.dataset.help));
    };

    // --- MAIN APP ---
    const main = async () => {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            
            // ### DIE ENTSCHEIDENDE KORREKTUR ###
            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            initializeEventListeners();
            setupAuthListener();
            // connectWebSocket(); // Wird aufgerufen, wenn ein Spiel erstellt/beitreten wird

            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await initializeApp(session.user);
            } else {
                showScreen('auth-screen');
            }
        } catch (error) {
            console.error(error);
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p></div>`;
        } finally {
            setLoading(false);
        }
    };
    main();
});
