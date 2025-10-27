// script.js - FINAL VERSION (With extra logging for debugging)

console.log("Script file loaded and executing..."); // Frühester Log

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired."); // Wichtig: Kommt das?

    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;

    // Globale Speicher für DB-Daten
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
    let gameCreationSettings = {
        gameType: null,
        lives: 3
    };

    let allPlaylists = [], currentPage = 1, itemsPerPage = 10;
    let wsPingInterval = null;

    // --- On-Page Konsole Setup ---
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    const copyConsoleBtn = document.createElement('button');
    copyConsoleBtn.textContent = 'Kopieren';
    copyConsoleBtn.id = 'copy-console-btn';
    const consoleHeader = document.querySelector('.console-header');
    if (consoleHeader && clearConsoleBtn) {
        consoleHeader.insertBefore(copyConsoleBtn, clearConsoleBtn);
    } else if (onPageConsole && clearConsoleBtn) {
         onPageConsole.appendChild(copyConsoleBtn);
    }

    const originalConsole = { ...console };
    const formatArg = (arg) => { if (arg instanceof Error) { return `❌ Error: ${arg.message}\nStack:\n${arg.stack || 'No stack trace available'}`; } if (typeof arg === 'object' && arg !== null) { try { return JSON.stringify(arg, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2); } catch (e) { return '[Object (circular structure or stringify failed)]'; } } return String(arg); };
    const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(formatArg).join(' '); const logEntry = document.createElement('div'); logEntry.classList.add(`log-${type}`); logEntry.dataset.rawText = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; logEntry.innerHTML = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: <pre>${message}</pre>`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { originalConsole.error("Error logging to page console:", e); } };
    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); };
    console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); };
    console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); };
    console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); };
    window.onerror = (message, source, lineno, colno, error) => { const errorArgs = error ? [error] : [message, `at ${source}:${lineno}:${colno}`]; originalConsole.error('Uncaught Error:', ...errorArgs); logToPage('error', ['🚨 Uncaught Error:', ...errorArgs]); return true; };
    window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason)); originalConsole.error('Unhandled Promise Rejection:', reason); logToPage('error', ['🚧 Unhandled Promise Rejection:', reason]); };
    // --- Ende On-Page Konsole ---

    // --- ERWEITERTE DATENBANKEN ---
    // (Gekürzt, Inhalt wie vorher)
    const achievementsList = [ { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' }, { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig (gesamt).' }, { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' }, { id: 4, name: 'Historiker', description: 'Gewinne eine Timeline-Runde.' }, { id: 5, name: 'Trendsetter', description: 'Gewinne eine Fame-Runde.' }, { id: 6, name: 'Musik-Lexikon', description: 'Beantworte 500 Fragen richtig (gesamt).' }, { id: 7, name: 'Unbesiegbar', description: 'Gewinne 5 Spiele in Folge.' }, { id: 8, name: 'Jahrhundert-Genie', description: 'Errate das Jahr 25 Mal exakt (gesamt).' }, { id: 9, name: 'Spotify-Junkie', description: 'Verbinde dein Spotify-Konto.' }, { id: 10, name: 'Gastgeber', description: 'Hoste dein erstes Spiel.' }, { id: 11, name: 'Party-Löwe', description: 'Spiele mit 3+ Freunden (in einer Lobby).' }, { id: 12, name: 'Knapp Daneben', description: 'Antworte 5 Mal falsch in einem Spiel.' }, { id: 13, name: 'Präzisionsarbeit', description: 'Errate Titel, Künstler UND Jahr exakt in einer Runde (Quiz).'}, { id: 14, name: 'Sozial Vernetzt', description: 'Füge deinen ersten Freund hinzu.' }, { id: 15, name: 'Sammler', description: 'Schalte 5 Titel frei.' }, { id: 16, name: 'Icon-Liebhaber', description: 'Schalte 5 Icons frei.' }, { id: 17, name: 'Aufwärmrunde', description: 'Spiele 3 Spiele.' }, { id: 18, name: 'Highscorer', description: 'Erreiche über 1000 Punkte in einem Spiel.' }, { id: 19, name: 'Perfektionist', description: 'Beantworte alle Fragen in einem Spiel richtig (min. 5 Runden).'}, { id: 20, name: 'Dabei sein ist alles', description: 'Verliere 3 Spiele.'} ];
    const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100));
    const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1);
    const titlesList = [ { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1, type:'title' }, { id: 2, name: 'Musik-Kenner', unlockType: 'achievement', unlockValue: 2, type:'title' }, { id: 3, name: 'Legende', unlockType: 'achievement', unlockValue: 3, type:'title' }, { id: 4, name: 'Zeitreisender', unlockType: 'achievement', unlockValue: 4, type:'title' }, { id: 5, name: 'Star-Experte', unlockType: 'achievement', unlockValue: 5, type:'title' }, { id: 6, name: 'Pechvogel', unlockType: 'achievement', unlockValue: 12, type:'title' }, { id: 7, name: 'Präzise', unlockType: 'achievement', unlockValue: 13, type:'title' }, { id: 8, name: 'Gesellig', unlockType: 'achievement', unlockValue: 14, type:'title' }, { id: 9, name: 'Sammler', unlockType: 'achievement', unlockValue: 15, type:'title' }, { id: 10, name: 'Kenner', unlockType: 'level', unlockValue: 5, type:'title' }, { id: 11, name: 'Experte', unlockType: 'level', unlockValue: 10, type:'title' }, { id: 12, name: 'Meister', unlockType: 'level', unlockValue: 15, type:'title' }, { id: 13, name: 'Virtuose', unlockType: 'level', unlockValue: 20, type:'title' }, { id: 14, name: 'Maestro', unlockType: 'level', unlockValue: 25, type:'title' }, { id: 15, name: 'Großmeister', unlockType: 'level', unlockValue: 30, type:'title' }, { id: 16, name: 'Orakel', unlockType: 'level', unlockValue: 40, type:'title' }, { id: 17, name: 'Musikgott', unlockType: 'level', unlockValue: 50, type:'title' }, { id: 18, name: 'Perfektionist', unlockType: 'achievement', unlockValue: 19, type:'title' }, { id: 19, name: 'Highscorer', unlockType: 'achievement', unlockValue: 18, type:'title' }, { id: 20, name: 'Dauerbrenner', unlockType: 'achievement', unlockValue: 17, type:'title' }, { id: 101, name: 'Musik-Guru', unlockType: 'spots', cost: 100, unlockValue: 100, description: 'Nur im Shop', type:'title' }, { id: 102, name: 'Playlist-Meister', unlockType: 'spots', cost: 150, unlockValue: 150, description: 'Nur im Shop', type:'title' }, { id: 99, name: 'Entwickler', iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Titel', type:'title' } ];
    const iconsList = [ { id: 1, iconClass: 'fa-user', unlockType: 'level', unlockValue: 1, description: 'Standard-Icon', type:'icon' }, { id: 2, iconClass: 'fa-music', unlockType: 'level', unlockValue: 5, description: 'Erreiche Level 5', type:'icon' }, { id: 3, iconClass: 'fa-star', unlockType: 'level', unlockValue: 10, description: 'Erreiche Level 10', type:'icon' }, { id: 4, iconClass: 'fa-trophy', unlockType: 'achievement', unlockValue: 3, description: 'Erfolg: Seriensieger', type:'icon' }, { id: 5, iconClass: 'fa-crown', unlockType: 'level', unlockValue: 20, description: 'Erreiche Level 20', type:'icon' }, { id: 6, iconClass: 'fa-headphones', unlockType: 'achievement', unlockValue: 2, description: 'Erfolg: Besserwisser', type:'icon' }, { id: 7, iconClass: 'fa-guitar', unlockType: 'level', unlockValue: 15, description: 'Erreiche Level 15', type:'icon' }, { id: 8, iconClass: 'fa-bolt', unlockType: 'level', unlockValue: 25, description: 'Erreiche Level 25', type:'icon' }, { id: 9, iconClass: 'fa-record-vinyl', unlockType: 'level', unlockValue: 30, description: 'Erreiche Level 30', type:'icon' }, { id: 10, iconClass: 'fa-fire', unlockType: 'level', unlockValue: 40, description: 'Erreiche Level 40', type:'icon' }, { id: 11, iconClass: 'fa-ghost', unlockType: 'level', unlockValue: 45, description: 'Erreiche Level 45', type:'icon' }, { id: 12, iconClass: 'fa-meteor', unlockType: 'level', unlockValue: 50, description: 'Erreiche Level 50', type:'icon' }, { id: 13, iconClass: 'fa-icons', unlockType: 'achievement', unlockValue: 16, description: 'Erfolg: Icon-Liebhaber', type:'icon'}, { id: 201, name: 'Diamant', iconClass: 'fa-diamond', unlockType: 'spots', cost: 250, unlockValue: 250, description: 'Nur im Shop', type:'icon' }, { id: 202, name: 'Zauberhut', iconClass: 'fa-hat-wizard', unlockType: 'spots', cost: 300, unlockValue: 300, description: 'Nur im Shop', type:'icon' }, { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon', type:'icon' } ];
    const backgroundsList = [ { id: 'default', name: 'Standard', imageUrl: '', cost: 0, unlockType: 'free', type: 'background', backgroundId: 'default'}, { id: '301', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '301'}, { id: '302', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', unlockValue: 600, type: 'background', backgroundId: '302'}, ];
    const nameColorsList = [ { id: 501, name: 'Giftgrün', type: 'color', colorHex: '#00FF00', cost: 750, unlockType: 'spots', description: 'Ein knalliges Grün.' }, { id: 502, name: 'Leuchtend Pink', type: 'color', colorHex: '#FF00FF', cost: 750, unlockType: 'spots', description: 'Ein echter Hingucker.' }, { id: 503, name: 'Gold', type: 'color', colorHex: '#FFD700', cost: 1500, unlockType: 'spots', description: 'Zeig deinen Status.' } ];
    const allItems = [...titlesList, ...iconsList, ...backgroundsList, ...nameColorsList];
    window.titlesList = titlesList; window.iconsList = iconsList; window.backgroundsList = backgroundsList; window.nameColorsList = nameColorsList; window.allItems = allItems;
    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    // --- DOM Element References ---
    console.log("Getting DOM elements...");
    let elements = {};
    try {
         // Versuche, alle Elemente zu holen. Ein Fehler hier ist kritisch.
         elements = { screens: document.querySelectorAll('.screen'), leaveGameButton: document.getElementById('leave-game-button'), loadingOverlay: document.getElementById('loading-overlay'), countdownOverlay: document.getElementById('countdown-overlay'), auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form') }, home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'), profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'), levelProgressBtn: document.getElementById('level-progress-button'), profileXpText: document.getElementById('profile-xp-text'), spotsBalance: document.getElementById('header-spots-balance'), shopButton: document.getElementById('shop-button'), spotifyConnectBtn: document.getElementById('spotify-connect-button') }, modeSelection: { container: document.getElementById('mode-selection-screen')?.querySelector('.mode-selection-container') }, lobby: { pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'), deviceSelectBtn: document.getElementById('device-select-button'), playlistSelectBtn: document.getElementById('playlist-select-button'), startGameBtn: document.getElementById('start-game-button'), inviteFriendsBtn: document.getElementById('invite-friends-button'), songCountPresets: document.getElementById('song-count-presets'), guessTimePresets: document.getElementById('guess-time-presets'), answerTypeContainer: document.getElementById('answer-type-container'), answerTypePresets: document.getElementById('answer-type-presets'), reactionButtons: document.getElementById('reaction-buttons'), backgroundSelectButton: document.getElementById('select-background-button') }, game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), gameContentArea: document.getElementById('game-content-area') }, guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), input: document.getElementById('guest-nickname-input') }, joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), }, friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'), requestsCount: document.getElementById('requests-count'), tabsContainer: document.querySelector('.friends-modal .tabs'), tabs: document.querySelectorAll('.friends-modal .tab-button'), tabContents: document.querySelectorAll('.friends-modal .tab-content') }, inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list') }, customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')}, achievements: { grid: document.getElementById('achievement-grid'), screen: document.getElementById('achievements-screen') }, levelProgress: { list: document.getElementById('level-progress-list'), screen: document.getElementById('level-progress-screen') }, titles: { list: document.getElementById('title-list'), screen: document.getElementById('title-selection-screen') }, icons: { list: document.getElementById('icon-list'), screen: document.getElementById('icon-selection-screen') }, gameTypeScreen: { screen: document.getElementById('game-type-selection-screen'), pointsBtn: document.getElementById('game-type-points'), livesBtn: document.getElementById('game-type-lives'), livesSettings: document.getElementById('lives-settings-container'), livesPresets: document.getElementById('lives-count-presets'), createLobbyBtn: document.getElementById('create-lobby-button'), }, changeNameModal: { overlay: document.getElementById('change-name-modal-overlay'), closeBtn: document.getElementById('close-change-name-modal-button'), submitBtn: document.getElementById('change-name-submit'), input: document.getElementById('change-name-input'), }, deviceSelectModal: { overlay: document.getElementById('device-select-modal-overlay'), closeBtn: document.getElementById('close-device-select-modal'), list: document.getElementById('device-list'), refreshBtn: document.getElementById('refresh-devices-button-modal'), }, playlistSelectModal: { overlay: document.getElementById('playlist-select-modal-overlay'), closeBtn: document.getElementById('close-playlist-select-modal'), list: document.getElementById('playlist-list'), search: document.getElementById('playlist-search'), pagination: document.getElementById('playlist-pagination'), }, leaveConfirmModal: { overlay: document.getElementById('leave-confirm-modal-overlay'), confirmBtn: document.getElementById('confirm-leave-button'), cancelBtn: document.getElementById('cancel-leave-button'), }, confirmActionModal: { overlay: document.getElementById('confirm-action-modal-overlay'), title: document.getElementById('confirm-action-title'), text: document.getElementById('confirm-action-text'), confirmBtn: document.getElementById('confirm-action-confirm-button'), cancelBtn: document.getElementById('confirm-action-cancel-button'), }, stats: { screen: document.getElementById('stats-screen'), gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'), highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'), gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'), }, shop: { screen: document.getElementById('shop-screen'), titlesList: document.getElementById('shop-titles-list'), iconsList: document.getElementById('shop-icons-list'), backgroundsList: document.getElementById('shop-backgrounds-list'), colorsList: document.getElementById('shop-colors-list'), spotsBalance: document.getElementById('shop-spots-balance'), }, backgroundSelectModal: { overlay: document.getElementById('background-select-modal-overlay'), closeBtn: document.getElementById('close-background-select-modal'), list: document.getElementById('owned-backgrounds-list'), }, };
         console.log("DOM elements retrieved successfully.");
    } catch (error) {
         console.error("FATAL ERROR getting DOM elements:", error);
         logToPage('error', ["FATAL ERROR getting DOM elements:", error]);
         // Stoppe die weitere Ausführung, da Elemente fehlen könnten
         return; // Wichtig: Beendet die Funktion hier!
    }


    // --- Core Functions ---
    // (Gekürzt, Inhalt wie vorher)
    const showToast = (message, isError = false) => { console.log(`Toast: ${message} (Error: ${isError})`); Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast(); }
    const showScreen = (screenId) => { /* ... */ };
    const goBack = () => { /* ... */ };
    const setLoading = (isLoading) => { /* ... */ };
    const showConfirmModal = (title, text, onConfirm) => { /* ... */ };

    // --- Helper Functions ---
    // (Gekürzt, Inhalt wie vorher)
    function isItemUnlocked(item, currentLevel) { /* ... */ }
    function getUnlockDescription(item) { /* ... */ }
    function updateSpotsDisplay() { /* ... */ }

    // --- Initialization and Auth ---
    // (Gekürzt, Inhalt wie vorher)
    const initializeApp = (user, isGuest = false) => { /* ... */ };
    const checkSpotifyStatus = async () => { /* ... */ };
    const handleAuthAction = async (action, form, isRegister = false) => { /* ... */ };
    const handleLogout = async () => { /* ... */ };
    const awardClientSideAchievement = (achievementId) => { /* ... */ };
    const connectWebSocket = () => { /* ... */ };
    const handleWebSocketMessage = ({ type, payload }) => { /* ... */ };

    // --- UI Rendering Functions ---
    // (Gekürzt, Inhalt wie vorher)
    function renderPlayerList(players, hostId) { /* ... */ }
    function updateHostSettings(settings, isHost) { /* ... */ }
    function renderAchievements() { /* ... */ }
    async function equipTitle(titleId, saveToDb = true) { /* ... */ }
    function renderTitles() { /* ... */ }
    async function equipIcon(iconId, saveToDb = true) { /* ... */ }
    function renderIcons() { /* ... */ }
    function renderLevelProgress() { /* ... */ }
    function updatePlayerProgressDisplay() { /* ... */ }
    async function updatePlayerProgress() { /* ... */ }
    function updateStatsDisplay() { /* ... */ }
    async function loadShopItems() { /* ... */ }
    function renderShopItem(item, userSpots, isOwned) { /* ... */ }
    async function handleBuyItem(itemId) { /* ... */ }
    function showBackgroundSelectionModal() { /* ... */ }
    function applyLobbyBackground(backgroundId) { /* ... */ }
    function displayReaction(playerId, reaction) { /* ... */ }
    async function handleGiftSpots(friendId, friendName) { /* ... */ }

    // --- Game Logic Functions (Stubs) ---
    // (Gekürzt, Inhalt wie vorher)
    function showCountdown(round, total) { /* ... */ }
    function setupPreRound(data) { /* ... */ }
    function setupNewRound(data) { /* ... */ }
    function showRoundResult(data) { /* ... */ }
    async function loadFriendsData() { /* ... */ }
    function renderRequestsList(requests) { /* ... */ }
    async function fetchHostData(isRefresh = false) { /* ... */ }
    function renderPaginatedPlaylists(playlistsToRender, page = 1) { /* ... */ }
    function openCustomValueModal(type, title) { /* ... */ }
    function showInvitePopup(from, pin) { /* ... */ }
    function handlePresetClick(e, groupId) { /* ... */ }
    async function handleRemoveFriend(friendId) { /* ... */ }


    // --- Event Listeners (FINAL) ---
    function addEventListeners() {
        try {
            console.log("Adding all application event listeners...");

            // Navigation & Allgemein (Mit ?. Checks für Robustheit)
            elements.leaveGameButton?.addEventListener('click', goBack);
            elements.leaveConfirmModal?.cancelBtn?.addEventListener('click', () => elements.leaveConfirmModal.overlay?.classList.add('hidden'));
            elements.leaveConfirmModal?.confirmBtn?.addEventListener('click', () => { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type: 'leave-game', payload: { pin: currentGame.pin, playerId: currentGame.playerId } })); } localStorage.removeItem('fakesterGame'); currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] }; screenHistory = ['auth-screen', 'home-screen']; showScreen('home-screen'); elements.leaveConfirmModal.overlay?.classList.add('hidden'); });

            // Auth Screen (Mit ?. Checks)
            elements.auth?.loginForm?.addEventListener('submit', (e) => {
                console.log("Login form submit triggered");
                e.preventDefault();
                // handleAuthAction prüft intern auf supabase
                handleAuthAction(supabase?.auth?.signInWithPassword.bind(supabase.auth), e.target, false);
            });
            elements.auth?.registerForm?.addEventListener('submit', (e) => {
                console.log("Register form submit triggered");
                e.preventDefault();
                handleAuthAction(supabase?.auth?.signUp.bind(supabase.auth), e.target, true);
            });
            elements.auth?.showRegister?.addEventListener('click', (e) => {
                console.log("Show Register clicked");
                e.preventDefault();
                elements.auth?.loginForm?.classList.add('hidden');
                elements.auth?.registerForm?.classList.remove('hidden');
            });
            elements.auth?.showLogin?.addEventListener('click', (e) => {
                console.log("Show Login clicked");
                e.preventDefault();
                elements.auth?.loginForm?.classList.remove('hidden');
                elements.auth?.registerForm?.classList.add('hidden');
            });

            // Gast Modal (Mit ?. Checks)
            elements.guestModal?.openBtn?.addEventListener('click', () => {
                console.log("Guest button clicked");
                elements.guestModal.overlay?.classList.remove('hidden');
                elements.guestModal.input?.focus();
            });
            elements.guestModal?.closeBtn?.addEventListener('click', () => elements.guestModal.overlay?.classList.add('hidden'));
            elements.guestModal?.submitBtn?.addEventListener('click', () => {
                console.log("Guest submit clicked");
                const nickname = elements.guestModal.input?.value;
                if (!nickname || nickname.trim().length < 3 || nickname.trim().length > 15) {
                    showToast("Nickname muss 3-15 Zeichen lang sein.", true); return;
                }
                elements.guestModal.overlay?.classList.add('hidden');
                initializeApp({ username: nickname }, true);
            });

            // Home Screen (Mit ?. Checks)
            elements.home?.logoutBtn?.addEventListener('click', handleLogout);
            elements.home?.spotifyConnectBtn?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/login'; });
            elements.home?.createRoomBtn?.addEventListener('click', () => showScreen('mode-selection-screen'));
            elements.home?.joinRoomBtn?.addEventListener('click', () => { if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) { showToast("Verbindung zum Server wird aufgebaut...", true); return; } pinInput = ""; elements.joinModal?.pinDisplay?.forEach(d => d.textContent = ""); elements.joinModal?.overlay?.classList.remove('hidden'); });
            elements.home?.statsBtn?.addEventListener('click', () => showScreen('stats-screen'));
            elements.home?.achievementsBtn?.addEventListener('click', () => showScreen('achievements-screen'));
            elements.home?.levelProgressBtn?.addEventListener('click', () => showScreen('level-progress-screen'));
            elements.home?.profileTitleBtn?.addEventListener('click', () => showScreen('title-selection-screen'));
            elements.home?.profilePictureBtn?.addEventListener('click', () => showScreen('icon-selection-screen'));
            elements.home?.friendsBtn?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { loadFriendsData(); elements.friendsModal?.overlay?.classList.remove('hidden'); } });
            elements.home?.usernameContainer?.addEventListener('click', () => { if (!currentUser || currentUser.isGuest) return; elements.changeNameModal.input.value = currentUser.username; elements.changeNameModal?.overlay?.classList.remove('hidden'); elements.changeNameModal?.input?.focus(); });
            elements.home?.shopButton?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { loadShopItems(); showScreen('shop-screen'); } });

            // ... (Restliche Listener mit ?. Checks hinzugefügt für Robustheit) ...
            elements.modeSelection?.container?.addEventListener('click', (e) => { /* ... */ });
            elements.gameTypeScreen?.pointsBtn?.addEventListener('click', () => { /* ... */ });
            elements.gameTypeScreen?.livesBtn?.addEventListener('click', () => { /* ... */ });
            elements.gameTypeScreen?.livesPresets?.addEventListener('click', (e) => { /* ... */ });
            elements.gameTypeScreen?.createLobbyBtn?.addEventListener('click', () => { /* ... */ });
            elements.lobby?.inviteFriendsBtn?.addEventListener('click', async () => { /* ... */ });
            elements.lobby?.deviceSelectBtn?.addEventListener('click', async () => { /* ... */ });
            elements.lobby?.playlistSelectBtn?.addEventListener('click', async () => { /* ... */ });
            elements.lobby?.backgroundSelectButton?.addEventListener('click', showBackgroundSelectionModal);
            document.getElementById('host-settings')?.addEventListener('click', (e) => { /* ... */ });
            elements.lobby?.startGameBtn?.addEventListener('click', () => { /* ... */ });
            elements.lobby?.reactionButtons?.addEventListener('click', (e) => { /* ... */ });
            elements.titles?.list?.addEventListener('click', (e) => { /* ... */ });
            elements.icons?.list?.addEventListener('click', (e) => { /* ... */ });
            elements.shop?.screen?.addEventListener('click', (e) => { /* ... */ });
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

            // Console Buttons (mit ?. Checks)
            toggleConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.toggle('hidden'));
            closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
            clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
            copyConsoleBtn?.addEventListener('click', () => { /* ... */ });


            console.log("All event listeners added successfully."); // Wichtig: Kommt das?

        } catch (error) {
            // Fängt Fehler AB, die BEIM HINZUFÜGEN der Listener passieren
            console.error("FATAL ERROR adding event listeners:", error);
            logToPage('error', ["FATAL ERROR adding event listeners:", error]);
            document.body.innerHTML = `<div class="fatal-error"><h1>Fehler</h1><p>Ein unerwarteter Fehler ist beim Initialisieren aufgetreten. (${error.message}) Bitte lade die Seite neu.</p></div>`;
        }
    }

    // --- Supabase Initialization (FINAL) ---
    async function initializeSupabase() {
        try {
            console.log("Attempting to initialize Supabase...");
            console.log("Fetching /api/config...");
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error(`Config fetch failed: ${response.statusText} (Status: ${response.status})`);
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) { throw new Error("Supabase config missing or invalid."); }
            console.log("Supabase config received:", config);

            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { global: { fetch: (...args) => window.fetch(...args) }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
            console.log("Supabase client initialized successfully.");

            supabase.auth.onAuthStateChange(async (event, session) => { /* ... (Inhalt wie vorher) ... */ });

            console.log("Getting initial Supabase session...");
            const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.error("Error getting initial session:", sessionError);
                // Nicht unbedingt abbrechen, vielleicht geht Gastmodus
                showScreen('auth-screen');
                setLoading(false);
            } else if (!initialSession) {
                 if (!document.getElementById('auth-screen')?.classList.contains('active')) { console.log("Initial: No session, show auth."); showScreen('auth-screen'); }
                 else { console.log("Initial: No session, auth already active."); }
                 setLoading(false);
                 checkSpotifyStatus();
            } else {
                 console.log("Initial session found, onAuthStateChange will handle init.");
                 // onAuthStateChange wird getriggert und ruft initializeApp auf
            }

        } catch (error) {
            console.error("FATAL Supabase init error:", error);
            logToPage('error', ["FATAL Supabase init error:", error]); // Logge auch auf der Seite
            document.body.innerHTML = `<div class="fatal-error"><h1>Init Fehler</h1><p>App konnte nicht laden. (${error.message}) Bitte prüfe die Serververbindung und Konfiguration.</p></div>`;
            setLoading(false);
        }
    }

    // --- Main Execution ---
    console.log("Adding event listeners immediately...");
    addEventListeners(); // SOFORT ausführen
    console.log("Starting Supabase initialization...");
    initializeSupabase(); // Parallel starten

}); // Ende DOMContentLoaded
