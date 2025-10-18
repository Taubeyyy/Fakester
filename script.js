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
            consoleOutput.appendChild(errorEntry);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
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
        { id: 14, name: 'Sozial vernetzt', description: 'Füge deinen ersten Freund hinzu.' }, // Server TODO (beim Akzeptieren)
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
        { id: 16, name: 'Icon-Liebhaber', unlockType: 'achievement', unlockValue: 16 }, // Achievement für Icons
        { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon' }
    ];

    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

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
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: {
            overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'),
            addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'),
            friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'),
            requestsCount: document.getElementById('requests-count'), tabs: document.querySelectorAll('.friends-modal .tab-button'),
            tabContents: document.querySelectorAll('.friends-modal .tab-content')
        },
        inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list') },
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')},
        achievements: { grid: document.getElementById('achievement-grid') },
        levelProgress: { list: document.getElementById('level-progress-list') }, // NEU
        titles: { list: document.getElementById('title-list') },
        icons: { list: document.getElementById('icon-list') },
        gameTypeScreen: {
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
            gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'),
            highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'),
            gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'),
        }
    };

    const showToast = (message, isError = false) => {
        console.log(`Toast: ${message} (Error: ${isError})`); // Logge Toasts
        Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    }
    const showScreen = (screenId) => {
        console.log(`Navigating to screen: ${screenId}`); // Logge Screenwechsel
        const currentScreen = screenHistory[screenHistory.length - 1];
        if (screenId !== currentScreen) screenHistory.push(screenId);
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
        const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };
    const goBack = () => {
        if (screenHistory.length > 1) {
            screenHistory.pop();
            const previousScreenId = screenHistory[screenHistory.length - 1];
             console.log(`Navigating back to screen: ${previousScreenId}`);
            elements.screens.forEach(s => s.classList.remove('active'));
            document.getElementById(previousScreenId)?.classList.add('active');
            const showLeaveButton = !['auth-screen', 'home-screen'].includes(previousScreenId);
            elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
        }
    };
    const setLoading = (isLoading) => {
        console.log(`Setting loading overlay: ${isLoading}`); // Logge Ladezustand
        elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    }

    // NEU: Allgemeines Bestätigungs-Modal
    const showConfirmModal = (title, text, onConfirm) => {
        elements.confirmActionModal.title.textContent = title;
        elements.confirmActionModal.text.textContent = text;
        currentConfirmAction = onConfirm; // Speichere die Callback-Funktion
        elements.confirmActionModal.overlay.classList.remove('hidden');
    };

    // Hilfsfunktionen (am besten oben bei den anderen Hilfsfunktionen einfügen)
    function isItemUnlocked(item, currentLevel) {
        if (!item || currentUser?.isGuest) return false;
        if (currentUser.username.toLowerCase() === 'taubey') return true; // Entwickler schaltet alles frei

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

    // Clientseitige Achievements verleihen (nur die einfachen)
    async function awardClientSideAchievement(achievementId) {
        if (currentUser.isGuest || userUnlockedAchievementIds.includes(achievementId)) return;

        console.info(`Versuche, Achievement ${achievementId} clientseitig zu verleihen.`);
        const { error } = await supabase
            .from('user_achievements')
            .insert({ user_id: currentUser.id, achievement_id: achievementId }); // Deine Spaltennamen

        if (error && error.code !== '23505') { // 23505 = unique constraint violation (schon vorhanden)
            console.error(`Fehler beim Speichern von Achievement ${achievementId}:`, error);
        } else if (!error) {
            console.info(`Achievement ${achievementId} clientseitig verliehen!`);
            userUnlockedAchievementIds.push(achievementId);
            showToast(`Neuer Erfolg freigeschaltet: ${achievementsList.find(a => a.id === achievementId)?.name || ''}!`);
            renderAchievements(); // UI aktualisieren
            renderTitles();       // Titel könnten jetzt freigeschaltet sein
            renderIcons();        // Icons könnten jetzt freigeschaltet sein
        }
    }

    // Angepasste initializeApp mit mehr Logging
    const initializeApp = async (user, isGuest = false) => {
        console.log(`initializeApp called for user: ${user.username || user.id}, isGuest: ${isGuest}`);
        localStorage.removeItem('fakesterGame'); // Sicherheitshalber
        setLoading(true);
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
                equipTitle(userProfile.equipped_title_id || 1, false); // Beim Start nicht erneut in DB speichern
                equipIcon(userProfile.equipped_icon_id || 1, false); // Beim Start nicht erneut in DB speichern
                console.log("Title and icon equipped.");

                console.log("Updating player progress display...");
                updatePlayerProgress(0, false); // Initialisiere Anzeige mit 0 XP Zuwachs
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
            // Wichtig: Supabase erwartet 'email', auch wenn wir nur Username nutzen
            const { data, error } = await action({ email: `${username}@fakester.app`, password, ...options });

            if (error) {
                console.error('Supabase Auth Error:', error);
                throw error; // Wirft den Fehler, um im catch-Block behandelt zu werden
            }
             console.log(`${isRegister ? 'Signup' : 'Login'} successful for user: ${username}`, data);
            // Erfolg wird vom onAuthStateChange-Handler verarbeitet, der setLoading(false) aufruft
        } catch (error) {
            // Fehlerbehandlung
            let message = "Anmeldung fehlgeschlagen.";
            if (error.message.includes("Invalid login credentials")) {
                message = "Ungültiger Benutzername oder Passwort.";
            } else if (error.message.includes("User already registered")) {
                message = "Benutzername bereits vergeben.";
            } else if (error.message.includes("Password should be at least 6 characters")) {
                 message = "Passwort muss mind. 6 Zeichen lang sein.";
            } else {
                 message = error.message; // Zeige generische Supabase-Fehler an
            }
            console.error('Authentication failed:', message);
            showToast(message, true);
            setLoading(false); // Lade-Overlay bei Fehler ausblenden
        }
    };
    const handleLogout = async () => {
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
            // onAuthStateChange übernimmt den Rest
        } catch (error) {
            console.error("Error during logout:", error);
            showToast("Ausloggen fehlgeschlagen.", true);
             setLoading(false); // Lade-Overlay bei Fehler ausblenden
        }
    };


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
             console.log("WebSocket message received:", event.data);
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
            }, 3000);
        };
        ws.socket.onerror = (error) => {
             console.error('WebSocket error:', error);
        };
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`Processing WebSocket message: Type=${type}`, payload);
        setLoading(false); // Assume most messages mean loading is done
        if (type !== 'round-countdown') elements.countdownOverlay.classList.add('hidden');

        switch (type) {
            case 'game-created':
            case 'join-success':
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
            case 'game-starting':
                showScreen('game-screen');
                setupPreRound(payload);
                break;
            case 'round-countdown':
                showCountdown(payload.round, payload.totalRounds);
                break;
            case 'new-round':
                showScreen('game-screen');
                setupNewRound(payload);
                break;
            case 'round-result':
                showRoundResult(payload);
                break;
            case 'game-over':
                localStorage.removeItem('fakesterGame');
                const myFinalScore = payload.scores.find(s => s.id === currentUser.id)?.score || 0;
                showToast(`Spiel vorbei! Du hast ${myFinalScore} XP erhalten!`);
                updatePlayerProgress(myFinalScore); // Fetch updated stats from DB
                setTimeout(() => {
                    screenHistory = ['home-screen']; // Reset history
                    showScreen('home-screen');
                }, 5000);
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
                showToast(payload.message, payload.isError);
                break;
            case 'error':
                showToast(payload.message, true);
                pinInput = "";
                document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = "");
                 if (elements.joinModal.overlay?.classList.contains('active')) { // Close join modal on error
                    elements.joinModal.overlay.classList.add('hidden');
                 }
                break;
            default:
                 console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    };

    // ... (Rest der Funktionen wie renderPlayerList, updateHostSettings, etc. bleiben gleich) ...
    // ... Stellen Sie sicher, dass alle anderen Funktionen von oben hier eingefügt sind ...

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


    async function equipIcon(iconId, saveToDb = true) {
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

    async function updatePlayerProgress(xpGained, showNotification = true) {
        if (currentUser.isGuest) return;
        console.log(`Updating player progress. XP Gained: ${xpGained}, Show Notification: ${showNotification}`);

        // Hole die aktuellsten Daten aus der DB
        console.log("Fetching latest profile data for progress update...");
        const { data, error } = await supabase
            .from('profiles')
            .select('xp, games_played, wins, correct_answers, highscore')
            .eq('id', currentUser.id)
            .single();

        if (error) {
            console.error("Error fetching profile data for progress update:", error);
            return;
        }
        console.log("Latest profile data fetched:", data);

        const oldLevel = getLevelForXp(userProfile.xp); // Level vor dem Update
        userProfile = data; // Lokales Profil komplett aktualisieren mit den neuesten Daten
        const currentXp = userProfile.xp || 0; // Sicherstellen, dass XP eine Zahl ist
        const newLevel = getLevelForXp(currentXp);

        console.log(`Old Level: ${oldLevel}, New Level: ${newLevel}, Current XP: ${currentXp}`);

        const xpForCurrentLevel = getXpForLevel(newLevel);
        const xpForNextLevel = getXpForLevel(newLevel + 1);
        const xpInCurrentLevel = currentXp - xpForCurrentLevel;
        const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
        // Handle division by zero or NaN if xpNeededForNextLevel is 0 (e.g., at max level if formula allows it)
        const xpPercentage = (xpNeededForNextLevel > 0)
            ? Math.max(0, Math.min(100, (xpInCurrentLevel / xpNeededForNextLevel) * 100))
            : 100; // Assume 100% if next level requires 0 XP

        console.log(`XP towards next level: ${xpInCurrentLevel}/${xpNeededForNextLevel} (${xpPercentage.toFixed(2)}%)`);

        elements.home.profileLevel.textContent = newLevel;
        elements.home.profileXpFill.style.width = `${xpPercentage}%`;
        // NEU: XP Text anzeigen
        if (elements.home.profileXpText) {
             elements.home.profileXpText.textContent = `${currentXp} XP`;
        }


        // Stats auch aktualisieren
        updateStatsDisplay();

        if (showNotification && newLevel > oldLevel) {
            console.info(`Level Up! ${oldLevel} -> ${newLevel}`);
            showToast(`Level Up! Du hast Level ${newLevel} erreicht!`);
            // UI neu rendern, da sich Freischaltungen geändert haben könnten
            renderIcons();
            renderTitles();
            renderLevelProgress();
        }
         console.log("Player progress update complete.");
    }

     // =========================================================================================
    // MAIN APP INITIALIZATION AND EVENT LISTENERS
    // =========================================================================================
    const main = async () => {
         console.log("DOM Loaded, starting main function.");
        try {
             console.log("Fetching API config...");
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error(`Konfiguration konnte nicht geladen werden. Status: ${response.status}`);
            }
            const config = await response.json();
             console.log("API config fetched:", config);
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
             console.log("Supabase client created.");

            // --- Event Listeners ---
             console.log("Adding main event listeners...");
            document.body.addEventListener('click', async (e) => {
                const target = e.target;
                // ... (Alle deine Clicks wie #leave-game-button, #confirm-action-cancel-button etc.)
                 if (target.closest('#leave-game-button')) {
                    const inGame = document.getElementById('lobby-screen').classList.contains('active') || document.getElementById('game-screen').classList.contains('active');
                    if (inGame) {
                        elements.leaveConfirmModal.overlay.classList.remove('hidden');
                    } else {
                        goBack();
                    }
                }
                if (target.closest('#confirm-leave-button')) {
                    localStorage.removeItem('fakesterGame');
                    window.location.reload();
                }
                if (target.closest('#cancel-leave-button')) {
                    elements.leaveConfirmModal.overlay.classList.add('hidden');
                }

                // NEU: Bestätigungs-Modal-Handler
                if (target.closest('#confirm-action-cancel-button')) {
                    elements.confirmActionModal.overlay.classList.add('hidden');
                    currentConfirmAction = null;
                }
                if (target.closest('#confirm-action-confirm-button')) {
                    if (typeof currentConfirmAction === 'function') {
                         console.log("Executing confirmed action.");
                        try {
                             await currentConfirmAction(); // Führe die gespeicherte Aktion aus
                        } catch (error) {
                             console.error("Error executing confirmed action:", error);
                             showToast("Aktion fehlgeschlagen.", true);
                        }
                    } else {
                         console.warn("Confirm button clicked but no action stored.");
                    }
                    elements.confirmActionModal.overlay.classList.add('hidden');
                    currentConfirmAction = null;
                }
                 // ... (Rest der Click-Handler) ...
                 // --- Freunde-Modal-Logik ---
                if (target.closest('#friends-button')) {
                    loadFriendsData(); // Echte Daten laden
                    elements.friendsModal.overlay.classList.remove('hidden');
                    elements.friendsModal.tabs[0].click(); // Ersten Tab aktiv schalten
                }
                if (target.closest('#close-friends-modal-button')) elements.friendsModal.overlay.classList.add('hidden');

                const tabBtn = target.closest('.friends-modal .tab-button');
                if(tabBtn) {
                    elements.friendsModal.tabs.forEach(t => t.classList.remove('active'));
                    tabBtn.classList.add('active');
                    elements.friendsModal.tabContents.forEach(c => c.classList.remove('active'));
                    document.getElementById(tabBtn.dataset.tab).classList.add('active');
                }

                if (target.closest('#add-friend-button')) {
                    const friendName = elements.friendsModal.addFriendInput.value.trim();
                    if(friendName.length < 3) return showToast('Name ist zu kurz.', true);
                    if(currentUser && friendName.toLowerCase() === currentUser.username.toLowerCase()) return showToast('Du kannst dich nicht selbst hinzufügen.', true);

                    ws.socket.send(JSON.stringify({ type: 'add-friend', payload: { friendName }}));
                    elements.friendsModal.addFriendInput.value = '';
                }

                const acceptBtn = target.closest('.accept-request');
                if(acceptBtn) {
                    const senderId = acceptBtn.dataset.senderId;
                    ws.socket.send(JSON.stringify({ type: 'accept-friend-request', payload: { senderId: senderId }}));
                    acceptBtn.closest('li').remove(); // Optimistic UI update
                     // Update badge count
                    const countEl = elements.friendsModal.requestsCount;
                    const currentCount = parseInt(countEl.textContent || '0');
                    const newCount = Math.max(0, currentCount - 1);
                    countEl.textContent = newCount;
                    if (newCount === 0) countEl.classList.add('hidden');
                }

                const declineBtn = target.closest('.decline-request');
                if(declineBtn) {
                    const senderId = declineBtn.dataset.senderId;
                    const senderName = declineBtn.dataset.senderName || 'diesem Benutzer';
                    showConfirmModal('Anfrage ablehnen?', `Möchtest du die Freundschaftsanfrage von ${senderName} wirklich ablehnen?`, async () => {
                        ws.socket.send(JSON.stringify({ type: 'decline-friend-request', payload: { userId: senderId }}));
                        declineBtn.closest('li').remove(); // Optimistic UI update
                         // Update badge count
                        const countEl = elements.friendsModal.requestsCount;
                        const currentCount = parseInt(countEl.textContent || '0');
                        const newCount = Math.max(0, currentCount - 1);
                        countEl.textContent = newCount;
                        if (newCount === 0) countEl.classList.add('hidden');
                    });
                }

                const removeBtn = target.closest('.remove-friend');
                if(removeBtn) {
                    const friendId = removeBtn.dataset.friendId;
                    const friendName = removeBtn.dataset.friendName || 'diesen Freund';
                    showConfirmModal('Freund entfernen?', `Möchtest du ${friendName} wirklich aus deiner Freundesliste entfernen?`, async () => {
                        ws.socket.send(JSON.stringify({ type: 'remove-friend', payload: { friendId: friendId }}));
                        removeBtn.closest('li').remove(); // Optimistic UI update
                    });
                }
                // --- Ende Freunde-Modal-Logik ---
                 // NEU: Klick auf Level-Balken
                if (target.closest('#level-progress-button')) {
                    if (currentUser && !currentUser.isGuest) showScreen('level-progress-screen');
                }
                 // ... Rest der Click Handler ...
                 if (target.closest('#corner-logout-button')) handleLogout();
                 if (target.closest('#achievements-button')) showScreen('achievements-screen');
                 if (target.closest('#stats-button')) showScreen('stats-screen');
                 if (target.closest('#show-create-button-action')) showScreen('mode-selection-screen');

                 const titleCard = target.closest('.title-card:not(.locked)'); // Nur klickbar wenn nicht locked
                if (titleCard) equipTitle(parseInt(titleCard.dataset.titleId));

                const iconCard = target.closest('.icon-card:not(.locked)'); // Nur klickbar wenn nicht locked
                if (iconCard) equipIcon(parseInt(iconCard.dataset.iconId));


            });
             console.log("Main event listeners added.");

             // --- Auth Handler ---
             console.log("Setting up Supabase auth state change listener...");
            supabase.auth.onAuthStateChange(async (event, session) => {
                 console.log(`Auth state changed: Event=${event}`, session ? `Session User ID=${session.user.id}`: 'No session');
                setLoading(true); // Ladebildschirm AN bei JEDER Auth-Änderung

                if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) {
                    // User ist eingeloggt oder hat sich gerade registriert/eingeloggt
                     console.log("User is logged in or session initialized.");
                    if (!currentUser || currentUser.id !== session.user.id || event === 'USER_UPDATED') {
                         console.log("Initializing app for logged-in user...");
                       await initializeApp(session.user); // Ruft setLoading(false) am Ende auf
                    } else {
                         console.log("User already initialized, skipping initializeApp.");
                       setLoading(false); // War schon initialisiert, Ladebildschirm aus
                    }
                } else if (event === 'SIGNED_OUT' || !session) {
                    // User ist ausgeloggt oder hat keine Sitzung
                     console.log("User is logged out or no session found.");
                    currentUser = null;
                    userProfile = {}; // Reset profile data
                    userUnlockedAchievementIds = [];
                    if (event === 'SIGNED_OUT') {
                         console.log("Clearing localStorage due to explicit SIGNED_OUT event.");
                        localStorage.clear(); // Nur bei explizitem Logout alles löschen
                    }
                    screenHistory = ['auth-screen']; // Reset navigation history
                    showScreen('auth-screen');
                    setLoading(false);
                } else {
                    // Fallback, sollte selten passieren (z.B. TOKEN_REFRESHED)
                     console.log(`Unhandled auth event '${event}', hiding loading overlay.`);
                     setLoading(false);
                }
            });
             console.log("Supabase auth listener set up.");

             // --- Andere Event Listener ---
             elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget, false); });
             elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget, true); });
             elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
             elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
             document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!ws.socket || ws.socket.readyState === WebSocket.CLOSED)) { console.log("Tab became visible, checking WebSocket connection."); connectWebSocket(); }});
             // ... (Rest der Listener für Modals, Numpads etc.)
             elements.joinModal.numpad.addEventListener('click', (e) => {
                const target = e.target.closest('button'); if (!target) return;
                const key = target.dataset.key; const action = target.dataset.action;
                if (key && pinInput.length < 4) { pinInput += key; }
                else if (action === 'clear') { pinInput = ""; }
                else if (action === 'confirm' && pinInput.length === 4) {
                    setLoading(true);
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                        ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
                    } else {
                        showToast('Verbindung wird hergestellt... Erneut versuchen.', true);
                        connectWebSocket(); setLoading(false);
                    }
                }
                document.querySelectorAll('#join-pin-display .pin-digit').forEach((d, i) => d.textContent = pinInput[i] || "");
            });

            elements.customValueModal.numpad.addEventListener('click', handleCustomNumpad);
            elements.customValueModal.closeBtn.addEventListener('click', () => elements.customValueModal.overlay.classList.add('hidden'));
            elements.customValueModal.numpad.querySelector('[data-action="backspace"]').addEventListener('click', () => { customValueInput = customValueInput.slice(0, -1); updateCustomValueDisplay(); });
            elements.customValueModal.confirmBtn.addEventListener('click', () => {
                if (!customValueInput) return;
                const value = parseInt(customValueInput);
                if (currentCustomType === 'lives') {
                    gameCreationSettings.lives = value;
                    const customBtn = elements.gameTypeScreen.livesPresets.querySelector('[data-value="custom"]');
                    if(customBtn) { customBtn.textContent = value; }
                     elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                    customBtn?.classList.add('active'); // Custom Button aktivieren
                } else {
                     let settingKey = '';
                     if (currentCustomType === 'song-count') settingKey = 'songCount';
                     else if (currentCustomType === 'guess-time') settingKey = 'guessTime';

                     if (settingKey && currentGame.isHost) { // Nur Host darf Settings ändern
                         ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [settingKey]: value } }));
                         // UI im Host-Settings Bereich aktualisieren (indirekt über lobby-update)
                    }
                }
                elements.customValueModal.overlay.classList.add('hidden');
            });

            elements.playlistSelectModal.search.addEventListener('input', () => renderPaginatedPlaylists(allPlaylists));
            elements.playlistSelectModal.pagination.addEventListener('click', (e) => {
                if (e.target.closest('#next-page')) {
                    renderPaginatedPlaylists(allPlaylists, currentPage + 1);
                } else if (e.target.closest('#prev-page')) {
                    renderPaginatedPlaylists(allPlaylists, currentPage - 1);
                }
            });


             console.log("Main function finished setup.");

        } catch (error) {
             console.error("FATAL ERROR during main setup:", error);
            setLoading(false);
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>Initialisierung fehlgeschlagen: ${error.message}</p><p>Siehe Browser-Konsole für Details.</p></div>`;
        }
    };
    main(); // Starte die App
});

// Füge hier die Definitionen für Funktionen ein, die außerhalb von DOMContentLoaded benötigt werden könnten
// (Momentan nicht der Fall, aber zur Strukturierung)
// z.B. renderPlayerList, updateHostSettings, showCountdown, etc.
// Stelle sicher, dass ALLE Funktionen, die oben aufgerufen werden, auch hier oder innerhalb von DOMContentLoaded definiert sind.
// Die meisten deiner Funktionen sind bereits korrekt innerhalb des DOMContentLoaded-Handlers platziert.
