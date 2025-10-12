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

// Levenshtein-Funktion zur Berechnung der String-Ähnlichkeit
function levenshteinDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/\(.*\)|\[.*\]/g, '') // Inhalt in ( ) und [ ] entfernen
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s]/g, '') // Alle Sonderzeichen außer Leerzeichen entfernen
        .trim();
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
// ... (alle app.get/post Routen sind identisch)

const wss = new WebSocket.Server({ server });
wss.on('connection', ws => { /* ... (identisch) ... */ });

function handleWebSocketMessage(ws, { type, payload }) { /* ... (identisch) ... */ }
async function startGame(pin) { /* ... (identisch) ... */ }
function startRoundCountdown(pin) { /* ... (identisch) ... */ }
function startNewRound(pin) { /* ... (identisch) ... */ }

function evaluateRound(pin) {
    const game = games[pin]; if (!game) return;
    clearTimeout(game.roundTimer);
    const song = game.currentSong;
    
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
        
        // Künstler-Punkte
        const artistDist = levenshteinDistance(normalizedSongArtist, normalizedGuessArtist);
        if (artistDist === 0) { pointsBreakdown.artist = 75; }
        else if (artistDist <= 2) { pointsBreakdown.artist = 40; }
        
        // Titel-Punkte
        const titleDist = levenshteinDistance(normalizedSongTitle, normalizedGuessTitle);
        if (titleDist === 0) { pointsBreakdown.title = 75; }
        else if (titleDist <= 3) { pointsBreakdown.title = 40; }
        
        // Jahr-Punkte
        if (guess.year > 1000) { // Einfache Überprüfung auf eine gültige Jahreszahl
            const yearDiff = Math.abs(guess.year - song.year);
            if (yearDiff === 0) { pointsBreakdown.year = 100; }
            else if (yearDiff <= 2) { pointsBreakdown.year = 50; }
            else if (yearDiff <= 5) { pointsBreakdown.year = 25; }
        }

        const roundScore = pointsBreakdown.artist + pointsBreakdown.title + pointsBreakdown.year;
        player.score += roundScore;
        player.lastPointsBreakdown = pointsBreakdown;
    });

    broadcastToLobby(pin, { type: 'round-result', payload: { song, scores: getScores(pin) } });
    setTimeout(() => startRoundCountdown(pin), 10000); // Längere Anzeigezeit für Ergebnisse
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
        pointsBreakdown: p.lastPointsBreakdown || { artist: 0, title: 0, year: 0 }
    })).sort((a, b) => b.score - a.score);
}

async function getPlaylistTracks(playlistId, token) { /* ... (identisch) ... */ }

server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
