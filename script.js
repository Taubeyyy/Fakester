// script.js - FINAL VERSION (Mit allen Features & Bugfixes)
// KORREKTUR: supabase.auth.getSession() wird jetzt asynchron mit 'await' aufgerufen.

document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;

    // Globale Speicher für DB-Daten
    let userProfile = {};
    let userUnlockedAchievementIds = [];
    let onlineFriends = []; // Wird jetzt vom Server gefüllt
    let ownedTitleIds = new Set();
    let ownedIconIds = new Set();
    let ownedBackgroundIds = new Set();
    let ownedColorIds = new Set();
    let inventory = {};

    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [], players: [] };
    let screenHistory = ['auth-screen'];

    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3,
        guessTypes: ['title', 'artist'], // NEU: Standardwerte
        answerType: 'freestyle'          // NEU: Standardwerte
    };

    let allPlaylists = [], availableDevices = [], currentPage = 1, itemsPerPage = 10;
    let wsPingInterval = null;

    // --- On-Page Konsole Setup ---
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    const copyConsoleBtn = document.getElementById('copy-console-btn');
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

    // --- ERWEITERTE DATENBANKEN (MEHR CONTENT) ---
    const achievementsList = [ 
        { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' }, 
        { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig (gesamt).' }, 
        { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' }, 
        { id: 4, name: 'Historiker', description: 'Gewinne eine Timeline-Runde.' }, 
        { id: 5, name: 'Trendsetter', description: 'Gewinne eine Fame-Runde.' }, 
        { id: 6, name: 'Musik-Lexikon', description: 'Beantworte 500 Fragen richtig (gesamt).' }, 
        { id: 7, name: 'Unbesiegbar', description: 'Gewinne 5 Spiele in Folge.' }, 
        { id: 8, name: 'Jahrhundert-Genie', description: 'Errate das Jahr 25 Mal exakt (gesamt).' }, 
        { id: 9, name: 'Spotify-Junkie', description: 'Verbinde dein Spotify-Konto.' }, 
        { id: 10, name: 'Gastgeber', description: 'Hoste dein erstes Spiel.' }, 
        { id: 11, name: 'Party-Löwe', description: 'Spiele mit 3+ Freunden (in einer Lobby).' }, 
        { id: 12, name: 'Knapp Daneben', description: 'Antworte 5 Mal falsch in einem Spiel.' }, 
        { id: 13, name: 'Präzisionsarbeit', description: 'Errate Titel, Künstler UND Jahr exakt in einer Runde (Quiz).'}, 
        { id: 14, name: 'Sozial Vernetzt', description: 'Füge deinen ersten Freund hinzu.' }, 
        { id: 15, name: 'Sammler', description: 'Schalte 5 Titel frei.' }, 
        { id: 16, name: 'Icon-Liebhaber', description: 'Schalte 5 Icons frei.' }, 
        { id: 17, name: 'Aufwärmrunde', description: 'Spiele 3 Spiele.' }, 
        { id: 18, name: 'Highscorer', description: 'Erreiche über 1000 Punkte in einem Spiel.' }, 
        { id: 19, name: 'Perfektionist', description: 'Beantworte alle Fragen in einem Spiel richtig (min. 5 Runden).'}, 
        { id: 20, name: 'Dabei sein ist alles', description: 'Verliere 3 Spiele.'},
        { id: 21, name: 'Shopaholic', description: 'Kaufe deinen ersten Gegenstand im Shop.' },
        { id: 22, name: 'Millionär', description: 'Besitze 1000 Spots auf einmal.' },
        { id: 23, name: 'Level 10', description: 'Erreiche Level 10.' },
        { id: 24, name: 'Anpassungs-Künstler', description: 'Ändere dein Icon, Titel und Farbe.' }
    ];
    const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100));
    const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1);
    const titlesList = [ 
        { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1, type:'title' }, 
        { id: 10, name: 'Kenner', unlockType: 'level', unlockValue: 5, type:'title' }, 
        { id: 11, name: 'Experte', unlockType: 'level', unlockValue: 10, type:'title' }, 
        { id: 12, name: 'Meister', unlockType: 'level', unlockValue: 15, type:'title' }, 
        { id: 13, name: 'Virtuose', unlockType: 'level', unlockValue: 20, type:'title' }, 
        { id: 14, name: 'Maestro', unlockType: 'level', unlockValue: 25, type:'title' }, 
        { id: 15, name: 'Großmeister', unlockType: 'level', unlockValue: 30, type:'title' }, 
        { id: 16, name: 'Orakel', unlockType: 'level', unlockValue: 40, type:'title' }, 
        { id: 17, name: 'Musikgott', unlockType: 'level', unlockValue: 50, type:'title' },
        { id: 2, name: 'Besserwisser', unlockType: 'achievement', unlockValue: 2, type:'title' }, 
        { id: 3, name: 'Legende', unlockType: 'achievement', unlockValue: 3, type:'title' }, 
        { id: 4, name: 'Zeitreisender', unlockType: 'achievement', unlockValue: 4, type:'title' }, 
        { id: 5, name: 'Star-Experte', unlockType: 'achievement', unlockValue: 5, type:'title' }, 
        { id: 6, name: 'Pechvogel', unlockType: 'achievement', unlockValue: 12, type:'title' }, 
        { id: 7, name: 'Präzise', unlockType: 'achievement', unlockValue: 13, type:'title' }, 
        { id: 8, name: 'Gesellig', unlockType: 'achievement', unlockValue: 14, type:'title' }, 
        { id: 9, name: 'Sammler', unlockType: 'achievement', unlockValue: 15, type:'title' }, 
        { id: 18, name: 'Perfektionist', unlockType: 'achievement', unlockValue: 19, type:'title' }, 
        { id: 19, name: 'Highscorer', unlockType: 'achievement', unlockValue: 18, type:'title' }, 
        { id: 20, name: 'Dauerbrenner', unlockType: 'achievement', unlockValue: 17, type:'title' },
        { id: 21, name: 'Shopper', unlockType: 'achievement', unlockValue: 21, type:'title' },
        { id: 101, name: 'Musik-Guru', unlockType: 'spots', cost: 100, unlockValue: 100, description: 'Nur im Shop', type:'title' }, 
        { id: 102, name: 'Playlist-Meister', unlockType: 'spots', cost: 150, unlockValue: 150, description: 'Nur im Shop', type:'title' }, 
        { id: 103, name: 'Beat-Dropper', cost: 200, unlockType: 'spots', description: 'Nur im Shop', type:'title' }, 
        { id: 104, name: '80er-Kind', cost: 150, unlockType: 'spots', description: 'Nur im Shop', type:'title' }, 
        { id: 105, name: 'Gold-Kehlchen', cost: 300, unlockType: 'spots', description: 'Nur im Shop', type:'title' }, 
        { id: 106, name: 'Platin', cost: 1000, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 99, name: 'Entwickler', iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Titel', type:'title' } 
    ];
    const iconsList = [ 
        { id: 1, iconClass: 'fa-user', unlockType: 'level', unlockValue: 1, description: 'Standard-Icon', type:'icon' }, 
        { id: 2, iconClass: 'fa-music', unlockType: 'level', unlockValue: 5, description: 'Erreiche Level 5', type:'icon' }, 
        { id: 3, iconClass: 'fa-star', unlockType: 'level', unlockValue: 10, description: 'Erreiche Level 10', type:'icon' }, 
        { id: 7, iconClass: 'fa-guitar', unlockType: 'level', unlockValue: 15, description: 'Erreiche Level 15', type:'icon' }, 
        { id: 5, iconClass: 'fa-crown', unlockType: 'level', unlockValue: 20, description: 'Erreiche Level 20', type:'icon' }, 
        { id: 8, iconClass: 'fa-bolt', unlockType: 'level', unlockValue: 25, description: 'Erreiche Level 25', type:'icon' }, 
        { id: 9, iconClass: 'fa-record-vinyl', unlockType: 'level', unlockValue: 30, description: 'Erreiche Level 30', type:'icon' }, 
        { id: 10, name: 'Feuer', iconClass: 'fa-fire', unlockType: 'level', unlockValue: 40, description: 'Erreiche Level 40', type:'icon' }, 
        { id: 11, name: 'Geist', iconClass: 'fa-ghost', unlockType: 'level', unlockValue: 45, description: 'Erreiche Level 45', type:'icon' }, 
        { id: 12, name: 'Meteor', iconClass: 'fa-meteor', unlockType: 'level', unlockValue: 50, description: 'Erreiche Level 50', type:'icon' },
        { id: 4, iconClass: 'fa-trophy', unlockType: 'achievement', unlockValue: 3, description: 'Erfolg: Seriensieger', type:'icon' }, 
        { id: 6, iconClass: 'fa-headphones', unlockType: 'achievement', unlockValue: 2, description: 'Erfolg: Besserwisser', type:'icon' }, 
        { id: 13, iconClass: 'fa-icons', unlockType: 'achievement', unlockValue: 16, description: 'Erfolg: Icon-Liebhaber', type:'icon'},
        { id: 201, name: 'Diamant', iconClass: 'fa-diamond', unlockType: 'spots', cost: 250, unlockValue: 250, description: 'Nur im Shop', type:'icon' }, 
        { id: 202, name: 'Zauberhut', iconClass: 'fa-hat-wizard', unlockType: 'spots', cost: 300, unlockValue: 300, description: 'Nur im Shop', type:'icon' }, 
        { id: 203, type: 'icon', name: 'Raumschiff', iconClass: 'fa-rocket', cost: 400, unlockType: 'spots', description: 'Nur im Shop', type:'icon' }, 
        { id: 204, type: 'icon', name: 'Bombe', iconClass: 'fa-bomb', cost: 350, unlockType: 'spots', description: 'Nur im Shop', type:'icon' }, 
        { id: 205, type: 'icon', name: 'Ninja', iconClass: 'fa-user-secret', cost: 500, unlockType: 'spots', description: 'Nur im Shop', type:'icon' }, 
        { id: 206, type: 'icon', name: 'Drache', iconClass: 'fa-dragon', cost: 750, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon', type:'icon' } 
    ];
    const backgroundsList = [ { id: 'default', name: 'Standard', imageUrl: '', cost: 0, unlockType: 'free', type: 'background', backgroundId: 'default'}, { id: '301', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '301'}, { id: '302', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', unlockValue: 600, type: 'background', backgroundId: '302'}, { id: '303', type: 'background', name: 'Plattenladen', imageUrl: '/assets/img/bg_vinyl.jpg', cost: 700, unlockType: 'spots', description: 'Nur im Shop', backgroundId: '303'} ];
    const nameColorsList = [ { id: 501, name: 'Giftgrün', type: 'color', colorHex: '#00FF00', cost: 750, unlockType: 'spots', description: 'Ein knalliges Grün.' }, { id: 502, name: 'Leuchtend Pink', type: 'color', colorHex: '#FF00FF', cost: 750, unlockType: 'spots', description: 'Ein echter Hingucker.' }, { id: 503, name: 'Gold', type: 'color', colorHex: '#FFD700', cost: 1500, unlockType: 'spots', description: 'Zeig deinen Status.' }, { id: 504, name: 'Cyber-Blau', type: 'color', colorHex: '#00FFFF', cost: 1000, unlockType: 'spots', description: 'Neon-Look.' } ];
    const allItems = [...titlesList, ...iconsList, ...backgroundsList, ...nameColorsList];
    window.titlesList = titlesList; window.iconsList = iconsList; window.backgroundsList = backgroundsList; window.nameColorsList = nameColorsList; window.allItems = allItems;
    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    // --- DOM Element References ---
    const elements = { 
        screens: document.querySelectorAll('.screen'), 
        leaveGameButton: document.getElementById('leave-game-button'), 
        loadingOverlay: document.getElementById('loading-overlay'), 
        loadingOverlayMessage: document.getElementById('loading-overlay-message'),
        countdownOverlay: document.getElementById('countdown-overlay'), 
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form') }, 
        home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'), profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'), levelProgressBtn: document.getElementById('level-progress-button'), profileXpText: document.getElementById('profile-xp-text'), spotsBalance: document.getElementById('header-spots-balance'), shopButton: document.getElementById('shop-button'), spotifyConnectBtn: document.getElementById('spotify-connect-button'), customizationBtn: document.getElementById('customization-button') }, 
        modeSelection: { container: document.getElementById('mode-selection-screen')?.querySelector('.mode-selection-container') }, 
        lobby: { 
            pinDisplay: document.getElementById('lobby-pin'), 
            playerList: document.getElementById('player-list'), 
            hostSettings: document.getElementById('host-settings'), 
            guestWaitingMessage: document.getElementById('guest-waiting-message'), 
            deviceSelectBtn: document.getElementById('device-select-button'), 
            playlistSelectBtn: document.getElementById('playlist-select-button'), 
            startGameBtn: document.getElementById('start-game-button'), 
            inviteFriendsBtn: document.getElementById('invite-friends-button'), 
            songCountPresets: document.getElementById('song-count-presets'), 
            guessTimePresets: document.getElementById('guess-time-presets'), 
            backgroundSelectButton: document.getElementById('select-background-button'),
        }, 
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), gameContentArea: document.getElementById('game-content-area'), playerList: document.getElementById('game-player-list') }, 
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), input: document.getElementById('guest-nickname-input') }, 
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), }, 
        friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'), requestsCount: document.getElementById('requests-count'), tabsContainer: document.querySelector('.friends-modal .tabs'), tabs: document.querySelectorAll('.friends-modal .tab-button'), tabContents: document.querySelectorAll('.friends-modal .tab-content') }, 
        inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list') }, 
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')}, 
        achievements: { grid: document.getElementById('achievement-grid'), screen: document.getElementById('achievements-screen') }, 
        levelProgress: { list: document.getElementById('level-progress-list'), screen: document.getElementById('level-progress-screen') }, 
        titles: { list: document.getElementById('title-list'), screen: document.getElementById('title-selection-screen') }, 
        icons: { list: document.getElementById('icon-list'), screen: document.getElementById('icon-selection-screen') }, 
        gameTypeScreen: { 
            screen: document.getElementById('game-type-selection-screen'), 
            pointsBtn: document.getElementById('game-type-points'), 
            livesBtn: document.getElementById('game-type-lives'), 
            livesSettings: document.getElementById('lives-settings-container'), 
            livesPresets: document.getElementById('lives-count-presets'), 
            createLobbyBtn: document.getElementById('create-lobby-button'),
            quizSettingsContainer: document.getElementById('quiz-settings-container'), // NEU
            guessTypesCheckboxes: document.querySelectorAll('#guess-types-setting input[type="checkbox"]'), // NEU
            guessTypesError: document.getElementById('guess-types-error'), // NEU
            answerTypePresets: document.getElementById('answer-type-presets') // NEU
        }, 
        changeNameModal: { overlay: document.getElementById('change-name-modal-overlay'), closeBtn: document.getElementById('close-change-name-modal-button'), submitBtn: document.getElementById('change-name-submit'), input: document.getElementById('change-name-input'), }, 
        deviceSelectModal: { overlay: document.getElementById('device-select-modal-overlay'), closeBtn: document.getElementById('close-device-select-modal'), list: document.getElementById('device-list'), refreshBtn: document.getElementById('refresh-devices-button-modal'), }, 
        playlistSelectModal: { overlay: document.getElementById('playlist-select-modal-overlay'), closeBtn: document.getElementById('close-playlist-select-modal'), list: document.getElementById('playlist-list'), search: document.getElementById('playlist-search'), pagination: document.getElementById('playlist-pagination'), }, 
        leaveConfirmModal: { overlay: document.getElementById('leave-confirm-modal-overlay'), confirmBtn: document.getElementById('confirm-leave-button'), cancelBtn: document.getElementById('cancel-leave-button'), }, 
        confirmActionModal: { overlay: document.getElementById('confirm-action-modal-overlay'), title: document.getElementById('confirm-action-title'), text: document.getElementById('confirm-action-text'), confirmBtn: document.getElementById('confirm-action-confirm-button'), cancelBtn: document.getElementById('confirm-action-cancel-button'), }, 
        stats: { screen: document.getElementById('stats-screen'), gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'), highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'), gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'), }, 
        shop: { screen: document.getElementById('shop-screen'), titlesList: document.getElementById('shop-titles-list'), iconsList: document.getElementById('shop-icons-list'), backgroundsList: document.getElementById('shop-backgrounds-list'), colorsList: document.getElementById('shop-colors-list'), spotsBalance: document.getElementById('shop-spots-balance'), }, 
        customize: { 
            screen: document.getElementById('customization-screen'), 
            tabsContainer: document.getElementById('customization-tabs'), // NEU
            tabContents: document.querySelectorAll('#customization-screen .tab-content'), // NEU
            titlesList: document.getElementById('customize-title-list'), 
            iconsList: document.getElementById('customize-icon-list'), 
            colorsList: document.getElementById('customize-color-list'),
            backgroundsList: document.getElementById('owned-backgrounds-list') // NEU
        }, 
    };


    // --- Core Functions ---

    // ========================================================
    // POP-UP FUNKTION
    // ========================================================
    const showToast = (message, isError = false) => {
        if (typeof iziToast === 'undefined') {
            console.error("iziToast ist nicht geladen!");
            alert(`[${isError ? 'FEHLER' : 'INFO'}]\n${message}`);
            return;
        }
        
        console.log(`Toast: ${message} (Error: ${isError})`);
        
        iziToast.show({
            message: message,
            position: 'topCenter', 
            timeout: 3000,
            progressBarColor: isError ? 'var(--danger-color)' : 'var(--primary-color)',
            theme: 'dark',
            layout: 1,
            displayMode: 'replace',
            backgroundColor: 'var(--dark-grey)',
            messageColor: 'var(--text-color)',
            icon: isError ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-check',
            iconColor: isError ? 'var(--danger-color)' : 'var(--primary-color)',
        });
    }

    const showScreen = (screenId) => { console.log(`Navigating to screen: ${screenId}`); const targetScreen = document.getElementById(screenId); if (!targetScreen) { console.error(`Screen with ID "${screenId}" not found!`); return; } const currentScreenId = screenHistory[screenHistory.length - 1]; if (screenId !== currentScreenId) screenHistory.push(screenId); elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const goBack = () => { if (screenHistory.length > 1) { const currentScreenId = screenHistory.pop(); const previousScreenId = screenHistory[screenHistory.length - 1]; console.log(`Navigating back to screen: ${previousScreenId}`); if (['game-screen', 'lobby-screen'].includes(currentScreenId)) { elements.leaveConfirmModal.overlay.classList.remove('hidden'); screenHistory.push(currentScreenId); return; } const targetScreen = document.getElementById(previousScreenId); if (!targetScreen) { console.error(`Back navigation failed: Screen "${previousScreenId}" not found!`); screenHistory = ['auth-screen']; window.location.reload(); return; } elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(previousScreenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); } };
    
    const setLoading = (isLoading, message = null) => {
        console.log(`Setting loading overlay: ${isLoading}, Message: ${message}`);
        const overlay = elements.loadingOverlay;
        const overlayMessage = elements.loadingOverlayMessage;

        if (isLoading) {
            if (overlayMessage) {
                overlayMessage.textContent = message || '';
            }
            if (overlay) {
                overlay.classList.remove('hidden');
            }
            elements.countdownOverlay?.classList.add('hidden');
        } else {
            if (overlay) {
                overlay.classList.add('hidden');
            }
            elements.countdownOverlay?.classList.add('hidden');
            if (overlayMessage) {
                overlayMessage.textContent = '';
            }
        }
    }

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
            if (item.type === 'color') return ownedColorIds.has(item.id);
        } 
        
        switch (item.unlockType) { 
            case 'level': return currentLevel >= item.unlockValue; 
            case 'achievement': return userUnlockedAchievementIds.includes(item.unlockValue); 
            case 'special': return !currentUser.isGuest && currentUser.username.toLowerCase() === item.unlockValue.toLowerCase(); 
            case 'free': return true; 
            default: return false; 
        } 
    }
    function getUnlockDescription(item) { if (!item) return ''; if (item.unlockType === 'spots') return `Kosten: ${item.cost} 🎵`; switch (item.unlockType) { case 'level': return `Erreiche Level ${item.unlockValue}`; case 'achievement': const ach = achievementsList.find(a => a.id === item.unlockValue); return `Erfolg: ${ach ? ach.name : 'Unbekannt'}`; case 'special': return 'Spezial'; case 'free': return 'Standard'; default: return ''; } }
    function updateSpotsDisplay() { const spots = userProfile?.spots ?? 0; if (elements.home.spotsBalance) elements.home.spotsBalance.textContent = spots; if (elements.shop.spotsBalance) elements.shop.spotsBalance.textContent = spots; }


    // --- Initialization and Auth ---
    const initializeApp = (user, isGuest = false) => { 
        console.log(`initializeApp called for user: ${user.username || user.id}, isGuest: ${isGuest}`); 
        localStorage.removeItem('fakesterGame'); 
        const fallbackUsername = isGuest ? user.username : user.user_metadata?.username || user.email?.split('@')[0] || 'Unbekannt'; 
        const fallbackProfile = { id: user.id, username: fallbackUsername, xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, spots: 0, equipped_title_id: 1, equipped_icon_id: 1, equipped_color_id: null }; 
        
        if (isGuest) { 
            currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest }; 
            userProfile = { ...fallbackProfile, id: currentUser.id, username: currentUser.username }; 
            userUnlockedAchievementIds = []; 
            ownedTitleIds.clear(); 
            ownedIconIds.clear(); 
            ownedBackgroundIds.clear(); 
            ownedColorIds.clear();
            inventory = {}; 
        } else { 
            currentUser = { id: user.id, username: fallbackUsername, isGuest }; 
            userProfile = { ...fallbackProfile, id: user.id, username: currentUser.username }; 
            userUnlockedAchievementIds = []; 
            ownedTitleIds.clear(); 
            ownedIconIds.clear(); 
            ownedBackgroundIds.clear(); 
            ownedColorIds.clear();
            inventory = {}; 
        } 
        
        console.log("Setting up initial UI with fallback data..."); 
        document.body.classList.toggle('is-guest', isGuest); 
        if(document.getElementById('welcome-nickname')) document.getElementById('welcome-nickname').textContent = currentUser.username; 
        if(document.getElementById('profile-title')) equipTitle(userProfile.equipped_title_id || 1, false); 
        if(elements.home.profileIcon) equipIcon(userProfile.equipped_icon_id || 1, false);
        equipColor(userProfile.equipped_color_id, false); 
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
        
        if (!isGuest && supabase) { 
            console.log("Fetching profile, owned items, achievements, and Spotify status in background..."); 
            Promise.all([ 
                supabase.from('profiles').select('*').eq('id', user.id).single(), 
                supabase.from('user_owned_titles').select('title_id').eq('user_id', user.id), 
                supabase.from('user_owned_icons').select('icon_id').eq('user_id', user.id), 
                supabase.from('user_owned_backgrounds').select('background_id').eq('user_id', user.id),
                supabase.from('user_owned_colors').select('color_id').eq('user_id', user.id),
                supabase.from('user_inventory').select('item_id, quantity').eq('user_id', user.id) 
            ]).then((results) => { 
                const [profileResult, titlesResult, iconsResult, backgroundsResult, colorsResult, inventoryResult] = results; 
                if (profileResult.error || !profileResult.data) { 
                    console.error("BG Profile Error:", profileResult.error || "No data"); 
                    if (!profileResult.error?.details?.includes("0 rows")) showToast("Fehler beim Laden des Profils.", true); 
                    document.getElementById('welcome-nickname').textContent = currentUser.username; 
                    updatePlayerProgressDisplay(); 
                    updateStatsDisplay(); 
                    updateSpotsDisplay(); 
                } else { 
                    userProfile = profileResult.data; 
                    currentUser.username = profileResult.data.username; 
                    console.log("BG Profile fetched:", userProfile); 
                    document.getElementById('welcome-nickname').textContent = currentUser.username; 
                    equipTitle(userProfile.equipped_title_id || 1, false); 
                    equipIcon(userProfile.equipped_icon_id || 1, false); 
                    equipColor(userProfile.equipped_color_id, false);
                    updatePlayerProgressDisplay(); 
                    updateStatsDisplay(); 
                    updateSpotsDisplay(); 
                } 
                ownedTitleIds = new Set(titlesResult.data?.map(t => t.title_id) || []); 
                ownedIconIds = new Set(iconsResult.data?.map(i => i.icon_id) || []); 
                ownedBackgroundIds = new Set(backgroundsResult.data?.map(b => b.background_id) || []);
                ownedColorIds = new Set(colorsResult.data?.map(c => c.color_id) || []);
                inventory = {}; 
                inventoryResult.data?.forEach(item => inventory[item.item_id] = item.quantity); 
                console.log("BG Owned items fetched:", { T: ownedTitleIds.size, I: ownedIconIds.size, B: ownedBackgroundIds.size, C: ownedColorIds.size, Inv: Object.keys(inventory).length }); 
                if(elements.titles.list) renderTitles(); 
                if(elements.icons.list) renderIcons(); 
                if(elements.levelProgress.list) renderLevelProgress(); 
                return supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id); 
            }).then(({ data: achievements, error: achError }) => { 
                if (achError) { console.error("BG Achievement Error:", achError); userUnlockedAchievementIds = []; } 
                else { userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id)); console.log("BG Achievements fetched:", userUnlockedAchievementIds); } 
                if(elements.achievements.grid) renderAchievements(); 
                if(elements.titles.list) renderTitles(); 
                if(elements.icons.list) renderIcons(); 
                console.log("Checking Spotify status after achievements (async)..."); 
                return checkSpotifyStatus(); 
            }).then(() => { 
                console.log("Spotify status checked after achievements (async)."); 
                if (spotifyToken && !userUnlockedAchievementIds.includes(9)) { awardClientSideAchievement(9); } 
                console.log("Connecting WebSocket for logged-in user (after async loads)..."); 
                connectWebSocket(); 
            }).catch(error => { 
                console.error("Error during background data loading chain:", error); 
                showToast("Fehler beim Laden einiger Daten.", true); 
                console.log("Connecting WebSocket despite background load error..."); 
                connectWebSocket(); 
            }); 
        } else { 
            console.log("Connecting WebSocket for guest..."); 
            checkSpotifyStatus(); 
            connectWebSocket(); 
        } 
        console.log("initializeApp finished (non-blocking setup complete)."); 
    };
    const checkSpotifyStatus = async () => { if (currentUser && currentUser.isGuest) { console.log("Guest mode, hiding Spotify connect button."); elements.home.spotifyConnectBtn?.classList.add('guest-hidden'); elements.home.createRoomBtn?.classList.add('hidden'); return; } try { const response = await fetch('/api/status'); const data = await response.json(); if (data.loggedIn && data.token) { console.log("Spotify is connected."); spotifyToken = data.token; elements.home.spotifyConnectBtn?.classList.add('hidden'); elements.home.createRoomBtn?.classList.remove('hidden'); if (currentUser && !currentUser.isGuest && !userUnlockedAchievementIds.includes(9)) { awardClientSideAchievement(9); } } else { console.log("Spotify is NOT connected."); spotifyToken = null; elements.home.spotifyConnectBtn?.classList.remove('hidden'); elements.home.createRoomBtn?.classList.add('hidden'); } } catch (error) { console.error("Error checking Spotify status:", error); spotifyToken = null; elements.home.spotifyConnectBtn?.classList.remove('hidden'); elements.home.createRoomBtn?.classList.add('hidden'); } };
    const handleAuthAction = async (action, form, isRegister = false) => { 
        if (!supabase) { showToast("Verbindung wird aufgebaut, bitte warte...", true); return; } 
        setLoading(true, "Authentifiziere..."); 
        const formData = new FormData(form); 
        const credentials = {}; 
        let username; 
        if (isRegister) { 
            username = formData.get('username'); 
            credentials.email = `${username}@fakester.app`; 
            credentials.password = formData.get('password'); 
            credentials.options = { data: { username: username, xp: 0, spots: 100, equipped_title_id: 1, equipped_icon_id: 1, equipped_color_id: null } }; 
        } else { 
            username = formData.get('username'); 
            credentials.email = `${username}@fakester.app`; 
            credentials.password = formData.get('password'); 
        } 
        const { data, error } = await action(credentials); 
        setLoading(false); 
        if (error) { console.error(`Auth Error (${isRegister ? 'Register' : 'Login'}):`, error); showToast(error.message, true); } 
        else if (data.user) { console.log(`Auth Success (${isRegister ? 'Register' : 'Login'}):`, data.user.id); } 
        else { console.warn("Auth: Kein Fehler, aber auch keine User-Daten."); } 
    };
    const handleLogout = async () => { if (!supabase) return; showConfirmModal("Abmelden", "Möchtest du dich wirklich abmelden?", async () => { setLoading(true, "Melde ab..."); console.log("Logging out..."); const { error: signOutError } = await supabase.auth.signOut(); try { await fetch('/logout', { method: 'POST' }); console.log("Spotify cookie cleared."); } catch (fetchError) { console.error("Error clearing Spotify cookie:", fetchError); } setLoading(false); if (signOutError) { console.error("SignOut Error:", signOutError); showToast(signOutError.message, true); } else { console.log("Logout successful."); } }); };
    const awardClientSideAchievement = (achievementId) => { if (!currentUser || currentUser.isGuest || !supabase || userUnlockedAchievementIds.includes(achievementId)) { if(userUnlockedAchievementIds.includes(achievementId)) { console.log(`Achievement ${achievementId} already in list, not awarding again.`); } return; } console.log(`Awarding client-side achievement: ${achievementId}`); userUnlockedAchievementIds.push(achievementId); const achievement = achievementsList.find(a => a.id === achievementId); showToast(`Erfolg freigeschaltet: ${achievement?.name || `ID ${achievementId}`}!`); if(elements.achievements.grid) renderAchievements(); if(elements.titles.list) renderTitles(); if(elements.icons.list) renderIcons(); supabase.from('user_achievements').insert({ user_id: currentUser.id, achievement_id: achievementId }).then(({ error }) => { if (error) { console.error(`Fehler beim Speichern von Client-Achievement ${achievementId} im Hintergrund:`, error); } else { console.log(`Client-Achievement ${achievementId} erfolgreich im Hintergrund gespeichert.`); } }); };

    const connectWebSocket = () => {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${proto}//${host}`;
        console.log(`Connecting WebSocket to ${wsUrl}...`);

        if (ws.socket && (ws.socket.readyState === WebSocket.OPEN || ws.socket.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket is already open or connecting.");
            return;
        }

        try {
            ws.socket = new WebSocket(wsUrl);
        } catch (e) {
            console.error("Failed to create WebSocket:", e);
            showToast("WebSocket-Erstellung fehlgeschlagen.", true);
            return;
        }

        ws.socket.onopen = () => {
            console.log("WebSocket connected successfully.");
            
            showToast("Server verbunden!", false); 

            if (currentUser && !currentUser.isGuest) {
                ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id, username: currentUser.username } }));
            }

            if (wsPingInterval) clearInterval(wsPingInterval);
            wsPingInterval = setInterval(() => {
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000); 
        };

        ws.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (e) {
                console.error("Error parsing WS message:", e);
            }
        };

        ws.socket.onerror = (error) => {
            console.error("WebSocket Error:", error);
        };

        ws.socket.onclose = (event) => {
            console.warn(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
            if (wsPingInterval) clearInterval(wsPingInterval);
            wsPingInterval = null;
            ws.socket = null;
            
            if (event.code !== 1000 && event.code !== 1005) {
                 showToast("Serververbindung verloren. Lade neu...", true);
            }
        };
    }

    // --- WebSocket-Handler (mit Freunde-Update) ---
    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`WS Message Received: ${type}`, payload || '');

        switch (type) {
            case 'lobby-update':
                handleLobbyUpdate(payload);
                setLoading(false); 
                elements.joinModal.overlay.classList.add('hidden'); // BUGFIX: Join-Modal schließen
                showScreen('lobby-screen');
                break;
            case 'toast':
                showToast(payload.message, payload.isError);
                setLoading(false); 
                break;
            case 'friends-update': // NEU: Freunde-System
                renderFriendsList(payload.friends);
                renderRequestsList(payload.requests);
                break;
            case 'game-starting':
                setLoading(true, "Spiel startet...");
                break;
            case 'countdown':
                showCountdown(payload.number); // Geändert zu 'number'
                break;
            case 'new-round':
                setLoading(false);
                setupNewRound(payload);
                showScreen('game-screen');
                break;
            case 'round-result':
                showRoundResult(payload);
                break;
            case 'game-over':
                setLoading(false);
                showGameOver(payload);
                updatePlayerProgress(); 
                break;
            case 'player-reacted':
                displayReaction(payload.playerId, payload.reaction);
                break;
            case 'invite-received':
                showInvitePopup(payload.from, payload.pin);
                break;

            default:
                console.warn(`Unhandled WS message type: ${type}`);
        }
    };
    
    // --- Lobby-Update-Funktion ---
    function handleLobbyUpdate(data) {
        console.log("Handling lobby update", data);
        const { pin, hostId, players, settings, gameMode } = data;
        
        currentGame.pin = pin;
        currentGame.playerId = currentUser.id;
        currentGame.isHost = hostId === currentUser.id;
        currentGame.gameMode = gameMode;
        currentGame.players = players; 

        if (elements.lobby.pinDisplay) {
            elements.lobby.pinDisplay.textContent = pin;
        }

        renderPlayerList(players, hostId);
        renderGamePlayerList(players); 

        elements.lobby.hostSettings?.classList.toggle('hidden', !currentGame.isHost);
        elements.lobby.guestWaitingMessage?.classList.toggle('hidden', currentGame.isHost);

        updateHostSettings(settings, currentGame.isHost);
    }
    
    // --- Game Over ---
    function showGameOver(payload) {
        console.log("STUB: showGameOver", payload);
        showToast("Spiel beendet!", false);
        showScreen('home-screen'); 
        if(elements.game.playerList) elements.game.playerList.innerHTML = '';
    }


    // --- UI Rendering Functions ---
    function renderPlayerList(players, hostId) {
        if (!elements.lobby.playerList) return;
        elements.lobby.playerList.innerHTML = ''; // Leere die Liste
        
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

        sortedPlayers.forEach(player => {
            const isHost = player.id === hostId;
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            playerCard.dataset.playerId = player.id;
            
            const icon = iconsList.find(i => i.id === player.iconId) || iconsList[0];
            const iconClass = isHost ? 'fa-crown' : (icon ? icon.iconClass : 'fa-user'); 
            
            const color = nameColorsList.find(c => c.id === player.colorId); 
            const colorStyle = color ? `style="color: ${color.colorHex}"` : '';
            
            playerCard.innerHTML = `
                <i class="player-icon fa-solid ${iconClass} ${isHost ? 'host' : ''}"></i>
                <span class="player-name" ${colorStyle}>${player.nickname || 'Unbekannt'}</span>
            `;
            elements.lobby.playerList.appendChild(playerCard);
        });
    }

    function renderGamePlayerList(players) {
        if (!elements.game.playerList) return;
        elements.game.playerList.innerHTML = ''; // Leere die Liste
        
        players.forEach(player => {
            const playerCard = document.createElement('div');
            playerCard.className = 'game-player-card';
            playerCard.dataset.playerId = player.id;
            
            const icon = iconsList.find(i => i.id === player.iconId) || iconsList[0];
            const iconClass = icon ? icon.iconClass : 'fa-user';
            
            const color = nameColorsList.find(c => c.id === player.colorId); 
            const colorStyle = color ? `style="color: ${color.colorHex}"` : '';

            playerCard.innerHTML = `
                <i class="player-icon fa-solid ${iconClass}" ${colorStyle}></i>
                <span class="player-name" ${colorStyle}>${player.nickname || 'Unbekannt'}</span>
                <span class="player-score">${player.score}</span>
            `;
            elements.game.playerList.appendChild(playerCard);
        });
    }

    // --- updateHostSettings (angepasst, da Einstellungen verschoben) ---
    function updateHostSettings(settings, isHost) {
        console.log("Updating host settings display", settings);

        const updatePresets = (presetContainer, value, customValueType) => {
            if (!presetContainer) return;
            let valueFound = false;
            presetContainer.querySelectorAll('.preset-button').forEach(btn => {
                if (btn.dataset.value === String(value)) {
                    btn.classList.add('active');
                    valueFound = true;
                } else {
                    btn.classList.remove('active');
                }
            });
            
            const customBtn = presetContainer.querySelector(`[data-value="custom"][data-type="${customValueType}"]`);
            if (!valueFound && customBtn && value) {
                customBtn.classList.add('active');
                customBtn.textContent = (customValueType === 'guess-time') ? `${value}s` : `${value}`;
            } else if (customBtn) {
                // Setze den Text zurück
                customBtn.textContent = (customValueType === 'guess-time') ? 'Custom' : 'Custom';
                if (valueFound) {
                    customBtn.classList.remove('active');
                }
            }
        };

        if (elements.lobby.deviceSelectBtn) {
            elements.lobby.deviceSelectBtn.textContent = settings.deviceName || 'Gerät auswählen';
        }
        if (elements.lobby.playlistSelectBtn) {
            elements.lobby.playlistSelectBtn.textContent = settings.playlistName || 'Playlist auswählen';
        }
        if (elements.lobby.backgroundSelectButton) {
             elements.lobby.backgroundSelectButton.textContent = backgroundsList.find(b => b.backgroundId === settings.chosenBackgroundId)?.name || 'Standard';
             applyLobbyBackground(settings.chosenBackgroundId || 'default');
        }

        updatePresets(elements.lobby.songCountPresets, settings.songCount, 'song-count');
        updatePresets(elements.lobby.guessTimePresets, settings.guessTime, 'guess-time');
        
        if (isHost && elements.lobby.startGameBtn) {
            const canStart = settings.deviceName && settings.playlistName;
            elements.lobby.startGameBtn.disabled = !canStart;
            if (!canStart) {
                elements.lobby.startGameBtn.title = "Wähle zuerst Gerät und Playlist.";
            } else {
                elements.lobby.startGameBtn.title = "";
            }
        }
    }


    // --- Implementierte UI-Funktionen ---
    
    function renderAchievements() {
        if (!elements.achievements.grid || currentUser.isGuest) return;
        elements.achievements.grid.innerHTML = '';
        
        const sortedAchievements = [...achievementsList].sort((a, b) => {
            const aUnlocked = userUnlockedAchievementIds.includes(a.id);
            const bUnlocked = userUnlockedAchievementIds.includes(b.id);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id; 
        });
        
        sortedAchievements.forEach(ach => { 
            const isUnlocked = userUnlockedAchievementIds.includes(ach.id);
            const card = document.createElement('div');
            card.className = 'achievement-card';
            card.classList.toggle('unlocked', isUnlocked);
            
            const reward = allItems.find(item => item.unlockType === 'achievement' && item.unlockValue === ach.id);
            let rewardText = '<span class="reward">+50 🎵</span>'; 
            if (reward) {
                rewardText += ` & ${reward.type === 'title' ? 'Titel' : 'Icon'}: ${reward.name || reward.iconClass}`;
            }

            card.innerHTML = `
                <h3>${ach.name}</h3>
                <p>${ach.description}</p>
                ${isUnlocked ? `<span class="reward">Freigeschaltet!</span>` : rewardText}
            `;
            elements.achievements.grid.appendChild(card);
        });
    }

    async function equipTitle(titleId, saveToDb = true) {
        if (currentUser.isGuest) return;
        const title = titlesList.find(t => t.id === titleId);
        if (!title) return;
        
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        if (!isItemUnlocked(title, currentLevel)) {
            showToast("Du hast diesen Titel noch nicht freigeschaltet.", true);
            return;
        }

        userProfile.equipped_title_id = titleId;
        if (elements.home.profileTitleBtn) {
            elements.home.profileTitleBtn.querySelector('span').textContent = title.name;
        }
        renderTitles(); 
        renderCustomTitles(); 

        if (saveToDb && supabase) {
            const { error } = await supabase.from('profiles').update({ equipped_title_id: titleId }).eq('id', currentUser.id);
            if (error) {
                showToast("Fehler beim Speichern des Titels.", true);
            } else {
                showToast(`Titel "${title.name}" ausgerüstet!`, false);
            }
        }
    }

    function renderTitles() {
        if (!elements.titles.list || currentUser.isGuest) return;
        elements.titles.list.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        
        const sortedTitles = [...titlesList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });
        
        sortedTitles.forEach(title => { 
            const isUnlocked = isItemUnlocked(title, currentLevel);
            const isEquipped = userProfile.equipped_title_id === title.id;

            const card = document.createElement('div');
            card.className = 'title-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.titleId = title.id;

            card.innerHTML = `
                <span class="title-name">${title.name}</span>
                <span class="title-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : getUnlockDescription(title)}</span>
            `;
            elements.titles.list.appendChild(card);
        });
    }

    async function equipIcon(iconId, saveToDb = true) {
        if (currentUser.isGuest) return;
        const icon = iconsList.find(i => i.id === iconId);
        if (!icon) return;

        const currentLevel = getLevelForXp(userProfile.xp || 0);
        if (!isItemUnlocked(icon, currentLevel)) {
            showToast("Du hast dieses Icon noch nicht freigeschaltet.", true);
            return;
        }

        userProfile.equipped_icon_id = iconId;
        if (elements.home.profileIcon) {
            elements.home.profileIcon.className = `fa-solid ${icon.iconClass}`;
        }
        renderIcons(); 
        renderCustomIcons(); 

        if (saveToDb && supabase) {
            const { error } = await supabase.from('profiles').update({ equipped_icon_id: iconId }).eq('id', currentUser.id);
            if (error) {
                showToast("Fehler beim Speichern des Icons.", true);
            } else {
                showToast(`Icon ausgerüstet!`, false);
            }
        }
    }

    function renderIcons() {
        if (!elements.icons.list || currentUser.isGuest) return;
        elements.icons.list.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);

        const sortedIcons = [...iconsList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });

        sortedIcons.forEach(icon => { 
            const isUnlocked = isItemUnlocked(icon, currentLevel);
            const isEquipped = userProfile.equipped_icon_id === icon.id;

            const card = document.createElement('div');
            card.className = 'icon-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.iconId = icon.id;

            card.innerHTML = `
                <div class="icon-preview"><i class="fa-solid ${icon.iconClass}"></i></div>
                <span class="title-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : (icon.description || getUnlockDescription(icon))}</span>
            `;
            elements.icons.list.appendChild(card);
        });
    }
    
    // --- "Anpassen"-Menü Funktionen ---
    function renderCustomizationMenu() {
        if (!elements.customize.screen || currentUser.isGuest) return;
        renderCustomTitles();
        renderCustomIcons();
        renderCustomColors();
        renderCustomBackgrounds();
    }
    
    function renderCustomTitles() {
        const container = elements.customize.titlesList;
        if (!container) return;
        container.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        
        const sortedTitles = [...titlesList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });
        
        sortedTitles.forEach(title => {
            const isUnlocked = isItemUnlocked(title, currentLevel);
            const isEquipped = userProfile.equipped_title_id === title.id;

            const card = document.createElement('div');
            card.className = 'title-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.titleId = title.id;
            card.innerHTML = `
                <span class="title-name">${title.name}</span>
                <span class="title-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : getUnlockDescription(title)}</span>
            `;
            container.appendChild(card);
        });
    }

    function renderCustomIcons() {
        const container = elements.customize.iconsList;
        if (!container) return;
        container.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        
        const sortedIcons = [...iconsList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });

        sortedIcons.forEach(icon => {
            const isUnlocked = isItemUnlocked(icon, currentLevel);
            const isEquipped = userProfile.equipped_icon_id === icon.id;

            const card = document.createElement('div');
            card.className = 'icon-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.iconId = icon.id;
            card.innerHTML = `
                <div class="icon-preview"><i class="fa-solid ${icon.iconClass}"></i></div>
                <span class="title-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : (icon.description || getUnlockDescription(icon))}</span>
            `;
            container.appendChild(card);
        });
    }

    async function equipColor(colorId, saveToDb = true) {
        if (currentUser.isGuest) return;
        
        if (!colorId) {
            userProfile.equipped_color_id = null;
            if(elements.home.usernameContainer) elements.home.usernameContainer.style.color = ''; 
            renderCustomColors();
            if (saveToDb && supabase) {
                const { error } = await supabase.from('profiles').update({ equipped_color_id: null }).eq('id', currentUser.id);
                if (error) {
                    console.error("Fehler beim Abwählen der Farbe:", error);
                    showToast("Fehler beim Speichern der Farbe.", true);
                }
            }
            return;
        }

        const color = nameColorsList.find(c => c.id === colorId);
        if (!color) return;

        const currentLevel = getLevelForXp(userProfile.xp || 0);
        if (!isItemUnlocked(color, currentLevel)) {
            showToast("Du hast diese Farbe noch nicht freigeschaltet.", true);
            return;
        }

        userProfile.equipped_color_id = colorId;
        if (elements.home.usernameContainer) {
            elements.home.usernameContainer.style.color = color.colorHex;
        }
        renderCustomColors(); 

        if (saveToDb && supabase) {
            const { error } = await supabase.from('profiles').update({ equipped_color_id: colorId }).eq('id', currentUser.id);
            if (error) {
                console.error("Fehler beim Speichern der Farbe:", error);
                showToast("Fehler beim Speichern der Farbe.", true);
            } else {
                showToast(`Farbe "${color.name}" ausgerüstet!`, false);
            }
        }
    }

    function renderCustomColors() {
        const container = elements.customize.colorsList;
        if (!container || currentUser.isGuest) return;
        container.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);

        const sortedColors = [...nameColorsList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });

        const noneCard = document.createElement('div');
        noneCard.className = 'color-card';
        noneCard.classList.toggle('equipped', !userProfile.equipped_color_id);
        noneCard.dataset.colorId = ''; 
        noneCard.innerHTML = `
            <div class="color-preview" style="background-color: var(--dark-grey); border: 2px dashed var(--medium-grey);">
                <i class="fa-solid fa-ban"></i>
            </div>
            <span class="color-name">Standard</span>
            <span class="color-desc">${!userProfile.equipped_color_id ? 'Ausgerüstet' : 'Keine Farbe'}</span>
        `;
        container.appendChild(noneCard);

        sortedColors.forEach(color => {
            const isUnlocked = isItemUnlocked(color, currentLevel);
            const isEquipped = userProfile.equipped_color_id === color.id;

            const card = document.createElement('div');
            card.className = 'color-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.colorId = color.id;

            card.innerHTML = `
                <div class="color-preview" style="background-color: ${color.colorHex}">
                    <i class="fa-solid fa-font"></i>
                </div>
                <span class="color-name">${color.name}</span>
                <span class="color-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : getUnlockDescription(color)}</span>
            `;
            container.appendChild(card);
        });
    }

    // NEU: Logik für Lobby-Hintergründe im "Anpassen"-Tab
    function renderCustomBackgrounds() {
        const container = elements.customize.backgroundsList;
        if (currentUser.isGuest || !container) return;
        container.innerHTML = '';
        
        // Standard-Option
        const defaultLi = document.createElement('li');
        defaultLi.dataset.bgId = 'default';
        defaultLi.innerHTML = `<button class="button-select">Standard</button>`;
        container.appendChild(defaultLi);

        backgroundsList.forEach(bg => {
            if (bg.id !== 'default' && ownedBackgroundIds.has(bg.backgroundId)) {
                const li = document.createElement('li');
                li.dataset.bgId = bg.backgroundId;
                li.innerHTML = `<button class="button-select">${bg.name}</button>`;
                container.appendChild(li);
            }
        });
    }

    // --- ENDE: "Anpassen"-Menü Funktionen ---

    function renderLevelProgress() {
        if (!elements.levelProgress.list || currentUser.isGuest) return;
        elements.levelProgress.list.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const maxDisplayLevel = 50;

        for (let level = 1; level <= maxDisplayLevel; level++) {
            const isUnlocked = currentLevel >= level;
            const item = document.createElement('div');
            item.className = 'level-progress-item';
            item.classList.toggle('unlocked', isUnlocked);
            
            const xpNeeded = getXpForLevel(level + 1);
            
            const levelTitles = titlesList.filter(t => t.unlockType === 'level' && t.unlockValue === level);
            const levelIcons = iconsList.filter(i => i.unlockType === 'level' && i.unlockValue === level);
            const rewards = [...levelTitles, ...levelIcons];

            let rewardsHtml = '';
            if (rewards.length > 0) {
                rewards.forEach(reward => {
                    rewardsHtml += `
                        <div class="reward-item">
                            <i class="fa-solid ${reward.type === 'title' ? 'fa-ticket' : reward.iconClass}"></i>
                            <span>${reward.name || reward.description}</span>
                        </div>
                    `;
                });
            } else {
                rewardsHtml = '<div class="no-reward">Keine spezielle Belohnung</div>';
            }

            item.innerHTML = `
                <div class="level-progress-header">
                    <h3>Level ${level}</h3>
                    <span>${isUnlocked ? 'Erreicht' : `Nächstes Level bei ${xpNeeded} XP`}</span>
                </div>
                <div class="level-progress-rewards">
                    ${rewardsHtml}
                </div>
            `;
            elements.levelProgress.list.appendChild(item);
        }
    }
    
    function updatePlayerProgressDisplay() {
        if (currentUser.isGuest) return;
        
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const currentLevelXp = getXpForLevel(currentLevel);
        const nextLevelXp = getXpForLevel(currentLevel + 1);
        const xpForThisLevel = nextLevelXp - currentLevelXp;
        const xpProgress = (userProfile.xp || 0) - currentLevelXp;
        const progressPercent = xpForThisLevel > 0 ? (xpProgress / xpForThisLevel) * 100 : 0;
        
        if (elements.home.profileLevel) elements.home.profileLevel.textContent = currentLevel;
        if (elements.home.profileXpFill) elements.home.profileXpFill.style.width = `${progressPercent}%`;
        if (elements.home.profileXpText) elements.home.profileXpText.textContent = `${userProfile.xp || 0} / ${nextLevelXp} XP`;
    }

    async function updatePlayerProgress() {
        if (currentUser.isGuest || !supabase) return;
        try {
            const { data, error } = await supabase.from('profiles').select('xp, games_played, wins, correct_answers, highscore, spots').eq('id', currentUser.id).single();
            if (error) throw error;
            userProfile = { ...userProfile, ...data };
            updatePlayerProgressDisplay();
            updateStatsDisplay();
            updateSpotsDisplay();
        } catch(error) {
            console.error("Fehler beim Aktualisieren der Spieler-Progression:", error);
        }
    }
    
    function updateStatsDisplay() {
        if (currentUser.isGuest) return;
        const stats = userProfile;
        const winrate = (stats.games_played > 0 ? (stats.wins / stats.games_played) * 100 : 0).toFixed(0);
        const avgScore = (stats.games_played > 0 ? (stats.correct_answers / stats.games_played) : 0).toFixed(1); 
        
        if(elements.stats.gamesPlayedPreview) elements.stats.gamesPlayedPreview.textContent = stats.games_played || 0;
        if(elements.stats.winsPreview) elements.stats.winsPreview.textContent = stats.wins || 0;
        if(elements.stats.correctAnswersPreview) elements.stats.correctAnswersPreview.textContent = stats.correct_answers || 0;
        if(elements.stats.gamesPlayed) elements.stats.gamesPlayed.textContent = stats.games_played || 0;
        if(elements.stats.wins) elements.stats.wins.textContent = stats.wins || 0;
        if(elements.stats.winrate) elements.stats.winrate.textContent = `${winrate}%`;
        if(elements.stats.highscore) elements.stats.highscore.textContent = stats.highscore || 0;
        if(elements.stats.correctAnswers) elements.stats.correctAnswers.textContent = stats.correct_answers || 0;
        if(elements.stats.avgScore) elements.stats.avgScore.textContent = avgScore;
    }

    // --- SHOP-System (KORRIGIERT mit await getSession) ---
    async function loadShopItems() {
        if (currentUser.isGuest) return;
        setLoading(true, "Lade Shop...");
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                throw new Error(sessionError?.message || "Authentifizierung fehlgeschlagen. Bitte neu einloggen.");
            }
            const accessToken = session.access_token;

            const { data: profileData, error: profileError } = await supabase.from('profiles').select('spots').eq('id', currentUser.id).single();
            if (profileError) throw profileError;
            userProfile.spots = profileData.spots;
            updateSpotsDisplay();

            const response = await fetch('/api/shop/items', {
                headers: { 'Authorization': `Bearer ${accessToken}` } 
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Shop-Daten konnten nicht geladen werden.');
            }
            
            const { items: shopItemsFromServer } = await response.json();
            
            const titlesListEl = elements.shop.titlesList;
            const iconsListEl = elements.shop.iconsList;
            const backgroundsListEl = elements.shop.backgroundsList;
            const colorsListEl = elements.shop.colorsList;

            titlesListEl.innerHTML = '';
            iconsListEl.innerHTML = '';
            backgroundsListEl.innerHTML = '';
            colorsListEl.innerHTML = '';

            const allShopItems = [...titlesList, ...iconsList, ...backgroundsList, ...nameColorsList]
                .filter(item => item.unlockType === 'spots');

            allShopItems.forEach(item => {
                const serverItem = shopItemsFromServer.find(si => si.id === item.id);
                const isOwned = serverItem ? serverItem.isOwned : false;
                
                if (isOwned) {
                    if (item.type === 'title') ownedTitleIds.add(item.id);
                    else if (item.type === 'icon') ownedIconIds.add(item.id);
                    else if (item.type === 'background') ownedBackgroundIds.add(item.backgroundId);
                    else if (item.type === 'color') ownedColorIds.add(item.id);
                }

                if (item.type === 'title') {
                    titlesListEl.appendChild(renderShopItem(item, userProfile.spots, isOwned));
                } else if (item.type === 'icon') {
                    iconsListEl.appendChild(renderShopItem(item, userProfile.spots, isOwned));
                } else if (item.type === 'background') {
                    backgroundsListEl.appendChild(renderShopItem(item, userProfile.spots, isOwned));
                } else if (item.type === 'color') {
                    colorsListEl.appendChild(renderShopItem(item, userProfile.spots, isOwned));
                }
            });

        } catch (error) {
            console.error("Error loading shop items:", error);
            showToast(error.message || "Fehler beim Laden des Shops.", true);
        } finally {
            setLoading(false);
        }
    }

    function renderShopItem(item, userSpots, isOwned) {
        const el = document.createElement('div');
        el.className = 'shop-item';
        el.classList.toggle('owned', isOwned);
        
        let previewHtml = '';
        if (item.type === 'icon') {
            previewHtml = `<div class="item-preview-icon"><i class="fa-solid ${item.iconClass}"></i></div>`;
        } else if (item.type === 'background') {
            previewHtml = `<div class="item-preview-background" style="background-image: url('${item.imageUrl}')"></div>`;
        } else if (item.type === 'color') {
            previewHtml = `<div class="item-preview-color" style="background-color: ${item.colorHex}"><i class="fa-solid fa-font"></i></div>`;
        } else {
            previewHtml = `<div class="item-preview-icon"><i class="fa-solid fa-ticket"></i></div>`;
        }

        const canAfford = userSpots >= item.cost;
        el.classList.toggle('cannot-afford', !canAfford && !isOwned);

        el.innerHTML = `
            ${previewHtml}
            <div class="item-name">${item.name}</div>
            <div class="item-description">${item.description || getUnlockDescription(item)}</div>
            <div class="item-cost">${item.cost} 🎵</div>
            <button class="button-primary buy-button" data-item-id="${item.id}" ${isOwned || !canAfford ? 'disabled' : ''}>
                ${isOwned ? 'Besitzt du' : 'Kaufen'}
            </button>
        `;
        return el;
    }

    async function handleBuyItem(itemId) {
        const item = allItems.find(i => i.id == itemId);
        if (!item) return;

        showConfirmModal(
            `Kauf bestätigen`,
            `Möchtest du "${item.name}" für ${item.cost} 🎵 kaufen?`,
            async () => {
                setLoading(true, "Kauf wird verarbeitet...");
                try {
                    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                    if (sessionError || !session) {
                        throw new Error(sessionError?.message || "Authentifizierung fehlgeschlagen. Bitte neu einloggen.");
                    }
                    const accessToken = session.access_token;

                    const response = await fetch('/api/shop/buy', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`
                        },
                        body: JSON.stringify({ itemId: item.id })
                    });
                    const result = await response.json();
                    if (!response.ok || !result.success) {
                        throw new Error(result.message || "Kauf fehlgeschlagen.");
                    }
                    setLoading(false);
                    showToast(result.message, false);
                    userProfile.spots = result.newSpots;
                    updateSpotsDisplay();
                    if (result.itemType === 'title') ownedTitleIds.add(item.id);
                    else if (result.itemType === 'icon') ownedIconIds.add(item.id);
                    else if (result.itemType === 'background') ownedBackgroundIds.add(item.backgroundId);
                    else if (result.itemType === 'color') ownedColorIds.add(item.id);
                    loadShopItems(); // Shop neu laden, um "Besitzt du" anzuzeigen
                    
                    awardClientSideAchievement(21);

                } catch (error) {
                    setLoading(false);
                    console.error("Fehler beim Kaufen:", error);
                    showToast(error.message, true);
                }
            }
        );
    }
    
    function displayReaction(playerId, reaction) {
        const playerCard = document.querySelector(
            `.player-card[data-player-id="${playerId}"], .game-player-card[data-player-id="${playerId}"]`
        );
        if (playerCard) {
            const popup = document.createElement('div');
            popup.className = 'player-reaction-popup';
            popup.textContent = reaction;
            playerCard.appendChild(popup);
            setTimeout(() => popup.remove(), 1500);
        }
    }
    
    // --- Game Logic Functions (Stubs) ---
    function showCountdown(number) { 
        console.log(`Countdown: ${number}`); 
        elements.countdownOverlay.textContent = number;
        elements.countdownOverlay.classList.remove('hidden');
    }
    function setupPreRound(data) { 
        console.log("Pre-Round Setup"); 
        elements.countdownOverlay.classList.add('hidden');
        elements.game.gameContentArea.innerHTML = `<h2>Macht euch bereit...</h2>`;
        renderGamePlayerList(currentGame.players);
    }
    function setupNewRound(data) { 
        console.log("New Round Setup", data); 
        elements.countdownOverlay.classList.add('hidden');
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds;
        elements.game.gameContentArea.innerHTML = `<h2>Was ist das für ein Song?</h2>`; // Platzhalter
        // TODO: Input-Felder / Multiple-Choice-Buttons anzeigen
    }
    function showRoundResult(data) { 
        console.log("Round Result", data); 
        elements.game.gameContentArea.innerHTML = `
            <h2>Runde vorbei!</h2>
            <h3>Der Song war: ${data.correctTrack.title} - ${data.correctTrack.artist} (${data.correctTrack.year})</h3>
        `;
        renderGamePlayerList(data.scores); // Scores aktualisieren
    }
    
    // --- Friends Modal Logic (Implementiert) ---
    async function loadFriendsData() { 
        if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            showToast("Keine Serververbindung.", true);
            return;
        }
        console.log("Lade Freunde...");
        elements.friendsModal.friendsList.innerHTML = '<li>Lade Freunde...</li>';
        elements.friendsModal.requestsList.innerHTML = '<li>Lade Anfragen...</li>';
        ws.socket.send(JSON.stringify({ type: 'load-friends' }));
    }
    
    function renderFriendsList(friends) {
        if (!elements.friendsModal.friendsList) return;
        elements.friendsModal.friendsList.innerHTML = '';
        onlineFriends = friends.filter(f => f.isOnline); // Cache für Einladungen
        
        if (friends.length === 0) {
            elements.friendsModal.friendsList.innerHTML = '<li>Du hast noch keine Freunde.</li>';
            return;
        }
        
        // Sortiere: Online-Freunde zuerst
        friends.sort((a, b) => b.isOnline - a.isOnline);
        
        friends.forEach(friend => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="friend-info">
                    <span class="friend-name">${friend.username}</span>
                    <span class="friend-status ${friend.isOnline ? 'online' : ''}">${friend.isOnline ? 'Online' : 'Offline'}</span>
                </div>
                <div class="friend-actions">
                    <button class="button-icon button-gift" data-friend-id="${friend.id}" data-friend-name="${friend.username}" title="Spots schenken"><i class="fa-solid fa-gift"></i></button>
                    <button class="button-icon button-danger button-remove-friend" data-friend-id="${friend.id}" data-friend-name="${friend.username}" title="Freund entfernen"><i class="fa-solid fa-user-minus"></i></button>
                </div>
            `;
            elements.friendsModal.friendsList.appendChild(li);
        });
    }

    function renderRequestsList(requests) {
        if (!elements.friendsModal.requestsList) return;
        elements.friendsModal.requestsList.innerHTML = '';
        
        if (requests.length === 0) {
            elements.friendsModal.requestsList.innerHTML = '<li>Keine neuen Anfragen.</li>';
            elements.friendsModal.requestsCount.classList.add('hidden');
            return;
        }
        
        elements.friendsModal.requestsCount.textContent = requests.length;
        elements.friendsModal.requestsCount.classList.remove('hidden');

        requests.forEach(req => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="friend-info">
                    <span class="friend-name">${req.username}</span>
                </div>
                <div class="friend-actions">
                    <button class="button-icon button-primary button-accept-request" data-sender-id="${req.id}" title="Annehmen"><i class="fa-solid fa-check"></i></button>
                    <button class="button-icon button-danger button-decline-request" data-sender-id="${req.id}" title="Ablehnen"><i class="fa-solid fa-user-minus"></i></button>
                </div>
            `;
            elements.friendsModal.requestsList.appendChild(li);
        });
    }
    
    // --- Utility & Modal Functions (AKTUALISIERT) ---
    
    async function fetchHostData(isRefresh = false) {
        console.log(`Fetching host data... Refresh: ${isRefresh}`);
        if (!spotifyToken) {
            showToast("Spotify ist nicht verbunden.", true);
            return;
        }
        
        if (allPlaylists.length > 0 && availableDevices.length > 0 && !isRefresh) {
            console.log("Using cached host data.");
            renderPaginatedPlaylists(allPlaylists, 1);
            renderDeviceList(availableDevices);
            return;
        }

        setLoading(true, "Lade Spotify-Daten...");
        try {
            const authHeader = { 'Authorization': `Bearer ${spotifyToken}` };
            
            const [deviceResponse, playlistResponse] = await Promise.all([
                fetch('/api/devices', { headers: authHeader }),
                fetch('/api/playlists', { headers: authHeader })
            ]);

            if (!deviceResponse.ok) throw new Error(`Gerätefehler: ${deviceResponse.statusText}`);
            const deviceData = await deviceResponse.json();
            availableDevices = deviceData.devices || [];
            renderDeviceList(availableDevices);

            if (!playlistResponse.ok) throw new Error(`Playlistfehler: ${playlistResponse.statusText}`);
            const playlistData = await playlistResponse.json();
            allPlaylists = playlistData.items || [];
            renderPaginatedPlaylists(allPlaylists, 1);
            
            console.log(`Fetched ${availableDevices.length} devices and ${allPlaylists.length} playlists.`);

        } catch (error) {
            console.error("Error fetching host data:", error);
            showToast(`Fehler: ${error.message}`, true);
            spotifyToken = null; 
            checkSpotifyStatus();
        } finally {
            setLoading(false);
        }
    }

    function renderDeviceList(devices) {
        if (!elements.deviceSelectModal.list) return;
        elements.deviceSelectModal.list.innerHTML = '';
        if (devices.length === 0) {
            elements.deviceSelectModal.list.innerHTML = '<li>Keine aktiven Geräte gefunden. Starte Spotify auf einem Gerät.</li>';
            return;
        }
        devices.forEach(device => {
            const li = document.createElement('li');
            li.dataset.deviceId = device.id;
            li.dataset.deviceName = device.name;
            li.innerHTML = `<button class="button-select ${device.is_active ? 'active' : ''}">
                <i class="fa-solid ${getDeviceIcon(device.type)}"></i> ${device.name}
            </button>`;
            elements.deviceSelectModal.list.appendChild(li);
        });
    }
    
    function getDeviceIcon(type) {
        switch (type.toLowerCase()) {
            case 'computer': return 'fa-desktop';
            case 'smartphone': return 'fa-mobile-alt';
            case 'speaker': return 'fa-volume-high';
            default: return 'fa-question-circle';
        }
    }

    function renderPaginatedPlaylists(playlistsToRender, page = 1) {
        if (!elements.playlistSelectModal.list) return;
        
        const searchTerm = elements.playlistSelectModal.search.value.toLowerCase();
        const filteredPlaylists = searchTerm 
            ? playlistsToRender.filter(p => p.name.toLowerCase().includes(searchTerm))
            : playlistsToRender;

        currentPage = page;
        const totalPages = Math.ceil(filteredPlaylists.length / itemsPerPage);
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedItems = filteredPlaylists.slice(startIndex, endIndex);

        elements.playlistSelectModal.list.innerHTML = '';
        if (paginatedItems.length === 0) {
            elements.playlistSelectModal.list.innerHTML = '<li>Keine Playlists gefunden.</li>';
        } else {
            paginatedItems.forEach(p => {
                const li = document.createElement('li');
                li.dataset.playlistId = p.id;
                li.dataset.playlistName = p.name;
                li.innerHTML = `<button class="button-select">
                    ${p.name} <span style="color: var(--text-muted-color); font-size: 0.8rem;">(${p.tracks.total} Songs)</span>
                </button>`;
                elements.playlistSelectModal.list.appendChild(li);
            });
        }

        // Pagination-Buttons
        if (elements.playlistSelectModal.pagination) {
            elements.playlistSelectModal.pagination.innerHTML = '';
            if (totalPages > 1) {
                const prevBtn = document.createElement('button');
                prevBtn.className = 'button-secondary button-small';
                prevBtn.textContent = 'Zurück';
                prevBtn.dataset.page = page - 1;
                prevBtn.disabled = page === 1;
                elements.playlistSelectModal.pagination.appendChild(prevBtn);

                const pageIndicator = document.createElement('span');
                pageIndicator.textContent = `Seite ${page} / ${totalPages}`;
                pageIndicator.style.fontSize = '0.9rem';
                elements.playlistSelectModal.pagination.appendChild(pageIndicator);

                const nextBtn = document.createElement('button');
                nextBtn.className = 'button-secondary button-small';
                nextBtn.textContent = 'Vor';
                nextBtn.dataset.page = page + 1;
                nextBtn.disabled = page === totalPages;
                elements.playlistSelectModal.pagination.appendChild(nextBtn);
            }
        }
    }
    
    function openCustomValueModal(type, title, min = 1, max = 100) { 
        currentCustomType = { type, min, max };
        customValueInput = "";
        elements.customValueModal.title.textContent = `${title} (${min}-${max})`;
        elements.customValueModal.display.forEach(d => d.textContent = "");
        elements.customValueModal.confirmBtn.disabled = true;
        elements.customValueModal.overlay.classList.remove('hidden');
    }

    function showInvitePopup(from, pin) { 
        document.getElementById('invite-sender-name').textContent = from;
        const popup = document.getElementById('invite-popup');
        popup.classList.remove('hidden');
        
        // Alte Listener entfernen, um Duplikate zu vermeiden
        const newAcceptBtn = document.getElementById('accept-invite-button').cloneNode(true);
        document.getElementById('accept-invite-button').parentNode.replaceChild(newAcceptBtn, document.getElementById('accept-invite-button'));
        
        const newDeclineBtn = document.getElementById('decline-invite-button').cloneNode(true);
        document.getElementById('decline-invite-button').parentNode.replaceChild(newDeclineBtn, document.getElementById('decline-invite-button'));

        // Neue Listener
        newAcceptBtn.onclick = () => {
            if(!currentUser){ showToast("Anmelden/Gast zuerst.", true); return; } 
            if(!ws.socket || ws.socket.readyState !== WebSocket.OPEN){ showToast("Keine Serververbindung.", true); return; } 
            setLoading(true, "Trete Lobby bei..."); 
            ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pin, user: currentUser } })); 
            popup.classList.add('hidden');
        };
        newDeclineBtn.onclick = () => {
            popup.classList.add('hidden');
        };
    }
    
    function handlePresetClick(e, groupId) { 
        const btn = e.target.closest('.preset-button');
        if (!btn || !btn.closest('.preset-group')) return;
        
        const presetGroup = btn.closest('.preset-group');
        presetGroup.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const value = btn.dataset.value;
        const type = btn.dataset.type;
        
        if (value === 'custom') {
            if (type === 'song-count') openCustomValueModal('song-count', 'Anzahl Songs', 1, 999);
            else if (type === 'guess-time') openCustomValueModal('guess-time', 'Ratezeit (Sek.)', 10, 120);
            return;
        }

        // Send-Setting an Server (nur in Lobby)
        if (currentGame.pin && currentGame.isHost) {
            let setting = {};
            if (groupId === 'song-count-presets') setting.songCount = parseInt(value);
            if (groupId === 'guess-time-presets') setting.guessTime = parseInt(value);
            
            ws.socket.send(JSON.stringify({
                type: 'update-settings',
                payload: setting
            }));
        }
    }

    // --- Event Listeners (FINAL) ---
    function addEventListeners() {
        try { 
            console.log("Adding all application event listeners...");

            // --- Globaler Click-Listener für Reaktionen ---
            document.body.addEventListener('click', (e) => {
                const btn = e.target.closest('.reaction-btn');
                if (btn && ws.socket?.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({
                        type: 'send-reaction',
                        payload: { reaction: btn.dataset.reaction }
                    }));
                }
            });
            
            // Navigation & Allgemein
            elements.leaveGameButton?.addEventListener('click', goBack);
            elements.leaveConfirmModal.cancelBtn?.addEventListener('click', () => elements.leaveConfirmModal.overlay.classList.add('hidden'));
            elements.leaveConfirmModal.confirmBtn?.addEventListener('click', () => { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type: 'leave-game', payload: { pin: currentGame.pin, playerId: currentGame.playerId } })); } localStorage.removeItem('fakesterGame'); currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] }; screenHistory = ['auth-screen', 'home-screen']; showScreen('home-screen'); elements.leaveConfirmModal.overlay.classList.add('hidden'); });

            // Auth Screen
            elements.auth.loginForm?.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.target, false); });
            elements.auth.registerForm?.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.target, true); });
            elements.auth.showRegister?.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm?.classList.add('hidden'); elements.auth.registerForm?.classList.remove('hidden'); });
            elements.auth.showLogin?.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm?.classList.remove('hidden'); elements.auth.registerForm?.classList.add('hidden'); });

            // Gast Modal
            elements.guestModal.openBtn?.addEventListener('click', () => { elements.guestModal.overlay?.classList.remove('hidden'); elements.guestModal.input?.focus(); });
            elements.guestModal.closeBtn?.addEventListener('click', () => elements.guestModal.overlay?.classList.add('hidden'));
            elements.guestModal.submitBtn?.addEventListener('click', () => { const nickname = elements.guestModal.input?.value; if (!nickname || nickname.trim().length < 3 || nickname.trim().length > 15) { showToast("Nickname muss 3-15 Zeichen lang sein.", true); return; } elements.guestModal.overlay?.classList.add('hidden'); initializeApp({ username: nickname }, true); });

            // Home Screen
            elements.home.logoutBtn?.addEventListener('click', handleLogout);
            elements.home.spotifyConnectBtn?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/login'; });
            elements.home.createRoomBtn?.addEventListener('click', () => showScreen('mode-selection-screen'));
            elements.home.joinRoomBtn?.addEventListener('click', () => { if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) { showToast("Verbindung zum Server wird aufgebaut...", true); return; } pinInput = ""; elements.joinModal.pinDisplay?.forEach(d => d.textContent = ""); elements.joinModal.overlay?.classList.remove('hidden'); });
            elements.home.statsBtn?.addEventListener('click', () => showScreen('stats-screen'));
            elements.home.achievementsBtn?.addEventListener('click', () => showScreen('achievements-screen'));
            elements.home.levelProgressBtn?.addEventListener('click', () => showScreen('level-progress-screen'));
            elements.home.profileTitleBtn?.addEventListener('click', () => showScreen('title-selection-screen'));
            elements.home.profilePictureBtn?.addEventListener('click', () => showScreen('icon-selection-screen'));
            elements.home.friendsBtn?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { loadFriendsData(); elements.friendsModal.overlay?.classList.remove('hidden'); } });
            elements.home.usernameContainer?.addEventListener('click', () => { if (!currentUser || currentUser.isGuest) return; elements.changeNameModal.input.value = currentUser.username; elements.changeNameModal.overlay?.classList.remove('hidden'); elements.changeNameModal.input?.focus(); });
            elements.home.shopButton?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { loadShopItems(); showScreen('shop-screen'); } });
            elements.home.customizationBtn?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { renderCustomizationMenu(); showScreen('customization-screen'); } }); 

             // Modus & Spieltyp Auswahl
            elements.modeSelection.container?.addEventListener('click', (e) => { 
                const mb=e.target.closest('.mode-box'); 
                if(mb && !mb.disabled){ 
                    selectedGameMode=mb.dataset.mode; 
                    console.log(`Mode: ${selectedGameMode}`); 
                    
                    // Reset Game Creation Settings
                    gameCreationSettings = { gameType: null, lives: 3, guessTypes: ['title', 'artist'], answerType: 'freestyle' };
                    
                    if (elements.gameTypeScreen.createLobbyBtn) elements.gameTypeScreen.createLobbyBtn.disabled=true; 
                    if (elements.gameTypeScreen.pointsBtn) elements.gameTypeScreen.pointsBtn.classList.remove('active'); 
                    if (elements.gameTypeScreen.livesBtn) elements.gameTypeScreen.livesBtn.classList.remove('active'); 
                    if (elements.gameTypeScreen.livesSettings) elements.gameTypeScreen.livesSettings.classList.add('hidden'); 
                    
                    // Zeige Quiz-spezifische Einstellungen nur für Quiz-Modus
                    elements.gameTypeScreen.quizSettingsContainer.classList.toggle('hidden', selectedGameMode !== 'quiz');
                    
                    showScreen('game-type-selection-screen'); 
                } 
            });
            
            // Spieltyp (Punkte/Leben)
            elements.gameTypeScreen.pointsBtn?.addEventListener('click', () => { gameCreationSettings.gameType='points'; elements.gameTypeScreen.pointsBtn.classList.add('active'); elements.gameTypeScreen.livesBtn?.classList.remove('active'); elements.gameTypeScreen.livesSettings?.classList.add('hidden'); if(elements.gameTypeScreen.createLobbyBtn) elements.gameTypeScreen.createLobbyBtn.disabled=false; });
            elements.gameTypeScreen.livesBtn?.addEventListener('click', () => { gameCreationSettings.gameType='lives'; elements.gameTypeScreen.pointsBtn?.classList.remove('active'); elements.gameTypeScreen.livesBtn.classList.add('active'); elements.gameTypeScreen.livesSettings?.classList.remove('hidden'); if(elements.gameTypeScreen.createLobbyBtn) elements.gameTypeScreen.createLobbyBtn.disabled=false; });
            elements.gameTypeScreen.livesPresets?.addEventListener('click', (e) => { const btn=e.target.closest('.preset-button'); if(btn){ elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); const v=btn.dataset.value; if(v==='custom'){ openCustomValueModal('lives', 'Leben (1-10)', 1, 10); } else { gameCreationSettings.lives=parseInt(v); console.log(`Lives: ${gameCreationSettings.lives}`); } } });
            
            // Spieltyp (Quiz-Einstellungen)
            elements.gameTypeScreen.guessTypesCheckboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    const checked = Array.from(elements.gameTypeScreen.guessTypesCheckboxes).filter(c => c.checked).map(c => c.value);
                    if (checked.length === 0) {
                        elements.gameTypeScreen.guessTypesError.classList.remove('hidden');
                    } else {
                        elements.gameTypeScreen.guessTypesError.classList.add('hidden');
                    }
                    gameCreationSettings.guessTypes = checked;
                });
            });
            elements.gameTypeScreen.answerTypePresets?.addEventListener('click', (e) => {
                const btn = e.target.closest('.preset-button');
                if (btn) {
                    elements.gameTypeScreen.answerTypePresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    gameCreationSettings.answerType = btn.dataset.value;
                }
            });
            
            elements.gameTypeScreen.createLobbyBtn?.addEventListener('click', () => { 
                if(!selectedGameMode || !gameCreationSettings.gameType){ showToast("Modus/Typ fehlt.", true); return; } 
                if(selectedGameMode === 'quiz' && gameCreationSettings.guessTypes.length === 0) {
                    showToast("Wähle mindestens eine Sache zum Raten aus.", true);
                    elements.gameTypeScreen.guessTypesError.classList.remove('hidden');
                    return;
                }
                if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN){ showToast("Keine Serververbindung.", true); return; } 
                
                setLoading(true, "Lobby wird erstellt...");
                
                ws.socket.send(JSON.stringify({ 
                    type: 'create-game', 
                    payload: { 
                        user: currentUser, 
                        token: spotifyToken, 
                        gameMode: selectedGameMode,
                        ...gameCreationSettings // Sendet gameType, lives, guessTypes, answerType
                    } 
                })); 
            });

            // Lobby Screen
            elements.lobby.inviteFriendsBtn?.addEventListener('click', async () => { 
                elements.inviteFriendsModal.list.innerHTML = '';
                if(onlineFriends.length === 0) {
                    elements.inviteFriendsModal.list.innerHTML = '<li>Keine Freunde online.</li>';
                } else {
                    onlineFriends.forEach(friend => {
                        const li = document.createElement('li');
                        li.innerHTML = `<button class="button-select" data-friend-id="${friend.id}">${friend.username}</button>`;
                        elements.inviteFriendsModal.list.appendChild(li);
                    });
                }
                elements.inviteFriendsModal.overlay.classList.remove('hidden');
            });
            elements.lobby.deviceSelectBtn?.addEventListener('click', async () => { await fetchHostData(false); elements.deviceSelectModal.overlay?.classList.remove('hidden'); }); 
            elements.lobby.playlistSelectBtn?.addEventListener('click', async () => { await fetchHostData(false); elements.playlistSelectModal.overlay?.classList.remove('hidden'); });
            elements.lobby.backgroundSelectButton?.addEventListener('click', () => {
                 renderCustomizationMenu(); 
                 showScreen('customization-screen');
                 // Wechsle direkt zum Hintergründe-Tab
                 elements.customize.tabsContainer.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
                 elements.customize.tabContents.forEach(c => c.classList.remove('active'));
                 document.querySelector('[data-tab="tab-customize-backgrounds"]').classList.add('active');
                 document.getElementById('tab-customize-backgrounds').classList.add('active');
            });
            elements.lobby.songCountPresets?.addEventListener('click', (e) => handlePresetClick(e, 'song-count-presets'));
            elements.lobby.guessTimePresets?.addEventListener('click', (e) => handlePresetClick(e, 'guess-time-presets'));
            
            elements.lobby.startGameBtn?.addEventListener('click', () => { if (elements.lobby.startGameBtn && !elements.lobby.startGameBtn.disabled && ws.socket?.readyState === WebSocket.OPEN) { setLoading(true, "Spiel startet..."); ws.socket.send(JSON.stringify({ type: 'start-game', payload: { pin: currentGame.pin } })); } else { showToast("Wähle Gerät & Playlist.", true); } });
            
            // Veraltete Item/Title/Icon Screens
            elements.titles.list?.addEventListener('click', (e) => { const card = e.target.closest('.title-card:not(.locked)'); if (card) { equipTitle(parseInt(card.dataset.titleId), true); } });
            elements.icons.list?.addEventListener('click', (e) => { const card = e.target.closest('.icon-card:not(.locked)'); if (card) { equipIcon(parseInt(card.dataset.iconId), true); } });
            
            // --- "Anpassen"-Menü-Listener ---
            elements.customize.tabsContainer?.addEventListener('click', (e) => {
                const tab = e.target.closest('.tab-button');
                if (tab && !tab.classList.contains('active')) {
                    elements.customize.tabsContainer.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
                    elements.customize.tabContents.forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(tab.dataset.tab)?.classList.add('active');
                }
            });
            elements.customize.titlesList?.addEventListener('click', (e) => { const card = e.target.closest('.title-card:not(.locked)'); if (card) { equipTitle(parseInt(card.dataset.titleId), true); } });
            elements.customize.iconsList?.addEventListener('click', (e) => { const card = e.target.closest('.icon-card:not(.locked)'); if (card) { equipIcon(parseInt(card.dataset.iconId), true); } });
            elements.customize.colorsList?.addEventListener('click', (e) => { const card = e.target.closest('.color-card:not(.locked)'); if (card) { const colorId = card.dataset.colorId === '' ? null : parseInt(card.dataset.colorId); equipColor(colorId, true); } });
            elements.customize.backgroundsList?.addEventListener('click', (e) => {
                const li = e.target.closest('li[data-bg-id]');
                if (li) {
                    const bgId = li.dataset.bgId;
                    applyLobbyBackground(bgId); // Lokal anwenden
                    
                    if (ws.socket?.readyState === WebSocket.OPEN && currentGame.isHost) {
                        ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { chosenBackgroundId: bgId === 'default' ? null : bgId } }));
                        showToast("Lobby-Hintergrund geändert!", false);
                    } else if (currentGame.isHost) {
                        showToast("Keine Serververbindung.", true);
                    }
                    // Wenn nicht Host, einfach lokal anzeigen (wird eh nicht gespeichert)
                }
            });

            // Shop Screen
            elements.shop.screen?.addEventListener('click', (e) => { const buyBtn = e.target.closest('.buy-button:not([disabled])'); if (buyBtn) { handleBuyItem(buyBtn.dataset.itemId); } });
            
            // Modals
            document.querySelectorAll('.button-exit-modal').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.add('hidden')));
            
            // Join-Modal (BUGFIXED)
            elements.joinModal.numpad?.addEventListener('click', (e) => { 
                const btn=e.target.closest('button'); 
                if(!btn) return; 
                const key=btn.dataset.key, action=btn.dataset.action; 
                let confirmBtn = elements.joinModal.numpad.querySelector('[data-action="confirm"]'); 
                if(key >= '0' && key <= '9' && pinInput.length < 4) {
                    pinInput += key; 
                } else if(action==='clear'||action==='backspace') {
                    pinInput = pinInput.slice(0, -1); 
                } else if(action==='confirm' && pinInput.length===4) { 
                    if(!currentUser){ showToast("Anmelden/Gast zuerst.", true); return; } 
                    if(!ws.socket || ws.socket.readyState !== WebSocket.OPEN){ showToast("Keine Serververbindung.", true); return; } 
                    setLoading(true, "Trete Lobby bei..."); 
                    ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } })); 
                    pinInput = ""; // Zurücksetzen
                    // BUGFIX: Modal wird jetzt durch 'lobby-update' Nachricht geschlossen
                } 
                elements.joinModal.pinDisplay?.forEach((d,i)=>d.textContent=pinInput[i]||""); 
                if(confirmBtn) confirmBtn.disabled = pinInput.length !== 4; 
            });
            
            // Friends-Modal
            elements.friendsModal.tabsContainer?.addEventListener('click', (e) => { const tab = e.target.closest('.tab-button'); if (tab && !tab.classList.contains('active')) { elements.friendsModal.tabs?.forEach(t => t.classList.remove('active')); elements.friendsModal.tabContents?.forEach(c => c.classList.remove('active')); tab.classList.add('active'); document.getElementById(tab.dataset.tab)?.classList.add('active'); } });
            elements.friendsModal.addFriendBtn?.addEventListener('click', async () => { 
                const name = elements.friendsModal.addFriendInput.value; 
                if(name && ws.socket?.readyState === WebSocket.OPEN) { 
                    ws.socket.send(JSON.stringify({ type: 'add-friend', payload: { friendName: name } }));
                    elements.friendsModal.addFriendInput.value = ''; 
                }
            });
            elements.friendsModal.requestsList?.addEventListener('click', (e) => { 
                const acceptBtn = e.target.closest('.button-accept-request');
                const declineBtn = e.target.closest('.button-decline-request');
                if (acceptBtn && ws.socket?.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'accept-friend-request', payload: { senderId: acceptBtn.dataset.senderId } }));
                } else if (declineBtn && ws.socket?.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'decline-friend-request', payload: { friendId: declineBtn.dataset.senderId } }));
                }
            });
            elements.friendsModal.friendsList?.addEventListener('click', (e) => { 
                const removeBtn = e.target.closest('.button-remove-friend'); 
                const giftBtn = e.target.closest('.button-gift'); 
                if (removeBtn && ws.socket?.readyState === WebSocket.OPEN) { 
                    showConfirmModal("Freund entfernen", `Möchtest du ${removeBtn.dataset.friendName || 'diesen Freund'} wirklich entfernen?`, () => {
                        ws.socket.send(JSON.stringify({ type: 'remove-friend', payload: { friendId: removeBtn.dataset.friendId } }));
                    });
                } else if (giftBtn) { 
                    handleGiftSpots(giftBtn.dataset.friendId, giftBtn.dataset.friendName); 
                } 
            });
            
            elements.inviteFriendsModal.list?.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-friend-id]');
                if (btn && ws.socket?.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'invite-friend', payload: { friendId: btn.dataset.friendId } }));
                    btn.disabled = true;
                    btn.textContent = "Eingeladen";
                }
            });
            
            // Custom-Value-Modal (Implementiert)
            elements.customValueModal.numpad?.addEventListener('click', (e) => { 
                const btn=e.target.closest('button'); if(!btn) return; 
                const key=btn.dataset.key, action=btn.dataset.action;
                if(key >= '0' && key <= '9' && customValueInput.length < 3) {
                    customValueInput += key; 
                } else if(action==='clear'||action==='backspace') {
                    customValueInput = customValueInput.slice(0, -1); 
                }
                elements.customValueModal.display.forEach((d,i)=>d.textContent=customValueInput[i]||""); 
                
                const value = parseInt(customValueInput || "0");
                const isValid = value >= currentCustomType.min && value <= currentCustomType.max;
                elements.customValueModal.confirmBtn.disabled = !isValid;
            });
            elements.customValueModal.confirmBtn?.addEventListener('click', () => { 
                const value = parseInt(customValueInput);
                if (!currentCustomType || isNaN(value) || value < currentCustomType.min || value > currentCustomType.max) {
                    showToast(`Ungültiger Wert. Muss zwischen ${currentCustomType.min} und ${currentCustomType.max} sein.`, true);
                    return;
                }
                
                let setting = {};
                if (currentCustomType.type === 'song-count') {
                    setting.songCount = value;
                    updatePresets(elements.lobby.songCountPresets, value, 'song-count');
                } else if (currentCustomType.type === 'guess-time') {
                    setting.guessTime = value;
                    updatePresets(elements.lobby.guessTimePresets, value, 'guess-time');
                } else if (currentCustomType.type === 'lives') {
                    gameCreationSettings.lives = value;
                    // updatePresets(elements.gameTypeScreen.livesPresets, value, 'lives'); // TODO: Fix this preset update
                }
                
                if (currentGame.pin && currentGame.isHost && (currentCustomType.type === 'song-count' || currentCustomType.type === 'guess-time')) {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: setting }));
                }

                elements.customValueModal.overlay.classList.add('hidden');
            });
            
            elements.changeNameModal.submitBtn?.addEventListener('click', async () => { /* STUB */ console.log("Change name submit"); showToast("Name ändern (STUB)", false); });
            
            elements.deviceSelectModal.refreshBtn?.addEventListener('click', () => fetchHostData(true));
            elements.deviceSelectModal.list?.addEventListener('click', (e) => { 
                const li = e.target.closest('li[data-device-id]');
                if (li && ws.socket?.readyState === WebSocket.OPEN && currentGame.isHost) {
                    const { deviceId, deviceName } = li.dataset;
                    ws.socket.send(JSON.stringify({
                        type: 'update-settings',
                        payload: { deviceId, deviceName }
                    }));
                    elements.deviceSelectModal.overlay?.classList.add('hidden');
                }
            });
            
            elements.playlistSelectModal.search?.addEventListener('input', () => { 
                clearTimeout(elements.playlistSelectModal.search.debounceTimer); 
                elements.playlistSelectModal.search.debounceTimer = setTimeout(() => { 
                    renderPaginatedPlaylists(allPlaylists, 1); 
                }, 300); 
            });
            elements.playlistSelectModal.list?.addEventListener('click', (e) => { 
                const li = e.target.closest('li[data-playlist-id]');
                if (li && ws.socket?.readyState === WebSocket.OPEN && currentGame.isHost) {
                    const { playlistId, playlistName } = li.dataset;
                    ws.socket.send(JSON.stringify({
                        type: 'update-settings',
                        payload: { playlistId, playlistName }
                    }));
                    elements.playlistSelectModal.overlay?.classList.add('hidden');
                }
            });
            elements.playlistSelectModal.pagination?.addEventListener('click', (e) => { 
                const btn = e.target.closest('button[data-page]');
                if (btn && !btn.disabled) {
                    const newPage = parseInt(btn.dataset.page);
                    renderPaginatedPlaylists(allPlaylists, newPage);
                }
            });

            elements.confirmActionModal.cancelBtn?.addEventListener('click', () => { elements.confirmActionModal.overlay?.classList.add('hidden'); currentConfirmAction = null; });
            elements.confirmActionModal.confirmBtn?.addEventListener('click', () => { if (typeof currentConfirmAction === 'function') { currentConfirmAction(); } elements.confirmActionModal.overlay?.classList.add('hidden'); currentConfirmAction = null; });

            // Console Buttons
            toggleConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.toggle('hidden'));
            closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
            clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
            copyConsoleBtn?.addEventListener('click', () => { if (!consoleOutput) return; const txt = Array.from(consoleOutput.children).map(e => e.dataset.rawText || e.textContent).join('\n'); navigator.clipboard.writeText(txt).then(() => showToast('Logs kopiert!', false), err => { console.error('Fehler: Logs kopieren:', err); showToast('Kopieren fehlgeschlagen.', true); }); });

            console.log("All event listeners added successfully.");

        } catch (error) {
            console.error("FATAL ERROR adding event listeners:", error);
            logToPage('error', ["FATAL ERROR adding event listeners:", error]);
            document.body.innerHTML = `<div class="fatal-error"><h1>Fehler</h1><p>Ein unerwarteter Fehler ist beim Initialisieren aufgetreten. (${error.message}) Bitte lade die Seite neu.</p></div>`;
        }
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
                    localStorage.removeItem('fakesterGame'); screenHistory = ['auth-screen']; showScreen('auth-screen'); 
                    document.body.classList.add('is-guest'); setLoading(false); 
                    elements.home.spotifyConnectBtn?.classList.remove('hidden'); elements.home.createRoomBtn?.classList.add('hidden'); 
                    return; 
                }
                if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                     if (!window.initializeAppRunning && (!currentUser || currentUser.id !== session.user.id)) {
                          window.initializeAppRunning = true; console.log(`Session available/updated for ${session.user.id}. Initializing app...`); setLoading(true, "Lade Profil...");
                          try { initializeApp(session.user, false); }
                          catch(initError) { console.error("Error calling initializeApp:", initError); setLoading(false); showScreen('auth-screen'); }
                          finally { window.initializeAppRunning = false; }
                     } else if (event === 'TOKEN_REFRESHED') { console.log("Token refreshed, checking Spotify status (async)..."); checkSpotifyStatus(); }
                     else if (!window.initializeAppRunning) { console.log("App already initialized for this session or init running."); }
                } else if (!session && !['USER_UPDATED', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED'].includes(event)) {
                     console.log(`No active session or invalid (Event: ${event}). Showing auth.`);
                     if (currentUser) { 
                         currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null; 
                         ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); inventory = {};
                         if (ws.socket?.readyState === WebSocket.OPEN) ws.socket.close(); 
                         if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null; 
                         localStorage.removeItem('fakesterGame'); 
                    }
                     screenHistory = ['auth-screen']; showScreen('auth-screen'); setLoading(false);
                }
            });

            console.log("Getting initial session...");
            const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
            if(sessionError){ console.error("Error getting initial session:", sessionError); showScreen('auth-screen'); setLoading(false); }
            else if (!initialSession) {
                if (!document.getElementById('auth-screen')?.classList.contains('active')) { console.log("Initial: No session, show auth."); showScreen('auth-screen'); }
                else { console.log("Initial: No session, auth active."); }
                setLoading(false);
                checkSpotifyStatus(); 
             }
            // If session exists, onAuthStateChange handles init

        } catch (error) { console.error("FATAL Supabase init error:", error); document.body.innerHTML = `<div class="fatal-error"><h1>Init Fehler</h1><p>App konnte nicht laden. (${error.message})</p></div>`; setLoading(false); }
    }

    // --- Main Execution ---
    addEventListeners(); // SOFORT ausführen
    initializeSupabase(); // Parallel starten

}); // Ende DOMContentLoaded