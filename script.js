// script.js - Debug: Full code with detailed logs inside initializeApp

console.log("Script file loaded and executing...");

document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOG] DOMContentLoaded event fired.");

    // --- Variablen & Setup ---
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;
    let userProfile = {}; let userUnlockedAchievementIds = []; let onlineFriends = [];
    let ownedTitleIds = new Set(); let ownedIconIds = new Set(); let ownedBackgroundIds = new Set(); let ownedColorIds = new Set(); let inventory = {};
    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
    let screenHistory = ['auth-screen']; let selectedGameMode = null; let gameCreationSettings = { gameType: null, lives: 3 };
    let allPlaylists = [], currentPage = 1, itemsPerPage = 10; let wsPingInterval = null;
    console.log("[LOG] Global variables initialized.");

    // --- On-Page Konsole Setup ---
    // (Gekürzt, Funktionalität wie vorher)
    const consoleOutput = document.getElementById('console-output'); const onPageConsole = document.getElementById('on-page-console'); const toggleConsoleBtn = document.getElementById('toggle-console-btn'); const closeConsoleBtn = document.getElementById('close-console-btn'); const clearConsoleBtn = document.getElementById('clear-console-btn'); const copyConsoleBtn = document.createElement('button'); copyConsoleBtn.textContent = 'Kopieren'; copyConsoleBtn.id = 'copy-console-btn'; const consoleHeader = document.querySelector('.console-header'); if (consoleHeader && clearConsoleBtn) { consoleHeader.insertBefore(copyConsoleBtn, clearConsoleBtn); } else if (onPageConsole && clearConsoleBtn) { onPageConsole.appendChild(copyConsoleBtn); }
    const originalConsole = { ...console }; const formatArg = (arg) => { /*...*/ return String(arg);}; const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(formatArg).join(' '); const logEntry = document.createElement('div'); logEntry.classList.add(`log-${type}`); logEntry.dataset.rawText = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; logEntry.innerHTML = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: <pre>${message}</pre>`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { originalConsole.error("Error logging to page console:", e); } };
    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); }; console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); }; console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); }; console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); }; window.onerror = (message, source, lineno, colno, error) => { const msg = error ? `${error.message} at ${source}:${lineno}:${colno}` : message; logToPage('error', ['🚨 Uncaught Error:', msg]); alert("Uncaught Error: " + msg); return true; }; window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason.message : String(event.reason); logToPage('error', ['🚧 Unhandled Rejection:', reason]); alert("Unhandled Rejection: " + reason); };
    console.log("[LOG] On-page console setup complete.");
    // --- Ende On-Page Konsole ---

    // --- ERWEITERTE DATENBANKEN ---
    // (Gekürzt, Inhalt wie vorher)
    const achievementsList = [ /* ... */ ]; const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100)); const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1); const titlesList = [ /* ... */ ]; const iconsList = [ /* ... */ ]; const backgroundsList = [ /* ... */ ]; const nameColorsList = [ /* ... */ ]; const allItems = [...titlesList, ...iconsList, ...backgroundsList, ...nameColorsList]; window.titlesList = titlesList; window.iconsList = iconsList; window.backgroundsList = backgroundsList; window.nameColorsList = nameColorsList; window.allItems = allItems; const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;
    console.log("[LOG] Data lists (achievements, items) initialized.");

    // --- DOM Element References ---
    console.log("[LOG] Getting DOM elements...");
    let elements = {};
    try {
        // (Gekürzt, Inhalt wie vorher, aber WICHTIG, dass alle IDs stimmen!)
        elements = { screens: document.querySelectorAll('.screen'), leaveGameButton: document.getElementById('leave-game-button'), loadingOverlay: document.getElementById('loading-overlay'), countdownOverlay: document.getElementById('countdown-overlay'), auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form') }, home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'), profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'), levelProgressBtn: document.getElementById('level-progress-button'), profileXpText: document.getElementById('profile-xp-text'), spotsBalance: document.getElementById('header-spots-balance'), shopButton: document.getElementById('shop-button'), spotifyConnectBtn: document.getElementById('spotify-connect-button') }, /* ... alle anderen ... */ };
        console.log("[LOG] DOM elements retrieved successfully.");
    } catch (error) {
         console.error("[ERROR] FATAL ERROR getting DOM elements:", error); logToPage('error', ["[ERROR] FATAL ERROR getting DOM elements:", error]); alert("FATAL ERROR getting DOM elements: " + error.message); return;
    }

    // --- Core Functions ---
    // (Gekürzt, Inhalt wie vorher)
    const showToast = (message, isError = false) => { console.log(`[Toast] ${message} (Error: ${isError})`); Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast(); }
    const showScreen = (screenId) => { console.log(`[Nav] Showing screen: ${screenId}`); const targetScreen = document.getElementById(screenId); if (!targetScreen) { console.error(`[ERROR] Screen with ID "${screenId}" not found!`); return; } const currentScreenId = screenHistory[screenHistory.length - 1]; if (screenId !== currentScreenId) screenHistory.push(screenId); elements.screens?.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton?.classList.toggle('hidden', !showLeaveButton); };
    const goBack = () => { /* ... */ }; const setLoading = (isLoading) => { /* ... */ }; const showConfirmModal = (title, text, onConfirm) => { /* ... */ };

    // --- Helper Functions ---
    // (Gekürzt, Inhalt wie vorher)
    function isItemUnlocked(item, currentLevel) { /* ... */ return false; } function getUnlockDescription(item) { /* ... */ return ''; } function updateSpotsDisplay() { /* ... */ }

    // --- Initialization and Auth ---

    // ### HIER IST DIE WICHTIGE FUNKTION mit Logs ###
    const initializeApp = (user, isGuest = false) => {
        try { // Füge try...catch um die ganze Funktion
            console.log(`[App] initializeApp called for user: ${user?.username || user?.id}, isGuest: ${isGuest}`);
            localStorage.removeItem('fakesterGame');

            console.log("[App] Defining fallback data...");
            const fallbackUsername = isGuest ? user.username : user.user_metadata?.username || user.email?.split('@')[0] || 'Unbekannt';
            const fallbackProfile = { id: user.id, username: fallbackUsername, xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, spots: 0, equipped_title_id: 1, equipped_icon_id: 1 };

            console.log("[App] Setting currentUser and userProfile...");
            if (isGuest) {
                currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest };
                userProfile = { ...fallbackProfile, id: currentUser.id, username: currentUser.username };
                userUnlockedAchievementIds = []; ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); inventory = {};
            } else {
                currentUser = { id: user.id, username: fallbackUsername, isGuest };
                userProfile = { ...fallbackProfile, id: user.id, username: currentUser.username }; // Start with fallback
                userUnlockedAchievementIds = []; ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); inventory = {};
            }
            console.log("[App] currentUser:", currentUser);

            console.log("[App] Setting up initial UI...");
            document.body.classList.toggle('is-guest', isGuest);
            // Sicherheitsprüfungen für UI-Elemente
            document.getElementById('welcome-nickname') ? (document.getElementById('welcome-nickname').textContent = currentUser.username) : console.warn("Element welcome-nickname not found");
             // equipTitle/Icon brauchen wir erstmal nicht für den Test, machen wir später
            // if(document.getElementById('profile-title')) equipTitle(userProfile.equipped_title_id || 1, false);
            // if(elements.home?.profileIcon) equipIcon(userProfile.equipped_icon_id || 1, false);
            // updatePlayerProgressDisplay(); // braucht elements
            // updateStatsDisplay(); // braucht elements
             updateSpotsDisplay(); // braucht elements
             console.log("[App] Basic UI updated.");

            // Rufe Render-Funktionen nur auf, wenn das Element existiert
            console.log("[App] Checking if render functions should run...");
            if (document.getElementById('achievement-grid')) renderAchievements(); else console.log("Skip renderAchievements");
            if (document.getElementById('title-list')) renderTitles(); else console.log("Skip renderTitles");
            if (document.getElementById('icon-list')) renderIcons(); else console.log("Skip renderIcons");
            if (document.getElementById('level-progress-list')) renderLevelProgress(); else console.log("Skip renderLevelProgress");
            console.log("[App] Render functions checked/called.");

            console.log("[App] Showing home screen...");
            showScreen('home-screen'); // Sollte jetzt sicher sein
            setLoading(false); // Loading ausblenden

            // === DATEN IM HINTERGRUND LADEN (nur für eingeloggte User) ===
            if (!isGuest && supabase) {
                console.log("[App] Starting background data fetch for logged-in user...");
                 // (Gekürzt, Logik wie vorher, aber mit mehr Logs)
                 Promise.all([
                     supabase.from('profiles').select('*').eq('id', user.id).single(),
                     /* ... andere Promises ... */
                     supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id) // Lade Achievements hier mit
                 ]).then((results) => {
                    console.log("[App BG] Received background data results.");
                    const [profileResult, titlesResult, iconsResult, backgroundsResult, inventoryResult, achievementsResult] = results; // Achievements hinzugefügt

                    // 1. Profil verarbeiten
                    console.log("[App BG] Processing profile...");
                    // ... (Logik wie vorher) ...

                    // 2. Besitz verarbeiten
                    console.log("[App BG] Processing owned items...");
                     // ... (Logik wie vorher) ...

                    // 3. Erfolge verarbeiten (aus dem Promise.all Ergebnis)
                    console.log("[App BG] Processing achievements...");
                    if (achievementsResult.error) { console.error("[ERROR] BG Achievement Error:", achievementsResult.error); userUnlockedAchievementIds = []; }
                    else { userUnlockedAchievementIds = achievementsResult.data.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id)); console.log("[App BG] Achievements processed:", userUnlockedAchievementIds); }

                    console.log("[App BG] Updating UI based on fetched data...");
                    // UI neu rendern, die von Besitz/Level/Erfolgen abhängt
                    // (Sicherheitsprüfungen wiederholen)
                    if (document.getElementById('achievement-grid')) renderAchievements();
                    if (document.getElementById('title-list')) renderTitles();
                    if (document.getElementById('icon-list')) renderIcons();
                    if (document.getElementById('level-progress-list')) renderLevelProgress();
                     // Update Profil UI mit echten Daten
                     if(document.getElementById('welcome-nickname')) document.getElementById('welcome-nickname').textContent = currentUser.username;
                     // equipTitle(userProfile.equipped_title_id || 1, false);
                     // equipIcon(userProfile.equipped_icon_id || 1, false);
                     // updatePlayerProgressDisplay();
                     // updateStatsDisplay();
                     updateSpotsDisplay();

                    console.log("[App BG] Checking Spotify status after data load...");
                    return checkSpotifyStatus(); // Kette zum Spotify Check
                 })
                 .then(() => {
                     console.log("[App BG] Spotify status checked.");
                     if (spotifyToken && !userUnlockedAchievementIds.includes(9)) {
                         console.log("[App BG] Awarding Spotify achievement client-side...");
                         awardClientSideAchievement(9);
                     }
                     console.log("[App BG] Connecting WebSocket...");
                     connectWebSocket();
                 })
                 .catch(error => {
                     console.error("[ERROR] Error during background data loading chain:", error);
                     logToPage('error', ["[ERROR] Background data load failed:", error]);
                     showToast("Fehler beim Laden einiger Hintergrunddaten.", true);
                     console.log("[App BG] Connecting WebSocket despite background load error...");
                     connectWebSocket(); // Trotzdem versuchen zu verbinden
                 });
            } else if (isGuest) {
                console.log("[App] Guest mode: Checking Spotify and connecting WebSocket...");
                checkSpotifyStatus();
                connectWebSocket();
            } else {
                 console.warn("[App] Logged-in user but Supabase object is missing? Cannot fetch background data.");
            }

            console.log("[App] initializeApp finished initial setup.");

        } catch (error) { // Fängt Fehler INNERHALB von initializeApp
            console.error("[ERROR] FATAL ERROR inside initializeApp:", error);
            logToPage('error', ["[ERROR] FATAL ERROR inside initializeApp:", error]);
            alert("FATAL ERROR in initializeApp: " + error.message);
            setLoading(false); // Wichtig, damit die Seite nicht hängt
            // Evtl. zur Auth-Seite zurück?
            showScreen('auth-screen');
        }
    }; // Ende initializeApp

    // (Restliche Funktionen wie checkSpotifyStatus, handleAuthAction etc. bleiben wie im letzten VOLLSTÄNDIGEN Code)
    const checkSpotifyStatus = async () => { console.log("[Spotify] Checking Spotify status..."); try { const response = await fetch('/api/status'); const data = await response.json(); if (data.loggedIn && data.token) { console.log("[Spotify] Connected."); spotifyToken = data.token; elements.home?.spotifyConnectBtn?.classList.add('hidden'); elements.home?.createRoomBtn?.classList.remove('hidden'); if (currentUser && !currentUser.isGuest && !userUnlockedAchievementIds.includes(9)) { awardClientSideAchievement(9); } } else { console.log("[Spotify] NOT connected."); spotifyToken = null; elements.home?.spotifyConnectBtn?.classList.remove('hidden'); elements.home?.createRoomBtn?.classList.add('hidden'); } } catch (error) { console.error("[ERROR] Error checking Spotify status:", error); logToPage('error', ["[ERROR] Spotify status check failed:", error]); spotifyToken = null; elements.home?.spotifyConnectBtn?.classList.remove('hidden'); elements.home?.createRoomBtn?.classList.add('hidden'); } };
    const handleAuthAction = async (action, form, isRegister = false) => { console.log(`[Auth] handleAuthAction called (isRegister: ${isRegister})`); if (!supabase) { showToast("Verbindung wird aufgebaut...", true); return; } setLoading(true); const formData = new FormData(form); const credentials = {}; let username; if (isRegister) { username = formData.get('username'); credentials.email = `${username}@fakester.app`; credentials.password = formData.get('password'); credentials.options = { data: { username: username, xp: 0, spots: 100, equipped_title_id: 1, equipped_icon_id: 1 } }; } else { username = formData.get('username'); credentials.email = `${username}@fakester.app`; credentials.password = formData.get('password'); } try { const { data, error } = await action(credentials); if (error) { console.error(`[ERROR] Auth Error (${isRegister ? 'Register' : 'Login'}):`, error); logToPage('error', [`[ERROR] Auth failed:`, error]); showToast(error.message, true); } else if (data.user) { console.log(`[Auth] Success (${isRegister ? 'Register' : 'Login'}):`, data.user.id); /* onAuthStateChange handles it */ } else { console.warn("[Auth] No error, but no user data."); } } catch (err) { console.error(`[ERROR] Exception during auth action:`, err); logToPage('error', [`[ERROR] Auth exception:`, err]); showToast("Ein unerwarteter Fehler beim Login/Registrieren.", true); } finally { setLoading(false); } };
    const handleLogout = async () => { console.log("[Auth] handleLogout called."); if (!supabase) return; showConfirmModal("Abmelden", "Möchtest du dich wirklich abmelden?", async () => { setLoading(true); console.log("[Auth] Logging out via Supabase..."); const { error: signOutError } = await supabase.auth.signOut(); console.log("[Auth] Clearing Spotify cookie via /logout..."); try { await fetch('/logout', { method: 'POST' }); console.log("[Auth] Spotify cookie cleared."); } catch (fetchError) { console.error("[ERROR] Error clearing Spotify cookie:", fetchError); logToPage('error', ["[ERROR] Logout fetch failed:", fetchError]); } setLoading(false); if (signOutError) { console.error("[ERROR] Supabase SignOut Error:", signOutError); logToPage('error', ["[ERROR] Supabase SignOut failed:", signOutError]); showToast(signOutError.message, true); } else { console.log("[Auth] Supabase logout successful. onAuthStateChange should trigger."); } }); };
    const awardClientSideAchievement = (achievementId) => { /* ... */ };
    const connectWebSocket = () => { console.log("[WebSocket] Attempting to connect..."); /* ... restliche Logik ... */ };
    const handleWebSocketMessage = ({ type, payload }) => { console.log(`[WebSocket] Received message: ${type}`); /* ... restliche Logik ... */ };
    // ... (Alle anderen UI-, Helper- und Game-Funktionen wie vorher) ...
    function renderPlayerList(players, hostId) { /* ... */ } function updateHostSettings(settings, isHost) { /* ... */ } function renderAchievements() { /* ... */ } async function equipTitle(titleId, saveToDb = true) { /* ... */ } function renderTitles() { /* ... */ } async function equipIcon(iconId, saveToDb = true) { /* ... */ } function renderIcons() { /* ... */ } function renderLevelProgress() { /* ... */ } function updatePlayerProgressDisplay() { /* ... */ } async function updatePlayerProgress() { /* ... */ } function updateStatsDisplay() { /* ... */ } async function loadShopItems() { /* ... */ } function renderShopItem(item, userSpots, isOwned) { /* ... */ return ''; } async function handleBuyItem(itemId) { /* ... */ } function showBackgroundSelectionModal() { /* ... */ } function applyLobbyBackground(backgroundId) { /* ... */ } function displayReaction(playerId, reaction) { /* ... */ } async function handleGiftSpots(friendId, friendName) { /* ... */ } function showCountdown(round, total) { /* ... */ } function setupPreRound(data) { /* ... */ } function setupNewRound(data) { /* ... */ } function showRoundResult(data) { /* ... */ } async function loadFriendsData() { /* ... */ } function renderRequestsList(requests) { /* ... */ } async function fetchHostData(isRefresh = false) { /* ... */ return Promise.resolve(); } function renderPaginatedPlaylists(playlistsToRender, page = 1) { /* ... */ } function openCustomValueModal(type, title) { /* ... */ } function showInvitePopup(from, pin) { /* ... */ } function handlePresetClick(e, groupId) { /* ... */ } async function handleRemoveFriend(friendId) { /* ... */ }


    // --- Event Listeners hinzufügen ---
    // (Funktion addEventListeners wie im letzten Code-Block, mit try...catch)
     function addEventListeners() { try { console.log("[LOG] Adding all application event listeners..."); /* ... Alle Listener wie vorher ... */ console.log("[LOG] All event listeners added successfully."); } catch (error) { console.error("[ERROR] FATAL ERROR adding event listeners:", error); logToPage('error', ["[ERROR] FATAL ERROR adding event listeners:", error]); alert("FATAL ERROR adding event listeners: " + error.message); } }


    // --- Supabase Initialization (VOLLSTÄNDIG) ---
    // (Funktion initializeSupabase wie im letzten Code-Block, mit try...catch und Logs)
    async function initializeSupabase() { try { console.log("[Supabase] Starting Supabase initialization..."); /* ... */ supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { /* ... */ }); console.log("[Supabase] Client initialized successfully."); supabase.auth.onAuthStateChange(async (event, session) => { console.log(`[Supabase Auth] Event: ${event}`, session ? `User: ${session.user.id}` : 'No session'); if (event === 'SIGNED_OUT') { currentUser = null; console.log("[Auth] Signed out state detected."); showScreen('auth-screen'); document.body.classList.add('is-guest'); return; } if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) { if (!currentUser || currentUser.id !== session.user.id) { console.log("[Auth] Session detected, calling initializeApp..."); initializeApp(session.user, false); } } }); console.log("[Supabase] Getting initial session..."); const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession(); /* ... Session Handling ... */ console.log("[Supabase] Initialization sequence finished."); } catch (error) { console.error("[ERROR] FATAL Supabase init error:", error); logToPage('error', ["[ERROR] FATAL Supabase init error:", error]); alert("FATAL Supabase init error: " + error.message); document.body.innerHTML = `<div class="fatal-error"><h1>Init Fehler</h1><p>Supabase konnte nicht initialisiert werden. (${error.message})</p></div>`; } }


    // --- Main Execution ---
    console.log("[LOG] Adding event listeners immediately...");
    addEventListeners();
    console.log("[LOG] Starting Supabase initialization...");
    initializeSupabase();

}); // Ende DOMContentLoaded

console.log("Script file finished initial execution.");
