const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const axios = require('axios');
const cookieParser = require('cookie-parser');
require('dotenv').config();

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

app.use(express.static(__dirname));
app.use(cookieParser());
app.use(express.json());

let games = {};

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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

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
    console.log("Anfrage an /api/playlists erhalten.");
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.error("/api/playlists: Kein Token gefunden.");
        return res.status(401).json({ message: "Nicht autorisiert" });
    }
    try {
        console.log("/api/playlists: Rufe Spotify API ab...");
        const d = await axios.get('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${token}` } });
        console.log("/api/playlists: Erfolgreiche Antwort von Spotify erhalten.");
        res.json(d.data);
    } catch (e) { 
        console.error("!!! Spotify /playlists API Fehler:", e.response ? JSON.stringify(e.response.data, null, 2) : e.message); 
        res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Playlists" }); 
    }
});

app.get('/api/devices', async (req, res) => {
    console.log("Anfrage an /api/devices erhalten.");
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.error("/api/devices: Kein Token gefunden.");
        return res.status(401).json({ message: "Nicht autorisiert" });
    }
    try {
        console.log("/api/devices: Rufe Spotify API ab...");
        const d = await axios.get('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } });
        console.log("/api/devices: Erfolgreiche Antwort von Spotify erhalten.");
        res.json(d.data);
    } catch (e) { 
        console.error("!!! Spotify /devices API Fehler:", e.response ? JSON.stringify(e.response.data, null, 2) : e.message); 
        res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Geräte" }); 
    }
});

const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    const playerId = Date.now().toString(); ws.playerId = playerId;
    ws.on('message', message => { try { const data = JSON.parse(message); handleWebSocketMessage(ws, data); } catch (e) { console.error("Fehler bei WebSocket-Nachricht:", e); } });
    ws.on('close', () => handlePlayerDisconnect(ws));
});

function handleWebSocketMessage(ws, { type, payload }) {
    const { playerId } = ws; const pin = ws.pin; const game = games[pin];
    if (!game && type !== 'create-game' && type !== 'join-game') return;
    switch (type) {
        case 'create-game':
            const newPin = generatePin();
            ws.pin = newPin;
            games[newPin] = {
                hostId: playerId, players: { [playerId]: { ws, nickname: payload.nickname, score: 0 } },
                settings: { deviceId: null, playlistId: null, songCount: 10, guessTime: 30 },
                hostToken: payload.token, gameState: 'LOBBY', gameMode: payload.gameMode || 'quiz',
                readyPlayers: [], timeline: [],
            };
            ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId } }));
            broadcastLobbyUpdate(newPin);
            break;
        case 'join-game': const gameToJoin = games[payload.pin]; if (gameToJoin && gameToJoin.gameState === 'LOBBY') { ws.pin = payload.pin; gameToJoin.players[playerId] = { ws, nickname: payload.nickname, score: 0 }; ws.send(JSON.stringify({ type: 'join-success', payload: { pin: payload.pin, playerId } })); broadcastLobbyUpdate(payload.pin); } else { ws.send(JSON.stringify({ type: 'error', payload: { message: 'Ungültiger PIN oder Spiel läuft bereits.' } })); } break;
        case 'update-settings': if (game.hostId === playerId) { game.settings = { ...game.settings, ...payload }; broadcastLobbyUpdate(pin); } break;
        case 'start-game': if (game.hostId === playerId && game.settings.playlistId && game.settings.deviceId) { startGame(pin); } break;
        case 'submit-guess': if (game.gameState === 'PLAYING') { if (!game.guesses) game.guesses = {}; game.guesses[playerId] = payload.guess || payload; ws.send(JSON.stringify({ type: 'guess-received' })); } break;
        case 'player-ready':
            if (game && !game.readyPlayers.includes(playerId)) {
                game.readyPlayers.push(playerId);
                broadcastToLobby(pin, { type: 'ready-update', payload: { readyCount: game.readyPlayers.length, totalPlayers: Object.keys(game.players).length } });
                if (game.gameMode === 'quiz' && game.readyPlayers.length === Object.keys(game.players).length) {
                    clearTimeout(game.roundTimer);
                    evaluateRound(pin);
                }
            }
            break;
    }
}
async function startGame(pin) {
    const game = games[pin];
    try {
        await axios.put(`https://api.spotify.com/v1/me/player`, { device_ids: [game.settings.deviceId], play: false }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } });
    } catch (e) {
        let shortMessage = 'Ausgewähltes Gerät konnte nicht aktiviert werden.';
        if (e.response && e.response.data && e.response.data.error) {
            const { reason } = e.response.data.error;
            if (reason === 'NO_ACTIVE_DEVICE') { shortMessage = 'Kein aktives Spotify-Gerät gefunden. Öffne Spotify auf dem Gerät.'; } 
            else if (reason === 'PREMIUM_REQUIRED') { shortMessage = 'Für diese Funktion ist Spotify Premium nötig.'; }
        }
        broadcastToLobby(pin, { type: 'error', payload: { message: shortMessage } });
        return;
    }
    game.gameState = 'PLAYING';
    game.currentRound = 0;
    Object.values(game.players).forEach(p => { p.score = 0; });
    const tracks = await getPlaylistTracks(game.settings.playlistId, game.hostToken);
    if (!tracks || tracks.length === 0) {
        broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist ist leer oder Songs konnten nicht geladen werden.' } });
        game.gameState = 'LOBBY';
        return;
    }
    game.songList = tracks.sort(() => 0.5 - Math.random());
    if (game.gameMode === 'timeline') {
        game.timeline = [];
        const startCard = game.songList.shift();
        if (startCard) game.timeline.push(startCard);
    } else {
        if (game.settings.songCount > 0) {
            game.songList = game.songList.slice(0, Math.min(game.settings.songCount, game.songList.length));
        }
    }
    startRoundCountdown(pin);
}
function startRoundCountdown(pin) {
    const game = games[pin];
    if (!game || !game.songList || game.currentRound >= game.songList.length) { return endGame(pin); }
    broadcastToLobby(pin, { type: 'round-countdown', payload: { round: game.currentRound + 1, totalRounds: game.songList.length } });
    setTimeout(() => startNewRound(pin), 5000);
}
function startNewRound(pin) {
    const game = games[pin]; if (!game) return;
    game.currentRound++;
    game.guesses = {};
    game.readyPlayers = [];
    game.currentSong = game.songList[game.currentRound - 1];
    if (!game.currentSong) return endGame(pin);
    axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${game.settings.deviceId}`, { uris: [`spotify:track:${game.currentSong.spotifyId}`] }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } })
        .catch(err => console.error(`[${pin}] Spotify Play API Fehler:`, err.response ? err.response.data : err.message));
    const totalPlayers = Object.keys(game.players).length;
    let payload = { 
        round: game.currentRound, totalRounds: game.songList.length, 
        scores: getScores(pin), hostId: game.hostId,
        totalPlayers: totalPlayers, gameMode: game.gameMode
    };
    if (game.gameMode === 'timeline') {
        payload.timeline = game.timeline;
        payload.currentSong = { title: game.currentSong.title, artist: game.currentSong.artist };
    } else {
        payload.guessTime = game.settings.guessTime;
    }
    broadcastToLobby(pin, { type: 'new-round', payload });
    game.roundTimer = setTimeout(() => evaluateRound(pin), (game.settings.guessTime || 30) * 1000);
}
function evaluateRound(pin) {
    const game = games[pin]; if (!game) return;
    clearTimeout(game.roundTimer);
    const song = game.currentSong;
    let resultsPayload = { song, gameMode: game.gameMode };
    if (game.gameMode === 'timeline') {
        Object.keys(game.players).forEach(pId => {
            const player = game.players[pId];
            const guess = game.guesses[pId];
            if (guess === undefined) {
                player.lastGuess = { wasCorrect: false };
                return
            };
            const correctIndex = game.timeline.findIndex(card => card.year > song.year);
            const finalIndex = correctIndex === -1 ? game.timeline.length : correctIndex;
            const wasCorrect = finalIndex === guess.index;
            if (wasCorrect) player.score += 100;
            player.lastGuess = { index: guess.index, wasCorrect: wasCorrect };
        });
        game.timeline.push(song);
        game.timeline.sort((a, b) => a.year - b.year);
        resultsPayload.timeline = game.timeline;
    } else {
        Object.keys(game.players).forEach(pId => {
            const player = game.players[pId];
            const guess = game.guesses[pId];
            player.lastPointsBreakdown = { artist: 0, title: 0, year: 0 };
            if (!guess) return;
            const normalizedSongTitle = normalizeString(song.title);
            const normalizedSongArtist = normalizeString(song.artist);
            const normalizedGuessTitle = normalizeString(guess.title);
            const normalizedGuessArtist = normalizeString(guess.artist);
            const pointsBreakdown = { artist: 0, title: 0, year: 0 };
            const artistDist = levenshteinDistance(normalizedSongArtist, normalizedGuessArtist);
            if (artistDist === 0) { pointsBreakdown.artist = 75; }
            else if (artistDist <= 2) { pointsBreakdown.artist = 40; }
            const titleDist = levenshteinDistance(normalizedSongTitle, normalizedGuessTitle);
            if (titleDist === 0) { pointsBreakdown.title = 75; }
            else if (titleDist <= 3) { pointsBreakdown.title = 40; }
            if (guess.year > 1000) {
                const yearDiff = Math.abs(guess.year - song.year);
                if (yearDiff === 0) { pointsBreakdown.year = 100; }
                else if (yearDiff <= 2) { pointsBreakdown.year = 50; }
                else if (yearDiff <= 5) { pointsBreakdown.year = 25; }
            }
            player.score += pointsBreakdown.artist + pointsBreakdown.title + pointsBreakdown.year;
            player.lastPointsBreakdown = pointsBreakdown;
        });
    }
    resultsPayload.scores = getScores(pin);
    broadcastToLobby(pin, { type: 'round-result', payload: resultsPayload });
    setTimeout(() => startRoundCountdown(pin), 10000);
}
function endGame(pin) { const game = games[pin]; if (!game) return; game.gameState = 'FINISHED'; broadcastToLobby(pin, { type: 'game-over' }); }
function handlePlayerDisconnect(ws) { const pin = ws.pin; const game = games[pin]; if (!game) return; delete game.players[ws.playerId]; if (Object.keys(game.players).length === 0) { delete games[pin]; } else { if (ws.playerId === game.hostId) { game.hostId = Object.keys(game.players)[0]; } broadcastLobbyUpdate(pin); } }
function generatePin() { let pin; do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]); return pin; }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws.readyState === WebSocket.OPEN) { player.ws.send(messageString); } }); }
function broadcastLobbyUpdate(pin) { const game = games[pin]; if (!game) return; const payload = { pin, hostId: game.hostId, players: getScores(pin), settings: game.settings }; broadcastToLobby(pin, { type: 'lobby-update', payload }); }
function getScores(pin) {
    const game = games[pin];
    if (!game) return [];
    return Object.values(game.players).map(p => ({
        id: p.ws.playerId, nickname: p.nickname, score: p.score,
        pointsBreakdown: p.lastPointsBreakdown, lastGuess: p.lastGuess,
    })).sort((a, b) => b.score - a.score);
}
async function getPlaylistTracks(playlistId, token) {
    try {
        const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, { headers: { 'Authorization': `Bearer ${token}` } });
        return response.data.items
            .map(item => item.track)
            .filter(track => track && track.id && track.name && track.artists && track.artists.length > 0 && track.album && track.album.release_date)
            .map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0].name, year: parseInt(track.album.release_date.substring(0, 4)) }));
    } catch (error) {
        console.error("Fehler beim Abrufen der Playlist-Tracks:", error.response ? error.response.data : error.message);
        return null;
    }
}
server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
