// script.js - Debug: Re-introduce FULL initializeSupabase

console.log("Script file loaded and executing..."); // Log 1

document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOG] DOMContentLoaded event fired."); // Log 2

    // --- Variablen & Setup ---
    let supabase = null; // Wird jetzt wieder initialisiert
    let currentUser = null; // Für Auth State Change
    let elements = {};
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    // Copy Button wird später geholt

    // --- Logging ---
    const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(String).join(' '); const logEntry = document.createElement('div'); logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { console.error("Internal logToPage Error:", e); } };
    const originalConsoleLog = console.log; const originalConsoleError = console.error;
    console.log = (...args) => { logToPage('log', args); originalConsoleLog(...args); };
    console.error = (...args) => { logToPage('error', args); originalConsoleError(...args); };
    window.onerror = (message) => { const msg = `Uncaught Error: ${message}`; logToPage('error', [msg]); alert(msg); return true; };
    window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason.message : String(event.reason); const msg = `Unhandled Rejection: ${reason}`; logToPage('error', [msg]); alert(msg); };
    console.log("[LOG] Logging setup complete."); // Log 3
    // --- Ende Logging ---

    // --- Platzhalter (AUẞER initializeSupabase) ---
     const initializeApp = (user, isGuest = false) => { // BLEIBT PLATZHALTER
         console.log(`[LOG] initializeApp placeholder called (isGuest: ${isGuest}) User: ${user?.id || 'Guest'}`);
         alert(`initializeApp placeholder! User: ${user?.id || 'Guest'}`);
         currentUser = user; // Wichtig für Auth State Change
         // UI Updates etc. fehlen hier noch bewusst
     };
     const handleAuthAction = async (action, form, isRegister = false) => { // BLEIBT PLATZHALTER (fast)
        console.log(`[LOG] handleAuthAction called (isRegister: ${isRegister})`);
        if (!supabase) { alert("Supabase noch nicht bereit!"); return; }
        alert(`Auth action mit Supabase (Placeholder)! (isRegister: ${isRegister})`);
        // Führe die Supabase Action jetzt testweise aus, aber ohne UI Logik danach
        try {
            // Holen der Credentials wie im Original
            const formData = new FormData(form);
            const credentials = {};
            let username;
            if (isRegister) { username = formData.get('username'); credentials.email = `${username}@fakester.app`; credentials.password = formData.get('password'); credentials.options = { data: { username: username } }; }
            else { username = formData.get('username'); credentials.email = `${username}@fakester.app`; credentials.password = formData.get('password'); }

             console.log("[Auth Action] Calling Supabase...");
             const { data, error } = await action(credentials); // ECHTER AUFRUF
             if (error) {
                 console.error("[Auth Action] Supabase Error:", error);
                 logToPage('error', ["[Auth Action] Supabase Error:", error]);
                 alert("Supabase Auth Fehler: " + error.message);
             } else {
                 console.log("[Auth Action] Supabase Success:", data);
                 alert("Supabase Auth erfolgreich (Placeholder - onAuthStateChange sollte folgen)");
                 // onAuthStateChange sollte jetzt den initializeApp Placeholder triggern
             }
        } catch(err) {
             console.error("[Auth Action] Exception:", err);
             logToPage('error', ["[Auth Action] Exception:", err]);
             alert("Fehler während Auth Action: " + err.message);
        }
    };
    // --- Ende Platzhalter ---


    // --- Event Listeners hinzufügen ---
    try {
        console.log("[LOG] Adding essential event listeners..."); // Log 4

        // Console Buttons
        toggleConsoleBtn?.addEventListener('click', () => { console.log("[Event] Toggle Console click"); onPageConsole?.classList.toggle('hidden');});
        closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
        clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
        // Copy Button kommt später

        // Auth Screen Listeners (rufen jetzt handleAuthAction auf)
        const guestBtn = document.getElementById('guest-mode-button');
        const showRegBtn = document.getElementById('show-register-form');
        const showLogBtn = document.getElementById('show-login-form');
        const loginForm = document.getElementById('login-form');
        const regForm = document.getElementById('register-form');

        if (!guestBtn || !showRegBtn || !showLogBtn || !loginForm || !regForm) throw new Error("Essential Auth Buttons/Forms not found!");

        guestBtn.addEventListener('click', () => { console.log("[Event] Guest button click"); initializeApp({username: 'Gast-Test'}, true);}); // Ruft Platzhalter auf
        showRegBtn.addEventListener('click', (e) => { console.log("[Event] Show Register click"); e.preventDefault(); loginForm.classList.add('hidden'); regForm.classList.remove('hidden'); });
        showLogBtn.addEventListener('click', (e) => { console.log("[Event] Show Login click"); e.preventDefault(); loginForm.classList.remove('hidden'); regForm.classList.add('hidden'); });
        // Verwende .bind() für die Supabase Methoden
        loginForm.addEventListener('submit', (e) => { console.log("[Event] Login submit click"); e.preventDefault(); handleAuthAction(supabase?.auth?.signInWithPassword.bind(supabase.auth), e.target, false);});
        regForm.addEventListener('submit', (e) => { console.log("[Event] Register submit click"); e.preventDefault(); handleAuthAction(supabase?.auth?.signUp.bind(supabase.auth), e.target, true);});

        console.log("[LOG] Essential listeners added successfully."); // Log 5

    } catch (error) {
        console.error("[ERROR] FATAL ERROR adding essential listeners:", error); logToPage('error', ["[ERROR] FATAL ERROR adding essential listeners:", error]); alert("FATAL ERROR adding essential listeners: " + error.message); return;
    }

    // --- Restliche DOM Elemente holen ---
    try {
        console.log("[LOG] Getting remaining DOM elements..."); // Log 6
        elements = { /* ... (Füge hier den RIESIGEN Block wieder ein) ... */ };
         // Füge den Copy-Button Listener hier hinzu
        document.getElementById('copy-console-btn')?.addEventListener('click', () => { /* ... copy logic ... */ });
        console.log("[LOG] Remaining DOM elements retrieved successfully."); // Log 7
    } catch (error) {
        console.error("[ERROR] Error getting remaining DOM elements:", error); logToPage('error', ["[ERROR] Error getting remaining DOM elements:", error]); alert("ERROR getting remaining DOM elements: " + error.message);
    }

    // --- Supabase Initialization (VOLLSTÄNDIG) ---
    async function initializeSupabase() {
        try {
            console.log("[Supabase] Starting Supabase initialization..."); // Log 8
            console.log("[Supabase] Fetching /api/config...");
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error(`Config fetch failed: ${response.statusText} (Status: ${response.status})`);
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) { throw new Error("Supabase config missing or invalid."); }
            console.log("[Supabase] Config received."); // Log 9

            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { global: { fetch: (...args) => window.fetch(...args) }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
            console.log("[Supabase] Client initialized successfully."); // Log 10

            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`[Supabase Auth] Event: ${event}`, session ? `User: ${session.user.id}` : 'No session'); // Log 11 (oder später)
                // WICHTIG: Ruft immer noch den initializeApp PLATZHALTER auf!
                if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    console.log("[Auth] Signed out state detected.");
                    // Hier könnten wir showScreen('auth-screen') sicher aufrufen, wenn wir wollten
                    document.getElementById('auth-screen')?.classList.add('active');
                    document.getElementById('home-screen')?.classList.remove('active');
                    document.body.classList.add('is-guest');
                    return;
                }
                if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) {
                     if (!currentUser || currentUser.id !== session.user.id) { // Verhindert doppeltes Aufrufen
                          console.log("[Auth] Session detected, calling initializeApp placeholder...");
                          initializeApp(session.user, false); // Ruft Platzhalter auf
                     }
                }
            });

            console.log("[Supabase] Getting initial session..."); // Log 12
            const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.error("[Supabase] Error getting initial session:", sessionError);
                logToPage('error', ["[Supabase] Error getting initial session:", sessionError]);
                // Zeige Auth Screen, aber fahre fort
                 document.getElementById('auth-screen')?.classList.add('active');
                 document.getElementById('home-screen')?.classList.remove('active');
            } else if (!initialSession) {
                 console.log("[Supabase] Initial: No session found.");
                 if (!document.getElementById('auth-screen')?.classList.contains('active')) {
                     document.getElementById('auth-screen')?.classList.add('active');
                     document.getElementById('home-screen')?.classList.remove('active');
                 }
            } else {
                 console.log("[Supabase] Initial session found, onAuthStateChange should trigger initializeApp placeholder soon.");
                 // onAuthStateChange wird asynchron getriggert
            }
             console.log("[Supabase] Initialization sequence finished."); // Log 13

        } catch (error) {
            console.error("[ERROR] FATAL Supabase init error:", error);
            logToPage('error', ["[ERROR] FATAL Supabase init error:", error]);
            alert("FATAL Supabase init error: " + error.message);
            // Optional: Zeige Fehlerseite
            // document.body.innerHTML = `... Fehlerseite ...`;
        }
    }

    // --- Main Execution ---
    initializeSupabase(); // ECHTE Funktion aufrufen

    console.log("[LOG] End of DOMContentLoaded reached (after starting Supabase init)."); // Log 14

}); // Ende DOMContentLoaded

console.log("Script file finished initial execution."); // Log 15

