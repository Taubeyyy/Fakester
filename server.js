const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const axios = require('axios');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

process.on('uncaughtException', (err, origin) => {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('!! UNERWARTETER FEHLER (UNCAUGHT EXCEPTION) !!');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error(`Fehler: ${err.stack}`);
    console.error(`Ursprung: ${origin}`);
});

const app = express();
const server = http.createServer(app);
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

app.use(express.static(__dirname));
app.use(cookieParser());
app.use(express.json());

let games = {};
const onlineUsers = new Map();

function levenshteinDistance(s1, s2) {
    if (s1 === null || s2 === null) return 99;
    s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/\(.*\)|\[.*\]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').trim();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY
    });
});

app.get('/login', (req, res) => {
    const scopes = 'user-read-private user-read-email playlist-read-private streaming user-modify-playback-state user-read-playback-state';
    res.redirect('https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, scope: scopes, redirect_uri: REDIRECT_URI }).toString());
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    if (!code) return res.redirect('/#error=auth_failed');
    try {
        const response = await axios({ method: 'post', url: 'https://accounts.spotify.com/api/token', data: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }).toString(), headers: { 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')), 'Content-Type': 'application/x-www-form-urlencoded' } });
        res.cookie('spotify_access_token', response.data.access_token, { httpOnly: true, secure: true, maxAge: 3600000 });
        res.redirect('/');
    } catch (error) { res.redirect('/#error=token_failed'); }
});

app.post('/logout', (req, res) => { res.clearCookie('spotify_access_token'); res.status(200).json({ message: 'Erfolgreich ausgeloggt' }); });
app.get('/api/status', (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (token) { res.json({ loggedIn: true, token: token }); } else { res.status(401).json({ loggedIn: false }); }
});

app.get('/api/playlists', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Nicht autorisiert" });
    try {
        const d = await axios.get('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${token}` } });
        res.json(d.data);
    } catch (e) { res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Playlists" }); }
});

app.get('/api/devices', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Nicht autorisiert" });
    try {
        const d = await axios.get('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } });
        res.json(d.data);
    } catch (e) { res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Geräte" }); }
});

const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    ws.on('message', message => { try { const data = JSON.parse(message); handleWebSocketMessage(ws, data); } catch (e) { console.error("Fehler bei WebSocket-Nachricht:", e); } });
    ws.on('close', () => handlePlayerDisconnect(ws));
});

function handleWebSocketMessage(ws, { type, payload }) {
    let { pin, playerId } = ws;
    let game = games[pin];

    if (type === 'register-online') {
        ws.playerId = payload.userId;
        onlineUsers.set(payload.userId, ws);
        return;
    }
    if (type === 'reconnect') {
        const reconnectPin = payload.pin;
        const reconnectPlayerId = payload.playerId;
        game = games[reconnectPin];
        if (game && game.players[reconnectPlayerId] && !game.players[reconnectPlayerId].isConnected) {
            ws.pin = reconnectPin;
            ws.playerId = reconnectPlayerId;
            game.players[reconnectPlayerId].ws = ws;
            game.players[reconnectPlayerId].isConnected = true;
            onlineUsers.set(reconnectPlayerId, ws);
            showToastToPlayer(ws, 'Verbindung wiederhergestellt!');
            broadcastLobbyUpdate(reconnectPin);
        }
        return;
    }

    if (!game && !['create-game', 'join-game'].includes(type)) return;

    switch (type) {
        case 'create-game':
            const newPin = generatePin();
            ws.pin = newPin;
            ws.playerId = payload.user.id;
            games[newPin] = {
                hostId: payload.user.id,
                players: { [payload.user.id]: { ws, nickname: payload.user.username, score: 0, lives: 3, isConnected: true } },
                settings: { deviceId: null, playlistId: null, songCount: 10, guessTime: 30, gameType: 'points' },
                hostToken: payload.token, gameState: 'LOBBY', gameMode: payload.gameMode || 'quiz'
            };
            ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId: payload.user.id, isHost: true } }));
            broadcastLobbyUpdate(newPin);
            break;
        case 'join-game':
            const gameToJoin = games[payload.pin];
            if (gameToJoin && gameToJoin.gameState === 'LOBBY') {
                ws.pin = payload.pin;
                ws.playerId = payload.user.id;
                gameToJoin.players[payload.user.id] = { ws, nickname: payload.user.username, score: 0, lives: 3, isConnected: true };
                ws.send(JSON.stringify({ type: 'join-success', payload: { pin: payload.pin, playerId: payload.user.id, gameState: 'LOBBY', isHost: false } }));
                broadcastLobbyUpdate(payload.pin);
            } else { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Ungültiger PIN oder Spiel läuft bereits.' } })); }
            break;
        case 'update-settings':
            if (game && game.hostId === playerId) {
                game.settings = { ...game.settings, ...payload };
                broadcastLobbyUpdate(pin);
            }
            break;
        case 'invite-friend':
            if (game) {
                const targetSocket = onlineUsers.get(payload.targetId);
                if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                    targetSocket.send(JSON.stringify({ type: 'game-invite', payload: { pin: pin, hostName: game.players[game.hostId].nickname } }));
                    showToastToPlayer(ws, 'Einladung gesendet!');
                } else { showToastToPlayer(ws, 'Freund ist nicht online.', true); }
            }
            break;
        case 'start-game': if (game.hostId === playerId && game.settings.playlistId && game.settings.deviceId) { startGame(pin); } break;
        case 'submit-guess':
            if (game.gameState === 'PLAYING') {
                if (game.gameMode === 'quiz' || !game.readyPlayers.includes(playerId)) {
                    if (!game.guesses) game.guesses = {};
                    game.guesses[playerId] = payload.guess || payload;
                    ws.send(JSON.stringify({ type: 'guess-received' }));
                }
            }
            break;
    }
}

function handlePlayerDisconnect(ws) {
    const { pin, playerId } = ws;
    onlineUsers.delete(playerId);
    const game = games[pin];
    if (!game || !game.players[playerId]) return;

    game.players[playerId].isConnected = false;
    broadcastToLobby(pin, { type: 'toast', payload: { message: `${game.players[playerId].nickname} hat die Verbindung verloren...` } });

    setTimeout(() => {
        const currentGame = games[pin];
        if (currentGame && currentGame.players[playerId] && !currentGame.players[playerId].isConnected) {
            delete currentGame.players[playerId];
            if (Object.keys(currentGame.players).length === 0) {
                delete games[pin];
            } else {
                if (playerId === currentGame.hostId) {
                    currentGame.hostId = Object.keys(currentGame.players)[0];
                }
                broadcastLobbyUpdate(pin);
            }
        }
    }, 30000);
    broadcastLobbyUpdate(pin);
}

function generatePin() { let pin; do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]); return pin; }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws.readyState === WebSocket.OPEN) { player.ws.send(messageString); } }); }
function broadcastLobbyUpdate(pin) { const game = games[pin]; if (!game) return; const payload = { pin, hostId: game.hostId, players: getScores(pin), settings: game.settings }; broadcastToLobby(pin, { type: 'lobby-update', payload }); }
function getScores(pin) { const game = games[pin]; if (!game) return []; return Object.values(game.players).map(p => ({ id: p.ws.playerId, nickname: p.nickname, score: p.score, lives: p.lives, isConnected: p.isConnected })).sort((a, b) => b.score - a.score); }
function showToastToPlayer(ws, message, isError = false) { if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'toast', payload: { message, isError } })); } }
async function getPlaylistTracks(playlistId, token) { try { const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, { headers: { 'Authorization': `Bearer ${token}` } }); return response.data.items.map(item => item.track).filter(track => track && track.id).map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0].name, year: parseInt(track.album.release_date.substring(0, 4)), popularity: track.popularity, albumArtUrl: track.album.images[0]?.url })); } catch (error) { console.error("Fehler beim Abrufen der Playlist-Tracks:", error.response?.data || error.message); return null; } }

async function startGame(pin) {
    const game = games[pin];
    try { await axios.put(`https://api.spotify.com/v1/me/player`, { device_ids: [game.settings.deviceId], play: false }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } }); } 
    catch (e) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Ausgewähltes Gerät konnte nicht aktiviert werden.' } }); return; }
    
    game.gameState = 'PLAYING'; game.currentRound = 0; Object.values(game.players).forEach(p => { p.score = 0; p.lives = 3; });
    const tracks = await getPlaylistTracks(game.settings.playlistId, game.hostToken);
    if (!tracks || tracks.length < 1) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist ist leer oder konnte nicht geladen werden.' } }); game.gameState = 'LOBBY'; return; }
    
    game.songList = shuffleArray(tracks);
    if (game.settings.songCount > 0) { game.songList = game.songList.slice(0, game.settings.songCount); }
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
    game.currentSong = game.songList[game.currentRound];
    game.currentRound++; game.guesses = {}; game.readyPlayers = [];
    if (!game.currentSong) return endGame(pin);
    axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${game.settings.deviceId}`, { uris: [`spotify:track:${game.currentSong.spotifyId}`] }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } }).catch(err => console.error(`[${pin}] Spotify Play API Fehler:`, err.response?.data || err.message));
    
    let payload = {
        round: game.currentRound, totalRounds: game.songList.length,
        scores: getScores(pin), guessTime: game.settings.guessTime,
        gameMode: game.gameMode, song: { albumArtUrl: game.currentSong.albumArtUrl }
    };
    broadcastToLobby(pin, { type: 'new-round', payload });
    game.roundTimer = setTimeout(() => evaluateRound(pin), game.settings.guessTime * 1000);
}

function evaluateRound(pin) { /* ... Deine Logik hier ... */ }
function endGame(pin) { /* ... Deine Logik hier ... */ }

server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
