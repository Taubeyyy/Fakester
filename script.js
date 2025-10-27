// script.js - Final Debug: Isolate Element Access

console.log("Script file loaded and executing..."); // Log 1

document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOG] DOMContentLoaded event fired."); // Log 2

    // --- Minimales Setup & Logging ---
    let supabase = null;
    let elements = {}; // Wird später gefüllt
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    const copyConsoleBtn = document.getElementById('copy-console-btn'); // Direkt holen, falls statisch im HTML

    const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(String).join(' '); const logEntry = document.createElement('div'); logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { console.error("Internal logToPage Error:", e); } };
    const originalConsoleLog = console.log; // Behalte originales Log für Notfälle
    const originalConsoleError = console.error;
    console.log = (...args) => { logToPage('log', args); originalConsoleLog(...args); }; // Logge beides
    console.error = (...args) => { logToPage('error', args); originalConsoleError(...args); };
    window.onerror = (message) => { const msg = `Uncaught Error: ${message}`; logToPage('error', [msg]); alert(msg); return true; };
    window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason.message : String(event.reason); const msg = `Unhandled Rejection: ${reason}`; logToPage('error', [msg]); alert(msg); };
    console.log("[LOG] Logging setup complete."); // Log 3
    // --- Ende Logging ---

    // --- Platzhalter ---
    const initializeApp = () => { console.log("initializeApp placeholder"); alert("initializeApp placeholder!");};
    const handleAuthAction = () => { console.log("handleAuthAction placeholder"); alert("handleAuthAction placeholder!");};
    const initializeSupabase = async () => { console.log("initializeSupabase placeholder"); /* Kein Supabase Code */ };
    console.log("[LOG] Placeholders defined."); // Log 4

    // --- 1. VERSUCH: Nur essenzielle Listener hinzufügen ---
    try {
        console.log("[LOG] Adding ESSENTIAL event listeners FIRST..."); // Log 5

        // Console Buttons (KRITISCH)
        if (toggleConsoleBtn) {
            toggleConsoleBtn.addEventListener('click', () => {
                console.log("[Event] Toggle Console click");
                alert("Toggle Console Button Clicked!");
                onPageConsole?.classList.toggle('hidden');
            });
        } else { throw new Error("toggleConsoleBtn not found!"); } // Sofort Fehler werfen

        if (closeConsoleBtn) { closeConsoleBtn.addEventListener('click', () => onPageConsole?.classList.add('hidden')); } else { console.warn("closeConsoleBtn not found");}
        if (clearConsoleBtn) { clearConsoleBtn.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; }); } else { console.warn("clearConsoleBtn not found");}
        // Copy Button (wurde dynamisch erstellt, holen wir später)

        // Auth Screen Buttons (KRITISCH)
        const guestBtn = document.getElementById('guest-mode-button');
        const showRegBtn = document.getElementById('show-register-form');
        const showLogBtn = document.getElementById('show-login-form');
        const loginForm = document.getElementById('login-form');
        const regForm = document.getElementById('register-form');

        if (!guestBtn || !showRegBtn || !showLogBtn || !loginForm || !regForm) {
            throw new Error("Essential Auth Buttons/Forms not found!"); // Sofort Fehler werfen
        }

        guestBtn.addEventListener('click', () => { console.log("[Event] Guest button click"); alert("Guest Button!"); initializeApp();});
        showRegBtn.addEventListener('click', (e) => { console.log("[Event] Show Register click"); e.preventDefault(); alert("Show Register!"); loginForm.classList.add('hidden'); regForm.classList.remove('hidden'); });
        showLogBtn.addEventListener('click', (e) => { console.log("[Event] Show Login click"); e.preventDefault(); alert("Show Login!"); loginForm.classList.remove('hidden'); regForm.classList.add('hidden'); });
        loginForm.addEventListener('submit', (e) => { console.log("[Event] Login submit click"); e.preventDefault(); alert("Login Submit!"); handleAuthAction();});
        regForm.addEventListener('submit', (e) => { console.log("[Event] Register submit click"); e.preventDefault(); alert("Register Submit!"); handleAuthAction();});

        console.log("[LOG] Essential listeners added successfully."); // Log 6

    } catch (error) {
        // Wenn DAS hier fehlschlägt, ist das HTML kaputt oder das Skript läuft zu früh
        console.error("[ERROR] FATAL ERROR adding essential listeners:", error);
        logToPage('error', ["[ERROR] FATAL ERROR adding essential listeners:", error]);
        alert("FATAL ERROR adding essential listeners: " + error.message);
        return; // ABSOLUT KRITISCH - Hier MUSS es funktionieren!
    }

    // --- 2. VERSUCH: Restliche DOM Elemente holen ---
    try {
        console.log("[LOG] Getting remaining DOM elements..."); // Log 7
        elements = {
            // Hole jetzt ALLE anderen Elemente wie im vollständigen Code
             screens: document.querySelectorAll('.screen'),
             leaveGameButton: document.getElementById('leave-game-button'),
             loadingOverlay: document.getElementById('loading-overlay'),
             // ... (Füge hier den RIESIGEN Block aus dem vorherigen Code ein) ...
             home: { logoutBtn: document.getElementById('corner-logout-button'), /* ... usw. ... */ },
             // ...
             // Beispiel Ende:
             backgroundSelectModal: { overlay: document.getElementById('background-select-modal-overlay'), closeBtn: document.getElementById('close-background-select-modal'), list: document.getElementById('owned-backgrounds-list') },
        };
        // Füge den Copy-Button Listener hier hinzu, falls das Element dynamisch war
        document.getElementById('copy-console-btn')?.addEventListener('click', () => { if (!consoleOutput) return; const txt = Array.from(consoleOutput.children).map(e => e.dataset.rawText || e.textContent).join('\n'); navigator.clipboard.writeText(txt).then(() => showToast('Logs kopiert!', false), err => { console.error('[ERROR] Fehler: Logs kopieren:', err); showToast('Kopieren fehlgeschlagen.', true); }); });


        console.log("[LOG] Remaining DOM elements retrieved successfully."); // Log 8
    } catch (error) {
        // Wenn DAS hier fehlschlägt, fehlt eine ID im HTML!
        console.error("[ERROR] Error getting remaining DOM elements:", error);
        logToPage('error', ["[ERROR] Error getting remaining DOM elements:", error]);
        alert("ERROR getting remaining DOM elements: " + error.message + "\nCheck HTML IDs!");
        // Nicht unbedingt stoppen, die Grundfunktionen gehen vielleicht noch
    }

    // --- 3. VERSUCH: Supabase Initialisierung (Platzhalter) ---
     console.log("[LOG] Starting Supabase initialization (placeholder)..."); // Log 9
     initializeSupabase(); // Ruft nur den Placeholder auf

    console.log("[LOG] End of DOMContentLoaded reached."); // Log 10

}); // Ende DOMContentLoaded

console.log("Script file finished initial execution."); // Log 11
