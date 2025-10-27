// script.js - Debug: Re-introduce Supabase Initialization

console.log("Script file loaded and executing...");

document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOG] DOMContentLoaded event fired.");

    // --- Minimales Setup ---
    let supabase; // Wird jetzt wieder initialisiert
    let currentUser = null; // Für Auth State Change
    let elements = {};
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');

    // --- Logging ---
    const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(String).join(' '); const logEntry = document.createElement('div'); logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { console.error("Error logging to page console:", e); } };
    console.log = (...args) => logToPage('log', args);
    console.error = (...args) => logToPage('error', args);
    window.onerror = (message, source, lineno, colno, error) => { const msg = error ? `${error.message} at ${source}:${lineno}:${colno}` : message; logToPage('error', ['🚨 Uncaught Error:', msg]); alert("Uncaught Error: " + msg); return true; };
    window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason.message : String(event.reason); logToPage('error', ['🚧 Unhandled Rejection:', reason]); alert("Unhandled Rejection: " + reason); };
    console.log("[LOG] Logging setup complete.");
    // --- Ende Logging ---

     // --- Platzhalter für Funktionen, die Supabase brauchen ---
     const initializeApp = (user, isGuest = false) => {
         console.log(`[LOG] initializeApp placeholder called (isGuest: ${isGuest})`);
         alert(`initializeApp placeholder! User: ${user?.id || 'Guest'}`);
         // Hier würde normalerweise UI-Update etc. passieren
         currentUser = user; // Wichtig für Auth State Change
         // checkSpotifyStatus(); // Vorerst weglassen
         // connectWebSocket(); // Vorerst weglassen
     };
     const handleAuthAction = async (action, form, isRegister = false) => {
        console.log(`[LOG] handleAuthAction called (isRegister: ${isRegister})`);
        if (!supabase) { alert("Supabase noch nicht bereit!"); return; }
        alert(`Auth action mit Supabase! (isRegister: ${isRegister})`);
        // Hier würde der echte Supabase Call passieren
        // const { data, error } = await action(...);
        // if (error) alert("Auth Fehler: " + error.message);
        // else alert("Auth erfolgreich (Placeholder)");
    };
     const checkSpotifyStatus = async () => { console.log("[LOG] checkSpotifyStatus placeholder called"); };
     const handleLogout = async () => {
         console.log("[LOG] handleLogout called.");
         if (!supabase) { alert("Supabase noch nicht bereit!"); return; }
         alert("Logout mit Supabase!");
          // Hier würde der echte Supabase Call passieren
         // const { error } = await supabase.auth.signOut();
         // if(error) alert("Logout Fehler: " + error.message);
         // else alert("Logout erfolgreich (Placeholder)");
         // fetch('/logout', { method: 'POST' }); // Spotify Cookie löschen
     }


    // --- Event Listeners zuerst hinzufügen ---
    try {
        console.log("[LOG] Adding essential event listeners...");

        // Console Button
        toggleConsoleBtn?.addEventListener('click', () => {
             console.log("[Event] Toggle Console click");
             onPageConsole?.classList.toggle('hidden');
        });
         document.getElementById('close-console-btn')?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
         document.getElementById('clear-console-btn')?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
         // Copy Button Listener fehlt hier, da Element dynamisch erstellt wird - erstmal unwichtig

        // Auth Screen Listeners
        document.getElementById('login-form')?.addEventListener('submit', (e) => {
             console.log("[Event] Login form submit");
             e.preventDefault();
             handleAuthAction(supabase?.auth?.signInWithPassword.bind(supabase.auth), e.target, false); // Jetzt mit Supabase-Aufruf (Placeholder)
        });
        document.getElementById('register-form')?.addEventListener('submit', (e) => {
             console.log("[Event] Register form submit");
             e.preventDefault();
             handleAuthAction(supabase?.auth?.signUp.bind(supabase.auth), e.target, true); // Jetzt mit Supabase-Aufruf (Placeholder)
        });
        document.getElementById('show-register-form')?.addEventListener('click', (e) => {
             console.log("[Event] Show Register click");
             e.preventDefault();
             document.getElementById('login-form')?.classList.add('hidden');
             document.getElementById('register-form')?.classList.remove('hidden'); });
        document.getElementById('show-login-form')?.addEventListener('click', (e) => {
             console.log("[Event] Show Login click");
             e.preventDefault();
             document.getElementById('login-form')?.classList.remove('hidden');
             document.getElementById('register-form')?.classList.add('hidden'); });

        // Gast Modal Button
        document.getElementById('guest-mode-button')?.addEventListener('click', () => {
             console.log("[Event] Guest button click");
             initializeApp({ username: 'Gast-Test' }, true); // Ruft den Placeholder auf
        });

         // Logout Button (wichtig zum Testen des Auth State)
         document.getElementById('corner-logout-button')?.addEventListener('click', handleLogout);


        console.log("[LOG] Essential listeners added successfully.");

    } catch (error) {
        console.error("[ERROR] FATAL ERROR adding event listeners:", error);
        logToPage('error', ["[ERROR] FATAL ERROR adding event listeners:", error]);
        alert("FATAL ERROR adding event listeners: " + error.message);
        return; // Stoppen
    }

    // --- Jetzt DOM Elemente holen (weniger kritisch jetzt) ---
    try {
         console.log("[LOG] Getting remaining DOM elements...");
         elements = {
             // ... Füge hier die wichtigsten Elemente wieder ein,
             //     die von initializeApp oder checkSpotifyStatus gebraucht werden
             home: { spotifyConnectBtn: document.getElementById('spotify-connect-button'), createRoomBtn: document.getElementById('show-create-button-action'), /* ... */ },
             // ...
         };
         console.log("[LOG] Remaining DOM elements retrieved.");
    } catch (error) {
         console.error("[ERROR] Error getting DOM elements:", error);
         logToPage('error', ["[ERROR] Error getting DOM elements:", error]);
         // Nicht stoppen, Supabase Init versuchen wir trotzdem
    }

    // --- Supabase Initialization (VOLLSTÄNDIG) ---
    async function initializeSupabase() {
        try {
            console.log("[Supabase] Starting Supabase initialization...");
            console.log("[Supabase] Fetching /api/config...");
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error(`Config fetch failed: ${response.statusText} (Status: ${response.status})`);
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) { throw new Error("Supabase config missing or invalid."); }
            console.log("[Supabase] Config received.");

            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { global: { fetch: (...args) => window.fetch(...args) }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
            console.log("[Supabase] Client initialized successfully.");

            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`[Supabase Auth] Event: ${event}`, session ? `User: ${session.user.id}` : 'No session');
                if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    // Minimal UI Reset
                    console.log("[Auth] Signed out, showing auth screen.");
                    // showScreen('auth-screen'); // Vorerst weglassen, um Fehler zu isolieren
                    document.getElementById('auth-screen')?.classList.add('active'); // Direkt manipulieren
                    document.getElementById('home-screen')?.classList.remove('active'); // Direkt manipulieren
                    document.body.classList.add('is-guest');
                    return;
                }
                if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) {
                     // Rufe NUR den initializeApp PLATZHALTER auf
                     if (!currentUser || currentUser.id !== session.user.id) {
                          initializeApp(session.user, false);
                     }
                }
                // TOKEN_REFRESHED ignorieren wir erstmal
            });

            console.log("[Supabase] Getting initial session...");
            const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.error("[Supabase] Error getting initial session:", sessionError);
                logToPage('error', ["[Supabase] Error getting initial session:", sessionError]);
                // Nicht abbrechen, vielleicht geht Gastmodus
                // showScreen('auth-screen'); // Vorerst weglassen
                 document.getElementById('auth-screen')?.classList.add('active'); // Direkt manipulieren
                 document.getElementById('home-screen')?.classList.remove('active'); // Direkt manipulieren
            } else if (!initialSession) {
                 console.log("[Supabase] Initial: No session found.");
                 if (!document.getElementById('auth-screen')?.classList.contains('active')) {
                     // showScreen('auth-screen'); // Vorerst weglassen
                     document.getElementById('auth-screen')?.classList.add('active');
                     document.getElementById('home-screen')?.classList.remove('active');
                 }
            } else {
                 console.log("[Supabase] Initial session found, onAuthStateChange should trigger initializeApp placeholder.");
                 // onAuthStateChange wird getriggert und ruft den initializeApp Placeholder auf
            }
             console.log("[Supabase] Initialization sequence finished.");

        } catch (error) {
            console.error("[ERROR] FATAL Supabase init error:", error);
            logToPage('error', ["[ERROR] FATAL Supabase init error:", error]);
            alert("FATAL Supabase init error: " + error.message);
            document.body.innerHTML = `<div class="fatal-error"><h1>Init Fehler</h1><p>Supabase konnte nicht initialisiert werden. (${error.message})</p></div>`;
        }
    }

    // --- Main Execution ---
    initializeSupabase(); // Jetzt die echte Funktion aufrufen

}); // Ende DOMContentLoaded

console.log("Script file finished initial execution.");
