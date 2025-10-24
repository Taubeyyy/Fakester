document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;

    // Globale Speicher für DB-Daten
    let userProfile = {};
    let userUnlockedAchievementIds = [];
    let onlineFriends = [];

    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
    let screenHistory = ['auth-screen'];

    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3
    };

    // NEU: Globale Variablen für Playlist-Pagination
    let allPlaylists = [], currentPage = 1, itemsPerPage = 10;
    
    // NEU: Globale Referenz für den WebSocket Ping-Intervall
    let wsPingInterval = null;


    // --- On-Page Konsole Setup ---
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');

    const originalConsole = { ...console };

    const formatArg = (arg) => {
        if (arg instanceof Error) {
            // Formatiere Fehler mit Stack Trace
            return `❌ Error: ${arg.message}\nStack:\n${arg.stack || 'No stack trace available'}`;
        }
        if (typeof arg === 'object' && arg !== null) {
            try {
                // Versuche, Objekte schön zu formatieren
                return JSON.stringify(arg, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value, // BigInt-Problem beheben
                    2 // Einrückung für Lesbarkeit
                );
            } catch (e) {
                // Fallback für zirkuläre Referenzen oder andere Stringify-Fehler
                return '[Object (circular structure or stringify failed)]';
            }
        }
        // Andere Typen direkt als String
        return String(arg);
    };

    const logToPage = (type, args) => {
        if (!consoleOutput) return;
        try {
            const message = args.map(formatArg).join(' '); // Nutze die neue Formatierungsfunktion
            const logEntry = document.createElement('div');
            logEntry.classList.add(`log-${type}`);
            // Nutze <pre> für bessere Formatierung, besonders bei Stack Traces
            logEntry.innerHTML = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: <pre>${message}</pre>`;
            consoleOutput.appendChild(logEntry);
            // Scrolle automatisch nach unten
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        } catch (e) {
            originalConsole.error("Error logging to page console:", e);
            // Logge den Fehler im Fallback in die Browser-Konsole
        }
    };

    // Überschreibe Konsolenmethoden
    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); };
    console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); };
    console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); };
    console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); };

    // Globale Fehler-Handler hinzufügen
    window.onerror = (message, source, lineno, colno, error) => {
        const errorArgs = error ? [error] : [message, `at ${source}:${lineno}:${colno}`];
        originalConsole.error('Uncaught Error:', ...errorArgs);
        logToPage('error', ['🚨 Uncaught Error:', ...errorArgs]);
        return true; // Verhindert, dass der Fehler in der Browser-Standardkonsole angezeigt wird (optional)
    };

    window.onunhandledrejection = (event) => {
        const reason = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason));
        originalConsole.error('Unhandled Promise Rejection:', reason);
        logToPage('error', ['🚧 Unhandled Promise Rejection:', reason]);
    };


    // Event Listener für Konsolen-Buttons
    toggleConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.toggle('hidden'));
    closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
    clearConsoleBtn?.addEventListener('click', () => { if(consoleOutput) consoleOutput.innerHTML = ''; });
    // --- Ende On-Page Konsole ---


    // --- ERWEITERTE DATENBANKEN ---
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
        { id: 12, name: ' knapp daneben', description: 'Antworte 5 Mal falsch in einem Spiel.' },
        { id: 13, name: 'Präzisionsarbeit', description: 'Errate Titel, Künstler UND Jahr exakt in einer Runde (Quiz).'},
        { id: 14, name: 'Sozial vernetzt', description: 'Füge deinen ersten Freund hinzu.' },
        { id: 15, name: 'Sammler', description: 'Schalte 5 Titel frei.' },
        { id: 16, name: 'Icon-Liebhaber', description: 'Schalte 5 Icons frei.' },
        { id: 17, name: 'Aufwärmrunde', description: 'Spiele 3 Spiele.' },
        { id: 18, name: 'Highscorer', description: 'Erreiche über 1000 Punkte in einem Spiel.' },
        { id: 19, name: 'Perfektionist', description: 'Beantworte alle Fragen in einem Spiel richtig (min. 5 Runden).'},
        { id: 20, name: 'Dabei sein ist alles', description: 'Verliere 3 Spiele.'}
    ];

    const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100));
    const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1);

    const titlesList = [
        { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1 },
        { id: 2, name: 'Musik-Kenner', unlockType: 'achievement', unlockValue: 2 },
        { id: 3, name: 'Legende', unlockType: 'achievement', unlockValue: 3 },
        { id: 4, name: 'Zeitreisender', unlockType: 'achievement', unlockValue: 4 },
        { id: 5, 'name': 'Star-Experte', unlockType: 'achievement', unlockValue: 5 },
        { id: 6, name: ' Pechvogel', unlockType: 'achievement', unlockValue: 12 },
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

        { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon' }
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

        { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon' }
    ];


    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    // --- DOM Element References ---
    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), },
        home: {
            logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'),
            createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'),
            usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'),
            friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'),
            profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'),
            profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'),
            levelProgressBtn: document.getElementById('level-progress-button'),
            profileXpText: document.getElementById('profile-xp-text')
        },
        modeSelection: {
            container: document.getElementById('mode-selection-screen').querySelector('.mode-selection-container')
        },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelectBtn: document.getElementById('device-select-button'),
            playlistSelectBtn: document.getElementById('playlist-select-button'),
            startGameBtn: document.getElementById('start-game-button'),
            inviteFriendsBtn: document.getElementById('invite-friends-button'),
            songCountPresets: document.getElementById('song-count-presets'),
            guessTimePresets: document.getElementById('guess-time-presets'),
            answerTypeContainer: document.getElementById('answer-type-container'),
            answerTypePresets: document.getElementById('answer-type-presets'),
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), gameContentArea: document.getElementById('game-content-area') },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), input: document.getElementById('guest-nickname-input') },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: {
            overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'),
            addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'),
            friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'),
            requestsCount: document.getElementById('requests-count'), tabsContainer: document.querySelector('.friends-modal .tabs'),
            tabs: document.querySelectorAll('.friends-modal .tab-button'),
            tabContents: document.querySelectorAll('.friends-modal .tab-content')
        },
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
        },
        changeNameModal: {
            overlay: document.getElementById('change-name-modal-overlay'),
            closeBtn: document.getElementById('close-change-name-modal-button'),
            submitBtn: document.getElementById('change-name-submit'),
            input: document.getElementById('change-name-input'),
        },
        deviceSelectModal: {
            overlay: document.getElementById('device-select-modal-overlay'),
            closeBtn: document.getElementById('close-device-select-modal'),
            list: document.getElementById('device-list'),
            refreshBtn: document.getElementById('refresh-devices-button-modal'),
        },
        playlistSelectModal: {
            overlay: document.getElementById('playlist-select-modal-overlay'),
            closeBtn: document.getElementById('close-playlist-select-modal'),
            list: document.getElementById('playlist-list'),
            search: document.getElementById('playlist-search'),
            pagination: document.getElementById('playlist-pagination'),
        },
        leaveConfirmModal: {
            overlay: document.getElementById('leave-confirm-modal-overlay'),
            confirmBtn: document.getElementById('confirm-leave-button'),
            cancelBtn: document.getElementById('cancel-leave-button'),
        },
        confirmActionModal: {
            overlay: document.getElementById('confirm-action-modal-overlay'),
            title: document.getElementById('confirm-action-title'),
            text: document.getElementById('confirm-action-text'),
            confirmBtn: document.getElementById('confirm-action-confirm-button'),
            cancelBtn: document.getElementById('confirm-action-cancel-button'),
        },
        stats: {
            screen: document.getElementById('stats-screen'),
            gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'),
            highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'),
            gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'),
        }
    };


    // --- Core Functions ---
    const showToast = (message, isError = false) => {
        console.log(`Toast: ${message} (Error: ${isError})`);
        Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    }
    const showScreen = (screenId) => {
        console.log(`Navigating to screen: ${screenId}`);
        const targetScreen = document.getElementById(screenId);
        if (!targetScreen) {
             console.error(`Screen with ID "${screenId}" not found!`);
             return;
        }
        const currentScreenId = screenHistory[screenHistory.length - 1];
        if (screenId !== currentScreenId) screenHistory.push(screenId);
        elements.screens.forEach(s => s.classList.remove('active'));
        targetScreen.classList.add('active');
        const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };
    const goBack = () => {
        if (screenHistory.length > 1) {
            const currentScreenId = screenHistory.pop();
            const previousScreenId = screenHistory[screenHistory.length - 1];
            console.log(`Navigating back to screen: ${previousScreenId}`);

            if (['game-screen', 'lobby-screen'].includes(currentScreenId)) {
                elements.leaveConfirmModal.overlay.classList.remove('hidden');
                screenHistory.push(currentScreenId);
                return;
            }

            const targetScreen = document.getElementById(previousScreenId);
            if (!targetScreen) {
                 console.error(`Back navigation failed: Screen "${previousScreenId}" not found!`);
                 screenHistory = ['auth-screen'];
                 window.location.reload();
                 return;
            }
            elements.screens.forEach(s => s.classList.remove('active'));
            targetScreen.classList.add('active');
            const showLeaveButton = !['auth-screen', 'home-screen'].includes(previousScreenId);
            elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
        }
    };
    const setLoading = (isLoading) => {
        console.log(`Setting loading overlay: ${isLoading}`);
        elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    }
    const showConfirmModal = (title, text, onConfirm) => {
        elements.confirmActionModal.title.textContent = title;
        elements.confirmActionModal.text.textContent = text;
        currentConfirmAction = onConfirm;
        elements.confirmActionModal.overlay.classList.remove('hidden');
    };

    // --- Helper Functions ---
    function isItemUnlocked(item, currentLevel) {
        if (!item || !currentUser || currentUser.isGuest) return false;
        if (currentUser.username.toLowerCase() === 'taubey') return true;

        switch (item.unlockType) {
            case 'level': return currentLevel >= item.unlockValue;
            case 'achievement': return userUnlockedAchievementIds.includes(item.unlockValue);
            case 'special': return currentUser.username.toLowerCase() === item.unlockValue.toLowerCase();
            default: return false;
        }
    }

    function getUnlockDescription(item) {
        if (!item) return '';
        switch (item.unlockType) {
            case 'level': return `Erreiche Level ${item.unlockValue}`;
            case 'achievement':
                const ach = achievementsList.find(a => a.id === item.unlockValue);
                return `Erfolg: ${ach ? ach.name : 'Unbekannt'}`;
            case 'special': return 'Spezial';
            default: return '';
        }
    }


    // --- Initialization and Auth ---
    const initializeApp = async (user, isGuest = false) => {
        console.log(`initializeApp called for user: ${user.username || user.id}, isGuest: ${isGuest}`);
        localStorage.removeItem('fakesterGame');
        // FIX: Kein setLoading(true) hier
        
        // FIX: Erzwingt eine Neusynchronisierung der Supabase-Sitzung.
        if (supabase) await supabase.auth.refreshSession();

        try {
            if (isGuest) {
                console.log("Setting up guest user...");
                currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest };
                userProfile = { xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, equipped_title_id: 1, equipped_icon_id: 1 };
                userUnlockedAchievementIds = [];
                 console.log("Guest user setup complete.");
            } else {
                console.log("Setting up logged-in user...");
                currentUser = { id: user.id, username: user.user_metadata?.username || 'Unbekannt', isGuest };

                console.log("1. Fetching profile data..."); // Debug Log 1
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profileError) {
                    console.error("Profil-Ladefehler:", profileError);
                    showToast("Fehler beim Laden deines Profils.", true);
                    // Fallback-Profil, damit die App nicht komplett abstürzt
                    userProfile = { id: user.id, username: currentUser.username, xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, equipped_title_id: 1, equipped_icon_id: 1 };
                } else {
                    userProfile = profile;
                    currentUser.username = profile.username;
                    console.log("Profile data fetched:", userProfile);
                }
                console.log("2. Profile fetched."); // Debug Log 2

                console.log("3. Fetching achievements..."); // Debug Log 3
                const { data: achievements, error: achError } = await supabase
                    .from('user_achievements')
                    .select('achievement_id')
                    .eq('user_id', user.id);

                if (achError) {
                    console.error("Erfolg-Ladefehler:", achError);
                    userUnlockedAchievementIds = [];
                } else {
                    userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id));
                    console.log("Achievements fetched:", userUnlockedAchievementIds);
                }
                console.log("4. Achievements fetched."); // Debug Log 4

                console.log("5. Checking Spotify status..."); // Debug Log 5
                await checkSpotifyStatus();
                console.log("6. Spotify status checked."); // Debug Log 6

                if (spotifyToken && !userUnlockedAchievementIds.includes(9)) {
                    await awardClientSideAchievement(9); // Make sure this is awaited if needed, or handle potential errors
                }

                console.log("7. Rendering UI components..."); // Debug Log 7
                renderAchievements();
                renderTitles();
                renderIcons();
                renderLevelProgress();
                updateStatsDisplay();
                console.log("UI components rendered.");

                console.log("Equipping title and icon...");
                equipTitle(userProfile.equipped_title_id || 1, false);
                equipIcon(userProfile.equipped_icon_id || 1, false);
                console.log("Title and icon equipped visually.");

                console.log("Updating player progress display...");
                updatePlayerProgressDisplay();
                console.log("Player progress display updated.");
                console.log("Logged-in user setup complete.");
            }

            document.body.classList.toggle('is-guest', isGuest);
            document.getElementById('welcome-nickname').textContent = currentUser.username;
             console.log("Showing home screen...");
            showScreen('home-screen');
            console.log("Connecting WebSocket...");
            connectWebSocket();
             console.log("initializeApp finished successfully.");

        } catch (error) {
            console.error("FATAL ERROR during initializeApp:", error);
            showToast("Ein kritischer Fehler ist aufgetreten. Bitte lade die Seite neu.", true);
            showScreen('auth-screen'); // Zeige den Auth-Screen bei Fehlern
        } finally {
            // Dieser Block wird IMMER ausgeführt, auch wenn ein Fehler auftritt
            setLoading(false);
            console.log("initializeApp finally block executed. Loading overlay hidden."); // Debug Log Finally
        }
    };


    const checkSpotifyStatus = async () => {
        try {
            console.log("Fetching /api/status...");
            const res = await fetch('/api/status');
            if (!res.ok) {
                 console.warn(`Spotify status check failed with status: ${res.status}`);
                 spotifyToken = null;
                 // Handle error explicitly if needed, e.g., show a toast
            } else {
                const data = await res.json();
                spotifyToken = data.loggedIn ? data.token : null;
                console.log("Spotify status result:", { loggedIn: data.loggedIn });
            }
        } catch (error) {
            console.error("Error fetching Spotify status:", error); // Log the actual error
            spotifyToken = null;
            // Optionally show a toast message about the connection error
            // showToast("Verbindung zu Spotify konnte nicht geprüft werden.", true);
        } finally {
             // Ensure UI updates happen even if the fetch fails
             document.getElementById('spotify-connect-button')?.classList.toggle('hidden', !!spotifyToken);
             elements.home.createRoomBtn?.classList.toggle('hidden', !spotifyToken);
             console.log("Spotify UI buttons updated based on token status.");
        }
    };


    const handleAuthAction = async (action, form, isRegister = false) => {
         setLoading(true);
        const usernameInput = form.querySelector('input[type="text"]');
        const passwordInput = form.querySelector('input[type="password"]');
        const username = usernameInput.value;
        const password = passwordInput.value;

        if (!username || !password) {
             showToast("Benutzername und Passwort dürfen nicht leer sein.", true);
             setLoading(false);
             return;
        }

        console.log(`Attempting ${isRegister ? 'signup' : 'login'} for user: ${username}`);

        try {
            let options = isRegister ? { options: { data: { username: username } } } : {};
            
            const { data, error } = await action.call(supabase.auth, { email: `${username}@fakester.app`, password, ...options });

            if (error) {
                console.error('Supabase Auth Error:', error);
                throw error; // Re-throw to be caught by the outer catch block
            }
             console.log(`${isRegister ? 'Signup' : 'Login'} successful for user: ${username}`, data);
             // initializeApp is called by the onAuthStateChange listener, no need to call it here.
        } catch (error) {
            let message = "Anmeldung fehlgeschlagen.";
            if (error.message.includes("Invalid login credentials")) message = "Ungültiger Benutzername oder Passwort.";
            else if (error.message.includes("User already registered")) message = "Benutzername bereits vergeben.";
            else if (error.message.includes("Password should be at least 6 characters")) message = "Passwort muss mind. 6 Zeichen lang sein.";
            else message = error.message; // Show the actual error message if it's different
            console.error('Authentication failed:', message);
            showToast(message, true);
        } finally {
            setLoading(false); // Ensure loading is stopped even on error
        }
    };
    
    const handleLogout = async () => {
         console.log("Logout initiated.");
        setLoading(true);
        if (currentUser?.isGuest) {
            console.log("Guest logout, reloading page.");
             // Simple reload for guest mode might be sufficient
             window.location.replace(window.location.origin);
             // No need to setLoading(false) as page reloads
             return;
        }
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            console.log("Supabase signOut successful.");
            // onAuthStateChange listener handles UI changes, but a reload ensures clean state
            window.location.replace(window.location.origin);
        } catch (error) {
            console.error("Error during logout:", error);
            showToast("Ausloggen fehlgeschlagen.", true);
             setLoading(false); // Only stop loading if logout fails
        }
        // No setLoading(false) needed here if reload happens
    };

    // --- Client-Side Achievement Vergabe ---
    const awardClientSideAchievement = async (achievementId) => {
        // Prevent awarding if user is guest, supabase not ready, or already awarded
        if (!currentUser || currentUser.isGuest || !supabase || userUnlockedAchievementIds.includes(achievementId)) return;

        console.log(`Attempting to award client-side achievement: ${achievementId}`);
        // Optimistic update: Add to local list first
        userUnlockedAchievementIds.push(achievementId);
        const achievement = achievementsList.find(a => a.id === achievementId);
        showToast(`Erfolg freigeschaltet: ${achievement?.name || 'Neuer Erfolg'}!`);
        // Re-render relevant UI parts immediately
        renderAchievements();
        renderTitles();
        renderIcons();

        // Then, try to save to DB
        const { error } = await supabase
            .from('user_achievements')
            .insert({ user_id: currentUser.id, achievement_id: achievementId });
        
        if (error) {
            console.error(`Fehler beim Speichern von Client-Achievement ${achievementId}:`, error);
            // Rollback optimistic update if saving fails (optional, depends on desired UX)
            // userUnlockedAchievementIds = userUnlockedAchievementIds.filter(id => id !== achievementId);
            // showToast("Fehler beim Speichern des Erfolgs.", true);
            // Re-render UI again after rollback if necessary
        } else {
            console.log(`Achievement ${achievementId} successfully saved to DB.`);
        }
    };


    // --- WebSocket Functions ---
    const connectWebSocket = () => {
        if(ws.socket && (ws.socket.readyState === WebSocket.OPEN || ws.socket.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket connection already open or connecting.");
            return;
        }
        
        if (wsPingInterval) clearInterval(wsPingInterval);

        // Determine WebSocket URL based on current protocol
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}`;
        console.log(`Attempting to connect WebSocket to: ${wsUrl}`);
        
        try {
            ws.socket = new WebSocket(wsUrl);
        } catch (error) {
            console.error("WebSocket creation failed:", error);
            showToast("Verbindung zum Server konnte nicht aufgebaut werden.", true);
            return; // Stop if WebSocket cannot be created
        }

        ws.socket.onopen = () => {
            console.info('✅ WebSocket connection established.');
            // Register user if logged in
            if (currentUser && !currentUser.isGuest) {
                console.log(`Registering user ${currentUser.id} with WebSocket server.`);
                ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id } }));
            }
            // Check for reconnect
            const storedGame = JSON.parse(localStorage.getItem('fakesterGame'));
            if (storedGame && currentUser && storedGame.playerId === currentUser.id) {
                console.log("Found stored game, attempting to reconnect:", storedGame);
                currentGame = storedGame;
                showToast('Verbinde erneut mit dem Spiel...');
                ws.socket.send(JSON.stringify({ type: 'reconnect', payload: { pin: currentGame.pin, playerId: currentGame.playerId } }));
            } else if (storedGame) {
                console.warn("Found stored game for a different user, removing.");
                localStorage.removeItem('fakesterGame');
            }
            
            // Start heartbeat ping
            wsPingInterval = setInterval(() => {
                if (ws.socket?.readyState === WebSocket.OPEN) {
                    // Send a ping message (server should handle pong response)
                    // console.debug("Sending WebSocket ping");
                    // ws.socket.send(JSON.stringify({ type: 'ping' }));
                } else {
                    console.warn("WebSocket not open, clearing ping interval.");
                    clearInterval(wsPingInterval);
                    wsPingInterval = null;
                }
            }, 30000); // Send ping every 30 seconds
        };

        ws.socket.onmessage = (event) => {
             try {
                 const data = JSON.parse(event.data);
                 // Handle pong response if server sends one
                 // if (data.type === 'pong') {
                 //     console.debug("Received WebSocket pong");
                 //     return;
                 // }
                 handleWebSocketMessage(data);
            } catch (error) {
                 console.error('Error processing WebSocket message:', error, event.data);
                 // Optionally show a generic error toast
                 // showToast("Fehler bei der Serverkommunikation.", true);
            }
        };

        ws.socket.onclose = (event) => {
            console.warn(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
            
            if (wsPingInterval) clearInterval(wsPingInterval);
            wsPingInterval = null;
            ws.socket = null; // Clear socket reference

            // Implement robust reconnect logic only if not on auth screen
            if (!document.getElementById('auth-screen')?.classList.contains('active')) {
                 // Use exponential backoff or similar strategy for retries
                 console.log("Attempting WebSocket reconnect in 5 seconds...");
                 setTimeout(connectWebSocket, 5000);
            }
        };
        
        ws.socket.onerror = (errorEvent) => {
             // Log the error event which might contain more details
             console.error('WebSocket error:', errorEvent);
             showToast("WebSocket-Verbindungsfehler.", true);
             // Consider closing the socket and attempting reconnect here as well
             ws.socket?.close();
        };
    };

    // ... (rest of the WebSocket message handling and other functions remain the same) ...
    // --- UI Rendering Functions ---
    // ... (renderPlayerList, updateHostSettings, etc.) ...
    // --- Game Logic Functions ---
    // ... (showCountdown, setupPreRound, setupNewRound, showRoundResult, etc.) ...
    // --- Friends Modal Logic ---
    // ... (loadFriendsData, renderRequestsList, renderFriendsList, etc.) ...
    // --- Utility & Modal Functions ---
    // ... (fetchHostData, renderPaginatedPlaylists, openCustomValueModal, showInvitePopup, etc.) ...
    // --- Event Listener Block ---
    // ... (addEventListeners function) ...
    // --- Supabase Initialization ---
    // ... (initializeSupabase function) ...


    // #################################################################
    // ### DER EVENT LISTENER BLOCK ###
    // #################################################################

    function addEventListeners() {
        console.log("Adding all application event listeners...");

        // --- Navigation & Allgemein ---
        elements.leaveGameButton.addEventListener('click', goBack);

        elements.leaveConfirmModal.cancelBtn.addEventListener('click', () => {
            elements.leaveConfirmModal.overlay.classList.add('hidden');
        });
        elements.leaveConfirmModal.confirmBtn.addEventListener('click', () => {
            if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                // Send leave message BEFORE navigating away
                ws.socket.send(JSON.stringify({ type: 'leave-game', payload: { pin: currentGame.pin, playerId: currentGame.playerId } }));
            }
            localStorage.removeItem('fakesterGame');
            currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
            // Reset history and navigate home AFTER sending leave message
            screenHistory = ['auth-screen', 'home-screen'];
            showScreen('home-screen');
            elements.leaveConfirmModal.overlay.classList.add('hidden'); // Close modal
        });

        // --- Auth Screen ---
        elements.auth.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!supabase) return console.error("Supabase not initialized!");
            handleAuthAction(supabase.auth.signInWithPassword, e.target, false);
        });
        elements.auth.registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!supabase) return console.error("Supabase not initialized!");
            handleAuthAction(supabase.auth.signUp, e.target, true);
        });
        elements.auth.showRegister.addEventListener('click', (e) => {
            e.preventDefault();
            elements.auth.loginForm.classList.add('hidden');
            elements.auth.registerForm.classList.remove('hidden');
        });
        elements.auth.showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            elements.auth.loginForm.classList.remove('hidden');
            elements.auth.registerForm.classList.add('hidden');
        });

        // --- Gast Modal ---
        elements.guestModal.openBtn.addEventListener('click', () => {
            elements.guestModal.overlay.classList.remove('hidden');
            elements.guestModal.input.focus();
        });
        elements.guestModal.closeBtn.addEventListener('click', () => {
            elements.guestModal.overlay.classList.add('hidden');
        });
        elements.guestModal.submitBtn.addEventListener('click', () => {
            const nickname = elements.guestModal.input.value;
            if (nickname.trim().length < 3 || nickname.trim().length > 15) { // Add max length check
                showToast("Nickname muss 3-15 Zeichen lang sein.", true);
                return;
            }
            elements.guestModal.overlay.classList.add('hidden'); // Close modal before init
            initializeApp({ username: nickname }, true);
        });

        // --- Home Screen ---
        elements.home.logoutBtn.addEventListener('click', handleLogout);
        
        document.getElementById('spotify-connect-button')?.addEventListener('click', (e) => {
            e.preventDefault();
            // Redirect to backend route that initiates Spotify OAuth
            window.location.href = '/login'; // Corrected route
        });

        elements.home.createRoomBtn.addEventListener('click', () => showScreen('mode-selection-screen'));
        elements.home.joinRoomBtn.addEventListener('click', () => {
            pinInput = ""; // Reset pin input
            elements.joinModal.pinDisplay.forEach(d => d.textContent = ""); // Clear display
            elements.joinModal.overlay.classList.remove('hidden');
        });
        elements.home.statsBtn.addEventListener('click', () => showScreen('stats-screen'));
        elements.home.achievementsBtn.addEventListener('click', () => showScreen('achievements-screen'));
        elements.home.levelProgressBtn.addEventListener('click', () => showScreen('level-progress-screen'));
        elements.home.profileTitleBtn.addEventListener('click', () => showScreen('title-selection-screen'));
        elements.home.profilePictureBtn.addEventListener('click', () => showScreen('icon-selection-screen'));
        elements.home.friendsBtn.addEventListener('click', () => {
            loadFriendsData(); // Load data when opening
            elements.friendsModal.overlay.classList.remove('hidden');
        });
        elements.home.usernameContainer.addEventListener('click', () => {
            if (!currentUser || currentUser.isGuest) return; // Only allow for logged-in users
            elements.changeNameModal.input.value = currentUser.username; // Pre-fill current name
            elements.changeNameModal.overlay.classList.remove('hidden');
            elements.changeNameModal.input.focus(); // Focus input field
        });

        // --- Modus & Spieltyp Auswahl ---
        elements.modeSelection.container.addEventListener('click', (e) => {
            const modeBox = e.target.closest('.mode-box');
            if (modeBox && !modeBox.disabled) {
                selectedGameMode = modeBox.dataset.mode;
                console.log(`Game mode selected: ${selectedGameMode}`);
                // Reset game type selection UI
                elements.gameTypeScreen.createLobbyBtn.disabled = true;
                elements.gameTypeScreen.pointsBtn.classList.remove('active');
                elements.gameTypeScreen.livesBtn.classList.remove('active');
                elements.gameTypeScreen.livesSettings.classList.add('hidden');
                showScreen('game-type-selection-screen');
            }
        });
        
        elements.gameTypeScreen.pointsBtn.addEventListener('click', () => {
            gameCreationSettings.gameType = 'points';
            elements.gameTypeScreen.pointsBtn.classList.add('active');
            elements.gameTypeScreen.livesBtn.classList.remove('active');
            elements.gameTypeScreen.livesSettings.classList.add('hidden');
            elements.gameTypeScreen.createLobbyBtn.disabled = false; // Enable create button
        });
        elements.gameTypeScreen.livesBtn.addEventListener('click', () => {
            gameCreationSettings.gameType = 'lives';
            elements.gameTypeScreen.pointsBtn.classList.remove('active');
            elements.gameTypeScreen.livesBtn.classList.add('active');
            elements.gameTypeScreen.livesSettings.classList.remove('hidden'); // Show lives settings
            elements.gameTypeScreen.createLobbyBtn.disabled = false; // Enable create button
        });

        elements.gameTypeScreen.livesPresets.addEventListener('click', (e) => {
            const button = e.target.closest('.preset-button');
            if (button) {
                // Deactivate all buttons first
                elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                button.classList.add('active'); // Activate clicked button
                const value = button.dataset.value;
                if (value === 'custom') {
                    openCustomValueModal('lives', 'Leben eingeben (1-10)'); // Adjust title
                } else {
                    gameCreationSettings.lives = parseInt(value);
                    console.log(`Lives set to: ${gameCreationSettings.lives}`);
                }
            }
        });

        elements.gameTypeScreen.createLobbyBtn.addEventListener('click', () => {
            if (!selectedGameMode || !gameCreationSettings.gameType) {
                showToast("Fehler: Spielmodus oder Spieltyp nicht ausgewählt.", true);
                return;
            }
            if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
                showToast("Keine Verbindung zum Server.", true);
                return;
            }
            setLoading(true); // Show loading indicator
            ws.socket.send(JSON.stringify({
                type: 'create-game',
                payload: {
                    user: currentUser, // Send user object (contains id, username)
                    token: spotifyToken, // Send Spotify token if available (for host)
                    gameMode: selectedGameMode,
                    gameType: gameCreationSettings.gameType,
                    lives: gameCreationSettings.gameType === 'lives' ? gameCreationSettings.lives : 3 // Send lives only if relevant
                }
            }));
        });

        // --- Lobby Screen ---
        elements.lobby.inviteFriendsBtn.addEventListener('click', async () => {
            if (!supabase || !currentUser || currentUser.isGuest) return;
            setLoading(true); // Show loading while fetching friends
            try {
                // Use Supabase RPC function to get online friends
                const { data, error } = await supabase.rpc('get_online_friends', { p_user_id: currentUser.id });
                if (error) throw error;

                const list = elements.inviteFriendsModal.list;
                list.innerHTML = ''; // Clear previous list
                if (data.length === 0) {
                    list.innerHTML = '<li>Keine Freunde online.</li>';
                } else {
                    data.forEach(friend => {
                        // Create list item with friend info and invite button
                        list.innerHTML += `
                            <li data-friend-id="${friend.id}" data-friend-name="${friend.username}">
                                ${friend.username} <span class="friend-status online">Online</span>
                            </li>`;
                    });
                }
                elements.inviteFriendsModal.overlay.classList.remove('hidden'); // Show modal
            } catch (error) {
                 console.error("Error fetching online friends:", error);
                 showToast("Fehler beim Laden der Online-Freunde.", true);
            } finally {
                setLoading(false); // Hide loading indicator
            }
        });
        
        elements.lobby.deviceSelectBtn.addEventListener('click', () => elements.deviceSelectModal.overlay.classList.remove('hidden'));
        elements.lobby.playlistSelectBtn.addEventListener('click', () => elements.playlistSelectModal.overlay.classList.remove('hidden'));
        
        // Use event delegation for preset buttons
        document.getElementById('host-settings').addEventListener('click', (e) => {
             const button = e.target.closest('.preset-button');
             if (!button) return;
             
             const container = button.closest('.preset-group');
             if (!container) return;

             const typeMap = {
                 'song-count-presets': 'song',
                 'guess-time-presets': 'time',
                 'answer-type-presets': 'answer'
                 // 'lives-count-presets' handled separately if needed elsewhere
             };
             const type = typeMap[container.id];

             if (type) {
                 handlePresetClick(e, type);
             }
        });
        
        elements.lobby.startGameBtn.addEventListener('click', () => {
             if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                 // Additional check: Ensure host has selected device and playlist
                 if (elements.lobby.startGameBtn.disabled) {
                      showToast("Bitte wähle zuerst ein Gerät und eine Playlist.", true);
                      return;
                 }
                 setLoading(true); // Show loading indicator
                 ws.socket.send(JSON.stringify({ type: 'start-game', payload: { pin: currentGame.pin } })); // Send PIN with start request
             }
        });

        // --- Item/Title/Icon Selection Screens ---
        elements.titles.list.addEventListener('click', (e) => {
            const card = e.target.closest('.title-card:not(.locked)');
            if (card) {
                const titleId = parseInt(card.dataset.titleId);
                if (!isNaN(titleId)) {
                    equipTitle(titleId, true); // Save selection to DB
                }
            }
        });
        elements.icons.list.addEventListener('click', (e) => {
            const card = e.target.closest('.icon-card:not(.locked)');
            if (card) {
                const iconId = parseInt(card.dataset.iconId);
                 if (!isNaN(iconId)) {
                    equipIcon(iconId, true); // Save selection to DB
                 }
            }
        });

        // --- Modal: Close Buttons (Generic) ---
        document.querySelectorAll('.button-exit-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal-overlay')?.classList.add('hidden'); // Use optional chaining
            });
        });

        // --- Modal: Join ---
        elements.joinModal.numpad.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const key = button.dataset.key;
            const action = button.dataset.action;

            if (key >= '0' && key <= '9' && pinInput.length < 4) { // Allow only numbers 0-9
                 pinInput += key;
            } else if (action === 'clear' || action === 'backspace') { // Treat clear and backspace the same for simplicity
                 pinInput = pinInput.slice(0, -1);
            } else if (action === 'confirm' && pinInput.length === 4) {
                if (!currentUser) return showToast("Bitte zuerst anmelden oder als Gast spielen.", true);
                if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
                setLoading(true); // Show loading indicator
                // Send user object including guest status
                ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
                // Pin input reset is handled by server response (success or error)
            }
            // Update PIN display visually
            elements.joinModal.pinDisplay.forEach((d, i) => d.textContent = pinInput[i] || "");
            // Enable/disable confirm button based on PIN length
            elements.joinModal.numpad.querySelector('[data-action="confirm"]').disabled = pinInput.length !== 4;
        });

        // --- Modal: Friends ---
        elements.friendsModal.tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-button');
            if (tab && !tab.classList.contains('active')) { // Only switch if not already active
                elements.friendsModal.tabs.forEach(t => t.classList.remove('active'));
                elements.friendsModal.tabContents.forEach(c => c.classList.remove('active')); // Use 'active' class for content too
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab)?.classList.add('active'); // Use optional chaining
            }
        });
        elements.friendsModal.addFriendBtn.addEventListener('click', async () => { // Make async for await
            const friendName = elements.friendsModal.addFriendInput.value.trim(); // Trim whitespace
            if (friendName.length < 3) return showToast("Benutzername muss mind. 3 Zeichen lang sein.", true);
            if (friendName === currentUser?.username) return showToast("Du kannst dich nicht selbst hinzufügen.", true); // Prevent self-adding

            setLoading(true); // Show loading
            try {
                 // Check if friendship or request already exists
                 const { data: existing, error: checkError } = await supabase
                      .rpc('check_friendship_status', { user_id_1: currentUser.id, user_id_2_username: friendName });
                 
                 if (checkError) throw checkError;

                 if (existing === 'friends') {
                      showToast("Ihr seid bereits Freunde.", true);
                 } else if (existing === 'pending_sent') {
                      showToast("Du hast diesem Benutzer bereits eine Anfrage gesendet.", true);
                 } else if (existing === 'pending_received') {
                      showToast("Dieser Benutzer hat dir eine Anfrage gesendet. Bitte prüfe deine Anfragen.", true);
                 } else if (existing === 'not_found') {
                      showToast(`Benutzer "${friendName}" nicht gefunden.`, true);
                 } else { // 'none'
                     // Send request via WebSocket
                     if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
                     ws.socket.send(JSON.stringify({ type: 'add-friend', payload: { friendName } }));
                     elements.friendsModal.addFriendInput.value = ''; // Clear input on success
                     showToast(`Anfrage an ${friendName} gesendet.`);
                 }

            } catch (error) {
                 console.error("Error adding friend:", error);
                 showToast("Fehler beim Senden der Anfrage.", true);
            } finally {
                 setLoading(false); // Hide loading
            }
        });
        // Use event delegation for request list actions
        elements.friendsModal.requestsList.addEventListener('click', (e) => {
            const acceptBtn = e.target.closest('.accept-request');
            const declineBtn = e.target.closest('.decline-request');
            if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
            
            if (acceptBtn) {
                const senderId = acceptBtn.dataset.senderId;
                ws.socket.send(JSON.stringify({ type: 'accept-friend-request', payload: { senderId } }));
                // Optimistic UI update: Remove the request item immediately
                acceptBtn.closest('li')?.remove();
                loadFriendsData(); // Refresh lists after action
            }
            if (declineBtn) {
                const senderId = declineBtn.dataset.senderId;
                const senderName = declineBtn.dataset.senderName || 'diesem Benutzer';
                showConfirmModal("Anfrage ablehnen?", `Möchtest du die Freundschaftsanfrage von ${senderName} wirklich ablehnen?`, () => {
                     ws.socket.send(JSON.stringify({ type: 'decline-friend-request', payload: { userId: senderId } }));
                     // Optimistic UI update: Remove the request item immediately
                     declineBtn.closest('li')?.remove();
                     loadFriendsData(); // Refresh lists after action
                });
            }
        });
         // Use event delegation for friends list actions
        elements.friendsModal.friendsList.addEventListener('click', (e) => {
             const removeBtn = e.target.closest('.remove-friend');
             if (removeBtn) {
                const friendId = removeBtn.dataset.friendId;
                const friendName = removeBtn.dataset.friendName || 'diesen Freund';
                showConfirmModal("Freund entfernen?", `Möchtest du ${friendName} wirklich aus deiner Freundesliste entfernen?`, () => {
                    if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
                    ws.socket.send(JSON.stringify({ type: 'remove-friend', payload: { friendId } }));
                     // Optimistic UI update: Remove the friend item immediately
                    removeBtn.closest('li')?.remove();
                    loadFriendsData(); // Refresh lists after action
                });
             }
        });

        // --- Modal: Invite Friends ---
        elements.inviteFriendsModal.list.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-friend-id]'); // Ensure it's a list item with friend ID
            if (li) {
                if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
                ws.socket.send(JSON.stringify({
                    type: 'invite-friend',
                    payload: { friendId: li.dataset.friendId, friendName: li.dataset.friendName, pin: currentGame.pin } // Include PIN
                }));
                // Optionally disable the invite button for this friend or close the modal
                elements.inviteFriendsModal.overlay.classList.add('hidden');
                showToast(`Einladung an ${li.dataset.friendName} gesendet.`);
            }
        });

        // --- Modal: Custom Value ---
        elements.customValueModal.numpad.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const key = button.dataset.key;
            const action = button.dataset.action;
            
            if (key >= '0' && key <= '9' && customValueInput.length < 3) { // Limit input length (e.g., 3 digits)
                customValueInput += key;
            } else if (action === 'backspace') {
                customValueInput = customValueInput.slice(0, -1);
            }
            // Update display after modification
            elements.customValueModal.display.forEach((d, i) => d.textContent = customValueInput[i] || "");
            // Enable/disable confirm based on input
            elements.customValueModal.confirmBtn.disabled = customValueInput.length === 0;
        });
        elements.customValueModal.confirmBtn.addEventListener('click', () => {
            const value = parseInt(customValueInput);
             // Validate value based on type
            let isValid = false;
            let min = 1, max = 999; // Default range

            if (currentCustomType === 'lives') {
                 min = 1; max = 10;
                 isValid = !isNaN(value) && value >= min && value <= max;
            } else if (currentCustomType === 'song-count') {
                 min = 5; max = 100; // Example range for song count
                 isValid = !isNaN(value) && value >= min && value <= max;
            } else if (currentCustomType === 'guess-time') {
                 min = 10; max = 60; // Example range for guess time
                 isValid = !isNaN(value) && value >= min && value <= max;
            }

            if (!isValid) {
                 showToast(`Ungültiger Wert. Bitte gib eine Zahl zwischen ${min} und ${max} ein.`, true);
                 return;
            }

            // Apply the setting
            let payload = {};
            if (currentCustomType === 'lives') {
                gameCreationSettings.lives = value;
                // Update UI immediately for lives setting in lobby creation
                const customBtn = elements.gameTypeScreen.livesPresets.querySelector('[data-value="custom"]');
                if (customBtn) {
                     customBtn.textContent = value;
                     customBtn.classList.add('active'); // Ensure custom is marked active
                     // Deactivate other presets
                     elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button:not([data-value="custom"])').forEach(b => b.classList.remove('active'));
                }
            } else {
                 // Map custom type back to setting key for server
                 if (currentCustomType === 'song-count') payload['songCount'] = value;
                 else if (currentCustomType === 'guess-time') payload['guessTime'] = value;
                 
                 // Send update to server if in lobby
                 if (ws.socket && ws.socket.readyState === WebSocket.OPEN && currentGame.pin) {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload }));
                 }
            }
            // Close modal and reset input
            elements.customValueModal.overlay.classList.add('hidden');
            customValueInput = "";
        });

        // --- Modal: Change Name ---
        elements.changeNameModal.submitBtn.addEventListener('click', async () => {
            const newName = elements.changeNameModal.input.value.trim();
            if (newName.length < 3 || newName.length > 15) return showToast("Benutzername muss 3-15 Zeichen lang sein.", true);
            if (newName === currentUser.username) return elements.changeNameModal.overlay.classList.add('hidden'); // No change needed
            
            setLoading(true);
            try {
                 // Use Supabase RPC function to change username atomically
                 const { error } = await supabase.rpc('change_username', { new_username: newName });

                 if (error) {
                      // Handle specific errors like 'Username already taken'
                      if (error.message.includes('duplicate key value violates unique constraint')) {
                           showToast("Dieser Benutzername ist bereits vergeben.", true);
                      } else {
                           throw error; // Re-throw other errors
                      }
                 } else {
                      // Success: Update local state and UI
                      currentUser.username = newName;
                      userProfile.username = newName; // Update local profile cache
                      document.getElementById('welcome-nickname').textContent = newName;

                      // Inform WebSocket server if in a game
                      if (ws.socket && ws.socket.readyState === WebSocket.OPEN && currentGame.pin) {
                          ws.socket.send(JSON.stringify({ type: 'update-nickname', payload: { newName } }));
                      }

                      showToast("Benutzername erfolgreich geändert!");
                      elements.changeNameModal.overlay.classList.add('hidden'); // Close modal
                 }

            } catch (error) {
                 console.error("Error changing name:", error);
                 showToast("Fehler beim Ändern des Benutzernamens.", true);
            } finally {
                setLoading(false);
            }
        });

        // --- Modal: Device Select ---
        elements.deviceSelectModal.refreshBtn.addEventListener('click', () => fetchHostData(true)); // Pass true to force refresh
        elements.deviceSelectModal.list.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-id]'); // Ensure it's a list item with an ID
            if (li) {
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN && currentGame.pin && currentGame.isHost) { // Check if host
                    ws.socket.send(JSON.stringify({
                        type: 'update-settings',
                        payload: { deviceId: li.dataset.id, deviceName: li.dataset.name }
                    }));
                } else {
                     showToast("Nur der Host kann das Gerät ändern.", true);
                }
                elements.deviceSelectModal.overlay.classList.add('hidden'); // Close modal regardless
            }
        });

        // --- Modal: Playlist Select ---
        elements.playlistSelectModal.search.addEventListener('input', () => {
            // Basic debouncing to avoid excessive rendering on typing
            clearTimeout(elements.playlistSelectModal.search.debounceTimer);
            elements.playlistSelectModal.search.debounceTimer = setTimeout(() => {
                 renderPaginatedPlaylists(allPlaylists, 1); // Reset to page 1 on search
            }, 300); // 300ms delay
        });
        elements.playlistSelectModal.list.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-id]'); // Ensure it's a list item with an ID
            if (li) {
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN && currentGame.pin && currentGame.isHost) { // Check if host
                    ws.socket.send(JSON.stringify({
                        type: 'update-settings',
                        payload: { playlistId: li.dataset.id, playlistName: li.dataset.name }
                    }));
                } else {
                     showToast("Nur der Host kann die Playlist ändern.", true);
                }
                elements.playlistSelectModal.overlay.classList.add('hidden'); // Close modal regardless
            }
        });
        // Use event delegation for pagination buttons
        elements.playlistSelectModal.pagination.addEventListener('click', (e) => {
            const prevButton = e.target.closest('#prev-page');
            const nextButton = e.target.closest('#next-page');
            if (prevButton && !prevButton.disabled) { // Check if not disabled
                renderPaginatedPlaylists(allPlaylists, currentPage - 1);
            } else if (nextButton && !nextButton.disabled) { // Check if not disabled
                renderPaginatedPlaylists(allPlaylists, currentPage + 1);
            }
        });

        // --- Modal: Confirm Action ---
        elements.confirmActionModal.cancelBtn.addEventListener('click', () => {
            elements.confirmActionModal.overlay.classList.add('hidden');
            currentConfirmAction = null; // Clear action if cancelled
        });
        elements.confirmActionModal.confirmBtn.addEventListener('click', () => {
            if (typeof currentConfirmAction === 'function') { // Check if it's a function
                currentConfirmAction(); // Execute the stored action
            }
            elements.confirmActionModal.overlay.classList.add('hidden');
            currentConfirmAction = null; // Clear action after execution
        });

        console.log("All event listeners added.");
    }


    // #################################################################
    // ### SUPABASE INITIALISIERUNG ###
    // #################################################################

    async function initializeSupabase() {
        try {
            console.log("Fetching /api/config...");
            const response = await fetch('/api/config'); // Fetch config from backend
            if (!response.ok) {
                 // Handle error fetching config (e.g., show error message, retry?)
                 throw new Error(`Failed to fetch config: ${response.statusText}`);
            }
            const config = await response.json();
            
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error("Supabase URL or Anon Key is missing from config.");
            }

            // Initialize Supabase client using keys from config
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
                // Supabase client options (e.g., persistence)
                global: {
                    fetch: (...args) => window.fetch(...args) // Use browser's fetch
                },
                // Optional: Configure auth persistence (e.g., localStorage)
                // auth: {
                //     persistSession: true,
                //     autoRefreshToken: true,
                //     detectSessionInUrl: true
                // }
            });
            console.log("Supabase client initialized successfully.");

            // --- Auth State Change Listener ---
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`Supabase Auth Event: ${event}`, session); // Log session details
                
                // Clear sensitive data on sign out immediately
                if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    userProfile = {};
                    userUnlockedAchievementIds = [];
                    spotifyToken = null; // Clear Spotify token too
                    
                    // Close WebSocket connection cleanly
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                         console.log("Closing WebSocket due to SIGNED_OUT.");
                         ws.socket.close();
                    }
                    if (wsPingInterval) clearInterval(wsPingInterval); // Clear heartbeat interval
                    wsPingInterval = null;
                    ws.socket = null; // Reset socket reference

                    localStorage.removeItem('fakesterGame'); // Clear any stored game state
                    screenHistory = ['auth-screen']; // Reset navigation history
                    showScreen('auth-screen'); // Navigate to login screen
                    document.body.classList.add('is-guest'); // Set body class for guest state
                    setLoading(false); // Ensure loading overlay is hidden
                    return; // Stop further processing for SIGNED_OUT
                }

                // Handle SIGNED_IN or when session becomes available (INITIAL_SESSION, TOKEN_REFRESHED)
                if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session?.user) {
                     console.log(`Session available for user ${session.user.id}. Initializing app...`);
                     // Prevent multiple initializations if event fires rapidly
                     if (!currentUser || currentUser.id !== session.user.id) {
                          setLoading(true); // Show loading overlay during initialization
                          await initializeApp(session.user, false);
                     } else {
                          console.log("App already initialized for this user.");
                          // Optional: Refresh some data if needed on TOKEN_REFRESHED
                          if (event === 'TOKEN_REFRESHED') {
                               await checkSpotifyStatus(); // Re-check Spotify status
                          }
                     }
                } else if (!session) {
                     // No session found or session expired (handle cases like password recovery confirmation)
                     console.log("No active session. Showing auth screen.");
                     // Ensure cleanup similar to SIGNED_OUT if transitioning from logged-in state
                     if (currentUser) {
                          // Perform necessary cleanup if the user was previously logged in
                          currentUser = null;
                          // ... (other cleanup like closing WebSocket) ...
                          localStorage.removeItem('fakesterGame');
                          screenHistory = ['auth-screen'];
                          showScreen('auth-screen');
                          document.body.classList.add('is-guest');
                          setLoading(false);
                     } else {
                          // If already logged out or initial load without session
                          showScreen('auth-screen');
                          setLoading(false);
                     }
                }
            });

            // No need to manually call getSession(), onAuthStateChange handles INITIAL_SESSION

            addEventListeners(); // Add event listeners after Supabase setup

        } catch (error) {
            console.error("FATAL ERROR during Supabase initialization:", error);
            // Display a user-friendly error message on the page
            document.body.innerHTML = `<div class="fatal-error"><h1>Initialisierungsfehler</h1><p>Die Anwendung konnte nicht geladen werden. Bitte versuche es später erneut oder kontaktiere den Support.</p><p class="error-details">Fehler: ${error.message}</p></div>`;
            setLoading(false); // Ensure loading overlay is hidden even on fatal error
        }
        // No finally block needed here for setLoading(false) as onAuthStateChange handles it
    }


    // --- Main Execution ---
    initializeSupabase(); // Start the initialization process
});
