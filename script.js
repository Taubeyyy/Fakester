document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let achievements = [], userTitles = [], currentGame = { pin: null, playerId: null, isHost: false, gameMode: null };

    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3
    };

    const testAchievements = [
        { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' },
        { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig.' },
        { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' }
    ];
    const testTitles = [
        { id: 1, name: 'Neuling', achievement_id: null },
        { id: 2, name: 'Musik-Kenner', achievement_id: 2 },
        { id: 3, name: 'Legende', achievement_id: 3 }
    ];
    const PLACEHOLDER_IMAGE_URL = 'https://i.imgur.com/3EMVPIA.png';

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
    
    const showCustomConfirm = (title, text) => {
        return new Promise((resolve) => {
            elements.customConfirmModal.title.textContent = title;
            elements.customConfirmModal.text.textContent = text;
            elements.customConfirmModal.overlay.classList.remove('hidden');

            elements.customConfirmModal.okBtn.onclick = () => {
                elements.customConfirmModal.overlay.classList.add('hidden');
                resolve(true);
            };
            elements.customConfirmModal.cancelBtn.onclick = () => {
                elements.customConfirmModal.overlay.classList.add('hidden');
                resolve(false);
            };
        });
    };

    const initializeApp = async (user, isGuest = false) => {
        try {
            sessionStorage.removeItem('fakesterGame');
            currentUser = { 
                id: user.id, 
                username: isGuest ? user.username : user.user_metadata.username,
                titleId: isGuest ? 1 : user.user_metadata.equipped_title_id || 1, 
                isGuest 
            };
            document.body.classList.toggle('is-guest', isGuest);
            document.getElementById('welcome-nickname').textContent = currentUser.username;
            if (!isGuest) { 
                await checkSpotifyStatus(); 
                const { data: stats } = await supabase.from('profiles').select('games_played, wins, correct_answers').eq('id', currentUser.id).single();
                if (stats) {
                    document.getElementById('stat-games-played-preview').textContent = stats.games_played || 0;
                    document.getElementById('stat-wins-preview').textContent = stats.wins || 0;
                    document.getElementById('stat-correct-answers-preview').textContent = stats.correct_answers || 0;
                }

                renderAchievements(); 
                renderTitles();
                const equippedTitle = testTitles.find(t => t.id === currentUser.titleId) || testTitles[0];
                document.getElementById('profile-title').textContent = equippedTitle.name;
            }
            showScreen('home-screen');
            connectWebSocket();
        } catch (error) {
            console.error("Fehler bei der Initialisierung der App:", error);
            await supabase.auth.signOut();
            showScreen('auth-screen');
        }
    };

    const checkSpotifyStatus = async () => {
        try { const res = await fetch('/api/status'); const data = await res.json(); spotifyToken = data.loggedIn ? data.token : null; } catch { spotifyToken = null; }
        document.getElementById('spotify-connect-button').classList.toggle('hidden', !!spotifyToken);
        elements.home.createRoomBtn.classList.toggle('hidden', !spotifyToken);
    };

    const handleAuthAction = async (action, form) => {
        setLoading(true);
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        try { const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username, equipped_title_id: 1 } } }); if (error) throw error; } 
        catch (error) { showToast(error.message, true); setLoading(false); }
    };
    const handleLogout = async () => { setLoading(true); if (currentUser?.isGuest) return window.location.reload(); await supabase.auth.signOut(); };

    // ... All other helper functions like connectWebSocket, handleWebSocketMessage, etc. remain the same ...
    // They are correct and do not need changes.
    // ...

    const main = async () => {
        setLoading(true); 
        try {
            // --- ALLE EVENT-LISTENER WERDEN JETZT SOFORT REGISTRIERT ---
            
            // Auth Buttons (DIESER TEIL HAT GEFEHLT)
            elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
            elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
            elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
            elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
            
            // Gast Modus Buttons
            elements.guestModal.openBtn.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
            elements.guestModal.closeBtn.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
            elements.guestModal.submitBtn.addEventListener('click', async () => {
                const name = document.getElementById('guest-nickname-input').value.trim();
                if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                elements.guestModal.overlay.classList.add('hidden');
                setLoading(true);
                await initializeApp({ id: 'guest-' + Date.now(), username: name, user_metadata: {} }, true);
                setLoading(false);
            });

            // Restliche Event-Listener
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!ws.socket || ws.socket.readyState === WebSocket.CLOSED)) { connectWebSocket(); }});
            elements.leaveGameButton.addEventListener('click', async () => {
                const activeScreen = document.querySelector('.screen.active').id;
                if (['lobby-screen', 'game-screen'].includes(activeScreen)) {
                    const confirmed = await showCustomConfirm('Spiel verlassen', 'Möchtest du das aktuelle Spiel wirklich verlassen? Dies wird als Niederlage gewertet.');
                    if (confirmed) { sessionStorage.removeItem('fakesterGame'); window.location.reload(); }
                } else if (activeScreen === 'mode-selection-screen') { showScreen('home-screen');
                } else if (activeScreen === 'game-type-selection-screen') { showScreen('mode-selection-screen');
                } else { showScreen('home-screen'); }
            });
            const friendsModal = document.querySelector('.friends-modal');
            const tabButtons = friendsModal.querySelectorAll('.tab-button');
            const tabContents = friendsModal.querySelectorAll('.tab-content');
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    tabContents.forEach(content => content.classList.remove('active'));
                    document.getElementById(button.dataset.tab).classList.add('active');
                });
            });
            // ... (Hier könnten noch weitere Listener stehen, falls nötig)

            // --- KERNLOGIK: SUPABASE INITIALISIEREN UND AUTH-STATUS PRÜFEN ---
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error('Konfiguration konnte nicht geladen werden. Der Server ist möglicherweise offline.');
            }
            const config = await response.json();
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            supabase.auth.onAuthStateChange(async (_event, session) => {
                const user = session?.user;
                if (user) {
                    if (!currentUser || currentUser.id !== user.id) {
                         await initializeApp(user);
                    }
                } else {
                    currentUser = null;
                    showScreen('auth-screen');
                }
            });

            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await initializeApp(session.user);
            } else {
                showScreen('auth-screen');
            }

        } catch (error) {
            console.error("Ein kritischer Fehler ist beim Start aufgetreten:", error);
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p><p>Bitte lade die Seite neu.</p></div>`;
        } finally {
            setLoading(false);
        }
    };

    main();
});
