// Pakete importieren
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const axios = require('axios');
const cookieParser = require('cookie-parser');
require('dotenv').config(); // Lädt Umgebungsvariablen für lokale Tests

// Express App und HTTP Server erstellen
const app = express();
const server = http.createServer(app);

// Spotify-Zugangsdaten sicher aus der Render-Umgebung laden
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Middleware
app.use(express.static(__dirname)); // Stellt Frontend-Dateien (index.html, etc.) bereit
app.use(cookieParser()); // Zum Lesen von Cookies

// Globale Variable, um alle laufenden Spiele zu speichern
let games = {};

// ======================================================================
//  HTTP ROUTEN (Login, API & Frontend)
// ======================================================================

// Hauptroute, die immer deine index.html anzeigt
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route zum Starten des Spotify-Logins
app.get('/login', (req, res) => {
    const scopes = 'user-read-private user-read-email playlist-read-private';
    res.redirect('https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: scopes,
            redirect_uri: REDIRECT_URI,
        }).toString());
});

// Route, zu der Spotify nach dem Login zurückleitet
app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    if (!code) return res.redirect('/#error=auth_failed'); // Zurück zur Hauptseite mit Fehler

    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }).toString(),
            headers: {
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const { access_token } = response.data;
        // Speichere den Token in einem sicheren, HttpOnly-Cookie
        res.cookie('spotify_access_token', access_token, { httpOnly: true, secure: true, maxAge: 3600000 });
        res.redirect('/'); // Leite zur Hauptseite zurück, das Skript dort übernimmt
    } catch (error) {
        console.error('Token-Fehler:', error.response ? error.response.data : error.message);
        res.redirect('/#error=token_failed');
    }
});

// API-Route, die prüft, ob der Nutzer eingeloggt ist
app.get('/api/status', (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (token) {
        res.json({ loggedIn: true, token });
    } else {
        res.status(401).json({ loggedIn: false });
    }
});

// API-Route zum Abrufen der Playlists
app.get('/api/playlists', async (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (!token) return res.status(401).json({ message: "Nicht autorisiert" });

    try {
        const playlistData = await axios.get('https://api.spotify.com/v1/me/playlists', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(playlistData.data);
    } catch (error) {
        res.status(500).json({ message: "Fehler beim Abrufen der Playlists" });
    }
});

// ======================================================================
//  WEBSOCKET LOGIK (Deine komplette Spiellogik)
// ======================================================================
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    const playerId = Date.now().toString();
    ws.playerId = playerId;

    ws.on('message', message => {
        // Hier kommt deine gesamte WebSocket-Logik aus den vorherigen Versionen hin.
        // z.B. create-game, join-game, update-settings, start-game, etc.
        try {
            const { type, payload } = JSON.parse(message);
            const pin = ws.pin;
            const game = games[pin];

            switch(type) {
                case 'create-game':
                    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
                    ws.pin = newPin;
                    games[newPin] = {
                        hostId: playerId,
                        players: { [playerId]: { ws, nickname: payload.nickname, score: 0 } },
                        spotifyToken: payload.token,
                        settings: { playlistId: null, songCount: 10, guessTime: 30 },
                        gameState: 'LOBBY'
                    };
                    ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId } }));
                    broadcastLobbyUpdate(newPin);
                    break;
                // ... Füge hier all deine anderen `case`-Anweisungen ein
            }

        } catch (error) {
            console.error("Fehler bei der WebSocket-Nachricht:", error);
        }
    });

    ws.on('close', () => {
        // Deine Logik, um Spieler zu entfernen, wenn sie die Verbindung trennen
    });
});

function broadcastLobbyUpdate(pin) {
    const game = games[pin];
    if (!game) return;
    const playersData = Object.values(game.players).map(p => ({ id: p.ws.playerId, nickname: p.nickname, score: p.score }));
    const payload = { pin, hostId: game.hostId, players: playersData, settings: game.settings };
    const message = JSON.stringify({ type: 'lobby-update', payload });
    Object.values(game.players).forEach(p => p.ws.send(message));
}

// Server starten
server.listen(process.env.PORT || 8080, () => {
    console.log(`✅ Fakester-Server (Single-Page) läuft auf Port ${process.env.PORT || 8080}`);
});