document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "";

    const ALL_ACHIEVEMENTS = {
        first_game: { icon: "fa-gamepad", title: "Erstes Spiel", description: "Spiele deine erste Runde Fakester." },
        win_streak_3: { icon: "fa-crown", title: "Siegesserie", description: "Gewinne 3 Spiele hintereinander." },
    };

    const ALL_TITLES = {
        'Neuling': { description: "Standard-Titel für alle neuen Spieler.", unlockedBy: null },
        'Kenner': { description: "Schalte diesen Titel frei, indem du 10 Spiele gewinnst.", unlockedBy: 'win_streak_3' }, // Beispiel
    };

    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        auth: {
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            showRegister: document.getElementById('show-register-form'),
            showLogin: document.getElementById('show-login-form'),
        },
        home: {
            logoutBtn: document.getElementById('corner-logout-button'),
            achievementsBtn: document.getElementById('achievements-button'),
            createRoomBtn: document.getElementById('show-create-button-action'),
            joinRoomBtn: document.getElementById('show-join-button'),
            profileTitleBtn: document.querySelector('.profile-title-button'),
        },
        guestModal: {
            overlay: document.getElementById('guest-modal-overlay'),
            closeBtn: document.getElementById('close-guest-modal-button'),
            submitBtn: document.getElementById('guest-nickname-submit'),
            openBtn: document.getElementById('guest-mode-button'),
        },
        joinModal: {
            overlay: document.getElementById('join-modal-overlay'),
            closeBtn: document.getElementById('close-join-modal-button'),
            pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'),
            numpad: document.querySelector('#numpad-join'),
        },
    };

    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "#e52d27" : "#00b09b", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => {
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
        const showLeaveButton = ['lobby-screen', 'achievements-screen', 'mode-selection-screen', 'title-selection-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);

    const initializeApp = async (user, isGuest = false) => {
        if (!isGuest) {
            const { data, error } = await supabase.from('profiles').select('equipped_title, user_achievements(achievement_id)').eq('id', user.id).single();
            if (error) {
                showToast("Profil konnte nicht geladen werden.", true);
                return;
            }
            const achievements = data.user_achievements.map(a => a.achievement_id);
            currentUser = { id: user.id, username: user.user_metadata.username, isGuest, achievements, title: data.equipped_title };
        } else {
            currentUser = { id: user.id, username: user.username, isGuest, achievements: [], title: 'Neuling' };
        }
        
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        document.getElementById('profile-title').textContent = currentUser.title;
        await checkSpotifyStatus();
        showScreen('home-screen');
        connectWebSocket();
    };
    
    const checkSpotifyStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            spotifyToken = data.loggedIn ? data.token : null;
        } catch { spotifyToken = null; }
        document.getElementById('spotify-connect-button').classList.toggle('hidden', !!spotifyToken);
        elements.home.createRoomBtn.classList.toggle('hidden', !spotifyToken);
    };

    const handleAuthAction = async (action, form) => {
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        setLoading(true);
        try {
            const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
            if (error) throw error;
        } catch (error) {
            setLoading(false);
            showToast(error.message, true);
        }
    };

    const handleLogout = async () => {
        setLoading(true);
        if (currentUser?.isGuest) return window.location.reload();
        await supabase.auth.signOut();
    };
    
    const setupAuthListener = () => {
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                await initializeApp(session.user);
            } else if (event === 'SIGNED_OUT') {
                window.location.reload();
            }
            setLoading(false);
        });
    };
    
    const renderAchievements = () => {
        const grid = document.getElementById('achievement-grid');
        grid.innerHTML = '';
        for (const id in ALL_ACHIEVEMENTS) {
            const achievement = ALL_ACHIEVEMENTS[id];
            const isUnlocked = currentUser.achievements.includes(id);
            const card = document.createElement('div');
            card.className = `achievement-card ${isUnlocked ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="achievement-icon"><i class="fa-solid ${achievement.icon}"></i></div>
                <h3>${achievement.title}</h3>
                <p>${achievement.description}</p>
            `;
            grid.appendChild(card);
        }
    };

    const renderTitles = () => {
        const list = document.getElementById('title-list');
        list.innerHTML = '';
        for (const title in ALL_TITLES) {
            const info = ALL_TITLES[title];
            const isUnlocked = !info.unlockedBy || currentUser.achievements.includes(info.unlockedBy);
            const isActive = title === currentUser.title;
            const item = document.createElement('div');
            item.className = `title-item ${isActive ? 'active' : ''} ${isUnlocked ? '' : 'locked'}`;
            item.dataset.title = title;
            item.innerHTML = `<h3>${title}</h3><p>${info.description}</p>`;
            list.appendChild(item);
        }
    };

    const equipTitle = async (title) => {
        if (currentUser.isGuest) {
            showToast("Nur für registrierte Benutzer.", true);
            return;
        }
        setLoading(true);
        const { error } = await supabase.from('profiles').update({ equipped_title: title }).eq('id', currentUser.id);
        setLoading(false);
        if (error) {
            showToast("Titel konnte nicht geändert werden.", true);
        } else {
            currentUser.title = title;
            document.getElementById('profile-title').textContent = title;
            showScreen('home-screen');
            showToast(`Titel "${title}" ausgerüstet!`);
        }
    };

    const initializeEventListeners = () => {
        elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
        elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
        elements.home.logoutBtn.addEventListener('click', handleLogout);
        elements.leaveGameButton.addEventListener('click', () => showScreen('home-screen'));

        elements.home.achievementsBtn.addEventListener('click', () => {
            renderAchievements();
            showScreen('achievements-screen');
        });
        
        elements.home.profileTitleBtn.addEventListener('click', () => {
            renderTitles();
            showScreen('title-selection-screen');
        });

        document.getElementById('title-list').addEventListener('click', (e) => {
            const item = e.target.closest('.title-item');
            if (item && !item.classList.contains('locked')) {
                equipTitle(item.dataset.title);
            }
        });

        elements.guestModal.openBtn.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
        elements.guestModal.closeBtn.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.guestModal.submitBtn.addEventListener('click', () => {
            const name = elements.guestModal.input.value.trim();
            if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
            elements.guestModal.overlay.classList.add('hidden');
            initializeApp({ id: 'guest-' + Date.now(), username: name }, true);
        });

        elements.home.joinRoomBtn.addEventListener('click', () => {
            pinInput = "";
            elements.joinModal.pinDisplay.forEach(d => d.textContent = "");
            elements.joinModal.overlay.classList.remove('hidden');
        });
        elements.joinModal.closeBtn.addEventListener('click', () => elements.joinModal.overlay.classList.add('hidden'));
        elements.joinModal.numpad.addEventListener('click', (e) => { /* Numpad Logic */ });
    };

    const main = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            const config = await response.json();

            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

            initializeEventListeners();
            setupAuthListener();

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                showScreen('auth-screen');
                setLoading(false);
            }
        } catch (error) {
            setLoading(false);
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>Ein kritischer Fehler ist aufgetreten: ${error.message}</p></div>`;
        }
    };

    main();
});
