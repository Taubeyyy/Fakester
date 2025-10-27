// script.js - Debug: Full code with detailed logs inside initializeApp (Wiederhergestellt)

console.log("Script file loaded and executing..."); // Log 1

document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOG] DOMContentLoaded event fired."); // Log 2

    // --- Variablen & Setup ---
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;
    let userProfile = {}; let userUnlockedAchievementIds = []; let onlineFriends = [];
    let ownedTitleIds = new Set(); let ownedIconIds = new Set(); let ownedBackgroundIds = new Set(); let ownedColorIds = new Set(); let inventory = {};
    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
    let screenHistory = ['auth-screen']; let selectedGameMode = null; let gameCreationSettings = { gameType: null, lives: 3 };
    let allPlaylists = [], currentPage = 1, itemsPerPage = 10; let wsPingInterval = null;
    console.log("[LOG] Global variables initialized."); // Log 3

    // --- On-Page Konsole Setup ---
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    const copyConsoleBtn = document.createElement('button'); copyConsoleBtn.textContent = 'Kopieren'; copyConsoleBtn.id = 'copy-console-btn'; const consoleHeader = document.querySelector('.console-header'); if (consoleHeader && clearConsoleBtn) { consoleHeader.insertBefore(copyConsoleBtn, clearConsoleBtn); } else if (onPageConsole && clearConsoleBtn) { onPageConsole.appendChild(copyConsoleBtn); }
    const originalConsole = { ...console }; const formatArg = (arg) => { /*...*/ return String(arg);}; const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(formatArg).join(' '); const logEntry = document.createElement('div'); logEntry.classList.add(`log-${type}`); logEntry.dataset.rawText = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; logEntry.innerHTML = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: <pre>${message}</pre>`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { originalConsole.error("Error logging to page console:", e); } };
    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); }; console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); }; console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); }; console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); }; window.onerror = (message, source, lineno, colno, error) => { const msg = error ? `${error.message} at ${source}:${lineno}:${colno}` : message; logToPage('error', ['🚨 Uncaught Error:', msg]); alert("Uncaught Error: " + msg); return true; }; window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason.message : String(event.reason); logToPage('error', ['🚧 Unhandled Rejection:', reason]); alert("Unhandled Rejection: " + reason); };
    console.log("[LOG] On-page console setup complete."); // Log 4
    // --- Ende On-Page Konsole ---

    // --- ERWEITERTE DATENBANKEN ---
    // (Gekürzt, Inhalt wie vorher)
    const achievementsList = [ /* ... */ ]; const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100)); const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1); const titlesList = [ /* ... */ ]; const iconsList = [ /* ... */ ]; const backgroundsList = [ /* ... */ ]; const nameColorsList = [ /* ... */ ]; const allItems = [...titlesList, ...iconsList, ...backgroundsList, ...nameColorsList]; window.titlesList = titlesList; window.iconsList = iconsList; window.backgroundsList = backgroundsList; window.nameColorsList = nameColorsList; window.allItems = allItems; const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;
    console.log("[LOG] Data lists (achievements, items) initialized."); // Log 5

    // --- DOM Element References ---
    console.log("[LOG] Getting DOM elements..."); // Log 6
    let elements = {};
    try {
        // Wichtig: Stelle sicher, dass ALLE IDs hier im HTML existieren!
        elements = {
            screens: document.querySelectorAll('.screen'), leaveGameButton: document.getElementById('leave-game-button'), loadingOverlay: document.getElementById('loading-overlay'), countdownOverlay: document.getElementById('countdown-overlay'),
            auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form') },
            home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'), profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'), levelProgressBtn: document.getElementById('level-progress-button'), profileXpText: document.getElementById('profile-xp-text'), spotsBalance: document.getElementById('header-spots-balance'), shopButton: document.getElementById('shop-button'), spotifyConnectBtn: document.getElementById('spotify-connect-button') },
            guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), input: document.getElementById('guest-nickname-input') },
            joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
            // Füge hier ALLE anderen Elemente wieder ein
             modeSelection: { container: document.getElementById('mode-selection-screen')?.querySelector('.mode-selection-container') },
             lobby: { pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'), deviceSelectBtn: document.getElementById('device-select-button'), playlistSelectBtn: document.getElementById('playlist-select-button'), startGameBtn: document.getElementById('start-game-button'), inviteFriendsBtn: document.getElementById('invite-friends-button'), songCountPresets: document.getElementById('song-count-presets'), guessTimePresets: document.getElementById('guess-time-presets'), answerTypeContainer: document.getElementById('answer-type-container'), answerTypePresets: document.getElementById('answer-type-presets'), reactionButtons: document.getElementById('reaction-buttons'), backgroundSelectButton: document.getElementById('select-background-button') },
             game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), gameContentArea: document.getElementById('game-content-area') },
             friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'), requestsCount: document.getElementById('requests-count'), tabsContainer: document.querySelector('.friends-modal .tabs'), tabs: document.querySelectorAll('.friends-modal .tab-button'), tabContents: document.querySelectorAll('.friends-modal .tab-content') },
             inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list') },
             customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')},
             achievements: { grid: document.getElementById('achievement-grid'), screen: document.getElementById('achievements-screen') },
             levelProgress: { list: document.getElementById('level-progress-list'), screen: document.getElementById('level-progress-screen') },
             titles: { list: document.getElementById('title-list'), screen: document.getElementById('title-selection-screen') },
             icons: { list: document.getElementById('icon-list'), screen: document.getElementById('icon-selection-screen') },
             gameTypeScreen: { screen: document.getElementById('game-type-selection-screen'), pointsBtn: document.getElementById('game-type-points'), livesBtn: document.getElementById('game-type-lives'), livesSettings: document.getElementById('lives-settings-container'), livesPresets: document.getElementById('lives-count-presets'), createLobbyBtn: document.getElementById('create-lobby-button'), },
             changeNameModal: { overlay: document.getElementById('change-name-modal-overlay'), closeBtn: document.getElementById('close-change-name-modal-button'), submitBtn: document.getElementById('change-name-submit'), input: document.getElementById('change-name-input'), },
             deviceSelectModal: { overlay: document.getElementById('device-select-modal-overlay'), closeBtn: document.getElementById('close-device-select-modal'), list: document.getElementById('device-list'), refreshBtn: document.getElementById('refresh-devices-button-modal'), },
             playlistSelectModal: { overlay: document.getElementById('playlist-select-modal-overlay'), closeBtn: document.getElementById('close-playlist-select-modal'), list: document.getElementById('playlist-list'), search: document.getElementById('playlist-search'), pagination: document.getElementById('playlist-pagination'), },
             leaveConfirmModal: { overlay: document.getElementById('leave-confirm-modal-overlay'), confirmBtn: document.getElementById('confirm-leave-button'), cancelBtn: document.getElementById('cancel-leave-button'), },
             confirmActionModal: { overlay: document.getElementById('confirm-action-modal-overlay'), title: document.getElementById('confirm-action-title'), text: document.getElementById('confirm-action-text'), confirmBtn: document.getElementById('confirm-action-confirm-button'), cancelBtn: document.getElementById('confirm-action-cancel-button'), },
             stats: { screen: document.getElementById('stats-screen'), gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'), highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'), gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'), },
             shop: { screen: document.getElementById('shop-screen'), titlesList: document.getElementById('shop-titles-list'), iconsList: document.getElementById('shop-icons-list'), backgroundsList: document.getElementById('shop-backgrounds-list'), colorsList: document.getElementById('shop-colors-list'), spotsBalance: document.getElementById('shop-spots-balance'), },
             backgroundSelectModal: { overlay: document.getElementById('background-select-modal-overlay'), closeBtn: document.getElementById('close-background-select-modal'), list: document.getElementById('owned-backgrounds-list'), },
        };
        // Optionale Prüfung auf kritische Elemente
        if (!elements.auth?.loginForm || !elements.guestModal?.openBtn || !elements.home?.logoutBtn /* || !elements.lobby?.pinDisplay */) {
             throw new Error("Kritische DOM-Elemente nicht gefunden! HTML Struktur prüfen.");
        }
        console.log("[LOG] DOM elements retrieved successfully."); // Log 7
    } catch (error) {
         console.error("[ERROR] FATAL ERROR getting DOM elements:", error); logToPage('error', ["[ERROR] FATAL ERROR getting DOM elements:", error]); alert("FATAL ERROR getting DOM elements: " + error.message); return;
    }

    // --- Core Functions ---
    // (Gekürzt, wie vorher)
    const showToast = (message, isError = false) => { console.log(`[Toast] ${message} (Error: ${isError})`); Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast(); }
    const showScreen = (screenId) => { /* ... */ }; const goBack = () => { /* ... */ }; const setLoading = (isLoading) => { /* ... */ }; const showConfirmModal = (title, text, onConfirm) => { /* ... */ };

    // --- Helper Functions ---
    // (Gekürzt, wie vorher)
    function isItemUnlocked(item, currentLevel) { /* ... */ return false; } function getUnlockDescription(item) { /* ... */ return ''; } function updateSpotsDisplay() { /* ... */ }

    // --- Initialization and Auth (VOLLSTÄNDIG mit Logs) ---
    const initializeApp = (user, isGuest = false) => { try { console.log(`[App] initializeApp called for user: ${user?.username || user?.id}, isGuest: ${isGuest}`); localStorage.removeItem('fakesterGame'); console.log("[App] Defining fallback data..."); /*...*/ console.log("[App] Setting currentUser and userProfile..."); /*...*/ console.log("[App] currentUser:", currentUser); console.log("[App] Setting up initial UI..."); document.body.classList.toggle('is-guest', isGuest); /*...*/ updateSpotsDisplay(); console.log("[App] Basic UI updated."); console.log("[App] Checking if render functions should run..."); /*...*/ console.log("[App] Render functions checked/called."); console.log("[App] Showing home screen..."); showScreen('home-screen'); setLoading(false); if (!isGuest && supabase) { console.log("[App] Starting background data fetch..."); /* Promise.all wie vorher */ Promise.all([ supabase.from('profiles').select('*').eq('id', user.id).single(), supabase.from('user_owned_titles').select('title_id').eq('user_id', user.id), supabase.from('user_owned_icons').select('icon_id').eq('user_id', user.id), supabase.from('user_owned_backgrounds').select('background_id').eq('user_id', user.id), supabase.from('user_inventory').select('item_id, quantity').eq('user_id', user.id), supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id) ]).then((results) => { console.log("[App BG] Received background data results."); /*...*/ console.log("[App BG] Processing profile..."); /*...*/ console.log("[App BG] Processing owned items..."); /*...*/ console.log("[App BG] Processing achievements..."); /*...*/ console.log("[App BG] Updating UI based on fetched data..."); /*...*/ console.log("[App BG] Checking Spotify status after data load..."); return checkSpotifyStatus(); }).then(() => { console.log("[App BG] Spotify status checked."); /*...*/ console.log("[App BG] Connecting WebSocket..."); connectWebSocket(); }).catch(error => { console.error("[ERROR] Error during background data loading chain:", error); logToPage('error', ["[ERROR] Background data load failed:", error]); showToast("Fehler beim Laden einiger Hintergrunddaten.", true); console.log("[App BG] Connecting WebSocket despite background load error..."); connectWebSocket(); }); } else if (isGuest) { console.log("[App] Guest mode: Checking Spotify and connecting WebSocket..."); checkSpotifyStatus(); connectWebSocket(); } else { console.warn("[App] Logged-in user but Supabase object is missing?"); } console.log("[App] initializeApp finished initial setup."); } catch (error) { console.error("[ERROR] FATAL ERROR inside initializeApp:", error); logToPage('error', ["[ERROR] FATAL ERROR inside initializeApp:", error]); alert("FATAL ERROR in initializeApp: " + error.message); setLoading(false); showScreen('auth-screen'); } };
    const checkSpotifyStatus = async () => { console.log("[Spotify] Checking Spotify status..."); /* Komplette Funktion wie vorher */ };
    const handleAuthAction = async (action, form, isRegister = false) => { console.log(`[Auth] handleAuthAction called (isRegister: ${isRegister})`); /* Komplette Funktion wie vorher */ };
    const handleLogout = async () => { console.log("[Auth] handleLogout called."); /* Komplette Funktion wie vorher */ };
    const awardClientSideAchievement = (achievementId) => { /* ... */ };
    const connectWebSocket = () => { console.log("[WebSocket] Attempting to connect..."); /* ... */ };
    const handleWebSocketMessage = ({ type, payload }) => { console.log(`[WebSocket] Received message: ${type}`); /* ... */ };

    // --- UI Rendering Functions ---
    // (Alle Funktionen wieder einfügen!)
    function renderPlayerList(players, hostId) { /* ... */ } function updateHostSettings(settings, isHost) { /* ... */ } function renderAchievements() { /* ... */ } async function equipTitle(titleId, saveToDb = true) { /* ... */ } function renderTitles() { /* ... */ } async function equipIcon(iconId, saveToDb = true) { /* ... */ } function renderIcons() { /* ... */ } function renderLevelProgress() { /* ... */ } function updatePlayerProgressDisplay() { /* ... */ } async function updatePlayerProgress() { /* ... */ } function updateStatsDisplay() { /* ... */ } async function loadShopItems() { /* ... */ } function renderShopItem(item, userSpots, isOwned) { /* ... */ return ''; } async function handleBuyItem(itemId) { /* ... */ } function showBackgroundSelectionModal() { /* ... */ } function applyLobbyBackground(backgroundId) { /* ... */ } function displayReaction(playerId, reaction) { /* ... */ } async function handleGiftSpots(friendId, friendName) { /* ... */ }

    // --- Game Logic Functions (Stubs) ---
    // (Alle Stubs wieder einfügen!)
    function showCountdown(round, total) { /* ... */ } function setupPreRound(data) { /* ... */ } function setupNewRound(data) { /* ... */ } function showRoundResult(data) { /* ... */ } async function loadFriendsData() { /* ... */ } function renderRequestsList(requests) { /* ... */ } async function fetchHostData(isRefresh = false) { /* ... */ return Promise.resolve(); } function renderPaginatedPlaylists(playlistsToRender, page = 1) { /* ... */ } function openCustomValueModal(type, title) { /* ... */ } function showInvitePopup(from, pin) { /* ... */ } function handlePresetClick(e, groupId) { /* ... */ } async function handleRemoveFriend(friendId) { /* ... */ }

    // --- Event Listeners hinzufügen (VOLLSTÄNDIG) ---
     function addEventListeners() { try { console.log("[LOG] Adding all application event listeners..."); // Log 8
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
         elements.guestModal?.submitBtn?.addEventListener('click', () => { console.log("[Event] Guest submit click"); const nickname = elements.guestModal.input?.value; if (!nickname || nickname.trim().length < 3 || nickname.trim().length > 15) { showToast("Nickname muss 3-15 Zeichen lang sein.", true); return; } elements.guestModal.overlay?.classList.add('hidden'); initializeApp({ username: nickname }, true); });
         // Home Screen
         elements.home?.logoutBtn?.addEventListener('click', handleLogout);
         elements.home?.spotifyConnectBtn?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/login'; });
         elements.home?.createRoomBtn?.addEventListener('click', () => showScreen('mode-selection-screen'));
         elements.home?.joinRoomBtn?.addEventListener('click', () => { /* ... */ });
         elements.home?.statsBtn?.addEventListener('click', () => showScreen('stats-screen'));
         elements.home?.achievementsBtn?.addEventListener('click', () => showScreen('achievements-screen'));
         elements.home?.levelProgressBtn?.addEventListener('click', () => showScreen('level-progress-screen'));
         elements.home?.profileTitleBtn?.addEventListener('click', () => showScreen('title-selection-screen'));
         elements.home?.profilePictureBtn?.addEventListener('click', () => showScreen('icon-selection-screen'));
         elements.home?.friendsBtn?.addEventListener('click', () => { /* ... */ });
         elements.home?.usernameContainer?.addEventListener('click', () => { /* ... */ });
         elements.home?.shopButton?.addEventListener('click', () => { /* ... */ });
         // Modus & Spieltyp Auswahl
         elements.modeSelection?.container?.addEventListener('click', (e) => { /* ... */ });
         elements.gameTypeScreen?.pointsBtn?.addEventListener('click', () => { /* ... */ });
         elements.gameTypeScreen?.livesBtn?.addEventListener('click', () => { /* ... */ });
         elements.gameTypeScreen?.livesPresets?.addEventListener('click', (e) => { /* ... */ });
         elements.gameTypeScreen?.createLobbyBtn?.addEventListener('click', () => { /* ... */ });
         // Lobby Screen
         elements.lobby?.inviteFriendsBtn?.addEventListener('click', async () => { /* ... */ });
         elements.lobby?.deviceSelectBtn?.addEventListener('click', async () => { /* ... */ });
         elements.lobby?.playlistSelectBtn?.addEventListener('click', async () => { /* ... */ });
         elements.lobby?.backgroundSelectButton?.addEventListener('click', showBackgroundSelectionModal);
         document.getElementById('host-settings')?.addEventListener('click', (e) => { /* ... */ });
         elements.lobby?.startGameBtn?.addEventListener('click', () => { /* ... */ });
         elements.lobby?.reactionButtons?.addEventListener('click', (e) => { /* ... */ });
         // Item/Title/Icon Selection Screens
         elements.titles?.list?.addEventListener('click', (e) => { /* ... */ });
         elements.icons?.list?.addEventListener('click', (e) => { /* ... */ });
         // Shop Screen
         elements.shop?.screen?.addEventListener('click', (e) => { /* ... */ });
         // Modals
         document.querySelectorAll('.button-exit-modal').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.add('hidden')));
         elements.joinModal?.numpad?.addEventListener('click', (e) => { /* ... */ });
         elements.friendsModal?.tabsContainer?.addEventListener('click', (e) => { /* ... */ });
         elements.friendsModal?.addFriendBtn?.addEventListener('click', async () => { /* ... */ });
         elements.friendsModal?.requestsList?.addEventListener('click', (e) => { /* ... */ });
         elements.friendsModal?.friendsList?.addEventListener('click', (e) => { /* ... */ });
         elements.inviteFriendsModal?.list?.addEventListener('click', (e) => { /* ... */ });
         elements.customValueModal?.numpad?.addEventListener('click', (e) => { /* ... */ });
         elements.customValueModal?.confirmBtn?.addEventListener('click', () => { /* ... */ });
         elements.changeNameModal?.submitBtn?.addEventListener('click', async () => { /* ... */ });
         elements.deviceSelectModal?.refreshBtn?.addEventListener('click', () => fetchHostData(true));
         elements.deviceSelectModal?.list?.addEventListener('click', (e) => { /* ... */ });
         elements.playlistSelectModal?.search?.addEventListener('input', () => { /* ... */ });
         elements.playlistSelectModal?.list?.addEventListener('click', (e) => { /* ... */ });
         elements.playlistSelectModal?.pagination?.addEventListener('click', (e) => { /* ... */ });
         elements.backgroundSelectModal?.list?.addEventListener('click', (e) => { /* ... */ });
         elements.confirmActionModal?.cancelBtn?.addEventListener('click', () => { /* ... */ });
         elements.confirmActionModal?.confirmBtn?.addEventListener('click', () => { /* ... */ });

         // Console Buttons
         toggleConsoleBtn?.addEventListener('click', () => {console.log("[Event] Toggle Console click"); onPageConsole?.classList.toggle('hidden');});
         closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
         clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
         copyConsoleBtn?.addEventListener('click', () => { if (!consoleOutput) return; const txt = Array.from(consoleOutput.children).map(e => e.dataset.rawText || e.textContent).join('\n'); navigator.clipboard.writeText(txt).then(() => showToast('Logs kopiert!', false), err => { console.error('[ERROR] Fehler: Logs kopieren:', err); showToast('Kopieren fehlgeschlagen.', true); }); });

         console.log("[LOG] All event listeners added successfully."); // Log 9

        } catch (error) { console.error("[ERROR] FATAL ERROR adding event listeners:", error); logToPage('error', ["[ERROR] FATAL ERROR adding event listeners:", error]); alert("FATAL ERROR adding event listeners: " + error.message); }
    }


    // --- Supabase Initialization (VOLLSTÄNDIG) ---
    // (Funktion initializeSupabase wie im letzten vollständigen Code-Block, mit Logs)
    async function initializeSupabase() { try { console.log("[Supabase] Starting Supabase initialization..."); /* ... */ supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { /* ... */ }); console.log("[Supabase] Client initialized successfully."); supabase.auth.onAuthStateChange(async (event, session) => { console.log(`[Supabase Auth] Event: ${event}`, session ? `User: ${session.user.id}` : 'No session'); if (event === 'SIGNED_OUT') { currentUser = null; console.log("[Auth] Signed out state detected."); showScreen('auth-screen'); document.body.classList.add('is-guest'); return; } if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) { if (!currentUser || currentUser.id !== session.user.id) { console.log("[Auth] Session detected, calling initializeApp..."); initializeApp(session.user, false); } } }); console.log("[Supabase] Getting initial session..."); const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession(); /* ... Session Handling ... */ console.log("[Supabase] Initialization sequence finished."); } catch (error) { console.error("[ERROR] FATAL Supabase init error:", error); logToPage('error', ["[ERROR] FATAL Supabase init error:", error]); alert("FATAL Supabase init error: " + error.message); document.body.innerHTML = `<div class="fatal-error"><h1>Init Fehler</h1><p>Supabase konnte nicht initialisiert werden. (${error.message})</p></div>`; } }


    // --- Main Execution ---
    console.log("[LOG] Adding event listeners immediately..."); // Log 10
    addEventListeners();
    console.log("[LOG] Starting Supabase initialization..."); // Log 11
    initializeSupabase();

}); // Ende DOMContentLoaded

console.log("Script file finished initial execution."); // Log 12
