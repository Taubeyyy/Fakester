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
    const copyConsoleBtn = document.createElement('button'); // NEU: Copy Button Element

    copyConsoleBtn.textContent = 'Kopieren'; // NEU: Text für den Button
    copyConsoleBtn.id = 'copy-console-btn'; // NEU: ID für den Button

    // Füge den Copy Button zum Header hinzu (wenn der Header existiert)
    document.querySelector('.console-header')?.insertBefore(copyConsoleBtn, clearConsoleBtn); // NEU: Button einfügen

    const originalConsole = { ...console };

    const formatArg = (arg) => {
        if (arg instanceof Error) {
            return `❌ Error: ${arg.message}\nStack:\n${arg.stack || 'No stack trace available'}`;
        }
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.stringify(arg, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value, 2);
            } catch (e) {
                return '[Object (circular structure or stringify failed)]';
            }
        }
        return String(arg);
    };

    const logToPage = (type, args) => {
        if (!consoleOutput) return;
        try {
            const message = args.map(formatArg).join(' ');
            const logEntry = document.createElement('div');
            logEntry.classList.add(`log-${type}`);
            // Speichere die Roh-Text-Nachricht für das Kopieren
            logEntry.dataset.rawText = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`;
            logEntry.innerHTML = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: <pre>${message}</pre>`;
            consoleOutput.appendChild(logEntry);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        } catch (e) {
            originalConsole.error("Error logging to page console:", e);
        }
    };

    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); };
    console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); };
    console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); };
    console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); };

    window.onerror = (message, source, lineno, colno, error) => {
        const errorArgs = error ? [error] : [message, `at ${source}:${lineno}:${colno}`];
        originalConsole.error('Uncaught Error:', ...errorArgs);
        logToPage('error', ['🚨 Uncaught Error:', ...errorArgs]);
        return true;
    };

    window.onunhandledrejection = (event) => {
        const reason = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason));
        originalConsole.error('Unhandled Promise Rejection:', reason);
        logToPage('error', ['🚧 Unhandled Promise Rejection:', reason]);
    };

    // Event Listener für Konsolen-Buttons werden am Ende in addEventListeners hinzugefügt
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
        { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1 }, { id: 2, name: 'Musik-Kenner', unlockType: 'achievement', unlockValue: 2 }, { id: 3, name: 'Legende', unlockType: 'achievement', unlockValue: 3 }, { id: 4, name: 'Zeitreisender', unlockType: 'achievement', unlockValue: 4 }, { id: 5, 'name': 'Star-Experte', unlockType: 'achievement', unlockValue: 5 }, { id: 6, name: ' Pechvogel', unlockType: 'achievement', unlockValue: 12 }, { id: 7, name: 'Präzise', unlockType: 'achievement', unlockValue: 13 }, { id: 8, name: 'Gesellig', unlockType: 'achievement', unlockValue: 14 }, { id: 9, name: 'Sammler', unlockType: 'achievement', unlockValue: 15 }, { id: 10, name: 'Kenner', unlockType: 'level', unlockValue: 5 }, { id: 11, name: 'Experte', unlockType: 'level', unlockValue: 10 }, { id: 12, name: 'Meister', unlockType: 'level', unlockValue: 15 }, { id: 13, name: 'Virtuose', unlockType: 'level', unlockValue: 20 }, { id: 14, name: 'Maestro', unlockType: 'level', unlockValue: 25 }, { id: 15, name: 'Großmeister', unlockType: 'level', unlockValue: 30 }, { id: 16, name: 'Orakel', unlockType: 'level', unlockValue: 40 }, { id: 17, name: 'Musikgott', unlockType: 'level', unlockValue: 50 }, { id: 18, name: 'Perfektionist', unlockType: 'achievement', unlockValue: 19 }, { id: 19, name: 'Highscorer', unlockType: 'achievement', unlockValue: 18 }, { id: 20, name: 'Dauerbrenner', unlockType: 'achievement', unlockValue: 17 }, { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon' }
    ];

    const iconsList = [
        { id: 1, iconClass: 'fa-user', unlockType: 'level', unlockValue: 1, description: 'Standard-Icon' }, { id: 2, iconClass: 'fa-music', unlockType: 'level', unlockValue: 5, description: 'Erreiche Level 5' }, { id: 3, iconClass: 'fa-star', unlockType: 'level', unlockValue: 10, description: 'Erreiche Level 10' }, { id: 4, iconClass: 'fa-trophy', unlockType: 'achievement', unlockValue: 3, description: 'Erfolg: Seriensieger' }, { id: 5, iconClass: 'fa-crown', unlockType: 'level', unlockValue: 20, description: 'Erreiche Level 20' }, { id: 6, iconClass: 'fa-headphones', unlockType: 'achievement', unlockValue: 2, description: 'Erfolg: Besserwisser' }, { id: 7, iconClass: 'fa-guitar', unlockType: 'level', unlockValue: 15, description: 'Erreiche Level 15' }, { id: 8, iconClass: 'fa-bolt', unlockType: 'level', unlockValue: 25, description: 'Erreiche Level 25' }, { id: 9, iconClass: 'fa-record-vinyl', unlockType: 'level', unlockValue: 30, description: 'Erreiche Level 30' }, { id: 10, iconClass: 'fa-fire', unlockType: 'level', unlockValue: 40, description: 'Erreiche Level 40' }, { id: 11, iconClass: 'fa-ghost', unlockType: 'level', unlockValue: 45, description: 'Erreiche Level 45' }, { id: 12, iconClass: 'fa-meteor', unlockType: 'level', unlockValue: 50, description: 'Erreiche Level 50' }, { id: 13, iconClass: 'fa-icons', unlockType: 'achievement', unlockValue: 16, description: 'Erfolg: Icon-Liebhaber'}, { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon' }
    ];

    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    // --- DOM Element References ---
    const elements = {
        screens: document.querySelectorAll('.screen'), leaveGameButton: document.getElementById('leave-game-button'), loadingOverlay: document.getElementById('loading-overlay'), countdownOverlay: document.getElementById('countdown-overlay'), auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), }, home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'), profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'), levelProgressBtn: document.getElementById('level-progress-button'), profileXpText: document.getElementById('profile-xp-text') }, modeSelection: { container: document.getElementById('mode-selection-screen')?.querySelector('.mode-selection-container') }, lobby: { pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'), deviceSelectBtn: document.getElementById('device-select-button'), playlistSelectBtn: document.getElementById('playlist-select-button'), startGameBtn: document.getElementById('start-game-button'), inviteFriendsBtn: document.getElementById('invite-friends-button'), songCountPresets: document.getElementById('song-count-presets'), guessTimePresets: document.getElementById('guess-time-presets'), answerTypeContainer: document.getElementById('answer-type-container'), answerTypePresets: document.getElementById('answer-type-presets'), }, game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), gameContentArea: document.getElementById('game-content-area') }, guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), input: document.getElementById('guest-nickname-input') }, joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), }, friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'), requestsCount: document.getElementById('requests-count'), tabsContainer: document.querySelector('.friends-modal .tabs'), tabs: document.querySelectorAll('.friends-modal .tab-button'), tabContents: document.querySelectorAll('.friends-modal .tab-content') }, inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list') }, customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')}, achievements: { grid: document.getElementById('achievement-grid'), screen: document.getElementById('achievements-screen') }, levelProgress: { list: document.getElementById('level-progress-list'), screen: document.getElementById('level-progress-screen') }, titles: { list: document.getElementById('title-list'), screen: document.getElementById('title-selection-screen') }, icons: { list: document.getElementById('icon-list'), screen: document.getElementById('icon-selection-screen') }, gameTypeScreen: { screen: document.getElementById('game-type-selection-screen'), pointsBtn: document.getElementById('game-type-points'), livesBtn: document.getElementById('game-type-lives'), livesSettings: document.getElementById('lives-settings-container'), livesPresets: document.getElementById('lives-count-presets'), createLobbyBtn: document.getElementById('create-lobby-button'), }, changeNameModal: { overlay: document.getElementById('change-name-modal-overlay'), closeBtn: document.getElementById('close-change-name-modal-button'), submitBtn: document.getElementById('change-name-submit'), input: document.getElementById('change-name-input'), }, deviceSelectModal: { overlay: document.getElementById('device-select-modal-overlay'), closeBtn: document.getElementById('close-device-select-modal'), list: document.getElementById('device-list'), refreshBtn: document.getElementById('refresh-devices-button-modal'), }, playlistSelectModal: { overlay: document.getElementById('playlist-select-modal-overlay'), closeBtn: document.getElementById('close-playlist-select-modal'), list: document.getElementById('playlist-list'), search: document.getElementById('playlist-search'), pagination: document.getElementById('playlist-pagination'), }, leaveConfirmModal: { overlay: document.getElementById('leave-confirm-modal-overlay'), confirmBtn: document.getElementById('confirm-leave-button'), cancelBtn: document.getElementById('cancel-leave-button'), }, confirmActionModal: { overlay: document.getElementById('confirm-action-modal-overlay'), title: document.getElementById('confirm-action-title'), text: document.getElementById('confirm-action-text'), confirmBtn: document.getElementById('confirm-action-confirm-button'), cancelBtn: document.getElementById('confirm-action-cancel-button'), }, stats: { screen: document.getElementById('stats-screen'), gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'), highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'), gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'), }
    };

    // --- Core Functions ---
    const showToast = (message, isError = false) => { console.log(`Toast: ${message} (Error: ${isError})`); Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast(); }
    const showScreen = (screenId) => { console.log(`Navigating to screen: ${screenId}`); const targetScreen = document.getElementById(screenId); if (!targetScreen) { console.error(`Screen with ID "${screenId}" not found!`); return; } const currentScreenId = screenHistory[screenHistory.length - 1]; if (screenId !== currentScreenId) screenHistory.push(screenId); elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const goBack = () => { if (screenHistory.length > 1) { const currentScreenId = screenHistory.pop(); const previousScreenId = screenHistory[screenHistory.length - 1]; console.log(`Navigating back to screen: ${previousScreenId}`); if (['game-screen', 'lobby-screen'].includes(currentScreenId)) { elements.leaveConfirmModal.overlay.classList.remove('hidden'); screenHistory.push(currentScreenId); return; } const targetScreen = document.getElementById(previousScreenId); if (!targetScreen) { console.error(`Back navigation failed: Screen "${previousScreenId}" not found!`); screenHistory = ['auth-screen']; window.location.reload(); return; } elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(previousScreenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); } };
    const setLoading = (isLoading) => { console.log(`Setting loading overlay: ${isLoading}`); elements.loadingOverlay.classList.toggle('hidden', !isLoading); }
    const showConfirmModal = (title, text, onConfirm) => { elements.confirmActionModal.title.textContent = title; elements.confirmActionModal.text.textContent = text; currentConfirmAction = onConfirm; elements.confirmActionModal.overlay.classList.remove('hidden'); };

    // --- Helper Functions ---
    function isItemUnlocked(item, currentLevel) { if (!item || !currentUser || currentUser.isGuest) return false; if (currentUser.username.toLowerCase() === 'taubey') return true; switch (item.unlockType) { case 'level': return currentLevel >= item.unlockValue; case 'achievement': return userUnlockedAchievementIds.includes(item.unlockValue); case 'special': return currentUser.username.toLowerCase() === item.unlockValue.toLowerCase(); default: return false; } }
    function getUnlockDescription(item) { if (!item) return ''; switch (item.unlockType) { case 'level': return `Erreiche Level ${item.unlockValue}`; case 'achievement': const ach = achievementsList.find(a => a.id === item.unlockValue); return `Erfolg: ${ach ? ach.name : 'Unbekannt'}`; case 'special': return 'Spezial'; default: return ''; } }

    // --- Initialization and Auth ---
    const initializeApp = async (user, isGuest = false) => {
        console.log("Log 0: Entering initializeApp.", { userId: user?.id, isGuest }); // Debug Log 0

        localStorage.removeItem('fakesterGame'); // Clear previous game state on init
        if (supabase) {
            console.log("Refreshing Supabase session...");
            await supabase.auth.refreshSession(); // Ensure session is fresh
        }

        try {
            if (isGuest) {
                console.log("Setting up guest user...");
                currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest };
                userProfile = { xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, equipped_title_id: 1, equipped_icon_id: 1 };
                userUnlockedAchievementIds = [];
                console.log("Guest user setup complete.");
            } else {
                console.log("Setting up logged-in user...");
                currentUser = { id: user.id, username: user.user_metadata?.username || user.email?.split('@')[0] || 'Unbekannt', isGuest }; // Use email part as fallback username

                console.log("Log 1: Fetching profile data..."); // Debug Log 1
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profileError) {
                    console.error("Profil-Ladefehler:", profileError);
                    showToast("Fehler beim Laden deines Profils.", true);
                    userProfile = { id: user.id, username: currentUser.username, xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, equipped_title_id: 1, equipped_icon_id: 1 }; // Fallback
                } else {
                    userProfile = profile;
                    currentUser.username = profile.username; // Update username from profile
                    console.log("Profile data fetched:", userProfile);
                }
                console.log("Log 2: Profile fetch finished."); // Debug Log 2

                console.log("Log 3: Fetching achievements..."); // Debug Log 3
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
                console.log("Log 4: Achievements fetch finished."); // Debug Log 4

                console.log("Log 5: Checking Spotify status..."); // Debug Log 5
                await checkSpotifyStatus();
                console.log("Log 6: Spotify status checked."); // Debug Log 6

                // Award Spotify Junkie achievement if conditions met
                if (spotifyToken && !userUnlockedAchievementIds.includes(9)) {
                    await awardClientSideAchievement(9);
                }

                console.log("Log 7: Rendering UI components..."); // Debug Log 7
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

            // Common setup for both guest and logged-in users
            document.body.classList.toggle('is-guest', isGuest);
            document.getElementById('welcome-nickname').textContent = currentUser.username;
            console.log("Showing home screen...");
            showScreen('home-screen');
            console.log("Connecting WebSocket...");
            connectWebSocket(); // Connect WebSocket AFTER basic UI is ready
            console.log("initializeApp finished successfully.");

        } catch (error) {
            console.error("FATAL ERROR during initializeApp:", error);
            showToast("Ein kritischer Fehler ist aufgetreten. Bitte lade die Seite neu.", true);
            showScreen('auth-screen'); // Fallback to auth screen on error
        } finally {
            // This ensures loading overlay is hidden regardless of success or failure within try block
            setLoading(false);
            console.log("initializeApp finally block executed. Loading overlay hidden."); // Debug Log Finally
        }
    };


    const checkSpotifyStatus = async () => {
        spotifyToken = null; // Reset token before check
        try {
            console.log("Fetching /api/status...");
            const response = await fetch('/api/status'); // Use fetch to call backend API
            
            // Check if response is ok (status code 200-299)
            if (!response.ok) {
                console.warn(`Spotify status check failed: Server responded with status ${response.status}`);
                // Throw an error or handle non-OK status specifically if needed
                // throw new Error(`HTTP error! status: ${response.status}`);
            } else {
                const data = await response.json(); // Parse JSON response
                if (data.loggedIn && data.token) {
                    spotifyToken = data.token;
                    console.log("Spotify status: Logged In");
                } else {
                    console.log("Spotify status: Not Logged In");
                }
            }
        } catch (error) {
            // Catch network errors or JSON parsing errors
            console.error("Error during checkSpotifyStatus fetch:", error);
            showToast("Verbindung zu Spotify konnte nicht geprüft werden.", true); // Inform user
        } finally {
             // Update UI based on the final state of spotifyToken
             document.getElementById('spotify-connect-button')?.classList.toggle('hidden', !!spotifyToken);
             elements.home.createRoomBtn?.classList.toggle('hidden', !spotifyToken);
             console.log("Spotify UI buttons updated.");
        }
    };


    const handleAuthAction = async (action, form, isRegister = false) => {
         setLoading(true);
        const usernameInput = form.querySelector('input[type="text"]');
        const passwordInput = form.querySelector('input[type="password"]');
        const username = usernameInput.value;
        const password = passwordInput.value;

        if (!username || !password) { showToast("Benutzername und Passwort dürfen nicht leer sein.", true); setLoading(false); return; }

        console.log(`Attempting ${isRegister ? 'signup' : 'login'} for user: ${username}`);

        try {
            let options = isRegister ? { options: { data: { username: username } } } : {};
            const { data, error } = await action.call(supabase.auth, { email: `${username}@fakester.app`, password, ...options });
            if (error) { console.error('Supabase Auth Error:', error); throw error; }
             console.log(`${isRegister ? 'Signup' : 'Login'} successful for user: ${username}`, data);
             // onAuthStateChange handles calling initializeApp
        } catch (error) {
            let message = "Anmeldung fehlgeschlagen.";
            if (error.message.includes("Invalid login credentials")) message = "Ungültiger Benutzername oder Passwort.";
            else if (error.message.includes("User already registered")) message = "Benutzername bereits vergeben.";
            else if (error.message.includes("Password should be at least 6 characters")) message = "Passwort muss mind. 6 Zeichen lang sein.";
            else message = error.message;
            console.error('Authentication failed:', message);
            showToast(message, true);
        } finally { setLoading(false); }
    };

    const handleLogout = async () => {
         console.log("Logout initiated.");
        setLoading(true);
        if (currentUser?.isGuest) { console.log("Guest logout, reloading page."); window.location.replace(window.location.origin); return; }
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            console.log("Supabase signOut successful.");
            // onAuthStateChange listener will handle UI reset and redirect
        } catch (error) { console.error("Error during logout:", error); showToast("Ausloggen fehlgeschlagen.", true); setLoading(false); }
        // No setLoading(false) needed on success as onAuthStateChange takes over
    };

    // --- Client-Side Achievement Vergabe ---
    const awardClientSideAchievement = async (achievementId) => {
        if (!currentUser || currentUser.isGuest || !supabase || userUnlockedAchievementIds.includes(achievementId)) return;
        console.log(`Awarding client-side achievement: ${achievementId}`);
        userUnlockedAchievementIds.push(achievementId); // Optimistic update
        const achievement = achievementsList.find(a => a.id === achievementId);
        showToast(`Erfolg freigeschaltet: ${achievement?.name || ''}!`);
        renderAchievements(); renderTitles(); renderIcons(); // Update UI
        const { error } = await supabase.from('user_achievements').insert({ user_id: currentUser.id, achievement_id: achievementId });
        if (error) { console.error(`Fehler beim Speichern von Client-Achievement ${achievementId}:`, error); /* Optional: Rollback UI */ }
    };

    // --- WebSocket Functions ---
    const connectWebSocket = () => {
        if(ws.socket && (ws.socket.readyState === WebSocket.OPEN || ws.socket.readyState === WebSocket.CONNECTING)) { console.log("WebSocket connection already open or connecting."); return; }
        if (wsPingInterval) clearInterval(wsPingInterval);
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; const wsUrl = `${wsProtocol}//${window.location.host}`; console.log(`Attempting to connect WebSocket to: ${wsUrl}`);
        try { ws.socket = new WebSocket(wsUrl); } catch (error) { console.error("WebSocket creation failed:", error); showToast("Verbindung zum Server konnte nicht aufgebaut werden.", true); return; }
        ws.socket.onopen = () => { console.info('✅ WebSocket connection established.'); if (currentUser && !currentUser.isGuest) { console.log(`Registering user ${currentUser.id} with WebSocket server.`); ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id } })); } const storedGame = JSON.parse(localStorage.getItem('fakesterGame')); if (storedGame && currentUser && storedGame.playerId === currentUser.id) { console.log("Found stored game, attempting to reconnect:", storedGame); currentGame = storedGame; showToast('Verbinde erneut mit dem Spiel...'); ws.socket.send(JSON.stringify({ type: 'reconnect', payload: { pin: currentGame.pin, playerId: currentGame.playerId } })); } else if (storedGame) { console.warn("Found stored game for a different user, removing."); localStorage.removeItem('fakesterGame'); } wsPingInterval = setInterval(() => { if (ws.socket?.readyState === WebSocket.OPEN) { /* console.debug("Sending WebSocket ping"); ws.socket.send(JSON.stringify({ type: 'ping' })); */ } else { console.warn("WebSocket not open, clearing ping interval."); clearInterval(wsPingInterval); wsPingInterval = null; } }, 30000); };
        ws.socket.onmessage = (event) => { try { const data = JSON.parse(event.data); /* if (data.type === 'pong') { console.debug("Received WebSocket pong"); return; } */ handleWebSocketMessage(data); } catch (error) { console.error('Error processing WebSocket message:', error, event.data); } };
        ws.socket.onclose = (event) => { console.warn(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`); if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null; if (!document.getElementById('auth-screen')?.classList.contains('active')) { console.log("Attempting WebSocket reconnect in 5 seconds..."); setTimeout(connectWebSocket, 5000); } };
        ws.socket.onerror = (errorEvent) => { console.error('WebSocket error:', errorEvent); showToast("WebSocket-Verbindungsfehler.", true); ws.socket?.close(); };
    };
    const handleWebSocketMessage = ({ type, payload }) => { console.log(`Processing WebSocket message: Type=${type}`, payload); if (type !== 'round-countdown') elements.countdownOverlay.classList.add('hidden'); switch (type) { case 'game-created': case 'join-success': setLoading(false); currentGame = { ...currentGame, pin: payload.pin, playerId: payload.playerId, isHost: payload.isHost, gameMode: payload.gameMode }; localStorage.setItem('fakesterGame', JSON.stringify(currentGame)); if (currentGame.isHost) { fetchHostData(); } elements.joinModal.overlay.classList.add('hidden'); showScreen('lobby-screen'); break; case 'lobby-update': elements.lobby.pinDisplay.textContent = payload.pin; renderPlayerList(payload.players, payload.hostId); updateHostSettings(payload.settings, currentGame.isHost); break; case 'reconnect-to-game': setLoading(false); console.log("Reconnected mid-game, showing game screen."); showScreen('game-screen'); /* TODO: Request current game state from server */ break; case 'game-starting': showScreen('game-screen'); setupPreRound(payload); break; case 'round-countdown': setLoading(false); showCountdown(payload.round, payload.totalRounds); break; case 'new-round': setLoading(false); showScreen('game-screen'); setupNewRound(payload); break; case 'round-result': showRoundResult(payload); break; case 'game-over': localStorage.removeItem('fakesterGame'); const myFinalScore = payload.scores.find(s => s.id === currentUser?.id)?.score || 0; showToast(`Spiel vorbei! Du hast ${myFinalScore} XP erhalten!`); if (!currentUser?.isGuest) { updatePlayerProgress(myFinalScore); } setTimeout(() => { screenHistory = ['auth-screen', 'home-screen']; showScreen('home-screen'); }, 7000); break; case 'invite-received': showInvitePopup(payload.from, payload.pin); break; case 'friend-request-received': showToast(`Du hast eine Freundschaftsanfrage von ${payload.from}!`); if (!elements.friendsModal.overlay.classList.contains('hidden')) { loadFriendsData(); } else { const countEl = elements.friendsModal.requestsCount; const currentCount = parseInt(countEl.textContent || '0'); countEl.textContent = currentCount + 1; countEl.classList.remove('hidden'); } break; case 'toast': setLoading(false); showToast(payload.message, payload.isError); break; case 'error': setLoading(false); showToast(payload.message, true); pinInput = ""; document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = ""); if (!elements.joinModal.overlay?.classList.contains('hidden')) { elements.joinModal.overlay.classList.add('hidden'); } break; default: console.warn(`Unhandled WebSocket message type: ${type}`); } };

    // --- UI Rendering Functions ---
    function renderPlayerList(players, hostId) { const playerList = elements.lobby.playerList; if (!playerList) return; const existingPlayerIds = new Set([...playerList.querySelectorAll('.player-card')].map(el => el.dataset.playerId)); const incomingPlayerIds = new Set(players.map(p => p.id)); existingPlayerIds.forEach(id => { if (!incomingPlayerIds.has(id)) { playerList.querySelector(`[data-player-id="${id}"]`)?.remove(); } }); players.forEach(player => { let card = playerList.querySelector(`[data-player-id="${player.id}"]`); if (!card) { card = document.createElement('div'); card.dataset.playerId = player.id; card.classList.add('player-card', 'new'); playerList.appendChild(card); setTimeout(() => card.classList.remove('new'), 500); } const isHost = player.id === hostId; card.className = `player-card ${!player.isConnected ? 'disconnected' : ''} ${isHost ? 'host' : ''}`; card.innerHTML = `<i class="fa-solid fa-user player-icon ${isHost ? 'host' : ''}"></i><span class="player-name">${player.nickname}</span>`; }); }
    function updateHostSettings(settings, isHost) { if (!elements.lobby.hostSettings || !elements.lobby.guestWaitingMessage) return; elements.lobby.hostSettings.classList.toggle('hidden', !isHost); elements.lobby.guestWaitingMessage.classList.toggle('hidden', isHost); if (!isHost || !settings) return; elements.lobby.answerTypeContainer.classList.toggle('hidden', currentGame.gameMode !== 'quiz'); ['song-count-presets', 'guess-time-presets', 'answer-type-presets', 'lives-count-presets'].forEach(id => { const container = document.getElementById(id); if(!container) return; let valueToMatch, settingKey; if (id.includes('song')) { valueToMatch = settings.songCount; settingKey = 'songCount'; } else if (id.includes('time')) { valueToMatch = settings.guessTime; settingKey = 'guessTime'; } else if (id.includes('answer')) { valueToMatch = settings.answerType; settingKey = 'answerType'; } else if (id.includes('lives')) { valueToMatch = settings.lives; settingKey = 'lives'; } let customButton = container.querySelector('[data-value="custom"]'); let matchFound = false; container.querySelectorAll('.preset-button').forEach(btn => { const isActive = btn.dataset.value == valueToMatch; btn.classList.toggle('active', isActive); if(isActive) matchFound = true; if(customButton && btn === customButton && !isActive) { customButton.textContent = 'Custom'; } /* Reset custom text if not active */ }); if (!matchFound && customButton) { customButton.classList.add('active'); customButton.textContent = valueToMatch + (settingKey === 'guessTime' ? 's' : ''); } else if (customButton && !customButton.classList.contains('active')) { customButton.textContent = 'Custom'; } }); elements.lobby.deviceSelectBtn.textContent = settings.deviceName || 'Gerät auswählen'; elements.lobby.playlistSelectBtn.textContent = settings.playlistName || 'Playlist auswählen'; elements.lobby.startGameBtn.disabled = !(settings.deviceId && settings.playlistId); }
    function renderAchievements() { if (!elements.achievements.grid) return; elements.achievements.grid.innerHTML = achievementsList.map(a => `<div class="stat-card ${!userUnlockedAchievementIds.includes(a.id) ? 'locked' : ''}"><span class="stat-value">${a.name}</span><span class="stat-label">${a.description}</span></div>`).join(''); }
    async function equipTitle(titleId, saveToDb = true) { const title = titlesList.find(t => t.id === titleId); if (title) { console.log(`Equipping title: ${title.name} (ID: ${titleId}), Save: ${saveToDb}`); document.getElementById('profile-title').textContent = title.name; userProfile.equipped_title_id = titleId; if (saveToDb && !currentUser.isGuest) { console.log(`Saving title ${titleId} to DB for user ${currentUser.id}`); const { error } = await supabase.from('profiles').update({ equipped_title_id: titleId }).eq('id', currentUser.id); if (error) { console.error("Failed to save title:", error); showToast("Titel konnte nicht gespeichert werden.", true); } else { console.log("Title saved successfully."); } } } else { console.warn(`Title ID ${titleId} not found.`); } renderTitles(); }
    function renderTitles() { if (!elements.titles.list) return; const currentLevel = getLevelForXp(userProfile.xp || 0); const equippedTitleId = userProfile.equipped_title_id || 1; const unlockedTitleCount = titlesList.filter(t => isItemUnlocked(t, currentLevel)).length; elements.titles.list.innerHTML = titlesList.map(t => { const isUnlocked = isItemUnlocked(t, currentLevel); const isEquipped = t.id === equippedTitleId; const unlockDescription = getUnlockDescription(t); if (unlockedTitleCount >= 5 && !userUnlockedAchievementIds.includes(15)) { awardClientSideAchievement(15); } return `<div class="title-card ${isEquipped ? 'equipped' : ''} ${!isUnlocked ? 'locked' : ''}" data-title-id="${t.id}" ${!isUnlocked ? 'disabled' : ''}><span class="stat-value">${t.name}</span><span class="stat-label">${isUnlocked ? 'Freigeschaltet' : unlockDescription}</span></div>`; }).join(''); }
    async function equipIcon(iconId, saveToDb = true) { const icon = iconsList.find(i => i.id === iconId); if(icon){ console.log(`Equipping icon: ${icon.iconClass} (ID: ${iconId}), Save: ${saveToDb}`); elements.home.profileIcon.className = `fa-solid ${icon.iconClass}`; userProfile.equipped_icon_id = iconId; if (saveToDb && !currentUser.isGuest) { console.log(`Saving icon ${iconId} to DB for user ${currentUser.id}`); const { error } = await supabase.from('profiles').update({ equipped_icon_id: iconId }).eq('id', currentUser.id); if (error) { console.error("Failed to save icon:", error); showToast("Icon konnte nicht gespeichert werden.", true); } else { console.log("Icon saved successfully."); } } } else { console.warn(`Icon ID ${iconId} not found.`); } renderIcons(); }
    function renderIcons() { if (!elements.icons.list) return; const currentLevel = getLevelForXp(userProfile.xp || 0); const equippedIconId = userProfile.equipped_icon_id || 1; const unlockedIconCount = iconsList.filter(i => isItemUnlocked(i, currentLevel)).length; elements.icons.list.innerHTML = iconsList.map(icon => { const isUnlocked = isItemUnlocked(icon, currentLevel); const isEquipped = icon.id === equippedIconId; if (unlockedIconCount >= 5 && !userUnlockedAchievementIds.includes(16)) { awardClientSideAchievement(16); } return `<div class="icon-card ${!isUnlocked ? 'locked' : ''} ${isEquipped ? 'equipped' : ''}" data-icon-id="${icon.id}" ${!isUnlocked ? 'disabled' : ''}><div class="icon-preview"><i class="fa-solid ${icon.iconClass}"></i></div><span class="stat-label">${isUnlocked ? 'Verfügbar' : icon.description}</span></div>`; }).join(''); }
    function renderLevelProgress() { if (!elements.levelProgress.list) return; const MAX_LEVEL = 50; const currentLevel = getLevelForXp(userProfile.xp || 0); let html = ''; for (let level = 1; level <= MAX_LEVEL; level++) { const xpNeeded = getXpForLevel(level); const isUnlocked = currentLevel >= level; const titles = titlesList.filter(t => t.unlockType === 'level' && t.unlockValue === level); const icons = iconsList.filter(i => i.unlockType === 'level' && i.unlockValue === level); if (titles.length === 0 && icons.length === 0 && level > 1) continue; html += `<div class="level-progress-item ${isUnlocked ? 'unlocked' : ''}"><div class="level-progress-header"><h3>Level ${level}</h3><span>${xpNeeded} XP</span></div><div class="level-progress-rewards">${titles.map(t => `<div class="reward-item"><i class="fa-solid fa-star"></i><span>Titel: ${t.name}</span></div>`).join('')}${icons.map(i => `<div class="reward-item"><i class="fa-solid ${i.iconClass}"></i><span>Icon: ${i.description}</span></div>`).join('')}</div></div>`; } elements.levelProgress.list.innerHTML = html; }
    function updatePlayerProgressDisplay() { if (!currentUser || !userProfile || currentUser.isGuest) return; const currentXp = userProfile.xp || 0; const currentLevel = getLevelForXp(currentXp); const xpForCurrentLevel = getXpForLevel(currentLevel); const xpForNextLevel = getXpForLevel(currentLevel + 1); const xpInCurrentLevel = currentXp - xpForCurrentLevel; const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel; const xpPercentage = (xpNeededForNextLevel > 0) ? Math.max(0, Math.min(100, (xpInCurrentLevel / xpNeededForNextLevel) * 100)) : 100; elements.home.profileLevel.textContent = currentLevel; elements.home.profileXpFill.style.width = `${xpPercentage}%`; if (elements.home.profileXpText) { elements.home.profileXpText.textContent = `${currentXp} XP`; } console.log(`Updated progress display: Level ${currentLevel}, XP ${currentXp}, Bar ${xpPercentage.toFixed(1)}%`); }
    async function updatePlayerProgress(xpGained, showNotification = true) { if (!currentUser || currentUser.isGuest) return; console.log(`Updating player progress post-game. XP Gained: ${xpGained}, Show Notification: ${showNotification}`); const oldLevel = getLevelForXp(userProfile.xp || 0); console.log("Fetching latest profile data for progress update..."); const { data, error } = await supabase.from('profiles').select('xp, games_played, wins, correct_answers, highscore').eq('id', currentUser.id).single(); if (error) { console.error("Error fetching profile data after game:", error); updatePlayerProgressDisplay(); return; } console.log("Latest profile data fetched:", data); userProfile = { ...userProfile, ...data }; console.log("Fetching updated achievements..."); const { data: achievements, error: achError } = await supabase.from('user_achievements').select('achievement_id').eq('user_id', currentUser.id); if (achError) { console.error("Error fetching updated achievements:", achError); } else { userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id)); console.log("Updated achievements:", userUnlockedAchievementIds); } updatePlayerProgressDisplay(); updateStatsDisplay(); const newLevel = getLevelForXp(userProfile.xp || 0); console.log(`Old Level: ${oldLevel}, New Level: ${newLevel}`); if (showNotification && newLevel > oldLevel) { console.info(`Level Up! ${oldLevel} -> ${newLevel}`); showToast(`Level Up! Du hast Level ${newLevel} erreicht!`); renderIcons(); renderTitles(); renderLevelProgress(); } renderAchievements(); console.log("Player progress update complete."); }
    function updateStatsDisplay() { if (!currentUser || currentUser.isGuest || !userProfile) return; const { games_played, wins, highscore, correct_answers } = userProfile; const gp = games_played || 0; const w = wins || 0; const hs = highscore || 0; const ca = correct_answers || 0; const xp = userProfile.xp || 0; elements.stats.gamesPlayed.textContent = gp; elements.stats.wins.textContent = w; elements.stats.winrate.textContent = gp > 0 ? `${Math.round((w / gp) * 100)}%` : '0%'; elements.stats.highscore.textContent = hs; elements.stats.correctAnswers.textContent = ca; elements.stats.avgScore.textContent = gp > 0 ? Math.round(xp / gp) : 0; elements.stats.gamesPlayedPreview.textContent = gp; elements.stats.winsPreview.textContent = w; elements.stats.correctAnswersPreview.textContent = ca; }

    // --- Game Logic Functions ---
    // ... (showCountdown, setupPreRound, setupNewRound, showRoundResult) ...
    // --- Friends Modal Logic ---
    // ... (loadFriendsData, renderRequestsList, renderFriendsList) ...
    // --- Utility & Modal Functions ---
    // ... (fetchHostData, renderPaginatedPlaylists, openCustomValueModal, showInvitePopup) ...

    // #################################################################
    // ### DER EVENT LISTENER BLOCK ### (Gekürzt für Lesbarkeit, voller Code oben)
    // #################################################################
    function addEventListeners() { console.log("Adding all application event listeners..."); /* ... Alle Listener ... */

        // Event Listener für Konsolen-Buttons
        toggleConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.toggle('hidden'));
        closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
        clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
        copyConsoleBtn?.addEventListener('click', () => { if (!consoleOutput) return; const logText = Array.from(consoleOutput.children).map(entry => entry.dataset.rawText || entry.textContent).join('\n'); navigator.clipboard.writeText(logText).then(() => { showToast('Logs kopiert!', false); }).catch(err => { console.error('Fehler beim Kopieren der Logs:', err); showToast('Kopieren fehlgeschlagen.', true); }); });

        console.log("All event listeners added."); }


    // #################################################################
    // ### SUPABASE INITIALISIERUNG ###
    // #################################################################
    async function initializeSupabase() {
        try {
            console.log("Fetching /api/config...");
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error(`Failed to fetch config: ${response.statusText}`);
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) { throw new Error("Supabase URL or Anon Key is missing from config."); }

            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { global: { fetch: (...args) => window.fetch(...args) }, /* auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } */ });
            console.log("Supabase client initialized successfully.");

            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`Supabase Auth Event: ${event}`, session ? { userId: session.user.id } : 'No session');

                if (event === 'SIGNED_OUT') {
                    currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null;
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { console.log("Closing WebSocket due to SIGNED_OUT."); ws.socket.close(); }
                    if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null;
                    localStorage.removeItem('fakesterGame'); screenHistory = ['auth-screen']; showScreen('auth-screen'); document.body.classList.add('is-guest'); setLoading(false);
                    return;
                }

                if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session?.user) {
                     if (!currentUser || currentUser.id !== session.user.id || event === 'SIGNED_IN') { // Initialize on SIGNED_IN or if user changes
                          console.log(`Session available/updated for user ${session.user.id}. Initializing app...`);
                          setLoading(true);
                          await initializeApp(session.user, false); // await is important here
                     } else if (event === 'TOKEN_REFRESHED') {
                          console.log("Token refreshed, checking Spotify status again.");
                          await checkSpotifyStatus(); // Only re-check Spotify on refresh
                     } else {
                          console.log("App already initialized for this user session.");
                          // Ensure loading is off if somehow it was left on
                          setLoading(false);
                     }
                } else if (!session && event !== 'USER_UPDATED' && event !== 'PASSWORD_RECOVERY') { // Ignore events that don't imply logout without session
                     console.log("No active session or session invalid. Showing auth screen.");
                     if (currentUser) { // If user was logged in before
                          currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null;
                          if (ws.socket && ws.socket.readyState === WebSocket.OPEN) ws.socket.close(); if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null;
                          localStorage.removeItem('fakesterGame');
                     }
                     screenHistory = ['auth-screen']; showScreen('auth-screen'); document.body.classList.add('is-guest'); setLoading(false);
                }
            });

            // Initial call might be handled by INITIAL_SESSION, but check just in case
            const { data: { session: initialSession } } = await supabase.auth.getSession();
             if (!initialSession && !document.getElementById('auth-screen').classList.contains('active')) {
                  console.log("Initial check: No session found, ensuring auth screen is displayed.");
                  showScreen('auth-screen');
                  setLoading(false);
             } else if (!initialSession) {
                 // If auth screen is already active, just make sure loading is off
                 setLoading(false);
             }
             // If initialSession exists, onAuthStateChange(INITIAL_SESSION) will handle initializeApp

            addEventListeners();

        } catch (error) {
            console.error("FATAL ERROR during Supabase initialization:", error);
            document.body.innerHTML = `<div class="fatal-error"><h1>Initialisierungsfehler</h1><p>Die Anwendung konnte nicht geladen werden. Bitte versuche es später erneut.</p><p class="error-details">Fehler: ${error.message}</p></div>`;
            setLoading(false);
        }
    }


    // --- Main Execution ---
    initializeSupabase(); // Start the initialization process
});
