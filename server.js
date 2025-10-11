// Pakete importieren
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const axios = require('axios');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.use(express.static(__dirname));
app.use(cookieParser());
app.use(express.json());

let games = {};

// HTTP ROUTEN
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/login', (req, res) => {
    const scopes = 'user-read-private user-read-email playlist-read-private streaming user-modify-playback-state user-read-playback-state';
    res.redirect('https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, scope: scopes, redirect_uri: REDIRECT_URI }).toString());
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    if (!code) return res.redirect('/#error=auth_failed');
    try {
        const response = await axios({
            method: 'post', url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }).toString(),
            headers: { 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')), 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.cookie('spotify_access_token', response.data.access_token, { maxAge: 3600000 });
        res.redirect('/');
    } catch (error) { res.redirect('/#error=token_failed'); }
});

app.post('/logout', (req, res) => {
    res.clearCookie('spotify_access_token');
    res.status(200).json({ message: 'Erfolgreich ausgeloggt' });
});

app.get('/api/status', (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (token) { res.json({ loggedIn: true, token: token }); }
    else { res.status(401).json({ loggedIn: false }); }
});

app.get('/api/playlists', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Nicht autorisiert" });
    try {
        const d = await axios.get('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${token}` } });
        res.json(d.data);
    } catch (e) { res.status(500).json({ message: "Fehler beim Abrufen der Playlists" }); }
});

app.get('/api/devices', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Nicht autorisiert" });
    try {
        const d = await axios.get('spotify.com/account', { headers: { 'Authorization': `Bearer ${token}` } });
        res.json(d.data);
    } catch (e) { res.status(500).json({ message: "Fehler beim Abrufen der Geräte" }); }
});

// WEBSOCKET LOGIK
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    const playerId = Date.now().toString(); ws.playerId = playerId;
    ws.on('message', message => { try { const data = JSON.parse(message); handleWebSocketMessage(ws, data); } catch (e) { console.error("Fehler bei WebSocket-Nachricht:", e); } });
    ws.on('close', () => handlePlayerDisconnect(ws));
});

function handleWebSocketMessage(ws, { type, payload }) {
    const { playerId } = ws; const pin = ws.pin; const game = games[pin];
    switch (type) {
        case 'create-game':
            const newPin = generatePin(); ws.pin = newPin;
            games[newPin] = { hostId: playerId, players: { [playerId]: { ws, nickname: payload.nickname, score: 0 } }, settings: { deviceId: null, playlistId: null, songCount: 10, guessTime: 30 }, hostToken: payload.token, gameState: 'LOBBY' };
            ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId } }));
            broadcastLobbyUpdate(newPin);
            break;
        case 'join-game':
            const gameToJoin = games[payload.pin];
            if (gameToJoin && gameToJoin.gameState === 'LOBBY') {
                ws.pin = payload.pin; gameToJoin.players[playerId] = { ws, nickname: payload.nickname, score: 0 };
                ws.send(JSON.stringify({ type: 'join-success', payload: { pin: payload.pin, playerId } }));
                broadcastLobbyUpdate(payload.pin);
            } else { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Ungültiger PIN oder Spiel läuft bereits.' } })); }
            break;
        case 'update-settings':
            if (game && game.hostId === playerId) { game.settings = { ...game.settings, ...payload }; broadcastLobbyUpdate(pin); }
            break;
        case 'start-game':
            if (game && game.hostId === playerId && game.settings.playlistId && game.settings.deviceId) { startGame(pin); }
            break;
        case 'submit-guess':
            if (game && game.gameState === 'PLAYING') { if (!game.guesses) game.guesses = {}; game.guesses[playerId] = payload.guess; ws.send(JSON.stringify({ type: 'guess-received' })); }
            break;
    }
}
async function startGame(pin) {
    const game = games[pin]; const token = game.hostToken; const deviceId = game.settings.deviceId;
    try {
        await axios.put(`https://api.spotify.com/v1/playlists/[playlist_id]/tracks?device_id=$...`, { device_ids: [deviceId], play: false }, { headers: { 'Authorization': `Bearer ${token}` } });
    } catch (e) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Ausgewähltes Gerät nicht aktiv.' } }); return; }
    game.gameState = 'PLAYING'; game.currentRound = 0; Object.values(game.players).forEach(p => p.score = 0);
    const tracks = await getPlaylistTracks(game.settings.playlistId, token);
    if (!tracks || tracks.length === 0) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist ist leer.' } }); game.gameState = 'LOBBY'; return; }
    game.songList = tracks.sort(() => 0.5 - Math.random()).slice(0, Math.min(game.settings.songCount, tracks.length));
    startRoundCountdown(pin);
}
function startRoundCountdown(pin) {
    const game = games[pin];
    if (!game || game.currentRound >= game.songList.length) { return endGame(pin); }
    broadcastToLobby(pin, { type: 'round-countdown', payload: { round: game.currentRound + 1, totalRounds: game.songList.length } });
    setTimeout(() => startNewRound(pin), 5000);
}
function startNewRound(pin) {
    const game = games[pin]; if (!game) return;
    game.currentRound++; game.guesses = {}; game.currentSong = game.songList[game.currentRound - 1];
    axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${game.settings.deviceId}`, { uris: [`spotify:track:${game.currentSong.spotifyId}`] }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } })
        .catch(err => console.error(`[${pin}] Spotify Play API Fehler:`, err.response ? err.response.data : err.message));
    broadcastToLobby(pin, { type: 'new-round', payload: { round: game.currentRound, totalRounds: game.songList.length, guessTime: game.settings.guessTime, scores: getScores(pin) } });
    game.roundTimer = setTimeout(() => evaluateRound(pin), game.settings.guessTime * 1000);
}
function evaluateRound(pin) {
    const game = games[pin]; if (!game) return;
    clearTimeout(game.roundTimer);
    const song = game.currentSong;
    Object.keys(game.players).forEach(pId => {
        const player = game.players[pId]; const guess = game.guesses[pId]; if (!guess) return;
        let roundScore = 0;
        if (guess.title && song.title.toLowerCase() === guess.title.toLowerCase()) roundScore += 75;
        if (guess.artist && song.artist.toLowerCase() === guess.artist.toLowerCase()) roundScore += 75;
        const yearDiff = Math.abs(guess.year - song.year);
        if (yearDiff === 0) { roundScore += 250; } else if (yearDiff <= 5) { roundScore += 100; } else if (yearDiff <= 10) { roundScore += 50; }
        player.score += roundScore;
    });
    broadcastToLobby(pin, { type: 'round-result', payload: { song, scores: getScores(pin) } });
    setTimeout(() => startRoundCountdown(pin), 8000);
}
function endGame(pin) {
    const game = games[pin]; if (!game) return;
    game.gameState = 'FINISHED';
    broadcastToLobby(pin, { type: 'game-over', payload: { scores: getScores(pin) } });
}
function handlePlayerDisconnect(ws) {
    const pin = ws.pin; const game = games[pin]; if (!game) return;
    delete game.players[ws.playerId];
    if (Object.keys(game.players).length === 0) { delete games[pin]; }
    else { if (ws.playerId === game.hostId) { game.hostId = Object.keys(game.players)[0]; } broadcastLobbyUpdate(pin); }
}
function generatePin() { let pin; do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]); return pin; }
function broadcastToLobby(pin, message) {
    const game = games[pin]; if (!game) return;
    const messageString = JSON.stringify(message);
    Object.values(game.players).forEach(player => { if (player.ws.readyState === WebSocket.OPEN) { player.ws.send(messageString); } });
}
function broadcastLobbyUpdate(pin) {
    const game = games[pin]; if (!game) return;
    const payload = { pin, hostId: game.hostId, players: getScores(pin), settings: game.settings };
    broadcastToLobby(pin, { type: 'lobby-update', payload });
}
function getScores(pin) {
    const game = games[pin]; if (!game) return [];
    return Object.values(game.players).map(p => ({ id: p.ws.playerId, nickname: p.nickname, score: p.score })).sort((a, b) => b.score - a.score);
}
async function getPlaylistTracks(playlistId, token) {
    try {
        const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, { headers: { 'Authorization': `Bearer ${token}` } });
        return response.data.items.map(item => item.track).filter(track => track && track.id && track.name && track.artists[0] && track.artists[0].name && track.album && track.album.release_date).map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0].name, year: parseInt(track.album.release_date.substring(0, 4)) }));
    } catch (error) { console.error("Fehler bei Playlist-Tracks:", error.message); return null; }
}
server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
