document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let achievements = [], userTitles = [], currentGame = { pin: null, playerId: null, isHost: false, gameMode: null };

    // ... (Initial variables like testAchievements, testTitles remain the same) ...

    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), },
        home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelectBtn: document.getElementById('device-select-button'),
            playlistSelectBtn: document.getElementById('playlist-select-button'),
            startGameBtn: document.getElementById('start-game-button'),
            inviteFriendsBtn: document.getElementById('invite-friends-button'),
            songCountPresets: document.getElementById('song-count-presets'),
            guessTimePresets: document.getElementById('guess-time-presets'),
            answerTypePresets: document.getElementById('answer-type-presets'),
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), contentArea: document.getElementById('game-content-area') },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button') },
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')},
        achievements: { grid: document.getElementById('achievement-grid') },
        titles: { list: document.getElementById('title-list') },
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
        },
        infoModal: {
            overlay: document.getElementById('info-modal-overlay'),
            closeBtn: document.getElementById('close-info-modal-button'),
            title: document.getElementById('info-modal-title'),
            text: document.getElementById('info-modal-text'),
        },
        customConfirmModal: {
            overlay: document.getElementById('custom-confirm-modal-overlay'),
            title: document.getElementById('custom-confirm-title'),
            text: document.getElementById('custom-confirm-text'),
            okBtn: document.getElementById('custom-confirm-ok'),
            cancelBtn: document.getElementById('custom-confirm-cancel'),
        }
    };

    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => { elements.screens.forEach(s => s.classList.remove('active')); document.getElementById(screenId)?.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    
    // ... (Rest of helper functions like showCustomConfirm, initializeApp, etc. remain unchanged) ...
    async function initializeApp(user, isGuest = false) {
        // ... (This function remains unchanged)
    }
    // ... (All other functions from previous versions remain here, unchanged)

    const main = async () => {
        setLoading(true); // Loader am Anfang anzeigen
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error('Konfiguration konnte nicht geladen werden. Der Server ist möglicherweise offline.');
            }
            const config = await response.json();
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            // --- ALLE EVENT-LISTENER WERDEN JETZT HIER REGISTRIERT ---
            
            // Auth Buttons (entscheidend für die Funktionalität)
            elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
            elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
            elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
            elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
            
            // Gast Modus
            elements.guestModal.openBtn.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
            elements.guestModal.closeBtn.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
            elements.guestModal.submitBtn.addEventListener('click', () => {
                const name = document.getElementById('guest-nickname-input').value.trim();
                if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                elements.guestModal.overlay.classList.add('hidden');
                setLoading(true);
                initializeApp({ id: 'guest-' + Date.now(), username: name, user_metadata: {} }, true).finally(() => setLoading(false));
            });

            // Restliche Event-Listener
            // ... (Hier alle anderen Listener wie `leaveGameButton`, `friendsModal`, etc. einfügen) ...
            
            // --- ROBUSTE AUTH-LOGIK, DIE WIEDER FUNKTIONIERT ---
            supabase.auth.onAuthStateChange(async (event, session) => {
                // Diese Funktion reagiert auf Änderungen, NACHDEM die App geladen ist.
                // z.B. wenn sich jemand ein- oder ausloggt.
                const user = session?.user;
                if (user) {
                    // Wenn der currentUser noch nicht gesetzt ist oder sich geändert hat, initialisiere die App
                    if (!currentUser || currentUser.id !== user.id) {
                         await initializeApp(user);
                    }
                } else {
                    // Wenn keine Session vorhanden ist, zeige den Login-Screen
                    currentUser = null;
                    showScreen('auth-screen');
                }
            });

            // Führe die ERSTE Session-Prüfung beim Laden der Seite manuell durch.
            // Das ist der entscheidende Teil für den automatischen Login.
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                // Wenn eine Session gefunden wird, starte die App für den eingeloggten User.
                await initializeApp(session.user);
            } else {
                // Wenn keine Session gefunden wird, zeige den Anmelde-Bildschirm.
                showScreen('auth-screen');
            }

        } catch (error) {
            console.error("Ein kritischer Fehler ist beim Start aufgetreten:", error);
            // Zeige eine Fehlermeldung an, anstatt im Ladebildschirm hängen zu bleiben.
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p><p>Bitte lade die Seite neu. Wenn das Problem weiterhin besteht, überprüfe die Server-Logs.</p></div>`;
        } finally {
            // Dies ist der wichtigste Teil: Der Ladebildschirm wird IMMER ausgeblendet.
            setLoading(false);
        }
    };

    main();
});
