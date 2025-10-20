  document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null; // Für das Bestätigungs-Modal

    // Globale Speicher für DB-Daten
    let userProfile = {};
    let userUnlockedAchievementIds = [];
    let onlineFriends = []; // Wird (später) per WebSocket aktualisiert

    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
    let screenHistory = ['auth-screen'];

    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3
    };

    // NEU: Globale Variablen für Playlist-Pagination
    let allPlaylists = [], currentPage = 1, itemsPerPage = 10;


    // --- On-Page Konsole Setup ---
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');

    const originalConsole = { ...console }; // Original-Konsole speichern

    const logToPage = (type, args) => {
        if (!consoleOutput) return;
        try {
            const message = args.map(arg => {
                if (arg instanceof Error) {
                    return `Error: ${arg.message}\nStack: ${arg.stack}`;
                }
                return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
            }).join(' ');
            const logEntry = document.createElement('div');
            logEntry.classList.add(`log-${type}`);
            // Sanitize message to prevent potential XSS if user input ever gets logged (unlikely here, but good practice)
            logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`;
            consoleOutput.appendChild(logEntry);
            consoleOutput.scrollTop = consoleOutput.scrollHeight; // Auto-scroll
        } catch (e) {
            originalConsole.error("Error logging to page:", e); // Log internal errors to original console
            const errorEntry = document.createElement('div');
            errorEntry.classList.add('log-error');
            errorEntry.textContent = `[ERROR] ${new Date().toLocaleTimeString()}: Failed to log message. See browser console.`;
            if(consoleOutput) { // Check if consoleOutput still exists
                 consoleOutput.appendChild(errorEntry);
                 consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
        }
    };

    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); };
    console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); };
    console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); };
    console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); };

    // Console-Listener SIND BEREITS VORHANDEN und korrekt
    toggleConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.toggle('hidden'));
    closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
    clearConsoleBtn?.addEventListener('click', () => { if(consoleOutput) consoleOutput.innerHTML = ''; });
    // --- Ende On-Page Konsole ---

    // --- NEUE ERWEITERTE DATENBANKEN ---
    const achievementsList = [
        // Bestehende
        { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' },
        { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig (gesamt).' },
        { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' },
        { id: 4, name: 'Historiker', description: 'Gewinne eine Timeline-Runde.' }, // Wird jetzt serverseitig geprüft
        { id: 5, name: 'Trendsetter', description: 'Gewinne eine Fame-Runde.' }, // Wird jetzt serverseitig geprüft
        { id: 6, name: 'Musik-Lexikon', description: 'Beantworte 500 Fragen richtig (gesamt).' },
        { id: 7, name: 'Unbesiegbar', description: 'Gewinne 5 Spiele in Folge.' }, // Wird jetzt serverseitig geprüft
        { id: 8, name: 'Jahrhundert-Genie', description: 'Errate das Jahr 25 Mal exakt (gesamt).' }, // Wird jetzt serverseitig geprüft
        { id: 9, name: 'Spotify-Junkie', description: 'Verbinde dein Spotify-Konto.' }, // Bleibt clientseitig? Oder serverseitig prüfen? Einfachheitshalber client.
        { id: 10, name: 'Gastgeber', description: 'Hoste dein erstes Spiel.' }, // Wird jetzt serverseitig geprüft
        { id: 11, name: 'Party-Löwe', description: 'Spiele mit 3+ Freunden (in einer Lobby).' }, // Wird jetzt serverseitig geprüft
        // NEUE Achievements
        { id: 12, name: ' knapp daneben', description: 'Antworte 5 Mal falsch in einem Spiel.' }, // Server TODO
        { id: 13, name: 'Präzisionsarbeit', description: 'Errate Titel, Künstler UND Jahr exakt in einer Runde (Quiz).'}, // Server TODO
        { id: 14, name: 'Sozial vernetzt', description: 'Füge deinen ersten Freund hinzu.' }, // Server (wenn Freundschaft akzeptiert wird)
        { id: 15, name: 'Sammler', description: 'Schalte 5 Titel frei.' }, // Client
        { id: 16, name: 'Icon-Liebhaber', description: 'Schalte 5 Icons frei.' }, // Client
        { id: 17, name: 'Aufwärmrunde', description: 'Spiele 3 Spiele.' }, // Server
        { id: 18, name: 'Highscorer', description: 'Erreiche über 1000 Punkte in einem Spiel.' }, // Server
        { id: 19, name: 'Perfektionist', description: 'Beantworte alle Fragen in einem Spiel richtig (min. 5 Runden).'}, // Server TODO
        { id: 20, name: 'Dabei sein ist alles', description: 'Verliere 3 Spiele.'} // Server
    ];

    const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100)); // Ensure non-negative
    const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1); // Ensure level >= 1

    const titlesList = [
        // Bestehende + Neue
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

        { id: 99, name: 'Entwickler', unlockType: 'special', unlockValue: 'Taubey' }
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
    // (elements object definition remains the same as before)
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
            profileXpText: document.getElementById('profile-xp-text') // NEU: XP Text Element
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
        confirmActionModal: { // NEU
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
        console.log(`Toast: ${message} (Error: ${isError})`); // Logge Toasts
        Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    }
    const showScreen = (screenId) => {
        console.log(`Navigating to screen: ${screenId}`); // Logge Screenwechsel
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
            const currentScreenId = screenHistory.pop(); // Entferne aktuellen Screen
            const previousScreenId = screenHistory[screenHistory.length - 1]; // Hol den letzten
            console.log(`Navigating back to screen: ${previousScreenId}`);

            // Speziallogik für Spiel-Screens
            if (['game-screen', 'lobby-screen'].includes(currentScreenId)) {
                elements.leaveConfirmModal.overlay.classList.remove('hidden');
                screenHistory.push(currentScreenId); // Füge Screen wieder hinzu, da Abbruch möglich
                return;
            }

            // Standard-Navigation
            const targetScreen = document.getElementById(previousScreenId);
            if (!targetScreen) {
                 console.error(`Back navigation failed: Screen "${previousScreenId}" not found!`);
                 screenHistory = ['auth-screen']; // Reset
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
        console.log(`Setting loading overlay: ${isLoading}`); // Logge Ladezustand
        elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    }
    const showConfirmModal = (title, text, onConfirm) => {
        elements.confirmActionModal.title.textContent = title;
        elements.confirmActionModal.text.textContent = text;
        currentConfirmAction = onConfirm; // Speichere die Callback-Funktion
        elements.confirmActionModal.overlay.classList.remove('hidden');
    };

    // --- Helper Functions ---
    // (isItemUnlocked, getUnlockDescription remain the same)
    function isItemUnlocked(item, currentLevel) {
        if (!item || !currentUser || currentUser.isGuest) return false;
        // Dev bypass
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
    // (initializeApp, checkSpotifyStatus, handleAuthAction, handleLogout remain mostly the same, with added logging)
     // Angepasste initializeApp mit mehr Logging
    const initializeApp = async (user, isGuest = false) => {
        console.log(`initializeApp called for user: ${user.username || user.id}, isGuest: ${isGuest}`);
        localStorage.removeItem('fakesterGame'); // Sicherheitshalber
        setLoading(true);
        
        // =========================================================
        // ### HIER IST DER NEUE FIX ###
        // Erzwingt eine Neusynchronisierung der Supabase-Sitzung,
        // um veraltete/kaputte States nach Redirects zu beheben.
        if (supabase) await supabase.auth.refreshSession();
        // =========================================================

        try {
            if (isGuest) {
                console.log("Setting up guest user...");
                currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest };
                userProfile = { xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, equipped_title_id: 1, equipped_icon_id: 1 };
                userUnlockedAchievementIds = [];
                 console.log("Guest user setup complete.");
            } else {
                console.log("Setting up logged-in user...");
                currentUser = { id: user.id, username: user.user_metadata?.username || 'Unbekannt', isGuest }; // Fallback für Username

                // Lade Profildaten
                console.log("Fetching profile data...");
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profileError) {
                    console.error("Profil-Ladefehler:", profileError);
                    showToast("Fehler beim Laden deines Profils.", true);
                    // Fallback-Profil, damit die App nicht crasht
                    userProfile = { id: user.id, username: currentUser.username, xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, equipped_title_id: 1, equipped_icon_id: 1 };
                } else {
                    userProfile = profile;
                    currentUser.username = profile.username; // Stelle sicher, dass der Username aus der DB kommt
                    console.log("Profile data fetched:", userProfile);
                }

                // Lade Erfolge
                console.log("Fetching achievements...");
                const { data: achievements, error: achError } = await supabase
                    .from('user_achievements')
                    .select('achievement_id')
                    .eq('user_id', user.id);

                if (achError) {
                    console.error("Erfolg-Ladefehler:", achError);
                    userUnlockedAchievementIds = [];
                } else {
                    userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id)); // Sicherstellen, dass nur Zahlen im Array sind
                    console.log("Achievements fetched:", userUnlockedAchievementIds);
                }

                console.log("Checking Spotify status...");
                await checkSpotifyStatus();
                console.log("Spotify status checked.");

                 // Clientseitige Achievements prüfen (z.B. Spotify verbunden)
                if (spotifyToken && !userUnlockedAchievementIds.includes(9)) {
                    awardClientSideAchievement(9); // Spotify-Junkie
                }

                console.log("Rendering UI components...");
                renderAchievements();
                renderTitles();
                renderIcons();
                renderLevelProgress();
                updateStatsDisplay();
                console.log("UI components rendered.");

                console.log("Equipping title and icon...");
                // Wichtig: Beim Initialisieren equip aufrufen, aber nicht speichern (saveToDb = false)
                equipTitle(userProfile.equipped_title_id || 1, false);
                equipIcon(userProfile.equipped_icon_id || 1, false);
                console.log("Title and icon equipped visually.");

                console.log("Updating player progress display...");
                updatePlayerProgressDisplay(); // Nur Anzeige aktualisieren, keine Logik
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
        } finally {
            setLoading(false); // Wird IMMER ausgeführt, auch bei Fehlern
        }
    };

    const checkSpotifyStatus = async () => {
        // ... (Bleibt gleich, mit logging)
        try {
            console.log("Fetching /api/status");
            const res = await fetch('/api/status');
            if (!res.ok) {
                 console.warn(`Spotify status check failed with status: ${res.status}`);
                 spotifyToken = null;
            } else {
                const data = await res.json();
                spotifyToken = data.loggedIn ? data.token : null;
                console.log("Spotify status:", { loggedIn: data.loggedIn });
            }
        } catch (error) {
            console.error("Error fetching Spotify status:", error);
            spotifyToken = null;
        }
        document.getElementById('spotify-connect-button')?.classList.toggle('hidden', !!spotifyToken);
        elements.home.createRoomBtn?.classList.toggle('hidden', !spotifyToken);
    };

    const handleAuthAction = async (action, form, isRegister = false) => {
         // ... (Bleibt gleich, mit logging)
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
            
            // ###################
            // ### HIER IST DER FIX ###
            // ###################
            const { data, error } = await action.call(supabase.auth, { email: `${username}@fakester.app`, password, ...options });

            if (error) {
                console.error('Supabase Auth Error:', error);
                throw error;
            }
             console.log(`${isRegister ? 'Signup' : 'Login'} successful for user: ${username}`, data);
             // initializeApp wird jetzt vom onAuthStateChange Listener aufgerufen
        } catch (error) {
            let message = "Anmeldung fehlgeschlagen.";
            if (error.message.includes("Invalid login credentials")) message = "Ungültiger Benutzername oder Passwort.";
            else if (error.message.includes("User already registered")) message = "Benutzername bereits vergeben.";
            else if (error.message.includes("Password should be at least 6 characters")) message = "Passwort muss mind. 6 Zeichen lang sein.";
            else message = error.message;
            console.error('Authentication failed:', message);
            showToast(message, true);
        } finally {
            setLoading(false);
        }
    };
    const handleLogout = async () => {
         // ... (Bleibt gleich, mit logging)
         console.log("Logout initiated.");
        setLoading(true);
        if (currentUser?.isGuest) {
            console.log("Guest logout, reloading page.");
             return window.location.reload();
        }
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            console.log("Supabase signOut successful.");
            // Aufräumen passiert im onAuthStateChange Listener
        } catch (error) {
            console.error("Error during logout:", error);
            showToast("Ausloggen fehlgeschlagen.", true);
             setLoading(false);
        }
    };

    // --- Client-Side Achievement Vergabe ---
    const awardClientSideAchievement = async (achievementId) => {
        if (!currentUser || currentUser.isGuest || !supabase || userUnlockedAchievementIds.includes(achievementId)) return;

        console.log(`Awarding client-side achievement: ${achievementId}`);
        const { error } = await supabase
            .from('user_achievements')
            .insert({ user_id: currentUser.id, achievement_id: achievementId });
        
        if (error) {
            console.error(`Fehler beim Speichern von Client-Achievement ${achievementId}:`, error);
        } else {
            userUnlockedAchievementIds.push(achievementId);
            const achievement = achievementsList.find(a => a.id === achievementId);
            showToast(`Erfolg freigeschaltet: ${achievement?.name || ''}!`);
            // UI-Updates, die davon abhängen
            renderAchievements();
            renderTitles();
            renderIcons();
        }
    };


    // --- WebSocket Functions ---
    // (connectWebSocket, handleWebSocketMessage bleiben gleich, mit logging)
    const connectWebSocket = () => {
        if(ws.socket && (ws.socket.readyState === WebSocket.OPEN || ws.socket.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket connection already open or connecting.");
            return;
        }
        const wsUrl = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
        console.log(`Attempting to connect WebSocket to: ${wsUrl}`);
        ws.socket = new WebSocket(wsUrl);

        ws.socket.onopen = () => {
            console.info('✅ WebSocket connection established.');
            if (currentUser && !currentUser.isGuest) {
                console.log(`Registering user ${currentUser.id} with WebSocket server.`);
                ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id } }));
            }
            // Check for stored game *after* potential registration
            const storedGame = JSON.parse(localStorage.getItem('fakesterGame'));
            if (storedGame && currentUser && storedGame.playerId === currentUser.id) { // Only reconnect if it's the same user
                console.log("Found stored game, attempting to reconnect:", storedGame);
                currentGame = storedGame;
                showToast('Verbinde erneut mit dem Spiel...');
                ws.socket.send(JSON.stringify({ type: 'reconnect', payload: { pin: currentGame.pin, playerId: currentGame.playerId } }));
            } else if (storedGame) {
                console.warn("Found stored game for a different user, ignoring.");
                localStorage.removeItem('fakesterGame'); // Clear invalid game state
            }
        };
        ws.socket.onmessage = (event) => {
             // console.log("WebSocket message received:", event.data); // Can be noisy
             try {
                 const data = JSON.parse(event.data);
                 handleWebSocketMessage(data);
            } catch (error) {
                 console.error('Error processing WebSocket message:', error, event.data);
            }
        };
        ws.socket.onclose = (event) => {
            console.warn(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
            // Simple reconnect logic
            setTimeout(() => {
                 // Only reconnect if the user is still on a screen that requires WS (not auth)
                if (!document.getElementById('auth-screen')?.classList.contains('active')) {
                     console.log("Attempting WebSocket reconnect...");
                     connectWebSocket();
                }
            }, 5000); // Increased delay
        };
        ws.socket.onerror = (errorEvent) => {
             console.error('WebSocket error:', errorEvent);
        };
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`Processing WebSocket message: Type=${type}`, payload);
        // setLoading(false); // Removed: setLoading is handled by specific actions now
        if (type !== 'round-countdown') elements.countdownOverlay.classList.add('hidden');

        switch (type) {
             case 'game-created':
             case 'join-success':
                 setLoading(false); // Stop loading AFTER joining/creating
                 currentGame = { ...currentGame, pin: payload.pin, playerId: payload.playerId, isHost: payload.isHost, gameMode: payload.gameMode };
                 localStorage.setItem('fakesterGame', JSON.stringify(currentGame));
                 if (currentGame.isHost) { fetchHostData(); }
                 elements.joinModal.overlay.classList.add('hidden');
                 showScreen('lobby-screen');
                 break;
            case 'lobby-update':
                elements.lobby.pinDisplay.textContent = payload.pin;
                renderPlayerList(payload.players, payload.hostId);
                updateHostSettings(payload.settings, currentGame.isHost);
                break;
             case 'reconnect-to-game': // Handle reconnecting mid-game
                 setLoading(false);
                 console.log("Reconnected mid-game, showing game screen.");
                 // TODO: Potentially need game state data in payload
                 showScreen('game-screen');
                 // Maybe call a function to render the current game state based on payload
                 break;
            case 'game-starting':
                showScreen('game-screen');
                setupPreRound(payload);
                break;
            case 'round-countdown':
                 setLoading(false); // Ensure loading stops before countdown shows
                showCountdown(payload.round, payload.totalRounds);
                break;
            case 'new-round':
                 setLoading(false); // Stop loading when new round starts
                showScreen('game-screen');
                setupNewRound(payload);
                break;
            case 'round-result':
                showRoundResult(payload);
                break;
            case 'game-over':
                localStorage.removeItem('fakesterGame');
                const myFinalScore = payload.scores.find(s => s.id === currentUser?.id)?.score || 0; // Use optional chaining for safety
                showToast(`Spiel vorbei! Du hast ${myFinalScore} XP erhalten!`);
                if (!currentUser?.isGuest) {
                    updatePlayerProgress(myFinalScore); // Fetch updated stats from DB
                }
                setTimeout(() => {
                    screenHistory = ['auth-screen', 'home-screen']; // Reset history
                    showScreen('home-screen');
                }, 7000); // Longer delay to see scores
                break;
            case 'invite-received':
                showInvitePopup(payload.from, payload.pin);
                break;
            case 'friend-request-received':
                showToast(`Du hast eine Freundschaftsanfrage von ${payload.from}!`);
                if (!elements.friendsModal.overlay.classList.contains('hidden')) {
                    loadFriendsData(); // Update list if modal is open
                } else {
                    // Update badge count without opening modal
                    const countEl = elements.friendsModal.requestsCount;
                    const currentCount = parseInt(countEl.textContent || '0');
                    countEl.textContent = currentCount + 1;
                    countEl.classList.remove('hidden');
                }
                break;
            case 'toast':
                 setLoading(false); // Stop loading on toast messages (often indicate completion or error)
                showToast(payload.message, payload.isError);
                break;
            case 'error':
                 setLoading(false); // Stop loading on errors
                showToast(payload.message, true);
                pinInput = "";
                document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = "");
                 if (!elements.joinModal.overlay?.classList.contains('hidden')) { // Close join modal on error
                    elements.joinModal.overlay.classList.add('hidden');
                 }
                break;
            default:
                 console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    };


    // --- UI Rendering Functions ---
    // (renderPlayerList, updateHostSettings, renderAchievements, etc.)
    // Wichtig: equipTitle und equipIcon angepasst, updatePlayerProgress aufgeteilt

    function renderPlayerList(players, hostId) {
        // ... (Bleibt gleich)
        const playerList = elements.lobby.playerList;
        const existingPlayerIds = new Set([...playerList.querySelectorAll('.player-card')].map(el => el.dataset.playerId));
        const incomingPlayerIds = new Set(players.map(p => p.id));

        existingPlayerIds.forEach(id => {
            if (!incomingPlayerIds.has(id)) {
                playerList.querySelector(`[data-player-id="${id}"]`)?.remove();
            }
        });

        players.forEach(player => {
            let card = playerList.querySelector(`[data-player-id="${player.id}"]`);
            if (!card) {
                card = document.createElement('div');
                card.dataset.playerId = player.id;
                card.classList.add('player-card', 'new');
                playerList.appendChild(card);
            }

            const isHost = player.id === hostId;
            card.className = `player-card ${!player.isConnected ? 'disconnected' : ''} ${isHost ? 'host' : ''}`;
            card.innerHTML = `<i class="fa-solid fa-user player-icon ${isHost ? 'host' : ''}"></i><span class="player-name">${player.nickname}</span>`;
        });
    }

    function updateHostSettings(settings, isHost) {
        // ... (Bleibt gleich)
         elements.lobby.hostSettings.classList.toggle('hidden', !isHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (!isHost) return;

        elements.lobby.answerTypeContainer.classList.toggle('hidden', currentGame.gameMode !== 'quiz');

        ['song-count-presets', 'guess-time-presets', 'answer-type-presets', 'lives-count-presets'].forEach(id => {
            const container = document.getElementById(id);
            if(!container) return;

            let valueToMatch;
            let settingKey = '';
             if (id.includes('song')) { valueToMatch = settings.songCount; settingKey = 'songCount'; }
             else if (id.includes('time')) { valueToMatch = settings.guessTime; settingKey = 'guessTime'; }
             else if (id.includes('answer')) { valueToMatch = settings.answerType; settingKey = 'answerType'; }
             else if (id.includes('lives')) { valueToMatch = settings.lives; settingKey = 'lives'; }


            let customButton = container.querySelector('[data-value="custom"]');
            let matchFound = false;
            container.querySelectorAll('.preset-button').forEach(btn => {
                const isActive = btn.dataset.value == valueToMatch;
                btn.classList.toggle('active', isActive);
                if(isActive) matchFound = true;
                // Reset custom button text if a preset is active
                if(customButton && isActive) customButton.textContent = 'Custom';
            });

            if (!matchFound && customButton) {
                customButton.classList.add('active');
                customButton.textContent = valueToMatch + (settingKey === 'guessTime' ? 's' : '');
            } else if (customButton) {
                // If no preset matched AND custom button is not supposed to be active, remove active class
                if (!matchFound) customButton.classList.remove('active');
                // Ensure text is 'Custom' if not active or if a preset is active
                if (!customButton.classList.contains('active') || matchFound) {
                    customButton.textContent = 'Custom';
                }
            }
        });

        elements.lobby.deviceSelectBtn.textContent = settings.deviceName || 'Gerät auswählen';
        elements.lobby.playlistSelectBtn.textContent = settings.playlistName || 'Playlist auswählen';

        elements.lobby.startGameBtn.disabled = !(settings.deviceId && settings.playlistId);
    }

    function renderAchievements() {
        // ... (Bleibt gleich)
         if (!elements.achievements.grid) return;
        elements.achievements.grid.innerHTML = achievementsList.map(a => {
            const isUnlocked = userUnlockedAchievementIds.includes(a.id);
            return `<div class="stat-card ${!isUnlocked ? 'locked' : ''}"><span class="stat-value">${a.name}</span><span class="stat-label">${a.description}</span></div>`;
        }).join('');
    }

    async function equipTitle(titleId, saveToDb = true) {
        const title = titlesList.find(t => t.id === titleId);
        if (title) {
            console.log(`Equipping title: ${title.name} (ID: ${titleId}), Save: ${saveToDb}`);
            document.getElementById('profile-title').textContent = title.name;
            userProfile.equipped_title_id = titleId; // Lokal aktualisieren
            if (saveToDb && !currentUser.isGuest) {
                 console.log(`Saving title ${titleId} to DB for user ${currentUser.id}`);
                const { error } = await supabase
                    .from('profiles')
                    .update({ equipped_title_id: titleId })
                    .eq('id', currentUser.id);
                if (error) {
                     console.error("Failed to save title:", error);
                     showToast("Titel konnte nicht gespeichert werden.", true);
                } else {
                     console.log("Title saved successfully.");
                }
            }
        } else {
             console.warn(`Title ID ${titleId} not found.`);
        }
        renderTitles(); // Re-render to update equipped status visually
    }


    function renderTitles() {
        // ... (Angepasst für locked state)
         if (!elements.titles.list) return;
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const equippedTitleId = userProfile.equipped_title_id || 1;
        const unlockedTitleCount = titlesList.filter(t => isItemUnlocked(t, currentLevel)).length; // Für Achievement 15

        elements.titles.list.innerHTML = titlesList.map(t => {
            const isUnlocked = isItemUnlocked(t, currentLevel);
            const isEquipped = t.id === equippedTitleId;
            const unlockDescription = getUnlockDescription(t);

            // Spezielles Achievement für 5 freigeschaltete Titel prüfen
            if (unlockedTitleCount >= 5 && !userUnlockedAchievementIds.includes(15)) {
                 awardClientSideAchievement(15);
            }

            return `
                <div class="title-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}" data-title-id="${t.id}" ${!isUnlocked ? 'disabled' : ''}>
                    <span class="stat-value">${t.name}</span>
                    <span class="stat-label">${isUnlocked ? 'Freigeschaltet' : unlockDescription}</span>
                </div>`;
        }).join('');
    }

    async function equipIcon(iconId, saveToDb = true) {
        // ... (Angepasst für logging)
        const icon = iconsList.find(i => i.id === iconId);
        if(icon){
             console.log(`Equipping icon: ${icon.iconClass} (ID: ${iconId}), Save: ${saveToDb}`);
            elements.home.profileIcon.className = `fa-solid ${icon.iconClass}`;
            userProfile.equipped_icon_id = iconId; // Lokal aktualisieren
            if (saveToDb && !currentUser.isGuest) {
                 console.log(`Saving icon ${iconId} to DB for user ${currentUser.id}`);
                const { error } = await supabase
                    .from('profiles')
                    .update({ equipped_icon_id: iconId })
                    .eq('id', currentUser.id);
                if (error) {
                     console.error("Failed to save icon:", error);
                     showToast("Icon konnte nicht gespeichert werden.", true);
                } else {
                     console.log("Icon saved successfully.");
                }
            }
        } else {
             console.warn(`Icon ID ${iconId} not found.`);
        }
        renderIcons(); // Re-render to update equipped status visually
    }


    function renderIcons() {
        // ... (Angepasst für locked state)
         if (!elements.icons.list) return;
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const equippedIconId = userProfile.equipped_icon_id || 1;
        const unlockedIconCount = iconsList.filter(i => isItemUnlocked(i, currentLevel)).length; // Für Achievement 16

        elements.icons.list.innerHTML = iconsList.map(icon => {
            const isUnlocked = isItemUnlocked(icon, currentLevel);
            const isEquipped = icon.id === equippedIconId;

             // Spezielles Achievement für 5 freigeschaltete Icons prüfen
             if (unlockedIconCount >= 5 && !userUnlockedAchievementIds.includes(16)) {
                 awardClientSideAchievement(16);
             }

            return `
                <div class="icon-card ${!isUnlocked ? 'locked' : ''} ${isEquipped ? 'equipped' : ''}" data-icon-id="${icon.id}" ${!isUnlocked ? 'disabled' : ''}>
                    <div class="icon-preview"><i class="fa-solid ${icon.iconClass}"></i></div>
                    <span class="stat-label">${isUnlocked ? 'Verfügbar' : icon.description}</span>
                </div>
            `;
        }).join('');
    }

    function renderLevelProgress() {
         // ... (Bleibt gleich)
         if (!elements.levelProgress.list) return;
        const MAX_LEVEL = 50;
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        let html = '';

        for (let level = 1; level <= MAX_LEVEL; level++) {
            const xpNeeded = getXpForLevel(level);
            const isUnlocked = currentLevel >= level;

            const titles = titlesList.filter(t => t.unlockType === 'level' && t.unlockValue === level);
            const icons = iconsList.filter(i => i.unlockType === 'level' && i.unlockValue === level);

            if (titles.length === 0 && icons.length === 0 && level > 1) continue; // Überspringe leere Level

            html += `
                <div class="level-progress-item ${isUnlocked ? 'unlocked' : ''}">
                    <div class="level-progress-header">
                        <h3>Level ${level}</h3>
                        <span>${xpNeeded} XP</span>
                    </div>
                    <div class="level-progress-rewards">
                        ${titles.map(t => `<div class="reward-item"><i class="fa-solid fa-star"></i><span>Titel: ${t.name}</span></div>`).join('')}
                        ${icons.map(i => `<div class="reward-item"><i class="fa-solid ${i.iconClass}"></i><span>Icon: ${i.description}</span></div>`).join('')}
                    </div>
                </div>
            `;
        }
        elements.levelProgress.list.innerHTML = html;
    }

    // Zeigt nur den aktuellen Stand an
    function updatePlayerProgressDisplay() {
        if (!currentUser || currentUser.isGuest || !userProfile) return;
        const currentXp = userProfile.xp || 0;
        const currentLevel = getLevelForXp(currentXp);
        const xpForCurrentLevel = getXpForLevel(currentLevel);
        const xpForNextLevel = getXpForLevel(currentLevel + 1);
        const xpInCurrentLevel = currentXp - xpForCurrentLevel;
        const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
        const xpPercentage = (xpNeededForNextLevel > 0)
            ? Math.max(0, Math.min(100, (xpInCurrentLevel / xpNeededForNextLevel) * 100))
            : 100;

        elements.home.profileLevel.textContent = currentLevel;
        elements.home.profileXpFill.style.width = `${xpPercentage}%`;
        if (elements.home.profileXpText) {
            elements.home.profileXpText.textContent = `${currentXp} XP`;
        }
         console.log(`Updated progress display: Level ${currentLevel}, XP ${currentXp}, Bar ${xpPercentage.toFixed(1)}%`);
    }

    // Wird nach Spielende aufgerufen, holt neue Daten und prüft auf Level Up
    async function updatePlayerProgress(xpGained, showNotification = true) {
        if (!currentUser || currentUser.isGuest) return;
        console.log(`Updating player progress post-game. XP Gained: ${xpGained}, Show Notification: ${showNotification}`);

        const oldLevel = getLevelForXp(userProfile.xp || 0); // Level vor dem Update

        // Hole die aktuellsten Daten aus der DB (sind gerade erst vom Server geschrieben worden)
        console.log("Fetching latest profile data for progress update...");
        const { data, error } = await supabase
            .from('profiles')
            .select('xp, games_played, wins, correct_answers, highscore')
            .eq('id', currentUser.id)
            .single();

        if (error) {
            console.error("Error fetching profile data after game:", error);
            // Update display with old data just in case
            updatePlayerProgressDisplay();
            return;
        }
        console.log("Latest profile data fetched:", data);
        // WICHTIG: userProfile aktualisieren
        userProfile = { ...userProfile, ...data }; // Merge, um equip_id etc. zu behalten

        // Achievements auch neu laden, da Server welche verliehen haben könnte
        console.log("Fetching updated achievements...");
         const { data: achievements, error: achError } = await supabase
            .from('user_achievements')
            .select('achievement_id')
            .eq('user_id', currentUser.id);

        if (achError) {
            console.error("Error fetching updated achievements:", achError);
            // Behalte alte Achievements bei Fehler
        } else {
            userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id));
            console.log("Updated achievements:", userUnlockedAchievementIds);
        }

        // Jetzt die Anzeige aktualisieren
        updatePlayerProgressDisplay();
        updateStatsDisplay(); // Stats auch aktualisieren

        // Auf Level Up prüfen
        const newLevel = getLevelForXp(userProfile.xp || 0);
        console.log(`Old Level: ${oldLevel}, New Level: ${newLevel}`);

        if (showNotification && newLevel > oldLevel) {
            console.info(`Level Up! ${oldLevel} -> ${newLevel}`);
            showToast(`Level Up! Du hast Level ${newLevel} erreicht!`);
            // UI neu rendern, da sich Freischaltungen geändert haben könnten
            renderIcons();
            renderTitles();
            renderLevelProgress();
        }
         // Render achievements grid too, in case server awarded one
         renderAchievements();
         console.log("Player progress update complete.");
    }


    function updateStatsDisplay() {
        // ... (Angepasst für || 0 Fallback)
         if (!currentUser || currentUser.isGuest || !userProfile) return;
        const { games_played, wins, highscore, correct_answers } = userProfile;

        elements.stats.gamesPlayed.textContent = games_played || 0;
        elements.stats.wins.textContent = wins || 0;
        elements.stats.winrate.textContent = (games_played || 0) > 0 ? `${Math.round(((wins || 0) / (games_played || 0)) * 100)}%` : '0%';
        elements.stats.highscore.textContent = highscore || 0;
        elements.stats.correctAnswers.textContent = correct_answers || 0;
        // Simple Avg Score: Highscore / Games Played might not be the best metric
        // Bessere Metrik: Total XP / Games Played (da XP = Score)
        elements.stats.avgScore.textContent = (games_played || 0) > 0 ? Math.round((userProfile.xp || 0) / (games_played || 0)) : 0;


        elements.stats.gamesPlayedPreview.textContent = games_played || 0;
        elements.stats.winsPreview.textContent = wins || 0;
        elements.stats.correctAnswersPreview.textContent = correct_answers || 0;
    }


    // --- Game Logic Functions ---
    // (showCountdown, setupPreRound, setupNewRound, showRoundResult, fetchHostData, etc.)
     function showCountdown(round, total) {
        let text = `Runde ${round}`;
        if (total > 0) text += ` von ${total}`;
        else if (total === 0) text += ` (Leben-Modus)`; // Für Leben-Modus

        elements.countdownOverlay.classList.remove('hidden');
        document.getElementById('countdown-text').textContent = text;
        let count = 3;
        const numEl = document.getElementById('countdown-number');
        numEl.textContent = count;
        const interval = setInterval(() => {
            count--;
            if (count > 0) numEl.textContent = count;
            else clearInterval(interval);
        }, 1000);
    }

    function setupPreRound(data) {
        const gameArea = elements.game.gameContentArea;
        const { firstSong, guessTime } = data;
        elements.game.round.textContent = 'Start';
        elements.game.totalRounds.textContent = 'Song';

        gameArea.innerHTML = `
            <div class="result-info">
                <h2>${firstSong.title}</h2>
                <p>von ${firstSong.artist} (${firstSong.year})</p>
                ${currentGame.gameMode === 'popularity' ? `<p>Popularität: ${firstSong.popularity}</p>` : ''}
            </div>
            <div class="timeline-scroll-container">
                <div class="timeline-track" style="justify-content: center;">
                    <div class="timeline-card">
                        <img src="${firstSong.albumArtUrl || './placeholder.png'}" alt="Album Art" onerror="this.src='./placeholder.png'"> <div class="year">${firstSong.year}</div>
                    </div>
                </div>
            </div>
            <button id="ready-button" class="button-primary">Bereit</button>
        `;

        // Event-Listener MUSS hier hinzugefügt werden, da der Knopf neu erstellt wurde
        document.getElementById('ready-button').addEventListener('click', (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Warte auf andere...';
            ws.socket.send(JSON.stringify({ type: 'player-ready' }));
        });

        const timerBar = elements.game.timerBar;
        timerBar.style.transition = 'none'; // Reset transition before setting width
        timerBar.offsetHeight; // Force reflow
        timerBar.style.width = '100%';
        timerBar.offsetHeight; // Force reflow again
        setTimeout(() => {
            timerBar.style.transition = `width ${guessTime}s linear`;
            timerBar.style.width = '0%';
        }, 100); // Small delay to ensure transition applies
    }

    function setupNewRound(data) {
        // ... (Logik für Quiz, Timeline, Popularity bleibt gleich)
         elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds > 0 ? data.totalRounds : '∞';

        const gameArea = elements.game.gameContentArea;
        if (data.gameMode === 'quiz') {
            gameArea.innerHTML = `<div class="album-art-container">${PLACEHOLDER_ICON}</div><div id="game-guess-area" class="guess-area"></div>`;
            const guessArea = document.getElementById('game-guess-area');
            if (data.mcOptions) {
                guessArea.innerHTML = ['title', 'artist', 'year'].map(key => `
                    <div class="mc-group">
                        <label>${key.charAt(0).toUpperCase() + key.slice(1)}</label>
                        <div class="mc-options-grid" id="mc-${key}">
                            ${data.mcOptions[key].map(opt => `<button class="mc-option-button" data-key="${key}" data-value="${opt}">${opt}</button>`).join('')}
                        </div>
                    </div>`).join('');

                // Dynamischer Event Listener (Delegation)
                guessArea.addEventListener('click', (e) => {
                    if (e.target.classList.contains('mc-option-button')) {
                        const btn = e.target;
                        document.querySelectorAll(`#mc-${btn.dataset.key} .mc-option-button`).forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        const guess = {
                            title: document.querySelector('#mc-title .selected')?.dataset.value || '',
                            artist: document.querySelector('#mc-artist .selected')?.dataset.value || '',
                            year: document.querySelector('#mc-year .selected')?.dataset.value || '',
                        };
                        if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                             ws.socket.send(JSON.stringify({ type: 'live-guess-update', payload: { guess } }));
                        }
                    }
                });

            } else {
                guessArea.innerHTML = `<input type="text" id="guess-title" placeholder="Titel des Songs..." autocomplete="off"><input type="text" id="guess-artist" placeholder="Künstler*in" autocomplete="off"><input type="number" id="guess-year" placeholder="Jahr" autocomplete="off" inputmode="numeric">`;
                
                // Dynamischer Event Listener (Delegation)
                guessArea.addEventListener('input', (e) => {
                    if (e.target.tagName === 'INPUT') {
                         const guess = { title: document.getElementById('guess-title').value, artist: document.getElementById('guess-artist').value, year: document.getElementById('guess-year').value };
                         if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                             ws.socket.send(JSON.stringify({ type: 'live-guess-update', payload: { guess } }));
                         }
                    }
                });
            }
        } else if (data.gameMode === 'timeline') {
             currentGame.lastTimeline = data.timeline || []; // Ensure timeline is an array
            let timelineHtml = '<div class="timeline-drop-zone" data-index="0"><i class="fa-solid fa-plus"></i></div>';
            timelineHtml += currentGame.lastTimeline.map((song, i) => `
                <div class="timeline-card">
                    <img src="${song.albumArtUrl || './placeholder.png'}" alt="Album Art" onerror="this.src='./placeholder.png'">
                    <div class="year">${song.year}</div>
                </div>
                <div class="timeline-drop-zone" data-index="${i + 1}"><i class="fa-solid fa-plus"></i></div>
            `).join('');

            gameArea.innerHTML = `
                <div class="timeline-new-song">
                    <p>Platziere diesen Song:</p>
                    <h3>${data.song?.title || '?'} - ${data.song?.artist || '?'}</h3>
                </div>
                <div class="timeline-scroll-container">
                    <div class="timeline-track">${timelineHtml}</div>
                </div>`;

            // Dynamischer Event Listener (Delegation)
            gameArea.addEventListener('click', (e) => {
                const zone = e.target.closest('.timeline-drop-zone');
                if (zone) {
                    gameArea.innerHTML = `<p class="fade-in">Warte auf andere Spieler...</p>`;
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                        ws.socket.send(JSON.stringify({ type: 'submit-guess', payload: { index: parseInt(zone.dataset.index) } }));
                    }
                }
            });

             // Scroll to middle
             requestAnimationFrame(() => { // Ensure elements are rendered
                 const scrollContainer = document.querySelector('.timeline-scroll-container');
                 const track = document.querySelector('.timeline-track');
                 if (scrollContainer && track) {
                     scrollContainer.scrollLeft = (track.scrollWidth - scrollContainer.clientWidth) / 2;
                 }
             });
        } else if (data.gameMode === 'popularity') {
            const timeline = data.timeline || [];
             const lastSong = timeline.length > 0 ? timeline[timeline.length - 1] : null;
             if (!lastSong || !data.song) {
                  console.error("Missing song data for popularity mode setup.");
                  gameArea.innerHTML = `<p>Fehler beim Laden der Runde.</p>`; // Show error
                  return; // Prevent further execution if data is bad
             }

            gameArea.innerHTML = `
                <div class="popularity-container">
                    <div class="popularity-card">
                        <img src="${lastSong.albumArtUrl || './placeholder.png'}" onerror="this.src='./placeholder.png'">
                        <div class="popularity-card-info">
                            <h3>${lastSong.title}</h3>
                            <p>${lastSong.artist}</p>
                        </div>
                        <div class="popularity-score"><span class="value">${lastSong.popularity}</span><span class="label">Popularität</span></div>
                    </div>
                    <p>Ist der nächste Song populärer oder weniger populär?</p>
                    <h3>${data.song.title} - ${data.song.artist}</h3>
                    <div class="popularity-guess-buttons">
                        <button class="guess-button" data-guess="higher"><i class="fa-solid fa-arrow-up"></i></button>
                        <button class="guess-button" data-guess="lower"><i class="fa-solid fa-arrow-down"></i></button>
                    </div>
                </div>`;

            // Dynamischer Event Listener (Delegation)
            gameArea.addEventListener('click', (e) => {
                const btn = e.target.closest('.guess-button');
                if(btn) {
                     gameArea.innerHTML = `<p>Warte auf andere Spieler...</p>`;
                     if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                        ws.socket.send(JSON.stringify({type: 'submit-guess', payload: { guess: btn.dataset.guess }}));
                    }
                }
            });
        }


        // Timer Bar Logic
        const timerBar = elements.game.timerBar;
        const guessTime = data.guessTime || 30; // Fallback
        timerBar.style.transition = 'none';
        timerBar.offsetHeight; // Force reflow
        timerBar.style.width = '100%';
        timerBar.offsetHeight; // Force reflow
        setTimeout(() => {
            timerBar.style.transition = `width ${guessTime}s linear`;
            timerBar.style.width = '0%';
        }, 100);
    }

    function showRoundResult(data) {
        // ... (Logik für Quiz, Timeline, Popularity bleibt gleich, evtl. Fallback Images hinzufügen)
        const gameArea = elements.game.gameContentArea;
        const me = data.scores.find(p => p.id === currentUser?.id); // Use optional chaining
        const resultText = data.wasCorrect ? 'Richtig!' : 'Falsch!';
        const colorClass = data.wasCorrect ? 'var(--success-color)' : 'var(--danger-color)';
         // Check if livesLost is applicable
         const livesLost = gameCreationSettings.gameType === 'lives' && !data.wasCorrect;

        const leaderboardHtml = `
            <div class="leaderboard">
                <h3>Leaderboard</h3>
                ${data.scores.map(p => `
                    <div class="leaderboard-row ${p.id === currentUser?.id ? 'me' : ''}">
                        <span>${p.nickname} ${p.lives < 1 ? ' (Ausgeschieden)' : (gameCreationSettings.gameType === 'lives' ? ` - ${p.lives} <i class="fa-solid fa-heart" style="color: ${p.lives <= 1 ? 'red' : 'white'};"></i>` : '')}</span>
                        <span>${p.lastPointsBreakdown?.total > 0 ? `+${p.lastPointsBreakdown.total}` : ''} (${p.score})</span>
                    </div>`).join('')}
            </div>
            <button id="ready-button" class="button-primary">Weiter</button>`;

        if (currentGame.gameMode === 'quiz') {
            const albumArtContainer = gameArea.querySelector('.album-art-container');
            if (albumArtContainer) { // Ensure container exists
                 albumArtContainer.innerHTML = `<img id="album-art" src="${data.song?.albumArtUrl || './placeholder.png'}" alt="Album Cover" onerror="this.src='./placeholder.png'">`;
             }
            const breakdown = me?.lastPointsBreakdown || { artist: 0, title: 0, year: 0, total: 0 }; // Default breakdown if 'me' is undefined
            const guessArea = document.getElementById('game-guess-area');
            if(guessArea) {
                 guessArea.innerHTML = `
                    <div class="result-info">
                        <h2>${data.song?.title || '?'}</h2>
                        <p>von ${data.song?.artist || '?'} (${data.song?.year || '?'})</p>
                        <div class="points-breakdown">
                            <span>Titel: +${breakdown.title}</span><span>Künstler: +${breakdown.artist}</span><span>Jahr: +${breakdown.year}</span>
                        </div>
                    </div>${leaderboardHtml}`;
            } else {
                 console.error("Could not find #game-guess-area to show quiz results.");
                 gameArea.innerHTML = leaderboardHtml; // Show at least the leaderboard
            }
        } else if (currentGame.gameMode === 'timeline') {
             // Ensure currentGame.lastTimeline is an array
             const lastTimelineSafe = Array.isArray(currentGame.lastTimeline) ? currentGame.lastTimeline : [];

            let timeline = [...lastTimelineSafe];
            const newCard = { ...(data.song || {}), status: data.wasCorrect ? 'correct' : 'incorrect' };
            timeline.splice(data.userIndex, 0, newCard); // Insert the card at the user's chosen index

            let timelineHtml = '';

            if (data.wasCorrect) {
                // If correct, just render the updated timeline with the new card highlighted
                timelineHtml = timeline.map((song, index) => `
                    <div class="timeline-card ${song.status || ''}" ${song.status ? `id="newly-placed-card"` : ''}>
                        <img src="${song.albumArtUrl || './placeholder.png'}" alt="Album Art" onerror="this.src='./placeholder.png'">
                        <div class="year">${song.year}</div>
                    </div>`).join('');
            } else {
                // If incorrect, render the timeline *as it was*, insert the incorrect card, and show ghost card at correct spot
                 let incorrectRendered = false;
                 let ghostRendered = false;
                 for (let i = 0; i <= lastTimelineSafe.length; i++) {
                     // Render Ghost card at correct position
                     if (i === data.correctIndex && !ghostRendered) {
                          timelineHtml += `<div class="timeline-card ghost"><div class="year">${data.song?.year || '?'}</div></div>`;
                          ghostRendered = true;
                     }
                     // Render the incorrectly placed card
                     if (i === data.userIndex && !incorrectRendered) {
                          timelineHtml += `
                            <div class="timeline-card incorrect" id="newly-placed-card">
                                <img src="${data.song?.albumArtUrl || './placeholder.png'}" alt="Album Art" onerror="this.src='./placeholder.png'">
                                <div class="year">${data.song?.year || '?'}</div>
                            </div>`;
                          incorrectRendered = true;
                     }
                     // Render existing card from the previous round
                     if (i < lastTimelineSafe.length) {
                           const song = lastTimelineSafe[i];
                           timelineHtml += `
                            <div class="timeline-card">
                                <img src="${song.albumArtUrl || './placeholder.png'}" alt="Album Art" onerror="this.src='./placeholder.png'">
                                <div class="year">${song.year}</div>
                            </div>`;
                     }
                 }
                  // Ensure ghost card is rendered if correct index was at the very end
                 if (!ghostRendered && data.correctIndex === lastTimelineSafe.length) {
                      timelineHtml += `<div class="timeline-card ghost"><div class="year">${data.song?.year || '?'}</div></div>`;
                 }
            }


            gameArea.innerHTML = `
                <div class="result-info">
                    <h2 style="color: ${colorClass}">${resultText} ${livesLost ? '(-1 Leben)' : ''}</h2>
                    <p>${data.song?.title || '?'} (${data.song?.year || '?'})</p>
                </div>
                <div class="timeline-scroll-container"><div class="timeline-track">${timelineHtml}</div></div>
                ${leaderboardHtml}`;

            // Scroll to the newly placed card
            requestAnimationFrame(() => {
                 document.getElementById('newly-placed-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            });

        } else { // Popularity
             gameArea.innerHTML = `
                <div class="result-info">
                    <h2 style="color: ${colorClass}">${resultText} ${livesLost ? '(-1 Leben)' : ''}</h2>
                    <p>${data.song?.title || '?'} - ${data.song?.artist || '?'} (${data.song?.year || '?'})</p>
                    <p>Popularität: ${data.song?.popularity ?? '?'}</p> </div>${leaderboardHtml}`;
        }

        // Add event listener to the "Weiter" button (muss dynamisch sein)
        const readyButton = document.getElementById('ready-button');
         if (readyButton) {
            readyButton.addEventListener('click', (e) => {
                e.target.disabled = true;
                e.target.textContent = 'Warte auf andere...';
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'player-ready' }));
                }
            });
         } else {
             console.error("Could not find #ready-button after rendering results.");
         }
    }


    // --- Friends Modal Logic ---
    // (loadFriendsData, renderRequestsList, renderFriendsList bleiben gleich)
     async function loadFriendsData() {
        if (!currentUser || currentUser.isGuest) return;
        console.log("Loading friends data...");

        // 1. Lade offene Anfragen (wo ich der Empfänger bin)
        const { data: requests, error: reqError } = await supabase
            .from('friend_requests')
            .select('sender_id, sender:profiles!sender_id(username)')
            .eq('receiver_id', currentUser.id);

        if (reqError) console.error("Error loading friend requests:", reqError);
        else {
             console.log("Friend requests fetched:", requests);
             renderRequestsList(requests || []);
        }


        // 2. Lade bestehende Freunde
        const { data: friendsData, error: friendsError } = await supabase
            .from('friends')
            .select('user_id1, user_id2') // Deine Spaltennamen
            .or(`user_id1.eq.${currentUser.id},user_id2.eq.${currentUser.id}`);

        if (friendsError) return console.error("Error loading friends:", friendsError);

        const friendIds = friendsData.map(f =>
            f.user_id1 === currentUser.id ? f.user_id2 : f.user_id1
        );
         console.log("Friend IDs:", friendIds);

        if (friendIds.length === 0) {
            renderFriendsList([]);
            return;
        }

        // 4. Lade die Profile meiner Freunde
        const { data: friendProfiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', friendIds);

        if (profilesError) console.error("Error loading friend profiles:", profilesError);
        else {
             console.log("Friend profiles fetched:", friendProfiles);
             renderFriendsList(friendProfiles || []);
        }
    }

    function renderRequestsList(requests) {
        // ... (Bleibt gleich)
         const listEl = elements.friendsModal.requestsList;
        const countEl = elements.friendsModal.requestsCount;

        if (!listEl || !countEl) return; // Defensive check

        if (requests.length === 0) {
            listEl.innerHTML = '<li>Keine offenen Anfragen.</li>';
            countEl.classList.add('hidden');
            countEl.textContent = '0'; // Ensure count is reset
            return;
        }

        countEl.textContent = requests.length;
        countEl.classList.remove('hidden');

        listEl.innerHTML = requests.map(req => `
            <li>
                <div class="friend-info">
                    <span>${req.sender?.username || 'Unbekannt'}</span>
                    <span class="friend-status">Möchte dein Freund sein</span>
                </div>
                <div class="friend-actions">
                    <button class="button-icon button-small accept-request" data-sender-id="${req.sender_id}" title="Annehmen"><i class="fa-solid fa-check"></i></button>
                    <button class="button-icon button-small button-danger decline-request" data-sender-id="${req.sender_id}" data-sender-name="${req.sender?.username || 'Unbekannt'}" title="Ablehnen"><i class="fa-solid fa-times"></i></button>
                </div>
            </li>
        `).join('');
    }

    function renderFriendsList(friends) {
        // ... (Bleibt gleich, evtl. Online-Status hinzufügen)
         const listEl = elements.friendsModal.friendsList;
         if (!listEl) return;

        if (friends.length === 0) {
            listEl.innerHTML = '<li>Noch keine Freunde hinzugefügt.</li>';
            return;
        }

        // TODO: Online-Status mit `onlineFriends`-Array abgleichen
        listEl.innerHTML = friends.map(friend => `
            <li>
                <div class="friend-info">
                    <span>${friend.username}</span>
                    <span class="friend-status ${onlineFriends.includes(friend.id) ? 'online' : ''}">${onlineFriends.includes(friend.id) ? 'Online' : 'Offline'}</span>
                </div>
                <div class="friend-actions">
                    <button class="button-icon button-small button-danger remove-friend" data-friend-id="${friend.id}" data-friend-name="${friend.username}" title="Freund entfernen"><i class="fa-solid fa-trash"></i></button>
                </div>
            </li>
        `).join('');
    }

    // --- Utility & Modal Functions ---
    // (fetchHostData, renderPaginatedPlaylists, openCustomValueModal, etc.)
    // Wichtig: handleCustomNumpad ist jetzt hier definiert
     const handleCustomNumpad = (e) => {
        const key = e.target.closest('button')?.dataset.key;
        if (key && customValueInput.length < 3) customValueInput += key;
        updateCustomValueDisplay();
    };
     const updateCustomValueDisplay = () => { elements.customValueModal.display.forEach((d, i) => d.textContent = customValueInput[i] || ""); };

     async function fetchHostData(isRefresh = false) {
        if (!spotifyToken) {
             console.warn("fetchHostData called without Spotify token.");
             return;
        }
        if (isRefresh) setLoading(true);
        console.log(`Fetching host data (Refresh: ${isRefresh})...`);
        try {
            const [devicesRes, playlistsRes] = await Promise.all([
                fetch('/api/devices', { headers: { 'Authorization': `Bearer ${spotifyToken}` } }),
                fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } })
            ]);

            if (!devicesRes.ok) throw new Error(`Failed to fetch devices: ${devicesRes.status}`);
            if (!playlistsRes.ok) throw new Error(`Failed to fetch playlists: ${playlistsRes.status}`);

            const devices = await devicesRes.json();
            const playlistsData = await playlistsRes.json();
             console.log("Devices fetched:", devices);
             console.log("Playlists fetched:", playlistsData);

            const deviceList = elements.deviceSelectModal.list;
            deviceList.innerHTML = ''; // Clear previous list
            if (devices.devices && devices.devices.length > 0) {
                devices.devices.forEach(d => {
                    const li = document.createElement('li');
                    li.textContent = d.name; li.dataset.id = d.id; li.dataset.name = d.name;
                     // Mark active device
                    if(d.is_active) li.classList.add('selected');
                    deviceList.appendChild(li);
                });
                const activeDevice = devices.devices.find(d => d.is_active);
                // Update settings only if not manually refreshed OR if no device was selected before
                if (activeDevice && (!isRefresh || !currentGame.settings?.deviceId )) {
                    console.log("Auto-selecting active Spotify device:", activeDevice.name);
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { deviceId: activeDevice.id, deviceName: activeDevice.name } }));
                }
            } else {
                deviceList.innerHTML = '<li>Keine aktiven Geräte gefunden.</li>';
            }

            // Speichere alle Playlists global und rendere die erste Seite
            allPlaylists = playlistsData.items || [];
            renderPaginatedPlaylists(allPlaylists, 1); // Handle empty items array

        } catch (error) {
            console.error('Error fetching Spotify data:', error);
            showToast('Fehler beim Laden der Spotify-Daten.', true);
        } finally {
            if (isRefresh) setLoading(false);
        }
    }
     // ... (renderPaginatedPlaylists, openCustomValueModal, showInvitePopup bleiben gleich) ...
     function renderPaginatedPlaylists(playlistsToRender, page = 1) {
        // allPlaylists ist bereits global
        currentPage = page;

        const listEl = elements.playlistSelectModal.list;
        const paginationEl = elements.playlistSelectModal.pagination;
        listEl.innerHTML = '';
        paginationEl.innerHTML = '';

        const searchTerm = elements.playlistSelectModal.search.value.toLowerCase();
        const filteredPlaylists = playlistsToRender.filter(p => p.name.toLowerCase().includes(searchTerm));

        const totalPages = Math.ceil(filteredPlaylists.length / itemsPerPage);
         currentPage = Math.max(1, Math.min(page, totalPages || 1)); // Ensure currentPage is valid

        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedItems = filteredPlaylists.slice(start, end);

        if (paginatedItems.length === 0) {
            listEl.innerHTML = '<li>Keine Playlists gefunden.</li>';
        } else {
            paginatedItems.forEach(p => {
                const li = document.createElement('li');
                li.textContent = p.name; li.dataset.id = p.id; li.dataset.name = p.name;
                 // Mark selected playlist
                 if (currentGame.settings?.playlistId === p.id) {
                     li.classList.add('selected');
                 }
                listEl.appendChild(li);
            });
        }


        if (totalPages > 1) {
            paginationEl.innerHTML = `
                <button id="prev-page" class="button-icon" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
                <span>Seite ${currentPage} / ${totalPages}</span>
                <button id="next-page" class="button-icon" ${currentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
            `;
        }
    }

    function openCustomValueModal(type, title) {
        currentCustomType = type;
        elements.customValueModal.title.textContent = title;
        customValueInput = "";
        updateCustomValueDisplay();
        elements.customValueModal.overlay.classList.remove('hidden');
    }

     function showInvitePopup(from, pin) {
        const container = document.getElementById('invite-popup-container');
        if (!container) return; // Defensive check

        // Remove existing popups first
        container.innerHTML = '';

        const popup = document.createElement('div');
        popup.className = 'invite-popup';
        popup.innerHTML = `
            <p><strong>${from}</strong> hat dich in eine Lobby eingeladen!</p>
            <div class="modal-actions">
                <button class="button-secondary decline-invite">Ablehnen</button>
                <button class="button-primary accept-invite">Annehmen</button>
            </div>`;

        // Dynamische Listener für den Popup
        popup.querySelector('.decline-invite').addEventListener('click', () => popup.remove());
        popup.querySelector('.accept-invite').addEventListener('click', () => {
            if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                 // Ensure currentUser is available
                 if (!currentUser) {
                     showToast("Bitte melde dich zuerst an.", true);
                 } else {
                     ws.socket.send(JSON.stringify({ type: 'invite-response', payload: { accepted: true, pin, user: currentUser }}));
                 }
            } else {
                 showToast("WebSocket nicht verbunden.", true);
            }
            popup.remove();
        });

        container.appendChild(popup);

        // Auto-remove after some time?
        setTimeout(() => popup.remove(), 15000); // Remove after 15 seconds
    }

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
                ws.socket.send(JSON.stringify({ type: 'leave-game' }));
            }
            localStorage.removeItem('fakesterGame');
            currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
            screenHistory = ['auth-screen']; // Reset history
            window.location.reload(); // Einfachste Methode
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
            if (nickname.trim().length < 3) {
                showToast("Nickname muss mind. 3 Zeichen lang sein.", true);
                return;
            }
            elements.guestModal.overlay.classList.add('hidden');
            initializeApp({ username: nickname }, true);
        });

        // --- Home Screen ---
        elements.home.logoutBtn.addEventListener('click', handleLogout);
        elements.home.createRoomBtn.addEventListener('click', () => showScreen('mode-selection-screen'));
        elements.home.joinRoomBtn.addEventListener('click', () => {
            pinInput = "";
            elements.joinModal.pinDisplay.forEach(d => d.textContent = "");
            elements.joinModal.overlay.classList.remove('hidden');
        });
        elements.home.statsBtn.addEventListener('click', () => showScreen('stats-screen'));
        elements.home.achievementsBtn.addEventListener('click', () => showScreen('achievements-screen'));
        elements.home.levelProgressBtn.addEventListener('click', () => showScreen('level-progress-screen'));
        elements.home.profileTitleBtn.addEventListener('click', () => showScreen('title-selection-screen'));
        elements.home.profilePictureBtn.addEventListener('click', () => showScreen('icon-selection-screen'));
        elements.home.friendsBtn.addEventListener('click', () => {
            loadFriendsData();
            elements.friendsModal.overlay.classList.remove('hidden');
        });
        elements.home.usernameContainer.addEventListener('click', () => {
            if (!currentUser || currentUser.isGuest) return;
            elements.changeNameModal.input.value = currentUser.username;
            elements.changeNameModal.overlay.classList.remove('hidden');
            elements.changeNameModal.input.focus();
        });

        // --- Modus & Spieltyp Auswahl ---
        elements.modeSelection.container.addEventListener('click', (e) => {
            const modeBox = e.target.closest('.mode-box');
            if (modeBox && !modeBox.disabled) {
                selectedGameMode = modeBox.dataset.mode;
                console.log(`Game mode selected: ${selectedGameMode}`);
                // Setze Spieltyp-Auswahl zurück
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
            elements.gameTypeScreen.createLobbyBtn.disabled = false;
        });
        elements.gameTypeScreen.livesBtn.addEventListener('click', () => {
            gameCreationSettings.gameType = 'lives';
            elements.gameTypeScreen.pointsBtn.classList.remove('active');
            elements.gameTypeScreen.livesBtn.classList.add('active');
            elements.gameTypeScreen.livesSettings.classList.remove('hidden');
            elements.gameTypeScreen.createLobbyBtn.disabled = false;
        });

        elements.gameTypeScreen.livesPresets.addEventListener('click', (e) => {
            const button = e.target.closest('.preset-button');
            if (button) {
                elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                const value = button.dataset.value;
                if (value === 'custom') {
                    openCustomValueModal('lives', 'Leben eingeben');
                } else {
                    gameCreationSettings.lives = parseInt(value);
                    console.log(`Lives set to: ${gameCreationSettings.lives}`);
                }
            }
        });

        elements.gameTypeScreen.createLobbyBtn.addEventListener('click', () => {
            if (!selectedGameMode || !gameCreationSettings.gameType) {
                showToast("Fehler bei Spiel-Erstellung.", true);
                return;
            }
            if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
                showToast("Keine Verbindung zum Server.", true);
                return;
            }
            setLoading(true);
            ws.socket.send(JSON.stringify({
                type: 'create-game',
                payload: {
                    user: currentUser,
                    token: spotifyToken,
                    gameMode: selectedGameMode,
                    gameType: gameCreationSettings.gameType,
                    lives: gameCreationSettings.lives
                }
            }));
        });

        // --- Lobby Screen ---
        elements.lobby.inviteFriendsBtn.addEventListener('click', async () => {
            // Lade nur online Freunde für Einladungen
            if (!supabase || !currentUser || currentUser.isGuest) return;
            try {
                const { data, error } = await supabase.rpc('get_online_friends', { p_user_id: currentUser.id });
                if (error) throw error;

                const list = elements.inviteFriendsModal.list;
                list.innerHTML = '';
                if (data.length === 0) {
                    list.innerHTML = '<li>Keine Freunde online.</li>';
                } else {
                    data.forEach(friend => {
                        list.innerHTML += `<li data-friend-id="${friend.id}" data-friend-name="${friend.username}">${friend.username} <span class-="friend-status online">Online</span></li>`;
                    });
                }
                elements.inviteFriendsModal.overlay.classList.remove('hidden');
            } catch (error) {
                 console.error("Error fetching online friends:", error);
                 showToast("Fehler beim Laden der Freunde.", true);
            }
        });
        
        elements.lobby.deviceSelectBtn.addEventListener('click', () => elements.deviceSelectModal.overlay.classList.remove('hidden'));
        elements.lobby.playlistSelectBtn.addEventListener('click', () => elements.playlistSelectModal.overlay.classList.remove('hidden'));
        
        const handlePresetClick = (e, type) => {
            const button = e.target.closest('.preset-button');
            if (button) {
                const value = button.dataset.value;
                if (value === 'custom') {
                    const customType = button.dataset.type; // song-count or guess-time
                    const title = customType === 'song-count' ? 'Anzahl Songs' : 'Ratezeit (Sek.)';
                    openCustomValueModal(customType, title);
                } else {
                    let settingKey;
                    if (type === 'song') settingKey = 'songCount';
                    else if (type === 'time') settingKey = 'guessTime';
                    else if (type === 'answer') settingKey = 'answerType';
                    
                    if(settingKey && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                        ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [settingKey]: value } }));
                    }
                }
            }
        };
        elements.lobby.songCountPresets.addEventListener('click', (e) => handlePresetClick(e, 'song'));
        elements.lobby.guessTimePresets.addEventListener('click', (e) => handlePresetClick(e, 'time'));
        elements.lobby.answerTypePresets.addEventListener('click', (e) => handlePresetClick(e, 'answer'));
        
        elements.lobby.startGameBtn.addEventListener('click', () => {
             if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                 setLoading(true);
                 ws.socket.send(JSON.stringify({ type: 'start-game' }));
             }
        });

        // --- Item/Title/Icon Selection Screens ---
        elements.titles.list.addEventListener('click', (e) => {
            const card = e.target.closest('.title-card:not(.locked)');
            if (card) {
                const titleId = parseInt(card.dataset.titleId);
                if (!isNaN(titleId)) equipTitle(titleId, true);
            }
        });
        elements.icons.list.addEventListener('click', (e) => {
            const card = e.target.closest('.icon-card:not(.locked)');
            if (card) {
                const iconId = parseInt(card.dataset.iconId);
                 if (!isNaN(iconId)) equipIcon(iconId, true);
            }
        });

        // --- Modal: Close Buttons ---
        document.querySelectorAll('.button-exit-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal-overlay').classList.add('hidden');
            });
        });

        // --- Modal: Join ---
        elements.joinModal.numpad.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const key = button.dataset.key;
            const action = button.dataset.action;

            if (key && pinInput.length < 4) pinInput += key;
            else if (action === 'clear') pinInput = pinInput.slice(0, -1);
            else if (action === 'confirm' && pinInput.length === 4) {
                if (!currentUser) return showToast("Bitte zuerst anmelden oder als Gast spielen.", true);
                if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
                setLoading(true);
                ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
            }
            elements.joinModal.pinDisplay.forEach((d, i) => d.textContent = pinInput[i] || "");
        });

        // --- Modal: Friends ---
        elements.friendsModal.tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-button');
            if (tab) {
                elements.friendsModal.tabs.forEach(t => t.classList.remove('active'));
                elements.friendsModal.tabContents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
            }
        });
        elements.friendsModal.addFriendBtn.addEventListener('click', () => {
            const friendName = elements.friendsModal.addFriendInput.value;
            if (friendName.trim().length < 3) return showToast("Name ist zu kurz.", true);
            if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
            ws.socket.send(JSON.stringify({ type: 'add-friend', payload: { friendName } }));
            elements.friendsModal.addFriendInput.value = '';
        });
        elements.friendsModal.requestsList.addEventListener('click', (e) => {
            const acceptBtn = e.target.closest('.accept-request');
            const declineBtn = e.target.closest('.decline-request');
            if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
            
            if (acceptBtn) {
                const senderId = acceptBtn.dataset.senderId;
                ws.socket.send(JSON.stringify({ type: 'accept-friend-request', payload: { senderId } }));
                acceptBtn.closest('li').remove();
            }
            if (declineBtn) {
                const senderId = declineBtn.dataset.senderId;
                const senderName = declineBtn.dataset.senderName;
                showConfirmModal("Anfrage ablehnen?", `Möchtest du die Freundschaftsanfrage von ${senderName} wirklich ablehnen?`, () => {
                     ws.socket.send(JSON.stringify({ type: 'decline-friend-request', payload: { userId: senderId } }));
                     declineBtn.closest('li').remove();
                });
            }
        });
        elements.friendsModal.friendsList.addEventListener('click', (e) => {
             const removeBtn = e.target.closest('.remove-friend');
             if (removeBtn) {
                const friendId = removeBtn.dataset.friendId;
                const friendName = removeBtn.dataset.friendName;
                showConfirmModal("Freund entfernen?", `Möchtest du ${friendName} wirklich aus deiner Freundesliste entfernen?`, () => {
                    if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
                    ws.socket.send(JSON.stringify({ type: 'remove-friend', payload: { friendId } }));
                    removeBtn.closest('li').remove();
                });
             }
        });

        // --- Modal: Invite Friends ---
        elements.inviteFriendsModal.list.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.friendId) {
                if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return showToast("Keine Serververbindung.", true);
                ws.socket.send(JSON.stringify({
                    type: 'invite-friend',
                    payload: { friendId: li.dataset.friendId, friendName: li.dataset.friendName }
                }));
                elements.inviteFriendsModal.overlay.classList.add('hidden');
            }
        });

        // --- Modal: Custom Value ---
        elements.customValueModal.numpad.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const key = button.dataset.key;
            const action = button.dataset.action;
            if (key && customValueInput.length < 3) customValueInput += key;
            else if (action === 'backspace') customValueInput = customValueInput.slice(0, -1);
            elements.customValueModal.display.forEach((d, i) => d.textContent = customValueInput[i] || "");
        });
        elements.customValueModal.confirmBtn.addEventListener('click', () => {
            const value = parseInt(customValueInput);
            if (isNaN(value) || value <= 0) return showToast("Ungültiger Wert.", true);

            let payload = {};
            if (currentCustomType === 'lives') {
                gameCreationSettings.lives = value;
                // Update button text in game-type-selection
                const customBtn = elements.gameTypeScreen.livesPresets.querySelector('[data-value="custom"]');
                if(customBtn) customBtn.textContent = value;
            } else {
                 if (currentCustomType === 'song-count') payload['songCount'] = value;
                 else if (currentCustomType === 'guess-time') payload['guessTime'] = value;
                 if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload }));
                 }
            }
            elements.customValueModal.overlay.classList.add('hidden');
        });

        // --- Modal: Change Name ---
        elements.changeNameModal.submitBtn.addEventListener('click', async () => {
            const newName = elements.changeNameModal.input.value.trim();
            if (newName.length < 3 || newName.length > 15) return showToast("Name muss 3-15 Zeichen lang sein.", true);
            if (newName === currentUser.username) return elements.changeNameModal.overlay.classList.add('hidden');
            
            setLoading(true);
            try {
                // 1. Update in 'profiles' table
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({ username: newName })
                    .eq('id', currentUser.id);
                if (profileError) throw profileError;

                // 2. Update in 'auth.users' metadata
                const { data, error: userError } = await supabase.auth.updateUser({
                    data: { username: newName }
                })
                if (userError) throw userError;
                
                // 3. Update local state
                currentUser.username = newName;
                document.getElementById('welcome-nickname').textContent = newName;

                // 4. Informiere Server (falls in Lobby)
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN && currentGame.pin) {
                    ws.socket.send(JSON.stringify({ type: 'update-nickname', payload: { newName } }));
                }

                showToast("Name erfolgreich geändert!");
                elements.changeNameModal.overlay.classList.add('hidden');

            } catch (error) {
                 if (error.code === '23505') { // Unique constraint violation
                    showToast("Dieser Benutzername ist bereits vergeben.", true);
                 } else {
                    console.error("Error changing name:", error);
                    showToast("Fehler beim Ändern des Namens.", true);
                 }
            } finally {
                setLoading(false);
            }
        });

        // --- Modal: Device Select ---
        elements.deviceSelectModal.refreshBtn.addEventListener('click', () => fetchHostData(true));
        elements.deviceSelectModal.list.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.id) {
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({
                        type: 'update-settings',
                        payload: { deviceId: li.dataset.id, deviceName: li.dataset.name }
                    }));
                }
                elements.deviceSelectModal.overlay.classList.add('hidden');
            }
        });

        // --- Modal: Playlist Select ---
        elements.playlistSelectModal.search.addEventListener('input', () => {
            renderPaginatedPlaylists(allPlaylists, 1);
        });
        elements.playlistSelectModal.list.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.id) {
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({
                        type: 'update-settings',
                        payload: { playlistId: li.dataset.id, playlistName: li.dataset.name }
                    }));
                }
                elements.playlistSelectModal.overlay.classList.add('hidden');
            }
        });
        elements.playlistSelectModal.pagination.addEventListener('click', (e) => {
            if (e.target.closest('#prev-page')) {
                renderPaginatedPlaylists(allPlaylists, currentPage - 1);
            }
            if (e.target.closest('#next-page')) {
                renderPaginatedPlaylists(allPlaylists, currentPage - 1);
            }
        });

        // --- Modal: Confirm Action ---
        elements.confirmActionModal.cancelBtn.addEventListener('click', () => {
            elements.confirmActionModal.overlay.classList.add('hidden');
            currentConfirmAction = null;
        });
        elements.confirmActionModal.confirmBtn.addEventListener('click', () => {
            if (currentConfirmAction) {
                currentConfirmAction();
            }
            elements.confirmActionModal.overlay.classList.add('hidden');
            currentConfirmAction = null;
        });

        console.log("All event listeners added.");
    }

    // #################################################################
    // ### SUPABASE INITIALISIERUNG ###
    // #################################################################

    async function initializeSupabase() {
        try {
            // 1. Hole die Supabase-Schlüssel vom Server
            console.log("Fetching /api/config...");
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Failed to fetch config from /api/config');
            const config = await response.json();
            
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error("Supabase URL or Anon Key is missing from config.");
            }

            // 2. Erstelle den Supabase-Client
            // (window.supabase kommt aus dem <script> Tag in index.html)
            
            // #####################################################
            // ### HIER IST DIE NEUE ÄNDERUNG (KOMBINIERTER FIX) ###
            // #####################################################
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
                global: {
                    fetch: (...args) => window.fetch(...args)
                }
            });
            console.log("Supabase client initialized successfully.");

            // 3. Richte den zentralen Auth-Listener ein
            // Dieser reagiert auf SIGNED_IN und SIGNED_OUT
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`Supabase Auth Event: ${event}`);
                if (event === 'SIGNED_IN' && session?.user) {
                    await initializeApp(session.user, false);
                } else if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    userProfile = {};
                    userUnlockedAchievementIds = [];
                    spotifyToken = null;
                    ws.socket?.close();
                    localStorage.removeItem('fakesterGame');
                    screenHistory = ['auth-screen']; // Reset
                    showScreen('auth-screen');
                    document.body.classList.add('is-guest'); // Reset to default
                    setLoading(false);
                }
            });

            // 4. Prüfe, ob bereits eine Session vorhanden ist (z.B. nach Reload)
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                console.log("Found active session, initializing app...");
                await initializeApp(session.user, false);
            } else {
                console.log("No active session, showing auth screen.");
                showScreen('auth-screen');
                setLoading(false);
            }

            // 5. FÜGE JETZT ERST DIE EVENT LISTENER HINZU
            // (Damit `supabase` in den Auth-Handlern verfügbar ist)
            addEventListeners();

        } catch (error) {
            console.error("FATAL ERROR during Supabase initialization:", error);
            document.body.innerHTML = `<h1>Initialisierungsfehler</h1><p>Die Anwendung konnte nicht geladen werden. (${error.message})</p>`;
        }
    }

    // --- Main Execution ---
    initializeSupabase(); // Starte die App
});
