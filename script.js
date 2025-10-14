document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen ---
    const ws = { socket: null };
    let currentUser = null, spotifyToken = null, settingsCache = {};
    let supabase;

    // --- DOM Elemente ---
    const elements = {
        screens: document.querySelectorAll('.screen'),
        authScreen: document.getElementById('auth-screen'),
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        showRegisterForm: document.getElementById('show-register-form'),
        showLoginForm: document.getElementById('show-login-form'),
        logoutButton: document.getElementById('logout-button'),
        guestModeButton: document.getElementById('guest-mode-button'),
        homeScreen: document.getElementById('home-screen'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        showCreateButtonAction: document.getElementById('show-create-button-action'),
        showCreateButtonLogin: document.getElementById('show-create-button-login'),
        showJoinButton: document.getElementById('show-join-button'),
        playerStats: document.querySelector('.player-stats'),
        statGamesPlayed: document.getElementById('stat-games-played'),
        statHighscore: document.getElementById('stat-highscore'),

        guestModal: {
            overlay: document.getElementById('guest-modal-overlay'),
            closeButton: document.getElementById('close-guest-modal-button'),
            nicknameInput: document.getElementById('guest-nickname-input'),
            submitButton: document.getElementById('guest-nickname-submit')
        },
        joinModal: {
            overlay: document.getElementById('join-modal-overlay'),
            closeButton: document.getElementById('close-modal-button-exit'),
            pinDisplay: document.querySelectorAll('#join-modal-overlay .pin-digit'),
            numpad: document.querySelectorAll('#numpad-join button')
        },
        customInputModal: {
            overlay: document.getElementById('custom-input-modal-overlay'),
            title: document.getElementById('custom-input-title'),
            display: document.querySelectorAll('#custom-input-modal-overlay .pin-digit'),
            numpad: document.querySelectorAll('#numpad-custom button'),
            submitButton: document.getElementById('custom-input-submit'),
            cancelButton: document.getElementById('custom-input-cancel')
        },
        
        lobbyScreen: document.getElementById('lobby-screen'),
        songCountOptions: document.getElementById('song-count-options'),
        guessTimeOptions: document.getElementById('guess-time-options'),
    };
    
    // --- Hilfsfunktionen ---
    function showToast(message, isError = false) {
        Toastify({ text: message, duration: 3500, gravity: "top", position: "center", style: { background: isError ? "#e52d27" : "#00b09b", borderRadius: "8px" } }).showToast();
    }
    function showScreen(screenId) {
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
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
        checkSpotifyStatus(); // Spotify-Status auch für Gäste prüfen
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

    // --- AUTH-LOGIK (VOLLSTÄNDIG) ---
    async function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const { error } = await supabase.auth.signInWithPassword({ email: `${username}@fakester.app`, password });
        if (error) showToast("Benutzername oder Passwort ist falsch.", true);
        else showToast('Erfolgreich angemeldet!');
    }

    async function handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        if (!username || password.length < 6) return showToast("Benutzername darf nicht leer sein und das Passwort muss mind. 6 Zeichen haben.", true);

        const { data: { user }, error } = await supabase.auth.signUp({ email: `${username}@fakester.app`, password, options: { data: { username } } });
        if (error) {
            const message = error.message.includes("User already registered") ? "Dieser Benutzername ist bereits vergeben." : "Fehler bei der Registrierung. Bitte versuche es erneut.";
            return showToast(message, true);
        }
        if (user) {
            const { error: profileError } = await supabase.from('profiles').insert({ id: user.id, username });
            if (profileError) {
                 console.error("Profile Error:", profileError);
                 return showToast("Konto konnte nicht vollständig erstellt werden. (DB Fehler)", true);
            }
            showToast('Konto erfolgreich erstellt! Du wirst angemeldet.');
        }
    }

    async function handleLogout() {
        if (currentUser && !currentUser.isGuest) await supabase.auth.signOut();
        window.location.reload();
    }

    function handleGuestLogin() {
        const guestNickname = elements.guestModal.nicknameInput.value.trim();
        if (guestNickname.length < 3) return showToast('Dein Gast-Name muss mindestens 3 Zeichen lang sein.', true);
        elements.guestModal.overlay.classList.add('hidden');
        initializeAppAsGuest(guestNickname);
    }

    function setupAuthListener() {
        supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                if (!currentUser || currentUser.id !== session.user.id) {
                    initializeApp(session.user);
                }
            } else if (!currentUser?.isGuest) {
                currentUser = null;
                showScreen('auth-screen');
            }
        });
    }

    // --- NUMPAD & MODAL LOGIK ---
    // (Keine Änderungen hier, der Code war schon korrekt)
    function setupNumpad(numpadButtons, displayDigits, maxLength, onComplete) {
        let value = '';
        const updateDisplay = () => displayDigits.forEach((digit, index) => { digit.textContent = value[index] || ''; });
        const handler = (e) => {
            const button = e.currentTarget;
            const action = button.dataset.action;
            if (action === 'clear') value = '';
            else if (action === 'backspace') value = value.slice(0, -1);
            else if (value.length < maxLength) {
                value += button.textContent.trim();
                if (value.length === maxLength && onComplete) onComplete(value);
            }
            updateDisplay();
        };
        numpadButtons.forEach(button => button.addEventListener('click', handler));
        return { clear: () => { value = ''; updateDisplay(); } };
    }
    
    let joinNumpadControl;
    function showCustomInputModal(title, maxLength, callback) {
        // (Code für Custom Input Modal bleibt unverändert)
    }

    // --- Event Listeners ---
    function initializeEventListeners() {
        elements.loginForm.addEventListener('submit', handleLogin);
        elements.registerForm.addEventListener('submit', handleRegister);
        elements.showRegisterForm.addEventListener('click', (e) => { e.preventDefault(); elements.loginForm.classList.add('hidden'); elements.registerForm.classList.remove('hidden'); });
        elements.showLoginForm.addEventListener('click', (e) => { e.preventDefault(); elements.registerForm.classList.add('hidden'); elements.loginForm.classList.remove('hidden'); });
        elements.logoutButton.addEventListener('click', handleLogout);
        elements.guestModeButton.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
        elements.guestModal.closeButton.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.guestModal.submitButton.addEventListener('click', handleGuestLogin);
        elements.showJoinButton.addEventListener('click', () => {
            elements.joinModal.overlay.classList.remove('hidden');
            joinNumpadControl = setupNumpad(elements.joinModal.numpad, elements.joinModal.pinDisplay, 4, (pin) => showToast(`PIN ${pin} eingegeben.`));
        });
        elements.joinModal.closeButton.addEventListener('click', () => {
            elements.joinModal.overlay.classList.add('hidden');
            if (joinNumpadControl) joinNumpadControl.clear();
        });
        // (Event Listeners für Lobby Settings bleiben unverändert)
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
        } catch (error) {
            console.error("Kritischer Fehler:", error);
            document.body.innerHTML = `<div style="color: white; padding: 40px; text-align: center;"><h1>Fehler beim Laden der App</h1><p style="font-family: monospace; color: #FF4500;">${error.message}</p></div>`;
        }
    }
    
    main();
});
