document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen ---
    const ws = { socket: null };
    let currentUser = null, spotifyToken = null, supabase;

    // --- DOM Elemente ---
    const elements = {
        screens: document.querySelectorAll('.screen'),
        authScreen: document.getElementById('auth-screen'),
        homeScreen: document.getElementById('home-screen'),
        modeSelectionScreen: document.getElementById('mode-selection-screen'),
        lobbyScreen: document.getElementById('lobby-screen'),
        
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        showRegisterForm: document.getElementById('show-register-form'),
        showLoginForm: document.getElementById('show-login-form'),
        
        logoutButton: document.getElementById('logout-button'),
        leaveGameButton: document.getElementById('leave-game-button'),

        welcomeNickname: document.getElementById('welcome-nickname'),
        playerStats: document.querySelector('.player-stats'),
        statGamesPlayed: document.getElementById('stat-games-played'),
        statHighscore: document.getElementById('stat-highscore'),
        
        showCreateButtonLogin: document.getElementById('show-create-button-login'),
        showCreateButtonAction: document.getElementById('show-create-button-action'),
        showJoinButton: document.getElementById('show-join-button'),
        
        modeBoxes: document.querySelectorAll('.mode-box'),
        
        lobbyPin: document.getElementById('lobby-pin'),
        playerList: document.getElementById('player-list'),
        hostSettings: document.getElementById('host-settings'),
        guestWaitingMessage: document.getElementById('guest-waiting-message'),
        
        guestModal: {
            overlay: document.getElementById('guest-modal-overlay'),
            closeButton: document.getElementById('close-guest-modal-button'),
            submitButton: document.getElementById('guest-nickname-submit'),
            nicknameInput: document.getElementById('guest-nickname-input'),
            button: document.getElementById('guest-mode-button')
        },
        joinModal: {
            overlay: document.getElementById('join-modal-overlay'),
            closeButton: document.getElementById('close-join-modal-button'),
            pinDisplay: document.querySelectorAll('#join-modal-overlay .pin-digit'),
            numpad: document.querySelectorAll('#numpad-join button'),
            joinButton: document.getElementById('join-game-button')
        }
    };
    
    // --- Hilfsfunktionen ---
    function showToast(message, isError = false) {
        Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "#e52d27" : "#00b09b", borderRadius: "8px" } }).showToast();
    }
    function showScreen(screenId) {
        elements.screens.forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
        elements.leaveGameButton.classList.toggle('hidden', !['lobby-screen', 'mode-selection-screen'].includes(screenId));
    }
    
    // --- WebSocket Logik ---
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        ws.socket = new WebSocket(`${protocol}://${window.location.host}`);
        ws.socket.onopen = () => console.log("WebSocket verbunden.");
        ws.socket.onmessage = (event) => handleWebSocketMessage(JSON.parse(event.data));
        ws.socket.onclose = () => setTimeout(connectWebSocket, 3000);
        ws.socket.onerror = (err) => console.error("WebSocket Fehler:", err);
    }

    function handleWebSocketMessage({ type, payload }) {
        switch (type) {
            case 'game-created':
            case 'join-success':
                showScreen('lobby-screen');
                updateLobby(payload);
                break;
            case 'lobby-update':
                updateLobby(payload);
                break;
            case 'error':
                showToast(payload.message, true);
                break;
        }
    }
    
    // --- App-Logik & Initialisierung ---
    async function initializeApp(user, isGuest = false) {
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        elements.welcomeNickname.textContent = currentUser.username;
        elements.playerStats.classList.toggle('guest', isGuest);
        if (!isGuest) await updateHomeScreenStats();
        await checkSpotifyStatus();
        showScreen('home-screen');
    }

    function initializeAppAsGuest(nickname) {
        const guestUser = { id: 'guest-' + Date.now(), username: nickname };
        initializeApp(guestUser, true);
    }

    async function updateHomeScreenStats() {
        const { data } = await supabase.from('profiles').select('games_played, highscore').eq('id', currentUser.id).single();
        if (data) {
            elements.statGamesPlayed.textContent = data.games_played || 0;
            elements.statHighscore.textContent = data.highscore || 0;
        }
    }
    
    async function checkSpotifyStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            spotifyToken = data.loggedIn ? data.token : null;
        } catch {
            spotifyToken = null;
        }
        elements.showCreateButtonLogin.classList.toggle('hidden', !!spotifyToken);
        elements.showCreateButtonAction.classList.toggle('hidden', !spotifyToken);
    }
    
    function updateLobby(data) {
        elements.lobbyPin.textContent = data.pin;
        elements.playerList.innerHTML = '';
        const isHost = currentUser.id === data.hostId;

        data.players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.nickname} ${player.id === data.hostId ? '👑' : ''}`;
            elements.playerList.appendChild(li);
        });
        
        elements.hostSettings.classList.toggle('hidden', !isHost);
        elements.guestWaitingMessage.classList.toggle('hidden', isHost);
    }

    // --- Auth-Logik ---
    async function handleAuthAction(action, form) {
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        const { data, error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
        if (error) return showToast(error.message, true);
        if (data.user) initializeApp(data.user, false);
    }
    async function handleLogout() {
        if (currentUser && currentUser.isGuest) return window.location.reload();
        await supabase.auth.signOut();
    }
    function setupAuthListener() {
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                currentUser = null;
                window.location.reload();
            }
        });
    }

    // --- Event Listeners ---
    function initializeEventListeners() {
        elements.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword, e.currentTarget); });
        elements.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp, e.currentTarget); });
        elements.logoutButton.addEventListener('click', handleLogout);
        elements.leaveGameButton.addEventListener('click', () => showScreen('home-screen'));

        elements.showRegisterForm.addEventListener('click', (e) => { e.preventDefault(); elements.loginForm.classList.add('hidden'); elements.registerForm.classList.remove('hidden'); });
        elements.showLoginForm.addEventListener('click', (e) => { e.preventDefault(); elements.registerForm.classList.add('hidden'); elements.loginForm.classList.remove('hidden'); });
        
        elements.guestModal.button.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
        elements.guestModal.closeButton.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.guestModal.submitButton.addEventListener('click', () => {
            const name = elements.guestModal.nicknameInput.value.trim();
            if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
            elements.guestModal.overlay.classList.add('hidden');
            initializeAppAsGuest(name);
        });
        
        elements.showCreateButtonAction.addEventListener('click', () => showScreen('mode-selection-screen'));
        elements.showJoinButton.addEventListener('click', () => elements.joinModal.overlay.classList.remove('hidden'));
        elements.joinModal.closeButton.addEventListener('click', () => elements.joinModal.overlay.classList.add('hidden'));
        
        elements.modeBoxes.forEach(box => {
            box.addEventListener('click', () => {
                ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: box.dataset.mode } }));
            });
        });
        
        let pin = '';
        elements.joinModal.numpad.forEach(button => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                if (action === 'clear') pin = '';
                else if (button.id === 'join-game-button') {
                    if (pin.length === 4) ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin, user: currentUser } }));
                    else showToast('PIN muss 4-stellig sein.', true);
                }
                else if (pin.length < 4) pin += button.textContent.trim();
                elements.joinModal.pinDisplay.forEach((digit, i) => { digit.textContent = pin[i] || ''; });
            });
        });
    }

    // --- MAIN APP ---
    async function main() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Server-Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            
            // ### DIE KORREKTUR IST HIER ###
            // Wir holen `createClient` aus dem globalen `window.supabase` Objekt
            const { createClient } = window.supabase;
            // Jetzt initialisieren wir unsere lokale `supabase` Variable damit
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            initializeEventListeners();
            setupAuthListener();
            connectWebSocket();

            const { data: { session } } = await supabase.auth.getSession();
            session ? initializeApp(session.user, false) : showScreen('auth-screen');
        } catch (error) {
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p></div>`;
        }
    }
    main();
});
