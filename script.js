// script.js - FINAL VERSION

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
    let ownedColorIds = new Set(); // <-- HINZUGEFÜGT
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
    const achievementsList = [ { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' }, { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig (gesamt).' }, { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' }, { id: 4, name: 'Historiker', description: 'Gewinne eine Timeline-Runde.' }, { id: 5, name: 'Trendsetter', description: 'Gewinne eine Fame-Runde.' }, { id: 6, name: 'Musik-Lexikon', description: 'Beantworte 500 Fragen richtig (gesamt).' }, { id: 7, name: 'Unbesiegbar', description: 'Gewinne 5 Spiele in Folge.' }, { id: 8, name: 'Jahrhundert-Genie', description: 'Errate das Jahr 25 Mal exakt (gesamt).' }, { id: 9, name: 'Spotify-Junkie', description: 'Verbinde dein Spotify-Konto.' }, { id: 10, name: 'Gastgeber', description: 'Hoste dein erstes Spiel.' }, { id: 11, name: 'Party-Löwe', description: 'Spiele mit 3+ Freunden (in einer Lobby).' }, { id: 12, name: 'Knapp Daneben', description: 'Antworte 5 Mal falsch in einem Spiel.' }, { id: 13, name: 'Präzisionsarbeit', description: 'Errate Titel, Künstler UND Jahr exakt in einer Runde (Quiz).'}, { id: 14, name: 'Sozial Vernetzt', description: 'Füge deinen ersten Freund hinzu.' }, { id: 15, name: 'Sammler', description: 'Schalte 5 Titel frei.' }, { id: 16, name: 'Icon-Liebhaber', description: 'Schalte 5 Icons frei.' }, { id: 17, name: 'Aufwärmrunde', description: 'Spiele 3 Spiele.' }, { id: 18, name: 'Highscorer', description: 'Erreiche über 1000 Punkte in einem Spiel.' }, { id: 19, name: 'Perfektionist', description: 'Beantworte alle Fragen in einem Spiel richtig (min. 5 Runden).'}, { id: 20, name: 'Dabei sein ist alles', description: 'Verliere 3 Spiele.'} ];
    const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100));
    const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1);
    // Kombinierte Item-Listen (mit type Property)
    const titlesList = [
        { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1, type:'title' },
        { id: 2, name: 'Musik-Kenner', unlockType: 'achievement', unlockValue: 2, type:'title' },
        { id: 3, name: 'Legende', unlockType: 'achievement', unlockValue: 3, type:'title' },
        { id: 4, name: 'Zeitreisender', unlockType: 'achievement', unlockValue: 4, type:'title' },
        { id: 5, name: 'Star-Experte', unlockType: 'achievement', unlockValue: 5, type:'title' },
        { id: 6, name: 'Pechvogel', unlockType: 'achievement', unlockValue: 12, type:'title' },
        { id: 7, name: 'Präzise', unlockType: 'achievement', unlockValue: 13, type:'title' },
        { id: 8, name: 'Gesellig', unlockType: 'achievement', unlockValue: 14, type:'title' },
        { id: 9, name: 'Sammler', unlockType: 'achievement', unlockValue: 15, type:'title' },
        { id: 10, name: 'Kenner', unlockType: 'level', unlockValue: 5, type:'title' },
        { id: 11, name: 'Experte', unlockType: 'level', unlockValue: 10, type:'title' },
        { id: 12, name: 'Meister', unlockType: 'level', unlockValue: 15, type:'title' },
        { id: 13, name: 'Virtuose', unlockType: 'level', unlockValue: 20, type:'title' },
        { id: 14, name: 'Maestro', unlockType: 'level', unlockValue: 25, type:'title' },
        { id: 15, name: 'Großmeister', unlockType: 'level', unlockValue: 30, type:'title' },
        { id: 16, name: 'Orakel', unlockType: 'level', unlockValue: 40, type:'title' },
        { id: 17, name: 'Musikgott', unlockType: 'level', unlockValue: 50, type:'title' },
        { id: 18, name: 'Perfektionist', unlockType: 'achievement', unlockValue: 19, type:'title' },
        { id: 19, name: 'Highscorer', unlockType: 'achievement', unlockValue: 18, type:'title' },
        { id: 20, name: 'Dauerbrenner', unlockType: 'achievement', unlockValue: 17, type:'title' },
        { id: 101, name: 'Musik-Guru', unlockType: 'spots', cost: 100, unlockValue: 100, description: 'Nur im Shop', type:'title' },
        { id: 102, name: 'Playlist-Meister', unlockType: 'spots', cost: 150, unlockValue: 150, description: 'Nur im Shop', type:'title' },
        { id: 99, name: 'Entwickler', iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Titel', type:'title' }
    ];
    const iconsList = [
        { id: 1, iconClass: 'fa-user', unlockType: 'level', unlockValue: 1, description: 'Standard-Icon', type:'icon' },
        { id: 2, iconClass: 'fa-music', unlockType: 'level', unlockValue: 5, description: 'Erreiche Level 5', type:'icon' },
        { id: 3, iconClass: 'fa-star', unlockType: 'level', unlockValue: 10, description: 'Erreiche Level 10', type:'icon' },
        { id: 4, iconClass: 'fa-trophy', unlockType: 'achievement', unlockValue: 3, description: 'Erfolg: Seriensieger', type:'icon' },
        { id: 5, iconClass: 'fa-crown', unlockType: 'level', unlockValue: 20, description: 'Erreiche Level 20', type:'icon' },
        { id: 6, iconClass: 'fa-headphones', unlockType: 'achievement', unlockValue: 2, description: 'Erfolg: Besserwisser', type:'icon' },
        { id: 7, iconClass: 'fa-guitar', unlockType: 'level', unlockValue: 15, description: 'Erreiche Level 15', type:'icon' },
        { id: 8, iconClass: 'fa-bolt', unlockType: 'level', unlockValue: 25, description: 'Erreiche Level 25', type:'icon' },
        { id: 9, iconClass: 'fa-record-vinyl', unlockType: 'level', unlockValue: 30, description: 'Erreiche Level 30', type:'icon' },
        { id: 10, iconClass: 'fa-fire', unlockType: 'level', unlockValue: 40, description: 'Erreiche Level 40', type:'icon' },
        { id: 11, iconClass: 'fa-ghost', unlockType: 'level', unlockValue: 45, description: 'Erreiche Level 45', type:'icon' },
        { id: 12, iconClass: 'fa-meteor', unlockType: 'level', unlockValue: 50, description: 'Erreiche Level 50', type:'icon' },
        { id: 13, iconClass: 'fa-icons', unlockType: 'achievement', unlockValue: 16, description: 'Erfolg: Icon-Liebhaber', type:'icon'},
        
        // FIX: 'name' HINZUGEFÜGT
        { id: 201, name: 'Diamant', iconClass: 'fa-diamond', unlockType: 'spots', cost: 250, unlockValue: 250, description: 'Nur im Shop', type:'icon' },
        { id: 202, name: 'Zauberhut', iconClass: 'fa-hat-wizard', unlockType: 'spots', cost: 300, unlockValue: 300, description: 'Nur im Shop', type:'icon' },
        
        { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon', type:'icon' }
    ];
    const backgroundsList = [
        { id: 'default', name: 'Standard', imageUrl: '', cost: 0, unlockType: 'free', type: 'background', backgroundId: 'default'},
        { id: '301', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '301'},
        { id: '302', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', unlockValue: 600, type: 'background', backgroundId: '302'},
    ];
    
    // NEU: Namensfarben-Liste
    const nameColorsList = [
        { id: 501, name: 'Giftgrün', type: 'color', colorHex: '#00FF00', cost: 750, unlockType: 'spots', description: 'Ein knalliges Grün.' },
        { id: 502, name: 'Leuchtend Pink', type: 'color', colorHex: '#FF00FF', cost: 750, unlockType: 'spots', description: 'Ein echter Hingucker.' },
        { id: 503, name: 'Gold', type: 'color', colorHex: '#FFD700', cost: 1500, unlockType: 'spots', description: 'Zeig deinen Status.' }
    ];
    
    // 'consumablesList' entfernt

    // ANGEPASST: allItems (mit Colors, ohne Consumables)
    const allItems = [...titlesList, ...iconsList, ...backgroundsList, ...nameColorsList];
    
    // Mache Listen global verfügbar
    window.titlesList = titlesList;
    window.iconsList = iconsList;
    window.backgroundsList = backgroundsList;
    window.nameColorsList = nameColorsList; // <-- NEU
    // 'consumablesList' entfernt
    window.allItems = allItems;

    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    // --- DOM Element References ---
    const elements = {
        screens: document.querySelectorAll('.screen'), leaveGameButton: document.getElementById('leave-game-button'), loadingOverlay: document.getElementById('loading-overlay'), countdownOverlay: document.getElementById('countdown-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form') },
        home: { 
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
            spotifyConnectBtn: document.getElementById('spotify-connect-button') // <-- KORREKTUR: Hinzugefügt
        },
        modeSelection: { container: document.getElementById('mode-selection-screen')?.querySelector('.mode-selection-container') },
        lobby: { pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'), deviceSelectBtn: document.getElementById('device-select-button'), playlistSelectBtn: document.getElementById('playlist-select-button'), startGameBtn: document.getElementById('start-game-button'), inviteFriendsBtn: document.getElementById('invite-friends-button'), songCountPresets: document.getElementById('song-count-presets'), guessTimePresets: document.getElementById('guess-time-presets'), answerTypeContainer: document.getElementById('answer-type-container'), answerTypePresets: document.getElementById('answer-type-presets'), reactionButtons: document.getElementById('reaction-buttons'), backgroundSelectButton: document.getElementById('select-background-button') },
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
        // GEÄNDERT: consumablesList -> colorsList
        shop: { screen: document.getElementById('shop-screen'), titlesList: document.getElementById('shop-titles-list'), iconsList: document.getElementById('shop-icons-list'), backgroundsList: document.getElementById('shop-backgrounds-list'), colorsList: document.getElementById('shop-colors-list'), spotsBalance: document.getElementById('shop-spots-balance'), },
        backgroundSelectModal: { overlay: document.getElementById('background-select-modal-overlay'), closeBtn: document.getElementById('close-background-select-modal'), list: document.getElementById('owned-backgrounds-list'), },
    };


    // --- Core Functions ---
    const showToast = (message, isError = false) => { console.log(`Toast: ${message} (Error: ${isError})`); Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast(); }
    const showScreen = (screenId) => { console.log(`Navigating to screen: ${screenId}`); const targetScreen = document.getElementById(screenId); if (!targetScreen) { console.error(`Screen with ID "${screenId}" not found!`); return; } const currentScreenId = screenHistory[screenHistory.length - 1]; if (screenId !== currentScreenId) screenHistory.push(screenId); elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const goBack = () => { if (screenHistory.length > 1) { const currentScreenId = screenHistory.pop(); const previousScreenId = screenHistory[screenHistory.length - 1]; console.log(`Navigating back to screen: ${previousScreenId}`); if (['game-screen', 'lobby-screen'].includes(currentScreenId)) { elements.leaveConfirmModal.overlay.classList.remove('hidden'); screenHistory.push(currentScreenId); return; } const targetScreen = document.getElementById(previousScreenId); if (!targetScreen) { console.error(`Back navigation failed: Screen "${previousScreenId}" not found!`); screenHistory = ['auth-screen']; window.location.reload(); return; } elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(previousScreenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); } };
    const setLoading = (isLoading) => { console.log(`Setting loading overlay: ${isLoading}`); elements.loadingOverlay.classList.toggle('hidden', !isLoading); }
    const showConfirmModal = (title, text, onConfirm) => { elements.confirmActionModal.title.textContent = title; elements.confirmActionModal.text.textContent = text; currentConfirmAction = onConfirm; elements.confirmActionModal.overlay.classList.remove('hidden'); };

    // --- Helper Functions ---
    function isItemUnlocked(item, currentLevel) {
        if (!item || !currentUser ) return false;
        if (!currentUser.isGuest && currentUser.username.toLowerCase() === 'taubey') return true;

        if (item.unlockType === 'spots') {
             if (currentUser.isGuest) return false;
            if (item.type === 'title') return ownedTitleIds.has(item.id);
            if (item.type === 'icon') return ownedIconIds.has(item.id);
            if (item.type === 'background') return ownedBackgroundIds.has(item.backgroundId);
            if (item.type === 'color') return ownedColorIds.has(item.id); // <-- NEU
        }

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
        if (item.unlockType === 'spots') return `Kosten: ${item.cost} 🎵`;
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
        const spots = userProfile?.spots ?? 0;
        if (elements.home.spotsBalance) elements.home.spotsBalance.textContent = spots;
        if (elements.shop.spotsBalance) elements.shop.spotsBalance.textContent = spots;
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
            userUnlockedAchievementIds = []; ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); inventory = {};
        } else {
            currentUser = { id: user.id, username: fallbackUsername, isGuest };
            userProfile = { ...fallbackProfile, id: user.id, username: currentUser.username };
            userUnlockedAchievementIds = []; ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); inventory = {};
        }

        console.log("Setting up initial UI with fallback data...");
        document.body.classList.toggle('is-guest', isGuest);
        if(document.getElementById('welcome-nickname')) document.getElementById('welcome-nickname').textContent = currentUser.username;
        if(document.getElementById('profile-title')) equipTitle(userProfile.equipped_title_id || 1, false);
        if(elements.home.profileIcon) equipIcon(userProfile.equipped_icon_id || 1, false);
        if(elements.home.profileLevel) updatePlayerProgressDisplay();
        if(elements.stats.gamesPlayed) updateStatsDisplay();
        updateSpotsDisplay();
        if(elements.achievements.grid) renderAchievements(); // Zeigt jetzt sortiert an
        if(elements.titles.list) renderTitles();
        if(elements.icons.list) renderIcons();
        if(elements.levelProgress.list) renderLevelProgress(); // Mit Korrektur

        console.log("Showing home screen (non-blocking)...");
        showScreen('home-screen');
        setLoading(false);

        // === DATEN IM HINTERGRUND LADEN (nur für eingeloggte User) ===
        if (!isGuest && supabase) {
            console.log("Fetching profile, owned items, achievements, and Spotify status in background...");
            // ### HINWEIS: Dieser Teil muss an deine 'user_owned_items' Tabelle angepasst werden! ###
            // Dein aktueller Code holt 'user_owned_titles', 'user_owned_icons', etc.
            // Wenn du auf 'user_owned_items' umstellst, muss dieser Lade-Vorgang angepasst werden.
            Promise.all([
                supabase.from('profiles').select('*').eq('id', user.id).single(),
                // LÄDT NOCH ALTE TABELLEN! MUSS ANGEPASST WERDEN, WENN DU UMSTELLST.
                supabase.from('user_owned_titles').select('title_id').eq('user_id', user.id),
                supabase.from('user_owned_icons').select('icon_id').eq('user_id', user.id),
                supabase.from('user_owned_backgrounds').select('background_id').eq('user_id', user.id),
                // Hier müsste man 'user_owned_items' abfragen und dann aufteilen
                // supabase.from('user_owned_items').select('item_id, item_type').eq('user_id', user.id),
                supabase.from('user_inventory').select('item_id, quantity').eq('user_id', user.id)
            ]).then((results) => {
                const [profileResult, titlesResult, iconsResult, backgroundsResult, inventoryResult] = results;
                // 1. Profil verarbeiten
                if (profileResult.error || !profileResult.data) { console.error("BG Profile Error:", profileResult.error || "No data"); if (!profileResult.error?.details?.includes("0 rows")) showToast("Fehler beim Laden des Profils.", true); document.getElementById('welcome-nickname').textContent = currentUser.username; updatePlayerProgressDisplay(); updateStatsDisplay(); updateSpotsDisplay(); }
                else { userProfile = profileResult.data; currentUser.username = profileResult.data.username; console.log("BG Profile fetched:", userProfile); document.getElementById('welcome-nickname').textContent = currentUser.username; equipTitle(userProfile.equipped_title_id || 1, false); equipIcon(userProfile.equipped_icon_id || 1, false); updatePlayerProgressDisplay(); updateStatsDisplay(); updateSpotsDisplay(); }
                 
                 // 2. Besitz verarbeiten (Noch alte Logik, muss auf 'user_owned_items' umgestellt werden)
                 ownedTitleIds = new Set(titlesResult.data?.map(t => t.title_id) || []); 
                 ownedIconIds = new Set(iconsResult.data?.map(i => i.icon_id) || []); 
                 ownedBackgroundIds = new Set(backgroundsResult.data?.map(b => b.background_id) || []); 
                 // ownedColorIds = new Set(itemsData.filter(i => i.item_type === 'color').map(i => i.item_id));
                 inventory = {}; inventoryResult.data?.forEach(item => inventory[item.item_id] = item.quantity); 
                 
                 console.log("BG Owned items fetched:", { T: ownedTitleIds.size, I: ownedIconIds.size, B: ownedBackgroundIds.size, C: ownedColorIds.size, Inv: Object.keys(inventory).length });
                 
                 // UI neu rendern, die von Besitz/Level abhängt
                 if(elements.titles.list) renderTitles(); if(elements.icons.list) renderIcons(); if(elements.levelProgress.list) renderLevelProgress();
                
                // 3. Erfolge laden
                return supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id);
            })
            .then(({ data: achievements, error: achError }) => {
                 // 4. Erfolge verarbeiten
                if (achError) { console.error("BG Achievement Error:", achError); userUnlockedAchievementIds = []; }
                else { userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id)); console.log("BG Achievements fetched:", userUnlockedAchievementIds); }
                 // UI neu rendern, die von Erfolgen abhängt
                 if(elements.achievements.grid) renderAchievements(); if(elements.titles.list) renderTitles(); if(elements.icons.list) renderIcons();
                // 5. Spotify Status prüfen & Erfolg vergeben
                 console.log("Checking Spotify status after achievements (async)..."); return checkSpotifyStatus();
            })
             .then(() => {
                 console.log("Spotify status checked after achievements (async).");
                 // HIER ERST Prüfen und Awarden (nachdem userUnlockedAchievementIds bekannt ist)
                 if (spotifyToken && !userUnlockedAchievementIds.includes(9)) { awardClientSideAchievement(9); }
                 console.log("Connecting WebSocket for logged-in user (after async loads)..."); connectWebSocket();
            })
            .catch(error => { console.error("Error during background data loading chain:", error); showToast("Fehler beim Laden einiger Daten.", true); console.log("Connecting WebSocket despite background load error..."); connectWebSocket(); });
        } else { // Für Gäste
             console.log("Connecting WebSocket for guest..."); 
             // KORREKTUR: Spotify-Status auch für Gäste prüfen (damit Button verschwindet, falls Cookie da ist)
             checkSpotifyStatus();
             connectWebSocket();
        }
        console.log("initializeApp finished (non-blocking setup complete).");
    };


    // ### START KORRIGIERTER BLOCK ###
    const checkSpotifyStatus = async () => {
        if (currentUser && currentUser.isGuest) {
            console.log("Guest mode, hiding Spotify connect button.");
            elements.home.spotifyConnectBtn?.classList.add('guest-hidden'); // Versteckt ihn via CSS-Regel
            elements.home.createRoomBtn?.classList.add('hidden'); // Zeige "Raum erstellen" NICHT für Gäste
            return;
        }

        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data.loggedIn && data.token) {
                console.log("Spotify is connected.");
                spotifyToken = data.token;
                // UI aktualisieren: Verstecke "Verbinden", zeige "Erstellen"
                elements.home.spotifyConnectBtn?.classList.add('hidden');
                elements.home.createRoomBtn?.classList.remove('hidden');
                
                // Erfolg clientseitig vergeben, falls noch nicht vorhanden
                if (currentUser && !currentUser.isGuest && !userUnlockedAchievementIds.includes(9)) {
                    awardClientSideAchievement(9);
                }
            } else {
                console.log("Spotify is NOT connected.");
                spotifyToken = null;
                // UI aktualisieren: Zeige "Verbinden", verstecke "Erstellen"
                elements.home.spotifyConnectBtn?.classList.remove('hidden');
                elements.home.createRoomBtn?.classList.add('hidden');
            }
        } catch (error) {
            console.error("Error checking Spotify status:", error);
            spotifyToken = null;
            elements.home.spotifyConnectBtn?.classList.remove('hidden');
            elements.home.createRoomBtn?.classList.add('hidden');
        }
    };

    const handleAuthAction = async (action, form, isRegister = false) => {
        if (!supabase) {
            showToast("Verbindung wird aufgebaut, bitte warte...", true);
            return;
        }
        setLoading(true);
        const formData = new FormData(form);
        const credentials = {};
        let username;
        
        if (isRegister) {
            username = formData.get('username'); // 'register-username'
            credentials.email = `${username}@fakester.app`; // Dummy-E-Mail
            credentials.password = formData.get('password'); // 'register-password'
            credentials.options = {
                data: {
                    username: username,
                    xp: 0,
                    spots: 100, // Start-Spots
                    equipped_title_id: 1,
                    equipped_icon_id: 1
                }
            };
        } else {
            username = formData.get('username'); // 'login-username'
            credentials.email = `${username}@fakester.app`; // Dummy-E-Mail
            credentials.password = formData.get('password'); // 'login-password'
        }

        const { data, error } = isRegister ? 
            await action(credentials) : 
            await action(credentials);

        setLoading(false);
        if (error) {
            console.error(`Auth Error (${isRegister ? 'Register' : 'Login'}):`, error);
            showToast(error.message, true);
        } else if (data.user) {
            console.log(`Auth Success (${isRegister ? 'Register' : 'Login'}):`, data.user.id);
            // onAuthStateChange wird dies automatisch handhaben und initializeApp aufrufen
        } else {
            console.warn("Auth: Kein Fehler, aber auch keine User-Daten.");
        }
    };

    const handleLogout = async () => {
        if (!supabase) return;
        
        showConfirmModal("Abmelden", "Möchtest du dich wirklich abmelden?", async () => {
            setLoading(true);
            console.log("Logging out...");
            
            // 1. Supabase-Sitzung beenden
            const { error: signOutError } = await supabase.auth.signOut();
            
            // 2. Spotify-Cookie (via Server) löschen
            try {
                await fetch('/logout', { method: 'POST' });
                console.log("Spotify cookie cleared.");
            } catch (fetchError) {
                console.error("Error clearing Spotify cookie:", fetchError);
            }
            
            setLoading(false);
            if (signOutError) {
                console.error("SignOut Error:", signOutError);
                showToast(signOutError.message, true);
            } else {
                console.log("Logout successful.");
                // onAuthStateChange fängt 'SIGNED_OUT' auf und kümmert sich um den Rest:
                // - currentUser = null
                // - spotifyToken = null
                // - UI zurücksetzen
                // - showScreen('auth-screen')
            }
        });
    };
    // ### ENDE KORRIGIERTER BLOCK ###


    const awardClientSideAchievement = (achievementId) => { // 'async' entfernt, mit doppelter Prüfung
        if (!currentUser || currentUser.isGuest || !supabase || userUnlockedAchievementIds.includes(achievementId)) { if(userUnlockedAchievementIds.includes(achievementId)) { console.log(`Achievement ${achievementId} already in list, not awarding again.`); } return; }
        console.log(`Awarding client-side achievement: ${achievementId}`);
        userUnlockedAchievementIds.push(achievementId);
        const achievement = achievementsList.find(a => a.id === achievementId);
        showToast(`Erfolg freigeschaltet: ${achievement?.name || `ID ${achievementId}`}!`);
        if(elements.achievements.grid) renderAchievements(); if(elements.titles.list) renderTitles(); if(elements.icons.list) renderIcons();
        supabase.from('user_achievements').insert({ user_id: currentUser.id, achievement_id: achievementId })
            .then(({ error }) => { if (error) { console.error(`Fehler beim Speichern von Client-Achievement ${achievementId} im Hintergrund:`, error); } else { console.log(`Client-Achievement ${achievementId} erfolgreich im Hintergrund gespeichert.`); } });
    };
    const connectWebSocket = () => { /* ... bleibt gleich ... */ };
    const handleWebSocketMessage = ({ type, payload }) => { /* ... mit 'player-reacted' und 'profile-update' case ... */ };

    // --- UI Rendering Functions ---
    function renderPlayerList(players, hostId) { /* ... bleibt gleich ... */ }
    function updateHostSettings(settings, isHost) { /* ... mit Hintergrund Button Logik ... */ }
    function renderAchievements() { /* ... sortierte Version ... */ }
    async function equipTitle(titleId, saveToDb = true) { /* ... bleibt gleich ... */ }
    function renderTitles() { /* ... mit Prüfung isItemUnlocked und 'Gekauft' Text ... */ }
    async function equipIcon(iconId, saveToDb = true) { /* ... bleibt gleich ... */ }
    function renderIcons() { /* ... mit Prüfung isItemUnlocked und 'Gekauft' Text ... */ }
    function renderLevelProgress() { /* ... mit Korrektur für leere Belohnungen ... */ }
    function updatePlayerProgressDisplay() { /* ... bleibt gleich ... */ }
    async function updatePlayerProgress() { /* ... holt jetzt Profil komplett neu ... */ }
    function updateStatsDisplay() { /* ... bleibt gleich ... */ }

    // ### START ERSETZTER BLOCK ###
    // --- NEU: Shop Funktionen ---

    async function loadShopItems() {
        console.log("Loading shop items...");
        if (!userProfile) { 
            console.error("Cannot load shop, userProfile is missing."); 
            return; 
        }

        // Holt die Daten aus den globalen Listen (die schon in script.js existieren)
        const { titlesList, iconsList, backgroundsList, nameColorsList } = window;
        const userSpots = userProfile.spots ?? 0;
        
        // Kontostand im Shop-Header aktualisieren
        if(elements.shop.spotsBalance) elements.shop.spotsBalance.textContent = userSpots; 

        // Helper-Funktion, um eine Item-Liste zu rendern
        const renderList = (listElement, items, itemType) => {
            if (!listElement) {
                 console.warn(`Shop list element for type ${itemType} not found.`);
                 return;
            }
            
            let html = '';
            // Nur Items anzeigen, die man mit Spots kaufen kann
            const shopItems = items.filter(item => item.unlockType === 'spots');

            if (shopItems.length === 0) {
                listElement.innerHTML = '<p class="text-muted" style="text-align: center; grid-column: 1 / -1;">Keine Items in dieser Kategorie verfügbar.</p>';
                return;
            }

            shopItems.forEach(item => {
                let isOwned = false;
                // Prüfen, ob der User das Item schon besitzt
                if (itemType === 'title') isOwned = ownedTitleIds.has(item.id);
                else if (itemType === 'icon') isOwned = ownedIconIds.has(item.id);
                else if (itemType === 'background') isOwned = ownedBackgroundIds.has(item.backgroundId);
                else if (itemType === 'color') isOwned = ownedColorIds.has(item.id); // <-- NEU
                // Consumables (Verbrauchsgegenstände) sind nie "owned"
                
                html += renderShopItem(item, userSpots, isOwned);
            });
            listElement.innerHTML = html;
        };

        // Alle Shop-Sektionen rendern
        renderList(elements.shop.titlesList, titlesList, 'title');
        renderList(elements.shop.iconsList, iconsList, 'icon');
        renderList(elements.shop.backgroundsList, backgroundsList, 'background');
        renderList(elements.shop.colorsList, nameColorsList, 'color'); // <-- GEÄNDERT
    }

    function renderShopItem(item, userSpots, isOwned) {
        const canAfford = userSpots >= item.cost;
        const classList = ['shop-item'];
        
        // Logik für "Besessen" oder "Nicht leistbar"
        // Gilt nicht für Consumables, die kann man immer wieder kaufen
        if (item.type !== 'consumable') {
            if (isOwned) classList.push('owned');
            else if (!canAfford) classList.push('cannot-afford');
        }

        let previewHtml = '';
        // Vorschau basierend auf Item-Typ generieren
        if (item.type === 'icon') {
            previewHtml = `<div class="item-preview-icon"><i class="fa-solid ${item.iconClass || 'fa-question'}"></i></div>`;
        } else if (item.type === 'background') {
            const bgStyle = item.imageUrl ? `style="background-image: url('${item.imageUrl}')"` : 'style="background-color: var(--dark-grey);"';
            previewHtml = `<div class="item-preview-background" ${bgStyle}></div>`;
        
        // NEUE LOGIK FÜR FARBEN
        } else if (item.type === 'color') {
            previewHtml = `<div class="item-preview-color" style="background-color: ${item.colorHex || '#333'};"><i class="fa-solid fa-paint-brush"></i></div>`;
        } else if (item.type === 'consumable') {
            previewHtml = `<div class="item-preview-icon"><i class="fa-solid fa-box-open"></i></div>`; // (Fallback)
        } else if (item.type === 'title') {
            // BESSERES ICON
            previewHtml = `<div class="item-preview-icon"><i class="fa-solid fa-id-badge"></i></div>`;
        }

        let buttonHtml = '';
        const itemId = item.id; // Eindeutige ID (z.B. 101, 201, 301, 501)
        
        if (isOwned) {
            buttonHtml = '<button class="buy-button" disabled>Im Besitz</button>';
        } else {
            // Button deaktivieren, wenn nicht leistbar
            const isDisabled = !canAfford;
            buttonHtml = `<button class="buy-button" data-item-id="${itemId}" ${isDisabled ? 'disabled' : ''}>Kaufen</button>`;
        }
        
        // FIX: 'item.name' HINZUGEFÜGT (behebt "undefined")
        const itemName = item.name || 'Unbenanntes Item';
        const description = item.description || (item.type === 'title' ? 'Ein neuer Titel für dein Profil.' : item.type === 'icon' ? 'Ein neues Icon für dein Profil.' : item.type === 'background' ? 'Ein neuer Lobby-Hintergrund.' : 'Ein nützliches Item.');

        return `
            <div class="${classList.join(' ')}">
                ${previewHtml}
                <div class="item-name">${itemName}</div>
                <div class="item-description">${description}</div>
                <div class="item-cost">${item.cost} 🎵</div>
                ${buttonHtml}
            </div>
        `;
    }

    async function handleBuyItem(itemId) {
        if (!itemId) return;
        if (!supabase || !currentUser || currentUser.isGuest) {
            showToast("Du musst angemeldet sein, um Items zu kaufen.", true);
            return;
        }

        // Finde das Item in der globalen Liste (allItems)
        const item = allItems.find(i => i.id == itemId); 
        if (!item) {
            showToast("Item nicht gefunden.", true);
            console.error(`Item with ID ${itemId} not found in allItems list.`);
            return;
        }

        // Bestätigungs-Modal anzeigen
        showConfirmModal(
            'Kauf bestätigen',
            `Möchtest du "${item.name}" für ${item.cost} 🎵 Spots kaufen?`,
            async () => {
                // Diese Funktion wird ausgeführt, wenn der User "Bestätigen" klickt
                console.log(`Attempting to buy item: ${itemId} (${item.name})`);
                setLoading(true);
                
                try {
                    // 1. Auth-Token für den Server holen
                    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                    if (sessionError || !sessionData.session) {
                        throw new Error(sessionError?.message || "Du bist nicht authentifiziert.");
                    }
                    const token = sessionData.session.access_token;

                    // 2. Anfrage an deinen Server-Endpunkt senden (KORRIGIERTE URL)
                    const response = await fetch('/api/shop/buy', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ itemId: item.id }) // Sende die eindeutige ID
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        // Nimmt die Fehlermeldung vom Server (z.B. "Nicht genug Spots")
                        throw new Error(data.message || 'Ein unbekannter Fehler ist aufgetreten.');
                    }

                    // --- Erfolgsfall ---
                    showToast(data.message || 'Kauf erfolgreich!', false);

                    // 3. Client-Daten aktualisieren
                    userProfile.spots = data.newSpots; // Neuen Kontostand speichern
                    updateSpotsDisplay(); // Spots-Anzeige im Header aktualisieren

                    // 4. Besitz-Listen im Client aktualisieren (ANGEPASST)
                    if (data.itemType === 'title') {
                        ownedTitleIds.add(item.id);
                    } else if (data.itemType === 'icon') {
                        ownedIconIds.add(item.id);
                    } else if (data.itemType === 'background') {
                        ownedBackgroundIds.add(item.backgroundId);
                    } else if (data.itemType === 'color') {
                        ownedColorIds.add(item.id); // <-- NEU
                    }
                    // 'consumable' Logik entfernt

                    // 5. Shop UI neu laden, um "Im Besitz" / "Nicht leistbar" zu aktualisieren
                    await loadShopItems(); 
                    
                    // 6. Andere Screens (Titel/Icon-Auswahl) auch aktualisieren
                    if (elements.titles.list) renderTitles();
                    if (elements.icons.list) renderIcons();
                    // (Hier könnte man später noch renderColors() hinzufügen)

                } catch (error) {
                    console.error("Fehler beim Kaufen des Items:", error);
                    showToast(error.message || 'Kauf fehlgeschlagen.', true);
                } finally {
                    setLoading(false);
                }
            }
        );
    }
    // ### ENDE ERSETZTER BLOCK ###

    function showBackgroundSelectionModal() { /* ... bleibt gleich, prüft ownedBackgroundIds ... */ }
    function applyLobbyBackground(backgroundId) { /* ... bleibt gleich ... */ }
    function displayReaction(playerId, reaction) { /* ... bleibt gleich ... */ }
    async function handleGiftSpots(friendId, friendName) { /* ... bleibt gleich, nutzt Auth Token ... */ }

    // --- Game Logic Functions (Stubs) ---
    // (Diese müssen noch implementiert werden!)
    function showCountdown(round, total) { console.log("STUB: showCountdown"); }
    function setupPreRound(data) { console.log("STUB: setupPreRound"); }
    function setupNewRound(data) { console.log("STUB: setupNewRound"); }
    function showRoundResult(data) { console.log("STUB: showRoundResult"); }
    // --- Friends Modal Logic (Stubs) ---
    async function loadFriendsData() { console.log("STUB: loadFriendsData"); if (elements.friendsModal.friendsList) elements.friendsModal.friendsList.innerHTML = '<li>Lade Freunde... (STUB)</li>'; if(elements.friendsModal.requestsList) elements.friendsModal.requestsList.innerHTML = '<li>Lade Anfragen... (STUB)</li>'; /* TODO: Implement fetch logic */ }
    function renderRequestsList(requests) { console.log("STUB: renderRequestsList"); /* TODO: Implement */ }
    // renderFriendsList ist oben implementiert mit Gift Button
    // --- Utility & Modal Functions (Stubs) ---
    async function fetchHostData(isRefresh = false) { console.log("STUB: fetchHostData"); /* TODO: Implement Spotify API calls */ showToast("Geräte/Playlists laden (STUB)", false); return Promise.resolve(); } // return Promise
    function renderPaginatedPlaylists(playlistsToRender, page = 1) { console.log("STUB: renderPaginatedPlaylists"); if(elements.playlistSelectModal.list) elements.playlistSelectModal.list.innerHTML = '<li>Playlist 1 (STUB)</li><li>Playlist 2 (STUB)</li>'; /* TODO: Implement */ }
    function openCustomValueModal(type, title) { console.log("STUB: openCustomValueModal"); /* TODO: Implement */ }
    function showInvitePopup(from, pin) { console.log("STUB: showInvitePopup"); /* TODO: Implement */ }
    function handlePresetClick(e, groupId) { console.log(`STUB: handlePresetClick for group ${groupId}`); /* TODO: Implement update-settings call */ }
    async function handleRemoveFriend(friendId) { console.log(`STUB: handleRemoveFriend(${friendId})`); /* TODO: Implement Supabase call */ showToast("Freund entfernen (STUB)", true); }


    // --- Event Listeners (FINAL) ---
    function addEventListeners() {
        console.log("Adding all application event listeners...");
        // Navigation & Allgemein
        elements.leaveGameButton?.addEventListener('click', goBack);
        elements.leaveConfirmModal.cancelBtn?.addEventListener('click', () => elements.leaveConfirmModal.overlay.classList.add('hidden'));
        elements.leaveConfirmModal.confirmBtn?.addEventListener('click', () => { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type: 'leave-game', payload: { pin: currentGame.pin, playerId: currentGame.playerId } })); } localStorage.removeItem('fakesterGame'); currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] }; screenHistory = ['auth-screen', 'home-screen']; showScreen('home-screen'); elements.leaveConfirmModal.overlay.classList.add('hidden'); });
        // Auth Screen
        elements.auth.loginForm?.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.target, false); });
        elements.auth.registerForm?.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.target, true); });
        elements.auth.showRegister?.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
        elements.auth.showLogin?.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.remove('hidden'); elements.auth.registerForm.classList.add('hidden'); });
        // Gast Modal
        elements.guestModal.openBtn?.addEventListener('click', () => { elements.guestModal.overlay.classList.remove('hidden'); elements.guestModal.input.focus(); });
        elements.guestModal.closeBtn?.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.guestModal.submitBtn?.addEventListener('click', () => { const nickname = elements.guestModal.input.value; if (nickname.trim().length < 3 || nickname.trim().length > 15) { showToast("Nickname muss 3-15 Zeichen lang sein.", true); return; } elements.guestModal.overlay.classList.add('hidden'); initializeApp({ username: nickname }, true); });
        // Home Screen
        elements.home.logoutBtn?.addEventListener('click', handleLogout);
        elements.home.spotifyConnectBtn?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/login'; });
        elements.home.createRoomBtn?.addEventListener('click', () => showScreen('mode-selection-screen'));
        elements.home.joinRoomBtn?.addEventListener('click', () => { 
            // KORREKTUR: Prüfen, ob WS verbunden ist
            if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
                showToast("Verbindung zum Server wird aufgebaut...", true);
                return;
            }
            pinInput = ""; 
            elements.joinModal.pinDisplay.forEach(d => d.textContent = ""); 
            elements.joinModal.overlay.classList.remove('hidden'); 
        });
        elements.home.statsBtn?.addEventListener('click', () => showScreen('stats-screen'));
        elements.home.achievementsBtn?.addEventListener('click', () => showScreen('achievements-screen'));
        elements.home.levelProgressBtn?.addEventListener('click', () => showScreen('level-progress-screen'));
        elements.home.profileTitleBtn?.addEventListener('click', () => showScreen('title-selection-screen'));
        elements.home.profilePictureBtn?.addEventListener('click', () => showScreen('icon-selection-screen'));
        elements.home.friendsBtn?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { loadFriendsData(); elements.friendsModal.overlay.classList.remove('hidden'); } });
        elements.home.usernameContainer?.addEventListener('click', () => { if (!currentUser || currentUser.isGuest) return; elements.changeNameModal.input.value = currentUser.username; elements.changeNameModal.overlay.classList.remove('hidden'); elements.changeNameModal.input.focus(); });
        elements.home.shopButton?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { loadShopItems(); showScreen('shop-screen'); } });
        // Modus & Spieltyp Auswahl
        elements.modeSelection.container?.addEventListener('click', (e) => { const mb=e.target.closest('.mode-box'); if(mb && !mb.disabled){ selectedGameMode=mb.dataset.mode; console.log(`Mode: ${selectedGameMode}`); if (elements.gameTypeScreen.createLobbyBtn) elements.gameTypeScreen.createLobbyBtn.disabled=true; if (elements.gameTypeScreen.pointsBtn) elements.gameTypeScreen.pointsBtn.classList.remove('active'); if (elements.gameTypeScreen.livesBtn) elements.gameTypeScreen.livesBtn.classList.remove('active'); if (elements.gameTypeScreen.livesSettings) elements.gameTypeScreen.livesSettings.classList.add('hidden'); showScreen('game-type-selection-screen'); } });
        elements.gameTypeScreen.pointsBtn?.addEventListener('click', () => { gameCreationSettings.gameType='points'; elements.gameTypeScreen.pointsBtn.classList.add('active'); elements.gameTypeScreen.livesBtn.classList.remove('active'); elements.gameTypeScreen.livesSettings.classList.add('hidden'); elements.gameTypeScreen.createLobbyBtn.disabled=false; });
        elements.gameTypeScreen.livesBtn?.addEventListener('click', () => { gameCreationSettings.gameType='lives'; elements.gameTypeScreen.pointsBtn.classList.remove('active'); elements.gameTypeScreen.livesBtn.classList.add('active'); elements.gameTypeScreen.livesSettings.classList.remove('hidden'); elements.gameTypeScreen.createLobbyBtn.disabled=false; });
        elements.gameTypeScreen.livesPresets?.addEventListener('click', (e) => { const btn=e.target.closest('.preset-button'); if(btn){ elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); const v=btn.dataset.value; if(v==='custom'){ openCustomValueModal('lives', 'Leben (1-10)'); } else { gameCreationSettings.lives=parseInt(v); console.log(`Lives: ${gameCreationSettings.lives}`); } } });
        elements.gameTypeScreen.createLobbyBtn?.addEventListener('click', () => { if(!selectedGameMode || !gameCreationSettings.gameType){ showToast("Modus/Typ fehlt.", true); return; } if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN){ showToast("Keine Serververbindung.", true); return; } setLoading(true); ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: selectedGameMode, gameType: gameCreationSettings.gameType, lives: gameCreationSettings.gameType === 'lives' ? gameCreationSettings.lives : 3 } })); });
        // Lobby Screen
        elements.lobby.inviteFriendsBtn?.addEventListener('click', async () => { /* STUB */ console.log("Invite friends clicked"); showToast("Freunde einladen (STUB)", false); });
        elements.lobby.deviceSelectBtn?.addEventListener('click', async () => { setLoading(true); await fetchHostData(true); setLoading(false); elements.deviceSelectModal.overlay.classList.remove('hidden'); }); // Refresh on open
        elements.lobby.playlistSelectBtn?.addEventListener('click', async () => { setLoading(true); await fetchHostData(); setLoading(false); if (allPlaylists.length > 0) { renderPaginatedPlaylists(allPlaylists, 1); elements.playlistSelectModal.overlay.classList.remove('hidden'); } else { showToast("Keine Playlists gefunden.", true); } });
        elements.lobby.backgroundSelectButton?.addEventListener('click', showBackgroundSelectionModal);
        document.getElementById('host-settings')?.addEventListener('click', (e) => { const btn = e.target.closest('.preset-button'); if(btn && btn.closest('.preset-group')) { handlePresetClick(e, btn.closest('.preset-group').id); } });
        elements.lobby.startGameBtn?.addEventListener('click', () => { if (!elements.lobby.startGameBtn.disabled && ws.socket?.readyState === WebSocket.OPEN) { setLoading(true); ws.socket.send(JSON.stringify({ type: 'start-game', payload: { pin: currentGame.pin } })); } else { showToast("Wähle Gerät & Playlist.", true); } });
        elements.lobby.reactionButtons?.addEventListener('click', (e) => { const btn = e.target.closest('.reaction-btn'); if (btn && ws.socket?.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type: 'send-reaction', payload: { reaction: btn.dataset.reaction } })); } }); // Sende 'reaction' statt 'reactionType'
        // Item/Title/Icon Selection Screens
        elements.titles.list?.addEventListener('click', (e) => { const card = e.target.closest('.title-card:not(.locked)'); if (card) { equipTitle(parseInt(card.dataset.titleId), true); } });
        elements.icons.list?.addEventListener('click', (e) => { const card = e.target.closest('.icon-card:not(.locked)'); if (card) { equipIcon(parseInt(card.dataset.iconId), true); } });
        // Shop Screen
        elements.shop.screen?.addEventListener('click', (e) => { const buyBtn = e.target.closest('.buy-button:not([disabled])'); if (buyBtn) { handleBuyItem(buyBtn.dataset.itemId); } });
        // Modals
        document.querySelectorAll('.button-exit-modal').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.add('hidden')));
        elements.joinModal.numpad?.addEventListener('click', (e) => { const btn=e.target.closest('button'); if(!btn) return; const key=btn.dataset.key, action=btn.dataset.action; if(key >= '0' && key <= '9' && pinInput.length < 4) pinInput += key; else if(action==='clear'||action==='backspace') pinInput = pinInput.slice(0, -1); else if(action==='confirm' && pinInput.length===4){ if(!currentUser){ showToast("Anmelden/Gast zuerst.", true); return; } if(!ws.socket || ws.socket.readyState !== WebSocket.OPEN){ showToast("Keine Serververbindung.", true); return; } setLoading(true); ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } })); } elements.joinModal.pinDisplay.forEach((d,i)=>d.textContent=pinInput[i]||""); elements.joinModal.numpad.querySelector('[data-action="confirm"]').disabled = pinInput.length !== 4; });
        elements.friendsModal.tabsContainer?.addEventListener('click', (e) => { const tab = e.target.closest('.tab-button'); if (tab && !tab.classList.contains('active')) { elements.friendsModal.tabs.forEach(t => t.classList.remove('active')); elements.friendsModal.tabContents.forEach(c => c.classList.remove('active')); tab.classList.add('active'); document.getElementById(tab.dataset.tab)?.classList.add('active'); } });
        elements.friendsModal.addFriendBtn?.addEventListener('click', async () => { /* STUB */ const name = elements.friendsModal.addFriendInput.value; if(name) { console.log(`Adding friend: ${name}`); showToast(`Freund hinzufügen: ${name} (STUB)`, false); elements.friendsModal.addFriendInput.value = ''; }});
        elements.friendsModal.requestsList?.addEventListener('click', (e) => { /* STUB */ console.log("Request list clicked"); });
        elements.friendsModal.friendsList?.addEventListener('click', (e) => { const removeBtn = e.target.closest('.button-remove-friend'); const giftBtn = e.target.closest('.button-gift'); if (removeBtn) { handleRemoveFriend(removeBtn.dataset.friendId); } else if (giftBtn) { handleGiftSpots(giftBtn.dataset.friendId, giftBtn.dataset.friendName); } });
        elements.inviteFriendsModal.list?.addEventListener('click', (e) => { /* STUB */ console.log("Invite list clicked"); });
        elements.customValueModal.numpad?.addEventListener('click', (e) => { /* STUB */ console.log("Custom value numpad"); });
        elements.customValueModal.confirmBtn?.addEventListener('click', () => { /* STUB */ console.log("Confirm custom value"); });
        elements.changeNameModal.submitBtn?.addEventListener('click', async () => { /* STUB */ console.log("Change name submit"); showToast("Name ändern (STUB)", false); });
        elements.deviceSelectModal.refreshBtn?.addEventListener('click', () => fetchHostData(true));
        elements.deviceSelectModal.list?.addEventListener('click', (e) => { /* STUB */ console.log("Device selected"); });
        elements.playlistSelectModal.search?.addEventListener('input', () => { clearTimeout(elements.playlistSelectModal.search.debounceTimer); elements.playlistSelectModal.search.debounceTimer = setTimeout(() => { renderPaginatedPlaylists(allPlaylists, 1); }, 300); });
        elements.playlistSelectModal.list?.addEventListener('click', (e) => { /* STUB */ console.log("Playlist selected"); });
        elements.playlistSelectModal.pagination?.addEventListener('click', (e) => { /* STUB */ console.log("Pagination"); });
        elements.backgroundSelectModal.list?.addEventListener('click', (e) => { const li = e.target.closest('li[data-bg-id]'); if (li && ws.socket?.readyState === WebSocket.OPEN && currentGame.isHost) { const bgId = li.dataset.bgId; console.log(`Selected background: ${bgId}`); ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { chosenBackgroundId: bgId === 'default' ? null : bgId } })); elements.backgroundSelectModal.overlay.classList.add('hidden'); } });
        elements.confirmActionModal.cancelBtn?.addEventListener('click', () => { elements.confirmActionModal.overlay.classList.add('hidden'); currentConfirmAction = null; });
        elements.confirmActionModal.confirmBtn?.addEventListener('click', () => { if (typeof currentConfirmAction === 'function') { currentConfirmAction(); } elements.confirmActionModal.overlay.classList.add('hidden'); currentConfirmAction = null; });
        // Console Buttons
        toggleConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.toggle('hidden'));
        closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
        clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
        copyConsoleBtn?.addEventListener('click', () => { if (!consoleOutput) return; const txt = Array.from(consoleOutput.children).map(e => e.dataset.rawText || e.textContent).join('\n'); navigator.clipboard.writeText(txt).then(() => showToast('Logs kopiert!', false), err => { console.error('Fehler: Logs kopieren:', err); showToast('Kopieren fehlgeschlagen.', true); }); });
        console.log("All event listeners added.");
    }

    // --- Supabase Initialization (FINAL) ---
    async function initializeSupabase() {
        try {
            console.log("Fetching /api/config...");
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error(`Config fetch failed: ${response.statusText}`);
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) { throw new Error("Supabase config missing."); }

            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { global: { fetch: (...args) => window.fetch(...args) }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
            console.log("Supabase client initialized.");

            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`Supabase Auth Event: ${event}`, session ? `User: ${session.user.id}` : 'No session');
                if (event === 'SIGNED_OUT') { 
                    currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null; 
                    ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); inventory = {}; 
                    if (ws.socket?.readyState === WebSocket.OPEN) ws.socket.close(); 
                    if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null; 
                    localStorage.removeItem('fakesterGame'); 
                    screenHistory = ['auth-screen']; showScreen('auth-screen'); 
                    document.body.classList.add('is-guest'); 
                    setLoading(false); 
                    // KORREKTUR: UI-Buttons für Spotify zurücksetzen
                    elements.home.spotifyConnectBtn?.classList.remove('hidden');
                    elements.home.createRoomBtn?.classList.add('hidden');
                    return; 
                }
                if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                     if (!window.initializeAppRunning && (!currentUser || currentUser.id !== session.user.id)) {
                          window.initializeAppRunning = true; console.log(`Session available/updated for ${session.user.id}. Initializing app...`); setLoading(true); // Set loading HERE before non-blocking init
                          try { initializeApp(session.user, false); } // Non-blocking now
                          catch(initError) { console.error("Error calling initializeApp:", initError); setLoading(false); showScreen('auth-screen'); }
                          finally { window.initializeAppRunning = false; /* setLoading(false) is now inside initializeApp */ }
                     } else if (event === 'TOKEN_REFRESHED') { 
                         console.log("Token refreshed, checking Spotify status (async)..."); 
                         checkSpotifyStatus(); // Spotify-Status erneut prüfen
                    }
                     else if (!window.initializeAppRunning) { console.log("App already initialized for this session or init running."); }
                } else if (!session && !['USER_UPDATED', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED'].includes(event)) {
                     console.log(`No active session or invalid (Event: ${event}). Showing auth.`);
                     if (currentUser) { currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null; ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); inventory = {}; if (ws.socket?.readyState === WebSocket.OPEN) ws.socket.close(); if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null; localStorage.removeItem('fakesterGame'); }
                     screenHistory = ['auth-screen']; showScreen('auth-screen'); document.body.classList.add('is-guest'); setLoading(false);
                }
            });

            console.log("Getting initial session...");
            const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
            if(sessionError){ console.error("Error getting initial session:", sessionError); showScreen('auth-screen'); setLoading(false); }
            else if (!initialSession) { 
                if (!document.getElementById('auth-screen')?.classList.contains('active')) { console.log("Initial: No session, show auth."); showScreen('auth-screen'); } 
                else { console.log("Initial: No session, auth active."); } 
                setLoading(false); 
                checkSpotifyStatus(); // Prüfen, falls ein Gast-Cookie vorhanden ist
            }
            // If session exists, onAuthStateChange handles init
            
        } catch (error) { console.error("FATAL Supabase init error:", error); document.body.innerHTML = `<div class="fatal-error"><h1>Init Fehler</h1><p>App konnte nicht laden. (${error.message})</p></div>`; setLoading(false); }
    }

    // --- Main Execution ---
    addEventListeners();
    initializeSupabase();
});
