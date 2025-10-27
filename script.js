// script.js - FINAL VERSION (With DETAILED logging)

console.log("Script file loaded and executing..."); // Frühester Log

document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOG] DOMContentLoaded event fired."); // Wichtig: Kommt das?

    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;

    // Globale Speicher für DB-Daten (Initialisierung)
    console.log("[LOG] Initializing global variables...");
    let userProfile = {};
    let userUnlockedAchievementIds = [];
    let onlineFriends = [];
    let ownedTitleIds = new Set();
    let ownedIconIds = new Set();
    let ownedBackgroundIds = new Set();
    let ownedColorIds = new Set();
    let inventory = {};
    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
    let screenHistory = ['auth-screen'];
    let selectedGameMode = null;
    let gameCreationSettings = { gameType: null, lives: 3 };
    let allPlaylists = [], currentPage = 1, itemsPerPage = 10;
    let wsPingInterval = null;
    console.log("[LOG] Global variables initialized.");

    // --- On-Page Konsole Setup ---
    // (Gekürzt, Funktionalität wie vorher)
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    const copyConsoleBtn = document.createElement('button'); copyConsoleBtn.textContent = 'Kopieren'; copyConsoleBtn.id = 'copy-console-btn'; const consoleHeader = document.querySelector('.console-header'); if (consoleHeader && clearConsoleBtn) { consoleHeader.insertBefore(copyConsoleBtn, clearConsoleBtn); } else if (onPageConsole && clearConsoleBtn) { onPageConsole.appendChild(copyConsoleBtn); }
    const originalConsole = { ...console }; const formatArg = (arg) => { /* ... */ return String(arg);}; const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(formatArg).join(' '); const logEntry = document.createElement('div'); logEntry.classList.add(`log-${type}`); logEntry.dataset.rawText = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; logEntry.innerHTML = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: <pre>${message}</pre>`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { originalConsole.error("Error logging to page console:", e); } };
    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); }; console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); }; console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); }; console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); }; window.onerror = (message, source, lineno, colno, error) => { const errorArgs = error ? [error] : [message, `at ${source}:${lineno}:${colno}`]; originalConsole.error('Uncaught Error:', ...errorArgs); logToPage('error', ['🚨 Uncaught Error:', ...errorArgs]); return true; }; window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason)); originalConsole.error('Unhandled Promise Rejection:', reason); logToPage('error', ['🚧 Unhandled Promise Rejection:', reason]); };
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
        // Hole alle Elemente. Ein Fehler hier ist oft der Grund, warum nichts geht.
        elements = {
            screens: document.querySelectorAll('.screen'), // Grundlegend
            leaveGameButton: document.getElementById('leave-game-button'), // Grundlegend
            loadingOverlay: document.getElementById('loading-overlay'), // Grundlegend
            countdownOverlay: document.getElementById('countdown-overlay'), // Grundlegend
            auth: { // Auth Screen
                loginForm: document.getElementById('login-form'),
                registerForm: document.getElementById('register-form'),
                showRegister: document.getElementById('show-register-form'),
                showLogin: document.getElementById('show-login-form')
            },
            home: { // Home Screen
                 logoutBtn: document.getElementById('corner-logout-button'),
                 achievementsBtn: document.getElementById('achievements-button'),
                 createRoomBtn: document.getElementById('show-create-button-action'),
                 joinRoomBtn: document.getElementById('show-join-button'),
                 usernameContainer: document.getElementById('username-container'),
                 profileTitleBtn: document.querySelector('.profile-title-button'),
                 friendsBtn: document.getElementById('friends-button'),
                 statsBtn: document.getElementById('stats-button'),
                 profilePictureBtn: document.getElementById('profile-picture-button'),
                 profileIcon: document.getElementById('profile-icon'),
                 profileLevel: document.getElementById('profile-level'),
                 profileXpFill: document.getElementById('profile-xp-fill'),
                 levelProgressBtn: document.getElementById('level-progress-button'),
                 profileXpText: document.getElementById('profile-xp-text'),
                 spotsBalance: document.getElementById('header-spots-balance'),
                 shopButton: document.getElementById('shop-button'),
                 spotifyConnectBtn: document.getElementById('spotify-connect-button')
            },
             guestModal: { // Gast Modal
                 overlay: document.getElementById('guest-modal-overlay'),
                 closeBtn: document.getElementById('close-guest-modal-button'),
                 submitBtn: document.getElementById('guest-nickname-submit'),
                 openBtn: document.getElementById('guest-mode-button'),
                 input: document.getElementById('guest-nickname-input')
            },
             joinModal: { // Join Modal
                 overlay: document.getElementById('join-modal-overlay'),
                 closeBtn: document.getElementById('close-join-modal-button'),
                 pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'),
                 numpad: document.querySelector('#numpad-join')
            },
             // Füge hier ALLE anderen Element-Referenzen ein, die du brauchst
             // ... (lobby, game, friendsModal, etc.) ...
             // Stelle sicher, dass ALLE IDs im HTML existieren!
             // Beispiel für fehlendes Element-Check (optional, aber gut):
             lobby: { pinDisplay: document.getElementById('lobby-pin') /* ... restliche lobby elemente ... */ },
             // ... weitere Elemente ...
              shop: { screen: document.getElementById('shop-screen'), titlesList: document.getElementById('shop-titles-list'), iconsList: document.getElementById('shop-icons-list'), backgroundsList: document.getElementById('shop-backgrounds-list'), colorsList: document.getElementById('shop-colors-list'), spotsBalance: document.getElementById('shop-spots-balance'), },
             confirmActionModal: { overlay: document.getElementById('confirm-action-modal-overlay'), title: document.getElementById('confirm-action-title'), text: document.getElementById('confirm-action-text'), confirmBtn: document.getElementById('confirm-action-confirm-button'), cancelBtn: document.getElementById('confirm-action-cancel-button') },
             leaveConfirmModal: { overlay: document.getElementById('leave-confirm-modal-overlay'), confirmBtn: document.getElementById('confirm-leave-button'), cancelBtn: document.getElementById('cancel-leave-button') },

        };
        // Überprüfe, ob kritische Elemente gefunden wurden
        if (!elements.auth?.loginForm || !elements.guestModal?.openBtn || !elements.home?.logoutBtn) {
             throw new Error("Kritische DOM-Elemente nicht gefunden! HTML Struktur prüfen.");
        }
        console.log("[LOG] DOM elements retrieved successfully.");
    } catch (error) {
         console.error("[ERROR] FATAL ERROR getting DOM elements:", error);
         logToPage('error', ["[ERROR] FATAL ERROR getting DOM elements:", error]);
         // Zeige Fehler direkt an, da die Konsole evtl. noch nicht geht
         alert("FATAL ERROR getting DOM elements: " + error.message + "\nCheck HTML IDs!");
         return; // Stoppe die Ausführung hier!
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
    // (Gekürzt, Inhalt wie vorher, aber mit Logs)
    const initializeApp = (user, isGuest = false) => { console.log(`[App] initializeApp called for user: ${user?.username || user?.id}, isGuest: ${isGuest}`); /* ... restliche Logik ... */ connectWebSocket(); };
    const checkSpotifyStatus = async () => { console.log("[Spotify] Checking Spotify status..."); /* ... restliche Logik ... */ };
    const handleAuthAction = async (action, form, isRegister = false) => { console.log(`[Auth] handleAuthAction called (isRegister: ${isRegister})`); if (!supabase) { showToast("Verbindung wird aufgebaut...", true); return; } setLoading(true); /* ... restliche Logik ... */ setLoading(false); };
    const handleLogout = async () => { console.log("[Auth] handleLogout called."); /* ... restliche Logik ... */ };
    const awardClientSideAchievement = (achievementId) => { /* ... */ };
    const connectWebSocket = () => { console.log("[WebSocket] Attempting to connect..."); /* ... restliche Logik ... */ };
    const handleWebSocketMessage = ({ type, payload }) => { console.log(`[WebSocket] Received message: ${type}`); /* ... restliche Logik ... */ };

    // --- UI Rendering Functions ---
    // (Gekürzt, Inhalt wie vorher)
    function renderPlayerList(players, hostId) { /* ... */ } function updateHostSettings(settings, isHost) { /* ... */ } function renderAchievements() { /* ... */ } async function equipTitle(titleId, saveToDb = true) { /* ... */ } function renderTitles() { /* ... */ } async function equipIcon(iconId, saveToDb = true) { /* ... */ } function renderIcons() { /* ... */ } function renderLevelProgress() { /* ... */ } function updatePlayerProgressDisplay() { /* ... */ } async function updatePlayerProgress() { /* ... */ } function updateStatsDisplay() { /* ... */ } async function loadShopItems() { /* ... */ } function renderShopItem(item, userSpots, isOwned) { /* ... */ return ''; } async function handleBuyItem(itemId) { /* ... */ } function showBackgroundSelectionModal() { /* ... */ } function applyLobbyBackground(backgroundId) { /* ... */ } function displayReaction(playerId, reaction) { /* ... */ } async function handleGiftSpots(friendId, friendName) { /* ... */ }

    // --- Game Logic Functions (Stubs) ---
    // (Gekürzt, Inhalt wie vorher)
    function showCountdown(round, total) { /* ... */ } function setupPreRound(data) { /* ... */ } function setupNewRound(data) { /* ... */ } function showRoundResult(data) { /* ... */ } async function loadFriendsData() { /* ... */ } function renderRequestsList(requests) { /* ... */ } async function fetchHostData(isRefresh = false) { /* ... */ return Promise.resolve(); } function renderPaginatedPlaylists(playlistsToRender, page = 1) { /* ... */ } function openCustomValueModal(type, title) { /* ... */ } function showInvitePopup(from, pin) { /* ... */ } function handlePresetClick(e, groupId) { /* ... */ } async function handleRemoveFriend(friendId) { /* ... */ }

    // --- Event Listeners (FINAL) ---
    function addEventListeners() {
        try {
            console.log("[LOG] Adding all application event listeners..."); // Wichtig

            // Navigation & Allgemein
            elements.leaveGameButton?.addEventListener('click', goBack);
            elements.leaveConfirmModal?.cancelBtn?.addEventListener('click', () => elements.leaveConfirmModal.overlay?.classList.add('hidden'));
            elements.leaveConfirmModal?.confirmBtn?.addEventListener('click', () => { /* ... */ });

            // Auth Screen
            elements.auth?.loginForm?.addEventListener('submit', (e) => { console.log("[Event] Login form submit"); e.preventDefault(); handleAuthAction(supabase?.auth?.signInWithPassword.bind(supabase.auth), e.target, false); });
            elements.auth?.registerForm?.addEventListener('submit', (e) => { console.log("[Event] Register form submit"); e.preventDefault(); handleAuthAction(supabase?.auth?.signUp.bind(supabase.auth), e.target, true); });
            elements.auth?.showRegister?.addEventListener('click', (e) => { console.log("[Event] Show Register click"); e.preventDefault(); elements.auth?.loginForm?.classList.add('hidden'); elements.auth?.registerForm?.classList.remove('hidden'); });
            elements.auth?.showLogin?.addEventListener('click', (e) => { console.log("[Event] Show Login click"); e.preventDefault(); elements.auth?.loginForm?.classList.remove('hidden'); elements.auth?.registerForm?.classList.add('hidden'); });

            // Gast Modal
            elements.guestModal?.openBtn?.addEventListener('click', () => { console.log("[Event] Guest button click"); elements.guestModal.overlay?.classList.remove('hidden'); elements.guestModal.input?.focus(); });
            elements.guestModal?.closeBtn?.addEventListener('click', () => elements.guestModal.overlay?.classList.add('hidden'));
            elements.guestModal?.submitBtn?.addEventListener('click', () => { console.log("[Event] Guest submit click"); /* ... */ initializeApp({ username: nickname }, true); });

            // Home Screen
            elements.home?.logoutBtn?.addEventListener('click', handleLogout);
            // ... (Rest der Home Screen Listener) ...

            // Console Buttons (Direkt hier hinzufügen)
            const internalToggleConsoleBtn = document.getElementById('toggle-console-btn');
            const internalOnPageConsole = document.getElementById('on-page-console');
            internalToggleConsoleBtn?.addEventListener('click', () => {
                console.log("[Event] Toggle Console click");
                internalOnPageConsole?.classList.toggle('hidden');
             });
             // Füge hier auch Listener für close, clear, copy hinzu, falls die Buttons existieren
             document.getElementById('close-console-btn')?.addEventListener('click', () => internalOnPageConsole?.classList.add('hidden'));
             document.getElementById('clear-console-btn')?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
             document.getElementById('copy-console-btn')?.addEventListener('click', () => { /* ... copy logic ... */ });


             // Füge hier ALLE anderen Listener hinzu (Lobby, Modals etc.)
             // ...


            console.log("[LOG] All event listeners added successfully."); // Wichtig: Kommt das?

        } catch (error) {
            console.error("[ERROR] FATAL ERROR adding event listeners:", error);
            logToPage('error', ["[ERROR] FATAL ERROR adding event listeners:", error]);
            alert("FATAL ERROR adding event listeners: " + error.message); // Zeige Fehler im Alert
        }
    }

    // --- Supabase Initialization (FINAL) ---
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

            supabase.auth.onAuthStateChange(async (event, session) => { console.log(`[Supabase Auth] Event: ${event}`, session ? `User: ${session.user.id}` : 'No session'); /* ... restliche Logik ... */ });

            console.log("[Supabase] Getting initial session...");
            const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
            // ... (Restliche Logik für Session Handling) ...
            if (sessionError) { console.error("[Supabase] Error getting initial session:", sessionError); /*...*/ }
            else if (!initialSession) { console.log("[Supabase] Initial: No session found."); /*...*/ }
            else { console.log("[Supabase] Initial session found, onAuthStateChange will handle init."); }


        } catch (error) {
            console.error("[ERROR] FATAL Supabase init error:", error);
            logToPage('error', ["[ERROR] FATAL Supabase init error:", error]);
            alert("FATAL Supabase init error: " + error.message); // Zeige Fehler im Alert
            document.body.innerHTML = `<div class="fatal-error"><h1>Init Fehler</h1><p>App konnte nicht laden. (${error.message}) Bitte prüfe die Serververbindung und Konfiguration.</p></div>`;
            setLoading(false);
        }
    }

    // --- Main Execution ---
    console.log("[LOG] Adding event listeners immediately...");
    addEventListeners(); // SOFORT ausführen
    console.log("[LOG] Starting Supabase initialization...");
    initializeSupabase(); // Parallel starten

}); // Ende DOMContentLoaded

console.log("Script file finished initial execution."); // Letzter Log in der Datei
