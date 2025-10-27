// script.js - Final Debug: Alerts INSIDE initializeApp

console.log("Script file loaded and executing...");

document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOG] DOMContentLoaded event fired.");

    // --- Variablen & Setup (vollständig) ---
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;
    let userProfile = {}; let userUnlockedAchievementIds = []; let onlineFriends = [];
    let ownedTitleIds = new Set(); let ownedIconIds = new Set(); let ownedBackgroundIds = new Set(); let ownedColorIds = new Set(); let inventory = {};
    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
    let screenHistory = ['auth-screen']; let selectedGameMode = null; let gameCreationSettings = { gameType: null, lives: 3 };
    let allPlaylists = [], currentPage = 1, itemsPerPage = 10; let wsPingInterval = null;

    // --- Logging Setup (Minimal, mit Alerts für Fehler) ---
    const consoleOutput = document.getElementById('console-output');
    const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(String).join(' '); const logEntry = document.createElement('div'); logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { console.error("Internal logToPage Error:", e); } };
    console.log = (...args) => logToPage('log', args);
    console.error = (...args) => logToPage('error', args);
    window.onerror = (message) => { const msg = `Uncaught Error: ${message}`; logToPage('error', [msg]); alert(msg); return true; };
    window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason.message : String(event.reason); const msg = `Unhandled Rejection: ${reason}`; logToPage('error', [msg]); alert(msg); };
    console.log("[LOG] Logging setup complete.");
    // --- Ende Logging ---

    // --- Datenbanken (Gekürzt, aber wichtig) ---
    const achievementsList = [ { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' }]; // Minimal
    const titlesList = [ { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1, type:'title' }]; // Minimal
    const iconsList = [ { id: 1, iconClass: 'fa-user', unlockType: 'level', unlockValue: 1, description: 'Standard-Icon', type:'icon' }]; // Minimal
    // ... (restliche Listen hier ggf. auch minimal halten oder ganz raus für den Test?)

    // --- DOM Elemente holen ---
    let elements = {};
    try {
        console.log("[LOG] Getting DOM elements...");
        elements = { /* ... DEIN VOLLSTÄNDIGER elements BLOCK ... */
            // Stelle sicher, dass ALLE IDs hier korrekt sind!
             screens: document.querySelectorAll('.screen'), leaveGameButton: document.getElementById('leave-game-button'), loadingOverlay: document.getElementById('loading-overlay'), countdownOverlay: document.getElementById('countdown-overlay'), auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form') }, home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'), profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'), levelProgressBtn: document.getElementById('level-progress-button'), profileXpText: document.getElementById('profile-xp-text'), spotsBalance: document.getElementById('header-spots-balance'), shopButton: document.getElementById('shop-button'), spotifyConnectBtn: document.getElementById('spotify-connect-button') }, guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), input: document.getElementById('guest-nickname-input') }, joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), }, /* ... REST ... */
        };
        console.log("[LOG] DOM elements retrieved.");
    } catch (error) {
        alert("FATAL ERROR getting DOM elements: " + error.message); console.error("[ERROR] FATAL ERROR getting DOM elements:", error); logToPage('error', ["[ERROR] FATAL ERROR getting DOM elements:", error]); return;
    }

    // --- Core Functions (Definitionen) ---
    const showToast = (message, isError = false) => { console.log(`[Toast] ${message} (Error: ${isError})`); /* Toastify call */ };
    const showScreen = (screenId) => { try { console.log(`[Nav] Showing screen: ${screenId}`); const targetScreen = document.getElementById(screenId); if (!targetScreen) { console.error(`[ERROR] Screen ${screenId} not found!`); return; } elements.screens?.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); /* ... rest ... */ } catch(e){ alert("Error in showScreen: "+e.message);}};
    const setLoading = (isLoading) => { elements.loadingOverlay?.classList.toggle('hidden', !isLoading);};
    // ... (Andere Core/Helper Funktionsdefinitionen) ...
    const connectWebSocket = () => { console.log("[WebSocket] connectWebSocket placeholder");};
    const checkSpotifyStatus = async () => { console.log("[Spotify] checkSpotifyStatus placeholder");};
    const awardClientSideAchievement = (id) => { console.log("awardClientSideAchievement placeholder");};
    const renderAchievements = () => {console.log("renderAchievements placeholder");};
    const renderTitles = () => {console.log("renderTitles placeholder");};
    const renderIcons = () => {console.log("renderIcons placeholder");};
    const renderLevelProgress = () => {console.log("renderLevelProgress placeholder");};
    const updateSpotsDisplay = () => {console.log("updateSpotsDisplay placeholder");};
    const handleLogout = async () => { console.log("handleLogout placeholder"); alert("handleLogout placeholder");};

    // --- initializeApp (VOLLSTÄNDIG, mit ALERTS) ---
    const initializeApp = (user, isGuest = false) => {
        try {
            alert("AppInit 1: Start");
            console.log(`[App] initializeApp called for user: ${user?.username || user?.id}, isGuest: ${isGuest}`);
            localStorage.removeItem('fakesterGame');

            alert("AppInit 2: Before Fallback");
            const fallbackUsername = isGuest ? user.username : user.user_metadata?.username || user.email?.split('@')[0] || 'Unbekannt';
            const fallbackProfile = { id: user.id, username: fallbackUsername, xp: 0, /*...*/ equipped_title_id: 1, equipped_icon_id: 1 };

            alert("AppInit 3: Before currentUser/Profile Set");
            if (isGuest) {
                currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest };
                userProfile = { ...fallbackProfile, id: currentUser.id, username: currentUser.username };
            } else {
                currentUser = { id: user.id, username: fallbackUsername, isGuest };
                userProfile = { ...fallbackProfile, id: user.id, username: currentUser.username };
            }
            console.log("[App] currentUser:", currentUser);

            alert("AppInit 4: Before Initial UI Update");
            document.body.classList.toggle('is-guest', isGuest);
            // Direkter Zugriff mit try...catch um jeden kritischen Punkt
            try { document.getElementById('welcome-nickname').textContent = currentUser.username; } catch(e){ alert("Error setting nickname: "+e.message); }
            // updateSpotsDisplay(); // Ersetzt durch Placeholder oben
            console.log("[App] Basic UI updated.");

            alert("AppInit 5: Before Render Checks");
             // Render-Platzhalter aufrufen
             try { renderAchievements(); } catch(e){ alert("Error calling renderAchievements: "+e.message); }
             try { renderTitles(); } catch(e){ alert("Error calling renderTitles: "+e.message); }
             try { renderIcons(); } catch(e){ alert("Error calling renderIcons: "+e.message); }
             try { renderLevelProgress(); } catch(e){ alert("Error calling renderLevelProgress: "+e.message); }
            console.log("[App] Render functions checked/called.");

            alert("AppInit 6: Before showScreen");
            showScreen('home-screen'); // Kritisch!

            alert("AppInit 7: After showScreen, before setLoading(false)");
            setLoading(false); // Kritisch!

            // === Background Fetch (Platzhalter/Vereinfacht) ===
            if (!isGuest && supabase) {
                alert("AppInit 8: Starting Background Fetch (Placeholder)");
                console.log("[App] Starting background data fetch (simplified)...");
                 // Nur zum Testen, ob der Block erreicht wird
                 checkSpotifyStatus(); // Placeholder
                 connectWebSocket(); // Placeholder
            } else if (isGuest) {
                 alert("AppInit 8: Guest - Calling CheckSpotify/ConnectWS (Placeholders)");
                 checkSpotifyStatus(); // Placeholder
                 connectWebSocket(); // Placeholder
            }

            alert("AppInit 9: End of initializeApp");
            console.log("[App] initializeApp finished.");

        } catch (error) { // Fängt Fehler INNERHALB von initializeApp
            alert("FATAL ERROR inside initializeApp: " + error.message);
            console.error("[ERROR] FATAL ERROR inside initializeApp:", error);
            logToPage('error', ["[ERROR] FATAL ERROR inside initializeApp:", error]);
            setLoading(false); // Wichtig!
            // showScreen('auth-screen'); // Geht vielleicht nicht, wenn showScreen kaputt ist
            document.getElementById('auth-screen')?.classList.add('active'); // Fallback
            document.getElementById('home-screen')?.classList.remove('active'); // Fallback
        }
    }; // Ende initializeApp

     // --- handleAuthAction (Platzhalter mit Supabase Call wie vorher) ---
     const handleAuthAction = async (action, form, isRegister = false) => { /* ... wie im vorherigen Code ... */ };

    // --- Event Listeners hinzufügen (Funktion Definition) ---
     const addEventListeners = () => {
         try {
             console.log("[LOG] Adding essential event listeners...");
             // Console Buttons
             toggleConsoleBtn?.addEventListener('click', () => { console.log("[Event] Toggle Console click"); onPageConsole?.classList.toggle('hidden');});
             closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
             clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
             document.getElementById('copy-console-btn')?.addEventListener('click', () => { /* ... copy logic ... */ }); // Jetzt hier hinzufügen

             // Auth Screen Listeners
             document.getElementById('guest-mode-button')?.addEventListener('click', () => { console.log("[Event] Guest button click"); initializeApp({username: 'Gast-Test'}, true);}); // Ruft VOLLSTÄNDIGE initializeApp auf
             document.getElementById('show-register-form')?.addEventListener('click', (e) => { /* ... */ });
             document.getElementById('show-login-form')?.addEventListener('click', (e) => { /* ... */ });
             document.getElementById('login-form')?.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase?.auth?.signInWithPassword.bind(supabase.auth), e.target, false);}); // Ruft handleAuthAction auf
             document.getElementById('register-form')?.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase?.auth?.signUp.bind(supabase.auth), e.target, true);}); // Ruft handleAuthAction auf

             // Logout Button
              document.getElementById('corner-logout-button')?.addEventListener('click', handleLogout); // Ruft Placeholder auf

             console.log("[LOG] Essential listeners added successfully.");
         } catch (error) {
             alert("FATAL ERROR adding essential listeners: " + error.message); console.error("[ERROR] FATAL ERROR adding essential listeners:", error); logToPage('error', ["[ERROR] FATAL ERROR adding essential listeners:", error]);
         }
     }; // Ende addEventListeners Definition

    // --- Supabase Initialization (VOLLSTÄNDIG) ---
    const initializeSupabase = async () => {
         try {
             console.log("[Supabase] Starting Supabase initialization...");
             /* ... (Kompletter Code wie vorher) ... */
             supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { /*...*/ });
             console.log("[Supabase] Client initialized.");
             supabase.auth.onAuthStateChange(async (event, session) => {
                 console.log(`[Supabase Auth] Event: ${event}`, session ? `User: ${session.user.id}` : 'No session');
                 if (event === 'SIGNED_OUT') { /*...*/ return; }
                 if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) {
                     if (!currentUser || currentUser.id !== session.user.id) {
                         alert("Supabase detected session! Calling initializeApp..."); // Wichtiger Alert
                         initializeApp(session.user, false); // Ruft die VOLLSTÄNDIGE initializeApp auf
                     }
                 }
             });
             console.log("[Supabase] Getting initial session...");
             const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
             /* ... (Restliches Session Handling wie vorher) ... */
             console.log("[Supabase] Initialization sequence finished.");
         } catch (error) {
             alert("FATAL Supabase init error: " + error.message); console.error("[ERROR] FATAL Supabase init error:", error); logToPage('error', ["[ERROR] FATAL Supabase init error:", error]);
         }
     }; // Ende initializeSupabase Definition

    // --- Main Execution ---
    alert("TEST_FINAL: Before addEventListeners call");
    addEventListeners();
    alert("TEST_FINAL: Before initializeSupabase call");
    initializeSupabase();
    alert("TEST_FINAL: After initializeSupabase call started");

}); // Ende DOMContentLoaded

alert("TEST_FINAL: Script file finished initial execution.");
