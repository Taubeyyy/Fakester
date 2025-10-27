// server.js - FINAL VERSION (Mit echten Spotify URLs)

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

// --- Authentication Middleware ---
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    let userId = null;
    console.log("Auth Middleware: Header =", authHeader); 
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = authHeader.substring(7); 
        try {
            console.log("Auth Middleware: Validating token..."); 
            const { data: { user }, error } = await supabaseAnon.auth.getUser(jwt);
            if (error) {
                console.warn('Auth Middleware: Invalid JWT:', error.message);
            } else if (user) {
                req.user = user; 
                userId = user.id;
                console.log(`Auth Middleware: Authenticated user ${userId}`);
            } else {
                 console.warn('Auth Middleware: Token valid but no user found?'); 
            }
        } catch (e) {
            console.error('Auth Middleware: Error validating JWT:', e);
        }
    } else {
        console.log("Auth Middleware: No Bearer token found.");
    }
    req.userId = userId;
    next();
};

const apiRouter = express.Router();
apiRouter.use(authenticateUser); 
apiRouter.post('/shop/buy', async (req, res) => { /* ... buy logic ... */ });
apiRouter.post('/friends/gift', async (req, res) => { /* ... gift logic ... */ });
app.use('/api', apiRouter);


let games = {};
const onlineUsers = new Map(); 
const HEARTBEAT_INTERVAL = 30000;

// --- Shop Data ---
const shopItems = [
    { id: 101, type: 'title', name: 'Musik-Guru', cost: 100, unlockType: 'spots', description: 'Zeige allen dein Wissen!' },
    { id: 102, type: 'title', name: 'Playlist-Meister', cost: 150, unlockType: 'spots', description: 'Für echte Kenner.' },
    { id: 201, type: 'icon', name: 'Diamant', iconClass: 'fa-diamond', cost: 250, unlockType: 'spots', description: 'Ein glänzendes Icon.' },
    { id: 202, type: 'icon', name: 'Zauberhut', iconClass: 'fa-hat-wizard', cost: 300, unlockType: 'spots', description: 'Magisch!' },
    { id: 301, type: 'background', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', description: 'Retro-Vibes.', backgroundId: '301' },
    { id: 302, type: 'background', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', description: 'Fühl dich wie ein Star.', backgroundId: '302' },
    { id: 501, name: 'Giftgrün', type: 'color', colorHex: '#00FF00', cost: 750, unlockType: 'spots', description: 'Ein knalliges Grün.' },
    { id: 502, name: 'Leuchtend Pink', type: 'color', colorHex: '#FF00FF', cost: 750, unlockType: 'spots', description: 'Ein echter Hingucker.' },
    { id: 503, name: 'Gold', type: 'color', colorHex: '#FFD700', cost: 1500, unlockType: 'spots', description: 'Zeig deinen Status.' }
];

// --- Helper Functions ---
function getScores(pin) { const game = games[pin]; if (!game) return []; return Object.values(game.players).map(p => ({ id: p.ws?.playerId, nickname: p.nickname, score: p.score, lives: p.lives, isConnected: p.isConnected, lastPointsBreakdown: p.lastPointsBreakdown })).filter(p => p.id).sort((a, b) => b.score - a.score); }
function showToastToPlayer(ws, message, isError = false) { if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: 'toast', payload: { message, isError } })); } catch (e) { console.error(`Failed to send toast to player ${ws.playerId}:`, e); } } }
async function getPlaylistTracks(playlistId, token) { try { 
    // KORREKTUR: Echte Spotify-URL
    const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,artists(name),album(release_date,images),popularity))`, { headers: { 'Authorization': `Bearer ${token}` } }); 
    return response.data.items.map(item => item.track).filter(track => track && track.id && track.album?.release_date).map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0]?.name || 'Unbekannt', year: parseInt(track.album.release_date.substring(0, 4)), popularity: track.popularity || 0, albumArtUrl: track.album.images[0]?.url })); } catch (error) { console.error("Fehler beim Abrufen der Playlist-Tracks:", error.response?.data || error.message); return null; } }
async function spotifyApiCall(method, url, token, data = {}) { try { await axios({ method, url, data, headers: { 'Authorization': `Bearer ${token}` } }); return true; } catch (e) { console.error(`Spotify API Fehler bei ${method.toUpperCase()} ${url}:`, e.response?.data || e.message); return false; } }
async function hasAchievement(userId, achievementId) { try { const { count, error } = await supabase.from('user_achievements').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('achievement_id', achievementId); if (error) throw error; return count > 0; } catch (e) { console.error("Error checking achievement:", e); return false; } }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws && player.ws.readyState === WebSocket.OPEN && player.isConnected) { try { player.ws.send(messageString); } catch (e) { console.error(`Failed to send message to player ${player.ws.playerId}:`, e); } } }); }
function broadcastLobbyUpdate(pin) {
     const game = games[pin]; if (!game) return;
     const payload = { pin, hostId: game.hostId, players: getScores(pin),
         settings: {
             songCount: game.settings.songCount, guessTime: game.settings.guessTime,
             answerType: game.settings.answerType, lives: game.settings.lives, gameType: game.settings.gameType,
             chosenBackgroundId: game.settings.chosenBackgroundId,
             deviceName: game.settings.deviceName, playlistName: game.settings.playlistName,
         }
     };
     broadcastToLobby(pin, { type: 'lobby-update', payload });
}
function generatePin() { let pin; do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (games[pin]); return pin; }

// Award Achievement (Modified to add Spots)
async function awardAchievement(ws, userId, achievementId) {
    if (!userId || userId.startsWith('guest-')) return;
    const alreadyHas = await hasAchievement(userId, achievementId);
    if (alreadyHas) return;

    const { error: insertError } = await supabase.from('user_achievements').insert({ user_id: userId, achievement_id: achievementId });
    if (insertError) { console.error(`Fehler beim Speichern von Server-Achievement ${achievementId} für User ${userId}:`, insertError); return; }

    console.log(`Server-Achievement ${achievementId} verliehen an User ${userId}.`);
    showToastToPlayer(ws, `Neuer Erfolg freigeschaltet! (ID: ${achievementId})`);

    const achievementSpotBonus = 50;
    const { error: spotError } = await supabase.from('profiles').update({ spots: supabase.sql(`spots + ${achievementSpotBonus}`) }).eq('id', userId);
    if (spotError) { console.error(`Fehler beim Vergeben von Bonus-Spots für Achievement ${achievementId} an User ${userId}:`, spotError); }
    else { showToastToPlayer(ws, `+${achievementSpotBonus} Spots für neuen Erfolg!`); }
}


// --- Express Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
// Public config route (NO AUTH MIDDLEWARE HERE)
app.get('/api/config', (req, res) => res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }));

// KORREKTUR: Echte Spotify-URL
app.get('/login', (req, res) => { const scopes = 'user-read-private user-read-email playlist-read-private streaming user-modify-playback-state user-read-playback-state'; res.redirect('https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, scope: scopes, redirect_uri: REDIRECT_URI }).toString()); });

// Corrected Spotify Callback Route with Detailed Logging
app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const error = req.query.error || null;
    console.log(`Spotify Callback received. Code: ${code ? 'Present' : 'MISSING'}, Error: ${error || 'None'}`);

    if (error) { console.error("Spotify Callback Error Parameter:", error); return res.redirect(`/#error=spotify_auth_failed&details=${encodeURIComponent(error)}`); }
    if (!code) { console.error("Spotify Callback: No code received."); return res.redirect('/#error=spotify_auth_failed&details=no_code'); }

    try {
        console.log("Attempting to exchange Spotify code for token...");
        const response = await axios({
            method: 'post',
            // KORREKTUR: Echte Spotify-URL
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }).toString(),
            headers: { 'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')), 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log("Spotify Token exchange successful:", response.data ? "Token received" : "No data in response?");

        const { access_token } = response.data;
        if (!access_token) { console.error("Spotify Callback: No access_token in response data:", response.data); throw new Error("Kein Zugriffstoken von Spotify erhalten."); }

        const cookieOptions = { httpOnly: true, maxAge: 3600000, secure: !req.headers.host.includes('localhost'), path: '/', sameSite: 'Lax' };
        console.log("Setting Spotify cookie...");
        res.cookie('spotify_access_token', access_token, cookieOptions);

        console.log("Redirecting back to / ...");
        res.redirect('/');

    } catch (error) {
        console.error("!!! Spotify Callback Exchange Error:", error.response?.data || error.message);
        const errorDetails = error.response?.data || { message: error.message };
        res.status(500).send(`<h1>Spotify Login Fehler</h1><p>Token-Tausch fehlgeschlagen. Grund:</p><pre>${JSON.stringify(errorDetails, null, 2)}</pre><p><a href="/">Zurück zur App</a></p>`);
    }
});

app.post('/logout', (req, res) => { res.clearCookie('spotify_access_token', { path: '/' }); res.status(200).json({ message: 'Erfolgreich ausgeloggt' }); });
app.get('/api/status', (req, res) => { const token = req.cookies.spotify_access_token; res.json({ loggedIn: !!token, token: token || null }); });
app.get('/api/playlists', async (req, res) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ message: "Nicht autorisiert" }); try { 
    // KORREKTUR: Echte Spotify-URL
    const d = await axios.get('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${token}` } }); 
    res.json(d.data); } catch (e) { console.error("Playlist API Error:", e.response?.status, e.response?.data || e.message); res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Playlists" }); } });
app.get('/api/devices', async (req, res) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ message: "Nicht autorisiert" }); try { 
    // KORREKTUR: Echte Spotify-URL
    const d = await axios.get('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } }); 
    res.json(d.data); } catch (e) { console.error("Device API Error:", e.response?.status, e.response?.data || e.message); res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Geräte" }); } });

// --- SHOP API Routes (now using apiRouter with auth middleware) ---
apiRouter.get('/shop/items', async (req, res) => { // Use apiRouter
    const userId = req.userId; // From middleware
    let ownedItems = { titles: new Set(), icons: new Set(), backgrounds: new Set(), consumables: {} };
    if (userId) { /* ... fetch owned items ... */ }
    const itemsWithOwnership = shopItems.map(item => { /* ... add isOwned flag ... */ });
    res.json({ items: itemsWithOwnership });
});

// ### START ERSETZTER BLOCK (aus vorheriger Antwort) ###
apiRouter.post('/shop/buy', async (req, res) => { // Nutzt apiRouter und auth middleware
    const { itemId } = req.body;
    const userId = req.userId; // KORREKT! Du nutzt req.userId aus deiner Middleware

    if (!userId) {
        return res.status(401).json({ success: false, message: "Nicht eingeloggt (Server)" });
    }

    // KORREKT! Wir nutzen deine vorhandene 'shopItems' Liste
    const itemToBuy = shopItems.find(item => item.id == itemId);

    if (!itemToBuy || itemToBuy.unlockType !== 'spots') {
        return res.status(400).json({ success: false, message: "Item nicht kaufbar." });
    }

    try {
        // WICHTIG: Wir rufen die RPC-Funktion 'purchase_item' auf
        const { data, error } = await supabase.rpc('purchase_item', {
            p_user_id: userId,
            p_item_id: itemToBuy.id.toString(), // ID als Text (z.B. '101', '301')
            p_item_type: itemToBuy.type,
            p_item_cost: itemToBuy.cost,
            // 'itemId' (z.B. 'double_points_1r') für Consumables, sonst 'id'
            p_storage_id: itemToBuy.itemId || itemToBuy.id.toString() 
        });

        if (error) {
            // Fehler von der DB (z.B. "Nicht genug Spots.")
            console.error(`Supabase RPC 'purchase_item' Error:`, error.message);
            return res.status(400).json({ success: false, message: error.message });
        }

        // Erfolg! 'data' ist der Rückgabewert (neue Spots)
        res.json({
            success: true, 
            message: `"${itemToBuy.name}" erfolgreich gekauft!`, // Eigene Erfolgsnachricht
            newSpots: data, // Die neuen Spots von der DB
            itemType: itemToBuy.type // Wichtig für den Client
        });

    } catch (err) {
        console.error('Server-Fehler in /api/shop/buy:', err);
        res.status(500).json({ success: false, message: 'Interner Serverfehler.' });
    }
});
// ### ENDE ERSETZTER BLOCK ###

// --- GIFTING API Route (now using apiRouter with auth middleware) ---
apiRouter.post('/friends/gift', async (req, res) => { // Use apiRouter
    const { recipientId, amount } = req.body;
    const senderId = req.userId;
    if (!senderId) { return res.status(401).json({ success: false, message: "Nicht eingeloggt" }); }
    if (!recipientId || !amount || !Number.isInteger(amount) || amount <= 0) { return res.status(400).json({ success: false, message: "Ungültige Eingabe" }); }

    try {
        const { data, error } = await supabase.rpc('transfer_spots', { /* ... RPC params ... */ });
        if (error || (data && !data.success)) { /* ... Handle RPC errors ... */ }
        else {
            // Send notification
            const recipientWs = onlineUsers.get(recipientId);
            if (recipientWs && recipientWs.readyState === WebSocket.OPEN) { /* ... send notification ... */ }
            res.json({ success: true, newSenderSpots: data.newSenderSpots });
        }
    } catch (error) { /* ... Handle server errors ... */ }
});


// --- WebSocket Server ---
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => { /* ... setup ws listeners ... */ });
const interval = setInterval(function ping() { /* ... heartbeat ... */ });
wss.on('close', function close() { clearInterval(interval); });

// --- WebSocket Message Handler ---
async function handleWebSocketMessage(ws, data) {
    try {
        const { type, payload } = data;
        let { pin, playerId, nickname } = ws; // Get stored info from ws
        let game = games[pin];

        // Assign info on relevant messages
        if (type === 'register-online') { playerId = payload.userId; nickname = payload.username; ws.playerId = playerId; ws.nickname = nickname; onlineUsers.set(playerId, ws); console.log(`User ${playerId} (${nickname || 'N/A'}) registered.`); return; }
        if (type === 'create-game') { playerId = payload.user?.id; nickname = payload.user?.username; ws.playerId = playerId; ws.nickname = nickname; /* continue to switch */ }
        if (type === 'join-game') { playerId = payload.user?.id; nickname = payload.user?.username; ws.playerId = playerId; ws.nickname = nickname; ws.pin = payload.pin; /* continue toswitch */ }
        if (type === 'reconnect') { /* ... handle reconnect ... */ return; }

        // Reactions
        if (type === 'send-reaction') { if (!game || !game.players[playerId]) return; const reactionCost = 1; const reactionType = payload.reaction; const senderNickname = game.players[playerId].nickname; if (reactionCost > 0 && !playerId.startsWith('guest-')) { supabase.rpc('deduct_spots', { p_user_id: playerId, p_amount: reactionCost }).then(({ data: success, error }) => { if (error || !success) { console.error(`Failed to deduct spots for reaction from ${playerId}:`, error || 'RPC failed'); showToastToPlayer(ws, "Reaktion fehlgeschlagen (Spots?).", true); } else { broadcastToLobby(pin, { type: 'player-reacted', payload: { playerId, nickname: senderNickname, reaction: reactionType } }); showToastToPlayer(ws, `-${reactionCost} Spot für Reaktion.`); } }); } else { broadcastToLobby(pin, { type: 'player-reacted', payload: { playerId, nickname: senderNickname, reaction: reactionType } }); } return; }
        // Consumables
        if (type === 'use-consumable') { if (!game || !game.players[playerId] || game.gameState !== 'PLAYING') return; const itemId = payload.itemId; supabase.rpc('upsert_inventory_item', { p_user_id: playerId, p_item_id: itemId, p_quantity_change: -1 }).then(({ error }) => { if (error) { console.error(`Failed to use consumable ${itemId} for ${playerId}:`, error); showToastToPlayer(ws, "Item konnte nicht verwendet werden (Menge?).", true); } else { game.players[playerId].activeEffects = game.players[playerId].activeEffects || {}; game.players[playerId].activeEffects[itemId] = true; showToastToPlayer(ws, `"${itemId}" aktiviert!`); console.log(`Player ${playerId} used ${itemId}`); } }); return; }
        // Friend requests
        if (['add-friend', 'accept-friend-request', 'decline-friend-request', 'remove-friend-request', 'remove-friend'].includes(type)) { /* Call respective handlers */ return; }


        // --- Game Context Actions ---
        if (!game && !['create-game', 'join-game'].includes(type)) { console.warn(`Action ${type} requires game (Pin: ${pin}).`); return; }
        if (game && !game.players[playerId] && !['create-game', 'join-game'].includes(type)) { console.warn(`Player ${playerId} not in game ${pin} for action ${type}.`); return; }

        switch (type) {
            case 'create-game': /* ... logic ... */ break;
            case 'join-game': /* ... logic ... */ break;
            case 'update-settings': /* ... async logic with background check ... */ break;
            case 'update-nickname': /* ... logic ... */ break;
            case 'start-game': /* ... logic ... */ break;
            case 'live-guess-update': /* ... logic ... */ break;
            case 'submit-guess': /* ... logic ... */ break;
            case 'player-ready': /* ... logic ... */ break;
            case 'invite-friend': /* ... logic ... */ break;
            case 'invite-response': /* ... logic ... */ break;
            case 'leave-game': handlePlayerDisconnect(ws); break;
            default: console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    } catch(e) { console.error("Error processing WebSocket message:", e); showToastToPlayer(ws, "Ein interner Serverfehler.", true); }
}


// --- Player Disconnect Logic ---
function handlePlayerDisconnect(ws) { /* ... refined logic ... */ }

// --- Game Logic ---
async function startGame(pin) { /* ... ensure it initializes player.activeEffects = {} ... */ }
async function endGame(pin, cleanup = true) { /* ... uses updated RPC call with spotsGained ... */ }

// --- Friend Handlers (Stubs - Implement DB logic) ---
async function handleAddFriend(ws, senderId, payload) { console.log(`STUB: handleAddFriend ${senderId} adding ${payload?.friendName}`); showToastToPlayer(ws, "Freund hinzufügen (noch nicht implementiert).", true); }
async function handleAcceptFriendRequest(ws, receiverId, payload) { console.log(`STUB: handleAcceptFriendRequest ${receiverId} accepting ${payload?.senderId}`); showToastToPlayer(ws, "Anfrage annehmen (noch nicht implementiert).", true); }
async function handleDeclineFriendRequest(ws, currentUserId, payload) { console.log(`STUB: handleDeclineFriendRequest ${currentUserId} declining ${payload?.userId}`); showToastToPlayer(ws, "Anfrage ablehnen (noch nicht implementiert).", true); }
async function handleRemoveFriend(ws, currentUserId, payload) { console.log(`STUB: handleRemoveFriend ${currentUserId} removing ${payload?.friendId}`); showToastToPlayer(ws, "Freund entfernen (noch nicht implementiert).", true); }

// Stubs for game logic helpers if needed
function checkRoundEnd(pin) {}
function handleTimelineGuess(pin, playerId, payload) {}
function handlePopularityGuess(pin, playerId, payload) {}
function startRoundCountdown(pin) {}
async function joinGame(ws, user, pin) { /* ... refined logic ... */ }


// --- Start Server ---
server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });

// Add missing basic helper functions (if they were removed)
function levenshteinDistance(s1, s2) { if (!s1 || !s2) return 99; s1 = s1.toLowerCase(); s2 = s2.toLowerCase(); const costs = []; for (let i = 0; i <= s1.length; i++) { let lastValue = i; for (let j = 0; j <= s2.length; j++) { if (i === 0) costs[j] = j; else if (j > 0) { let newValue = costs[j - 1]; if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1; costs[j - 1] = lastValue; lastValue = newValue; } } if (i > 0) costs[s2.length] = lastValue; } return costs[s2.length]; }
function normalizeString(str) { if (!str) return ''; return str.toLowerCase().replace(/\(.*\)|\[.*\]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').trim(); }
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
