// server.js - FINAL VERSION (Mit echten Spotify URLs - KORRIGIERT)

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
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = authHeader.substring(7);
        try {
            const { data: { user }, error } = await supabaseAnon.auth.getUser(jwt);
            if (error) {
                console.warn('Auth Middleware: Invalid JWT:', error.message);
            } else if (user) {
                req.user = user;
                userId = user.id;
            } else {
                 console.warn('Auth Middleware: Token valid but no user found?');
            }
        } catch (e) {
            console.error('Auth Middleware: Error validating JWT:', e);
        }
    }
    req.userId = userId;
    next();
};

const apiRouter = express.Router();
apiRouter.use(authenticateUser);
apiRouter.post('/friends/gift', async (req, res) => { /* ... gift logic ... */ });
app.use('/api', apiRouter);


let games = {};
const onlineUsers = new Map();
const HEARTBEAT_INTERVAL = 30000;

// --- Shop Data (AKTUALISIERT) ---
const shopItems = [
    { id: 101, type: 'title', name: 'Musik-Guru', cost: 100, unlockType: 'spots', description: 'Zeige allen dein Wissen!' },
    { id: 102, type: 'title', name: 'Playlist-Meister', cost: 150, unlockType: 'spots', description: 'Für echte Kenner.' },
    { id: 103, type: 'title', name: 'Beat-Dropper', cost: 200, unlockType: 'spots', description: 'Für Rhythmus-Fanatiker.' }, // NEU
    { id: 104, type: 'title', name: '80er-Kind', cost: 150, unlockType: 'spots', description: 'Synth-Pop-Liebhaber.' }, // NEU
    { id: 201, type: 'icon', name: 'Diamant', iconClass: 'fa-diamond', cost: 250, unlockType: 'spots', description: 'Ein glänzendes Icon.' },
    { id: 202, type: 'icon', name: 'Zauberhut', iconClass: 'fa-hat-wizard', cost: 300, unlockType: 'spots', description: 'Magisch!' },
    { id: 203, type: 'icon', name: 'Raumschiff', iconClass: 'fa-rocket', cost: 400, unlockType: 'spots', description: 'Zum Mond!' }, // NEU
    { id: 204, type: 'icon', name: 'Bombe', iconClass: 'fa-bomb', cost: 350, unlockType: 'spots', description: 'Explosiv.' }, // NEU
    { id: 301, type: 'background', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', description: 'Retro-Vibes.', backgroundId: '301' },
    { id: 302, type: 'background', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', description: 'Fühl dich wie ein Star.', backgroundId: '302' },
    { id: 303, type: 'background', name: 'Plattenladen', imageUrl: '/assets/img/bg_vinyl.jpg', cost: 700, unlockType: 'spots', description: 'Klassisches Stöbern.', backgroundId: '303' }, // NEU
    { id: 501, name: 'Giftgrün', type: 'color', colorHex: '#00FF00', cost: 750, unlockType: 'spots', description: 'Ein knalliges Grün.' },
    { id: 502, name: 'Leuchtend Pink', type: 'color', colorHex: '#FF00FF', cost: 750, unlockType: 'spots', description: 'Ein echter Hingucker.' },
    { id: 503, name: 'Gold', type: 'color', colorHex: '#FFD700', cost: 1500, unlockType: 'spots', description: 'Zeig deinen Status.' },
    { id: 504, name: 'Cyber-Blau', type: 'color', colorHex: '#00FFFF', cost: 1000, unlockType: 'spots', description: 'Neon-Look.' } // NEU
];


// --- Helper Functions ---
function getScores(pin) { 
    const game = games[pin]; 
    if (!game) return []; 
    // HINWEIS: Füge 'iconId' hinzu, damit der Client das Icon anzeigen kann
    return Object.values(game.players)
        .map(p => ({ 
            id: p.id, // ID ist jetzt p.id, nicht p.ws?.playerId
            nickname: p.nickname, 
            score: p.score, 
            lives: p.lives, 
            isConnected: p.isConnected, 
            lastPointsBreakdown: p.lastPointsBreakdown,
            iconId: p.iconId || 1, // Sende die Icon-ID
            colorId: p.colorId || null // Sende die Color-ID
        }))
        .filter(p => p.id)
        .sort((a, b) => b.score - a.score); 
}
function showToastToPlayer(ws, message, isError = false) { if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: 'toast', payload: { message, isError } })); } catch (e) { console.error(`Failed to send toast to player ${ws.playerId}:`, e); } } }
async function getPlaylistTracks(playlistId, token) { try {
    const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,artists(name),album(release_date,images),popularity))`, { headers: { 'Authorization': `Bearer ${token}` } });
    return response.data.items.map(item => item.track).filter(track => track && track.id && track.album?.release_date).map(track => ({ spotifyId: track.id, title: track.name, artist: track.artists[0]?.name || 'Unbekannt', year: parseInt(track.album.release_date.substring(0, 4)), popularity: track.popularity || 0, albumArtUrl: track.album.images[0]?.url })); } catch (error) { console.error("Fehler beim Abrufen der Playlist-Tracks:", error.response?.data || error.message); return null; } }
async function spotifyApiCall(method, url, token, data = {}) { try { await axios({ method, url, data, headers: { 'Authorization': `Bearer ${token}` } }); return true; } catch (e) { console.error(`Spotify API Fehler bei ${method.toUpperCase()} ${url}:`, e.response?.data || e.message); return false; } }
async function hasAchievement(userId, achievementId) { try { const { count, error } = await supabase.from('user_achievements').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('achievement_id', achievementId); if (error) throw error; return count > 0; } catch (e) { console.error("Error checking achievement:", e); return false; } }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws && player.ws.readyState === WebSocket.OPEN && player.isConnected) { try { player.ws.send(messageString); } catch (e) { console.error(`Failed to send message to player ${player.ws.playerId}:`, e); } } }); }
function broadcastLobbyUpdate(pin) {
     const game = games[pin]; if (!game) return;
     const payload = { 
         pin, 
         hostId: game.hostId, 
         players: getScores(pin), // getScores liefert die Spielerliste
         gameMode: game.gameMode, // Sende auch den gameMode
         settings: {
             songCount: game.settings.songCount, 
             guessTime: game.settings.guessTime,
             answerType: game.settings.answerType, 
             lives: game.settings.lives, 
             gameType: game.settings.gameType,
             guessTypes: game.settings.guessTypes, // Sende die Quiz-Typen
             chosenBackgroundId: game.settings.chosenBackgroundId,
             deviceName: game.settings.deviceName, 
             playlistName: game.settings.playlistName,
             // NEU: Sende auch die IDs, nicht nur die Namen
             deviceId: game.settings.deviceId,
             playlistId: game.settings.playlistId
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
app.get('/api/config', (req, res) => res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }));
app.get('/login', (req, res) => { const scopes = 'user-read-private user-read-email playlist-read-private streaming user-modify-playback-state user-read-playback-state'; res.redirect('https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, scope: scopes, redirect_uri: REDIRECT_URI }).toString()); });

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
    const d = await axios.get('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${token}` } });
    res.json(d.data); } catch (e) { console.error("Playlist API Error:", e.response?.status, e.response?.data || e.message); res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Playlists" }); } });
app.get('/api/devices', async (req, res) => { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({ message: "Nicht autorisiert" }); try {
    const d = await axios.get('https://api.spotify.com/v1/me/player/devices', { headers: { 'Authorization': `Bearer ${token}` } });
    res.json(d.data); } catch (e) { console.error("Device API Error:", e.response?.status, e.response?.data || e.message); res.status(e.response?.status || 500).json({ message: "Fehler beim Abrufen der Geräte" }); } });

// --- SHOP API Routes (now using apiRouter with auth middleware) ---
apiRouter.get('/shop/items', async (req, res) => {
    const userId = req.userId;
    let ownedItems = { titles: new Set(), icons: new Set(), backgrounds: new Set(), colors: new Set() };
    if (userId) {
        try {
            const [titles, icons, backgrounds, colors] = await Promise.all([
                supabase.from('user_owned_titles').select('title_id').eq('user_id', userId),
                supabase.from('user_owned_icons').select('icon_id').eq('user_id', userId),
                supabase.from('user_owned_backgrounds').select('background_id').eq('user_id', userId),
                supabase.from('user_owned_colors').select('color_id').eq('user_id', userId)
            ]);
            titles.data?.forEach(t => ownedItems.titles.add(t.title_id));
            icons.data?.forEach(i => ownedItems.icons.add(i.icon_id));
            backgrounds.data?.forEach(b => ownedItems.backgrounds.add(b.background_id));
            colors.data?.forEach(c => ownedItems.colors.add(c.color_id));
        } catch (e) {
            console.error("Error fetching owned items for shop:", e);
        }
    }
    const itemsWithOwnership = shopItems.map(item => {
        let isOwned = false;
        if (item.type === 'title') isOwned = ownedItems.titles.has(item.id);
        else if (item.type === 'icon') isOwned = ownedItems.icons.has(item.id);
        else if (item.type === 'background') isOwned = ownedItems.backgrounds.has(item.backgroundId);
        else if (item.type === 'color') isOwned = ownedItems.colors.has(item.id);
        return { ...item, isOwned };
    });
    res.json({ items: itemsWithOwnership });
});


apiRouter.post('/shop/buy', async (req, res) => {
    const { itemId } = req.body;
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ success: false, message: "Nicht eingeloggt (Server)" });
    }
    const itemToBuy = shopItems.find(item => item.id == itemId);
    if (!itemToBuy || itemToBuy.unlockType !== 'spots') {
        return res.status(400).json({ success: false, message: "Item nicht kaufbar." });
    }
    try {
        const { data, error } = await supabase.rpc('purchase_item', {
            p_user_id: userId,
            p_item_id: itemToBuy.id.toString(),
            p_item_type: itemToBuy.type,
            p_item_cost: itemToBuy.cost,
            p_storage_id: itemToBuy.itemId || itemToBuy.id.toString()
        });
        if (error) {
            console.error(`Supabase RPC 'purchase_item' Error:`, error.message);
            return res.status(400).json({ success: false, message: error.message });
        }
        res.json({
            success: true,
            message: `"${itemToBuy.name}" erfolgreich gekauft!`,
            newSpots: data,
            itemType: itemToBuy.type
        });
    } catch (err) {
        console.error('Server-Fehler in /api/shop/buy:', err);
        res.status(500).json({ success: false, message: 'Interner Serverfehler.' });
    }
});
// ### ENDE /api/shop/buy ###

// --- GIFTING API Route (now using apiRouter with auth middleware) ---
apiRouter.post('/friends/gift', async (req, res) => { /* ... (Gleicher Code wie vorher) ... */ });


// --- KORRIGIERTER WEBSOCKET SERVER BLOCK ---
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log('WS: Client connected.');

    ws.on('message', async (message) => {
        let data;
        try {
            const messageString = message.toString();
            if (messageString === '{"type":"ping"}') {
                ws.send(JSON.stringify({ type: 'pong' }));
                return;
            }
            data = JSON.parse(messageString);
        } catch (e) {
            console.error("WS: Failed to parse message:", e);
            return;
        }
        await handleWebSocketMessage(ws, data);
    });

    ws.on('close', () => {
        console.log('WS: Client disconnected.');
        handlePlayerDisconnect(ws); // Rufe deine Disconnect-Logik auf
    });

    ws.on('error', (error) => {
        console.error('WS: WebSocket error:', error);
    });
});

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.readyState === WebSocket.OPEN) {
             ws.ping();
        }
    });
}, HEARTBEAT_INTERVAL);

wss.on('close', function close() { clearInterval(interval); });
// --- ENDE KORRIGIERTER WEBSOCKET BLOCK ---


// --- WebSocket Message Handler ---
async function handleWebSocketMessage(ws, data) {
    try {
        const { type, payload } = data;
        let { pin, playerId } = ws; // Get stored info from ws
        let game = games[pin];

        // Assign info on relevant messages
        if (type === 'register-online') { playerId = payload.userId; ws.playerId = playerId; ws.nickname = payload.username; onlineUsers.set(playerId, ws); console.log(`User ${playerId} (${ws.nickname || 'N/A'}) registered.`); return; }
        if (type === 'create-game') { playerId = payload.user?.id; ws.playerId = playerId; ws.nickname = payload.user?.username; /* continue to switch */ }
        if (type === 'join-game') { playerId = payload.user?.id; ws.playerId = playerId; ws.nickname = payload.user?.username; ws.pin = payload.pin; /* continue to switch */ }
        if (type === 'reconnect') { /* ... handle reconnect ... */ return; }

        // Reactions
        if (type === 'send-reaction') { if (!game || !game.players[playerId]) return; const reactionCost = 1; const reactionType = payload.reaction; const senderNickname = game.players[playerId].nickname; if (reactionCost > 0 && !playerId.startsWith('guest-')) { supabase.rpc('deduct_spots', { p_user_id: playerId, p_amount: reactionCost }).then(({ data: success, error }) => { if (error || !success) { console.error(`Failed to deduct spots for reaction from ${playerId}:`, error || 'RPC failed'); showToastToPlayer(ws, "Reaktion fehlgeschlagen (Spots?).", true); } else { broadcastToLobby(pin, { type: 'player-reacted', payload: { playerId, nickname: senderNickname, reaction: reactionType } }); showToastToPlayer(ws, `-${reactionCost} Spot für Reaktion.`); } }); } else { broadcastToLobby(pin, { type: 'player-reacted', payload: { playerId, nickname: senderNickname, reaction: reactionType } }); } return; }
        // Consumables
        if (type === 'use-consumable') { if (!game || !game.players[playerId] || game.gameState !== 'PLAYING') return; const itemId = payload.itemId; supabase.rpc('upsert_inventory_item', { p_user_id: playerId, p_item_id: itemId, p_quantity_change: -1 }).then(({ error }) => { if (error) { console.error(`Failed to use consumable ${itemId} for ${playerId}:`, error); showToastToPlayer(ws, "Item konnte nicht verwendet werden (Menge?).", true); } else { game.players[playerId].activeEffects = game.players[playerId].activeEffects || {}; game.players[playerId].activeEffects[itemId] = true; showToastToPlayer(ws, `"${itemId}" aktiviert!`); console.log(`Player ${playerId} used ${itemId}`); } }); return; }

        // Friends-System Calls
        if (type === 'add-friend') { handleAddFriend(ws, playerId, payload); return; }
        if (type === 'accept-friend-request') { handleAcceptFriendRequest(ws, playerId, payload); return; }
        if (type === 'decline-friend-request') { handleDeclineFriendRequest(ws, playerId, payload); return; }
        if (type === 'remove-friend') { handleRemoveFriend(ws, playerId, payload); return; }


        // --- Game Context Actions ---
        if (!game && !['create-game', 'join-game'].includes(type)) { console.warn(`Action ${type} requires game (Pin: ${pin}).`); return; }
        if (game && !game.players[playerId] && !['create-game', 'join-game'].includes(type)) { console.warn(`Player ${playerId} not in game ${pin} for action ${type}.`); return; }

        // ===========================================
        // KORREKTUR: HIER WIRD DIE LOGIK EINGEFÜGT
        // ===========================================
        switch (type) {
            case 'create-game':
                try {
                    const pin = generatePin();
                    ws.pin = pin; // Speichere PIN auf der WS-Verbindung des Hosts
                    console.log(`User ${playerId} creating new game with PIN: ${pin}`);
                    
                    games[pin] = {
                        pin: pin,
                        hostId: playerId,
                        players: {}, // Spieler-Objekt
                        gameMode: payload.gameMode || 'quiz',
                        gameState: 'LOBBY',
                        spotifyToken: payload.token,
                        settings: {
                            songCount: 10,
                            guessTime: 30,
                            answerType: 'freestyle',
                            lives: payload.lives || 3,
                            gameType: payload.gameType || 'points',
                            guessTypes: payload.guessTypes || ['title', 'artist'], // Dein neues Feature
                            chosenBackgroundId: null,
                            deviceName: null,
                            playlistName: null,
                            playlistId: null,
                            deviceId: null // NEU
                        },
                        tracks: [],
                        currentRound: 0
                    };
                    
                    // Füge den Host als ersten Spieler hinzu
                    await joinGame(ws, payload.user, pin);

                    // Lobe den "Gastgeber"-Erfolg aus
                    awardAchievement(ws, playerId, 10);
                    
                } catch (e) {
                    console.error("Error creating game:", e);
                    showToastToPlayer(ws, `Lobby-Erstellung fehlgeschlagen: ${e.message}`, true);
                }
                break;

            case 'join-game':
                try {
                    const { pin: joinPin, user } = payload;
                    const gameToJoin = games[joinPin];
                    
                    if (!gameToJoin) {
                        showToastToPlayer(ws, "Spiel nicht gefunden. PIN überprüft?", true);
                        return;
                    }
                    if (gameToJoin.gameState !== 'LOBBY') {
                         showToastToPlayer(ws, "Spiel läuft bereits. Beitreten nicht möglich.", true);
                         return;
                    }
                    
                    await joinGame(ws, user, joinPin);
                    
                } catch (e) {
                    console.error("Error joining game:", e);
                    showToastToPlayer(ws, `Beitritt fehlgeschlagen: ${e.message}`, true);
                }
                break;

            case 'update-settings':
                if (!game || ws.playerId !== game.hostId) {
                    return showToastToPlayer(ws, "Nur der Host kann Einstellungen ändern.", true);
                }
                
                console.log(`Host updated settings for ${pin}:`, payload);
                // Wende die neuen Einstellungen an
                Object.assign(game.settings, payload);
                
                // Informiere alle Spieler über die neuen Einstellungen
                broadcastLobbyUpdate(pin);
                break;

            case 'start-game':
                if (!game || ws.playerId !== game.hostId) {
                    return showToastToPlayer(ws, "Nur der Host kann das Spiel starten.", true);
                }
                if (!game.settings.playlistId || !game.settings.deviceId) { // Geändert zu deviceId
                     return showToastToPlayer(ws, "Wähle zuerst Playlist und Wiedergabegerät.", true);
                }
                
                // (Hier kommt die 'startGame'-Logik hin, vorerst nur ein Stub)
                console.log(`Attempting to start game ${pin}... (STUB)`);
                // STUB: Sende Start-Nachricht an alle
                broadcastToLobby(pin, { type: 'game-starting', payload: {} });
                // --- Hier würdest du `await startGame(pin)` aufrufen ---
                showToastToPlayer(ws, "Spielstart ist noch nicht implementiert.", true);
                break;

            case 'live-guess-update': /* ... logic ... */ break;
            case 'submit-guess': /* ... logic ... */ break;
            case 'player-ready': /* ... logic ... */ break;
            case 'invite-friend': /* ... logic ... */ break;
            case 'invite-response': /* ... logic ... */ break;
            
            case 'leave-game':
                handlePlayerDisconnect(ws);
                break;
                
            default:
                console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    } catch(e) { console.error("Error processing WebSocket message:", e); showToastToPlayer(ws, "Ein interner Serverfehler.", true); }
}


// --- KORREKTUR: Player Disconnect Logic ---
function handlePlayerDisconnect(ws) {
    const { pin, playerId } = ws;
    if (playerId) {
        onlineUsers.delete(playerId);
    }
    
    const game = games[pin];
    if (!game) {
        // console.log(`Player ${playerId} disconnected, no game found.`);
        return;
    }
    
    const player = game.players[playerId];
    if (!player) {
         // console.log(`Player ${playerId} not in game ${pin}.`);
        return;
    }
    
    console.log(`Player ${player.nickname} (${playerId}) disconnected from ${pin}.`);
    player.isConnected = false;
    player.ws = null;
    
    // (Hier könnte Logik hin, um den Host zu wechseln oder das Spiel zu beenden)
    // ...

    // Informiere alle über den Disconnect
    broadcastLobbyUpdate(pin);
    
    // (Hier könnte Logik hin, um leere Spiele aufzuräumen)
    // ...
}

// --- KORREKTUR: joinGame Logic ---
async function joinGame(ws, user, pin) {
    const game = games[pin];
    if (!game) throw new Error("Spiel nicht gefunden.");

    const playerId = user.id;
    let player = game.players[playerId];

    if (player) {
        // --- Spieler ist bereits im Spiel (Reconnect) ---
        console.log(`Player ${user.username} (${playerId}) reconnected to ${pin}.`);
        player.isConnected = true;
        player.ws = ws;
        player.nickname = user.username; // Nickname aktualisieren
    } else {
        // --- Neuer Spieler tritt bei ---
        console.log(`Player ${user.username} (${playerId}) joining ${pin}.`);
        
        // Hole das ausgerüstete Icon UND die Farbe des Spielers
        let iconId = 1; // Standard-Icon
        let colorId = null; // Standard-Farbe
        if (!user.isGuest) {
            try {
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('equipped_icon_id, equipped_color_id') // Beides holen
                    .eq('id', playerId)
                    .single();
                if (error) throw error;
                if (profile) {
                    iconId = profile.equipped_icon_id || 1;
                    colorId = profile.equipped_color_id || null;
                }
            } catch (e) {
                console.error(`Could not fetch icon/color for player ${playerId}:`, e.message);
            }
        }
        
        player = {
            id: playerId,
            nickname: user.username,
            isGuest: user.isGuest,
            ws: ws,
            isConnected: true,
            score: 0,
            lives: game.settings.lives,
            activeEffects: {},
            lastPointsBreakdown: null,
            iconId: iconId, // Speichere die Icon-ID
            colorId: colorId // Speichere die Color-ID
        };
        game.players[playerId] = player;
    }
    
    // Setze die Metadaten auf der WebSocket-Verbindung
    ws.pin = pin;
    ws.playerId = playerId;
    
    // Informiere alle (inkl. des neuen Spielers)
    broadcastLobbyUpdate(pin);
}


// --- Game Logic ---
async function startGame(pin) { /* ... (STUB) ... */ }
async function endGame(pin, cleanup = true) { /* ... (STUB) ... */ }

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

// --- Start Server ---
server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });

// Add missing basic helper functions (if they were removed)
function levenshteinDistance(s1, s2) { if (!s1 || !s2) return 99; s1 = s1.toLowerCase(); s2 = s2.toLowerCase(); const costs = []; for (let i = 0; i <= s1.length; i++) { let lastValue = i; for (let j = 0; j <= s2.length; j++) { if (i === 0) costs[j] = j; else if (j > 0) { let newValue = costs[j - 1]; if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1; costs[j - 1] = lastValue; lastValue = newValue; } } if (i > 0) costs[s2.length] = lastValue; } return costs[s2.length]; }
function normalizeString(str) { if (!str) return ''; return str.toLowerCase().replace(/\(.*\)|\[.*\]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').trim(); }
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
