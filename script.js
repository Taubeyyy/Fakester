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
            logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`;
            consoleOutput.appendChild(logEntry);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        } catch (e) {
            originalConsole.error("Error logging to page:", e);
            const errorEntry = document.createElement('div');
            errorEntry.classList.add('log-error');
            errorEntry.textContent = `[ERROR] ${new Date().toLocaleTimeString()}: Failed to log message. See browser console.`;
            if(consoleOutput) {
                 consoleOutput.appendChild(errorEntry);
                 consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
        }
    };

    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); };
    console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); };
    console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); };
    console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); };

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

                console.log("Fetching profile data...");
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profileError) {
                    console.error("Profil-Ladefehler:", profileError);
                    showToast("Fehler beim Laden deines Profils.", true);
                    userProfile = { id: user.id, username: currentUser.username, xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, equipped_title_id: 1, equipped_icon_id: 1 };
                } else {
                    userProfile = profile;
                    currentUser.username = profile.username;
                    console.log("Profile data fetched:", userProfile);
                }

                console.log("Fetching achievements...");
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

                console.log("Checking Spotify status...");
                await checkSpotifyStatus();
                console.log("Spotify status checked.");

                if (spotifyToken && !userUnlockedAchievementIds.includes(9)) {
                    awardClientSideAchievement(9);
                }

                console.log("Rendering UI components...");
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
            showScreen('auth-screen');
        } finally {
            setLoading(false);
        }
    };

    const checkSpotifyStatus = async () => {
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
                throw error;
            }
             console.log(`${isRegister ? 'Signup' : 'Login'} successful for user: ${username}`, data);
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
         console.log("Logout initiated.");
        setLoading(true);
        if (currentUser?.isGuest) {
            console.log("Guest logout, reloading page.");
             window.location.replace(window.location.origin);
             return;
        }
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            console.log("Supabase signOut successful.");
            window.location.replace(window.location.origin);
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
            renderAchievements();
            renderTitles();
            renderIcons();
        }
    };


    // --- WebSocket Functions ---
    const connectWebSocket = () => {
        if(ws.socket && (ws.socket.readyState === WebSocket.OPEN || ws.socket.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket connection already open or connecting.");
            return;
        }
        
        if (wsPingInterval) clearInterval(wsPingInterval);

        const wsUrl = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
        console.log(`Attempting to connect WebSocket to: ${wsUrl}`);
        ws.socket = new WebSocket(wsUrl);

        ws.socket.onopen = () => {
            console.info('✅ WebSocket connection established.');
            if (currentUser && !currentUser.isGuest) {
                console.log(`Registering user ${currentUser.id} with WebSocket server.`);
                ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id } }));
            }
            const storedGame = JSON.parse(localStorage.getItem('fakesterGame'));
            if (storedGame && currentUser && storedGame.playerId === currentUser.id) {
                console.log("Found stored game, attempting to reconnect:", storedGame);
                currentGame = storedGame;
                showToast('Verbinde erneut mit dem Spiel...');
                ws.socket.send(JSON.stringify({ type: 'reconnect', payload: { pin: currentGame.pin, playerId: currentGame.playerId } }));
            } else if (storedGame) {
                console.warn("Found stored game for a different user, ignoring.");
                localStorage.removeItem('fakesterGame');
            }
            
            wsPingInterval = setInterval(() => {
                if (ws.socket?.readyState === WebSocket.OPEN) {
                    // Client-Heartbeat-Logik zur Robustheit
                } else {
                    clearInterval(wsPingInterval);
                    wsPingInterval = null;
                }
            }, 30000);
        };

        ws.socket.onmessage = (event) => {
             try {
                 const data = JSON.parse(event.data);
                 handleWebSocketMessage(data);
            } catch (error) {
                 console.error('Error processing WebSocket message:', error, event.data);
            }
        };

        ws.socket.onclose = (event) => {
            console.warn(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
            
            if (wsPingInterval) clearInterval(wsPingInterval);
            wsPingInterval = null;

            setTimeout(() => {
                if (!document.getElementById('auth-screen')?.classList.contains('active')) {
                     console.log("Attempting WebSocket reconnect...");
                     connectWebSocket();
                }
            }, 5000);
        };
        
        ws.socket.onerror = (errorEvent) => {
             console.error('WebSocket error:', errorEvent);
        };
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`Processing WebSocket message: Type=${type}`, payload);
        if (type !== 'round-countdown') elements.countdownOverlay.classList.add('hidden');

        switch (type) {
             case 'game-created':
             case 'join-success':
                 setLoading(false);
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
             case 'reconnect-to-game':
                 setLoading(false);
                 console.log("Reconnected mid-game, showing game screen.");
                 showScreen('game-screen');
                 break;
            case 'game-starting':
                showScreen('game-screen');
                setupPreRound(payload);
                break;
            case 'round-countdown':
                 setLoading(false);
                showCountdown(payload.round, payload.totalRounds);
                break;
            case 'new-round':
                 setLoading(false);
                showScreen('game-screen');
                setupNewRound(payload);
                break;
            case 'round-result':
                showRoundResult(payload);
                break;
            case 'game-over':
                localStorage.removeItem('fakesterGame');
                const myFinalScore = payload.scores.find(s => s.id === currentUser?.id)?.score || 0;
                showToast(`Spiel vorbei! Du hast ${myFinalScore} XP erhalten!`);
                if (!currentUser?.isGuest) {
                    updatePlayerProgress(myFinalScore);
                }
                setTimeout(() => {
                    screenHistory = ['auth-screen', 'home-screen'];
                    showScreen('home-screen');
                }, 7000);
                break;
            case 'invite-received':
                showInvitePopup(payload.from, payload.pin);
                break;
            case 'friend-request-received':
                showToast(`Du hast eine Freundschaftsanfrage von ${payload.from}!`);
                if (!elements.friendsModal.overlay.classList.contains('hidden')) {
                    loadFriendsData();
                } else {
                    const countEl = elements.friendsModal.requestsCount;
                    const currentCount = parseInt(countEl.textContent || '0');
                    countEl.textContent = currentCount + 1;
                    countEl.classList.remove('hidden');
                }
                break;
            case 'toast':
                 setLoading(false);
                showToast(payload.message, payload.isError);
                break;
            case 'error':
                 setLoading(false);
                showToast(payload.message, true);
                pinInput = "";
                document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = "");
                 if (!elements.joinModal.overlay?.classList.contains('hidden')) {
                    elements.joinModal.overlay.classList.add('hidden');
                 }
                break;
            default:
                 console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    };


    // --- UI Rendering Functions ---
    function renderPlayerList(players, hostId) {
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
            card.innerHTML = `
                ${getProfileIconHtml(player.iconId)}
                <span class="player-name">${player.nickname}</span>
                ${isHost ? '<i class="fa-solid fa-crown host-icon"></i>' : ''}
            `;
        });
    }

    function updateHostSettings(settings, isHost) {
        elements.lobby.hostSettings.classList.toggle('hidden', !isHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isHost);

        if (!isHost) return;

        elements.lobby.answerTypeContainer.classList.toggle('hidden', currentGame.gameMode !== 'quiz');
        
        // Lives setting is only shown for Lives game mode
        elements.gameTypeScreen.livesSettings.classList.toggle('hidden', gameCreationSettings.gameType !== 'lives');
        

        ['song-count-presets', 'guess-time-presets', 'answer-type-presets', 'lives-count-presets'].forEach(id => {
            const container = document.getElementById(id);
            if(!container) return;

            let valueToMatch;
            let settingKey = '';
            if (id.includes('song')) {
                valueToMatch = settings.songCount;
                settingKey = 'songCount';
            } else if (id.includes('time')) {
                valueToMatch = settings.guessTime;
                settingKey = 'guessTime';
            } else if (id.includes('answer')) {
                valueToMatch = settings.answerType;
                settingKey = 'answerType';
            } else if (id.includes('lives')) {
                valueToMatch = settings.lives;
                settingKey = 'lives';
            }


            let customButton = container.querySelector('[data-value="custom"]');
            let matchFound = false;

            container.querySelectorAll('.preset-button').forEach(btn => {
                const isActive = btn.dataset.value == valueToMatch;
                btn.classList.toggle('active', isActive);
                if(isActive) matchFound = true;
                if(customButton && isActive) customButton.textContent = 'Custom';
            });

            if (!matchFound && customButton) {
                customButton.classList.add('active');
                customButton.textContent = valueToMatch + (settingKey === 'guessTime' ? 's' : '');
            } else if (customButton) {
                 if (!matchFound) customButton.classList.remove('active');
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
        if (!elements.achievements.grid) return;

        elements.achievements.grid.innerHTML = achievementsList.map(a => {
            const isUnlocked = userUnlockedAchievementIds.includes(a.id);
            return `
                <div class="stat-card ${!isUnlocked ? 'locked' : ''}">
                    <span class="stat-value">${a.name}</span>
                    <span class="stat-label">${a.description}</span>
                </div>
            `;
        }).join('');
    }

    async function equipTitle(titleId, saveToDb = true) {
        const title = titlesList.find(t => t.id === titleId);
        if (title) {
            console.log(`Equipping title: ${title.name} (ID: ${titleId}), Save: ${saveToDb}`);
            document.getElementById('profile-title').textContent = title.name;
            userProfile.equipped_title_id = titleId;

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
        renderTitles();
    }

    function renderTitles() {
        if (!elements.titles.list) return;

        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const equippedTitleId = userProfile.equipped_title_id || 1;
        const unlockedTitleCount = titlesList.filter(t => isItemUnlocked(t, currentLevel)).length;

        elements.titles.list.innerHTML = titlesList.map(t => {
            const isUnlocked = isItemUnlocked(t, currentLevel);
            const isEquipped = t.id === equippedTitleId;
            const unlockDescription = getUnlockDescription(t);

            if (unlockedTitleCount >= 5 && !userUnlockedAchievementIds.includes(15)) {
                 awardClientSideAchievement(15);
            }

            return `
                <div class="title-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}" data-title-id="${t.id}" ${!isUnlocked ? 'disabled' : ''}>
                    <span class="stat-value">${t.name}</span>
                    <span class="stat-label">${isUnlocked ? 'Freigeschaltet' : unlockDescription}</span>
                </div>
            `;
        }).join('');
        
        // Attach click listeners after rendering
        elements.titles.list.querySelectorAll('.title-card').forEach(card => {
            const titleId = parseInt(card.dataset.titleId, 10);
            if (!card.hasAttribute('disabled')) {
                card.addEventListener('click', () => {
                    equipTitle(titleId);
                });
            }
        });
    }

    async function equipIcon(iconId, saveToDb = true) {
        const icon = iconsList.find(i => i.id === iconId);
        if (icon) {
            console.log(`Equipping icon: ${icon.iconClass} (ID: ${iconId}), Save: ${saveToDb}`);
            elements.home.profileIcon.innerHTML = `<i class="fa-solid ${icon.iconClass}"></i>`;
            userProfile.equipped_icon_id = iconId;

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
        renderIcons();
    }

    function getProfileIconHtml(iconId) {
        const icon = iconsList.find(i => i.id === iconId);
        if (icon) {
            return `<div class="profile-icon-container"><i class="fa-solid ${icon.iconClass}"></i></div>`;
        }
        return PLACEHOLDER_ICON;
    }


    function renderIcons() {
        if (!elements.icons.list) return;

        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const equippedIconId = userProfile.equipped_icon_id || 1;
        const unlockedIconCount = iconsList.filter(i => isItemUnlocked(i, currentLevel)).length;

        elements.icons.list.innerHTML = iconsList.map(i => {
            const isUnlocked = isItemUnlocked(i, currentLevel);
            const isEquipped = i.id === equippedIconId;
            const unlockDescription = getUnlockDescription(i);

            if (unlockedIconCount >= 5 && !userUnlockedAchievementIds.includes(16)) {
                 awardClientSideAchievement(16);
            }

            return `
                <div class="icon-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}" data-icon-id="${i.id}" ${!isUnlocked ? 'disabled' : ''}>
                    <div class="icon-preview"><i class="fa-solid ${i.iconClass}"></i></div>
                    <span class="icon-name">${isUnlocked ? 'Freigeschaltet' : unlockDescription}</span>
                </div>
            `;
        }).join('');

        // Attach click listeners after rendering
        elements.icons.list.querySelectorAll('.icon-card').forEach(card => {
            const iconId = parseInt(card.dataset.iconId, 10);
            if (!card.hasAttribute('disabled')) {
                card.addEventListener('click', () => {
                    equipIcon(iconId);
                });
            }
        });
    }

    function updatePlayerProgressDisplay() {
        if (!currentUser || currentUser.isGuest) {
            elements.home.profileLevel.textContent = 1;
            elements.home.profileXpFill.style.width = '0%';
            elements.home.profileXpText.textContent = 'Gastmodus';
            return;
        }

        const xp = userProfile.xp || 0;
        const currentLevel = getLevelForXp(xp);
        const xpForCurrentLevel = getXpForLevel(currentLevel);
        const xpForNextLevel = getXpForLevel(currentLevel + 1);
        const xpNeeded = xpForNextLevel - xpForCurrentLevel;
        const xpProgress = xp - xpForCurrentLevel;
        const progressPercentage = xpNeeded > 0 ? (xpProgress / xpNeeded) * 100 : 100;

        elements.home.profileLevel.textContent = currentLevel;
        elements.home.profileXpFill.style.width = `${progressPercentage}%`;
        elements.home.profileXpText.textContent = `${xpProgress} / ${xpNeeded} XP`;
    }

    async function updatePlayerProgress(xpEarned) {
        if (!currentUser || currentUser.isGuest) return;

        const newXp = (userProfile.xp || 0) + xpEarned;
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const newLevel = getLevelForXp(newXp);
        
        userProfile.games_played = (userProfile.games_played || 0) + 1;
        userProfile.xp = newXp;

        if (newLevel > currentLevel) {
            showToast(`LEVEL UP! Du hast Level ${newLevel} erreicht!`);
        }

        console.log(`Updating DB progress for user ${currentUser.id}. New XP: ${newXp}, New Games: ${userProfile.games_played}`);
        
        const { error } = await supabase
            .from('profiles')
            .update({
                xp: newXp,
                games_played: userProfile.games_played
            })
            .eq('id', currentUser.id);

        if (error) {
            console.error("Failed to update player progress:", error);
            showToast("Fehler beim Speichern des Fortschritts.", true);
        } else {
            console.log("Player progress updated successfully.");
            updatePlayerProgressDisplay();
            renderTitles(); // Check for new title unlocks
            renderIcons();   // Check for new icon unlocks
        }

        if (userProfile.games_played >= 1) awardClientSideAchievement(1);
        if (userProfile.games_played >= 3) awardClientSideAchievement(17);
    }
    
    function renderLevelProgress() {
        if (!elements.levelProgress.list) return;

        elements.levelProgress.list.innerHTML = '';

        for (let level = 1; level <= 50; level++) { // Level bis 50 anzeigen
            const xpNeeded = getXpForLevel(level + 1);
            const xpCurrent = getXpForLevel(level);
            const xpDifference = xpNeeded - xpCurrent;
            
            if (xpDifference <= 0 && level < 50) continue; // Überspringt Level, die keine XP benötigen (Level 1)
            
            const isUnlocked = getLevelForXp(userProfile.xp || 0) >= level;

            const listItem = document.createElement('div');
            listItem.classList.add('level-progress-item');
            listItem.classList.toggle('unlocked', isUnlocked);
            
            const xpText = level < 50 ? `${xpDifference} XP` : 'Max Level';
            
            listItem.innerHTML = `
                <div class="level-indicator">Level ${level}</div>
                <div class="xp-needed">${xpText}</div>
            `;

            elements.levelProgress.list.appendChild(listItem);
        }
    }

    function updateStatsDisplay() {
        if (!elements.stats.screen) return;
        
        const wins = userProfile.wins || 0;
        const gamesPlayed = userProfile.games_played || 0;
        const correctAnswers = userProfile.correct_answers || 0;
        const highscore = userProfile.highscore || 0;
        
        const winrate = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(1) + '%' : '0%';
        const avgScore = gamesPlayed > 0 ? (userProfile.xp / gamesPlayed).toFixed(0) : '0';

        elements.stats.gamesPlayed.textContent = gamesPlayed;
        elements.stats.wins.textContent = wins;
        elements.stats.winrate.textContent = winrate;
        elements.stats.highscore.textContent = highscore;
        elements.stats.correctAnswers.textContent = correctAnswers;
        elements.stats.avgScore.textContent = avgScore;
        
        // Preview Stats
        elements.stats.gamesPlayedPreview.textContent = gamesPlayed;
        elements.stats.winsPreview.textContent = wins;
        elements.stats.correctAnswersPreview.textContent = correctAnswers;

        if (wins >= 10) awardClientSideAchievement(3);
    }

    async function loadFriendsData() {
        if (currentUser.isGuest) return;
        
        console.log("Loading friends data...");

        // Lade Freunde (Status: accepted)
        const { data: friendsData, error: friendsError } = await supabase
            .from('friends')
            .select(`
                user2_id,
                profiles!user2_id ( username, equipped_icon_id )
            `)
            .eq('user1_id', currentUser.id)
            .eq('status', 'accepted');

        if (friendsError) {
            console.error("Fehler beim Laden der Freunde:", friendsError);
            elements.friendsModal.friendsList.innerHTML = `<p class="error-message">Fehler beim Laden der Freunde.</p>`;
        }

        // Lade Anfragen (Status: pending, wo user2 ich bin)
        const { data: requestsData, error: requestsError } = await supabase
            .from('friends')
            .select(`
                user1_id,
                profiles!user1_id ( username, equipped_icon_id )
            `)
            .eq('user2_id', currentUser.id)
            .eq('status', 'pending');

        if (requestsError) {
            console.error("Fehler beim Laden der Anfragen:", requestsError);
            elements.friendsModal.requestsList.innerHTML = `<p class="error-message">Fehler beim Laden der Anfragen.</p>`;
        }
        
        const friendsList = (friendsData || []).map(f => ({
            id: f.user2_id,
            username: f.profiles.username,
            iconId: f.profiles.equipped_icon_id
        }));
        
        const requestsList = (requestsData || []).map(r => ({
            id: r.user1_id,
            username: r.profiles.username,
            iconId: r.profiles.equipped_icon_id
        }));

        renderFriendsList(friendsList);
        renderRequestsList(requestsList);

        // Zähle Online-Freunde
        const onlineFriendIds = onlineFriends.map(f => f.userId);
        const onlineCount = friendsList.filter(f => onlineFriendIds.includes(f.id)).length;
        
        document.getElementById('friends-count-preview').textContent = friendsList.length;
        document.getElementById('online-count-preview').textContent = onlineCount;
        
        const requestsCount = requestsList.length;
        elements.friendsModal.requestsCount.textContent = requestsCount;
        elements.friendsModal.requestsCount.classList.toggle('hidden', requestsCount === 0);
        
        if (friendsList.length >= 1) awardClientSideAchievement(14);
    }
    
    function renderFriendsList(friends) {
        const listEl = elements.friendsModal.friendsList;
        listEl.innerHTML = '';

        if (friends.length === 0) {
            listEl.innerHTML = `<p class="muted-text">Du hast noch keine Freunde. Füge Freunde über den Reiter 'Hinzufügen' hinzu.</p>`;
            return;
        }

        const onlineFriendIds = onlineFriends.map(f => f.userId);

        friends.forEach(friend => {
            const isOnline = onlineFriendIds.includes(friend.id);
            const friendItem = document.createElement('div');
            friendItem.classList.add('friend-item', isOnline ? 'online' : 'offline');
            friendItem.innerHTML = `
                ${getProfileIconHtml(friend.iconId)}
                <span class="friend-username">${friend.username}</span>
                <span class="status-indicator">${isOnline ? 'Online' : 'Offline'}</span>
                <button class="button-danger button-small remove-friend-btn" data-friend-id="${friend.id}">Entfernen</button>
            `;
            
            friendItem.querySelector('.remove-friend-btn').addEventListener('click', () => {
                showConfirmModal(
                    'Freund entfernen',
                    `Möchtest du ${friend.username} wirklich aus deiner Freundesliste entfernen?`,
                    () => removeFriend(friend.id, friend.username)
                );
            });

            listEl.appendChild(friendItem);
        });
    }
    
    function renderRequestsList(requests) {
        const listEl = elements.friendsModal.requestsList;
        listEl.innerHTML = '';

        if (requests.length === 0) {
            listEl.innerHTML = `<p class="muted-text">Du hast keine offenen Freundschaftsanfragen.</p>`;
            return;
        }

        requests.forEach(request => {
            const requestItem = document.createElement('div');
            requestItem.classList.add('friend-item', 'pending');
            requestItem.innerHTML = `
                ${getProfileIconHtml(request.iconId)}
                <span class="friend-username">${request.username}</span>
                <div class="request-actions">
                    <button class="button-success button-small accept-request-btn" data-user-id="${request.id}">Annehmen</button>
                    <button class="button-danger button-small reject-request-btn" data-user-id="${request.id}">Ablehnen</button>
                </div>
            `;
            
            requestItem.querySelector('.accept-request-btn').addEventListener('click', () => {
                handleFriendRequest(request.id, 'accept');
            });
            requestItem.querySelector('.reject-request-btn').addEventListener('click', () => {
                handleFriendRequest(request.id, 'reject');
            });

            listEl.appendChild(requestItem);
        });
    }

    function renderOnlineFriendsForInvite() {
        const listEl = elements.inviteFriendsModal.list;
        listEl.innerHTML = '';
        
        if (onlineFriends.length === 0) {
             listEl.innerHTML = `<p class="muted-text">Keine Freunde online oder eingeladen.</p>`;
             return;
        }
        
        onlineFriends.forEach(friend => {
            const friendItem = document.createElement('div');
            friendItem.classList.add('friend-item', 'online');
            
            friendItem.innerHTML = `
                ${getProfileIconHtml(friend.iconId)}
                <span class="friend-username">${friend.username}</span>
                <button class="button-primary button-small invite-friend-btn" data-user-id="${friend.userId}">Einladen</button>
            `;
            
            friendItem.querySelector('.invite-friend-btn').addEventListener('click', (e) => {
                sendFriendInvite(friend.userId, e.target);
            });

            listEl.appendChild(friendItem);
        });
    }
    
    async function sendFriendInvite(userId, button) {
        if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            showToast("Verbindung zum Server fehlgeschlagen.", true);
            return;
        }
        
        button.disabled = true;
        button.textContent = 'Einladung gesendet';
        
        ws.socket.send(JSON.stringify({ 
            type: 'send-invite', 
            payload: { 
                toUserId: userId, 
                pin: currentGame.pin,
                fromUsername: currentUser.username
            } 
        }));
    }
    
    function showInvitePopup(fromUsername, pin) {
        const container = document.getElementById('invite-popup-container');
        if (!container) return;
        
        // Entferne alte Popups
        container.innerHTML = '';

        const popup = document.createElement('div');
        popup.classList.add('invite-popup');
        popup.innerHTML = `
            <p>${fromUsername} lädt dich zu Spiel ${pin} ein!</p>
            <div class="actions">
                <button class="button-success button-small accept-btn">Beitreten</button>
                <button class="button-danger button-small reject-btn">Ignorieren</button>
            </div>
        `;

        popup.querySelector('.accept-btn').addEventListener('click', () => {
            if (pinInput.length === 0) {
                pinInput = pin;
                elements.joinModal.numpad.dispatchEvent(new Event('confirm')); // Simuliert den Confirm-Klick
            }
            popup.remove();
        });
        
        popup.querySelector('.reject-btn').addEventListener('click', () => {
            popup.remove();
        });
        
        container.appendChild(popup);
        
        // Automatisches Schließen nach 10 Sekunden
        setTimeout(() => popup.remove(), 10000);
    }


    // --- Game Logic UI Functions ---
    async function fetchHostData() {
        if (!currentGame.isHost) return;
        console.log("Fetching host game data from server...");
        
        try {
            const res = await fetch(`/api/host-data?pin=${currentGame.pin}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            
            const data = await res.json();
            
            // Setzt temporär Game Creation Settings, um updateHostSettings zu triggern
            gameCreationSettings = {
                 gameType: data.settings.gameType || 'points',
                 lives: data.settings.lives || 3
            };
            
            updateHostSettings(data.settings, true);
        } catch (error) {
            console.error("Failed to fetch host data:", error);
            showToast("Fehler beim Laden der Host-Einstellungen.", true);
        }
    }

    function setupPreRound(payload) {
        // Musik-Vorschau oder Infos vor dem eigentlichen Countdown
        console.log("Setting up pre-round with payload:", payload);
        elements.game.round.textContent = payload.round;
        elements.game.totalRounds.textContent = payload.totalRounds;
        
        elements.game.gameContentArea.innerHTML = `
            <div class="pre-round-info">
                <h2>Runde ${payload.round} von ${payload.totalRounds}</h2>
                <div class="equalizer pre-round-equalizer">
                    <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
                </div>
                <p>Macht euch bereit...</p>
                <p class="muted-text">Musik wird geladen. (Modus: ${payload.gameMode})</p>
                ${currentGame.isHost && payload.previewTrackUrl ? `<audio id="host-preview-audio" src="${payload.previewTrackUrl}" autoplay></audio>` : ''}
            </div>
        `;
    }

    function showCountdown(currentRound, totalRounds) {
        console.log(`Showing countdown for Round ${currentRound}`);
        elements.countdownOverlay.classList.remove('hidden');
        elements.countdownOverlay.innerHTML = `
            <div class="countdown-circle">
                <span id="countdown-number">3</span>
            </div>
        `;
        
        let count = 3;
        const countdownNumber = document.getElementById('countdown-number');
        
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownNumber.textContent = count;
            } else if (count === 0) {
                countdownNumber.textContent = 'GO!';
            } else {
                clearInterval(interval);
                elements.countdownOverlay.classList.add('hidden');
            }
        }, 1000);
        
        // Stoppt Host-Audio, falls vorhanden
        document.getElementById('host-preview-audio')?.pause();
    }

    function setupNewRound(payload) {
        console.log("Setting up new round with payload:", payload);
        currentGame.lastTimeline = payload.timeline ? payload.timeline : [];
        
        elements.game.round.textContent = payload.round;
        elements.game.totalRounds.textContent = payload.totalRounds;
        
        elements.game.gameContentArea.innerHTML = ''; // Clear previous content
        
        // Timer starten
        startTimer(payload.guessTime);

        // Content rendern
        if (payload.gameMode === 'quiz') {
            renderQuizRound(payload);
        } else if (payload.gameMode === 'timeline') {
            renderTimelineRound(payload);
        } else if (payload.gameMode === 'popularity') {
            renderPopularityRound(payload);
        }
    }

    function renderQuizRound(payload) {
        const isAnswered = payload.playersAnswered.includes(currentUser?.id);

        elements.game.gameContentArea.innerHTML = `
            <div class="quiz-round-container">
                <h2 class="round-title">Was ist das für ein Song?</h2>
                <p class="round-hint muted-text">Höre gut zu!</p>
                <div class="spotify-playback-ui">
                    <img src="${payload.albumCover}" alt="Album Cover" class="album-cover">
                    <div class="track-info">
                        <h3>???</h3>
                        <p>???</p>
                    </div>
                </div>
                <div id="answer-input-area" class="${isAnswered ? 'answered' : ''}">
                    ${isAnswered ? `
                        <p class="answered-message">Antwort abgegeben. Warte auf die anderen...</p>
                        <p class="answered-detail muted-text">Deine Antwort: ${payload.playersAnsweredDetails[currentUser.id] || 'Nicht gespeichert'}</p>
                    ` : `
                        <form id="quiz-answer-form">
                            <input type="text" id="answer-title" placeholder="Songtitel" required>
                            <input type="text" id="answer-artist" placeholder="Künstler" required>
                            <input type="number" id="answer-year" placeholder="Jahr (optional)" min="1900" max="${new Date().getFullYear()}">
                            <button type="submit" class="button-primary">Senden</button>
                        </form>
                    `}
                </div>
            </div>
        `;
        
        if (!isAnswered) {
            document.getElementById('quiz-answer-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                const title = document.getElementById('answer-title').value.trim();
                const artist = document.getElementById('answer-artist').value.trim();
                const year = document.getElementById('answer-year').value.trim();
                sendAnswer(payload.round, { type: 'quiz', title, artist, year: year ? parseInt(year, 10) : null });
            });
        }
    }
    
    function renderTimelineRound(payload) {
        const isAnswered = payload.playersAnswered.includes(currentUser?.id);

        const currentYear = payload.currentTrack.year;
        const timelineHtml = currentGame.lastTimeline.map(track => {
            const isTarget = track.id === payload.currentTrack.id;
            return `
                <div class="timeline-item ${isTarget ? 'target' : ''}">
                    <span class="timeline-year">${track.year}</span>
                    <span class="timeline-title">${track.title}</span>
                </div>
            `;
        }).join('');

        elements.game.gameContentArea.innerHTML = `
            <div class="timeline-round-container">
                <h2 class="round-title">Wann erschien dieser Song?</h2>
                <p class="round-hint muted-text">Finde die richtige Position auf der Zeitskala.</p>
                <div class="spotify-playback-ui">
                    <img src="${payload.albumCover}" alt="Album Cover" class="album-cover">
                    <div class="track-info">
                        <h3>???</h3>
                        <p>???</p>
                    </div>
                </div>
                <div class="timeline-display-container">
                    <div class="timeline-display">
                        ${timelineHtml}
                    </div>
                </div>
                <div id="answer-input-area" class="${isAnswered ? 'answered' : ''}">
                    ${isAnswered ? `
                        <p class="answered-message">Antwort abgegeben. Warte auf die anderen...</p>
                        <p class="answered-detail muted-text">Deine Position: ${payload.playersAnsweredDetails[currentUser.id] || 'Nicht gespeichert'}</p>
                    ` : `
                        <form id="timeline-answer-form">
                            <input type="range" id="answer-position" min="0" max="${currentGame.lastTimeline.length}" value="0">
                            <p class="range-info">Position: <span id="position-display">Start</span></p>
                            <button type="submit" class="button-primary">Position senden</button>
                        </form>
                    `}
                </div>
            </div>
        `;
        
        const positionInput = document.getElementById('answer-position');
        const positionDisplay = document.getElementById('position-display');
        
        if (positionInput && positionDisplay) {
            const updatePositionDisplay = () => {
                const index = parseInt(positionInput.value, 10);
                if (index === 0) {
                    positionDisplay.textContent = 'Am Anfang';
                } else if (index === currentGame.lastTimeline.length) {
                    positionDisplay.textContent = 'Am Ende';
                } else {
                    positionDisplay.textContent = `Nach ${currentGame.lastTimeline[index - 1].title} (${currentGame.lastTimeline[index - 1].year})`;
                }
            };
            
            positionInput.addEventListener('input', updatePositionDisplay);
            updatePositionDisplay();

            document.getElementById('timeline-answer-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                const position = parseInt(positionInput.value, 10);
                sendAnswer(payload.round, { type: 'timeline', position });
            });
        }
    }
    
    function renderPopularityRound(payload) {
        const isAnswered = payload.playersAnswered.includes(currentUser?.id);

        const trackHtml = `
            <div class="popularity-track-container">
                <img src="${payload.albumCover}" alt="Album Cover" class="album-cover">
                <div class="track-info">
                    <h3>${payload.currentTrack.title}</h3>
                    <p>${payload.currentTrack.artist}</p>
                </div>
            </div>
        `;
        
        const comparisonTracksHtml = payload.comparisonTracks.map(track => `
            <div class="popularity-track-option" data-track-id="${track.id}">
                <img src="${track.albumCover}" alt="Album Cover" class="album-cover">
                <div class="track-info">
                    <h3>${track.title}</h3>
                    <p>${track.artist}</p>
                    <button class="button-secondary button-small select-popularity-btn" data-track-id="${track.id}">Wählen</button>
                </div>
            </div>
        `).join('');

        elements.game.gameContentArea.innerHTML = `
            <div class="popularity-round-container">
                <h2 class="round-title">Welcher Song ist am beliebtesten?</h2>
                <div class="current-track-placeholder">
                    ${trackHtml}
                </div>
                
                <p class="compare-label">Im Vergleich zu:</p>
                
                <div class="comparison-options-container">
                    ${comparisonTracksHtml}
                </div>
                
                <div id="answer-input-area" class="${isAnswered ? 'answered' : ''}">
                    ${isAnswered ? `
                        <p class="answered-message">Antwort abgegeben. Warte auf die anderen...</p>
                        <p class="answered-detail muted-text">Deine Wahl: ${payload.playersAnsweredDetails[currentUser.id] || 'Nicht gespeichert'}</p>
                    ` : ''}
                </div>
            </div>
        `;
        
        if (!isAnswered) {
            document.querySelectorAll('.select-popularity-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    const selectedTrackId = e.target.dataset.trackId;
                    sendAnswer(payload.round, { type: 'popularity', selectedTrackId });
                    
                    document.getElementById('answer-input-area').classList.add('answered');
                    document.getElementById('answer-input-area').innerHTML = `<p class="answered-message">Antwort abgegeben. Warte auf die anderen...</p><p class="answered-detail muted-text">Deine Wahl: ${payload.comparisonTracks.find(t => t.id === selectedTrackId)?.title || 'Unbekannt'}</p>`;
                });
            });
        }
    }


    function startTimer(duration) {
        const timerBar = elements.game.timerBar;
        timerBar.style.transition = `width ${duration}s linear`;
        timerBar.style.width = '100%';
        
        // Timeout, um sicherzustellen, dass die Transition von 100% startet
        setTimeout(() => {
            timerBar.style.width = '0%';
        }, 50);
    }
    
    function stopTimer() {
        const timerBar = elements.game.timerBar;
        const currentWidth = timerBar.offsetWidth / timerBar.parentElement.offsetWidth * 100;
        timerBar.style.transition = 'none';
        timerBar.style.width = `${currentWidth}%`;
    }

    function sendAnswer(round, answer) {
        if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            showToast("Verbindung zum Server verloren. Kann nicht antworten.", true);
            return;
        }

        console.log(`Sending answer for round ${round}:`, answer);
        
        // UI als "beantwortet" markieren
        const answerArea = document.getElementById('answer-input-area');
        if (answerArea && answer.type === 'quiz') {
            answerArea.classList.add('answered');
            answerArea.innerHTML = `
                 <p class="answered-message">Antwort abgegeben. Warte auf die anderen...</p>
                 <p class="answered-detail muted-text">Deine Antwort: ${answer.title} - ${answer.artist}</p>
            `;
        } else if (answerArea && answer.type === 'timeline') {
            answerArea.classList.add('answered');
             answerArea.innerHTML = `<p class="answered-message">Antwort abgegeben. Warte auf die anderen...</p><p class="answered-detail muted-text">Deine Position: ${answer.position}</p>`;
        }
        
        ws.socket.send(JSON.stringify({
            type: 'submit-answer',
            payload: {
                pin: currentGame.pin,
                playerId: currentGame.playerId,
                round,
                answer
            }
        }));
    }

    function showRoundResult(payload) {
        stopTimer();
        console.log("Showing round result:", payload);
        
        const isQuiz = payload.gameMode === 'quiz';
        const isTimeline = payload.gameMode === 'timeline';
        const isPopularity = payload.gameMode === 'popularity';
        
        const track = payload.track;
        
        let playerResultsHtml = payload.playerScores.map(p => {
            let scoreChangeText = p.scoreChange > 0 ? `+${p.scoreChange}` : (p.scoreChange < 0 ? `${p.scoreChange}` : '±0');
            let isCurrentPlayer = p.id === currentUser?.id;
            
            // Logik für die Anzeige der Antwort
            let answerText = p.answer ? 'Antwort abgegeben' : 'Keine Antwort';
            let isCorrect = p.isCorrect;
            
            if (isQuiz && p.answer) {
                const { title, artist, year } = p.answer;
                answerText = `${title}${artist ? ` - ${artist}` : ''}${year ? ` (${year})` : ''}`;
                if (p.isPerfect) answerText = `<i class="fa-solid fa-star"></i> Perfekt!`;
            } else if (isTimeline && p.answer) {
                answerText = `Position ${p.answer.position} (Diff: ${p.difference})`;
            } else if (isPopularity && p.answer) {
                const chosenTrack = payload.allTracks.find(t => t.id === p.answer.selectedTrackId);
                answerText = chosenTrack ? chosenTrack.title : 'Unbekannt';
            }
            
            return `
                <div class="player-result-card ${isCorrect ? 'correct' : (p.answer ? 'incorrect' : 'missed')} ${isCurrentPlayer ? 'self' : ''}">
                    ${getProfileIconHtml(p.iconId)}
                    <span class="player-name">${p.username}</span>
                    <span class="player-answer">${answerText}</span>
                    <span class="player-score-change ${p.scoreChange > 0 ? 'score-positive' : (p.scoreChange < 0 ? 'score-negative' : '')}">${scoreChangeText}</span>
                    <span class="player-score-total">Score: ${p.score}</span>
                </div>
            `;
        }).join('');
        
        // Gesamte Tabelle
        let totalScoreTableHtml = `
            <div class="total-score-table">
                <h3>Aktueller Stand</h3>
                ${payload.totalScores.sort((a, b) => b.score - a.score).map((p, index) => {
                    return `
                        <div class="score-row ${p.id === currentUser?.id ? 'self' : ''}">
                            <span class="rank">${index + 1}.</span>
                            ${getProfileIconHtml(p.iconId)}
                            <span class="username">${p.username}</span>
                            <span class="score-value">${p.score}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        elements.game.gameContentArea.innerHTML = `
            <div class="result-screen-container">
                <h2>Runde ${payload.round} beendet!</h2>
                
                <div class="track-info-result">
                    <img src="${track.albumCover}" alt="Album Cover" class="album-cover-lg">
                    <div class="track-details">
                        <h3>${track.title}</h3>
                        <p>${track.artist} (${track.year})</p>
                        ${isTimeline ? `<p class="correct-timeline">Korrekter Platz: Position ${track.correctPosition}</p>` : ''}
                        ${isPopularity ? `<p class="correct-popularity">Beliebtestes Lied: ${track.title}</p>` : ''}
                    </div>
                </div>
                
                <div class="player-results-list">
                    <h3>Spielergebnisse</h3>
                    ${playerResultsHtml}
                </div>
                
                ${totalScoreTableHtml}

                <p class="next-round-message muted-text">Warte auf die nächste Runde...</p>
            </div>
        `;
    }


    // --- Custom Value Modal (Number Pad) ---
    const updateCustomValueDisplay = () => {
        elements.customValueModal.display.forEach((digit, index) => {
            digit.textContent = customValueInput[index] || '';
        });
        elements.customValueModal.confirmBtn.disabled = customValueInput.length === 0;
    };
    
    const numpadCustomValueHandler = (event) => {
        const value = event.target.dataset.value;

        if (value === 'confirm' && customValueInput.length > 0) {
            handleCustomValueConfirm(parseInt(customValueInput, 10));
            elements.customValueModal.overlay.classList.add('hidden');
            customValueInput = ""; // Zurücksetzen nach Bestätigung
            return;
        }

        if (value === 'del') {
            customValueInput = customValueInput.slice(0, -1);
        } else if (value === 'clear') {
            customValueInput = "";
        } else if (value && !isNaN(parseInt(value)) && customValueInput.length < 3) { // Max 3 Ziffern für die meisten Settings
            customValueInput += value;
        }
        updateCustomValueDisplay();
    };


    // --- Join Modal (Pin Input) ---
    const updatePinDisplay = () => {
        elements.joinModal.pinDisplay.forEach((digit, index) => {
            digit.textContent = pinInput[index] || '';
        });
        document.getElementById('confirm-join-button').disabled = pinInput.length !== 4;
    };

    const numpadJoinHandler = (event) => {
        const value = event.target.dataset.value;

        if (value === 'confirm' && pinInput.length === 4) {
            handleJoinGame(pinInput);
            pinInput = ""; // Wird erst nach Bestätigung zurückgesetzt, falls Fehler auftritt
            return;
        }

        if (value === 'del') {
            pinInput = pinInput.slice(0, -1);
        } else if (value === 'clear') {
            pinInput = "";
        } else if (value && !isNaN(parseInt(value)) && pinInput.length < 4) {
            pinInput += value;
        }
        updatePinDisplay();
    };
    

    // --- Lobby Settings Logic ---
    function handleCustomValueConfirm(value) {
        console.log(`Custom value confirmed: ${value} for type: ${currentCustomType}`);
        
        let settingKey, min, max;
        
        switch(currentCustomType) {
            case 'songCount':
                settingKey = 'songCount';
                min = 5; max = 100;
                break;
            case 'guessTime':
                settingKey = 'guessTime';
                min = 5; max = 60;
                break;
            case 'livesCount':
                settingKey = 'lives';
                min = 1; max = 10;
                // Speichert Lives-Count temporär, wird beim Create Game gesendet
                gameCreationSettings.lives = Math.max(min, Math.min(max, value));
                break;
            default:
                showToast("Unbekannter Einstellungs-Typ.", true);
                return;
        }

        if (settingKey === 'lives') {
            // Lives-Count wird lokal gespeichert, nur UI muss aktualisiert werden
            updateHostSettings({ lives: gameCreationSettings.lives }, true);
        } else {
             // Sende Einstellungs-Update an den Server
            const finalValue = Math.max(min, Math.min(max, value));
            sendSettingUpdate(settingKey, finalValue);
        }
    }


    function handleSettingPresetClick(event) {
        const button = event.target.closest('.preset-button');
        if (!button) return;

        const containerId = button.closest('.preset-group').id;
        const value = button.dataset.value;

        let settingKey = '';

        if (containerId.includes('song')) {
            settingKey = 'songCount';
        } else if (containerId.includes('time')) {
            settingKey = 'guessTime';
        } else if (containerId.includes('answer')) {
            settingKey = 'answerType';
        } else if (containerId.includes('lives')) {
            settingKey = 'lives';
        }

        if (value === 'custom') {
            currentCustomType = settingKey === 'lives' ? 'livesCount' : settingKey;
            
            let min, max, title;
            if (currentCustomType === 'songCount') { min = 5; max = 100; title = 'Anzahl Songs (5-100)'; }
            else if (currentCustomType === 'guessTime') { min = 5; max = 60; title = 'Zeit pro Runde (5-60s)'; }
            else if (currentCustomType === 'livesCount') { min = 1; max = 10; title = 'Anzahl Leben (1-10)'; }
            
            elements.customValueModal.title.textContent = title;
            elements.customValueModal.overlay.classList.remove('hidden');
            customValueInput = ""; // Startet mit leerem Input
            updateCustomValueDisplay();
            return;
        }
        
        if (settingKey === 'lives') {
             // Lives-Count wird lokal gespeichert
            gameCreationSettings.lives = parseInt(value, 10);
            updateHostSettings({ lives: gameCreationSettings.lives }, true);
        } else {
            sendSettingUpdate(settingKey, value);
        }
    }

    function sendSettingUpdate(key, value) {
        if (!currentGame.isHost || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            showToast("Fehler: Kann Host-Einstellungen nicht senden.", true);
            return;
        }
        
        let finalValue = value;
        if (key === 'songCount' || key === 'guessTime') finalValue = parseInt(value, 10);

        console.log(`Sending setting update: ${key}=${finalValue}`);

        ws.socket.send(JSON.stringify({
            type: 'update-setting',
            payload: {
                pin: currentGame.pin,
                settingKey: key,
                settingValue: finalValue
            }
        }));
    }


    // --- Spotify Device & Playlist Logic ---
    async function openDeviceSelectModal() {
        if (currentUser.isGuest) {
            showToast("Als Gast kannst du kein Spotify-Gerät auswählen.", true);
            return;
        }
        if (!spotifyToken) {
            showToast("Verbinde zuerst dein Spotify-Konto.", true);
            return;
        }
        
        setLoading(true);
        elements.deviceSelectModal.list.innerHTML = `<p class="muted-text">Geräte werden geladen...</p>`;

        try {
            const res = await fetch('/api/spotify/devices');
            if (!res.ok) throw new Error("Geräte-Ladefehler");
            
            const data = await res.json();
            
            elements.deviceSelectModal.list.innerHTML = '';

            if (data.devices.length === 0) {
                 elements.deviceSelectModal.list.innerHTML = `<p class="muted-text">Keine aktiven Spotify-Geräte gefunden. Starte die Spotify-App auf einem Gerät.</p>`;
            } else {
                data.devices.forEach(device => {
                    const deviceItem = document.createElement('div');
                    deviceItem.classList.add('device-item', device.is_active ? 'active' : '');
                    deviceItem.dataset.deviceId = device.id;
                    deviceItem.innerHTML = `
                        <i class="fa-solid fa-xl ${getDeviceIcon(device.type)}"></i>
                        <div class="device-info">
                            <span class="device-name">${device.name}</span>
                            <span class="device-type">${device.type}</span>
                        </div>
                        <button class="button-primary button-small select-device-btn" data-device-id="${device.id}" data-device-name="${device.name}" ${device.is_active ? 'disabled' : ''}>Auswählen</button>
                    `;
                    
                    if (!device.is_active) {
                        deviceItem.querySelector('.select-device-btn').addEventListener('click', (e) => {
                             selectSpotifyDevice(e.target.dataset.deviceId, e.target.dataset.deviceName);
                        });
                    } else {
                        deviceItem.querySelector('.select-device-btn').textContent = 'Aktiv';
                    }

                    elements.deviceSelectModal.list.appendChild(deviceItem);
                });
            }
            
            elements.deviceSelectModal.overlay.classList.remove('hidden');

        } catch (error) {
            console.error("Error loading devices:", error);
            showToast("Fehler beim Laden der Spotify-Geräte.", true);
            elements.deviceSelectModal.list.innerHTML = `<p class="error-message">Fehler: ${error.message}</p>`;
        } finally {
            setLoading(false);
        }
    }
    
    function getDeviceIcon(type) {
        switch (type) {
            case 'Computer': return 'fa-desktop';
            case 'Smartphone':
            case 'Tablet': return 'fa-mobile-screen';
            case 'Speaker': return 'fa-speaker-deck';
            case 'CastVideo':
            case 'AVR': return 'fa-tv';
            default: return 'fa-headphones';
        }
    }
    
    function selectSpotifyDevice(deviceId, deviceName) {
         console.log(`Selected Spotify device: ${deviceName} (${deviceId})`);
         elements.deviceSelectModal.overlay.classList.add('hidden');
         sendSettingUpdate('deviceId', deviceId);
         sendSettingUpdate('deviceName', deviceName);
    }
    
    // Playlist Selection
    async function openPlaylistSelectModal(query = '') {
        if (currentUser.isGuest) {
            showToast("Als Gast kannst du keine Playlists auswählen.", true);
            return;
        }
        if (!spotifyToken) {
            showToast("Verbinde zuerst dein Spotify-Konto.", true);
            return;
        }
        
        setLoading(true);
        
        try {
            // Nur beim ersten Öffnen oder wenn gesucht wird, Playlists laden
            if (allPlaylists.length === 0 || query) {
                console.log(`Fetching playlists with query: ${query}`);
                // Holt alle Playlists, um clientseitig zu filtern/paginieren
                // In einer realen App würde man hier Server-seitige Pagination nutzen
                const res = await fetch(`/api/spotify/playlists?query=${encodeURIComponent(query)}`);
                if (!res.ok) throw new Error("Playlist-Ladefehler");
                
                const data = await res.json();
                allPlaylists = data.playlists;
                currentPage = 1; // Zurücksetzen auf Seite 1 nach neuer Suche
            }
            
            renderPlaylistPage();
            elements.playlistSelectModal.overlay.classList.remove('hidden');

        } catch (error) {
            console.error("Error loading playlists:", error);
            showToast("Fehler beim Laden der Spotify-Playlists.", true);
            elements.playlistSelectModal.list.innerHTML = `<p class="error-message">Fehler: ${error.message}</p>`;
        } finally {
            setLoading(false);
        }
    }
    
    function renderPlaylistPage() {
        const listEl = elements.playlistSelectModal.list;
        const paginationEl = elements.playlistSelectModal.pagination;
        listEl.innerHTML = '';
        paginationEl.innerHTML = '';

        if (allPlaylists.length === 0) {
            listEl.innerHTML = `<p class="muted-text">Keine Playlists gefunden. Versuche es mit einer anderen Suche.</p>`;
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const playlistsOnPage = allPlaylists.slice(startIndex, endIndex);
        const totalPages = Math.ceil(allPlaylists.length / itemsPerPage);

        playlistsOnPage.forEach(playlist => {
            const playlistItem = document.createElement('div');
            playlistItem.classList.add('playlist-item');
            playlistItem.innerHTML = `
                <img src="${playlist.image}" alt="Playlist Cover" class="playlist-cover">
                <div class="playlist-info">
                    <span class="playlist-name">${playlist.name}</span>
                    <span class="playlist-owner">Von: ${playlist.owner}</span>
                    <span class="playlist-tracks">${playlist.trackCount} Songs</span>
                </div>
                <button class="button-primary button-small select-playlist-btn" data-playlist-id="${playlist.id}" data-playlist-name="${playlist.name}">Auswählen</button>
            `;
            
            playlistItem.querySelector('.select-playlist-btn').addEventListener('click', (e) => {
                 selectSpotifyPlaylist(e.target.dataset.playlistId, e.target.dataset.playlistName);
            });

            listEl.appendChild(playlistItem);
        });
        
        // Pagination Rendern
        if (totalPages > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.classList.add('button-secondary', 'button-small');
            prevBtn.textContent = 'Vorherige';
            prevBtn.disabled = currentPage === 1;
            prevBtn.addEventListener('click', () => {
                currentPage--;
                renderPlaylistPage();
            });
            paginationEl.appendChild(prevBtn);

            const pageInfo = document.createElement('span');
            pageInfo.textContent = `Seite ${currentPage} von ${totalPages}`;
            paginationEl.appendChild(pageInfo);

            const nextBtn = document.createElement('button');
            nextBtn.classList.add('button-secondary', 'button-small');
            nextBtn.textContent = 'Nächste';
            nextBtn.disabled = currentPage === totalPages;
            nextBtn.addEventListener('click', () => {
                currentPage++;
                renderPlaylistPage();
            });
            paginationEl.appendChild(nextBtn);
        }
    }
    
    function selectSpotifyPlaylist(playlistId, playlistName) {
         console.log(`Selected Spotify playlist: ${playlistName} (${playlistId})`);
         elements.playlistSelectModal.overlay.classList.add('hidden');
         sendSettingUpdate('playlistId', playlistId);
         sendSettingUpdate('playlistName', playlistName);
    }
    
    // --- Main Game Actions ---
    function handleJoinGame(pin) {
        if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            showToast("Verbindung zum Server fehlgeschlagen.", true);
            return;
        }
        
        setLoading(true);
        console.log(`Attempting to join game with PIN: ${pin}`);

        ws.socket.send(JSON.stringify({
            type: 'join-game',
            payload: {
                pin,
                playerId: currentUser.id,
                username: currentUser.username,
                isGuest: currentUser.isGuest,
                iconId: userProfile.equipped_icon_id || 1
            }
        }));
    }

    function handleCreateGame() {
        if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            showToast("Verbindung zum Server fehlgeschlagen.", true);
            return;
        }
        
        if (currentGame.gameMode === 'quiz' && !elements.lobby.startGameBtn.disabled) {
            // Quiz-Modus: Starte das Spiel direkt (Einstellungen sind bereits aktuell)
            sendStartGame();
            return;
        }
        
        // Nur zur Modusauswahl navigieren
        if (!selectedGameMode) {
             showScreen('mode-selection-screen');
             return;
        }
        
        // Host-Setup senden
        setLoading(true);
        console.log(`Attempting to create game with mode: ${selectedGameMode}`);

        ws.socket.send(JSON.stringify({
            type: 'create-game',
            payload: {
                hostId: currentUser.id,
                username: currentUser.username,
                gameMode: selectedGameMode,
                gameType: gameCreationSettings.gameType,
                lives: gameCreationSettings.lives,
                iconId: userProfile.equipped_icon_id || 1
            }
        }));
    }
    
    function sendStartGame() {
        if (!currentGame.isHost || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            showToast("Fehler: Nur der Host kann das Spiel starten.", true);
            return;
        }
        
        // Sicherheitscheck: Sind Playlist und Device gesetzt?
        if (elements.lobby.startGameBtn.disabled) {
             showToast("Bitte wähle ein Spotify-Gerät und eine Playlist aus.", true);
             return;
        }

        console.log("Sending start-game request...");
        setLoading(true);

        ws.socket.send(JSON.stringify({
            type: 'start-game',
            payload: { pin: currentGame.pin }
        }));
    }


    // --- Friend Actions ---
    async function addFriend() {
        if (currentUser.isGuest) {
            showToast("Als Gast kannst du keine Freunde hinzufügen.", true);
            return;
        }
        
        const friendUsername = elements.friendsModal.addFriendInput.value.trim();
        elements.friendsModal.addFriendInput.value = '';
        
        if (!friendUsername || friendUsername === currentUser.username) {
            showToast("Ungültiger Benutzername.", true);
            return;
        }
        
        elements.friendsModal.addFriendBtn.disabled = true;
        setLoading(true);

        try {
            // Finde die ID des Freundes
            const { data: friendProfile, error: profileError } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', friendUsername)
                .single();

            if (profileError || !friendProfile) {
                showToast(`Benutzer ${friendUsername} nicht gefunden.`, true);
                return;
            }
            
            const friendId = friendProfile.id;

            // Prüfe auf bestehende Beziehung
            const { data: existingFriendship, error: friendshipError } = await supabase
                .from('friends')
                .select('*')
                .or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${friendId}),and(user1_id.eq.${friendId},user2_id.eq.${currentUser.id})`);

            if (existingFriendship.length > 0) {
                const status = existingFriendship[0].status;
                if (status === 'accepted') {
                     showToast(`${friendUsername} ist bereits dein Freund.`, true);
                } else if (status === 'pending') {
                     if (existingFriendship[0].user1_id === currentUser.id) {
                         showToast(`Die Anfrage an ${friendUsername} ist noch offen.`, false);
                     } else {
                         showToast(`Du hast eine Anfrage von ${friendUsername} erhalten. Nimm sie an!`, false);
                     }
                }
                return;
            }
            
            // Sende die Anfrage
            const { error: insertError } = await supabase
                .from('friends')
                .insert({ user1_id: currentUser.id, user2_id: friendId, status: 'pending' });

            if (insertError) {
                throw insertError;
            }
            
            // Benachrichtige den anderen Benutzer über WebSocket
            if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                 ws.socket.send(JSON.stringify({ 
                    type: 'send-friend-request', 
                    payload: { 
                        toUserId: friendId, 
                        fromUsername: currentUser.username
                    } 
                 }));
            }
            
            showToast(`Freundschaftsanfrage an ${friendUsername} gesendet!`);

        } catch (error) {
            console.error("Fehler beim Hinzufügen von Freunden:", error);
            showToast("Fehler beim Senden der Anfrage.", true);
        } finally {
            elements.friendsModal.addFriendBtn.disabled = false;
            setLoading(false);
        }
    }

    async function handleFriendRequest(requesterId, action) {
        if (currentUser.isGuest) return;
        setLoading(true);

        try {
            // Finde die Anfrage, bei der der Requester der user1 ist und ich der user2
            const { error: updateError } = await supabase
                .from('friends')
                .update({ status: action === 'accept' ? 'accepted' : 'rejected' })
                .eq('user1_id', requesterId)
                .eq('user2_id', currentUser.id)
                .eq('status', 'pending');

            if (updateError) throw updateError;
            
            if (action === 'accept') {
                // Füge die umgekehrte Beziehung hinzu, um das Entfernen zu vereinfachen
                const { error: reverseError } = await supabase
                     .from('friends')
                     .insert({ user1_id: currentUser.id, user2_id: requesterId, status: 'accepted' });
                if (reverseError) console.warn("Fehler beim Erstellen der umgekehrten Freundschaftsbeziehung (nicht kritisch):", reverseError);

                showToast("Freundschaftsanfrage angenommen!");
            } else {
                showToast("Freundschaftsanfrage abgelehnt.");
            }
            
            loadFriendsData(); // Aktualisiere die Listen

        } catch (error) {
            console.error("Fehler bei der Bearbeitung der Anfrage:", error);
            showToast("Fehler bei der Bearbeitung der Anfrage.", true);
        } finally {
            setLoading(false);
        }
    }
    
    async function removeFriend(friendId, friendUsername) {
        if (currentUser.isGuest) return;
        setLoading(true);
        
        try {
            // Lösche die Freundschaft in beide Richtungen
            const { error: deleteError } = await supabase
                .from('friends')
                .delete()
                .or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${friendId}),and(user1_id.eq.${friendId},user2_id.eq.${currentUser.id})`);

            if (deleteError) throw deleteError;

            showToast(`${friendUsername} wurde entfernt.`);
            
            // Schließe das Bestätigungsmodal, falls es offen ist
            elements.confirmActionModal.overlay.classList.add('hidden');
            
            loadFriendsData(); // Aktualisiere die Listen

        } catch (error) {
             console.error("Fehler beim Entfernen des Freundes:", error);
            showToast("Fehler beim Entfernen des Freundes.", true);
        } finally {
            setLoading(false);
        }
    }


    // --- Global Event Listeners ---
    const addEventListeners = () => {
        // --- AUTH SCREEN ---
        elements.auth.loginForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAuthAction(supabase.auth.signInWithPassword, elements.auth.loginForm);
        });
        elements.auth.registerForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAuthAction(supabase.auth.signUp, elements.auth.registerForm, true);
        });
        elements.auth.showRegister?.addEventListener('click', () => {
            document.getElementById('auth-screen').classList.add('register-active');
        });
        elements.auth.showLogin?.addEventListener('click', () => {
            document.getElementById('auth-screen').classList.remove('register-active');
        });

        // --- GUEST MODAL ---
        elements.guestModal.openBtn?.addEventListener('click', () => {
            elements.guestModal.overlay.classList.remove('hidden');
        });
        elements.guestModal.closeBtn?.addEventListener('click', () => {
            elements.guestModal.overlay.classList.add('hidden');
        });
        elements.guestModal.submitBtn?.addEventListener('click', () => {
            const nickname = elements.guestModal.input.value.trim();
            if (nickname.length >= 2 && nickname.length <= 15) {
                elements.guestModal.overlay.classList.add('hidden');
                initializeApp({ username: nickname }, true);
            } else {
                showToast("Nickname muss 2-15 Zeichen lang sein.", true);
            }
        });
        
        // --- HOME SCREEN ---
        elements.home.logoutBtn?.addEventListener('click', handleLogout);
        elements.home.joinRoomBtn?.addEventListener('click', () => {
            elements.joinModal.overlay.classList.remove('hidden');
            pinInput = "";
            updatePinDisplay();
        });
        elements.home.createRoomBtn?.addEventListener('click', () => {
            selectedGameMode = null; // Zurücksetzen für neue Auswahl
            showScreen('mode-selection-screen');
        });
        elements.home.achievementsBtn?.addEventListener('click', () => {
            showScreen('achievements-screen');
        });
        elements.home.friendsBtn?.addEventListener('click', () => {
            elements.friendsModal.overlay.classList.remove('hidden');
            loadFriendsData();
            // Starte auf Tab 'Freunde'
            elements.friendsModal.tabs.forEach(tab => tab.classList.remove('active'));
            elements.friendsModal.tabContents.forEach(content => content.classList.add('hidden'));
            document.getElementById('friends-tab-friends').classList.add('active');
            document.getElementById('friends-content-friends').classList.remove('hidden');
        });
        elements.home.statsBtn?.addEventListener('click', () => {
            showScreen('stats-screen');
        });
        elements.home.profileTitleBtn?.addEventListener('click', () => {
             showScreen('title-selection-screen');
        });
        elements.home.profilePictureBtn?.addEventListener('click', () => {
             showScreen('icon-selection-screen');
        });
        elements.home.levelProgressBtn?.addEventListener('click', () => {
            showScreen('level-progress-screen');
        });
        elements.home.usernameContainer?.addEventListener('click', () => {
             if (currentUser && !currentUser.isGuest) {
                 elements.changeNameModal.input.value = currentUser.username;
                 elements.changeNameModal.overlay.classList.remove('hidden');
             }
        });

        // --- GLOBAL ACTIONS ---
        document.getElementById('back-button')?.addEventListener('click', goBack);
        elements.leaveGameButton?.addEventListener('click', () => {
            goBack(); // Triggert das Confirm Modal, falls in Lobby/Game
        });
        document.getElementById('spotify-connect-button')?.addEventListener('click', () => {
             window.location.href = '/api/spotify/login';
        });

        // --- MODAL CLOSE BUTTONS ---
        elements.joinModal.closeBtn?.addEventListener('click', () => {
            elements.joinModal.overlay.classList.add('hidden');
            pinInput = "";
            updatePinDisplay();
        });
        elements.friendsModal.closeBtn?.addEventListener('click', () => {
            elements.friendsModal.overlay.classList.add('hidden');
        });
        elements.inviteFriendsModal.closeBtn?.addEventListener('click', () => {
            elements.inviteFriendsModal.overlay.classList.add('hidden');
        });
        elements.customValueModal.closeBtn?.addEventListener('click', () => {
            elements.customValueModal.overlay.classList.add('hidden');
        });
        elements.changeNameModal.closeBtn?.addEventListener('click', () => {
            elements.changeNameModal.overlay.classList.add('hidden');
        });
        elements.deviceSelectModal.closeBtn?.addEventListener('click', () => {
            elements.deviceSelectModal.overlay.classList.add('hidden');
        });
        elements.playlistSelectModal.closeBtn?.addEventListener('click', () => {
            elements.playlistSelectModal.overlay.classList.add('hidden');
        });
        elements.leaveConfirmModal.cancelBtn?.addEventListener('click', () => {
            elements.leaveConfirmModal.overlay.classList.add('hidden');
        });
        elements.confirmActionModal.cancelBtn?.addEventListener('click', () => {
             elements.confirmActionModal.overlay.classList.add('hidden');
        });
        elements.confirmActionModal.confirmBtn?.addEventListener('click', () => {
             elements.confirmActionModal.overlay.classList.add('hidden');
             if (typeof currentConfirmAction === 'function') {
                 currentConfirmAction();
                 currentConfirmAction = null;
             }
        });
        elements.leaveConfirmModal.confirmBtn?.addEventListener('click', () => {
            elements.leaveConfirmModal.overlay.classList.add('hidden');
            const targetScreenId = screenHistory[screenHistory.length - 2];
            
            if (ws.socket && ws.socket.readyState === WebSocket.OPEN && currentGame.pin) {
                console.log(`Sending leave-game request for PIN ${currentGame.pin}`);
                ws.socket.send(JSON.stringify({ 
                    type: 'leave-game', 
                    payload: { pin: currentGame.pin, playerId: currentGame.playerId } 
                }));
            }
            localStorage.removeItem('fakesterGame');
            currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
            
            // Setzt den Bildschirm manuell zurück
            screenHistory = ['auth-screen', 'home-screen']; 
            showScreen('home-screen');
        });


        // --- KEYPADS ---
        elements.joinModal.numpad?.addEventListener('click', numpadJoinHandler);
        document.getElementById('confirm-join-button')?.addEventListener('click', () => {
             elements.joinModal.numpad.dispatchEvent(new Event('confirm'));
        });
        elements.customValueModal.numpad?.addEventListener('click', numpadCustomValueHandler);


        // --- LOBBY SCREEN ---
        elements.lobby.deviceSelectBtn?.addEventListener('click', openDeviceSelectModal);
        elements.deviceSelectModal.refreshBtn?.addEventListener('click', () => {
            openDeviceSelectModal(); // Refresh devices
        });
        elements.lobby.playlistSelectBtn?.addEventListener('click', () => openPlaylistSelectModal());
        elements.playlistSelectModal.search?.addEventListener('input', (e) => {
             // Verzögertes Suchen, um API-Aufrufe zu minimieren
             clearTimeout(elements.playlistSelectModal.search.timer);
             elements.playlistSelectModal.search.timer = setTimeout(() => {
                 openPlaylistSelectModal(e.target.value.trim());
             }, 500);
        });
        elements.lobby.startGameBtn?.addEventListener('click', sendStartGame);
        elements.lobby.inviteFriendsBtn?.addEventListener('click', () => {
            // Zeige nur Freunde an, die online sind (über WS-Daten)
            renderOnlineFriendsForInvite();
            elements.inviteFriendsModal.overlay.classList.remove('hidden');
        });
        
        // Settings Presets (Delegation)
        document.getElementById('host-settings')?.addEventListener('click', handleSettingPresetClick);
        elements.gameTypeScreen.livesPresets?.addEventListener('click', handleSettingPresetClick);


        // --- MODE SELECTION SCREEN ---
        document.querySelectorAll('#mode-selection-screen .mode-card').forEach(card => {
            card.addEventListener('click', () => {
                const mode = card.dataset.mode;
                if (!mode) return;
                
                selectedGameMode = mode;
                
                // Für Quiz und Popularity direkt zur Lobby (Game Type 'Points')
                if (mode === 'quiz' || mode === 'popularity') {
                    gameCreationSettings.gameType = 'points';
                    gameCreationSettings.lives = 3; // Standardwert
                    handleCreateGame();
                } else {
                    // Für Timeline zur Game Type Auswahl (Lives/Points)
                    showScreen('game-type-selection-screen');
                    // Verberge die Lives-Einstellungen, bis Lives ausgewählt wird
                    elements.gameTypeScreen.livesSettings.classList.add('hidden');
                    elements.gameTypeScreen.pointsBtn.classList.add('active');
                    elements.gameTypeScreen.livesBtn.classList.remove('active');
                    gameCreationSettings.gameType = 'points';
                }
            });
        });
        
        // --- GAME TYPE SELECTION SCREEN ---
        elements.gameTypeScreen.pointsBtn?.addEventListener('click', () => {
            elements.gameTypeScreen.livesSettings.classList.add('hidden');
            elements.gameTypeScreen.pointsBtn.classList.add('active');
            elements.gameTypeScreen.livesBtn.classList.remove('active');
            gameCreationSettings.gameType = 'points';
        });
        elements.gameTypeScreen.livesBtn?.addEventListener('click', () => {
            elements.gameTypeScreen.livesSettings.classList.remove('hidden');
            elements.gameTypeScreen.livesBtn.classList.add('active');
            elements.gameTypeScreen.pointsBtn.classList.remove('active');
            gameCreationSettings.gameType = 'lives';
            
            // Setzt Standard Lives Count, wenn noch nicht gesetzt
            if (!gameCreationSettings.lives) gameCreationSettings.lives = 3;
            // Markiert das Lives Preset (UI Update)
            updateHostSettings({ lives: gameCreationSettings.lives }, true);
        });
        elements.gameTypeScreen.createLobbyBtn?.addEventListener('click', handleCreateGame);


        // --- FRIENDS MODAL ---
        elements.friendsModal.tabsContainer?.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-button');
            if (!button) return;
            
            elements.friendsModal.tabs.forEach(tab => tab.classList.remove('active'));
            elements.friendsModal.tabContents.forEach(content => content.classList.add('hidden'));
            
            button.classList.add('active');
            document.getElementById(`friends-content-${button.dataset.tab}`).classList.remove('hidden');
        });
        elements.friendsModal.addFriendBtn?.addEventListener('click', addFriend);
        
        
        // --- CHANGE NAME MODAL ---
        elements.changeNameModal.submitBtn?.addEventListener('click', async () => {
            const newUsername = elements.changeNameModal.input.value.trim();
            if (newUsername.length < 2 || newUsername.length > 15) {
                showToast("Benutzername muss 2-15 Zeichen lang sein.", true);
                return;
            }
            
            if (newUsername === currentUser.username) {
                 elements.changeNameModal.overlay.classList.add('hidden');
                 return;
            }

            setLoading(true);

            try {
                // Prüfe, ob der Name bereits vergeben ist
                const { data: existingUser, error: checkError } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('username', newUsername)
                    .single();

                if (existingUser) {
                    showToast("Dieser Benutzername ist bereits vergeben.", true);
                    return;
                }
                
                // Update in der DB
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ username: newUsername })
                    .eq('id', currentUser.id);

                if (updateError) throw updateError;
                
                // Update lokal und in Supabase Auth
                currentUser.username = newUsername;
                document.getElementById('welcome-nickname').textContent = newUsername;
                userProfile.username = newUsername;
                showToast("Benutzername erfolgreich geändert!");
                
                // Update Supabase Auth User Metadata (optional, aber gut für Konsistenz)
                await supabase.auth.updateUser({ data: { username: newUsername } });
                
                elements.changeNameModal.overlay.classList.add('hidden');

            } catch (error) {
                 console.error("Fehler beim Ändern des Benutzernamens:", error);
                showToast("Fehler beim Ändern des Benutzernamens.", true);
            } finally {
                setLoading(false);
            }
        });

    };


    // --- Supabase & Initial Setup ---
    const initializeSupabase = async () => {
        setLoading(true);
        console.log("Initializing Supabase...");
        
        try {
            const SUPABASE_URL = 'SUPABASE_URL_PLACEHOLDER'; // Muss ersetzt werden
            const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_PLACEHOLDER'; // Muss ersetzt werden

            if (!SUPABASE_URL.includes('PLACEHOLDER') && !SUPABASE_ANON_KEY.includes('PLACEHOLDER')) {
                supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            } else {
                 throw new Error("Supabase URLs/Keys sind nicht gesetzt. Bitte ersetze die Platzhalter.");
            }
            
            console.log("Supabase initialized.");

            // Supabase Auth Listener
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`Supabase Auth Event: ${event}`);
                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    // Der event.session.user ist der korrekte Benutzer-Objekt
                    if (session && session.user) {
                        // Verzögerung, um sicherzustellen, dass initializeApp nur einmal aufgerufen wird.
                         await initializeApp(session.user, false);
                    }
                } else if (event === 'SIGNED_OUT') {
                    // Zurück zum Anmeldebildschirm
                    currentUser = null;
                    spotifyToken = null;
                    localStorage.removeItem('fakesterGame');
                    
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                         ws.socket.close();
                    }
                    if (wsPingInterval) clearInterval(wsPingInterval);
                    
                    showScreen('auth-screen');
                    setLoading(false);
                } else if (event === 'INITIAL_SESSION') {
                     // Wird nach dem ersten Laden aufgerufen, um den Zustand zu prüfen
                }
            });
            
            // Manuelle Prüfung der Sitzung, falls der Listener das initiale Laden verpasst
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            
            if (sessionError) {
                console.error("Session Error:", sessionError);
                showToast("Fehler beim Abrufen der Sitzung.", true);
                showScreen('auth-screen');
            } else if (session) {
                console.log("Found active session, checking for Auth Event...");
                // Das SIGNED_IN Event wird durch den Reload ausgelöst und ruft initializeApp auf.
                
            } else {
                console.log("No active session, showing auth screen.");
                showScreen('auth-screen');
            }
            
            // FIX: Unabhängig davon, ob eine Session gefunden wurde, den Ladescreen freigeben.
            // Da initializeApp das Laden selbst beendet, muss hier eine kurze Wartezeit sein, 
            // um Race Conditions zu vermeiden.
             setTimeout(() => setLoading(false), 500); 
            

            addEventListeners();

        } catch (error) {
            console.error("FATAL ERROR during Supabase initialization:", error);
            document.body.innerHTML = `<h1>Initialisierungsfehler</h1><p>Die Anwendung konnte nicht geladen werden. (${error.message})</p>`;
        }
    }

    // --- Main Execution ---\n
    initializeSupabase();
});
