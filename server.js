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
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

app.use(express.static(__dirname));
app.use(cookieParser());
app.use(express.json());

let games = {};
const onlineUsers = new Map(); // Maps userId to WebSocket object
const HEARTBEAT_INTERVAL = 30000; // 30 Sekunden für WebSocket Heartbeat

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
async function hasAchievement(userId, achievementId) {
    const { data, error } = await supabase
        .from('user_achievements')
        .select('achievement_id')
        .eq('user_id', userId)
        .eq('achievement_id', achievementId)
        .maybeSingle();
    return !!data;
}
async function awardAchievement(ws, userId, achievementId) {
    if (userId.startsWith('guest-')) return;
    const alreadyHas = await hasAchievement(userId, achievementId);
    if (alreadyHas) return;

    const { error } = await supabase
        .from('user_achievements')
        .insert({ user_id: userId, achievement_id: achievementId });

    if (error) {
        console.error(`Fehler beim Speichern von Achievement ${achievementId} für User ${userId}:`, error);
    } else {
        const achievement = [ /* achievementsList data is not available on server, rely on client for names */ ].find(a => a.id === achievementId);
        console.log(`Achievement ${achievementId} (${achievement?.name}) verliehen an User ${userId}.`);
        // Note: Client relies on fetching updated achievements after game end or an explicit message.
        // showToastToPlayer(ws, `Erfolg freigeschaltet: ${achievement?.name || 'Neuer Erfolg'}!`);
    }
}


// --- Express Routen ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/api/config', (req, res) => res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }));
app.get('/login', (req, res) => { const scopes = 'user-read-private user-read-email playlist-read-private streaming user-modify-playback-state user-read-playback-state'; res.redirect('https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, scope: scopes, redirect_uri: REDIRECT_URI }).toString()); });

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    if (!code) return res.redirect('/#error=auth_failed');
    
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            }).toString(),
            headers: {
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const cookieOptions = {
            httpOnly: true,
            maxAge: 3600000, // 1 Stunde
            secure: !req.headers.host.includes('localhost'),
            path: '/' // WICHTIG: Setzt den Pfad
        };

        res.cookie('spotify_access_token', response.data.access_token, cookieOptions);
        res.redirect('/');

    } catch (error) {
        console.error("Spotify Callback Error:", error.response?.data || error.message);
        
        const errorData = error.response ? error.response.data : { message: error.message };
        
        res.status(500).send(`
            <div style="font-family: sans-serif; background: #222; color: #eee; padding: 20px;">
                <h1>Spotify Login Fehler</h1>
                <p>Der Token-Tausch ist fehlgeschlagen. Das ist der Grund:</p>
                <pre style="background: #000; padding: 15px; border-radius: 8px; color: #ff8a8a;">${JSON.stringify(errorData, null, 2)}</pre>
                <p>Bitte kopiere diesen Text und schicke ihn mir.</p>
            </div>
        `);
    }
});

app.post('/logout', (req, res) => { res.clearCookie('spotify_access_token'); res.status(200).json({ message: 'Erfolgreich ausgeloggt' }); });
app.get('/api/status', (req, res) => { const token = req.cookies.spotify_access_token; if (token) { res.json({ loggedIn: true, token: token }); } else { res.status(200).json({ loggedIn: false }); } });
app.get('/api/playlists', async (req, res) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ message: "Nicht autorisiert" }); try { const d = await axios.get('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${token}` } }); res.json(d.data); } catch (e) { console.error("Playlist API Error:", e.response?.status, e.response?.data); res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Playlists" }); } });
app.get('/api/devices', async (req, res) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ message: "Nicht autorisiert" }); try { const d = await axios.get('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } }); res.json(d.data); } catch (e) { console.error("Device API Error:", e.response?.status, e.response?.data); res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Geräte" }); } });


// --- WebSocket Server ---
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    console.log('Client verbunden');
    ws.isAlive = true; // Heartbeat-Flag setzen
    ws.on('pong', () => { ws.isAlive = true; }); // Ping-Antwort zurücksetzen

    ws.on('message', message => { try { const data = JSON.parse(message); handleWebSocketMessage(ws, data); } catch (e) { console.error("Fehler bei WebSocket-Nachricht:", e, message.toString()); } });
    ws.on('close', () => handlePlayerDisconnect(ws));
    ws.on('error', (error) => console.error('WebSocket Error:', error));
});

// WebSocket Heartbeat-Logik
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();

        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);

wss.on('close', function close() {
    clearInterval(interval);
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
         if (Object.values(gameToJoin.players).filter(p => p.isConnected).length >= 4) {
            Object.values(gameToJoin.players).forEach(p => awardAchievement(p.ws, p.ws.playerId, 11));
        }
    } else {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Lobby nicht gefunden oder Spiel läuft bereits.' } }));
    }
}

function handleWebSocketMessage(ws, data) {
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
                 // FIX: Disconnect Timer löschen, um sofortiges Entfernen zu verhindern
                 clearTimeout(gameToReconnect.players[reconnectPlayerId].disconnectTimer);
                 gameToReconnect.players[reconnectPlayerId].disconnectTimer = null;

                ws.pin = reconnectPin; ws.playerId = reconnectPlayerId;
                gameToReconnect.players[reconnectPlayerId].ws = ws;
                gameToReconnect.players[reconnectPlayerId].isConnected = true;
                onlineUsers.set(reconnectPlayerId, ws);
                showToastToPlayer(ws, 'Verbindung wiederhergestellt!');
                broadcastLobbyUpdate(reconnectPin);
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
                awardAchievement(ws, playerId, 10);
                break;
            case 'join-game':
                if (!payload.user || !payload.user.id) return ws.send(JSON.stringify({ type: 'error', payload: { message: 'Ungültige Beitritts-Anfrage.' } }));
                joinGame(ws, payload.user, payload.pin);
                break;
            case 'update-settings':
                if (game && game.hostId === playerId) {
                    game.settings = { ...game.settings, ...payload };
                    if(payload.lives) { Object.values(game.players).forEach(p => p.lives = game.settings.lives); }
                    broadcastLobbyUpdate(pin);
                }
                break;
            case 'update-nickname':
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
                    const activePlayers = Object.values(game.players).filter(p => p.isConnected && (game.settings.gameType === 'points' || p.lives > 0));
                    if (activePlayers.every(p => p.isReady)) {
                         console.log(`All active players ready in game ${pin}. Proceeding.`);
                        if (game.gameState === 'RESULTS' || game.gameState === 'PRE_ROUND') {
                            clearTimeout(game.nextRoundTimer);
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
        showToastToPlayer(ws, "Ein interner Fehler ist aufgetreten.", true);
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
        const { error: deleteError } = await supabase.from('friend_requests').delete().match({ sender_id: senderId, receiver_id: receiverId });
        if (deleteError) console.error('Accept-FA Delete Error:', deleteError);

        const user1 = receiverId < senderId ? receiverId : senderId;
        const user2 = receiverId < senderId ? senderId : receiverId;
        const { error: insertError } = await supabase.from('friends').insert({ user_id1: user1, user_id2: user2 });
        if (insertError && insertError.code !== '23505') throw insertError;

        showToastToPlayer(ws, "Freundschaftsanfrage angenommen!");
        awardAchievement(ws, receiverId, 14);


        const friendSourceWs = onlineUsers.get(senderId);
        if (friendSourceWs && friendSourceWs.readyState === WebSocket.OPEN) {
            showToastToPlayer(friendSourceWs, "Deine Freundschaftsanfrage wurde angenommen!");
             awardAchievement(friendSourceWs, senderId, 14);
        }
    } catch (error) {
        console.error('Fehler bei accept-friend-request:', error);
        showToastToPlayer(ws, "Fehler beim Annehmen der Anfrage.", true);
    }
}

async function handleDeclineFriendRequest(ws, currentUserId, payload) {
    const otherUserId = payload.userId;
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

    if (playerId === game.hostId) {
         console.log(`Host ${playerId} disconnected from game ${pin}. Stopping music.`);
        spotifyApiCall('put', `https://api.spotify.com/v1/me/player/pause?device_id=$${game.settings.deviceId}`, game.hostToken);
    }

    if (game.gameState === 'LOBBY' || game.gameState === 'PLAYING' || game.gameState === 'RESULTS') {
        if (player.nickname) {
            broadcastToLobby(pin, { type: 'toast', payload: { message: `${player.nickname} hat die Verbindung verloren...` } });
        }
        broadcastLobbyUpdate(pin);

        if (game.gameState === 'PLAYING' || game.gameState === 'RESULTS') {
            checkRoundEnd(pin);
            const activePlayers = Object.values(game.players).filter(p => p.isConnected && (game.settings.gameType === 'points' || p.lives > 0));
            if (game.settings.gameType === 'lives' && activePlayers.length <= 1) {
                 console.log(`Game ${pin} ending due to player disconnect (lives mode).`);
                 endGame(pin);
            }
        }
    }

    player.disconnectTimer = setTimeout(() => {
        const currentGame = games[pin];
        if (currentGame && currentGame.players[playerId] && !currentGame.players[playerId].isConnected) {
             console.log(`Permanently removing player ${playerId} from game ${pin} after timeout.`);
            if (playerId === currentGame.hostId) {
                broadcastToLobby(pin, { type: 'toast', payload: { message: 'Der Host hat das Spiel verlassen. Das Spiel wird beendet.', isError: true } });
                endGame(pin, false);
                delete games[pin];
                return;
            }
            delete currentGame.players[playerId];
            if (Object.keys(currentGame.players).length === 0) {
                 console.log(`Game ${pin} is empty, deleting game.`);
                delete games[pin];
            } else {
                broadcastLobbyUpdate(pin);
            }
        }
    }, 60000);
}

// Dummy-Funktionen, die im vollen Code existieren müssten
function checkRoundEnd(pin) { /* Implementiere Logik */ }
function handleTimelineGuess(pin, playerId, payload) { /* Implementiere Logik */ }
function handlePopularityGuess(pin, playerId, payload) { /* Implementiere Logik */ }
function startRoundCountdown(pin) { /* Implementiere Logik */ }
// END DUMMY-FUNKTIONEN

async function startGame(pin) {
    const game = games[pin];
    if (!game) return;
     console.log(`Attempting to start game ${pin} by host ${game.hostId}`);

    const deviceSet = await spotifyApiCall('put', `https://api.spotify.com/v1/me/player`, game.hostToken, { device_ids: [game.settings.deviceId], play: false });
    if (!deviceSet) {
         showToastToPlayer(game.players[game.hostId].ws, "Spotify-Gerät konnte nicht aktiviert werden. Ist es online?", true);
         return;
    }

    Object.values(game.players).forEach(p => {
        p.score = 0;
        p.lives = game.settings.lives;
        p.timeline = [];
        p.hasGuessed = false;
        p.correctAnswers = 0;
        p.incorrectAnswersThisGame = 0;
        p.exactYearGuesses = 0;
        p.perfectRound = false;
    });

    const tracks = await getPlaylistTracks(game.settings.playlistId, game.hostToken);
    if (!tracks || tracks.length < 1) {
        broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist ist leer oder konnte nicht geladen werden.' } });
        game.gameState = 'LOBBY';
        return;
    }
     console.log(`Loaded ${tracks.length} tracks for game ${pin}`);
    game.songList = shuffleArray(tracks);
    const songCount = parseInt(game.settings.songCount);

    if (songCount > 0 && game.settings.gameType === 'points') {
        game.songList = game.songList.slice(0, songCount);
        game.totalRounds = game.songList.length;
    } else {
        game.totalRounds = (game.settings.gameType === 'lives') ? 0 : game.songList.length;
    }

    if (game.gameMode === 'timeline' || game.gameMode === 'popularity') {
        game.gameState = 'PRE_ROUND';
        const firstSong = game.songList.shift();
        if (!firstSong) {
             broadcastToLobby(pin, { type: 'error', payload: { message: 'Playlist hat nicht genügend Songs für diesen Modus.' } });
             game.gameState = 'LOBBY'; return;
        }
        Object.values(game.players).forEach(p => p.timeline.push(firstSong));
        await spotifyApiCall('put', `https://api.spotify.com/v1/me/player/play?device_id=$${game.settings.deviceId}`, game.hostToken, { uris: [`spotify:track:${firstSong.spotifyId}`] });
        broadcastToLobby(pin, { type: 'game-starting', payload: { firstSong, guessTime: parseInt(game.settings.guessTime) } });
    } else {
        game.gameState = 'PLAYING';
        game.currentRound = 0;
        startRoundCountdown(pin);
    }
}


async function endGame(pin, cleanup = true) {
    const game = games[pin];
    if (!game || game.gameState === 'FINISHED') return;
     console.log(`Ending game ${pin}. Cleanup: ${cleanup}`);
    game.gameState = 'FINISHED';

    if (game.hostToken && game.settings.deviceId) {
        spotifyApiCall('put', `https://api.spotify.com/v1/me/player/pause?device_id=$${game.settings.deviceId}`, game.hostToken);
    }

    const finalScores = getScores(pin);
    broadcastToLobby(pin, { type: 'game-over', payload: { scores: finalScores } });

    const winningScore = Math.max(0, ...finalScores.map(s => s.score));
    let winnerCount = 0;
    if (winningScore > 0) {
        winnerCount = finalScores.filter(s => s.score === winningScore).length;
    }
    const isDraw = winnerCount > 1;

    console.log(`Game ${pin} finished. Winning Score: ${winningScore}, Draw: ${isDraw}`);

    for (const player of Object.values(game.players)) {
        if (!player.ws?.playerId || player.ws.playerId.startsWith('guest-')) continue;

        const playerId = player.ws.playerId;
        const playerWs = player.ws;
        const gainedXp = player.score;
        const isWin = !isDraw && player.score === winningScore && winningScore > 0;
        const isHost = playerId === game.hostId;

         console.log(`Updating stats for player ${playerId}: XP=${gainedXp}, Win=${isWin}, Score=${player.score}, Host=${isHost}, Correct=${player.correctAnswers}, Incorrect=${player.incorrectAnswersThisGame}, ExactYears=${player.exactYearGuesses}`);

        supabase.rpc('update_player_stats', {
            p_user_id: playerId,
            p_gained_xp: gainedXp,
            p_gained_correct_answers: player.correctAnswers || 0,
            p_is_win: isWin,
            p_new_score: player.score,
            p_is_host: isHost
        }).then(async ({ error: rpcError }) => {
            if (rpcError) {
                console.error(`DB Update-Fehler für ${player.nickname} (ID: ${playerId}):`, rpcError);
            } else {
                 console.log(`Stats updated successfully for player ${playerId}. Checking achievements...`);
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('games_played, wins, correct_answers, consecutive_wins, games_hosted')
                    .eq('id', playerId)
                    .single();

                if (profileError) {
                    console.error(`Failed to fetch updated profile for achievement check (Player ${playerId}):`, profileError);
                    return;
                }

                 console.log(`Updated profile for ${playerId}:`, profile);

                 // Check server-side achievements based on profile data
                if (profile.games_played >= 1) awardAchievement(playerWs, playerId, 1);
                if (profile.games_played >= 3) awardAchievement(playerWs, playerId, 17);
                if (profile.correct_answers >= 100) awardAchievement(playerWs, playerId, 2);
                if (profile.correct_answers >= 500) awardAchievement(playerWs, playerId, 6);
                if (profile.wins >= 10) awardAchievement(playerWs, playerId, 3);
                if (profile.consecutive_wins >= 5) awardAchievement(playerWs, playerId, 7);
                if (profile.games_hosted >= 1) awardAchievement(playerWs, playerId, 10);
                if (player.score >= 1000) awardAchievement(playerWs, playerId, 18);
                if (player.incorrectAnswersThisGame >= 5) awardAchievement(playerWs, playerId, 12);
                if (player.exactYearGuesses >= 25) awardAchievement(playerWs, playerId, 8);
                const totalRoundsPlayed = game.currentRound;
                if (totalRoundsPlayed >= 5 && player.incorrectAnswersThisGame === 0 && player.correctAnswers >= totalRoundsPlayed) {
                     awardAchievement(playerWs, playerId, 19);
                }
                const approximateLosses = profile.games_played - profile.wins;
                if (approximateLosses >= 3) awardAchievement(playerWs, playerId, 20);

                if (isWin) {
                     if (game.gameMode === 'timeline') awardAchievement(playerWs, playerId, 4);
                     if (game.gameMode === 'popularity') awardAchievement(playerWs, playerId, 5);
                }
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
        }, 60000);
    }
}

server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
