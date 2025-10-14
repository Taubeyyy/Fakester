document.addEventListener('DOMContentLoaded', () => {
    let supabase;

    async function main() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('Supabase-Schlüssel sind leer. Prüfe die Umgebungsvariablen in Render.');
            }

            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

            initializeEventListeners();
            setupAuthListener();

        } catch (error) {
            console.error("Kritischer Fehler bei der Initialisierung:", error);
            document.body.innerHTML = `<div style="color: white; text-align: center; padding: 40px;"><h1>Fehler beim Laden der App</h1><p style="color: #B3B3B3;">Es gab ein Problem bei der Verbindung zum Server.</p><p style="color: #FF4500; font-family: monospace; margin-top: 20px;">Details: ${error.message}</p></div>`;
        }
    }

    // --- Globale Variablen ---
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false, spotifyToken = null, currentUser = null;

    // --- DOM Elemente (VOLLSTÄNDIG) ---
    const elements = {
        screens: document.querySelectorAll('.screen'),
        authScreen: document.getElementById('auth-screen'),
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        showRegisterForm: document.getElementById('show-register-form'),
        showLoginForm: document.getElementById('show-login-form'),
        logoutButton: document.getElementById('logout-button'),
        guestModeButton: document.getElementById('guest-mode-button'),
        guestModalOverlay: document.getElementById('guest-modal-overlay'),
        closeGuestModalButton: document.getElementById('close-guest-modal-button'),
        guestNicknameInput: document.getElementById('guest-nickname-input'),
        guestNicknameSubmit: document.getElementById('guest-nickname-submit'),
        homeScreen: document.getElementById('home-screen'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        showCreateButtonLogin: document.getElementById('show-create-button-login'),
        showCreateButtonAction: document.getElementById('show-create-button-action'),
        showJoinButton: document.getElementById('show-join-button'),
        playerStats: document.querySelector('.player-stats'),
        statGamesPlayed: document.getElementById('stat-games-played'),
        statHighscore: document.getElementById('stat-highscore'),
        modeBoxes: document.querySelectorAll('.mode-box'),
        joinModalOverlay: document.getElementById('join-modal-overlay'),
        closeModalButtonExit: document.getElementById('close-modal-button-exit'), // Dieses Element hat den Fehler verursacht
        joinGameButton: document.getElementById('join-game-button'),
    };
    
    // --- Hilfsfunktionen ---
    function showToast(message, isError = false) {
        Toastify({
            text: message,
            duration: 3500,
            gravity: "top",
            position: "center",
            stopOnFocus: true,
            style: {
                background: isError ? "linear-gradient(to right, #e52d27, #b31217)" : "linear-gradient(to right, #00b09b, #96c93d)",
                borderRadius: "8px",
                boxShadow: "0 3px 6px -1px rgba(0, 0, 0, 0.12), 0 10px 36px -4px rgba(0, 0, 0, 0.3)"
            }
        }).showToast();
    }

    // --- Auth-Logik ---
    async function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        if (!username || !password) {
            showToast("Bitte gib Benutzername und Passwort ein.", true);
            return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email: `${username}@fakester.app`, password });
        if (error) {
            showToast("Benutzername oder Passwort ist falsch.", true);
        } else {
            showToast('Erfolgreich angemeldet!');
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        if (!username || password.length < 6) {
            showToast("Benutzername darf nicht leer sein und das Passwort muss mind. 6 Zeichen haben.", true);
            return;
        }
        const { data: { user }, error } = await supabase.auth.signUp({
            email: `${username}@fakester.app`,
            password,
            options: { data: { username } }
        });
        if (error) {
            if (error.message.includes("User already registered")) {
                showToast("Dieser Benutzername ist bereits vergeben.", true);
            } else {
                showToast("Fehler bei der Registrierung.", true);
            }
        } else if (user) {
            const { error: profileError } = await supabase.from('profiles').insert({ id: user.id, username });
            if (profileError) {
                showToast("Konto konnte nicht vollständig erstellt werden.", true);
            } else {
                showToast('Konto erfolgreich erstellt! Du wirst angemeldet.');
            }
        }
    }

    async function handleLogout() {
        if (currentUser && !currentUser.isGuest) {
            await supabase.auth.signOut();
        }
        window.location.reload();
    }

    function handleGuestLogin() {
        const guestNickname = elements.guestNicknameInput.value.trim();
        if (guestNickname.length < 3) {
            showToast('Dein Gast-Name muss mindestens 3 Zeichen lang sein.', true);
            return;
        }
        elements.guestModalOverlay.classList.add('hidden');
        initializeAppAsGuest(guestNickname);
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

    async function initializeAppAsGuest(nickname) {
        currentUser = { id: 'guest-' + Date.now(), username: nickname, isGuest: true };
        elements.welcomeNickname.textContent = `${nickname} (Gast)`;
        elements.playerStats.classList.add('guest');
        await checkSpotifyStatus();
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
            elements.showCreateButtonLogin.classList.remove('hidden');
            elements.showCreateButtonAction.classList.add('hidden');
        } finally {
            elements.logoutButton.classList.remove('hidden');
        }
    }
    
    function showScreen(screenId) {
        elements.screens.forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
    }

    function setupAuthListener() {
        if (!supabase) return;
        supabase.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
                if (!currentUser) initializeApp(session.user);
            } else if (!currentUser || !currentUser.isGuest) {
                currentUser = null;
                showScreen('auth-screen');
            }
        });
    }

    // --- EVENT LISTENERS (VOLLSTÄNDIG) ---
    function initializeEventListeners() {
        elements.loginForm.addEventListener('submit', handleLogin);
        elements.registerForm.addEventListener('submit', handleRegister);
        elements.showRegisterForm.addEventListener('click', (e) => { e.preventDefault(); elements.loginForm.classList.add('hidden'); elements.registerForm.classList.remove('hidden'); });
        elements.showLoginForm.addEventListener('click', (e) => { e.preventDefault(); elements.registerForm.classList.add('hidden'); elements.loginForm.classList.remove('hidden'); });
        elements.logoutButton.addEventListener('click', handleLogout);
        elements.guestModeButton.addEventListener('click', () => elements.guestModalOverlay.classList.remove('hidden'));
        elements.closeGuestModalButton.addEventListener('click', () => elements.guestModalOverlay.classList.add('hidden'));
        elements.guestNicknameSubmit.addEventListener('click', handleGuestLogin);
        elements.showJoinButton.addEventListener('click', () => elements.joinModalOverlay.classList.remove('hidden'));
        
        // Dieser Listener hat den Fehler verursacht, weil das Element in der Liste oben gefehlt hat
        if(elements.closeModalButtonExit) {
            elements.closeModalButtonExit.addEventListener('click', () => elements.joinModalOverlay.classList.add('hidden'));
        }
        
        if(elements.showCreateButtonAction) {
            elements.showCreateButtonAction.addEventListener('click', () => showScreen('mode-selection-screen'));
        }
    }

    // Starte die gesamte Anwendung
    main();
});
