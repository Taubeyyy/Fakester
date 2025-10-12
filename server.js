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

function levenshteinDistance(s1, s2) { /* ... (Code ist identisch) ... */ }
function normalizeString(str) { /* ... (Code ist identisch) ... */ }

// ... (alle app.get/post Routen sind identisch)

const wss = new WebSocket.Server({ server });
wss.on('connection', ws => { /* ... (identisch) ... */ });

function handleWebSocketMessage(ws, { type, payload }) {
    const { playerId } = ws; const pin = ws.pin; const game = games[pin];
    switch (type) {
        case 'create-game':
            const newPin = generatePin();
            ws.pin = newPin;
            games[newPin] = {
                hostId: playerId,
                players: { [playerId]: { ws, nickname: payload.nickname, score: 0 } },
                settings: { deviceId: null, playlistId: null, songCount: 10, guessTime: 30 },
                hostToken: payload.token,
                gameState: 'LOBBY',
                gameMode: payload.gameMode || 'quiz',
                readyPlayers: [],
                timeline: [],
            };
            ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId } }));
            broadcastLobbyUpdate(newPin);
            break;
        
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
        // ... (restliche cases sind identisch)
    }
}
async function startGame(pin) {
    const game = games[pin];
    try {
        await axios.put(`https://api.spotify.com/v1/me/player`, { device_ids: [game.settings.deviceId], play: false }, { headers: { 'Authorization': `Bearer ${game.hostToken}` } });
    } catch (e) {
        // ... (Fehlerbehandlung wie bisher)
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
        if (startCard) {
            game.timeline.push(startCard);
        }
    } else { // 'quiz' mode
        if (game.settings.songCount > 0) {
            game.songList = game.songList.slice(0, Math.min(game.settings.songCount, game.songList.length));
        }
    }

    startRoundCountdown(pin);
}

function startRoundCountdown(pin) {
    const game = games[pin];
    if (!game || game.currentRound >= game.songList.length) {
        return endGame(pin);
    }
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
        round: game.currentRound, 
        totalRounds: game.songList.length, 
        scores: getScores(pin), 
        hostId: game.hostId,
        totalPlayers: totalPlayers,
        gameMode: game.gameMode
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
            const guess = game.guesses[pId]; // guess = { index: number }
            if (guess === undefined) return;
            
            const correctIndex = game.timeline.findIndex(card => card.year > song.year);
            const finalIndex = correctIndex === -1 ? game.timeline.length : correctIndex;
            
            const wasCorrect = finalIndex === guess.index;
            if (wasCorrect) {
                player.score += 100;
            }
            player.lastGuess = { index: guess.index, wasCorrect: wasCorrect };
        });
        game.timeline.push(song);
        game.timeline.sort((a, b) => a.year - b.year);
        resultsPayload.timeline = game.timeline;

    } else { // 'quiz' mode
        Object.keys(game.players).forEach(pId => {
            const player = game.players[pId];
            const guess = game.guesses[pId];
            if (!guess) {
                player.lastPointsBreakdown = { artist: 0, title: 0, year: 0 };
                return;
            }
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

function endGame(pin) { /* ... (identisch) ... */ }
function handlePlayerDisconnect(ws) { /* ... (identisch) ... */ }
function generatePin() { /* ... (identisch) ... */ }
function broadcastToLobby(pin, message) { /* ... (identisch) ... */ }
function broadcastLobbyUpdate(pin) { /* ... (identisch) ... */ }

function getScores(pin) {
    const game = games[pin];
    if (!game) return [];
    return Object.values(game.players).map(p => ({
        id: p.ws.playerId,
        nickname: p.nickname,
        score: p.score,
        pointsBreakdown: p.lastPointsBreakdown,
        lastGuess: p.lastGuess,
    })).sort((a, b) => b.score - a.score);
}

async function getPlaylistTracks(playlistId, token) { /* ... (identisch) ... */ }

server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
