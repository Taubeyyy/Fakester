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

let games = {};
// Wir speichern den Token des letzten eingeloggten Nutzers temporär
let lastAccessToken = null;

// HTTP ROUTEN
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => {
    const scopes = 'user-read-private user-read-email playlist-read-private streaming user-modify-playback-state';
    res.redirect(`https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${REDIRECT_URI}`);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    if (!code) return res.redirect('/#error=auth_failed');
    try {
        const response = await axios({ method: 'post', url: 'https://accounts.spotify.com/api/token', data: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }).toString(), headers: { 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')), 'Content-Type': 'application/x-www-form-urlencoded' } });
        // Speichere den Token serverseitig und in einem Cookie
        lastAccessToken = response.data.access_token;
        res.cookie('spotify_auth_present', 'true', { maxAge: 3600000 }); // Ein einfacher Cookie, der nur anzeigt, dass wir eingeloggt sind
        res.redirect('/');
    } catch (error) { res.redirect('/#error=token_failed'); }
});

app.get('/api/status', (req, res) => {
    // Überprüft, ob der einfache Cookie da ist
    if (req.cookies.spotify_auth_present && lastAccessToken) { res.json({ loggedIn: true }); } 
    else { res.status(401).json({ loggedIn: false }); }
});

app.get('/api/playlists', async (req, res) => {
    if (!lastAccessToken) return res.status(401).json({ message: "Nicht autorisiert" });
    try {
        const d = await axios.get('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${lastAccessToken}` } });
        res.json(d.data);
    } catch (e) {
        console.error("Fehler bei Playlist-Abruf:", e.response ? e.response.data : e.message);
        res.status(500).json({ message: "Fehler beim Abrufen der Playlists" });
    }
});

// WEBSOCKET LOGIK (bleibt größtenteils gleich)
// Der einzige Unterschied ist, dass wir den Token nicht mehr aus den Cookies holen müssen
// ... (der Rest von server.js bleibt wie im vorherigen Code)
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws, req) => {
    const playerId = Date.now().toString(); ws.playerId = playerId;
    ws.on('message', message => { try { const data = JSON.parse(message); handleWebSocketMessage(ws, data); } catch (e) { console.error("Fehler:", e); } });
    ws.on('close', () => handlePlayerDisconnect(ws));
});
function handleWebSocketMessage(ws, { type, payload }) {
    const { playerId } = ws; const pin = ws.pin; const game = games[pin];
    switch (type) {
        case 'create-game':
            const newPin = generatePin(); ws.pin = newPin;
            games[newPin] = { hostId: playerId, players: { [playerId]: { ws, nickname: payload.nickname, score: 0 } }, settings: { playlistId: null, songCount: 10, guessTime: 30 }, gameState: 'LOBBY' };
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
            if (game && game.hostId === playerId && game.settings.playlistId) { startGame(pin); }
            break;
        case 'submit-guess':
            if (game && game.gameState === 'PLAYING') { if (!game.guesses) game.guesses = {}; game.guesses[playerId] = payload.guess; ws.send(JSON.stringify({ type: 'guess-received' })); }
            break;
        case 'leave-game':
            handlePlayerDisconnect(ws);
            break;
        case 'play-track':
            if (game && game.hostId === playerId && lastAccessToken) {
                const { spotifyId, deviceId } = payload;
                axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, 
                    { uris: [`spotify:track:${spotifyId}`] },
                    { headers: { 'Authorization': `Bearer ${lastAccessToken}`, 'Content-Type': 'application/json' } }
                ).catch(err => console.error("Spotify Play API Fehler:", err.response ? err.response.data : err.message));
            }
            break;
    }
}
async function startGame(pin) {
    const game = games[pin]; game.gameState = 'PLAYING'; game.currentRound = 0; Object.values(game.players).forEach(p => p.score = 0);
    if(!lastAccessToken) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Host-Token nicht gefunden. Bitte neu anmelden.' } }); game.gameState = 'LOBBY'; return; }
    const tracks = await getPlaylistTracks(game.settings.playlistId, lastAccessToken);
    if (!tracks || tracks.length === 0) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist ist leer oder konnte nicht geladen werden.' } }); game.gameState = 'LOBBY'; return; }
    const songCount = Math.min(game.settings.songCount, tracks.length);
    game.songList = tracks.sort(() => 0.5 - Math.random()).slice(0, songCount);
    startRoundCountdown(pin);
}
function startRoundCountdown(pin) { const game = games[pin]; if (!game || game.currentRound >= game.songList.length) { return endGame(pin); } broadcastToLobby(pin, { type: 'round-countdown', payload: { round: game.currentRound + 1, totalRounds: game.songList.length } }); setTimeout(() => { startNewRound(pin); }, 5000); }
function startNewRound(pin) { const game = games[pin]; if (!game) return; game.currentRound++; game.guesses = {}; game.currentSong = game.songList[game.currentRound - 1]; broadcastToLobby(pin, { type: 'new-round', payload: { round: game.currentRound, totalRounds: game.songList.length, guessTime: game.settings.guessTime, song: { spotifyId: game.currentSong.spotifyId }, scores: getScores(pin) } }); game.roundTimer = setTimeout(() => evaluateRound(pin), game.settings.guessTime * 1000); }
function evaluateRound(pin) { const game = games[pin]; if (!game) return; clearTimeout(game.roundTimer); const song = game.currentSong; Object.keys(game.players).forEach(pId => { const player = game.players[pId]; const guess = game.guesses[pId]; if (!guess) return; let roundScore = 0; if (guess.title && song.title.toLowerCase() === guess.title.toLowerCase()) roundScore += 75; if (guess.artist && song.artist.toLowerCase() === guess.artist.toLowerCase()) roundScore += 75; const yearDiff = Math.abs(guess.year - song.year); if (yearDiff === 0) { roundScore += 250; } else if (yearDiff <= 5) { roundScore += 100; } else if (yearDiff <= 10) { roundScore += 50; } player.score += roundScore; }); broadcastToLobby(pin, { type: 'round-result', payload: { song, scores: getScores(pin) } }); setTimeout(() => startRoundCountdown(pin), 8000); }
function endGame(pin) { const game = games[pin]; if (!game) return; game.gameState = 'FINISHED'; broadcastToLobby(pin, { type: 'game-over', payload: { scores: getScores(pin) } }); }
function handlePlayerDisconnect(ws) { const pin = ws.pin; const game = games[pin]; if (!game) return; delete game.players[ws.playerId]; if (Object.keys(game.players).length === 0) { delete games[pin]; } else { if (ws.playerId === game.hostId) { game.hostId = Object.keys(game.players)[0]; } broadcastLobbyUpdate(pin); } }
function generatePin() { let pin; do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]); return pin; }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws.readyState === WebSocket.OPEN) { player.ws.send(messageString); } }); }
function broadcastLobbyUpdate(pin) { const game = games[pin]; if (!game) return; const payload = { pin, hostId: game.hostId, players: getScores(pin), settings: game.settings }; broadcastToLobby(pin, { type: 'lobby-update', payload }); }
function getScores(pin) { const game = games[pin]; if (!game) return []; return Object.values(game.players).map(p => ({ id: p.ws.playerId, nickname: p.nickname, score: p.score })).sort((a, b) => b.score - a.score); }
async function getPlaylistTracks(playlistId, token) { try { const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, { headers: { 'Authorization': `Bearer ${token}` } }); return response.data.items.map(item => item.track).filter(track => track && track.id && track.name && track.artists[0] && track.artists[0].name && track.album && track.album.release_date).map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0].name, year: parseInt(track.album.release_date.substring(0, 4)) })); } catch (error) { console.error("Fehler bei Playlist-Tracks:", error.message); return null; } }
server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
