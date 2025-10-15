document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen ---
    const ws = { socket: null };
    let currentUser = null;
    let spotifyToken = null;
    let supabase;

    // --- DOM Elemente ---
    const elements = {
        screens: document.querySelectorAll('.screen'),
        authScreen: document.getElementById('auth-screen'),
        loginForm: document.getElementById('login-form'),
        loginButton: document.querySelector('#login-form button'),
        registerForm: document.getElementById('register-form'),
        registerButton: document.querySelector('#register-form button'),
        showRegisterForm: document.getElementById('show-register-form'),
        showLoginForm: document.getElementById('show-login-form'),
        logoutButton: document.getElementById('logout-button'),
        guestModeButton: document.getElementById('guest-mode-button'),
        homeScreen: document.getElementById('home-screen'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        showCreateButtonAction: document.getElementById('show-create-button-action'),
        showCreateButtonLogin: document.getElementById('show-create-button-login'),
        playerStats: document.querySelector('.player-stats'),
        statGamesPlayed: document.getElementById('stat-games-played'),
        statHighscore: document.getElementById('stat-highscore'),
        guestModal: {
            overlay: document.getElementById('guest-modal-overlay'),
            closeButton: document.getElementById('close-guest-modal-button'),
            submitButton: document.getElementById('guest-nickname-submit')
        },
    };
    
    // --- Hilfsfunktionen ---
    function showToast(message, isError = false) {
        Toastify({ text: message, duration: 3500, gravity: "top", position: "center", style: { background: isError ? "#e52d27" : "#00b09b", borderRadius: "8px" } }).showToast();
    }

    function showScreen(screenId) {
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
    }
    
    // ⭐ VERBESSERUNG: Ladezustand für Buttons
    function setLoading(button, isLoading) {
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        } else {
            button.disabled = false;
            // Setzt den ursprünglichen Text wieder ein
            if (button.parentElement.id === 'login-form') button.textContent = 'Anmelden';
            if (button.parentElement.id === 'register-form') button.textContent = 'Konto erstellen';
        }
    }

    // --- App-Initialisierung ---
    async function initializeApp(user) {
        currentUser = {
            id: user.id,
            username: user.user_metadata.username,
            isGuest: false
        };
        elements.welcomeNickname.textContent = currentUser.username;
        elements.playerStats.classList.remove('guest');
        await updateHomeScreenStats();
        await checkSpotifyStatus();
        showScreen('home-screen');
    }

    function initializeAppAsGuest(nickname) {
        currentUser = { id: 'guest-' + Date.now(), username: nickname, isGuest: true };
        elements.welcomeNickname.textContent = `${nickname} (Gast)`;
        elements.playerStats.classList.add('guest');
        checkSpotifyStatus();
        showScreen('home-screen');
    }

    async function updateHomeScreenStats() {
        if (!currentUser || currentUser.isGuest) return;
        const { data } = await supabase.from('profiles').select('games_played, highscore').eq('id', currentUser.id).single();
        if (data) {
            elements.statGamesPlayed.textContent = data.games_played || 0;
            elements.statHighscore.textContent = data.highscore || 0;
        }
    }

    async function checkSpotifyStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            if (data.loggedIn) {
                spotifyToken = data.token;
                elements.showCreateButtonLogin.classList.add('hidden');
                elements.showCreateButtonAction.classList.remove('hidden');
            }
        } catch (error) {
            spotifyToken = null;
            elements.showCreateButtonLogin.classList.remove('hidden');
            elements.showCreateButtonAction.classList.add('hidden');
        } finally {
            elements.logoutButton.classList.remove('hidden');
        }
    }

    // --- AUTH-LOGIK ---
    async function handleLogin(e) {
        e.preventDefault();
        setLoading(elements.loginButton, true);
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        const { data, error } = await supabase.auth.signInWithPassword({ email: `${username}@fakester.app`, password });

        setLoading(elements.loginButton, false);
        if (error) {
            showToast("Benutzername oder Passwort ist falsch.", true);
        } else if (data.user) {
            initializeApp(data.user);
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        setLoading(elements.registerButton, true);
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        if (!username || password.length < 6) {
            setLoading(elements.registerButton, false);
            return showToast("Passwort muss mind. 6 Zeichen haben.", true);
        }

        const { error } = await supabase.auth.signUp({ email: `${username}@fakester.app`, password, options: { data: { username } } });
        
        setLoading(elements.registerButton, false);
        if (error) {
            return showToast(`Fehler: ${error.message}`, true);
        }
        showToast('Konto erfolgreich erstellt!');
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        window.location.reload();
    }

    function handleGuestLogin() {
        const guestNickname = document.getElementById('guest-nickname-input').value.trim();
        if (guestNickname.length < 3) return showToast('Dein Gast-Name muss mind. 3 Zeichen haben.', true);
        elements.guestModal.overlay.classList.add('hidden');
        initializeAppAsGuest(guestNickname);
    }
    
    function setupAuthListener() {
        supabase.auth.onAuthStateChange((event, session) => {
            // Dieser Listener fängt jetzt nur noch das Ausloggen ab
            if (event === 'SIGNED_OUT') {
                currentUser = null;
                showScreen('auth-screen');
            }
        });
    }

    // --- Event Listeners ---
    function initializeEventListeners() {
        elements.loginForm.addEventListener('submit', handleLogin);
        elements.registerForm.addEventListener('submit', handleRegister);
        elements.logoutButton.addEventListener('click', handleLogout);
        elements.guestModeButton.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
        elements.guestModal.submitButton.addEventListener('click', handleGuestLogin);
        elements.guestModal.closeButton.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.showRegisterForm.addEventListener('click', (e) => { e.preventDefault(); elements.loginForm.classList.add('hidden'); elements.registerForm.classList.remove('hidden'); });
        elements.showLoginForm.addEventListener('click', (e) => { e.preventDefault(); elements.registerForm.classList.add('hidden'); elements.loginForm.classList.remove('hidden'); });
    }

    // --- MAIN APP ---
    async function main() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            initializeEventListeners();
            setupAuthListener();

            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                initializeApp(session.user);
            } else {
                showScreen('auth-screen');
            }
        } catch (error) {
            console.error("Kritischer Fehler:", error);
            document.body.innerHTML = `<div style="color: white; padding: 40px; text-align: center;"><h1>Fehler beim Laden der App</h1><p style="font-family: monospace; color: #FF4500;">${error.message}</p></div>`;
        }
    }
    
    main();
});
