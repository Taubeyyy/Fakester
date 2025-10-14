document.addEventListener('DOMContentLoaded', () => {
    let supabase;

    // Diese Hauptfunktion wird sofort ausgeführt, um die App zu initialisieren.
    async function main() {
        try {
            // 1. Hole die sicheren Schlüssel vom Server.
            const response = await fetch('/api/config');
            if (!response.ok) {
                // NEU: Sichtbarer Fehler, wenn der Server die Schlüssel nicht liefert.
                throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            }
            const config = await response.json();
            
            // Prüfen, ob die Schlüssel leer sind (wichtig für Render-Startproblem)
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('Supabase-Schlüssel sind leer. Prüfe die Umgebungsvariablen in Render.');
            }

            // 2. Erstelle den Supabase Client.
            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

            // 3. Richte alle Funktionen und Klick-Events ein.
            initializeEventListeners();
            setupAuthListener();

        } catch (error) {
            // NEU: Zeigt eine detaillierte Fehlermeldung direkt auf der Seite an.
            console.error("Kritischer Fehler bei der Initialisierung:", error);
            document.body.innerHTML = `<div style="color: white; text-align: center; padding: 40px;">
                                            <h1>Fehler beim Laden der App</h1>
                                            <p style="color: #B3B3B3;">Es gab ein Problem bei der Verbindung zum Server.</p>
                                            <p style="color: #FF4500; font-family: monospace; margin-top: 20px;">Details: ${error.message}</p>
                                        </div>`;
        }
    }

    // --- DOM-Elemente und globale Variablen ---
    const ws = { socket: null };
    let currentUser = null;
    const elements = {
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        showRegisterForm: document.getElementById('show-register-form'),
        showLoginForm: document.getElementById('show-login-form'),
        authScreen: document.getElementById('auth-screen'),
        homeScreen: document.getElementById('home-screen'),
        welcomeNickname: document.getElementById('welcome-nickname'),
        // ... (alle anderen Elemente bleiben gleich)
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
            }
        }).showToast();
    }

    // --- Auth-Logik mit besseren Fehlermeldungen ---
    async function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        // NEU: Verbesserte Fehlerbehandlung
        const { error } = await supabase.auth.signInWithPassword({ email: `${username}@fakester.app`, password });
        if (error) {
            console.error("Login-Fehler:", error.message);
            showToast("Benutzername oder Passwort ist falsch.", true);
        } else {
            showToast('Erfolgreich angemeldet!');
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;

        // NEU: Verbesserte Fehlerbehandlung
        const { data: { user }, error } = await supabase.auth.signUp({
            email: `${username}@fakester.app`,
            password,
            options: { data: { username } }
        });

        if (error) {
            console.error("Registrierungs-Fehler:", error.message);
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
    
    // --- App-Logik ---
    function initializeApp(user) {
        currentUser = {
            id: user.id,
            username: user.user_metadata.username,
            isGuest: false
        };
        showScreen('home-screen');
        elements.welcomeNickname.textContent = user.user_metadata.username;
        // Weitere Initialisierungslogik hier...
    }
    
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
        }
    }

    function setupAuthListener() {
        if (!supabase) return;
        supabase.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
                initializeApp(session.user);
            } else {
                currentUser = null;
                showScreen('auth-screen');
            }
        });
    }

    function initializeEventListeners() {
        if(elements.loginForm) elements.loginForm.addEventListener('submit', handleLogin);
        if(elements.registerForm) elements.registerForm.addEventListener('submit', handleRegister);
        if(elements.showRegisterForm) elements.showRegisterForm.addEventListener('click', (e) => { e.preventDefault(); elements.loginForm.classList.add('hidden'); elements.registerForm.classList.remove('hidden'); });
        if(elements.showLoginForm) elements.showLoginForm.addEventListener('click', (e) => { e.preventDefault(); elements.registerForm.classList.add('hidden'); elements.loginForm.classList.remove('hidden'); });
        // ... (alle weiteren Event Listener hier einfügen)
    }

    // Starte die gesamte Anwendung
    main();
});
