const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Stellt die `index.html` und alle anderen Frontend-Dateien bereit
app.use(express.static(path.join(__dirname)));

const wss = new WebSocket.Server({ server });

let allSongs = {};
let categories = [];
try {
    const allSongsData = fs.readFileSync('songs.json', 'utf-8');
    allSongs = JSON.parse(allSongsData);
    categories = Object.keys(allSongs);
} catch (error) {
    console.error("FEHLER: songs.json konnte nicht gelesen werden.");
    process.exit(1);
}

let games = {};

wss.on('connection', ws => {
    const playerId = Date.now().toString();
    ws.playerId = playerId;

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            const { type, payload } = data;
            const pin = ws.pin;
            const game = games[pin];

            switch (type) {
                case 'create-game': {
                    const newPin = generatePin();
                    ws.pin = newPin;
                    games[newPin] = {
                        hostId: playerId,
                        players: { [playerId]: { ws, nickname: payload.nickname, score: 0 } },
                        settings: { category: categories[0], songCount: 5, guessTime: 60 },
                        gameState: 'LOBBY'
                    };
                    console.log(`Lobby ${newPin} von ${payload.nickname} erstellt.`);
                    ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, settings: games[newPin].settings, playerId } }));
                    broadcastLobbyUpdate(newPin);
                    break;
                }
                case 'join-game': {
                    const { pin, nickname } = payload;
                    if (games[pin] && games[pin].gameState === 'LOBBY') {
                        ws.pin = pin;
                        const finalNickname = handleNickname(games[pin].players, nickname);
                        games[pin].players[playerId] = { ws, nickname: finalNickname, score: 0 };
                        console.log(`${finalNickname} ist der Lobby ${pin} beigetreten.`);
                        ws.send(JSON.stringify({ type: 'join-success', payload: { pin, settings: games[pin].settings, playerId } }));
                        broadcastLobbyUpdate(pin);
                    } else {
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Ungültiger PIN oder Spiel läuft bereits.' } }));
                    }
                    break;
                }
                case 'change-nickname': {
                    if (game && game.players[playerId]) {
                        game.players[playerId].nickname = payload.newNickname;
                        broadcastLobbyUpdate(pin);
                    }
                    break;
                }
                case 'update-settings': {
                    if (game && game.hostId === playerId) {
                        game.settings = payload;
                        broadcastLobbyUpdate(pin);
                    }
                    break;
                }
                case 'start-game': {
                    if (game && game.hostId === playerId) {
                        startGame(pin);
                    }
                    break;
                }
                case 'submit-guess': {
                    if (game && game.gameState === 'PLAYING' && !game.guesses[playerId]) {
                        game.guesses[playerId] = payload.guess;
                        ws.send(JSON.stringify({ type: 'guess-received' }));
                    }
                    break;
                }
                case 'player-ready': {
                    if (game && game.gameState === 'PLAYING') {
                        game.readyPlayers.add(playerId);
                        if (game.readyPlayers.size === Object.keys(game.players).length) {
                            clearTimeout(game.roundTimer);
                            evaluateRound(pin);
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            console.error("Fehler bei der Verarbeitung der Nachricht:", error);
        }
    });

    ws.on('close', () => {
        const pin = ws.pin;
        if (!pin || !games[pin] || !games[pin].players[ws.playerId]) return;
        delete games[pin].players[ws.playerId];
        if (Object.keys(games[pin].players).length === 0) {
            console.log(`Lobby ${pin} wurde geschlossen.`);
            delete games[pin];
        } else {
            if (ws.playerId === games[pin].hostId) {
                games[pin].hostId = Object.keys(games[pin].players)[0];
            }
            broadcastLobbyUpdate(pin);
        }
    });
});

function generatePin() {
    let pin;
    do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]);
    return pin;
}

function handleNickname(players, nickname) {
    let finalNickname = nickname, count = 2;
    const nicknamesInLobby = Object.values(players).map(p => p.nickname);
    while (nicknamesInLobby.includes(finalNickname)) {
        finalNickname = `${nickname} (${count++})`;
    }
    return finalNickname;
}

function broadcastLobbyUpdate(pin) {
    const game = games[pin];
    if (!game) return;
    const playersData = Object.entries(game.players).map(([id, p]) => ({ id, nickname: p.nickname, score: p.score }));
    const payload = { pin, hostId: game.hostId, players: playersData, settings: game.settings, categories: categories };
    broadcastToLobby(pin, { type: 'lobby-update', payload });
}

function startGame(pin) {
    const game = games[pin];
    if (!game) return;
    game.gameState = 'COUNTDOWN';
    broadcastToLobby(pin, { type: 'game-countdown' });
    setTimeout(() => {
        game.gameState = 'PLAYING';
        game.currentRound = 0;
        Object.values(game.players).forEach(p => p.score = 0);
        const songCount = Math.min(game.settings.songCount, allSongs[game.settings.category].length);
        game.songList = [...allSongs[game.settings.category]].sort(() => 0.5 - Math.random()).slice(0, songCount);
        startNewRound(pin);
    }, 5000);
}

function startNewRound(pin) {
    const game = games[pin];
    if (!game || game.currentRound >= game.songList.length) {
        if (game) game.gameState = 'FINISHED';
        broadcastToLobby(pin, {type: 'game-over', payload: {scores: getScores(pin)}});
        return;
    }
    game.currentRound++;
    game.guesses = {};
    game.readyPlayers = new Set();
    game.currentSong = game.songList[game.currentRound - 1];
    broadcastToLobby(pin, {
        type: 'new-round',
        payload: {
            round: game.currentRound, totalRounds: game.songList.length,
            guessTime: game.settings.guessTime, song: { spotifyId: game.currentSong.spotifyId }
        }
    });
    game.roundTimer = setTimeout(() => evaluateRound(pin), game.settings.guessTime * 1000);
}

function evaluateRound(pin) {
    const game = games[pin];
    if (!game) return;
    const song = game.currentSong;
    Object.keys(game.players).forEach(pId => {
        const player = game.players[pId];
        const guess = game.guesses[pId];
        if (!guess) return;
        const yearDiff = Math.abs(guess.year - song.year);
        if (yearDiff === 0) player.score += 250;
        else if (yearDiff <= 5) player.score += 100;
        else if (yearDiff <= 10) player.score += 50;
        else if (yearDiff <= 20) player.score += 10;
        if (guess.artist.toLowerCase() === song.artist.toLowerCase()) player.score += 75;
        if (guess.title.toLowerCase() === song.title.toLowerCase()) player.score += 75;
    });
    broadcastToLobby(pin, { type: 'round-result', payload: { song, scores: getScores(pin) } });
    setTimeout(() => startNewRound(pin), 8000);
}

function getScores(pin) {
    const game = games[pin];
    if (!game) return [];
    return Object.entries(game.players)
        .map(([id, p]) => ({ id, nickname: p.nickname, score: p.score }))
        .sort((a, b) => b.score - a.score);
}

function broadcastToLobby(pin, message) {
    const game = games[pin];
    if (!game) return;
    const messageString = JSON.stringify(message);
    Object.values(game.players).forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(messageString);
        }
    });
}

server.listen(8080, () => {
    console.log('✅ Spiel-Server v12 (Spotify SDK) läuft auf http://localhost:8080');
});