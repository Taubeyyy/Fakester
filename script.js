// script.js - Debug: Add Listeners BEFORE getting all elements

alert("TEST 1: Script file loaded!");

document.addEventListener('DOMContentLoaded', () => {
    alert("TEST 2: DOMContentLoaded event fired!");

    // --- Minimales Setup ---
    let supabase;
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn'); // Direkt holen

    // --- Logging ---
    const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(String).join(' '); const logEntry = document.createElement('div'); logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { console.error("Error logging to page console:", e); } };
    console.log = (...args) => logToPage('log', args);
    console.error = (...args) => logToPage('error', args);
    window.onerror = (message) => { logToPage('error', ['🚨 Uncaught Error:', message]); alert("Uncaught Error: " + message); return true; };
    window.onunhandledrejection = (event) => { logToPage('error', ['🚧 Unhandled Rejection:', event.reason]); alert("Unhandled Rejection: " + event.reason); };
    // --- Ende Logging ---

    // --- WICHTIG: Event Listeners ZUERST hinzufügen! ---
    try {
        alert("TEST 3: Adding essential event listeners FIRST...");

        // Console Button Listener (ganz wichtig)
        if (toggleConsoleBtn) {
            toggleConsoleBtn.addEventListener('click', () => {
                alert("Toggle Console Button Clicked!");
                onPageConsole?.classList.toggle('hidden');
            });
        } else {
             alert("FEHLER: Konsole-Toggle-Button NICHT gefunden!");
             console.error("FEHLER: Konsole-Toggle-Button NICHT gefunden!");
             logToPage('error', ["FEHLER: Konsole-Toggle-Button NICHT gefunden!"]);
        }
         // Füge hier nur die ALLERNÖTIGSTEN Listener für den Auth-Screen hinzu
         document.getElementById('guest-mode-button')?.addEventListener('click', () => { alert("Guest Button!"); });
         document.getElementById('show-register-form')?.addEventListener('click', (e) => { e.preventDefault(); alert("Show Register!"); /* Minimal UI change */ document.getElementById('login-form')?.classList.add('hidden'); document.getElementById('register-form')?.classList.remove('hidden'); });
         document.getElementById('show-login-form')?.addEventListener('click', (e) => { e.preventDefault(); alert("Show Login!"); /* Minimal UI change */ document.getElementById('login-form')?.classList.remove('hidden'); document.getElementById('register-form')?.classList.add('hidden'); });
         document.getElementById('login-form')?.addEventListener('submit', (e) => { e.preventDefault(); alert("Login Submit!"); });
         document.getElementById('register-form')?.addEventListener('submit', (e) => { e.preventDefault(); alert("Register Submit!"); });

        alert("TEST 4: Essential listeners added.");

    } catch (error) {
        alert("FATAL ERROR adding event listeners: " + error.message);
        console.error("[ERROR] FATAL ERROR adding event listeners:", error);
        logToPage('error', ["[ERROR] FATAL ERROR adding event listeners:", error]);
        return; // Stoppen
    }

    // --- Jetzt den Rest versuchen ---
    let elements = {};
    try {
         alert("TEST 5: Getting remaining DOM elements...");
         // Hier jetzt den GROSSEN elements Block einfügen
         elements = {
             screens: document.querySelectorAll('.screen'),
             leaveGameButton: document.getElementById('leave-game-button'),
             loadingOverlay: document.getElementById('loading-overlay'),
             // ... FÜGE HIER ALLE ANDEREN ELEMENTE EIN ...
             // Beispiel:
             home: { logoutBtn: document.getElementById('corner-logout-button'), /* ... */ spotifyConnectBtn: document.getElementById('spotify-connect-button') },
             // ... usw. ...
         };
         alert("TEST 6: Remaining DOM elements retrieved.");
    } catch (error) {
         alert("ERROR getting remaining DOM elements: " + error.message);
         console.error("[ERROR] Error getting DOM elements:", error);
         logToPage('error', ["[ERROR] Error getting DOM elements:", error]);
         // Nicht unbedingt stoppen, vielleicht gehen die Grundfunktionen noch
    }

    // --- Placeholder für restliche Funktionen (werden nicht ausgeführt im Fehlerfall oben) ---
    const initializeApp = () => { console.log("initializeApp placeholder"); };
    const checkSpotifyStatus = () => { console.log("checkSpotifyStatus placeholder"); };
    const handleAuthAction = () => { console.log("handleAuthAction placeholder"); };
    const initializeSupabase = async () => { console.log("initializeSupabase placeholder"); }; // Muss async sein wegen await innen

    alert("TEST 7: About to call initializeSupabase (placeholder)");
    initializeSupabase(); // Nur zum Test aufrufen

}); // Ende DOMContentLoaded

alert("TEST 8: Script file finished initial execution.");
