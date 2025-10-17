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
            gameToReconnect.players[reconnectPlayerId].ws = ws;
            gameToReconnect.players[reconnectPlayerId].isConnected = true;
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
            ws.pin = newPin; ws.playerId = payload.user.id;
            const initialSettings = { deviceId: null, playlistId: null, songCount: 10, guessTime: 30, gameType: payload.gameType || 'points', lives: payload.lives || 3, answerType: 'freestyle' };
            games[newPin] = {
                hostId: payload.user.id,
                players: { [payload.user.id]: { ws, nickname: payload.user.username, score: 0, lives: initialSettings.lives, isConnected: true, isReady: false, timeline: [] } },
                settings: initialSettings, hostToken: payload.token, gameState: 'LOBBY', gameMode: payload.gameMode || 'quiz'
            };
            ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId: payload.user.id, isHost: true, gameMode: games[newPin].gameMode } }));
            broadcastLobbyUpdate(newPin);
            break;
        case 'join-game':
            const gameToJoin = games[payload.pin];
            if (gameToJoin && gameToJoin.gameState === 'LOBBY') {
                ws.pin = payload.pin; ws.playerId = payload.user.id;
                gameToJoin.players[payload.user.id] = { ws, nickname: payload.user.username, score: 0, lives: gameToJoin.settings.lives, isConnected: true, isReady: false, timeline: [] };
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
            if (game && game.gameState === 'PLAYING' && game.gameMode === 'quiz') {
                if (!game.guesses) game.guesses = {};
                game.guesses[playerId] = payload.guess;
            }
            break;
        case 'submit-guess':
             if (game && game.gameState === 'PLAYING' && game.players[playerId] && !game.players[playerId].hasGuessed) {
                game.players[playerId].hasGuessed = true;
                if(game.gameMode === 'timeline') {
                    handleTimelineGuess(pin, playerId, payload);
                } else if(game.gameMode === 'popularity') {
                    handlePopularityGuess(pin, playerId, payload);
                }
             }
            break;
        case 'player-ready':
            if (game && game.players[playerId] && (game.gameState === 'RESULTS' || game.gameState === 'PLAYING')) {
                game.players[playerId].isReady = true;
                const activePlayers = Object.values(game.players).filter(p=>p.isConnected && p.lives > 0);
                const allReady = activePlayers.every(p => p.isReady);

                if (game.gameState === 'RESULTS' && allReady) {
                    clearTimeout(game.nextRoundTimer);
                    startRoundCountdown(pin);
                } else if (game.gameState === 'PLAYING' && game.gameMode === 'quiz' && allReady) {
                    clearTimeout(game.roundTimer);
                    evaluateRound(pin);
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

    if (game.gameState === 'LOBBY') {
        broadcastToLobby(pin, { type: 'toast', payload: { message: `${game.players[playerId].nickname} hat die Verbindung verloren...` } });
    }
    broadcastLobbyUpdate(pin);

    setTimeout(() => {
        const currentGame = games[pin];
        if (currentGame && currentGame.players[playerId] && !currentGame.players[playerId].isConnected) {
            if (playerId === currentGame.hostId) {
                console.log(`[${pin}] Host hat die Verbindung verloren. Spiel wird beendet.`);
                broadcastToLobby(pin, { type: 'toast', payload: { message: 'Der Host hat das Spiel verlassen. Das Spiel wird beendet.', isError: true } });
                endGame(pin, false);
                return;
            }
            delete currentGame.players[playerId];
            if (Object.keys(currentGame.players).length === 0) {
                delete games[pin];
            } else {
                broadcastLobbyUpdate(pin);
            }
        }
    }, 30000);
}

function generatePin() { let pin; do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]); return pin; }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws && player.ws.readyState === WebSocket.OPEN && player.isConnected) { player.ws.send(messageString); } }); }
function broadcastLobbyUpdate(pin) { const game = games[pin]; if (!game) return; const payload = { pin, hostId: game.hostId, players: getScores(pin), settings: game.settings }; broadcastToLobby(pin, { type: 'lobby-update', payload }); }
function getScores(pin) { const game = games[pin]; if (!game) return []; return Object.values(game.players).map(p => ({ id: p.ws.playerId, nickname: p.nickname, score: p.score, lives: p.lives, isConnected: p.isConnected, lastPointsBreakdown: p.lastPointsBreakdown })).sort((a, b) => b.score - a.score); }
function showToastToPlayer(ws, message, isError = false) { if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'toast', payload: { message, isError } })); } }
async function getPlaylistTracks(playlistId, token) { try { const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, { headers: { 'Authorization': `Bearer ${token}` } }); return response.data.items.map(item => item.track).filter(track => track && track.id).map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0].name, year: parseInt(track.album.release_date.substring(0, 4)), popularity: track.popularity, albumArtUrl: track.album.images[0]?.url })); } catch (error) { console.error("Fehler beim Abrufen der Playlist-Tracks:", error.response?.data || error.message); return null; } }

async function startGame(pin) {
    const game = games[pin];
    try { await axios.put(`https://api.spotify.com/v1/me/player`, { device_ids: [game.settings.deviceId], play: false }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } }); }
    catch (e) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Ausgewähltes Gerät konnte nicht aktiviert werden.' } }); return; }

    game.gameState = 'PLAYING';
    game.currentRound = 0;
    Object.values(game.players).forEach(p => {
        p.score = 0;
        p.lives = game.settings.lives;
        p.timeline = [];
        p.hasGuessed = false;
    });

    const tracks = await getPlaylistTracks(game.settings.playlistId, game.hostToken);
    if (!tracks || tracks.length < 1) { broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist ist leer oder konnte nicht geladen werden.' } }); game.gameState = 'LOBBY'; return; }

    game.songList = shuffleArray(tracks);
    const songCount = parseInt(game.settings.songCount);
    if (songCount > 0 && game.settings.gameType === 'points') {
        game.songList = game.songList.slice(0, songCount);
    }

    if(game.gameMode === 'timeline' || game.gameMode === 'popularity') {
       const firstSong = game.songList.shift();
        Object.values(game.players).forEach(p => p.timeline.push(firstSong));
    }

    startRoundCountdown(pin);
}

function startRoundCountdown(pin) {
    const game = games[pin];
    if (!game) return;
    Object.values(game.players).forEach(p => {
        p.isReady = false;
        p.hasGuessed = false;
    });

    if (game.settings.gameType === 'points' && game.currentRound >= game.songList.length) { return endGame(pin); }
    const activePlayers = Object.values(game.players).filter(p => p.isConnected && p.lives > 0);
    if (game.settings.gameType === 'lives' && activePlayers.length <= 1) { return endGame(pin); }

    game.gameState = 'PLAYING';
    broadcastToLobby(pin, { type: 'round-countdown', payload: { round: game.currentRound + 1, totalRounds: game.settings.gameType === 'points' ? game.songList.length : 0 } });
    setTimeout(() => startNewRound(pin), 4000);
}

function startNewRound(pin) {
    const game = games[pin]; if (!game) return;
    game.currentSong = game.songList[game.currentRound];
    game.currentRound++; game.guesses = {};
    if (!game.currentSong) return endGame(pin);
    axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${game.settings.deviceId}`, { uris: [`spotify:track:${game.currentSong.spotifyId}`] }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } }).catch(err => console.error(`[${pin}] Spotify Play API Fehler:`, err.response?.data || err.message));

    let payload = {
        round: game.currentRound, totalRounds: game.settings.gameType === 'points' ? game.songList.length : 0,
        scores: getScores(pin), guessTime: parseInt(game.settings.guessTime),
        gameMode: game.gameMode
    };

    if(game.gameMode === 'quiz') {
       broadcastToLobby(pin, { type: 'new-round', payload });
       game.roundTimer = setTimeout(() => evaluateRound(pin), parseInt(game.settings.guessTime) * 1000);
    } else {
        Object.values(game.players).forEach(player => {
            const playerSpecificPayload = { ...payload, song: { spotifyId: game.currentSong.spotifyId, title: game.currentSong.title, artist: game.currentSong.artist, albumArtUrl: game.currentSong.albumArtUrl }, timeline: player.timeline };
            if(player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({ type: 'new-round', payload: playerSpecificPayload }));
            }
        });
    }
}

function handleTimelineGuess(pin, playerId, { index }) {
    const game = games[pin];
    const player = game.players[playerId];
    const songToPlace = game.currentSong;

    const correctIndex = player.timeline.findIndex(s => s.year > songToPlace.year);
    const isCorrect = (correctIndex === -1 && index === player.timeline.length) || (correctIndex === index);

    let points = 0;
    if (isCorrect) {
        points = 100;
        player.timeline.splice(index, 0, songToPlace);
        if(game.settings.gameType === 'points') player.score += points;
    } else {
        if(game.settings.gameType === 'lives') player.lives--;
    }
    player.lastPointsBreakdown = { total: points };
    
    player.ws.send(JSON.stringify({type: 'round-result', payload: { wasCorrect: isCorrect, song: songToPlace, scores: getScores(pin) }}));
    checkRoundEnd(pin);
}

function handlePopularityGuess(pin, playerId, { guess }) {
    const game = games[pin];
    const player = game.players[playerId];
    const currentSong = game.currentSong;
    const previousSong = player.timeline[player.timeline.length - 1];

    let isCorrect = false;
    if (guess === 'higher' && currentSong.popularity > previousSong.popularity) isCorrect = true;
    if (guess === 'lower' && currentSong.popularity < previousSong.popularity) isCorrect = true;
    if (currentSong.popularity === previousSong.popularity) isCorrect = true; // Gleichstand zählt als richtig

    let points = 0;
    if (isCorrect) {
        points = 100;
        player.timeline.push(currentSong);
        if(game.settings.gameType === 'points') player.score += points;
    } else {
        if(game.settings.gameType === 'lives') player.lives--;
    }
    player.lastPointsBreakdown = { total: points };

    player.ws.send(JSON.stringify({type: 'round-result', payload: { wasCorrect: isCorrect, song: currentSong, scores: getScores(pin) }}));
    checkRoundEnd(pin);
}

function checkRoundEnd(pin) {
    const game = games[pin];
    if (!game) return;
    const activePlayers = Object.values(game.players).filter(p => p.isConnected && p.lives > 0);
    const allGuessed = activePlayers.every(p => p.hasGuessed);
    if(allGuessed) {
        setTimeout(() => startRoundCountdown(pin), 5000);
    }
}

function evaluateRound(pin) {
    const game = games[pin];
    if (!game || game.gameMode !== 'quiz') return;
    clearTimeout(game.roundTimer);
    game.gameState = 'RESULTS';
    const song = game.currentSong;

    const MAX_POINTS_ARTIST = 75;
    const MAX_POINTS_TITLE = 100;
    const MAX_POINTS_YEAR = 50;

    Object.values(game.players).forEach(player => {
        const guess = game.guesses[player.ws.playerId] || {};
        player.lastPointsBreakdown = { artist: 0, title: 0, year: 0, total: 0 };

        if (player.lives > 0) {
            const normTitle = normalizeString(song.title);
            const normArtist = normalizeString(song.artist);
            const normGuessTitle = normalizeString(guess.title);
            const normGuessArtist = normalizeString(guess.artist);

            const artistDist = levenshteinDistance(normArtist, normGuessArtist);
            if (artistDist <= 3) {
                player.lastPointsBreakdown.artist = Math.round(MAX_POINTS_ARTIST * (1 - (artistDist / 4)));
            }

            const titleDist = levenshteinDistance(normTitle, normGuessTitle);
            if (titleDist <= 4) {
                player.lastPointsBreakdown.title = Math.round(MAX_POINTS_TITLE * (1 - (titleDist / 5)));
            }

            const yearDiff = Math.abs(parseInt(guess.year) - song.year);
            if (!isNaN(yearDiff) && yearDiff <= 10) {
                 player.lastPointsBreakdown.year = Math.round(MAX_POINTS_YEAR * (1 - (yearDiff / 11)));
            }

            const roundScore = player.lastPointsBreakdown.artist + player.lastPointsBreakdown.title + player.lastPointsBreakdown.year;
            player.lastPointsBreakdown.total = roundScore;

            if (game.settings.gameType === 'points') {
                player.score += roundScore;
            } else if (game.settings.gameType === 'lives' && roundScore < (MAX_POINTS_TITLE / 2)) {
                player.lives--;
            }
        }
    });

    broadcastToLobby(pin, { type: 'round-result', payload: { song, scores: getScores(pin) } });
    game.nextRoundTimer = setTimeout(() => startRoundCountdown(pin), 10000);
}

function endGame(pin, cleanup = true) {
    const game = games[pin];
    if (!game) return;
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
