document.addEventListener('DOMContentLoaded', () => {
    // Globale Variablen
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false;
    let spotifyToken = null; // Token wird jetzt hier gespeichert
    let spotifyPlayer = null, spotifyDeviceId = null;
    let clientRoundTimer = null, currentPin = '';

    // HTML-Elemente (bleibt unverändert)
    const elements = { /* ... */ };

    // APP INITIALISIERUNG & SPOTIFY PLAYER
    window.onSpotifyWebPlaybackSDKReady = () => {};
    function initializeSpotifyPlayer(token) { // Braucht jetzt den Token
        if (!token) return;
        spotifyPlayer = new Spotify.Player({ name: 'Fakester Quiz', getOAuthToken: cb => { cb(token); }, volume: 0.5 });
        spotifyPlayer.addListener('ready', ({ device_id }) => { console.log('Spotify Player bereit mit ID:', device_id); spotifyDeviceId = device_id; });
        spotifyPlayer.addListener('not_ready', ({ device_id }) => console.log('Gerät offline:', device_id));
        spotifyPlayer.addListener('authentication_error', ({ message }) => console.error(message));
        spotifyPlayer.addListener('account_error', ({ message }) => { alert("Spotify-Fehler: " + message); });
        spotifyPlayer.connect();
    }
    
    async function initializeApp() {
        myNickname = localStorage.getItem('nickname');
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            if (!data.loggedIn) throw new Error('Nicht eingeloggt');
            
            // EINGELOGGT
            spotifyToken = data.token; // Token in der globalen Variable speichern
            document.cookie = "spotify_access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"; // Alten Cookie löschen
            
            elements.showCreateButtonLogin.classList.add('hidden');
            elements.showCreateButtonAction.classList.remove('hidden');
            if (window.Spotify) { initializeSpotifyPlayer(spotifyToken); } else { window.onSpotifyWebPlaybackSDKReady = () => initializeSpotifyPlayer(spotifyToken); }
            if (myNickname) {
                elements.welcomeNickname.textContent = myNickname;
                showScreen('home-screen');
            } else {
                showScreen('nickname-screen');
            }
        } catch (error) {
            // NICHT EINGELOGGT
            elements.showCreateButtonLogin.classList.remove('hidden');
            elements.showCreateButtonAction.classList.add('hidden');
            if (myNickname) {
                elements.welcomeNickname.textContent = myNickname;
                showScreen('home-screen');
            } else {
                showScreen('nickname-screen');
            }
        }
    }
    initializeApp();

    // Playlist-Laden mit Token
    async function fetchAndDisplayPlaylists() {
        if (!spotifyToken) { elements.playlistSelect.innerHTML = `<option>Fehler: Kein Token</option>`; return; }
        try {
            const response = await fetch('/api/playlists', {
                headers: { 'Authorization': `Bearer ${spotifyToken}` }
            });
            if (!response.ok) throw new Error('Antwort nicht ok');
            const data = await response.json();
            elements.playlistSelect.innerHTML = data.items.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            sendSettingsUpdate();
        } catch (error) {
            elements.playlistSelect.innerHTML = `<option>Laden fehlgeschlagen</option>`;
        }
    }
    
    // Raum erstellen mit Token
    elements.showCreateButtonAction.addEventListener('click', () => {
        connectToServer(() => {
            sendMessage('create-game', { nickname: myNickname, token: spotifyToken });
            fetchAndDisplayPlaylists();
        });
    });

    // Der Rest der Datei (WebSocket-Handler, UI-Updates, andere Event-Listener) bleibt exakt gleich wie in der vorherigen Version.
    // ...
    function connectToServer(onOpenCallback) { /*...*/ }
    function sendMessage(type, payload) { /*...*/ }
    function handleServerMessage(event) { /*...*/ }
    function showScreen(screenId) { /*...*/ }
    function playTrack(spotifyId) { /*...*/ }
    function updateLobby({ players, hostId, settings }) { /*...*/ }
    function showCountdown({ round, totalRounds }) { /*...*/ }
    function startRoundUI({ round, totalRounds, guessTime }) { /*...*/ }
    function showResultUI({ song, scores }) { /*...*/ }
    function updateLiveScoreboard(players) { /*...*/ }
    function updatePinDisplay() { /*...*/ }
    function sendSettingsUpdate() { /*...*/ }
    elements.nicknameSubmitButton.addEventListener('click', () => { /*...*/ });
    elements.welcomeNickname.addEventListener('click', () => { /*...*/ });
    elements.showJoinButton.addEventListener('click', () => { /*...*/ });
    // ... alle weiteren Event Listener ...
});
