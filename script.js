document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // =========== SPOTIFY SDK & LOGIN LOGIK (ÜBERARBEITET) =============
    // =================================================================
    const CLIENT_ID = "ec63d6f7ae1c4b888cefcccedd291b53"; 
    // Die Redirect URI ist jetzt dynamisch, damit es auf Render und Lokal läuft
    const REDIRECT_URI = window.location.origin; 
    const SCOPES = [
        "streaming", "user-read-email", "user-read-private",
        "user-read-playback-state", "user-modify-playback-state"
    ];

    let spotifyPlayer = null;
    let spotifyDeviceId = null;
    let accessToken = null;

    // Diese Funktion wird vom Spotify SDK aufgerufen
    window.onSpotifyWebPlaybackSDKReady = () => {
        const token = getAccessTokenFromUrl();
        if (token) {
            accessToken = token;
            // Der Nutzer wurde gerade von Spotify zurückgeleitet.
            // Wir initialisieren den Player und erstellen dann das Spiel.
            initializeSpotifyPlayer(token);
        }
    };

    function getAccessTokenFromUrl() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (token) {
            // Speichere den Token und bereinige die URL
            localStorage.setItem('spotify_access_token', token);
            window.location.hash = ''; 
            return token;
        }
        // Prüfe, ob wir bereits einen Token gespeichert haben
        return localStorage.getItem('spotify_access_token');
    }
    
    function spotifyLogin() {
        // Speichere den Nickname, damit wir ihn nach dem Login wiederhaben
        localStorage.setItem('nickname_before_login', myNickname);
        const authUrl = `https://api.spotify.com/v1/users/XXXXXXXX/playlists?response_type=token&client_id=${CLIENT_ID}&scope=${SCOPES.join('%20')}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
        window.location = authUrl;
    }

    function initializeSpotifyPlayer(token) {
        spotifyPlayer = new Spotify.Player({
            name: 'Song Quiz Deluxe Player',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });
        spotifyPlayer.addListener('ready', ({ device_id }) => {
            console.log('Spotify Player ist bereit mit Geräte-ID:', device_id);
            spotifyDeviceId = device_id;
            // Jetzt, wo der Player bereit ist, können wir das Spiel erstellen
            const nickname = localStorage.getItem('nickname_before_login');
            if (nickname) {
                myNickname = nickname;
                welcomeNickname.textContent = myNickname;
                connectToServerAndCreateGame();
                localStorage.removeItem('nickname_before_login');
            }
        });
        // ... (alle anderen Player-Listener von der letzten Version hier einfügen)
        spotifyPlayer.connect();
    }
    
    function playTrack(spotifyId) {
        if (!spotifyDeviceId) { /* ... alert-Logik von letzter Version ... */ return; }
        fetch(`https://api.spotify.com/v1/playlists/[playlist_id]/tracks?device_id=${spotifyDeviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer accessToken}` },
        });
    }

    // =================================================================
    // =========== SPIEL-LOGIK =============
    // =================================================================
    const screens = document.querySelectorAll('.screen');
    const ws = { socket: null };
    let myPlayerId = null, myNickname = '', isHost = false;
    // ... (alle weiteren UI-Elemente wie in der letzten Version hier einfügen)
    
    function showScreen(screenId) { /* ... unverändert ... */ }
    
    // NICKNAME EINGABE
    nicknameSubmitButton.addEventListener('click', () => {
        myNickname = nicknameInput.value.trim();
        if (myNickname) {
            welcomeNickname.textContent = myNickname;
            showScreen('home-screen');
        }
    });

    // SPIEL ERSTELLEN -> LÖST JETZT DEN LOGIN AUS
    showCreateButton.addEventListener('click', () => {
        spotifyLogin();
    });

    function connectToServerAndCreateGame() {
        if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
            sendMessage('create-game', { nickname: myNickname });
            return;
        }
        // Die WebSocket-URL ist jetzt dynamisch
        ws.socket = new WebSocket(`wss://${window.location.host}`);
        ws.socket.onopen = () => {
            console.log("WebSocket-Verbindung hergestellt.");
            sendMessage('create-game', { nickname: myNickname });
        };
        ws.socket.onmessage = handleServerMessage;
    }
    
    // ... (Hier den Rest der kompletten `script.js` von der letzten Antwort einfügen)
    // Wichtig: Die Funktion `connectToServer` wird jetzt nur noch für "Join Game" direkt genutzt.
    // Die `handleServerMessage`-Logik bleibt fast identisch.

    // DARK MODE FIX
    const themeToggleButton = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    themeToggleButton.innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    
    themeToggleButton.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        themeToggleButton.innerHTML = isDarkMode ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });
});