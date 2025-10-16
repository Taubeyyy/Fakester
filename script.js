document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let achievements = [], userTitles = [], currentGame = { pin: null, playerId: null };

    const DATA_KEYS = { FRIEND_ID: 'data-friend-id', REQUEST_ID: 'data-request-id', SENDER_ID: 'data-sender-id' };
    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), },
        home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelect: document.getElementById('device-select'), playlistSelect: document.getElementById('playlist-select'), startGameBtn: document.getElementById('start-game-button'), inviteFriendsBtn: document.getElementById('invite-friends-button'), refreshDevicesBtn: document.getElementById('refresh-devices-button'),
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), albumArt: document.getElementById('album-art'), guessArea: document.getElementById('game-guess-area'), submitBtn: document.getElementById('submit-guess-button'), },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), tabs: document.querySelectorAll('.tab-button'), tabContents: document.querySelectorAll('.tab-content'), friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'), requestsCount: document.getElementById('requests-count'), },
        inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list'), },
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), },
    };

    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => { elements.screens.forEach(s => s.classList.remove('active')); document.getElementById(screenId)?.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);

    const connectWebSocket = () => {
        if (ws.socket && ws.socket.readyState === WebSocket.OPEN) return;
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        ws.socket = new WebSocket(`${protocol}://${location.host}`);
        ws.socket.onopen = () => {
            console.log("WebSocket verbunden.");
            if (currentUser) { ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id } })); }
            const reconnectData = JSON.parse(sessionStorage.getItem('fakesterGame'));
            if (reconnectData) { ws.socket.send(JSON.stringify({ type: 'reconnect', payload: reconnectData })); }
        };
        ws.socket.onmessage = (event) => handleWebSocketMessage(JSON.parse(event.data));
        ws.socket.onclose = () => setTimeout(() => connectWebSocket(), 3000);
        ws.socket.onerror = (err) => console.error("WebSocket Fehler:", err);
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        setLoading(false);
        switch (type) {
            case 'game-created':
            case 'join-success':
                currentGame = { pin: payload.pin, playerId: payload.playerId };
                sessionStorage.setItem('fakesterGame', JSON.stringify(currentGame));
                showScreen('lobby-screen');
                if (payload.isHost) { fetchAndPopulateSpotifyData(); }
                break;
            case 'lobby-update': updateLobbyUI(payload); break;
            case 'new-round': setupNewRound(payload); break;
            case 'game-invite': showInviteToast(payload); break;
            case 'toast': showToast(payload.message, payload.isError); break;
            case 'error': showToast(payload.message, true); break;
        }
    };

    const setupNewRound = (payload) => { /* ... */ };
    const updateLobbyUI = ({ pin, hostId, players, settings }) => {
        elements.lobby.pinDisplay.textContent = pin;
        elements.lobby.playerList.innerHTML = '';
        players.forEach(player => {
            const playerCard = document.createElement('div');
            playerCard.className = `player-card ${!player.isConnected ? 'disconnected' : ''}`;
            playerCard.innerHTML = `<i class="fa-solid ${player.id === hostId ? 'fa-crown' : 'fa-user'} player-icon ${player.id === hostId ? 'host' : ''}"></i><span class="player-name">${player.nickname}</span>`;
            elements.lobby.playerList.appendChild(playerCard);
        });
        const isCurrentUserHost = currentUser.id === hostId;
        elements.lobby.hostSettings.classList.toggle('hidden', !isCurrentUserHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isCurrentUserHost);
    };

    const initializeApp = async (user, isGuest = false) => {
        sessionStorage.removeItem('fakesterGame');
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        await checkSpotifyStatus();
        showScreen('home-screen');
        connectWebSocket();
    };
    
    // ... (Andere Funktionen wie checkSpotifyStatus, handleAuthAction, handleNumpadInput etc. bleiben unverändert)

    const main = async () => {
        // ... (main function setup)
        // Hinzufügen der neuen Event Listeners
        elements.lobby.refreshDevicesBtn.addEventListener('click', fetchAndPopulateSpotifyData);
        elements.lobby.inviteFriendsBtn.addEventListener('click', showInviteFriendsModal);
        
        document.querySelectorAll('.preset-group').forEach(group => {
            group.addEventListener('click', e => {
                const button = e.target.closest('.preset-button');
                if (!button) return;
                if (button.dataset.value === 'custom') {
                    openCustomValueModal(button.dataset.type);
                    return;
                }
                group.querySelector('.active')?.classList.remove('active');
                button.classList.add('active');
                sendSettingsUpdate();
            });
        });
        
        // ... (restliche Event Listeners)
    };

    // NEUE FUNKTIONEN
    async function fetchAndPopulateSpotifyData() {
        setLoading(true);
        try {
            const res = await fetch('/api/devices', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!res.ok) throw new Error();
            const data = await res.json();
            elements.lobby.deviceSelect.innerHTML = data.devices.map(d => `<option value="${d.id}" ${d.is_active ? 'selected' : ''}>${d.name}</option>`).join('') || '<option>Kein Gerät gefunden</option>';
        } catch { elements.lobby.deviceSelect.innerHTML = '<option>Fehler beim Laden</option>'; }
        
        try {
            const res = await fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } });
            if (!res.ok) throw new Error();
            const data = await res.json();
            elements.lobby.playlistSelect.innerHTML = data.items.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        } catch { elements.lobby.playlistSelect.innerHTML = '<option>Fehler beim Laden</option>'; }
        
        setLoading(false);
        sendSettingsUpdate();
    }

    function sendSettingsUpdate() {
        const settings = {
            deviceId: elements.lobby.deviceSelect.value,
            playlistId: elements.lobby.playlistSelect.value,
            songCount: document.querySelector('#song-count-presets .active').dataset.value,
            guessTime: document.querySelector('#guess-time-presets .active').dataset.value,
            gameType: document.querySelector('#game-type-presets .active').dataset.value,
        };
        ws.socket.send(JSON.stringify({ type: 'update-settings', payload: settings }));
    }
    
    async function showInviteFriendsModal() {
        elements.inviteFriendsModal.overlay.classList.remove('hidden');
        const list = elements.inviteFriendsModal.list;
        list.innerHTML = '<li>Lade Freunde...</li>';
        try {
            const { data: friends, error } = await supabase.rpc('get_friends', { user_id_param: currentUser.id });
            if (error) throw error;
            // Hier bräuchte man eine Logik, um zu prüfen, wer davon online ist. 
            // Vorerst zeigen wir alle an.
            list.innerHTML = friends.map(f => `<li data-friend-id="${f.id}"><span>${f.username}</span><button class="button-icon-small"><i class="fa-solid fa-paper-plane"></i></button></li>`).join('');
        } catch { list.innerHTML = '<li>Fehler beim Laden.</li>'; }
    }
    
    elements.inviteFriendsModal.list.addEventListener('click', e => {
        const friendLi = e.target.closest('li');
        if (!friendLi) return;
        ws.socket.send(JSON.stringify({ type: 'invite-friend', payload: { targetId: friendLi.dataset.friendId } }));
    });
    
    // ... (Alle anderen Funktionen wie setupFriendsModal, loadFriendsAndRequests etc. bleiben hier)
    
    main();
});
