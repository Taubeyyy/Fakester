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
    if (!s1 || !s2) return 99;
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
app.get('/api/config', (req, res) => res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }));
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

    if (type === 'register-online') { ws.playerId = payload.userId; onlineUsers.set(payload.userId, ws); return; }
    if (type === 'reconnect') {
        const { pin: reconnectPin, playerId: reconnectPlayerId } = payload;
        const gameToReconnect = games[reconnectPin];
        if (gameToReconnect && gameToReconnect.players[reconnectPlayerId] && !gameToReconnect.players[reconnectPlayerId].isConnected) {
            ws.pin = reconnectPin; ws.playerId = reconnectPlayerId;
            const player = gameToReconnect.players[reconnectPlayerId];
            player.ws = ws;
            player.isConnected = true;
            onlineUsers.set(reconnectPlayerId, ws);
            showToastToPlayer(ws, 'Verbindung wiederhergestellt!');
            
            const statePayload = {
                pin: reconnectPin, playerId: reconnectPlayerId, isHost: gameToReconnect.hostId === reconnectPlayerId,
                gameMode: gameToReconnect.gameMode, gameState: gameToReconnect.gameState, settings: gameToReconnect.settings,
                players: getScores(reconnectPin), currentRound: gameToReconnect.currentRound,
                totalRounds: gameToReconnect.songList ? gameToReconnect.songList.length : 0
            };

            if (gameToReconnect.gameState === 'PLAYING' || gameToReconnect.gameState === 'RESULTS') {
                 if(gameToReconnect.gameMode === 'timeline') {
                    statePayload.timeline = gameToReconnect.timeline;
                    statePayload.currentSong = { ...gameToReconnect.currentSong, year: undefined };
                } else if (gameToReconnect.gameState === 'RESULTS') {
                    statePayload.song = gameToReconnect.currentSong;
                }
            }
            ws.send(JSON.stringify({ type: 'reconnect-success', payload: statePayload }));
            broadcastLobbyUpdate(reconnectPin);
        }
        return;
    }
    if (!game && !['create-game', 'join-game'].includes(type)) return;

    switch (type) {
        case 'create-game':
            const newPin = generatePin();
            ws.pin = newPin; ws.playerId = payload.user.id;
            const initialSettings = { deviceId: null, playlistId: null, songCount: 10, guessTime: 30, gameType: payload.gameType || 'points', lives: payload.lives || 3, answerType: 'freestyle' };
            games[newPin] = {
                hostId: payload.user.id,
                players: { [payload.user.id]: { ws, nickname: payload.user.username, score: 0, lives: initialSettings.lives, isConnected: true, isReady: false, isGuest: payload.user.isGuest } },
                settings: initialSettings, hostToken: payload.token, gameState: 'LOBBY', gameMode: payload.gameMode || 'quiz'
            };
            ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId: payload.user.id, isHost: true, gameMode: payload.gameMode } }));
            broadcastLobbyUpdate(newPin);
            break;
        case 'join-game':
            const gameToJoin = games[payload.pin];
            if (gameToJoin && gameToJoin.gameState === 'LOBBY') {
                ws.pin = payload.pin; ws.playerId = payload.user.id;
                gameToJoin.players[payload.user.id] = { ws, nickname: payload.user.username, score: 0, lives: gameToJoin.settings.lives, isConnected: true, isReady: false, isGuest: payload.user.isGuest };
                ws.send(JSON.stringify({ type: 'join-success', payload: { pin: payload.pin, playerId: payload.user.id, isHost: false, gameMode: gameToJoin.gameMode } }));
                broadcastLobbyUpdate(payload.pin);
            } else {
                ws.send(JSON.stringify({ type: 'error', payload: { message: 'PIN ungültig oder Spiel läuft bereits.' } }));
            }
            break;
        case 'update-settings':
            if (game && game.hostId === playerId) { 
                game.settings = { ...game.settings, ...payload }; 
                if(payload.gameType === 'lives' || payload.lives) {
                    Object.values(game.players).forEach(p => p.lives = game.settings.lives);
                }
                broadcastLobbyUpdate(pin); 
            }
            break;
        case 'update-nickname':
            if (game && game.players[playerId]) {
                game.players[playerId].nickname = payload.newName;
                broadcastLobbyUpdate(pin);
            }
            break;
        case 'start-game': if (game && game.hostId === playerId && game.settings.playlistId && game.settings.deviceId) { startGame(pin); } break;
        case 'live-guess-update':
            if (game && game.gameState === 'PLAYING') {
                if (!game.guesses) game.guesses = {};
                if (!game.guesses[playerId]) {
                    game.guesses[playerId] = payload.guess;
                }
            }
            break;
        case 'player-ready':
            if (game && game.players[playerId] && (game.gameState === 'RESULTS' || game.gameState === 'PLAYING')) {
                game.players[playerId].isReady = true;
                const activePlayers = Object.values(game.players).filter(p=>p.isConnected && (game.settings.gameType === 'points' || p.lives > 0));
                const allReady = activePlayers.every(p => p.isReady);
                
                if (game.gameState === 'RESULTS' && allReady) {
                    clearTimeout(game.nextRoundTimer);
                    startRoundCountdown(pin);
                } else if (game.gameState === 'PLAYING' && allReady && game.gameMode !== 'timeline') {
                    clearTimeout(game.roundTimer);
                    evaluateRound(pin);
                }
            }
            break;
    }
}

async function handlePlayerDisconnect(ws) {
    const { pin, playerId } = ws;
    onlineUsers.delete(playerId);
    const game = games[pin];
    if (!game || !game.players[playerId] || !game.players[playerId].isConnected) return;

    const disconnectingPlayer = game.players[playerId];
    disconnectingPlayer.isConnected = false;

    if (game.gameState === 'PLAYING' || game.gameState === 'RESULTS') {
        if (!disconnectingPlayer.isGuest) {
            try {
                const { error } = await supabase.rpc('update_user_stats', {
                    user_id: playerId,
                    wins_increment: 0,
                    games_played_increment: 1,
                    correct_answers_increment: 0 
                });
                if (error) throw error;
            } catch (error) {
                console.error("Error updating stats on disconnect:", error.message);
            }
        }
    }

    if (game.gameState !== 'FINISHED') {
        broadcastToLobby(pin, { type: 'toast', payload: { message: `${disconnectingPlayer.nickname} hat die Verbindung verloren...` } });
    }
    broadcastLobbyUpdate(pin);

    setTimeout(() => {
        const currentGame = games[pin];
        if (currentGame && currentGame.players[playerId] && !currentGame.players[playerId].isConnected) {
            if (playerId === currentGame.hostId) {
                console.log(`[${pin}] Host hat die Verbindung verloren. Spiel wird beendet.`);
                broadcastToLobby(pin, { type: 'toast', payload: { message: 'Der Host hat das Spiel verlassen. Das Spiel wird beendet.', isError: true } });
                endGame(pin, true);
                return;
            }
            delete currentGame.players[playerId];
            if (Object.values(currentGame.players).filter(p => p.isConnected).length === 0) {
                console.log(`[${pin}] Alle Spieler haben die Verbindung verloren. Spiel wird beendet.`);
                endGame(pin, true);
            } else {
                broadcastLobbyUpdate(pin);
            }
        }
    }, 30000);
}

function generatePin() { let pin; do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]); return pin; }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws && player.ws.readyState === WebSocket.OPEN && player.isConnected) { player.ws.send(messageString); } }); }
function broadcastLobbyUpdate(pin) { const game = games[pin]; if (!game) return; const payload = { pin, hostId: game.hostId, players: getScores(pin), settings: game.settings, gameMode: game.gameMode }; broadcastToLobby(pin, { type: 'lobby-update', payload }); }
function getScores(pin) { const game = games[pin]; if (!game) return []; return Object.values(game.players).map(p => ({ id: p.ws.playerId, nickname: p.nickname, score: p.score, lives: p.lives, isConnected: p.isConnected, lastPointsBreakdown: p.lastPointsBreakdown })).sort((a, b) => b.score - a.score); }
function showToastToPlayer(ws, message, isError = false) { if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'toast', payload: { message, isError } })); } }
async function getPlaylistTracks(playlistId, token) { try { const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, { headers: { 'Authorization': `Bearer ${token}` } }); return response.data.items.map(item => item.track).filter(track => track && track.id).map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0].name, year: parseInt(track.album.release_date.substring(0, 4)), popularity: track.popularity, albumArtUrl: track.album.images[0]?.url })); } catch (error) { console.error("Fehler beim Abrufen der Playlist-Tracks:", error.response?.data || error.message); return null; } }

async function startGame(pin) {
    const game = games[pin];
    try { await axios.put(`https://api.spotify.com/v1/me/player`, { device_ids: [game.settings.deviceId], play: false }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } }); } 
    catch (e) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Ausgewähltes Gerät konnte nicht aktiviert werden.' } }); return; }
    
    game.gameState = 'PLAYING'; 
    game.currentRound = 0; 
    Object.values(game.players).forEach(p => { p.score = 0; p.lives = game.settings.lives; });
    
    const tracks = await getPlaylistTracks(game.settings.playlistId, game.hostToken);
    if (!tracks || tracks.length < 2) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist ist zu kurz oder konnte nicht geladen werden.' } }); game.gameState = 'LOBBY'; return; }
    
    game.songList = shuffleArray(tracks);
    const songCount = parseInt(game.settings.songCount);

    if (game.gameMode === 'timeline') {
        game.timeline = [game.songList.shift()];
        if (songCount > 0) {
            game.songList = game.songList.slice(0, songCount);
        }
    } else {
        if (songCount > 0) {
            game.songList = game.songList.slice(0, songCount); 
        }
    }
    startRoundCountdown(pin);
}

function startRoundCountdown(pin) {
    const game = games[pin];
    if (!game) return;
    Object.values(game.players).forEach(p => p.isReady = false);
    
    if (game.settings.gameType === 'points' && game.currentRound >= game.songList.length) { return endGame(pin); }
    const activePlayers = Object.values(game.players).filter(p => p.isConnected && p.lives > 0);
    if (game.settings.gameType === 'lives' && activePlayers.length <= 1) { return endGame(pin); }

    game.gameState = 'PLAYING';
    broadcastToLobby(pin, { type: 'round-countdown', payload: { round: game.currentRound + 1, totalRounds: game.songList.length } });
    setTimeout(() => startNewRound(pin), 5000);
}

function startNewRound(pin) {
    const game = games[pin]; if (!game) return;

    game.roundStartTime = Date.now();
    game.currentSong = game.songList[game.currentRound];
    if (game.gameMode !== 'timeline') game.currentRound++; 
    
    game.guesses = {};
    if (!game.currentSong) { return endGame(pin); }
    axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${game.settings.deviceId}`, { uris: [`spotify:track:${game.currentSong.spotifyId}`] }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } }).catch(err => console.error(`[${pin}] Spotify Play API Fehler:`, err.response?.data || err.message));
    
    let payload = {
        round: game.currentRound + 1, totalRounds: game.songList.length,
        scores: getScores(pin), guessTime: parseInt(game.settings.guessTime),
        gameMode: game.gameMode, answerType: game.settings.answerType
    };

    if (game.gameMode === 'timeline') {
        payload.timeline = game.timeline;
        payload.currentSong = { ...game.currentSong, year: undefined };
    } else if (game.gameMode === 'quiz' && game.settings.answerType === 'multiple') {
        const correct = game.currentSong;
        const decoys = shuffleArray(game.songList.filter(s => s.spotifyId !== correct.spotifyId)).slice(0, 3);
        const options = shuffleArray([correct, ...decoys]);
        payload.options = options.map(o => ({ title: o.title, artist: o.artist }));
    }
    
    broadcastToLobby(pin, { type: 'new-round', payload });
    game.roundTimer = setTimeout(() => evaluateRound(pin), parseInt(game.settings.guessTime) * 1000);
}

function evaluateRound(pin) {
    const game = games[pin];
    if (!game) return;
    clearTimeout(game.roundTimer);
    game.gameState = 'RESULTS';
    const song = game.currentSong;
    const guessTime = parseInt(game.settings.guessTime) * 1000;

    Object.values(game.players).forEach(player => {
        const guess = game.guesses[player.ws.playerId] || {};
        player.lastPointsBreakdown = { base: 0, time: 0, total: 0 };
        let isCorrect = false;

        const timeTaken = guess.timestamp ? guess.timestamp - game.roundStartTime : guessTime;
        const timeRemainingPercent = Math.max(0, (guessTime - timeTaken) / guessTime);

        if (game.gameMode === 'quiz') {
            const MAX_BASE_SCORE = 100;
            const MAX_TIME_BONUS = 50;
            if (game.settings.answerType === 'multiple') {
                if (guess.title === song.title && guess.artist === song.artist) {
                    isCorrect = true;
                    player.lastPointsBreakdown.base = MAX_BASE_SCORE;
                    player.lastPointsBreakdown.time = Math.round(MAX_TIME_BONUS * timeRemainingPercent);
                }
            } else {
                const titleDist = levenshteinDistance(normalizeString(song.title), normalizeString(guess.title));
                const artistDist = levenshteinDistance(normalizeString(song.artist), normalizeString(guess.artist));
                if (titleDist <= 4 && artistDist <= 3) {
                     isCorrect = true;
                     player.lastPointsBreakdown.base = MAX_BASE_SCORE;
                     player.lastPointsBreakdown.time = Math.round(MAX_TIME_BONUS * timeRemainingPercent);
                }
            }
        } else if (game.gameMode === 'timeline') {
            const MAX_BASE_SCORE = 100;
            const MAX_TIME_BONUS = 50;
            const index = guess.index;
            if (index !== undefined) {
                const timeline = game.timeline;
                const yearBefore = index > 0 ? timeline[index - 1].year : -Infinity;
                const yearAfter = index < timeline.length ? timeline[index].year : Infinity;
                if (song.year >= yearBefore && song.year <= yearAfter) {
                    isCorrect = true;
                    player.lastPointsBreakdown.base = MAX_BASE_SCORE;
                    player.lastPointsBreakdown.time = Math.round(MAX_TIME_BONUS * timeRemainingPercent);
                }
            }
        }
        
        const roundScore = player.lastPointsBreakdown.base + player.lastPointsBreakdown.time;
        player.lastPointsBreakdown.total = roundScore;
        if (game.settings.gameType === 'points') {
            player.score += roundScore;
        } else if (game.settings.gameType === 'lives' && !isCorrect) {
            player.lives--;
        }
    });

    if (game.gameMode === 'timeline') {
        game.timeline.push(song);
        game.timeline.sort((a, b) => a.year - b.year);
        game.currentRound++;
    }
    
    broadcastToLobby(pin, { type: 'round-result', payload: { song, scores: getScores(pin), gameMode: game.gameMode, timeline: game.timeline } });
    game.nextRoundTimer = setTimeout(() => startRoundCountdown(pin), 10000);
}

function endGame(pin, cleanup = true) {
    const game = games[pin];
    if (!game || game.gameState === 'FINISHED') return;
    game.gameState = 'FINISHED';
    
    if (game.hostToken && game.settings.deviceId) {
        axios.put(`https://api.spotify.com/v1/me/player/pause?device_id=${game.settings.deviceId}`, {}, { headers: { 'Authorization': `Bearer ${game.hostToken}` } }).catch(err => console.error(`[${pin}] Spotify Pause API Fehler:`, err.response?.data || err.message));
    }

    broadcastToLobby(pin, { type: 'game-over', payload: { scores: getScores(pin) } });
    if(cleanup) {
        setTimeout(() => delete games[pin], 60000);
    }
}

server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
