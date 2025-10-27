// script.js - Test: Wird DOMContentLoaded ausgeführt?

alert("TEST 1: Script file loaded!");

document.addEventListener('DOMContentLoaded', () => {
    alert("TEST 2: DOMContentLoaded event fired!"); // Kommt diese Meldung?

    // --- Minimaler Code, nur um zu sehen, ob addEventListeners erreicht wird ---
    let supabase; // Nur deklarieren, nicht initialisieren
    
    // --- On-Page Konsole (Minimal-Setup) ---
     const consoleOutput = document.getElementById('console-output');
     const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(String).join(' '); const logEntry = document.createElement('div'); logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { console.error("Error logging to page console:", e); } };
     console.log = (...args) => { logToPage('log', args); };
     console.error = (...args) => { logToPage('error', args); };
     window.onerror = (message) => { logToPage('error', ['🚨 Uncaught Error:', message]); return true; };
     window.onunhandledrejection = (event) => { logToPage('error', ['🚧 Unhandled Rejection:', event.reason]); };
     // --- Ende Konsole ---

    const elements = { // Nur die Nötigsten für den Auth-Test
        auth: {
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            showRegister: document.getElementById('show-register-form'),
            showLogin: document.getElementById('show-login-form')
        },
        guestModal: {
             openBtn: document.getElementById('guest-mode-button')
        }
    };

    function handleAuthAction(action, form, isRegister = false) {
        // Dummy-Funktion für den Test
        console.log(`Auth action triggered (isRegister: ${isRegister})`);
        alert(`Auth action triggered!`);
    }

    function initializeApp(user, isGuest = false) {
         // Dummy-Funktion für den Test
        console.log(`InitializeApp called (isGuest: ${isGuest})`);
        alert(`InitializeApp called!`);
    }


    function addEventListeners() {
        alert("TEST 3: addEventListeners function started!"); // Kommt diese Meldung?
        try {
            console.log("Adding essential event listeners...");

            // Auth Screen
            elements.auth?.loginForm?.addEventListener('submit', (e) => {
                console.log("Login form submit triggered");
                e.preventDefault(); // Verhindert Neuladen
                alert("Login Submit geklickt!");
                // handleAuthAction(supabase?.auth?.signInWithPassword.bind(supabase.auth), e.target, false);
            });
            elements.auth?.registerForm?.addEventListener('submit', (e) => {
                console.log("Register form submit triggered");
                e.preventDefault(); // Verhindert Neuladen
                 alert("Register Submit geklickt!");
               // handleAuthAction(supabase?.auth?.signUp.bind(supabase.auth), e.target, true);
            });
            elements.auth?.showRegister?.addEventListener('click', (e) => {
                console.log("Show Register clicked");
                e.preventDefault();
                alert("Registrieren Link geklickt!");
                elements.auth?.loginForm?.classList.add('hidden');
                elements.auth?.registerForm?.classList.remove('hidden');
            });
            elements.auth?.showLogin?.addEventListener('click', (e) => {
                console.log("Show Login clicked");
                e.preventDefault();
                 alert("Anmelden Link geklickt!");
                elements.auth?.loginForm?.classList.remove('hidden');
                elements.auth?.registerForm?.classList.add('hidden');
            });

            // Gast Modal Button (nur der Öffnen-Button)
            elements.guestModal?.openBtn?.addEventListener('click', () => {
                console.log("Guest button clicked");
                alert("Gast-Button geklickt!");
               // elements.guestModal.overlay?.classList.remove('hidden');
               // elements.guestModal.input?.focus();
            });

             // Konsolen Button (zum Testen)
             const toggleConsoleBtn = document.getElementById('toggle-console-btn');
             const onPageConsole = document.getElementById('on-page-console');
             toggleConsoleBtn?.addEventListener('click', () => {
                 alert("Konsolen-Button geklickt!");
                 onPageConsole?.classList.toggle('hidden');
            });


            console.log("Essential event listeners added successfully.");

        } catch (error) {
            console.error("FATAL ERROR adding event listeners:", error);
            logToPage('error', ["FATAL ERROR adding event listeners:", error]);
            alert("FEHLER beim Hinzufügen der Listener: " + error.message); // Zeige Fehler im Alert
        }
    }

    // --- Main Execution within DOMContentLoaded ---
    alert("TEST 2.5: About to call addEventListeners..."); // Kommt diese Meldung?
    addEventListeners(); // SOFORT ausführen
    // initializeSupabase(); // Vorerst weglassen

}); // Ende DOMContentLoaded

console.log("Script file finished initial execution.");
