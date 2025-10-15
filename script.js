document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Variablen ---
    const ws = { socket: null };
    let currentUser = null, spotifyToken = null, supabase;
    let gameSettings = { songCount: 10, guessTime: 30 };

    // --- DOM Elemente ---
    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        auth: {
            screen: document.getElementById('auth-screen'),
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            showRegister: document.getElementById('show-register-form'),
            showLogin: document.getElementById('show-login-form'),
        },
        home: {
            screen: document.getElementById('home-screen'),
            nickname: document.getElementById('welcome-nickname'),
            stats: document.querySelector('.player-stats'),
            gamesPlayed: document.getElementById('stat-games-played'),
            highscore: document.getElementById('stat-highscore'),
            loginSpotifyBtn: document.getElementById('show-create-button-login'),
            createBtn: document.getElementById('show-create-button-action'),
            joinBtn: document.getElementById('show-join-button'),
            logoutBtn: document.getElementById('logout-button')
        },
        modeSelection: {
            screen: document.getElementById('mode-selection-screen'),
            modeBoxes: document.querySelectorAll('.mode-box')
        },
        lobby: {
            screen: document.getElementById('lobby-screen'),
            pin: document.getElementById('lobby-pin'),
            playerList: document.getElementById('player-list'),
            hostSettings: document.getElementById('host-settings'),
            deviceSelect: document.getElementById('device-select'),
            playlistSelect: document.getElementById('playlist-select'),
            refreshDevicesBtn: document.getElementById('refresh-devices-button'),
            songCountOptions: document.getElementById('song-count-options'),
            guessTimeOptions: document.getElementById('guess-time-options'),
            startGameBtn: document.getElementById('start-game-button'),
            waitingMessage: document.getElementById('guest-waiting-message')
        },
        guestModal: {
            overlay: document.getElementById('guest-modal-overlay'),
            closeBtn: document.getElementById('close-guest-modal-button'),
            submitBtn: document.getElementById('guest-nickname-submit'),
            input: document.getElementById('guest-nickname-input'),
            openBtn: document.getElementById('guest-mode-button')
        },
        joinModal: {
            overlay: document.getElementById('join-modal-overlay'),
            closeBtn: document.getElementById('close-join-modal-button'),
            pinDisplay: document.querySelectorAll('#join-modal-overlay .pin-digit'),
            numpad: document.querySelectorAll('#numpad-join button')
        },
        customInputModal: {
            overlay: document.getElementById('custom-input-modal-overlay'),
            title: document.getElementById('custom-input-title'),
            display: document.querySelectorAll('#custom-input-modal-overlay .pin-digit'),
            numpad: document.querySelectorAll('#numpad-custom button'),
            submitBtn: document.getElementById('custom-input-submit'),
            cancelBtn: document.getElementById('custom-input-cancel')
        }
    };
    
    // --- Hilfsfunktionen ---
    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "#e52d27" : "#00b09b", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => {
        elements.screens.forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
        elements.leaveGameButton.classList.toggle('hidden', !['lobby-screen', 'mode-selection-screen'].includes(screenId));
    };
    
    // --- WebSocket Logik ---
    const connectWebSocket = () => {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        ws.socket = new WebSocket(`${protocol}://${location.host}`);
        ws.socket.onopen = () => console.log("WebSocket verbunden.");
        ws.socket.onmessage = (event) => handleWebSocketMessage(JSON.parse(event.data));
        ws.socket.onclose = () => setTimeout(connectWebSocket, 3000);
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        switch (type) {
            case 'game-created':
            case 'join-success':
                showScreen('lobby-screen');
                updateLobby(payload);
                if (currentUser.id === payload.hostId) {
                    loadSpotifyDevices();
                    loadSpotifyPlaylists();
                }
                break;
            case 'lobby-update': updateLobby(payload); break;
            case 'error': showToast(payload.message, true); break;
        }
    };
    
    // --- App-Logik ---
    const initializeApp = async (user, isGuest = false) => {
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        elements.home.nickname.textContent = currentUser.username;
        elements.home.stats.classList.toggle('guest', isGuest);
        if (!isGuest) await updateHomeScreenStats();
        await checkSpotifyStatus();
        showScreen('home-screen');
    };

    const initializeAppAsGuest = (nickname) => initializeApp({ id: 'guest-' + Date.now(), username: nickname }, true);

    const updateHomeScreenStats = async () => {
        const { data } = await supabase.from('profiles').select('games_played, highscore').eq('id', currentUser.id).single();
        if (data) {
            elements.home.gamesPlayed.textContent = data.games_played || 0;
            elements.home.highscore.textContent = data.highscore || 0;
        }
    };
    
    const checkSpotifyStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            spotifyToken = data.loggedIn ? data.token : null;
        } catch { spotifyToken = null; }
        elements.home.loginSpotifyBtn.classList.toggle('hidden', !!spotifyToken);
        elements.home.createBtn.classList.toggle('hidden', !spotifyToken);
    };
    
    const updateLobby = ({ pin, players, hostId }) => {
        elements.lobby.pin.textContent = pin;
        elements.lobby.playerList.innerHTML = players.map(p => `<li>${p.nickname} ${p.id === hostId ? '👑' : ''}</li>`).join('');
        const isHost = currentUser.id === hostId;
        elements.lobby.hostSettings.classList.toggle('hidden', !isHost);
        elements.lobby.waitingMessage.classList.toggle('hidden', isHost);
    };

    const loadSpotifyData = async (endpoint, selectElement) => {
        try {
            const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            const data = await res.json();
            const items = data.devices || data.items;
            if (items && items.length > 0) {
                selectElement.innerHTML = items.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
            } else {
                selectElement.innerHTML = `<option value="">Nichts gefunden</option>`;
            }
        } catch {
            selectElement.innerHTML = `<option value="">Fehler beim Laden</option>`;
        }
    };
    const loadSpotifyDevices = () => loadSpotifyData('/api/devices', elements.lobby.deviceSelect);
    const loadSpotifyPlaylists = () => loadSpotifyData('/api/playlists', elements.lobby.playlistSelect);

    // --- Auth-Logik ---
    const handleAuthAction = async (action, form) => {
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        const button = form.querySelector('button');
        button.disabled = true;
        const { data, error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
        button.disabled = false;
        if (error) return showToast(error.message, true);
        if (data.user) initializeApp(data.user);
    };
    const handleLogout = async () => currentUser?.isGuest ? window.location.reload() : await supabase.auth.signOut();
    const setupAuthListener = () => supabase.auth.onAuthStateChange((event) => event === 'SIGNED_OUT' && window.location.reload());

    // --- Numpad & Modal Logik ---
    const setupNumpad = (numpadElements, displayElements, maxLength, onConfirm) => {
        let value = '';
        const updateDisplay = () => displayElements.forEach((digit, i) => digit.textContent = value[i] || '');
        numpadElements.forEach(button => button.onclick = () => {
            if (button.dataset.action === 'clear') value = '';
            else if (button.dataset.action === 'backspace') value = value.slice(0, -1);
            else if (value.length < maxLength) value += button.textContent;
            updateDisplay();
        });
        return () => onConfirm(value);
    };
    
    const openCustomInputModal = (type) => {
        const modal = elements.customInputModal;
        const title = type === 'songCount' ? 'Anzahl Songs' : 'Ratezeit (Sek.)';
        const maxLength = type === 'songCount' ? 3 : 2;
        modal.title.textContent = title;
        modal.display.forEach((d, i) => d.style.display = i < maxLength ? 'flex' : 'none');
        modal.overlay.classList.remove('hidden');
        modal.submitBtn.onclick = setupNumpad(modal.numpad, modal.display, maxLength, (value) => {
            if (value) {
                gameSettings[type] = parseInt(value);
                const container = elements.lobby[type + 'Options'];
                container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
                const customBtn = container.querySelector('[data-action="custom"]');
                customBtn.classList.add('active');
                customBtn.textContent = value;
                ws.socket.send(JSON.stringify({ type: 'update-settings', payload: gameSettings }));
            }
            modal.overlay.classList.add('hidden');
        });
        modal.cancelBtn.onclick = () => modal.overlay.classList.add('hidden');
    };

    // --- Event Listeners ---
    const initializeEventListeners = () => {
        elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword, e.currentTarget); });
        elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp, e.currentTarget); });
        elements.home.logoutBtn.addEventListener('click', handleLogout);
        elements.leaveGameButton.addEventListener('click', () => showScreen('home-screen'));

        elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
        elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
        
        elements.guestModal.openBtn.addEventListener('click', () => elements.guestModal.overlay.classList.remove('hidden'));
        elements.guestModal.closeBtn.addEventListener('click', () => elements.guestModal.overlay.classList.add('hidden'));
        elements.guestModal.submitBtn.addEventListener('click', () => {
            const name = elements.guestModal.input.value.trim();
            if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
            elements.guestModal.overlay.classList.add('hidden');
            initializeAppAsGuest(name);
        });
        
        elements.home.createBtn.addEventListener('click', () => showScreen('mode-selection-screen'));
        elements.home.joinBtn.addEventListener('click', () => elements.joinModal.overlay.classList.remove('hidden'));
        elements.joinModal.closeBtn.addEventListener('click', () => elements.joinModal.overlay.classList.add('hidden'));
        
        elements.modeSelection.modeBoxes.forEach(box => box.onclick = () => ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: box.dataset.mode } })));
        
        let pin = '';
        elements.joinModal.numpad.forEach(button => button.onclick = () => {
            if (button.dataset.action === 'clear') pin = '';
            else if (button.id === 'join-game-button') {
                if (pin.length === 4) ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin, user: currentUser } }));
                else showToast('PIN muss 4-stellig sein.', true);
            }
            else if (pin.length < 4) pin += button.textContent.trim();
            elements.joinModal.pinDisplay.forEach((d, i) => d.textContent = pin[i] || '');
        });
        
        elements.lobby.refreshDevicesBtn.addEventListener('click', loadSpotifyDevices);
        [elements.lobby.songCountOptions, elements.lobby.guessTimeOptions].forEach(container => {
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('.option-btn');
                if (!btn) return;
                const type = btn.dataset.type;
                if (btn.dataset.action === 'custom') return openCustomInputModal(type);
                
                container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                gameSettings[type] = parseInt(btn.dataset.value);
                container.querySelector('[data-action="custom"]').textContent = "Custom";
                ws.socket.send(JSON.stringify({ type: 'update-settings', payload: gameSettings }));
            });
        });
    };

    // --- MAIN APP ---
    const main = async () => {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            // ### DIE KORREKTUR ###
            const { createClient } = window.supabase;
            supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
            
            initializeEventListeners();
            setupAuthListener();
            connectWebSocket();
            const { data: { session } } = await supabase.auth.getSession();
            session ? initializeApp(session.user) : showScreen('auth-screen');
        } catch (error) {
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p></div>`;
        }
    };
    main();
});
