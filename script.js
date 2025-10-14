document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen ---
    const ws = { socket: null };
    let currentUser = null, spotifyToken = null, settingsCache = {};

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
        showJoinButton: document.getElementById('show-join-button'),
        playerStats: document.querySelector('.player-stats'),
        statGamesPlayed: document.getElementById('stat-games-played'),
        statHighscore: document.getElementById('stat-highscore'),

        // Modals
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
        
        // Lobby
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

    // --- Auth-Logik (mit verbessertem Fehler-Handling) ---
    async function handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        if (!username || password.length < 6) {
            return showToast("Benutzername darf nicht leer sein und das Passwort muss mind. 6 Zeichen haben.", true);
        }

        const { data: { user }, error } = await supabase.auth.signUp({
            email: `${username}@fakester.app`, password, options: { data: { username } }
        });

        if (error) {
            // GENAUERE FEHLERMELDUNG
            console.error("Supabase SignUp Error:", error);
            const message = error.message.includes("User already registered") ? "Dieser Benutzername ist bereits vergeben." : "Fehler bei der Registrierung. Bitte versuche es erneut.";
            return showToast(message, true);
        }
        
        if (user) {
            const { error: profileError } = await supabase.from('profiles').insert({ id: user.id, username });
            if (profileError) {
                console.error("Supabase Profile Error:", profileError);
                return showToast("Konto konnte nicht vollständig erstellt werden.", true);
            }
            showToast('Konto erfolgreich erstellt! Du wirst angemeldet.');
        }
    }

    // --- NUMPAD & MODAL LOGIK ---
    function setupNumpad(numpadButtons, displayDigits, maxLength, onComplete) {
        let value = '';
        const updateDisplay = () => {
            displayDigits.forEach((digit, index) => {
                digit.textContent = value[index] || '';
            });
        };

        const handler = (e) => {
            const button = e.currentTarget;
            const action = button.dataset.action;
            if (action === 'clear') {
                value = '';
            } else if (action === 'backspace') {
                value = value.slice(0, -1);
            } else if (value.length < maxLength) {
                value += button.textContent.trim();
                if (value.length === maxLength && onComplete) {
                    onComplete(value);
                }
            }
            updateDisplay();
        };
        numpadButtons.forEach(button => button.addEventListener('click', handler));
        return { clear: () => { value = ''; updateDisplay(); } };
    }
    
    let joinNumpadControl, customInputNumpadControl;

    function showCustomInputModal(title, maxLength, callback) {
        elements.customInputModal.title.textContent = title;
        elements.customInputModal.display.forEach(d => d.style.display = 'flex');
        if (maxLength < 3) { // Verstecke die 3. Ziffer, wenn nicht benötigt
             elements.customInputModal.display[2].style.display = 'none';
        }
        elements.customInputModal.overlay.classList.remove('hidden');

        let currentVal = '';
        const numpadCallback = (val) => currentVal = val;
        customInputNumpadControl = setupNumpad(elements.customInputModal.numpad, elements.customInputModal.display, maxLength, numpadCallback);

        const submitHandler = () => {
            if (currentVal) callback(currentVal);
            cleanup();
        };
        const cleanup = () => {
            elements.customInputModal.overlay.classList.add('hidden');
            customInputNumpadControl.clear();
            elements.customInputModal.submitButton.removeEventListener('click', submitHandler);
        };
        
        elements.customInputModal.submitButton.addEventListener('click', submitHandler);
        elements.customInputModal.cancelButton.addEventListener('click', cleanup);
    }
    
    // --- Event Listeners ---
    function initializeEventListeners() {
        // Auth
        elements.loginForm.addEventListener('submit', handleLogin); // handleLogin muss existieren
        elements.registerForm.addEventListener('submit', handleRegister);
        elements.showRegisterForm.addEventListener('click', (e) => { e.preventDefault(); elements.loginForm.classList.add('hidden'); elements.registerForm.classList.remove('hidden'); });
        elements.showLoginForm.addEventListener('click', (e) => { e.preventDefault(); elements.registerForm.classList.add('hidden'); elements.loginForm.classList.remove('hidden'); });
        elements.logoutButton.addEventListener('click', handleLogout); // handleLogout muss existieren

        // Guest Modal
        elements.guestModeButton.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
        elements.guestModal.closeButton.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.guestModal.submitButton.addEventListener('click', handleGuestLogin); // handleGuestLogin muss existieren
        
        // Join Modal
        elements.showJoinButton.addEventListener('click', () => {
            elements.joinModal.overlay.classList.remove('hidden');
            joinNumpadControl = setupNumpad(elements.joinModal.numpad, elements.joinModal.pinDisplay, 4, (pin) => {
                // Hier könnte man direkt joinen, wenn 4 Ziffern voll sind.
                // ws.socket.send(...)
                showToast(`PIN ${pin} eingegeben.`);
            });
        });
        elements.joinModal.closeButton.addEventListener('click', () => {
            elements.joinModal.overlay.classList.add('hidden');
            joinNumpadControl.clear();
        });

        // Lobby Settings
        [elements.songCountOptions, elements.guessTimeOptions].forEach(container => {
            container.addEventListener('click', (e) => {
                const button = e.target.closest('.option-btn');
                if (!button) return;

                const type = button.dataset.type;
                const action = button.dataset.action;

                if (action === 'custom') {
                    const title = type === 'song-count' ? 'Anzahl Songs' : 'Ratezeit (Sek.)';
                    const maxLen = type === 'song-count' ? 3 : 2;
                    showCustomInputModal(title, maxLen, (value) => {
                        settingsCache[type] = parseInt(value);
                        updateSettingsUI(container, button, value);
                        // sendSettingsToServer();
                        showToast(`${title} auf ${value} gesetzt.`);
                    });
                } else {
                    const value = parseInt(button.dataset.value);
                    settingsCache[type] = value;
                    updateSettingsUI(container, button);
                    // sendSettingsToServer();
                }
            });
        });
    }

    function updateSettingsUI(container, activeButton, customValue = null) {
        container.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('active'));
        activeButton.classList.add('active');
        if (customValue) {
            activeButton.textContent = customValue;
        } else {
            const customBtn = container.querySelector('[data-action="custom"]');
            const defaultText = customBtn.dataset.type === 'song-count' ? 'Custom' : 'Custom';
            customBtn.textContent = defaultText;
        }
    }
    
    // --- Initialisierung der App ---
    let supabase;
    async function main() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            
            const config = await response.json();
            supabase = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            initializeEventListeners();
            // Rest der Initialisierungslogik (Auth Listener etc.)
        } catch (error) {
            console.error("Kritischer Fehler bei der Initialisierung:", error);
            document.body.innerHTML = `<div style="color: white; padding: 40px; text-align: center;"><h1>Fehler beim Laden der App</h1><p>${error.message}</p></div>`;
        }
    }
    
    // Platzhalter für Funktionen, die in deinem Original-Skript existieren, aber hier nicht gezeigt wurden.
    async function handleLogin(e) { e.preventDefault(); showToast('Login-Logik hier einfügen.'); }
    async function handleLogout() { showToast('Logout-Logik hier einfügen.'); }
    function handleGuestLogin() { showToast('Gast-Login-Logik hier einfügen.'); elements.guestModal.overlay.classList.add('hidden'); }
    
    main(); // Startet die App
});
