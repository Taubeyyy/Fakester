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
    console.error(`Uncaught Exception: ${err.stack}`);
    console.error(`Origin: ${origin}`);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const server = http.createServer(app);
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET; // Korrigiert
const REDIRECT_URI = process.env.REDIRECT_URI;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

app.use(express.static(__dirname));
app.use(cookieParser());
app.use(express.json());

let games = {};
const onlineUsers = new Map(); // Maps userId to WebSocket object

// --- Hilfsfunktionen ---
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
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
function generatePin() { let pin; do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]); return pin; }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws && player.ws.readyState === WebSocket.OPEN && player.isConnected) { try { player.ws.send(messageString); } catch (e) { console.error(`Failed to send message to player ${player.ws.playerId}:`, e); } } }); }
function broadcastLobbyUpdate(pin) { const game = games[pin]; if (!game) return; const payload = { pin, hostId: game.hostId, players: getScores(pin), settings: game.settings }; broadcastToLobby(pin, { type: 'lobby-update', payload }); }
function getScores(pin) { const game = games[pin]; if (!game) return []; return Object.values(game.players).map(p => ({ id: p.ws?.playerId, nickname: p.nickname, score: p.score, lives: p.lives, isConnected: p.isConnected, lastPointsBreakdown: p.lastPointsBreakdown })).filter(p => p.id).sort((a, b) => b.score - a.score); }
function showToastToPlayer(ws, message, isError = false) { if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: 'toast', payload: { message, isError } })); } catch (e) { console.error(`Failed to send toast to player ${ws.playerId}:`, e); } } }
async function getPlaylistTracks(playlistId, token) { try { const response = await axios.get(`https://api.spotify.com/v1/playlists/$${playlistId}/tracks?limit=50`, { headers: { 'Authorization': `Bearer ${token}` } }); return response.data.items.map(item => item.track).filter(track => track && track.id && track.album?.release_date).map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0]?.name || 'Unbekannt', year: parseInt(track.album.release_date.substring(0, 4)), popularity: track.popularity || 0, albumArtUrl: track.album.images[0]?.url })); } catch (error) { console.error("Fehler beim Abrufen der Playlist-Tracks:", error.response?.data || error.message); return null; } }
async function spotifyApiCall(method, url, token, data = {}) { try { await axios({ method, url, data, headers: { 'Authorization': `Bearer ${token}` } }); return true; } catch (e) { console.error(`Spotify API Fehler bei ${method.toUpperCase()} ${url}:`, e.response?.data || e.message); return false; } }
// NEU: Achievement-Helfer
async function hasAchievement(userId, achievementId) {
    const { data, error } = await supabase
        .from('user_achievements')
        .select('achievement_id')
        .eq('user_id', userId)
        .eq('achievement_id', achievementId)
        .maybeSingle(); // Gibt null zurück, wenn nicht gefunden
    return !!data; // True wenn data nicht null ist
}
async function awardAchievement(ws, userId, achievementId) {
    if (userId.startsWith('guest-')) return; // Gäste bekommen keine Erfolge
    const alreadyHas = await hasAchievement(userId, achievementId);
    if (alreadyHas) return;

    const { error } = await supabase
        .from('user_achievements')
        .insert({ user_id: userId, achievement_id: achievementId });

    if (error) {
        console.error(`Fehler beim Speichern von Achievement ${achievementId} für User ${userId}:`, error);
    } else {
        const achievement = achievementsList.find(a => a.id === achievementId);
        console.log(`Achievement ${achievementId} (${achievement?.name}) verliehen an User ${userId}.`);
        showToastToPlayer(ws, `Erfolg freigeschaltet: ${achievement?.name || ''}!`);
        // Optional: Client direkt updaten (kann komplex werden, Reload ist einfacher)
    }
}


// --- Express Routen ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/api/config', (req, res) => res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }));
app.get('/login', (req, res) => { const scopes = 'user-read-private user-read-email playlist-read-private streaming user-modify-playback-state user-read-playback-state'; res.redirect('https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, scope: scopes, redirect_uri: REDIRECT_URI }).toString()); });
app.get('/callback', async (req, res) => { const code = req.query.code || null; if (!code) return res.redirect('/#error=auth_failed'); try { const response = await axios({ method: 'post', url: 'https://accounts.spotify.com/api/token', data: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }).toString(), headers: { 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')), 'Content-Type': 'application/x-www-form-urlencoded' } }); res.cookie('spotify_access_token', response.data.access_token, { httpOnly: true, secure: true, maxAge: 3600000 }); res.redirect('/'); } catch (error) { console.error("Spotify Callback Error:", error.response?.data || error.message); res.redirect('/#error=token_failed'); } });
app.post('/logout', (req, res) => { res.clearCookie('spotify_access_token'); res.status(200).json({ message: 'Erfolgreich ausgeloggt' }); });
app.get('/api/status', (req, res) => { const token = req.cookies.spotify_access_token; if (token) { res.json({ loggedIn: true, token: token }); } else { res.status(200).json({ loggedIn: false }); } }); // Status 200 statt 401
app.get('/api/playlists', async (req, res) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ message: "Nicht autorisiert" }); try { const d = await axios.get('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${token}` } }); res.json(d.data); } catch (e) { console.error("Playlist API Error:", e.response?.status, e.response?.data); res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Playlists" }); } });
app.get('/api/devices', async (req, res) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ message: "Nicht autorisiert" }); try { const d = await axios.get('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } }); res.json(d.data); } catch (e) { console.error("Device API Error:", e.response?.status, e.response?.data); res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Geräte" }); } });


// --- WebSocket Server ---
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    console.log('Client verbunden');
    ws.on('message', message => { try { const data = JSON.parse(message); handleWebSocketMessage(ws, data); } catch (e) { console.error("Fehler bei WebSocket-Nachricht:", e, message.toString()); } });
    ws.on('close', () => handlePlayerDisconnect(ws));
    ws.on('error', (error) => console.error('WebSocket Error:', error)); // Error Handling
});

function joinGame(ws, user, pin) {
    const gameToJoin = games[pin];
    if (gameToJoin && gameToJoin.gameState === 'LOBBY') {
        ws.pin = pin;
        ws.playerId = user.id;
        gameToJoin.players[user.id] = {
            ws, nickname: user.username, score: 0, lives: gameToJoin.settings.lives,
            isConnected: true, isReady: false, timeline: [], correctAnswers: 0,
            incorrectAnswersThisGame: 0, exactYearGuesses: 0, perfectRound: false
        };
        ws.send(JSON.stringify({ type: 'join-success', payload: { pin: pin, playerId: user.id, isHost: false, gameMode: gameToJoin.gameMode } }));
        broadcastLobbyUpdate(pin);
         // Achievement: Party-Löwe
         if (Object.values(gameToJoin.players).filter(p => p.isConnected).length >= 4) { // Host + 3 Freunde = 4
            Object.values(gameToJoin.players).forEach(p => awardAchievement(p.ws, p.ws.playerId, 11));
        }
    } else {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Lobby nicht gefunden oder Spiel läuft bereits.' } }));
    }
}

// ... (handleWebSocketMessage, handlePlayerDisconnect, startGame, etc. bleiben größtenteils gleich, aber mit Anpassungen)
function handleWebSocketMessage(ws, data) {
    // console.log('Nachricht empfangen:', JSON.stringify(data, null, 2)); // Kann sehr verbose sein
    try {
        const { type, payload } = data;
        let { pin, playerId } = ws;
        let game = games[pin];

        // Frühe Checks
        if (type === 'register-online') {
            ws.playerId = payload.userId;
            onlineUsers.set(payload.userId, ws);
             console.log(`User ${payload.userId} registered online.`);
            return;
        }
        if (type === 'reconnect') {
            const { pin: reconnectPin, playerId: reconnectPlayerId } = payload;
            const gameToReconnect = games[reconnectPin];
            if (gameToReconnect && gameToReconnect.players[reconnectPlayerId] && !gameToReconnect.players[reconnectPlayerId].isConnected) {
                 console.log(`Reconnecting player ${reconnectPlayerId} to game ${reconnectPin}`);
                ws.pin = reconnectPin; ws.playerId = reconnectPlayerId;
                gameToReconnect.players[reconnectPlayerId].ws = ws;
                gameToReconnect.players[reconnectPlayerId].isConnected = true;
                onlineUsers.set(reconnectPlayerId, ws); // Sicherstellen, dass User online ist
                showToastToPlayer(ws, 'Verbindung wiederhergestellt!');
                broadcastLobbyUpdate(reconnectPin);
                 // Client ggf. zum richtigen Screen schicken (Lobby oder Game)
                 ws.send(JSON.stringify({ type: gameToReconnect.gameState === 'LOBBY' ? 'join-success' : 'reconnect-to-game', payload: { /* ggf. Spielstand */ } }));

            } else {
                 console.warn(`Reconnect failed for player ${reconnectPlayerId} to game ${reconnectPin}`);
            }
            return;
        }

        // Aktionen, die keinen laufenden Game-Kontext brauchen
         if (type === 'add-friend') {
             if (!playerId || playerId.startsWith('guest-')) return showToastToPlayer(ws, "Nur registrierte Benutzer können Freunde hinzufügen.", true);
             handleAddFriend(ws, playerId, payload);
             return;
         }
         if (type === 'accept-friend-request') {
             if (!playerId || playerId.startsWith('guest-')) return;
             handleAcceptFriendRequest(ws, playerId, payload);
             return;
         }
         if (type === 'decline-friend-request' || type === 'remove-friend-request') {
             if (!playerId || playerId.startsWith('guest-')) return;
             handleDeclineFriendRequest(ws, playerId, payload);
             return;
         }
         if (type === 'remove-friend') {
             if (!playerId || playerId.startsWith('guest-')) return;
             handleRemoveFriend(ws, playerId, payload);
             return;
         }

        // Aktionen, die einen Game-Kontext brauchen
        if (!game && !['create-game', 'join-game', 'invite-response'].includes(type)) {
             console.warn(`Action ${type} requires game context, but none found for pin ${pin}.`);
             return;
         }
        // Spieler muss im Spiel sein für die meisten Aktionen
        if (game && !game.players[playerId] && !['create-game', 'join-game', 'invite-response'].includes(type)) {
             console.warn(`Player ${playerId} not found in game ${pin} for action ${type}.`);
             return;
         }


        switch (type) {
            case 'create-game':
                if (!playerId || playerId.startsWith('guest-')) return showToastToPlayer(ws, "Nur registrierte Benutzer können Spiele hosten.", true);
                const newPin = generatePin();
                ws.pin = newPin; ws.playerId = payload.user.id;
                const initialSettings = { deviceId: null, playlistId: null, songCount: 10, guessTime: 30, gameType: payload.gameType || 'points', lives: payload.lives || 3, answerType: 'freestyle' };
                games[newPin] = {
                    hostId: payload.user.id,
                    players: { [payload.user.id]: { ws, nickname: payload.user.username, score: 0, lives: initialSettings.lives, isConnected: true, isReady: false, timeline: [], correctAnswers: 0, incorrectAnswersThisGame: 0, exactYearGuesses: 0, perfectRound: false } },
                    settings: initialSettings, hostToken: payload.token, gameState: 'LOBBY', gameMode: payload.gameMode || 'quiz'
                };
                 console.log(`Game ${newPin} created by host ${payload.user.id}`);
                ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId: payload.user.id, isHost: true, gameMode: games[newPin].gameMode } }));
                broadcastLobbyUpdate(newPin);
                awardAchievement(ws, playerId, 10); // Achievement: Gastgeber
                break;
            case 'join-game':
                if (!payload.user || !payload.user.id) return ws.send(JSON.stringify({ type: 'error', payload: { message: 'Ungültige Beitritts-Anfrage.' } }));
                joinGame(ws, payload.user, payload.pin);
                break;
            case 'update-settings':
                if (game && game.hostId === playerId) {
                    game.settings = { ...game.settings, ...payload };
                    if(payload.lives) { Object.values(game.players).forEach(p => p.lives = game.settings.lives); } // Leben direkt anpassen
                    broadcastLobbyUpdate(pin);
                }
                break;
            case 'update-nickname':
                // Wird jetzt clientseitig in DB gespeichert, nur Broadcast nötig
                if (game && game.players[playerId]) {
                    game.players[playerId].nickname = payload.newName;
                    broadcastLobbyUpdate(pin);
                }
                break;
            case 'start-game':
                if (game && game.hostId === playerId && game.settings.playlistId && game.settings.deviceId) {
                    startGame(pin);
                } else if (game && game.hostId === playerId) {
                     showToastToPlayer(ws, "Bitte wähle zuerst ein Wiedergabegerät und eine Playlist.", true);
                }
                break;
            // ... (Rest der Game-spezifischen Cases wie 'live-guess-update', 'submit-guess', 'player-ready') ...
            case 'live-guess-update':
                if (game && game.gameState === 'PLAYING' && game.players[playerId]) {
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
                if (game && game.players[playerId]) {
                    game.players[playerId].isReady = true;
                    // Check if all *active* players are ready
                    const activePlayers = Object.values(game.players).filter(p => p.isConnected && (game.settings.gameType === 'points' || p.lives > 0));
                    if (activePlayers.every(p => p.isReady)) {
                         console.log(`All active players ready in game ${pin}. Proceeding.`);
                        if (game.gameState === 'RESULTS' || game.gameState === 'PRE_ROUND') {
                            clearTimeout(game.nextRoundTimer); // Clear any pending timers
                            startRoundCountdown(pin);
                        }
                    } else {
                         console.log(`Player ${playerId} is ready, waiting for others in game ${pin}.`);
                    }
                }
                break;
             case 'invite-friend':
                 if (!game || !game.players[playerId]) return;
                 const targetWs = onlineUsers.get(payload.friendId);
                 if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                     targetWs.send(JSON.stringify({ type: 'invite-received', payload: { from: game.players[playerId].nickname, pin: pin } }));
                     showToastToPlayer(ws, `Einladung an ${payload.friendName} gesendet.`);
                 } else {
                     showToastToPlayer(ws, `${payload.friendName} ist nicht online oder Einladung fehlgeschlagen.`, true);
                 }
                 break;
            case 'invite-response':
                if (payload.accepted) {
                    const invitingWs = onlineUsers.get(payload.user.id);
                    if (invitingWs) {
                        joinGame(invitingWs, payload.user, payload.pin);
                    } else {
                         console.warn(`Could not find WebSocket for user ${payload.user.id} accepting invite.`);
                    }
                }
                break;
            default:
                 console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    } catch(e) {
        console.error("Error processing WebSocket message:", e);
        showToastToPlayer(ws, "Ein interner Fehler ist aufgetreten.", true); // Informiere den Spieler
    }
}


// --- Freundschafts-Handler ---
async function handleAddFriend(ws, senderId, payload) {
    const friendName = payload.friendName;
    if (!friendName) return showToastToPlayer(ws, "Ungültiger Name.", true);

    try {
        const { data: friendProfile, error: friendError } = await supabase
            .from('profiles').select('id, username').eq('username', friendName).single();

        if (friendError || !friendProfile) return showToastToPlayer(ws, `Benutzer "${friendName}" nicht gefunden.`, true);
        if (friendProfile.id === senderId) return showToastToPlayer(ws, "Du kannst dich nicht selbst hinzufügen.", true);

        // Prüfen ob Anfrage oder Freundschaft schon existiert
        const { data: existingRequest, error: reqErr } = await supabase.from('friend_requests').select('sender_id')
            .or(`(sender_id.eq.${senderId},receiver_id.eq.${friendProfile.id}),(sender_id.eq.${friendProfile.id},receiver_id.eq.${senderId})`).maybeSingle();
        if (existingRequest) return showToastToPlayer(ws, "Es besteht bereits eine Anfrage.", true);

        const { data: existingFriend, error: friendErr } = await supabase.from('friends').select('user_id1')
            .or(`(user_id1.eq.${senderId},user_id2.eq.${friendProfile.id}),(user_id1.eq.${friendProfile.id},user_id2.eq.${senderId})`).maybeSingle();
        if (existingFriend) return showToastToPlayer(ws, "Ihr seid bereits Freunde.", true);


        const { error: insertError } = await supabase.from('friend_requests').insert({ sender_id: senderId, receiver_id: friendProfile.id });
        if (insertError) throw insertError;

        showToastToPlayer(ws, `Anfrage an ${friendProfile.username} gesendet.`);

        const friendTargetWs = onlineUsers.get(friendProfile.id);
        if (friendTargetWs && friendTargetWs.readyState === WebSocket.OPEN) {
            const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', senderId).single();
            friendTargetWs.send(JSON.stringify({ type: 'friend-request-received', payload: { from: myProfile?.username || 'Ein Spieler' } }));
        }
    } catch (error) {
        console.error('Fehler bei add-friend:', error);
        showToastToPlayer(ws, "Fehler beim Senden der Anfrage.", true);
    }
}

async function handleAcceptFriendRequest(ws, receiverId, payload) {
    const senderId = payload.senderId;
    if (!senderId) return;

    try {
        // 1. Anfrage löschen
        const { error: deleteError } = await supabase.from('friend_requests').delete().match({ sender_id: senderId, receiver_id: receiverId });
        if (deleteError) console.error('Accept-FA Delete Error:', deleteError); // Nicht abbrechen, versuchen Freundschaft zu erstellen

        // 2. Freundschaft erstellen (in definierter Reihenfolge für Konsistenz, z.B. kleinere ID zuerst)
        const user1 = receiverId < senderId ? receiverId : senderId;
        const user2 = receiverId < senderId ? senderId : receiverId;
        const { error: insertError } = await supabase.from('friends').insert({ user_id1: user1, user_id2: user2 });
        if (insertError && insertError.code !== '23505') throw insertError; // Fehler werfen, außer wenn schon Freunde (unique constraint)

        showToastToPlayer(ws, "Freundschaftsanfrage angenommen!");
        awardAchievement(ws, receiverId, 14); // Achievement: Sozial vernetzt (für den Annehmenden)


        const friendSourceWs = onlineUsers.get(senderId);
        if (friendSourceWs && friendSourceWs.readyState === WebSocket.OPEN) {
            showToastToPlayer(friendSourceWs, "Deine Freundschaftsanfrage wurde angenommen!");
             awardAchievement(friendSourceWs, senderId, 14); // Achievement auch für den Sender
        }
    } catch (error) {
        console.error('Fehler bei accept-friend-request:', error);
        showToastToPlayer(ws, "Fehler beim Annehmen der Anfrage.", true);
    }
}

async function handleDeclineFriendRequest(ws, currentUserId, payload) {
    const otherUserId = payload.userId; // Kann sender oder receiver sein, je nachdem wer ablehnt
    if (!otherUserId) return;

    try {
        const { error } = await supabase.from('friend_requests').delete()
            .or(`(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`);
        if (error) throw error;
        showToastToPlayer(ws, "Anfrage abgelehnt/entfernt.");
    } catch (error) {
        console.error('Fehler bei decline/remove-friend-request:', error);
        showToastToPlayer(ws, "Fehler beim Ablehnen der Anfrage.", true);
    }
}

async function handleRemoveFriend(ws, currentUserId, payload) {
    const friendId = payload.friendId;
    if (!friendId) return;

    try {
        const { error } = await supabase.from('friends').delete()
            .or(`(user_id1.eq.${currentUserId},user_id2.eq.${friendId}),(user_id1.eq.${friendId},user_id2.eq.${currentUserId})`);
        if (error) throw error;
        showToastToPlayer(ws, "Freund entfernt.");
    } catch (error) {
        console.error('Fehler bei remove-friend:', error);
        showToastToPlayer(ws, "Fehler beim Entfernen des Freundes.", true);
    }
}

// ... (Rest der Game-Logik Funktionen: handlePlayerDisconnect, startGame, startRoundCountdown, startNewRound, evaluateRound, endGame etc.)
// WICHTIG: endGame Funktion anpassen, um die RPC-Funktion korrekt aufzurufen und Achievements zu prüfen.

function handlePlayerDisconnect(ws) {
    const { pin, playerId } = ws;
    if (playerId) {
        onlineUsers.delete(playerId);
         console.log(`Player ${playerId} disconnected.`);
    } else {
         console.log("Client disconnected without playerId.");
    }

    const game = games[pin];
    if (!game || !game.players[playerId]) return;

    const player = game.players[playerId];
    player.isConnected = false;

    // Host disconnect
    if (playerId === game.hostId) {
         console.log(`Host ${playerId} disconnected from game ${pin}. Stopping music.`);
        spotifyApiCall('put', `https://api.spotify.com/v1/me/player/pause?device_id=$${game.settings.deviceId}`, game.hostToken); // Stop music immediately
    }

    if (game.gameState === 'LOBBY' || game.gameState === 'PLAYING' || game.gameState === 'RESULTS') {
        if (player.nickname) {
            broadcastToLobby(pin, { type: 'toast', payload: { message: `${player.nickname} hat die Verbindung verloren...` } });
        }
        broadcastLobbyUpdate(pin); // Update player list visuals

        // If game is active, check if round end or game end condition is met
        if (game.gameState === 'PLAYING' || game.gameState === 'RESULTS') {
            checkRoundEnd(pin); // Check if all remaining players have acted
            const activePlayers = Object.values(game.players).filter(p => p.isConnected && (game.settings.gameType === 'points' || p.lives > 0));
            if (game.settings.gameType === 'lives' && activePlayers.length <= 1) {
                 console.log(`Game ${pin} ending due to player disconnect (lives mode).`);
                 endGame(pin);
            }
        }
    }


    // Schedule cleanup after a delay to allow reconnection
    player.disconnectTimer = setTimeout(() => {
        const currentGame = games[pin];
        // Check if player is still disconnected
        if (currentGame && currentGame.players[playerId] && !currentGame.players[playerId].isConnected) {
             console.log(`Permanently removing player ${playerId} from game ${pin} after timeout.`);
            if (playerId === currentGame.hostId) {
                broadcastToLobby(pin, { type: 'toast', payload: { message: 'Der Host hat das Spiel verlassen. Das Spiel wird beendet.', isError: true } });
                endGame(pin, false); // End immediately, don't wait for cleanup timeout
                delete games[pin]; // Remove game reference immediately
                return;
            }
            // Remove non-host player
            delete currentGame.players[playerId];
            // Check if game is now empty
            if (Object.keys(currentGame.players).length === 0) {
                 console.log(`Game ${pin} is empty, deleting game.`);
                delete games[pin];
            } else {
                broadcastLobbyUpdate(pin); // Update lobby if other players remain
            }
        }
    }, 60000); // 60 seconds to reconnect
}
// Override reconnect logic to clear the disconnect timer
// Modify the 'reconnect' case in handleWebSocketMessage:
/*
            if (gameToReconnect && gameToReconnect.players[reconnectPlayerId] && !gameToReconnect.players[reconnectPlayerId].isConnected) {
                 console.log(`Reconnecting player ${reconnectPlayerId} to game ${reconnectPin}`);
                 // Clear the disconnect timer!
                 clearTimeout(gameToReconnect.players[reconnectPlayerId].disconnectTimer);
                 gameToReconnect.players[reconnectPlayerId].disconnectTimer = null; // Reset timer ref
                ws.pin = reconnectPin; ws.playerId = reconnectPlayerId;
                // ... rest of reconnect logic
            }
*/


async function startGame(pin) {
    const game = games[pin];
    if (!game) return;
     console.log(`Attempting to start game ${pin} by host ${game.hostId}`);

    const deviceSet = await spotifyApiCall('put', `https://api.spotify.com/v1/me/player`, game.hostToken, { device_ids: [game.settings.deviceId], play: false });
    if (!deviceSet) {
         showToastToPlayer(game.players[game.hostId].ws, "Spotify-Gerät konnte nicht aktiviert werden. Ist es online?", true);
         return; // Don't start game if device fails
    }

    // Reset player states for the new game
    Object.values(game.players).forEach(p => {
        p.score = 0;
        p.lives = game.settings.lives;
        p.timeline = [];
        p.hasGuessed = false;
        p.correctAnswers = 0;
        p.incorrectAnswersThisGame = 0;
        p.exactYearGuesses = 0;
        p.perfectRound = false; // Reset potential achievement flags
    });

    const tracks = await getPlaylistTracks(game.settings.playlistId, game.hostToken);
    if (!tracks || tracks.length < 1) {
        broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist ist leer oder konnte nicht geladen werden.' } });
        game.gameState = 'LOBBY'; // Revert state
        return;
    }
     console.log(`Loaded ${tracks.length} tracks for game ${pin}`);
    game.songList = shuffleArray(tracks);
    const songCount = parseInt(game.settings.songCount);

    if (songCount > 0 && game.settings.gameType === 'points') {
        game.songList = game.songList.slice(0, songCount);
        game.totalRounds = game.songList.length;
    } else {
        game.totalRounds = (game.settings.gameType === 'lives') ? 0 : game.songList.length; // 0 = unendlich für Leben
    }

    if (game.gameMode === 'timeline' || game.gameMode === 'popularity') {
        game.gameState = 'PRE_ROUND';
        const firstSong = game.songList.shift(); // Remove first song for pre-round
        if (!firstSong) { // Handle case where playlist has only 1 song
             broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist hat nicht genügend Songs für diesen Modus.' } });
             game.gameState = 'LOBBY'; return;
        }
        Object.values(game.players).forEach(p => p.timeline.push(firstSong)); // Add first song to everyone's timeline
        await spotifyApiCall('put', `https://api.spotify.com/v1/me/player/play?device_id=$${game.settings.deviceId}`, game.hostToken, { uris: [`spotify:track:${firstSong.spotifyId}`] });
        broadcastToLobby(pin, { type: 'game-starting', payload: { firstSong, guessTime: parseInt(game.settings.guessTime) } });
    } else { // Quiz mode
        game.gameState = 'PLAYING';
        game.currentRound = 0;
        startRoundCountdown(pin);
    }
}


// ... (startRoundCountdown, startNewRound, evaluateRound etc. müssen ggf. Achievement-Tracking hinzufügen)

async function endGame(pin, cleanup = true) {
    const game = games[pin];
    if (!game || game.gameState === 'FINISHED') return; // Prevent double execution
     console.log(`Ending game ${pin}. Cleanup: ${cleanup}`);
    game.gameState = 'FINISHED';

    if (game.hostToken && game.settings.deviceId) {
        spotifyApiCall('put', `https://api.spotify.com/v1/me/player/pause?device_id=$${game.settings.deviceId}`, game.hostToken); // Stop music
    }

    const finalScores = getScores(pin);
    broadcastToLobby(pin, { type: 'game-over', payload: { scores: finalScores } });

    // --- Update stats and check achievements ---
    const winningScore = Math.max(0, ...finalScores.map(s => s.score)); // Ensure winning score >= 0
    let winnerCount = 0;
    if (winningScore > 0) {
        winnerCount = finalScores.filter(s => s.score === winningScore).length;
    }
    const isDraw = winnerCount > 1;

    console.log(`Game ${pin} finished. Winning Score: ${winningScore}, Draw: ${isDraw}`);

    for (const player of Object.values(game.players)) {
        if (!player.ws?.playerId || player.ws.playerId.startsWith('guest-')) continue; // Skip guests or disconnected players without ID

        const playerId = player.ws.playerId;
        const playerWs = player.ws;
        const gainedXp = player.score; // Simple XP = Score
        const isWin = !isDraw && player.score === winningScore && winningScore > 0;
        const isHost = playerId === game.hostId;

         console.log(`Updating stats for player ${playerId}: XP=${gainedXp}, Win=${isWin}, Score=${player.score}, Host=${isHost}, Correct=${player.correctAnswers}, Incorrect=${player.incorrectAnswersThisGame}, ExactYears=${player.exactYearGuesses}`);

        // Update DB via RPC function
        supabase.rpc('update_player_stats', {
            p_user_id: playerId,
            p_gained_xp: gainedXp,
            p_gained_correct_answers: player.correctAnswers || 0,
            p_is_win: isWin,
            p_new_score: player.score,
            p_is_host: isHost // Pass host status
        }).then(async ({ error: rpcError }) => {
            if (rpcError) {
                console.error(`DB Update-Fehler für ${player.nickname} (ID: ${playerId}):`, rpcError);
            } else {
                 console.log(`Stats updated successfully for player ${playerId}. Checking achievements...`);
                // --- Check Achievements POST-game ---
                // Fetch updated stats to check achievements accurately
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('games_played, wins, correct_answers, consecutive_wins, games_hosted')
                    .eq('id', playerId)
                    .single();

                if (profileError) {
                    console.error(`Failed to fetch updated profile for achievement check (Player ${playerId}):`, profileError);
                    return; // Skip achievement check if profile fetch fails
                }

                 console.log(`Updated profile for ${playerId}:`, profile);

                 // Check server-side achievements based on profile data
                if (profile.games_played >= 1) awardAchievement(playerWs, playerId, 1); // Erstes Spiel
                if (profile.games_played >= 3) awardAchievement(playerWs, playerId, 17); // Aufwärmrunde
                if (profile.correct_answers >= 100) awardAchievement(playerWs, playerId, 2); // Besserwisser
                if (profile.correct_answers >= 500) awardAchievement(playerWs, playerId, 6); // Musik-Lexikon
                if (profile.wins >= 10) awardAchievement(playerWs, playerId, 3); // Seriensieger
                if (profile.consecutive_wins >= 5) awardAchievement(playerWs, playerId, 7); // Unbesiegbar
                if (profile.games_hosted >= 1) awardAchievement(playerWs, playerId, 10); // Gastgeber
                if (player.score >= 1000) awardAchievement(playerWs, playerId, 18); // Highscorer
                if (player.incorrectAnswersThisGame >= 5) awardAchievement(playerWs, playerId, 12); // knapp daneben
                if (player.exactYearGuesses >= 25) awardAchievement(playerWs, playerId, 8); // Jahrhundert-Genie
                // Achievement 19 (Perfektionist) needs round count check
                const totalRoundsPlayed = game.currentRound; // Or use game.totalRounds if points mode
                if (totalRoundsPlayed >= 5 && player.incorrectAnswersThisGame === 0 && player.correctAnswers >= totalRoundsPlayed) {
                     awardAchievement(playerWs, playerId, 19);
                }
                // Achievement 20 (Verlierer) - needs tracking losses (approximated here)
                // Note: consecutive_wins reset means a loss or non-win. Need a dedicated losses column for accuracy.
                const approximateLosses = profile.games_played - profile.wins;
                if (approximateLosses >= 3) awardAchievement(playerWs, playerId, 20);

                // Achievements based on game mode wins (check gameMode)
                if (isWin) {
                     if (game.gameMode === 'timeline') awardAchievement(playerWs, playerId, 4); // Historiker
                     if (game.gameMode === 'popularity') awardAchievement(playerWs, playerId, 5); // Trendsetter
                }
                 // Achievement 13 (Präzisionsarbeit) - needs per-round flag `player.perfectRound`
                 if (player.perfectRound) {
                     awardAchievement(playerWs, playerId, 13);
                 }


            }
        });
    }

    if (cleanup) {
        setTimeout(() => {
             console.log(`Deleting game ${pin} after cleanup timeout.`);
            delete games[pin];
        }, 60000); // Wait 60s before deleting game data
    }
}

server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
