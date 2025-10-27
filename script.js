// HINWEIS: Dies ist der VOLLSTÄNDIGE Code mit allen bisherigen Fixes
// PLUS den neuen Features für Spots und Shop (Grundlagen).

document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;

    // Globale Speicher für DB-Daten
    let userProfile = {};
    let userUnlockedAchievementIds = [];
    let onlineFriends = [];
    // NEU: Für gekaufte Items
    let ownedTitleIds = new Set();
    let ownedIconIds = new Set();
    let ownedBackgroundIds = new Set();
    let inventory = {}; // { itemId: quantity }

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
    document.querySelector('.console-header')?.insertBefore(copyConsoleBtn, clearConsoleBtn);
    const originalConsole = { ...console };
    const formatArg = (arg) => {
        if (arg instanceof Error) { return `❌ Error: ${arg.message}\nStack:\n${arg.stack || 'No stack trace available'}`; }
        if (typeof arg === 'object' && arg !== null) { try { return JSON.stringify(arg, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2); } catch (e) { return '[Object (circular structure or stringify failed)]'; } }
        return String(arg);
    };
    const logToPage = (type, args) => {
        if (!consoleOutput) return;
        try {
            const message = args.map(formatArg).join(' ');
            const logEntry = document.createElement('div');
            logEntry.classList.add(`log-${type}`);
            logEntry.dataset.rawText = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`;
            logEntry.innerHTML = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: <pre>${message}</pre>`;
            consoleOutput.appendChild(logEntry);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        } catch (e) { originalConsole.error("Error logging to page console:", e); }
    };
    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); };
    console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); };
    console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); };
    console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); };
    window.onerror = (message, source, lineno, colno, error) => { const errorArgs = error ? [error] : [message, `at ${source}:${lineno}:${colno}`]; originalConsole.error('Uncaught Error:', ...errorArgs); logToPage('error', ['🚨 Uncaught Error:', ...errorArgs]); return true; };
    window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason)); originalConsole.error('Unhandled Promise Rejection:', reason); logToPage('error', ['🚧 Unhandled Promise Rejection:', reason]); };
    // --- Ende On-Page Konsole ---


    // --- ERWEITERTE DATENBANKEN ---
    const achievementsList = [ { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' }, { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig (gesamt).' }, { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' }, { id: 4, name: 'Historiker', description: 'Gewinne eine Timeline-Runde.' }, { id: 5, name: 'Trendsetter', description: 'Gewinne eine Fame-Runde.' }, { id: 6, name: 'Musik-Lexikon', description: 'Beantworte 500 Fragen richtig (gesamt).' }, { id: 7, name: 'Unbesiegbar', description: 'Gewinne 5 Spiele in Folge.' }, { id: 8, name: 'Jahrhundert-Genie', description: 'Errate das Jahr 25 Mal exakt (gesamt).' }, { id: 9, name: 'Spotify-Junkie', description: 'Verbinde dein Spotify-Konto.' }, { id: 10, name: 'Gastgeber', description: 'Hoste dein erstes Spiel.' }, { id: 11, name: 'Party-Löwe', description: 'Spiele mit 3+ Freunden (in einer Lobby).' }, { id: 12, name: ' knapp daneben', description: 'Antworte 5 Mal falsch in einem Spiel.' }, { id: 13, name: 'Präzisionsarbeit', description: 'Errate Titel, Künstler UND Jahr exakt in einer Runde (Quiz).'}, { id: 14, name: 'Sozial vernetzt', description: 'Füge deinen ersten Freund hinzu.' }, { id: 15, name: 'Sammler', description: 'Schalte 5 Titel frei.' }, { id: 16, name: 'Icon-Liebhaber', description: 'Schalte 5 Icons frei.' }, { id: 17, name: 'Aufwärmrunde', description: 'Spiele 3 Spiele.' }, { id: 18, name: 'Highscorer', description: 'Erreiche über 1000 Punkte in einem Spiel.' }, { id: 19, name: 'Perfektionist', description: 'Beantworte alle Fragen in einem Spiel richtig (min. 5 Runden).'}, { id: 20, name: 'Dabei sein ist alles', description: 'Verliere 3 Spiele.'} ];
    const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100));
    const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1);

    // Füge Shop-Items zu Titeln/Icons hinzu oder erstelle neue Listen
    const titlesList = [
        { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1 },
        { id: 2, name: 'Musik-Kenner', unlockType: 'achievement', unlockValue: 2 },
        { id: 3, name: 'Legende', unlockType: 'achievement', unlockValue: 3 },
        { id: 4, name: 'Zeitreisender', unlockType: 'achievement', unlockValue: 4 },
        { id: 5, name: 'Star-Experte', unlockType: 'achievement', unlockValue: 5 },
        { id: 6, name: 'Pechvogel', unlockType: 'achievement', unlockValue: 12 },
        { id: 7, name: 'Präzise', unlockType: 'achievement', unlockValue: 13 },
        { id: 8, name: 'Gesellig', unlockType: 'achievement', unlockValue: 14 },
        { id: 9, name: 'Sammler', unlockType: 'achievement', unlockValue: 15 },
        { id: 10, name: 'Kenner', unlockType: 'level', unlockValue: 5 },
        { id: 11, name: 'Experte', unlockType: 'level', unlockValue: 10 },
        { id: 12, name: 'Meister', unlockType: 'level', unlockValue: 15 },
        { id: 13, name: 'Virtuose', unlockType: 'level', unlockValue: 20 },
        { id: 14, name: 'Maestro', unlockType: 'level', unlockValue: 25 },
        { id: 15, name: 'Großmeister', unlockType: 'level', unlockValue: 30 },
        { id: 16, name: 'Orakel', unlockType: 'level', unlockValue: 40 },
        { id: 17, name: 'Musikgott', unlockType: 'level', unlockValue: 50 },
        { id: 18, name: 'Perfektionist', unlockType: 'achievement', unlockValue: 19 },
        { id: 19, name: 'Highscorer', unlockType: 'achievement', unlockValue: 18 },
        { id: 20, name: 'Dauerbrenner', unlockType: 'achievement', unlockValue: 17 },
        // --- Shop Titel ---
        { id: 101, type: 'title', name: 'Musik-Guru', cost: 100, unlockType: 'spots', unlockValue: 100, description: 'Nur im Shop erhältlich' },
        { id: 102, type: 'title', name: 'Playlist-Meister', cost: 150, unlockType: 'spots', unlockValue: 150, description: 'Nur im Shop erhältlich' },
        // --- Spezial Titel ---
        { id: 99, name: 'Entwickler', type: 'title', iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Titel' }
    ];
    const iconsList = [
        { id: 1, iconClass: 'fa-user', unlockType: 'level', unlockValue: 1, description: 'Standard-Icon' },
        { id: 2, iconClass: 'fa-music', unlockType: 'level', unlockValue: 5, description: 'Erreiche Level 5' },
        { id: 3, iconClass: 'fa-star', unlockType: 'level', unlockValue: 10, description: 'Erreiche Level 10' },
        { id: 4, iconClass: 'fa-trophy', unlockType: 'achievement', unlockValue: 3, description: 'Erfolg: Seriensieger' },
        { id: 5, iconClass: 'fa-crown', unlockType: 'level', unlockValue: 20, description: 'Erreiche Level 20' },
        { id: 6, iconClass: 'fa-headphones', unlockType: 'achievement', unlockValue: 2, description: 'Erfolg: Besserwisser' },
        { id: 7, iconClass: 'fa-guitar', unlockType: 'level', unlockValue: 15, description: 'Erreiche Level 15' },
        { id: 8, iconClass: 'fa-bolt', unlockType: 'level', unlockValue: 25, description: 'Erreiche Level 25' },
        { id: 9, iconClass: 'fa-record-vinyl', unlockType: 'level', unlockValue: 30, description: 'Erreiche Level 30' },
        { id: 10, iconClass: 'fa-fire', unlockType: 'level', unlockValue: 40, description: 'Erreiche Level 40' },
        { id: 11, iconClass: 'fa-ghost', unlockType: 'level', unlockValue: 45, description: 'Erreiche Level 45' },
        { id: 12, iconClass: 'fa-meteor', unlockType: 'level', unlockValue: 50, description: 'Erreiche Level 50' },
        { id: 13, iconClass: 'fa-icons', unlockType: 'achievement', unlockValue: 16, description: 'Erfolg: Icon-Liebhaber'},
        // --- Shop Icons ---
        { id: 201, type: 'icon', iconClass: 'fa-diamond', cost: 250, unlockType: 'spots', unlockValue: 250, description: 'Nur im Shop erhältlich' },
        { id: 202, type: 'icon', iconClass: 'fa-hat-wizard', cost: 300, unlockType: 'spots', unlockValue: 300, description: 'Nur im Shop erhältlich' },
        // --- Spezial Icon ---
        { id: 99, type: 'icon', iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon' }
    ];
    // NEU: Liste der Hintergründe (Beispiel)
    const backgroundsList = [
        { id: 'default', name: 'Standard', imageUrl: '', cost: 0, unlockType: 'free', type: 'background'}, // Wichtig: Standard definieren
        { id: '301', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '301'},
        { id: '302', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', unlockValue: 600, type: 'background', backgroundId: '302'},
    ];
    // NEU: Liste der Consumables (Beispiel)
    const consumablesList = [
        { id: 401, name: 'Doppelte Punkte (1 Runde)', itemId: 'double_points_1r', cost: 50, unlockType: 'spots', unlockValue: 50, type: 'consumable', description: 'Verdoppelt deine Punkte in der nächsten Runde.' },
    ];


    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    // --- DOM Element References ---
    const elements = {
        screens: document.querySelectorAll('.screen'), leaveGameButton: document.getElementById('leave-game-button'), loadingOverlay: document.getElementById('loading-overlay'), countdownOverlay: document.getElementById('countdown-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form') },
        home: {
            logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'),
            usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'),
            profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'), profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'),
            levelProgressBtn: document.getElementById('level-progress-button'), profileXpText: document.getElementById('profile-xp-text'),
            spotsBalance: document.getElementById('spots-balance'), // Spots Anzeige
            shopButton: document.getElementById('shop-button')      // Shop Button
        },
        modeSelection: { container: document.getElementById('mode-selection-screen')?.querySelector('.mode-selection-container') },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelectBtn: document.getElementById('device-select-button'), playlistSelectBtn: document.getElementById('playlist-select-button'), startGameBtn: document.getElementById('start-game-button'), inviteFriendsBtn: document.getElementById('invite-friends-button'),
            songCountPresets: document.getElementById('song-count-presets'), guessTimePresets: document.getElementById('guess-time-presets'), answerTypeContainer: document.getElementById('answer-type-container'), answerTypePresets: document.getElementById('answer-type-presets'),
            reactionButtons: document.getElementById('reaction-buttons'), // Reaktionsbuttons
            backgroundSelectButton: document.getElementById('select-background-button') // Hintergrund Button
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), gameContentArea: document.getElementById('game-content-area') },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), input: document.getElementById('guest-nickname-input') },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
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
        shop: { // NEU
            screen: document.getElementById('shop-screen'),
            titlesList: document.getElementById('shop-titles-list'),
            iconsList: document.getElementById('shop-icons-list'),
            backgroundsList: document.getElementById('shop-backgrounds-list'),
            consumablesList: document.getElementById('shop-consumables-list'),
            spotsBalance: document.getElementById('shop-spots-balance'), // Spots im Shop
        },
        backgroundSelectModal: { // NEU
            overlay: document.getElementById('background-select-modal-overlay'),
            closeBtn: document.getElementById('close-background-select-modal'),
            list: document.getElementById('owned-backgrounds-list'),
        },
    };

    // --- Core Functions ---
    const showToast = (message, isError = false) => { console.log(`Toast: ${message} (Error: ${isError})`); Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast(); }
    const showScreen = (screenId) => { console.log(`Navigating to screen: ${screenId}`); const targetScreen = document.getElementById(screenId); if (!targetScreen) { console.error(`Screen with ID "${screenId}" not found!`); return; } const currentScreenId = screenHistory[screenHistory.length - 1]; if (screenId !== currentScreenId) screenHistory.push(screenId); elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const goBack = () => { if (screenHistory.length > 1) { const currentScreenId = screenHistory.pop(); const previousScreenId = screenHistory[screenHistory.length - 1]; console.log(`Navigating back to screen: ${previousScreenId}`); if (['game-screen', 'lobby-screen'].includes(currentScreenId)) { elements.leaveConfirmModal.overlay.classList.remove('hidden'); screenHistory.push(currentScreenId); return; } const targetScreen = document.getElementById(previousScreenId); if (!targetScreen) { console.error(`Back navigation failed: Screen "${previousScreenId}" not found!`); screenHistory = ['auth-screen']; window.location.reload(); return; } elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(previousScreenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); } };
    const setLoading = (isLoading) => { console.log(`Setting loading overlay: ${isLoading}`); elements.loadingOverlay.classList.toggle('hidden', !isLoading); }
    const showConfirmModal = (title, text, onConfirm) => { elements.confirmActionModal.title.textContent = title; elements.confirmActionModal.text.textContent = text; currentConfirmAction = onConfirm; elements.confirmActionModal.overlay.classList.remove('hidden'); };

    // --- Helper Functions ---
    function isItemUnlocked(item, currentLevel) {
        if (!item || !currentUser ) return false; // Gäste können nichts besitzen
        if (currentUser.username.toLowerCase() === 'taubey') return true;

        // Prüfe Besitz zuerst (für Shop-Items)
        if (item.unlockType === 'spots') {
             // Gäste können keine Shop-Items besitzen
             if (currentUser.isGuest) return false;
            if (item.type === 'title') return ownedTitleIds.has(item.id);
            if (item.type === 'icon') return ownedIconIds.has(item.id);
            if (item.type === 'background') return ownedBackgroundIds.has(item.id.toString());
            // Consumables werden über inventory geprüft, nicht hier direkt
        }

        // Standard-Freischaltbedingungen
        switch (item.unlockType) {
            case 'level': return currentLevel >= item.unlockValue;
            case 'achievement': return userUnlockedAchievementIds.includes(item.unlockValue);
            case 'special': return !currentUser.isGuest && currentUser.username.toLowerCase() === item.unlockValue.toLowerCase();
            case 'free': return true;
            default: return false;
        }
    }
    function getUnlockDescription(item) {
        if (!item) return '';
         if (item.unlockType === 'spots') return `Kosten: ${item.cost} Spots`; // Zeige Kosten statt Freischaltbedingung
        switch (item.unlockType) {
            case 'level': return `Erreiche Level ${item.unlockValue}`;
            case 'achievement': const ach = achievementsList.find(a => a.id === item.unlockValue); return `Erfolg: ${ach ? ach.name : 'Unbekannt'}`;
            case 'special': return 'Spezial';
            case 'free': return 'Standard';
            default: return '';
        }
    }

    // --- NEU: Spots Anzeige aktualisieren ---
    function updateSpotsDisplay() {
        const spots = userProfile?.spots ?? 0; // Sicherer Zugriff mit Fallback
        if (elements.home.spotsBalance) {
            elements.home.spotsBalance.textContent = spots;
        }
         if (elements.shop.spotsBalance) { // Auch im Shop aktualisieren
             elements.shop.spotsBalance.textContent = spots;
         }
    }

    // --- Initialization and Auth (FINALE NON-BLOCKING VERSION) ---
    const initializeApp = (user, isGuest = false) => { // 'async' entfernt!
        console.log(`initializeApp called for user: ${user.username || user.id}, isGuest: ${isGuest}`);
        localStorage.removeItem('fakesterGame');

        const fallbackUsername = isGuest ? user.username : user.user_metadata?.username || user.email?.split('@')[0] || 'Unbekannt';
        const fallbackProfile = {
            id: user.id, username: fallbackUsername, xp: 0, games_played: 0, wins: 0,
            correct_answers: 0, highscore: 0, spots: 0,
            equipped_title_id: 1, equipped_icon_id: 1
        };

        // Sofort currentUser setzen und UI vorbereiten
        if (isGuest) {
            currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest };
            userProfile = { ...fallbackProfile, id: currentUser.id, username: currentUser.username };
            userUnlockedAchievementIds = [];
            ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); inventory = {};
        } else {
            currentUser = { id: user.id, username: fallbackUsername, isGuest };
            userProfile = { ...fallbackProfile, id: user.id, username: currentUser.username };
            userUnlockedAchievementIds = [];
            ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); inventory = {};
        }

        console.log("Setting up initial UI with fallback data...");
        document.body.classList.toggle('is-guest', isGuest);
        if(document.getElementById('welcome-nickname')) document.getElementById('welcome-nickname').textContent = currentUser.username;
        if(document.getElementById('profile-title')) equipTitle(userProfile.equipped_title_id || 1, false);
        if(elements.home.profileIcon) equipIcon(userProfile.equipped_icon_id || 1, false);
        if(elements.home.profileLevel) updatePlayerProgressDisplay();
        if(elements.stats.gamesPlayed) updateStatsDisplay();
        updateSpotsDisplay();
        if(elements.achievements.grid) renderAchievements();
        if(elements.titles.list) renderTitles();
        if(elements.icons.list) renderIcons();
        if(elements.levelProgress.list) renderLevelProgress();

        console.log("Showing home screen (non-blocking)...");
        showScreen('home-screen');
        setLoading(false);

        // === DATEN IM HINTERGRUND LADEN (nur für eingeloggte User) ===
        if (!isGuest && supabase) {
            console.log("Fetching profile, owned items, achievements, and Spotify status in background...");

            Promise.all([
                supabase.from('profiles').select('*').eq('id', user.id).single(),
                supabase.from('user_owned_titles').select('title_id').eq('user_id', user.id),
                supabase.from('user_owned_icons').select('icon_id').eq('user_id', user.id),
                supabase.from('user_owned_backgrounds').select('background_id').eq('user_id', user.id),
                supabase.from('user_inventory').select('item_id, quantity').eq('user_id', user.id)
            ]).then((results) => {
                const [profileResult, titlesResult, iconsResult, backgroundsResult, inventoryResult] = results;

                // 1. Profil verarbeiten
                if (profileResult.error || !profileResult.data) {
                    console.error("Hintergrund-Profil-Ladefehler:", profileResult.error || new Error("No profile data returned"));
                    if (!profileResult.error || !profileResult.error.details?.includes("0 rows")) { showToast("Fehler beim Laden deines Profils.", true); }
                    // userProfile bleibt das Fallback-Profil
                    document.getElementById('welcome-nickname').textContent = currentUser.username;
                    updatePlayerProgressDisplay(); updateStatsDisplay(); updateSpotsDisplay();
                } else {
                    userProfile = profileResult.data;
                    currentUser.username = profileResult.data.username;
                    console.log("Profile data fetched in background:", userProfile);
                    document.getElementById('welcome-nickname').textContent = currentUser.username;
                    equipTitle(userProfile.equipped_title_id || 1, false);
                    equipIcon(userProfile.equipped_icon_id || 1, false);
                    updatePlayerProgressDisplay(); updateStatsDisplay(); updateSpotsDisplay();
                }

                 // 2. Besitz verarbeiten
                 ownedTitleIds = new Set(titlesResult.data?.map(t => t.title_id) || []);
                 ownedIconIds = new Set(iconsResult.data?.map(i => i.icon_id) || []);
                 ownedBackgroundIds = new Set(backgroundsResult.data?.map(b => b.background_id) || []);
                 inventory = {};
                 inventoryResult.data?.forEach(item => inventory[item.item_id] = item.quantity);
                 console.log("Owned items fetched:", { titles: ownedTitleIds.size, icons: ownedIconIds.size, backgrounds: ownedBackgroundIds.size, inventory: Object.keys(inventory).length });

                 // UI neu rendern, die von Besitz/Level abhängt
                 if(elements.titles.list) renderTitles();
                 if(elements.icons.list) renderIcons();
                 if(elements.levelProgress.list) renderLevelProgress();

                // 3. Erfolge laden
                return supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id);
            })
            .then(({ data: achievements, error: achError }) => {
                 // 4. Erfolge verarbeiten
                if (achError) { console.error("Hintergrund-Erfolg-Ladefehler:", achError); userUnlockedAchievementIds = []; }
                else { userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id)); console.log("Achievements fetched in background:", userUnlockedAchievementIds); }
                 // UI neu rendern, die von Erfolgen abhängt
                 if(elements.achievements.grid) renderAchievements();
                 if(elements.titles.list) renderTitles();
                 if(elements.icons.list) renderIcons();

                // 5. Spotify Status prüfen & Erfolg vergeben
                 console.log("Checking Spotify status after achievements (async)...");
                 return checkSpotifyStatus();
            })
             .then(() => {
                 console.log("Spotify status checked after achievements (async).");
                 if (spotifyToken && !userUnlockedAchievementIds.includes(9)) { awardClientSideAchievement(9); }
                 console.log("Connecting WebSocket for logged-in user (after async loads)...");
                 connectWebSocket();
            })
            .catch(error => {
                 console.error("Error during background data loading chain:", error);
                 showToast("Fehler beim Laden einiger Daten.", true);
                 console.log("Connecting WebSocket despite background load error...");
                 connectWebSocket();
            });
        } else { // Für Gäste
             console.log("Connecting WebSocket for guest...");
             connectWebSocket();
        }
        console.log("initializeApp finished (non-blocking setup complete).");
    };


    const checkSpotifyStatus = async () => {
        spotifyToken = null;
        try {
            console.log("Fetching /api/status...");
            const response = await fetch('/api/status');
            if (!response.ok) { console.warn(`Spotify status check failed: Server responded with status ${response.status}`); }
            else { const data = await response.json(); if (data.loggedIn && data.token) { spotifyToken = data.token; console.log("Spotify status: Logged In"); } else { console.log("Spotify status: Not Logged In"); } }
        } catch (error) { console.error("Error during checkSpotifyStatus fetch:", error); showToast("Verbindung zu Spotify konnte nicht geprüft werden.", true); }
        finally {
             const spotifyButton = document.getElementById('spotify-connect-button');
             const createButton = elements.home.createRoomBtn;
             if (spotifyButton) spotifyButton.classList.toggle('hidden', !!spotifyToken);
             if (createButton) createButton.classList.toggle('hidden', !spotifyToken);
             console.log("Spotify UI buttons updated.");
         }
    };

    const handleAuthAction = async (action, form, isRegister = false) => {
         setLoading(true); const usernameInput = form.querySelector('input[type="text"]'); const passwordInput = form.querySelector('input[type="password"]'); const username = usernameInput.value; const password = passwordInput.value; if (!username || !password) { showToast("Benutzername und Passwort dürfen nicht leer sein.", true); setLoading(false); return; } console.log(`Attempting ${isRegister ? 'signup' : 'login'} for user: ${username}`); try { let options = isRegister ? { options: { data: { username: username } } } : {}; const { data, error } = await action.call(supabase.auth, { email: `${username}@fakester.app`, password, ...options }); if (error) { console.error('Supabase Auth Error:', error); throw error; } console.log(`${isRegister ? 'Signup' : 'Login'} successful for user: ${username}`, data); } catch (error) { let message = "Anmeldung fehlgeschlagen."; if (error.message.includes("Invalid login credentials")) message = "Ungültiger Benutzername oder Passwort."; else if (error.message.includes("User already registered")) message = "Benutzername bereits vergeben."; else if (error.message.includes("Password should be at least 6 characters")) message = "Passwort muss mind. 6 Zeichen lang sein."; else message = error.message; console.error('Authentication failed:', message); showToast(message, true); } finally { setLoading(false); }
    };
    const handleLogout = async () => { console.log("Logout initiated."); setLoading(true); if (currentUser?.isGuest) { console.log("Guest logout, reloading page."); window.location.replace(window.location.origin); return; } try { const { error } = await supabase.auth.signOut(); if (error) throw error; console.log("Supabase signOut successful."); window.location.replace(window.location.origin); } catch (error) { console.error("Error during logout:", error); showToast("Ausloggen fehlgeschlagen.", true); setLoading(false); } };

    const awardClientSideAchievement = (achievementId) => { // 'async' entfernt
        if (!currentUser || currentUser.isGuest || !supabase || userUnlockedAchievementIds.includes(achievementId)) return;
        console.log(`Awarding client-side achievement: ${achievementId}`);
        userUnlockedAchievementIds.push(achievementId); // Sofort zur Liste hinzufügen
        const achievement = achievementsList.find(a => a.id === achievementId);
        showToast(`Erfolg freigeschaltet: ${achievement?.name || ''}!`);
        // Rendere UI-Elemente, die von Erfolgen abhängen (sofort)
        if(elements.achievements.grid) renderAchievements();
        if(elements.titles.list) renderTitles();
        if(elements.icons.list) renderIcons();

        // Speichern im Hintergrund
        supabase
            .from('user_achievements')
            .insert({ user_id: currentUser.id, achievement_id: achievementId })
            .then(({ error }) => {
                if (error) { console.error(`Fehler beim Speichern von Client-Achievement ${achievementId} im Hintergrund:`, error); }
                else { console.log(`Client-Achievement ${achievementId} erfolgreich im Hintergrund gespeichert.`); }
            });
    };

    const connectWebSocket = () => { /* ... bleibt gleich ... */ };
    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`Processing WebSocket message: Type=${type}`, payload);
        if (type !== 'round-countdown') elements.countdownOverlay.classList.add('hidden');
        switch (type) {
            case 'game-created': case 'join-success': setLoading(false); currentGame = { ...currentGame, pin: payload.pin, playerId: payload.playerId, isHost: payload.isHost, gameMode: payload.gameMode }; localStorage.setItem('fakesterGame', JSON.stringify(currentGame)); if (currentGame.isHost) { fetchHostData(); } elements.joinModal.overlay.classList.add('hidden'); showScreen('lobby-screen'); break;
            case 'lobby-update':
                 elements.lobby.pinDisplay.textContent = payload.pin;
                 renderPlayerList(payload.players, payload.hostId);
                 updateHostSettings(payload.settings, currentGame.isHost);
                 applyLobbyBackground(payload.settings?.chosenBackgroundId);
                 break;
            case 'reconnect-to-game': setLoading(false); console.log("Reconnected mid-game, showing game screen."); showScreen('game-screen'); /* TODO: Request current game state */ break;
            case 'game-starting': showScreen('game-screen'); setupPreRound(payload); break;
            case 'round-countdown': setLoading(false); showCountdown(payload.round, payload.totalRounds); break;
            case 'new-round': setLoading(false); showScreen('game-screen'); setupNewRound(payload); break;
            case 'round-result': showRoundResult(payload); break;
            case 'game-over':
                 localStorage.removeItem('fakesterGame');
                 const myScoreData = payload.scores.find(s => s.id === currentUser?.id);
                 const myFinalScore = myScoreData?.score || 0;
                 const myGainedSpots = myScoreData?.gainedSpots || 0; // Kommt jetzt vom Server
                 showToast(`Spiel vorbei! ${myFinalScore} XP & ${myGainedSpots} Spots erhalten!`);
                 if (!currentUser?.isGuest) {
                    updatePlayerProgress(); // Holt Profil neu -> inkl. Spots & XP
                 }
                 setTimeout(() => { screenHistory = ['auth-screen', 'home-screen']; showScreen('home-screen'); }, 7000);
                 break;
            case 'invite-received': showInvitePopup(payload.from, payload.pin); break;
            case 'friend-request-received': showToast(`Du hast eine Freundschaftsanfrage von ${payload.from}!`); if (!elements.friendsModal.overlay.classList.contains('hidden')) { loadFriendsData(); } else { const countEl = elements.friendsModal.requestsCount; const currentCount = parseInt(countEl.textContent || '0'); countEl.textContent = currentCount + 1; countEl.classList.remove('hidden'); } break;
            case 'toast': setLoading(false); showToast(payload.message, payload.isError); break;
            case 'error': setLoading(false); showToast(payload.message, true); pinInput = ""; document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = ""); if (!elements.joinModal.overlay?.classList.contains('hidden')) { elements.joinModal.overlay.classList.add('hidden'); } break;
            case 'player-reacted': displayReaction(payload.playerId, payload.reaction); break;
            // NEU: Profil Update (z.B. nach Geschenk)
            case 'profile-update':
                 if(payload.spots !== undefined && !currentUser.isGuest){
                     userProfile.spots = payload.spots;
                     updateSpotsDisplay();
                     console.log("Spots updated via WebSocket:", payload.spots);
                 }
                 // TODO: Handle other profile updates if needed
                 break;
            default: console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    };

    // --- UI Rendering Functions ---
    function renderPlayerList(players, hostId) { /* ... bleibt gleich ... */ }
    function updateHostSettings(settings, isHost) {
         if (!elements.lobby.hostSettings || !elements.lobby.guestWaitingMessage) return;
         elements.lobby.hostSettings.classList.toggle('hidden', !isHost);
         elements.lobby.guestWaitingMessage.classList.toggle('hidden', isHost);
         if (!isHost || !settings) return;
         elements.lobby.answerTypeContainer.classList.toggle('hidden', currentGame.gameMode !== 'quiz');
         ['song-count-presets', 'guess-time-presets', 'answer-type-presets', 'lives-count-presets'].forEach(id => { /* ... Preset Button Logik ... */ });
         elements.lobby.deviceSelectBtn.textContent = settings.deviceName || 'Gerät auswählen';
         elements.lobby.playlistSelectBtn.textContent = settings.playlistName || 'Playlist auswählen';
         elements.lobby.startGameBtn.disabled = !(settings.deviceId && settings.playlistId); // Host braucht deviceId/playlistId zum Starten

         // Hintergrund Button
         const bgButton = elements.lobby.backgroundSelectButton; // Korrekte Referenz verwenden
         if (bgButton) {
             bgButton.classList.toggle('hidden', !isHost); // Nur für Host sichtbar
             const currentBg = backgroundsList.find(bg => bg.backgroundId === settings?.chosenBackgroundId); // Finde über backgroundId
             bgButton.textContent = currentBg ? `Hintergrund: ${currentBg.name}` : 'Hintergrund wählen';
         }
     }
    function renderAchievements() {
        if (!elements.achievements.grid) return;
        const sortedAchievements = [...achievementsList].sort((a, b) => {
            const aUnlocked = userUnlockedAchievementIds.includes(a.id);
            const bUnlocked = userUnlockedAchievementIds.includes(b.id);
            if (aUnlocked === bUnlocked) return 0; // Behalte Reihenfolge bei, wenn beide gleich (un)/locked
            return aUnlocked ? -1 : 1; // Unlocked nach oben
        });
        elements.achievements.grid.innerHTML = sortedAchievements.map(a =>
            `<div class="stat-card ${!userUnlockedAchievementIds.includes(a.id) ? 'locked' : ''}">
                <span class="stat-value">${a.name}</span>
                <span class="stat-label">${a.description}</span>
             </div>`
        ).join('');
    }
    async function equipTitle(titleId, saveToDb = true) {
        // Stelle sicher, dass das Element existiert
         const titleElement = document.getElementById('profile-title');
         if(!titleElement) return;

         // Finde Titel in der Liste (inkl. Shop-Titel)
        const title = titlesList.find(t => t.id === titleId);
        if (title) {
             console.log(`Equipping title: ${title.name} (ID: ${titleId}), Save: ${saveToDb}`);
             titleElement.textContent = title.name;
             userProfile.equipped_title_id = titleId; // Update lokalen State
             if (saveToDb && !currentUser.isGuest && supabase) {
                 console.log(`Saving title ${titleId} to DB for user ${currentUser.id}`);
                 const { error } = await supabase.from('profiles').update({ equipped_title_id: titleId }).eq('id', currentUser.id);
                 if (error) { console.error("Failed to save title:", error); showToast("Titel konnte nicht gespeichert werden.", true); }
                 else { console.log("Title saved successfully."); }
             }
         } else { console.warn(`Title ID ${titleId} not found.`); }
         // Rendere Titelliste neu, um 'equipped' Status zu zeigen
         if(elements.titles.list) renderTitles();
    }

    function renderTitles() {
        if (!elements.titles.list) return;
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const equippedTitleId = userProfile.equipped_title_id || 1;

        // Kombiniere Standard-Titel und Shop-Titel für die Anzeige
        const displayTitles = titlesList.filter(t => t.type === 'title' || t.unlockType !== 'spots'); // Alle außer Shop-Items direkt? Nein, alle anzeigen.

        elements.titles.list.innerHTML = displayTitles.map(t => {
            const isUnlocked = isItemUnlocked(t, currentLevel); // Nutzt die erweiterte Funktion
            const isEquipped = t.id === equippedTitleId;
            const unlockDescription = getUnlockDescription(t); // Zeigt Kosten für Shop-Items

            // Achievement-Check für "Sammler" (5 Titel freigeschaltet ODER gekauft)
             const unlockedCount = displayTitles.filter(title => isItemUnlocked(title, currentLevel)).length;
             if (!currentUser.isGuest && unlockedCount >= 5 && !userUnlockedAchievementIds.includes(15)) {
                 awardClientSideAchievement(15);
             }

            return `<div class="title-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}" data-title-id="${t.id}" ${!isUnlocked ? 'disabled' : ''}>
                        <span class="stat-value">${t.name}</span>
                        <span class="stat-label">${isUnlocked ? (ownedTitleIds.has(t.id) ? 'Gekauft' : 'Freigeschaltet') : unlockDescription}</span>
                    </div>`;
        }).join('');
    }
    async function equipIcon(iconId, saveToDb = true) {
        if(!elements.home.profileIcon) return; // Stelle sicher, dass Element existiert
        const icon = iconsList.find(i => i.id === iconId);
        if(icon){
             console.log(`Equipping icon: ${icon.iconClass} (ID: ${iconId}), Save: ${saveToDb}`);
             elements.home.profileIcon.className = `fa-solid ${icon.iconClass}`;
             userProfile.equipped_icon_id = iconId; // Update lokalen State
             if (saveToDb && !currentUser.isGuest && supabase) {
                 console.log(`Saving icon ${iconId} to DB for user ${currentUser.id}`);
                 const { error } = await supabase.from('profiles').update({ equipped_icon_id: iconId }).eq('id', currentUser.id);
                 if (error) { console.error("Failed to save icon:", error); showToast("Icon konnte nicht gespeichert werden.", true); }
                 else { console.log("Icon saved successfully."); }
             }
         } else { console.warn(`Icon ID ${iconId} not found.`); }
         if(elements.icons.list) renderIcons(); // Rendere Iconliste neu
    }
    function renderIcons() {
        if (!elements.icons.list) return;
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const equippedIconId = userProfile.equipped_icon_id || 1;

        // Kombiniere Standard- und Shop-Icons
         const displayIcons = iconsList.filter(i => i.type === 'icon' || i.unlockType !== 'spots'); // Alle anzeigen

        elements.icons.list.innerHTML = displayIcons.map(icon => {
            const isUnlocked = isItemUnlocked(icon, currentLevel);
            const isEquipped = icon.id === equippedIconId;
            const unlockDescription = getUnlockDescription(icon); // Zeigt Kosten für Shop-Items

             // Achievement-Check für "Icon-Liebhaber"
             const unlockedCount = displayIcons.filter(ic => isItemUnlocked(ic, currentLevel)).length;
             if (!currentUser.isGuest && unlockedCount >= 5 && !userUnlockedAchievementIds.includes(16)) {
                 awardClientSideAchievement(16);
             }

            return `<div class="icon-card ${!isUnlocked ? 'locked' : ''} ${isEquipped ? 'equipped' : ''}" data-icon-id="${icon.id}" ${!isUnlocked ? 'disabled' : ''}>
                        <div class="icon-preview"><i class="fa-solid ${icon.iconClass}"></i></div>
                        <span class="stat-label">${isUnlocked ? (ownedIconIds.has(icon.id) ? 'Gekauft' : 'Verfügbar') : unlockDescription}</span>
                    </div>`;
        }).join('');
    }
    function renderLevelProgress() { /* ... bleibt gleich ... */ }
    function updatePlayerProgressDisplay() { /* ... bleibt gleich ... */ }
    async function updatePlayerProgress() { // Nimmt keine Argumente mehr, holt alles neu
        if (!currentUser || currentUser.isGuest || !supabase) return;
        console.log("Updating player progress post-game (fetching latest profile)...");
        const oldLevel = getLevelForXp(userProfile.xp || 0);

        const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();

        if (error) {
            console.error("Error fetching profile data after game:", error);
            // Zeige zumindest die alten Daten an
            updatePlayerProgressDisplay();
            updateStatsDisplay();
            updateSpotsDisplay();
            return;
        }
        console.log("Latest profile data fetched:", data);
        userProfile = data; // Überschreibe lokales Profil komplett

        // Erfolge auch neu laden, falls Server welche vergeben hat
        const { data: achievements, error: achError } = await supabase.from('user_achievements').select('achievement_id').eq('user_id', currentUser.id);
        if (achError) { console.error("Error fetching updated achievements:", achError); }
        else { userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id)); console.log("Updated achievements:", userUnlockedAchievementIds); }

        // Alles neu rendern
        updatePlayerProgressDisplay();
        updateStatsDisplay();
        updateSpotsDisplay(); // Wichtig: Spots auch aktualisieren
        renderAchievements();
        renderTitles();
        renderIcons();
        renderLevelProgress();

        const newLevel = getLevelForXp(userProfile.xp || 0);
        console.log(`Old Level: ${oldLevel}, New Level: ${newLevel}`);
        if (newLevel > oldLevel) {
            console.info(`Level Up! ${oldLevel} -> ${newLevel}`);
            showToast(`Level Up! Du hast Level ${newLevel} erreicht!`);
            // UI wird oben schon neu gerendert
        }
        console.log("Player progress update complete.");
    }
    function updateStatsDisplay() { /* ... bleibt gleich ... */ }

    // --- NEU: Shop Funktionen ---
    async function loadShopItems() {
       if (!elements.shop.screen || !supabase || !currentUser || currentUser.isGuest) {
           console.log("Cannot load shop: Screen missing, not logged in, or guest.");
           if(elements.shop.titlesList) elements.shop.titlesList.innerHTML = '<p>Shop nur für eingeloggte Benutzer verfügbar.</p>';
           return;
       }
       setLoading(true);
       updateSpotsDisplay(); // Zeige aktuelle Spots im Shop-Header
       try {
           // Hole Auth Token für sichere API-Anfrage
           const session = await supabase.auth.getSession();
           const token = session?.data?.session?.access_token;
           if (!token) throw new Error("Nicht authentifiziert");

           const response = await fetch('/api/shop/items', {
               headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${token}` // Sende JWT Token
               }
           });
           if (!response.ok) throw new Error(`Shop-Ladefehler: ${response.status} ${response.statusText}`);
           const { items } = await response.json();

           // Kombiniere lokale Item-Definitionen mit Besitz-Info vom Server
           const combinedItems = [...titlesList, ...iconsList, ...backgroundsList, ...consumablesList]
                .filter(item => item.unlockType === 'spots') // Nur Shop-Items anzeigen
                .map(localItem => {
                    const serverItem = items.find(srv => srv.id === localItem.id);
                    return { ...localItem, isOwned: serverItem?.isOwned || false }; // Füge isOwned hinzu
                });

           // Filtere Items nach Typ
           const titles = combinedItems.filter(i => i.type === 'title');
           const icons = combinedItems.filter(i => i.type === 'icon');
           const backgrounds = combinedItems.filter(i => i.type === 'background');
           const consumables = combinedItems.filter(i => i.type === 'consumable');

           // Rendere Items
           elements.shop.titlesList.innerHTML = titles.length > 0 ? titles.map(renderShopItem).join('') : '<p>Keine Titel im Angebot.</p>';
           elements.shop.iconsList.innerHTML = icons.length > 0 ? icons.map(renderShopItem).join('') : '<p>Keine Icons im Angebot.</p>';
           elements.shop.backgroundsList.innerHTML = backgrounds.length > 0 ? backgrounds.map(renderShopItem).join('') : '<p>Keine Hintergründe im Angebot.</p>';
           elements.shop.consumablesList.innerHTML = consumables.length > 0 ? consumables.map(renderShopItem).join('') : '<p>Keine Verbrauchsgegenstände im Angebot.</p>';

       } catch (error) {
           console.error("Fehler beim Laden der Shop Items:", error);
           showToast("Shop konnte nicht geladen werden.", true);
            elements.shop.titlesList.innerHTML = '<p>Fehler beim Laden.</p>';
            elements.shop.iconsList.innerHTML = '';
            elements.shop.backgroundsList.innerHTML = '';
            elements.shop.consumablesList.innerHTML = '';
       } finally {
           setLoading(false);
       }
    }

    function renderShopItem(item) {
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const alreadyOwned = item.isOwned; // kommt jetzt vom Server/loadShopItems
        const canAfford = (userProfile.spots || 0) >= item.cost;
        const isBuyable = item.unlockType === 'spots' && !alreadyOwned && canAfford;
        const cannotAfford = item.unlockType === 'spots' && !alreadyOwned && !canAfford;

        let preview = '';
        if (item.type === 'icon') { preview = `<div class="item-preview-icon"><i class="fa-solid ${item.iconClass}"></i></div>`; }
        else if (item.type === 'background') { preview = `<div class="item-preview-background" style="background-image: url('${item.imageUrl || ''}')"></div>`; }

        let buttonText = 'Kaufen';
        if (alreadyOwned) buttonText = 'Besitzt du';
        else if (cannotAfford) buttonText = 'Zu teuer';
        else if (!isBuyable) buttonText = 'Nicht verfügbar'; // Z.B. wenn unlockType nicht 'spots' ist

        return `
           <div class="shop-item ${alreadyOwned ? 'owned' : ''} ${cannotAfford ? 'cannot-afford' : ''}">
                <span class="item-name">${item.name}</span>
                ${preview}
                <span class="item-description">${item.description || ''}</span>
                <span class="item-cost">${item.cost} 🎵</span>
                <button class="button-primary button-small buy-button" data-item-id="${item.id}" ${!isBuyable ? 'disabled' : ''}>
                    ${buttonText}
                </button>
           </div>
        `;
    }

    async function handleBuyItem(itemId) {
        if (!supabase || !currentUser || currentUser.isGuest) return;

        // Finde Item in kombinierten Listen
        const itemToBuy = [...titlesList, ...iconsList, ...backgroundsList, ...consumablesList].find(i => i.id == itemId); // Lose Typenprüfung, da data- Attribut String ist
        if (!itemToBuy || itemToBuy.unlockType !== 'spots') { console.error("Item nicht kaufbar:", itemId); showToast("Kauf fehlgeschlagen (Item ungültig).", true); return; }

        showConfirmModal(
            `"${itemToBuy.name}" kaufen?`,
            `Möchtest du dieses Item für ${itemToBuy.cost} Spots kaufen?`,
            async () => {
                setLoading(true);
                try {
                    const session = await supabase.auth.getSession();
                    const token = session?.data?.session?.access_token;
                    if (!token) throw new Error("Nicht authentifiziert");

                    const response = await fetch('/api/shop/buy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ itemId: itemToBuy.id }) // Sende die korrekte ID
                    });
                    const result = await response.json();
                    if (!response.ok || !result.success) { throw new Error(result.message || `Fehler ${response.status}`); }

                    // Kauf erfolgreich
                    userProfile.spots = result.newSpots; // Update lokale Spots
                    updateSpotsDisplay();
                    showToast(`"${itemToBuy.name}" erfolgreich gekauft!`, false);

                    // Update lokale Besitz-Listen sofort
                    if (itemToBuy.type === 'title') ownedTitleIds.add(itemToBuy.id);
                    else if (itemToBuy.type === 'icon') ownedIconIds.add(itemToBuy.id);
                    else if (itemToBuy.type === 'background') ownedBackgroundIds.add(itemToBuy.backgroundId); // backgroundId verwenden
                    else if (itemToBuy.type === 'consumable') inventory[itemToBuy.itemId] = (inventory[itemToBuy.itemId] || 0) + 1;

                    // Shop und relevante Auswahl-Screens neu laden/rendern
                    loadShopItems();
                    if(elements.titles.list) renderTitles();
                    if(elements.icons.list) renderIcons();

                } catch (error) {
                    console.error("Fehler beim Kauf:", error);
                    showToast(`Kauf fehlgeschlagen: ${error.message}`, true);
                } finally {
                    setLoading(false);
                }
            }
        );
     }

    function showBackgroundSelectionModal() {
        if (!elements.backgroundSelectModal.list) return;
        let html = `<li data-bg-id="default"><button class="button-select">Standard</button></li>`;
        backgroundsList.forEach(bg => {
            // Zeige nur gekaufte Hintergründe an (prüfe über backgroundId)
            if (bg.id !== 'default' && ownedBackgroundIds.has(bg.backgroundId)) {
                html += `<li data-bg-id="${bg.backgroundId}"><button class="button-select">${bg.name}</button></li>`;
            }
        });
        elements.backgroundSelectModal.list.innerHTML = html;
        elements.backgroundSelectModal.overlay.classList.remove('hidden');
    }

    function applyLobbyBackground(backgroundId) {
        const lobbyScreen = document.getElementById('lobby-screen');
        if (!lobbyScreen) return;
        // Finde Hintergrund über backgroundId
        const selectedBg = backgroundsList.find(bg => bg.backgroundId === backgroundId);
        if (selectedBg && selectedBg.imageUrl) {
             lobbyScreen.style.backgroundImage = `url('${selectedBg.imageUrl}')`;
             lobbyScreen.style.backgroundSize = 'cover';
             lobbyScreen.style.backgroundPosition = 'center';
             console.log(`Applied background: ${selectedBg.name}`);
        } else {
             lobbyScreen.style.backgroundImage = ''; // Standard
              console.log("Applied default background.");
        }
    }

     function displayReaction(playerId, reaction) {
         const playerCard = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
         if (playerCard && !playerCard.querySelector('.player-reaction-popup')) { // Verhindere mehrere Popups gleichzeitig
             const popup = document.createElement('div');
             popup.className = 'player-reaction-popup';
             popup.textContent = reaction;
             // Füge zum Spieler-Karten-Container hinzu, nicht zum Body
             playerCard.style.position = 'relative'; // Stelle sicher, dass die Positionierung klappt
             playerCard.appendChild(popup);
             setTimeout(() => popup.remove(), 1500);
         }
     }

      async function handleGiftSpots(friendId, friendName) {
           const amountStr = prompt(`Wie viele Spots 🎵 möchtest du ${friendName} schenken? (Du hast ${userProfile.spots || 0})`);
           if (!amountStr) return;
           const amount = parseInt(amountStr);
           if (isNaN(amount) || amount <= 0) { showToast("Ungültiger Betrag.", true); return; }
           if (amount > (userProfile.spots || 0)) { showToast("Nicht genug Spots zum Verschenken.", true); return; }

           showConfirmModal(
               `Spots schenken`,
               `Möchtest du ${friendName} wirklich ${amount} 🎵 Spots schenken?`,
               async () => {
                   setLoading(true);
                   try {
                       const session = await supabase.auth.getSession();
                       const token = session?.data?.session?.access_token;
                       if (!token) throw new Error("Nicht authentifiziert");

                       const response = await fetch('/api/friends/gift', {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                           body: JSON.stringify({ recipientId: friendId, amount: amount })
                       });
                       const result = await response.json();
                       if (!response.ok || !result.success) throw new Error(result.message || 'Fehler');

                       userProfile.spots = result.newSenderSpots; // Update eigene Spots
                       updateSpotsDisplay();
                       showToast(`${amount} Spots erfolgreich an ${friendName} gesendet!`, false);
                       elements.friendsModal.overlay.classList.add('hidden'); // Schließe Freunde-Modal

                   } catch (error) {
                       console.error("Fehler beim Schenken:", error);
                       showToast(`Schenken fehlgeschlagen: ${error.message}`, true);
                   } finally {
                       setLoading(false);
                   }
               }
           );
       }


    // --- Game Logic Functions (Stubs) ---
    function showCountdown(round, total) { console.log("Placeholder: showCountdown"); }
    function setupPreRound(data) { console.log("Placeholder: setupPreRound"); }
    function setupNewRound(data) { console.log("Placeholder: setupNewRound"); }
    function showRoundResult(data) { console.log("Placeholder: showRoundResult"); }
    // --- Friends Modal Logic (Stubs) ---
    async function loadFriendsData() { console.log("Placeholder: loadFriendsData"); elements.friendsModal.friendsList.innerHTML = '<li>Lade Freunde...</li>'; elements.friendsModal.requestsList.innerHTML = '<li>Lade Anfragen...</li>'; /* TODO: Implement fetch logic */ }
    function renderRequestsList(requests) { console.log("Placeholder: renderRequestsList"); /* TODO: Implement */ }
    // --- Utility & Modal Functions (Stubs) ---
    async function fetchHostData(isRefresh = false) { console.log("Placeholder: fetchHostData"); /* TODO: Implement Spotify API calls */ }
    function renderPaginatedPlaylists(playlistsToRender, page = 1) { console.log("Placeholder: renderPaginatedPlaylists"); /* TODO: Implement */ }
    function openCustomValueModal(type, title) { console.log("Placeholder: openCustomValueModal"); /* TODO: Implement */ }
    function showInvitePopup(from, pin) { console.log("Placeholder: showInvitePopup"); /* TODO: Implement */ }
    function handlePresetClick(e, type) { console.log("Placeholder: handlePresetClick"); /* TODO: Implement */ }
    async function handleRemoveFriend(friendId) { console.log(`Placeholder: handleRemoveFriend(${friendId})`); /* TODO: Implement Supabase call */ }


    // --- Event Listeners ---
    function addEventListeners() {
        console.log("Adding all application event listeners...");
        // Navigation & Allgemein
        elements.leaveGameButton?.addEventListener('click', goBack);
        elements.leaveConfirmModal.cancelBtn?.addEventListener('click', () => elements.leaveConfirmModal.overlay.classList.add('hidden'));
        elements.leaveConfirmModal.confirmBtn?.addEventListener('click', () => { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type: 'leave-game', payload: { pin: currentGame.pin, playerId: currentGame.playerId } })); } localStorage.removeItem('fakesterGame'); currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] }; screenHistory = ['auth-screen', 'home-screen']; showScreen('home-screen'); elements.leaveConfirmModal.overlay.classList.add('hidden'); });
        // Auth Screen
        elements.auth.loginForm?.addEventListener('submit', (e) => { e.preventDefault(); if (!supabase) return; handleAuthAction(supabase.auth.signInWithPassword, e.target, false); });
        elements.auth.registerForm?.addEventListener('submit', (e) => { e.preventDefault(); if (!supabase) return; handleAuthAction(supabase.auth.signUp, e.target, true); });
        elements.auth.showRegister?.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
        elements.auth.showLogin?.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.remove('hidden'); elements.auth.registerForm.classList.add('hidden'); });
        // Gast Modal
        elements.guestModal.openBtn?.addEventListener('click', () => { elements.guestModal.overlay.classList.remove('hidden'); elements.guestModal.input.focus(); });
        elements.guestModal.closeBtn?.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.guestModal.submitBtn?.addEventListener('click', () => { const nickname = elements.guestModal.input.value; if (nickname.trim().length < 3 || nickname.trim().length > 15) { showToast("Nickname muss 3-15 Zeichen lang sein.", true); return; } elements.guestModal.overlay.classList.add('hidden'); initializeApp({ username: nickname }, true); });
        // Home Screen
        elements.home.logoutBtn?.addEventListener('click', handleLogout);
        document.getElementById('spotify-connect-button')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/login'; });
        elements.home.createRoomBtn?.addEventListener('click', () => showScreen('mode-selection-screen'));
        elements.home.joinRoomBtn?.addEventListener('click', () => { pinInput = ""; elements.joinModal.pinDisplay.forEach(d => d.textContent = ""); elements.joinModal.overlay.classList.remove('hidden'); });
        elements.home.statsBtn?.addEventListener('click', () => showScreen('stats-screen'));
        elements.home.achievementsBtn?.addEventListener('click', () => showScreen('achievements-screen'));
        elements.home.levelProgressBtn?.addEventListener('click', () => showScreen('level-progress-screen'));
        elements.home.profileTitleBtn?.addEventListener('click', () => showScreen('title-selection-screen'));
        elements.home.profilePictureBtn?.addEventListener('click', () => showScreen('icon-selection-screen'));
        elements.home.friendsBtn?.addEventListener('click', () => { if(!currentUser.isGuest) { loadFriendsData(); elements.friendsModal.overlay.classList.remove('hidden'); } });
        elements.home.usernameContainer?.addEventListener('click', () => { if (!currentUser || currentUser.isGuest) return; elements.changeNameModal.input.value = currentUser.username; elements.changeNameModal.overlay.classList.remove('hidden'); elements.changeNameModal.input.focus(); });
        elements.home.shopButton?.addEventListener('click', () => { if(!currentUser.isGuest) { loadShopItems(); showScreen('shop-screen'); } });
        // Modus & Spieltyp Auswahl
        elements.modeSelection.container?.addEventListener('click', (e) => { /* ... */ });
        elements.gameTypeScreen.pointsBtn?.addEventListener('click', () => { /* ... */ });
        elements.gameTypeScreen.livesBtn?.addEventListener('click', () => { /* ... */ });
        elements.gameTypeScreen.livesPresets?.addEventListener('click', (e) => { /* ... */ });
        elements.gameTypeScreen.createLobbyBtn?.addEventListener('click', () => { /* ... */ });
        // Lobby Screen
        elements.lobby.inviteFriendsBtn?.addEventListener('click', async () => { /* ... */ });
        elements.lobby.deviceSelectBtn?.addEventListener('click', () => elements.deviceSelectModal.overlay.classList.remove('hidden'));
        elements.lobby.playlistSelectBtn?.addEventListener('click', async () => { /* ... Lädt jetzt Playlists ... */ });
        elements.lobby.backgroundSelectButton?.addEventListener('click', showBackgroundSelectionModal); // Hintergrund Button
        document.getElementById('host-settings')?.addEventListener('click', (e) => { const btn = e.target.closest('.preset-button'); if(btn) handlePresetClick(e, btn.closest('.preset-group')?.id); }); // Vereinfacht
        elements.lobby.startGameBtn?.addEventListener('click', () => { /* ... */ });
        elements.lobby.reactionButtons?.addEventListener('click', (e) => { /* ... Sendet Reaktion ... */ });
        // Item/Title/Icon Selection Screens
        elements.titles.list?.addEventListener('click', (e) => { const card = e.target.closest('.title-card:not(.locked)'); if (card) { const titleId = parseInt(card.dataset.titleId); if (!isNaN(titleId)) equipTitle(titleId, true); } });
        elements.icons.list?.addEventListener('click', (e) => { const card = e.target.closest('.icon-card:not(.locked)'); if (card) { const iconId = parseInt(card.dataset.iconId); if (!isNaN(iconId)) equipIcon(iconId, true); } });
        // Shop Screen
        elements.shop.screen?.addEventListener('click', (e) => { const buyButton = e.target.closest('.buy-button:not([disabled])'); if (buyButton) { handleBuyItem(buyButton.dataset.itemId); } });
        // Modals
        document.querySelectorAll('.button-exit-modal').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.add('hidden')));
        elements.joinModal.numpad?.addEventListener('click', (e) => { /* ... */ });
        elements.friendsModal.tabsContainer?.addEventListener('click', (e) => { /* ... */ });
        elements.friendsModal.addFriendBtn?.addEventListener('click', async () => { /* ... */ });
        elements.friendsModal.requestsList?.addEventListener('click', (e) => { /* ... */ });
        elements.friendsModal.friendsList?.addEventListener('click', (e) => { // Updated Listener
            const removeButton = e.target.closest('.button-remove-friend');
            const giftButton = e.target.closest('.button-gift');
            if (removeButton) { handleRemoveFriend(removeButton.dataset.friendId); }
            else if (giftButton) { handleGiftSpots(giftButton.dataset.friendId, giftButton.dataset.friendName); }
        });
        elements.inviteFriendsModal.list?.addEventListener('click', (e) => { /* ... */ });
        elements.customValueModal.numpad?.addEventListener('click', (e) => { /* ... */ });
        elements.customValueModal.confirmBtn?.addEventListener('click', () => { /* ... */ });
        elements.changeNameModal.submitBtn?.addEventListener('click', async () => { /* ... */ });
        elements.deviceSelectModal.refreshBtn?.addEventListener('click', () => fetchHostData(true));
        elements.deviceSelectModal.list?.addEventListener('click', (e) => { /* ... */ });
        elements.playlistSelectModal.search?.addEventListener('input', () => { /* ... */ });
        elements.playlistSelectModal.list?.addEventListener('click', (e) => { /* ... */ });
        elements.playlistSelectModal.pagination?.addEventListener('click', (e) => { /* ... */ });
        elements.backgroundSelectModal.list?.addEventListener('click', (e) => { // Listener für Hintergrundauswahl
            const listItem = e.target.closest('li[data-bg-id]');
            if (listItem && ws.socket?.readyState === WebSocket.OPEN && currentGame.isHost) {
                 const backgroundId = listItem.dataset.bgId;
                 console.log(`Selected background: ${backgroundId}`);
                 ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { chosenBackgroundId: backgroundId === 'default' ? null : backgroundId } }));
                 elements.backgroundSelectModal.overlay.classList.add('hidden');
            }
        });
        elements.confirmActionModal.cancelBtn?.addEventListener('click', () => { /* ... */ });
        elements.confirmActionModal.confirmBtn?.addEventListener('click', () => { /* ... */ });
        // Console Buttons
        toggleConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.toggle('hidden'));
        closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
        clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
        copyConsoleBtn?.addEventListener('click', () => { if (!consoleOutput) return; const logText = Array.from(consoleOutput.children).map(entry => entry.dataset.rawText || entry.textContent).join('\n'); navigator.clipboard.writeText(logText).then(() => { showToast('Logs kopiert!', false); }).catch(err => { console.error('Fehler beim Kopieren der Logs:', err); showToast('Kopieren fehlgeschlagen.', true); }); });
        console.log("All event listeners added.");
    }


    // --- Supabase Initialization (FINAL) ---
    async function initializeSupabase() {
        try {
            console.log("Fetching /api/config...");
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error(`Failed to fetch config: ${response.statusText}`);
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) { throw new Error("Supabase URL or Anon Key is missing from config."); }

            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { global: { fetch: (...args) => window.fetch(...args) }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
            console.log("Supabase client initialized successfully.");

            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`Supabase Auth Event: ${event}`, session ? { userId: session.user.id, eventTime: new Date().toISOString() } : 'No session');
                if (event === 'SIGNED_OUT') {
                    currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null; ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); inventory = {};
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.close(); }
                    if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null;
                    localStorage.removeItem('fakesterGame'); screenHistory = ['auth-screen']; showScreen('auth-screen'); document.body.classList.add('is-guest'); setLoading(false);
                    return;
                }
                if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                     if (!window.initializeAppRunning && (!currentUser || currentUser.id !== session.user.id)) {
                          window.initializeAppRunning = true;
                          console.log(`Session available/updated for user ${session.user.id}. Initializing app...`);
                          setLoading(true); // Set loading before non-blocking init starts
                          try { initializeApp(session.user, false); } // Non-blocking now
                          catch(initError) { console.error("Error directly calling initializeApp:", initError); setLoading(false); showScreen('auth-screen'); }
                          finally { window.initializeAppRunning = false; /* setLoading(false) is now inside initializeApp */ }
                     } else if (event === 'TOKEN_REFRESHED') { console.log("Token refreshed, checking Spotify status again (async)..."); checkSpotifyStatus(); }
                     else if (!window.initializeAppRunning) { console.log("App already initialized for this user session or init running."); }
                } else if (!session && !['USER_UPDATED', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED'].includes(event)) {
                     console.log(`No active session or session invalid (Event: ${event}). Showing auth screen.`);
                     if (currentUser) { currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null; ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); inventory = {}; if (ws.socket && ws.socket.readyState === WebSocket.OPEN) ws.socket.close(); if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null; localStorage.removeItem('fakesterGame'); }
                     screenHistory = ['auth-screen']; showScreen('auth-screen'); document.body.classList.add('is-guest'); setLoading(false);
                }
            });

            console.log("Getting initial session...");
            const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
            if(sessionError){ console.error("Error getting initial session:", sessionError); showScreen('auth-screen'); setLoading(false); }
            else if (!initialSession) { if (!document.getElementById('auth-screen')?.classList.contains('active')) { console.log("Initial check: No session, showing auth screen."); showScreen('auth-screen'); } else { console.log("Initial check: No session, auth screen already active."); } setLoading(false); }
            // If session exists, onAuthStateChange will trigger initializeApp

            addEventListeners(); // Add listeners after Supabase client is ready

        } catch (error) {
            console.error("FATAL ERROR during Supabase initialization:", error);
            document.body.innerHTML = `<div class="fatal-error"><h1>Initialisierungsfehler</h1><p>Die Anwendung konnte nicht geladen werden. Bitte versuche es später erneut.</p><p class="error-details">Fehler: ${error.message}</p></div>`;
            setLoading(false);
        }
    }

    // --- Main Execution ---
    initializeSupabase();
});
