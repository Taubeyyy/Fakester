// server.js - FINAL VERSION (Fixed Syntax Error)

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
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

process.on('uncaughtException', (err, origin) => { /* ... error handling ... */ });
process.on('unhandledRejection', (reason, promise) => { /* ... error handling ... */ });

const app = express();
const server = http.createServer(app);
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.use(express.static(__dirname));
app.use(cookieParser());
app.use(express.json());

// --- Authentication Middleware (Placeholder - Needs secure implementation!) ---
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = authHeader.substring(7);
        try {
            const { data: { user }, error } = await supabaseAnon.auth.getUser(jwt);
            if (error) { console.warn('Auth Middleware: Invalid JWT:', error.message); }
            else if (user) { req.user = user; userId = user.id; console.log(`Auth Middleware: Authenticated user ${userId}`); }
        } catch (e) { console.error('Auth Middleware: Error validating JWT:', e); }
    } else { console.log("Auth Middleware: No Bearer token found."); }
    req.userId = userId;
    next();
};
app.use('/api', authenticateUser);

let games = {};
const onlineUsers = new Map();
const HEARTBEAT_INTERVAL = 30000;

// --- Shop Data ---
const shopItems = [
    { id: 101, type: 'title', name: 'Musik-Guru', cost: 100, unlockType: 'spots', unlockValue: 100, description: 'Zeige allen dein Wissen!' },
    { id: 102, type: 'title', name: 'Playlist-Meister', cost: 150, unlockType: 'spots', unlockValue: 150, description: 'Für echte Kenner.' },
    { id: 201, type: 'icon', iconClass: 'fa-diamond', cost: 250, unlockType: 'spots', unlockValue: 250, description: 'Ein glänzendes Icon.' },
    { id: 202, type: 'icon', iconClass: 'fa-hat-wizard', cost: 300, unlockType: 'spots', unlockValue: 300, description: 'Magisch!' },
    { id: 301, type: 'background', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', unlockValue: 500, description: 'Retro-Vibes für deine Lobby.', backgroundId: '301' },
    { id: 302, type: 'background', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', unlockValue: 600, description: 'Fühl dich wie ein Star.', backgroundId: '302' },
    { id: 401, type: 'consumable', name: 'Doppelte Punkte (1 Runde)', itemId: 'double_points_1r', cost: 50, unlockType: 'spots', unlockValue: 50, description: 'Verdoppelt deine Punkte in der nächsten Runde.' },
];

// --- Helper Functions ---
function getScores(pin) { /* ... remains same ... */ }
function showToastToPlayer(ws, message, isError = false) { if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: 'toast', payload: { message, isError } })); } catch (e) { console.error(`Failed to send toast to player ${ws.playerId}:`, e); } } }
async function getPlaylistTracks(playlistId, token) { /* ... remains same ... */ }
async function spotifyApiCall(method, url, token, data = {}) { /* ... remains same ... */ }
async function hasAchievement(userId, achievementId) { /* ... remains same ... */ }
function broadcastToLobby(pin, message) { /* ... remains same ... */ }
function broadcastLobbyUpdate(pin) { /* ... remains same ... */ }
async function awardAchievement(ws, userId, achievementId) { /* ... remains same, includes spot bonus logic ... */ }


// --- Express Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/api/config', (req, res) => res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }));
app.get('/login', (req, res) => { /* ... remains same ... */ });
app.get('/callback', async (req, res) => { /* ... remains same ... */ });
app.post('/logout', (req, res) => { /* ... remains same ... */ });
app.get('/api/status', (req, res) => { /* ... remains same ... */ });
app.get('/api/playlists', async (req, res) => { /* ... remains same ... */ });
app.get('/api/devices', async (req, res) => { /* ... remains same ... */ });

// --- SHOP API Routes ---
app.get('/api/shop/items', async (req, res) => { /* ... remains same ... */ });
app.post('/api/shop/buy', async (req, res) => { /* ... remains same, uses RPC purchase_item ... */ });

// --- GIFTING API Route ---
app.post('/api/friends/gift', async (req, res) => {
    const { recipientId, amount } = req.body;
    const senderId = req.userId; // From middleware

    if (!senderId) { return res.status(401).json({ success: false, message: "Nicht eingeloggt" }); }
    if (!recipientId || !amount || !Number.isInteger(amount) || amount <= 0) { return res.status(400).json({ success: false, message: "Ungültige Eingabe (Empfänger oder Betrag)" }); }

    try {
        const { data, error } = await supabase.rpc('transfer_spots', {
            p_sender_id: senderId,
            p_recipient_id: recipientId,
            p_amount: amount
        });

        if (error || (data && !data.success)) {
            const errorMessage = error?.message || data?.message || "Datenbankfehler beim Schenken";
            console.error(`RPC transfer_spots error from ${senderId} to ${recipientId}:`, errorMessage);
             if (errorMessage.includes('Insufficient spots') || errorMessage.includes('yourself') || errorMessage.includes('positive') || errorMessage.includes('Recipient not found')) {
                 return res.status(400).json({ success: false, message: errorMessage });
             }
            throw new Error(errorMessage);
        }

        if (data && data.success) {
            console.log(`User ${senderId} gifted ${amount} Spots to ${recipientId}. New sender balance: ${data.newSenderSpots}`);
            const recipientWs = onlineUsers.get(recipientId);
            if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                const senderNickname = onlineUsers.get(senderId)?.nickname || 'Ein Spieler';
                showToastToPlayer(recipientWs, `Du hast ${amount} Spots von ${senderNickname} erhalten!`);

                // #############################################
                // ### KORREKTUR HIER ###
                // #############################################
                // Sende die neuen Spots des Empfängers (muss separat geholt werden oder RPC muss es zurückgeben)
                const { data: recipientData } = await supabase.from('profiles').select('spots').eq('id', recipientId).single();
                if (recipientData) {
                    recipientWs.send(JSON.stringify({ type: 'profile-update', payload: { spots: recipientData.spots } }));
                }
                // #############################################

            }
            res.json({ success: true, newSenderSpots: data.newSenderSpots });
        } else {
            // Should not happen if RPC error handling is correct
            console.error(`RPC transfer_spots failed logically from ${senderId} to ${recipientId}:`, data?.message);
            res.status(400).json({ success: false, message: data?.message || "Schenken fehlgeschlagen (Logikfehler)" });
        }

    } catch (error) {
        console.error("Schwerer Fehler bei /api/friends/gift:", error);
        res.status(500).json({ success: false, message: error.message || "Schenken fehlgeschlagen (Serverfehler)" });
    }
});


// --- WebSocket Server ---
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => { /* ... remains same ... */ });
const interval = setInterval(function ping() { /* ... remains same ... */ });
wss.on('close', function close() { clearInterval(interval); });

// --- WebSocket Message Handler ---
async function handleWebSocketMessage(ws, data) { // Async hinzugefügt für await bei update-settings
    try {
        const { type, payload } = data;
        let { pin, playerId, nickname } = ws; // Get stored info from ws
        let game = games[pin];

        // Early checks
        if (type === 'register-online') {
            playerId = payload.userId;
            nickname = payload.username; // Assume client sends username
            ws.playerId = playerId;
            ws.nickname = nickname;
            onlineUsers.set(playerId, ws);
            console.log(`User ${playerId} (${nickname || 'No Nickname'}) registered online.`);
            return;
        }
        if (type === 'reconnect') { /* ... remains same ... */ return; }
        if (type === 'send-reaction') { /* ... remains same ... */ return; }
        if (type === 'use-consumable') { /* ... remains same ... */ return; }
        // Friend requests remain same
        if (type === 'add-friend') { /* ... */ return; }
        if (type === 'accept-friend-request') { /* ... */ return; }
        if (type === 'decline-friend-request' || type === 'remove-friend-request') { /* ... */ return; }
        if (type === 'remove-friend') { /* ... */ return; }


        // Game context required actions
        if (!game && !['create-game', 'join-game'].includes(type)) { console.warn(`Action ${type} requires game context (Pin: ${pin}).`); return; }
        // Player must be in game (except for create/join)
        // Ensure playerId is set on ws before this check!
        if (game && !game.players[playerId] && !['create-game', 'join-game'].includes(type)) { console.warn(`Player ${playerId} not found in game ${pin} for action ${type}.`); return; }


        switch (type) {
            case 'create-game':
                if (!payload.user || !payload.user.id) return showToastToPlayer(ws, "Ungültige Benutzerdaten.", true);
                playerId = payload.user.id; // Set playerId for this connection
                nickname = payload.user.username;
                ws.playerId = playerId;
                ws.nickname = nickname;
                onlineUsers.set(playerId, ws); // Register host immediately

                if (playerId.startsWith('guest-')) return showToastToPlayer(ws, "Nur registrierte Benutzer können Spiele hosten.", true);
                if (!payload.token) return showToastToPlayer(ws, "Spotify Token fehlt.", true); // Need token to host

                const newPin = generatePin();
                ws.pin = newPin; // Store pin on ws connection
                const initialSettings = { deviceId: null, playlistId: null, songCount: 10, guessTime: 30, gameType: payload.gameType || 'points', lives: payload.lives || 3, answerType: 'freestyle', chosenBackgroundId: null };
                games[newPin] = {
                    hostId: playerId,
                    players: { [playerId]: { ws, nickname: nickname, score: 0, lives: initialSettings.lives, isConnected: true, isReady: false, timeline: [], correctAnswers: 0, incorrectAnswersThisGame: 0, exactYearGuesses: 0, perfectRound: false, activeEffects: {} } }, // Added activeEffects
                    settings: initialSettings, hostToken: payload.token, gameState: 'LOBBY', gameMode: payload.gameMode || 'quiz'
                };
                console.log(`Game ${newPin} created by host ${nickname} (${playerId})`);
                ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId: playerId, isHost: true, gameMode: games[newPin].gameMode } }));
                broadcastLobbyUpdate(newPin);
                awardAchievement(ws, playerId, 10);
                break;
            case 'join-game':
                if (!payload.user || !payload.user.id || !payload.pin) return showToastToPlayer(ws, "Ungültige Beitrittsanfrage.", true);
                playerId = payload.user.id; // Set playerId for this connection
                nickname = payload.user.username;
                ws.playerId = playerId;
                ws.nickname = nickname;
                ws.pin = payload.pin; // Store pin on ws connection
                onlineUsers.set(playerId, ws); // Register user

                joinGame(ws, payload.user, payload.pin); // Pass ws
                break;
            case 'update-settings': // Needs to be async because of DB check
                if (game && game.hostId === playerId) {
                    const hostWs = game.players[playerId]?.ws;
                    let processedPayload = { ...payload };

                    // Validate background choice
                    if (processedPayload.chosenBackgroundId) {
                        const bgId = processedPayload.chosenBackgroundId;
                         // Check local list first for efficiency (ensure backgroundId exists)
                         const bgExists = backgroundsList.find(b => b.backgroundId === bgId);
                         if (!bgExists) {
                             console.warn(`Host ${playerId} tried to set non-existent background ${bgId}`);
                             showToastToPlayer(hostWs, "Dieser Hintergrund existiert nicht.", true);
                             delete processedPayload.chosenBackgroundId;
                         } else {
                             // Check ownership in DB
                             const { count, error } = await supabase
                                 .from('user_owned_backgrounds')
                                 .select('*', { count: 'exact', head: true }) // Efficient count check
                                 .eq('user_id', playerId)
                                 .eq('background_id', bgId);

                             if (error || count === 0) {
                                  console.warn(`Host ${playerId} tried to set unowned background ${bgId}`);
                                  showToastToPlayer(hostWs, "Du besitzt diesen Hintergrund nicht.", true);
                                  delete processedPayload.chosenBackgroundId;
                             }
                         }
                    }

                    game.settings = { ...game.settings, ...processedPayload };
                    if(processedPayload.lives !== undefined) { Object.values(game.players).forEach(p => p.lives = game.settings.lives); } // Check if lives was actually passed
                    broadcastLobbyUpdate(pin);
                }
                break;
            case 'update-nickname': // Added check for game and player existence
                 if (game && game.players[playerId] && payload.newName) {
                     game.players[playerId].nickname = payload.newName.substring(0, 15); // Limit length
                     ws.nickname = game.players[playerId].nickname; // Update ws object too
                     broadcastLobbyUpdate(pin);
                 }
                 break;
             case 'start-game':
                 if (game && game.hostId === playerId && game.settings.playlistId && game.settings.deviceId) {
                     await startGame(pin); // Make sure startGame is async if it does async things
                 } else if (game && game.hostId === playerId) {
                      showToastToPlayer(ws, "Bitte wähle zuerst ein Wiedergabegerät und eine Playlist.", true);
                 }
                 break;
             case 'live-guess-update': /* ... remains same ... */ break;
             case 'submit-guess': /* ... remains same ... */ break;
             case 'player-ready': /* ... remains same ... */ break;
             case 'invite-friend': /* ... remains same ... */ break;
             case 'invite-response': /* ... remains same ... */ break;
             case 'leave-game': // Handle leaving explicitly
                  console.log(`Player ${nickname} (${playerId}) leaving game ${pin}`);
                  handlePlayerDisconnect(ws); // Use the existing disconnect logic
                  // Maybe send confirmation back?
                  // ws.send(JSON.stringify({ type: 'left-success' }));
                  break;
            default:
                 console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    } catch(e) {
        console.error("Error processing WebSocket message:", e);
        showToastToPlayer(ws, "Ein interner Serverfehler ist aufgetreten.", true);
    }
}


// --- Player Disconnect Logic (slightly improved logging) ---
function handlePlayerDisconnect(ws) {
    const { pin, playerId, nickname } = ws; // Get info from ws object
    if (playerId) {
        onlineUsers.delete(playerId);
         console.log(`Player ${nickname || 'Unknown Nickname'} (${playerId}) disconnected.`);
    } else {
         console.log("Client disconnected without stored playerId.");
    }

    const game = games[pin];
    if (!game || !game.players[playerId]) {
         console.log(`No active game found for disconnected player ${playerId} with pin ${pin}`);
         return; // Nothing to do if player wasn't in a game or game doesn't exist
    }


    const player = game.players[playerId];
    // Avoid double disconnect logic if already marked
    if (!player.isConnected) {
        console.log(`Player ${nickname} (${playerId}) already marked as disconnected.`);
        return;
    }

    player.isConnected = false;

    if (playerId === game.hostId) {
         console.log(`Host ${nickname} (${playerId}) disconnected from game ${pin}. Stopping music.`);
        if (game.settings.deviceId && game.hostToken) {
             spotifyApiCall('put', `https://accounts.spotify.com/authorize4{game.settings.deviceId}`, game.hostToken)
             .catch(err => console.error("Error stopping playback on host disconnect:", err.response?.data || err.message)); // Catch potential API error
         } else {
             console.warn("Cannot stop playback: deviceId or hostToken missing.");
         }
    }

    // Inform others and update lobby/game state
    if (['LOBBY', 'PLAYING', 'RESULTS', 'PRE_ROUND'].includes(game.gameState)) {
         broadcastToLobby(pin, { type: 'toast', payload: { message: `${nickname || 'Ein Spieler'} hat die Verbindung verloren...` } });
         broadcastLobbyUpdate(pin); // Update player list visuals

        // If game is active, check if round/game ends
        if (game.gameState === 'PLAYING' || game.gameState === 'RESULTS' || game.gameState === 'PRE_ROUND') {
            checkRoundEnd(pin); // Needs implementation - checks if all remaining players guessed/are ready
            const activePlayers = Object.values(game.players).filter(p => p.isConnected && (game.settings.gameType === 'points' || p.lives > 0));

            // End game if only one player left in lives mode OR if host left during active game (alternative: assign new host?)
            if (activePlayers.length <= 1 && game.settings.gameType === 'lives' && game.gameState !== 'LOBBY') {
                 console.log(`Game ${pin} ending due to player disconnect (lives mode, ${activePlayers.length} players left).`);
                 endGame(pin);
            } else if (playerId === game.hostId && game.gameState !== 'LOBBY' && game.gameState !== 'FINISHED') {
                 console.log(`Game ${pin} ending because host disconnected during the game.`);
                 broadcastToLobby(pin, { type: 'toast', payload: { message: 'Der Host hat das Spiel verlassen. Das Spiel wird beendet.', isError: true }});
                 endGame(pin, false); // End immediately, don't clean up yet (timeout handles it)
                 // Consider deleting the game sooner if host leaves mid-game?
                 // delete games[pin];
            }
        }
    } else {
         console.log(`Player ${nickname} disconnected from game ${pin} in state ${game.gameState}. No broadcast needed.`);
    }


    // Timeout to remove player permanently if they don't reconnect
    // Clear any existing timer first
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
        // Re-fetch game and player state inside timeout
        const currentGameOnTimeout = games[pin];
        if (currentGameOnTimeout && currentGameOnTimeout.players[playerId] && !currentGameOnTimeout.players[playerId].isConnected) {
            console.log(`Permanently removing player ${nickname} (${playerId}) from game ${pin} after timeout.`);

            // If host is removed permanently, end the game for everyone
            if (playerId === currentGameOnTimeout.hostId) {
                broadcastToLobby(pin, { type: 'toast', payload: { message: 'Der Host ist nicht zurückgekehrt. Das Spiel wird beendet.', isError: true } });
                // Ensure game ends properly even if it wasn't ended before
                if (currentGameOnTimeout.gameState !== 'FINISHED') {
                     endGame(pin, false); // End without another cleanup timeout
                }
                console.log(`Deleting game ${pin} because host was permanently removed.`);
                delete games[pin];
                return; // Game is gone, nothing more to do
            }

            // Remove non-host player
            delete currentGameOnTimeout.players[playerId];

            // Check if game is now empty
            if (Object.keys(currentGameOnTimeout.players).length === 0) {
                 console.log(`Game ${pin} is empty after removing ${nickname}, deleting game.`);
                delete games[pin];
            } else {
                // If game continues, update remaining players
                broadcastLobbyUpdate(pin);
                 // If game was running, re-check conditions
                 if (currentGameOnTimeout.gameState === 'PLAYING' || currentGameOnTimeout.gameState === 'RESULTS' || currentGameOnTimeout.gameState === 'PRE_ROUND') {
                     checkRoundEnd(pin);
                     const activePlayers = Object.values(currentGameOnTimeout.players).filter(p => p.isConnected && (currentGameOnTimeout.settings.gameType === 'points' || p.lives > 0));
                      if (activePlayers.length <= 1 && currentGameOnTimeout.settings.gameType === 'lives') {
                          console.log(`Game ${pin} ending after player removal timeout (lives mode).`);
                          endGame(pin); // End and schedule cleanup
                      }
                 }
            }
        }
    }, 60000); // 1 Minute Timeout
}


// --- Game Logic ---
async function startGame(pin) { /* ... ensure it initializes player.activeEffects = {} ... */ }
async function endGame(pin, cleanup = true) { /* ... Use updated RPC call with spotsGained ... */ }

// Dummy implementations for missing functions
function checkRoundEnd(pin) { console.log(`STUB: checkRoundEnd for game ${pin}`); }
function handleTimelineGuess(pin, playerId, payload) { console.log(`STUB: handleTimelineGuess for ${playerId} in ${pin}`); }
function handlePopularityGuess(pin, playerId, payload) { console.log(`STUB: handlePopularityGuess for ${playerId} in ${pin}`); }
function startRoundCountdown(pin) { console.log(`STUB: startRoundCountdown for ${pin}`); }
async function joinGame(ws, user, pin) {
    const gameToJoin = games[pin];
    if (gameToJoin && gameToJoin.gameState === 'LOBBY') {
        // ws.pin, ws.playerId, ws.nickname should already be set
        gameToJoin.players[user.id] = {
            ws, nickname: user.username.substring(0, 15), score: 0, lives: gameToJoin.settings.lives,
            isConnected: true, isReady: false, timeline: [], correctAnswers: 0,
            incorrectAnswersThisGame: 0, exactYearGuesses: 0, perfectRound: false, activeEffects: {} // Init effects
        };
        console.log(`Player ${user.username} (${user.id}) joined game ${pin}`);
        ws.send(JSON.stringify({ type: 'join-success', payload: { pin: pin, playerId: user.id, isHost: false, gameMode: gameToJoin.gameMode } }));
        broadcastLobbyUpdate(pin);
         // Achievement: Party-Löwe
         if (Object.values(gameToJoin.players).filter(p => p.isConnected).length >= 4) {
            Object.values(gameToJoin.players).forEach(p => awardAchievement(p.ws, p.ws?.playerId, 11)); // Use p.ws.playerId
        }
    } else {
        const reason = !gameToJoin ? 'Lobby nicht gefunden.' : 'Spiel läuft bereits.';
        console.warn(`Join failed for ${user.username} to pin ${pin}: ${reason}`);
        showToastToPlayer(ws, reason, true);
        // Clean up ws state if join failed?
        // ws.pin = null;
        // onlineUsers.delete(user.id); // Maybe keep online?
    }
}
async function handleRemoveFriend(ws, currentUserId, payload) { console.log(`STUB: handleRemoveFriend ${currentUserId} removing ${payload?.friendId}`); /* Implement DB call */ }
async function handleAddFriend(ws, senderId, payload) { console.log(`STUB: handleAddFriend ${senderId} adding ${payload?.friendName}`); /* Implement DB call */ }
async function handleAcceptFriendRequest(ws, receiverId, payload) { console.log(`STUB: handleAcceptFriendRequest ${receiverId} accepting ${payload?.senderId}`); /* Implement DB call */ }
async function handleDeclineFriendRequest(ws, currentUserId, payload) { console.log(`STUB: handleDeclineFriendRequest ${currentUserId} declining ${payload?.userId}`); /* Implement DB call */ }



// --- Start Server ---
server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });
