// server.js - Updated with Spots, Shop, Gifting, Reactions

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const axios = require('axios');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use Service Key for server-side admin actions
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false, // Server doesn't need auto refresh
        persistSession: false
    }
});

// Separate client for user auth checks if needed (using Anon key)
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


process.on('uncaughtException', (err, origin) => {
    console.error(`SERVER Uncaught Exception: ${err?.stack || err}`);
    console.error(`Origin: ${origin}`);
    // Potentially exit gracefully in production: process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('SERVER Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const server = http.createServer(app);
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.use(express.static(__dirname));
app.use(cookieParser());
app.use(express.json());

// --- Authentication Middleware (Improved Placeholder) ---
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    let userId = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = authHeader.substring(7); // Remove 'Bearer ' prefix
        try {
            // Validate the token using Supabase Auth
            const { data: { user }, error } = await supabaseAnon.auth.getUser(jwt);
            if (error) {
                console.warn('Auth Middleware: Invalid JWT:', error.message);
            } else if (user) {
                req.user = user; // Attach user object to request
                userId = user.id;
                console.log(`Auth Middleware: Authenticated user ${userId}`);
            }
        } catch (e) {
            console.error('Auth Middleware: Error validating JWT:', e);
        }
    } else {
        console.log("Auth Middleware: No Bearer token found.");
    }

    // Attach userId (or null) directly for easier access later
    req.userId = userId;
    next();
};
app.use('/api', authenticateUser); // Apply middleware to all /api routes


let games = {};
const onlineUsers = new Map(); // Maps userId to WebSocket object
const HEARTBEAT_INTERVAL = 30000;

// --- Shop Data (Could be loaded from DB in the future) ---
const shopItems = [
    { id: 101, type: 'title', name: 'Musik-Guru', cost: 100, unlockType: 'spots', unlockValue: 100, description: 'Zeige allen dein Wissen!' },
    { id: 102, type: 'title', name: 'Playlist-Meister', cost: 150, unlockType: 'spots', unlockValue: 150, description: 'Für echte Kenner.' },
    { id: 201, type: 'icon', iconClass: 'fa-diamond', cost: 250, unlockType: 'spots', unlockValue: 250, description: 'Ein glänzendes Icon.' },
    { id: 202, type: 'icon', iconClass: 'fa-hat-wizard', cost: 300, unlockType: 'spots', unlockValue: 300, description: 'Magisch!' },
    { id: 301, type: 'background', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', unlockValue: 500, description: 'Retro-Vibes für deine Lobby.', backgroundId: '301' }, // Added backgroundId
    { id: 302, type: 'background', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', unlockValue: 600, description: 'Fühl dich wie ein Star.', backgroundId: '302' },
    { id: 401, type: 'consumable', name: 'Doppelte Punkte (1 Runde)', itemId: 'double_points_1r', cost: 50, unlockType: 'spots', unlockValue: 50, description: 'Verdoppelt deine Punkte in der nächsten Runde.' },
];

// --- Helper Functions ---
function getScores(pin) { /* ... remains same ... */ }
function showToastToPlayer(ws, message, isError = false) { /* ... remains same ... */ }
async function getPlaylistTracks(playlistId, token) { /* ... remains same ... */ }
async function spotifyApiCall(method, url, token, data = {}) { /* ... remains same ... */ }
async function hasAchievement(userId, achievementId) { /* ... remains same ... */ }
function broadcastToLobby(pin, message) { /* ... remains same ... */ }
function broadcastLobbyUpdate(pin) {
     // ... (Ensure it sends the correct settings structure as defined before) ...
     const game = games[pin];
    if (!game) return;
    const payload = { pin, hostId: game.hostId, players: getScores(pin),
        settings: {
             songCount: game.settings.songCount, guessTime: game.settings.guessTime,
             answerType: game.settings.answerType, lives: game.settings.lives, gameType: game.settings.gameType,
             chosenBackgroundId: game.settings.chosenBackgroundId, // Send background ID
             deviceName: game.settings.deviceName, playlistName: game.settings.playlistName,
             // DO NOT SEND deviceId or playlistId to clients other than maybe the host? Security risk.
         }
     };
    broadcastToLobby(pin, { type: 'lobby-update', payload });
}

// Award Achievement (Modified to add Spots)
async function awardAchievement(ws, userId, achievementId) {
    if (!userId || userId.startsWith('guest-')) return;
    const alreadyHas = await hasAchievement(userId, achievementId);
    if (alreadyHas) return;

    const { error: insertError } = await supabase
        .from('user_achievements')
        .insert({ user_id: userId, achievement_id: achievementId });

    if (insertError) {
        console.error(`Fehler beim Speichern von Server-Achievement ${achievementId} für User ${userId}:`, insertError);
    } else {
        console.log(`Server-Achievement ${achievementId} verliehen an User ${userId}.`);
        showToastToPlayer(ws, `Neuer Erfolg freigeschaltet! (ID: ${achievementId})`);

        // Bonus Spots für Erfolg
        const achievementSpotBonus = 50; // Configurable bonus
        const { error: spotError } = await supabase
            .from('profiles')
            .update({ spots: supabase.sql(`spots + ${achievementSpotBonus}`) }) // Atomically add spots
            .eq('id', userId);

        if (spotError) {
            console.error(`Fehler beim Vergeben von Bonus-Spots für Achievement ${achievementId} an User ${userId}:`, spotError);
        } else {
            showToastToPlayer(ws, `+${achievementSpotBonus} Spots für neuen Erfolg!`);
            // Optional: Send updated profile/spots via WebSocket if needed immediately
        }
    }
}


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
app.get('/api/shop/items', async (req, res) => {
    const userId = req.userId; // From middleware
    let ownedItems = { titles: new Set(), icons: new Set(), backgrounds: new Set(), consumables: {} };

    if (userId) {
        try {
            // Fetch owned items concurrently
            const [titles, icons, backgrounds, inventory] = await Promise.all([
                supabase.from('user_owned_titles').select('title_id').eq('user_id', userId),
                supabase.from('user_owned_icons').select('icon_id').eq('user_id', userId),
                supabase.from('user_owned_backgrounds').select('background_id').eq('user_id', userId),
                supabase.from('user_inventory').select('item_id, quantity').eq('user_id', userId)
            ]);

            titles.data?.forEach(t => ownedItems.titles.add(t.title_id));
            icons.data?.forEach(i => ownedItems.icons.add(i.icon_id));
            backgrounds.data?.forEach(b => ownedItems.backgrounds.add(b.background_id));
            inventory.data?.forEach(inv => ownedItems.consumables[inv.item_id] = inv.quantity);

        } catch (e) {
            console.error(`Error fetching owned items for user ${userId}:`, e);
            // Continue without ownership info if fetch fails
        }
    }

    // Add ownership info to shop items
    const itemsWithOwnership = shopItems.map(item => {
        let isOwned = false;
        if (userId) { // Only check ownership if user is logged in
             if (item.type === 'title') isOwned = ownedItems.titles.has(item.id);
             else if (item.type === 'icon') isOwned = ownedItems.icons.has(item.id);
             else if (item.type === 'background') isOwned = ownedItems.backgrounds.has(item.backgroundId); // Use backgroundId
             else if (item.type === 'consumable') isOwned = (ownedItems.consumables[item.itemId] || 0) > 0;
        }
        return { ...item, isOwned };
    });

    res.json({ items: itemsWithOwnership });
});

app.post('/api/shop/buy', async (req, res) => {
    const { itemId } = req.body; // Expecting the numeric ID (e.g., 101, 201, 301, 401)
    const userId = req.userId; // From middleware

    if (!userId) {
        return res.status(401).json({ success: false, message: "Nicht eingeloggt" });
    }

    const itemToBuy = shopItems.find(item => item.id === itemId);

    if (!itemToBuy) {
        return res.status(404).json({ success: false, message: "Item nicht gefunden" });
    }
    if (itemToBuy.unlockType !== 'spots') {
        return res.status(400).json({ success: false, message: "Dieses Item kann nicht gekauft werden." });
    }

    try {
        // Call the RPC function to handle the purchase atomically
        const { data, error } = await supabase.rpc('purchase_item', {
            p_user_id: userId,
            p_item_id_numeric: (itemToBuy.type !== 'consumable' && itemToBuy.type !== 'background') ? itemToBuy.id : null, // Pass numeric ID for titles/icons
            p_item_id_text: (itemToBuy.type === 'consumable') ? itemToBuy.itemId : (itemToBuy.type === 'background' ? itemToBuy.backgroundId : null), // Pass text ID for consumables/backgrounds
            p_item_type: itemToBuy.type,
            p_cost: itemToBuy.cost
        });

        if (error) {
            console.error(`RPC purchase_item error for user ${userId}, item ${itemId}:`, error);
            // Check if the error is from our explicit RAISE EXCEPTION messages
             if (error.message.includes('Insufficient spots') || error.message.includes('Item already owned')) {
                 return res.status(400).json({ success: false, message: error.message });
             }
             // Otherwise, it's an unexpected internal error
            throw new Error(error.message || "Datenbankfehler beim Kauf");
        }

        // Check the success flag from the RPC function's JSONB response
        if (data && data.success) {
            console.log(`User ${userId} successfully bought item ${itemId}. New balance: ${data.newSpots}`);
            res.json({ success: true, newSpots: data.newSpots, purchasedItem: itemToBuy });
        } else {
            // If RPC didn't throw but returned success: false
            console.error(`RPC purchase_item failed logically for user ${userId}, item ${itemId}:`, data?.message);
            res.status(400).json({ success: false, message: data?.message || "Kauf fehlgeschlagen (Logikfehler)" });
        }

    } catch (error) {
        console.error("Schwerer Fehler bei /api/shop/buy:", error);
        res.status(500).json({ success: false, message: error.message || "Kauf fehlgeschlagen (Serverfehler)" });
    }
});


// --- GIFTING API Route ---
app.post('/api/friends/gift', async (req, res) => {
    const { recipientId, amount } = req.body;
    const senderId = req.userId; // From middleware

    if (!senderId) {
        return res.status(401).json({ success: false, message: "Nicht eingeloggt" });
    }
    if (!recipientId || !amount || !Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ success: false, message: "Ungültige Eingabe (Empfänger oder Betrag)" });
    }

    try {
        const { data, error } = await supabase.rpc('transfer_spots', {
            p_sender_id: senderId,
            p_recipient_id: recipientId,
            p_amount: amount
        });

        if (error) {
            console.error(`RPC transfer_spots error from ${senderId} to ${recipientId}:`, error);
             // Check for specific errors raised in the function
             if (error.message.includes('Insufficient spots') || error.message.includes('yourself') || error.message.includes('positive') || error.message.includes('Recipient not found')) {
                 return res.status(400).json({ success: false, message: error.message });
             }
            throw new Error(error.message || "Datenbankfehler beim Schenken");
        }

        if (data && data.success) {
            console.log(`User ${senderId} gifted ${amount} Spots to ${recipientId}. New sender balance: ${data.newSenderSpots}`);
            // Send WebSocket notification to recipient if they are online
            const recipientWs = onlineUsers.get(recipientId);
            if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                const senderNickname = onlineUsers.get(senderId)?.nickname || 'Ein Spieler'; // Get sender nickname if available
                showToastToPlayer(recipientWs, `Du hast ${amount} Spots von ${senderNickname} erhalten!`);
                // Optionally send updated profile data
                 recipientWs.send(JSON.stringify({ type: 'profile-update', payload: { spots: /* TODO: Get recipient's new balance */ } }));
            }
            res.json({ success: true, newSenderSpots: data.newSenderSpots });
        } else {
            console.error(`RPC transfer_spots failed logically from ${senderId} to ${recipientId}:`, data?.message);
            res.status(400).json({ success: false, message: data?.message || "Schenken fehlgeschlagen (Logikfehler)" });
        }

    } catch (error) {
        console.error("Schwerer Fehler bei /api/friends/gift:", error);
        res.status(500).json({ success: false, message: error.message || "Schenken fehlgeschlagen (Serverfehler)" });
    }
});

// --- TODO: Daily Tasks API Routes ---
// app.get('/api/tasks/daily', async (req, res) => { /* Logic to get tasks */ });
// app.post('/api/tasks/claim', async (req, res) => { /* Logic to claim completed task reward */ });


// --- WebSocket Server ---
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    console.log('Client verbunden');
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            // Attach nickname to ws connection for easier lookup later (e.g., gifting notification)
             if (data.type === 'join-game' || data.type === 'create-game') {
                 ws.nickname = data.payload?.user?.username;
             }
             // Attach user ID if registering online
             if (data.type === 'register-online') {
                 ws.playerId = data.payload?.userId;
                 ws.nickname = data.payload?.username; // Assuming client sends username too
             }
            handleWebSocketMessage(ws, data);
        } catch (e) {
            console.error("Fehler bei WebSocket-Nachricht:", e, message.toString());
        }
    });
    ws.on('close', () => handlePlayerDisconnect(ws));
    ws.on('error', (error) => console.error('WebSocket Error:', error));
});

// WebSocket Heartbeat
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
             console.log(`Terminating inactive WebSocket connection for player ${ws.playerId || 'unknown'}`);
             return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);

wss.on('close', function close() {
    clearInterval(interval);
});


// --- WebSocket Message Handler ---
function handleWebSocketMessage(ws, data) {
    try {
        const { type, payload } = data;
        let { pin, playerId } = ws; // Get from ws object
        let game = games[pin];

        // Early checks needing no game context
        if (type === 'register-online') {
            playerId = payload.userId; // Ensure playerId is set from payload
             ws.playerId = playerId; // Store it on ws
             ws.nickname = payload.username; // Store nickname too if sent
            onlineUsers.set(playerId, ws);
            console.log(`User ${playerId} (${ws.nickname}) registered online.`);
            // TODO: Send online status update to friends?
            return;
        }
        // ... (reconnect remains same) ...

        // --- Handle Reaction ---
        if (type === 'send-reaction') {
            if (!game || !game.players[playerId]) return;
            const reactionType = payload.reaction; // Ensure client sends 'reaction'
            const senderNickname = game.players[playerId].nickname;
            console.log(`Player ${senderNickname} (${playerId}) reacted with ${reactionType} in game ${pin}`);

            // Optional: Deduct Spots (use RPC for safety)
            const reactionCost = 1; // Example cost
            if (reactionCost > 0 && !playerId.startsWith('guest-')) {
                 supabase.rpc('deduct_spots', { p_user_id: playerId, p_amount: reactionCost })
                 .then(({ data: success, error }) => {
                     if (error || !success) {
                         console.error(`Failed to deduct spots for reaction from ${playerId}:`, error || 'RPC returned false');
                         showToastToPlayer(ws, "Reaktion fehlgeschlagen (Spots?).", true);
                     } else {
                         // Broadcast only if spots were deducted successfully (or if cost is 0)
                         broadcastToLobby(pin, { type: 'player-reacted', payload: { playerId, nickname: senderNickname, reaction: reactionType } });
                         showToastToPlayer(ws, `-${reactionCost} Spot für Reaktion.`); // Feedback
                     }
                 });
            } else {
                 // Broadcast immediately if free or guest
                 broadcastToLobby(pin, { type: 'player-reacted', payload: { playerId, nickname: senderNickname, reaction: reactionType } });
            }
            return;
        }

        // --- Handle Consumable Use (Example: Double Points) ---
        if (type === 'use-consumable') {
             if (!game || !game.players[playerId] || game.gameState !== 'PLAYING') return; // Only during game
             const itemId = payload.itemId; // e.g., 'double_points_1r'

             // 1. Verify player has the item and deduct quantity (using RPC)
              supabase.rpc('upsert_inventory_item', { p_user_id: playerId, p_item_id: itemId, p_quantity_change: -1 })
              .then(async ({ error }) => {
                  if (error) {
                       console.error(`Failed to use consumable ${itemId} for ${playerId}:`, error);
                       // Check if error is due to insufficient quantity (RPC might need adjustment to return this)
                       showToastToPlayer(ws, "Item konnte nicht verwendet werden (Menge?).", true);
                       return;
                  }

                  // 2. Apply effect (e.g., set a flag on the player object for the next round)
                  console.log(`Player ${playerId} used consumable ${itemId} in game ${pin}`);
                  game.players[playerId].activeEffects = game.players[playerId].activeEffects || {};
                  game.players[playerId].activeEffects[itemId] = true; // Flag effect as active
                  showToastToPlayer(ws, `"${itemId}" aktiviert!`); // TODO: Get nicer name

                   // TODO: In round scoring logic, check for game.players[pId].activeEffects[itemId]
                   // Apply effect (e.g., double points) and remove the flag after use:
                   // delete game.players[pId].activeEffects[itemId];
              });
             return;
        }


        // Game context actions
        if (!game && !['create-game', 'join-game'].includes(type)) {
            console.warn(`Action ${type} requires game context, but none found for pin ${pin}.`); return;
        }
        if (game && !game.players[playerId] && !['create-game', 'join-game'].includes(type)) {
            console.warn(`Player ${playerId} not found in game ${pin} for action ${type}.`); return;
        }


        switch (type) {
            case 'create-game':
                // ... (remains same, ensure initial settings are good) ...
                 const newPin = generatePin();
                 ws.pin = newPin; ws.playerId = payload.user.id; ws.nickname = payload.user.username; // Store nickname
                 const initialSettings = { deviceId: null, playlistId: null, songCount: 10, guessTime: 30, gameType: payload.gameType || 'points', lives: payload.lives || 3, answerType: 'freestyle', chosenBackgroundId: null }; // Add background
                 games[newPin] = { /* ... */ settings: initialSettings, /* ... */ };
                 onlineUsers.set(ws.playerId, ws); // Add host to online users
                 ws.send(JSON.stringify({ type: 'game-created', payload: { pin: newPin, playerId: payload.user.id, isHost: true, gameMode: games[newPin].gameMode } }));
                 broadcastLobbyUpdate(newPin);
                 awardAchievement(ws, playerId, 10);
                break;
            case 'join-game':
                // ... (remains same) ...
                 ws.pin = payload.pin; ws.playerId = payload.user.id; ws.nickname = payload.user.username; // Store nickname
                 onlineUsers.set(ws.playerId, ws); // Add joining user
                 joinGame(ws, payload.user, payload.pin); // joinGame function needs ws passed
                break;
            case 'update-settings':
                if (game && game.hostId === playerId) {
                    const hostWs = game.players[playerId]?.ws;
                    let processedPayload = { ...payload }; // Copy payload to modify

                    // Validate background choice
                    if (processedPayload.chosenBackgroundId) {
                        const bgId = processedPayload.chosenBackgroundId;
                        const { data: ownedBg, error } = await supabase
                            .from('user_owned_backgrounds')
                            .select('background_id', { count: 'exact', head: true }) // More efficient check
                            .eq('user_id', playerId)
                            .eq('background_id', bgId);

                        if (error || ownedBg.count === 0) {
                             console.warn(`Host ${playerId} tried to set unowned background ${bgId}`);
                             showToastToPlayer(hostWs, "Du besitzt diesen Hintergrund nicht.", true);
                             delete processedPayload.chosenBackgroundId; // Remove invalid choice
                        }
                    }

                    // Apply valid settings
                    game.settings = { ...game.settings, ...processedPayload };
                    if(processedPayload.lives) { Object.values(game.players).forEach(p => p.lives = game.settings.lives); }
                    broadcastLobbyUpdate(pin);
                }
                break;
            // ... (rest remains same: start-game, guesses, player-ready, invites etc.) ...
        }
    } catch(e) {
        console.error("Error processing WebSocket message:", e);
        showToastToPlayer(ws, "Ein interner Fehler ist aufgetreten.", true);
    }
}


// --- Freundschafts-Handler (unverändert) ---
async function handleAddFriend(ws, senderId, payload) { /* ... */ }
async function handleAcceptFriendRequest(ws, receiverId, payload) { /* ... */ }
async function handleDeclineFriendRequest(ws, currentUserId, payload) { /* ... */ }
async function handleRemoveFriend(ws, currentUserId, payload) { /* ... */ }

// --- Player Disconnect (unverändert) ---
function handlePlayerDisconnect(ws) { /* ... */ }

// --- Game Logic (Nur endGame angepasst) ---
async function startGame(pin) { /* ... remains same ... */ }

async function endGame(pin, cleanup = true) {
    const game = games[pin];
    if (!game || game.gameState === 'FINISHED') return;
    console.log(`Ending game ${pin}. Cleanup: ${cleanup}`);
    game.gameState = 'FINISHED';

    if (game.hostToken && game.settings.deviceId) {
        spotifyApiCall('put', `https://api.spotify.com/v1/me/player/pause?device_id=$${game.settings.deviceId}`, game.hostToken);
    }

    const finalScores = getScores(pin);
    const winningScore = Math.max(0, ...finalScores.map(s => s.score));
    let winnerCount = winningScore > 0 ? finalScores.filter(s => s.score === winningScore).length : 0;
    const isDraw = winnerCount > 1;

    console.log(`Game ${pin} finished. Winning Score: ${winningScore}, Draw: ${isDraw}`);

    // Add gainedSpots to score objects BEFORE broadcasting
    const scoresWithSpots = finalScores.map(playerScore => {
        const player = game.players[playerScore.id];
        let spotsGained = 0;
        if (player && !playerScore.id.startsWith('guest-')) {
            const gainedXp = playerScore.score; // XP equals score in this logic
            const isWin = !isDraw && playerScore.score === winningScore;
            spotsGained += Math.floor(gainedXp / 10);
            if(isWin) spotsGained += 25;
            spotsGained += 5; // Participation
            spotsGained = Math.max(0, spotsGained);
        }
        return { ...playerScore, gainedSpots: spotsGained };
    });

    // Broadcast final scores including spots gained
    broadcastToLobby(pin, { type: 'game-over', payload: { scores: scoresWithSpots } });

    // Update DB for each player
    for (const player of Object.values(game.players)) {
        if (!player.ws?.playerId || player.ws.playerId.startsWith('guest-')) continue;

        const playerId = player.ws.playerId;
        const playerWs = player.ws;
        const scoreData = scoresWithSpots.find(s => s.id === playerId);
        if (!scoreData) continue; // Should not happen

        const gainedXp = scoreData.score;
        const gainedSpots = scoreData.gainedSpots;
        const isWin = !isDraw && scoreData.score === winningScore;
        const isHost = playerId === game.hostId;

        console.log(`Updating DB for player ${playerId}: XP=${gainedXp}, Win=${isWin}, Score=${scoreData.score}, Host=${isHost}, Correct=${player.correctAnswers}, Spots=${gainedSpots}`);

        supabase.rpc('update_player_stats', {
            p_user_id: playerId,
            p_gained_xp: gainedXp,
            p_gained_correct_answers: player.correctAnswers || 0,
            p_is_win: isWin,
            p_new_score: scoreData.score,
            p_is_host: isHost,
            p_gained_spots: gainedSpots // Pass calculated spots
        }).then(async ({ error: rpcError }) => {
            if (rpcError) {
                console.error(`DB Update-Fehler für ${player.nickname} (ID: ${playerId}):`, rpcError);
            } else {
                 console.log(`Stats updated successfully for player ${playerId}. Checking server achievements...`);
                 // Fetch updated profile for accurate achievement checks
                 const { data: updatedProfile, error: profileError } = await supabase
                    .from('profiles')
                    .select('games_played, wins, correct_answers, consecutive_wins, games_hosted') // Add spots if needed for achievements
                    .eq('id', playerId)
                    .single();

                 if (profileError) {
                    console.error(`Failed to fetch updated profile for achievement check (Player ${playerId}):`, profileError);
                 } else if (updatedProfile) {
                    // Check server-side achievements based on updated profile data
                    if (updatedProfile.games_played >= 1) awardAchievement(playerWs, playerId, 1);
                    if (updatedProfile.games_played >= 3) awardAchievement(playerWs, playerId, 17);
                    if (updatedProfile.correct_answers >= 100) awardAchievement(playerWs, playerId, 2);
                    // ... add checks for ALL other achievements using updatedProfile fields ...
                    if (updatedProfile.wins >= 10) awardAchievement(playerWs, playerId, 3);
                    // ... etc ...
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


// --- Start Server ---
server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });

// --- Add missing helper functions if needed ---
function joinGame(ws, user, pin) { /* ... Implement or copy ... */ }
// ... other potentially missing helpers ...
