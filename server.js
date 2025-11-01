// server.js - FINAL VERSION (Mit Spielstart-Logik & Freunde-System-Backend)
// KORREKTUR (FINAL): Alle 'googleusercontent.com'-Platzhalter-URLs wurden durch die
//                    echten 'api.spotify.com' & 'accounts.spotify.com' Endpunkte ersetzt.
// KORREKTUR: spotifyApiCall sendet 'data' nur, wenn es nicht null ist, um PUT-Fehler zu beheben.
// KORREKTUR: joinGame lädt jetzt auch equipped_title_id und equipped_background_id.
// NEU: Host-Disconnect-Logik vergibt 10% Trostpreis-Spots.
// NEU: endGame-Logik überarbeitet für 20% Score-Spots + Platzierungs-Bonus.

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
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

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
app.use('/api', apiRouter);


let games = {};
const onlineUsers = new Map(); // Speichert { userId: ws }
const HEARTBEAT_INTERVAL = 30000;

// --- Shop Data (ERWEITERT) ---
const shopItems = [
    // Titel
    { id: 101, type: 'title', name: 'Musik-Guru', cost: 100, unlockType: 'spots', description: 'Zeige allen dein Wissen!' },
    { id: 102, type: 'title', name: 'Playlist-Meister', cost: 150, unlockType: 'spots', description: 'Für echte Kenner.' },
    { id: 103, type: 'title', name: 'Beat-Dropper', cost: 200, unlockType: 'spots', description: 'Für Rhythmus-Fanatiker.' },
    { id: 104, type: 'title', name: '80er-Kind', cost: 150, unlockType: 'spots', description: 'Synth-Pop-Liebhaber.' },
    { id: 105, type: 'title', name: 'Gold-Kehlchen', cost: 300, unlockType: 'spots', description: 'Für die Gesangs-Profis.' },
    { id: 106, type: 'title', name: 'Platin', cost: 1000, unlockType: 'spots', description: 'Mehr Platin als die Wand.' },
    
    // Icons
    { id: 201, type: 'icon', name: 'Diamant', iconClass: 'fa-diamond', cost: 250, unlockType: 'spots', description: 'Ein glänzendes Icon.' },
    { id: 202, type: 'icon', name: 'Zauberhut', iconClass: 'fa-hat-wizard', cost: 300, unlockType: 'spots', description: 'Magisch!' },
    { id: 203, type: 'icon', name: 'Raumschiff', iconClass: 'fa-rocket', cost: 400, unlockType: 'spots', description: 'Zum Mond!' },
    { id: 204, type: 'icon', name: 'Bombe', iconClass: 'fa-bomb', cost: 350, unlockType: 'spots', description: 'Explosiv.' },
    { id: 205, type: 'icon', name: 'Ninja', iconClass: 'fa-user-secret', cost: 500, unlockType: 'spots', description: 'Still und leise.' },
    { id: 206, type: 'icon', name: 'Drache', iconClass: 'fa-dragon', cost: 750, unlockType: 'spots', description: 'Feurig!' },

    // Hintergründe
    { id: 301, type: 'background', name: 'Synthwave', imageUrl: '/assets/img/bg_synthwave.jpg', cost: 500, unlockType: 'spots', description: 'Retro-Vibes.', backgroundId: '301' },
    { id: 302, type: 'background', name: 'Konzertbühne', imageUrl: '/assets/img/bg_stage.jpg', cost: 600, unlockType: 'spots', description: 'Fühl dich wie ein Star.', backgroundId: '302' },
    { id: 303, type: 'background', name: 'Plattenladen', imageUrl: '/assets/img/bg_vinyl.jpg', cost: 700, unlockType: 'spots', description: 'Klassisches Stöbern.', backgroundId: '303' },
    
    // Farben
    { id: 501, name: 'Giftgrün', type: 'color', colorHex: '#00FF00', cost: 750, unlockType: 'spots', description: 'Ein knalliges Grün.' },
    { id: 502, name: 'Leuchtend Pink', type: 'color', colorHex: '#FF00FF', cost: 750, unlockType: 'spots', description: 'Ein echter Hingucker.' },
    { id: 503, name: 'Gold', type: 'color', colorHex: '#FFD700', cost: 1500, unlockType: 'spots', description: 'Zeig deinen Status.' },
    { id: 504, name: 'Cyber-Blau', type: 'color', colorHex: '#00FFFF', cost: 1000, unlockType: 'spots', description: 'Neon-Look.' }
];


// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getScores(pin) { 
    const game = games[pin]; 
    if (!game) return []; 
    return Object.values(game.players)
        .map(p => ({ 
            id: p.id,
            nickname: p.nickname, 
            score: p.score, 
            lives: p.lives, 
            isConnected: p.isConnected, 
            lastPointsBreakdown: p.lastPointsBreakdown,
            iconId: p.iconId || 1,
            colorId: p.colorId || null,
            titleId: p.titleId || 1,
            backgroundId: p.backgroundId || null
        }))
        .filter(p => p.id)
        .sort((a, b) => b.score - a.score); 
}
function showToastToPlayer(ws, message, isError = false) { if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: 'toast', payload: { message, isError } })); } catch (e) { console.error(`Failed to send toast to player ${ws.playerId}:`, e); } } }

async function getPlaylistTracks(playlistId, token) { 
    try {
        const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,artists(name),album(release_date,images),popularity))`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        return response.data.items
            .map(item => item.track)
            .filter(track => track && track.id && track.album?.release_date)
            .map(track => ({ 
                spotifyId: track.id, 
                title: track.name, 
                artist: track.artists[0]?.name || 'Unbekannt', 
                year: parseInt(track.album.release_date.substring(0, 4)), 
                popularity: track.popularity || 0, 
                albumArtUrl: track.album.images[0]?.url 
            }));
    } catch (error) { 
        console.error("Fehler beim Abrufen der Playlist-Tracks:", error.response?.data || error.message); 
        return null; 
    } 
}

async function spotifyApiCall(method, url, token, data = null) {
    try {
        const config = {
            method,
            url,
            headers: { 'Authorization': `Bearer ${token}` }
        };
        
        if (data) {
            config.data = data;
        }
        
        await axios(config); 
        
        return true;
    } catch (e) { 
        console.error(`Spotify API Fehler bei ${method.toUpperCase()} ${url}:`, e.response?.data || e.message); 
        return false; 
    } 
}

async function hasAchievement(userId, achievementId) { try { const { count, error } = await supabase.from('user_achievements').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('achievement_id', achievementId); if (error) throw error; return count > 0; } catch (e) { console.error("Error checking achievement:", e); return false; } }
function broadcastToLobby(pin, message) { const game = games[pin]; if (!game) return; const messageString = JSON.stringify(message); Object.values(game.players).forEach(player => { if (player.ws && player.ws.readyState === WebSocket.OPEN && player.isConnected) { try { player.ws.send(messageString); } catch (e) { console.error(`Failed to send message to player ${player.ws.playerId}:`, e); } } }); }
function broadcastLobbyUpdate(pin) {
     const game = games[pin]; if (!game) return;
     const payload = { 
         pin, 
         hostId: game.hostId, 
         players: getScores(pin),
         gameMode: game.gameMode,
         settings: {
             songCount: game.settings.songCount, 
             guessTime: game.settings.guessTime,
             answerType: game.settings.answerType, 
             lives: game.settings.lives, 
             gameType: game.settings.gameType,
             guessTypes: game.settings.guessTypes,
             chosenBackgroundId: game.settings.chosenBackgroundId,
             deviceName: game.settings.deviceName, 
             playlistName: game.settings.playlistName,
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

// --- SHOP API Routes ---
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


// --- WebSocket Server ---
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
        handlePlayerDisconnect(ws);
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


// --- WebSocket Message Handler ---
async function handleWebSocketMessage(ws, data) {
    try {
        const { type, payload } = data;
        let { pin, playerId } = ws;
        let game = games[pin];

        if (type === 'register-online') { 
            playerId = payload.userId; 
            ws.playerId = playerId; 
            ws.nickname = payload.username; 
            onlineUsers.set(playerId, ws); 
            console.log(`User ${playerId} (${ws.nickname || 'N/A'}) registered.`); 
            return; 
        }
        if (type === 'create-game') { 
            playerId = payload.user?.id; 
            ws.playerId = playerId; 
            ws.nickname = payload.user?.username; 
        }
        if (type === 'join-game') { 
            playerId = payload.user?.id; 
            ws.playerId = playerId; 
            ws.nickname = payload.user?.username; 
            ws.pin = payload.pin; 
        }
        if (type === 'reconnect') { /* ... handle reconnect ... */ return; }

        // --- NEU: Freunde-System Nachrichten ---
        if (type === 'load-friends') {
            await handleLoadFriends(ws, playerId);
            return;
        }
        if (type === 'add-friend') { 
            await handleAddFriend(ws, playerId, payload); 
            return; 
        }
        if (type === 'accept-friend-request') { 
            await handleAcceptFriendRequest(ws, playerId, payload); 
            return; 
        }
        if (type === 'decline-friend-request' || type === 'remove-friend') { 
            await handleRemoveFriend(ws, playerId, payload); 
            return; 
        }
        if (type === 'invite-friend') {
            await handleInviteFriend(ws, playerId, payload);
            return;
        }
        // --- Ende Freunde-System ---

        if (type === 'send-reaction') { 
            if (!game || !game.players[playerId]) return; 
            const reactionCost = 1; 
            const reactionType = payload.reaction; 
            const senderNickname = game.players[playerId].nickname; 
            if (reactionCost > 0 && !playerId.startsWith('guest-')) { 
                supabase.rpc('deduct_spots', { p_user_id: playerId, p_amount: reactionCost }).then(({ data: success, error }) => { 
                    if (error || !success) { 
                        console.error(`Failed to deduct spots for reaction from ${playerId}:`, error || 'RPC failed'); 
                        showToastToPlayer(ws, "Reaktion fehlgeschlagen (Spots?).", true); 
                    } else { 
                        broadcastToLobby(pin, { type: 'player-reacted', payload: { playerId, nickname: senderNickname, reaction: reactionType } }); 
                        showToastToPlayer(ws, `-${reactionCost} Spot für Reaktion.`); 
                    } 
                }); 
            } else { 
                broadcastToLobby(pin, { type: 'player-reacted', payload: { playerId, nickname: senderNickname, reaction: reactionType } }); 
            } 
            return; 
        }

        if (!game && !['create-game', 'join-game'].includes(type)) { console.warn(`Action ${type} requires game (Pin: ${pin}).`); return; }
        if (game && !game.players[playerId] && !['create-game', 'join-game'].includes(type)) { console.warn(`Player ${playerId} not in game ${pin} for action ${type}.`); return; }

        switch (type) {
            case 'create-game':
                try {
                    const pin = generatePin();
                    ws.pin = pin;
                    console.log(`User ${playerId} creating new game with PIN: ${pin}`);
                    
                    games[pin] = {
                        pin: pin,
                        hostId: playerId,
                        players: {},
                        gameMode: payload.gameMode || 'quiz',
                        gameState: 'LOBBY',
                        spotifyToken: payload.token,
                        settings: {
                            songCount: 10,
                            guessTime: 30,
                            answerType: payload.answerType || 'freestyle', // NEU
                            lives: payload.lives || 3,
                            gameType: payload.gameType || 'points',
                            guessTypes: payload.guessTypes || ['title', 'artist'], // NEU
                            chosenBackgroundId: null,
                            deviceName: null,
                            playlistName: null,
                            playlistId: null,
                            deviceId: null
                        },
                        tracks: [],
                        currentTrack: null,
                        currentRound: 0,
                        roundTimer: null
                    };
                    
                    await joinGame(ws, payload.user, pin);
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
                Object.assign(game.settings, payload);
                broadcastLobbyUpdate(pin);
                break;

            // --- NEU: Spielstart-Logik ---
            case 'start-game':
                if (!game || ws.playerId !== game.hostId) {
                    return showToastToPlayer(ws, "Nur der Host kann das Spiel starten.", true);
                }
                if (!game.settings.playlistId || !game.settings.deviceId) {
                     return showToastToPlayer(ws, "Wähle zuerst Playlist und Wiedergabegerät.", true);
                }
                if (game.gameState !== 'LOBBY') {
                    // Verhindert doppeltes Starten
                    showToastToPlayer(ws, "Spiel startet bereits...", true);
                    return;
                }
                
                // Starte den Spielstart-Prozess (asynchron, blockiert nicht den Handler)
                startGameLogic(pin).catch(err => {
                    console.error(`Fehler beim Starten von Spiel ${pin}:`, err);
                    showToastToPlayer(ws, `Spielstart fehlgeschlagen: ${err.message}`, true);
                    game.gameState = 'LOBBY'; // Zurücksetzen, damit man es erneut versuchen kann
                });
                break;
            // --- ENDE Spielstart-Logik ---

            case 'live-guess-update': /* ... logic ... */ break;
            case 'submit-guess': /* ... logic ... */ break;
            case 'player-ready': /* ... logic ... */ break;
            
            case 'leave-game':
                handlePlayerDisconnect(ws);
                break;
                
            default:
                console.warn(`Unhandled WebSocket message type: ${type}`);
        }
    } catch(e) { console.error("Error processing WebSocket message:", e); showToastToPlayer(ws, "Ein interner Serverfehler.", true); }
}


// --- Player Disconnect Logic ---
async function handlePlayerDisconnect(ws) {
    const { pin, playerId } = ws;
    if (playerId) {
        onlineUsers.delete(playerId);
        console.log(`User ${playerId} disconnected from online list.`);
    }
    
    const game = games[pin];
    if (!game) {
        return;
    }
    
    const player = game.players[playerId];
    if (!player) {
        return;
    }
    
    console.log(`Player ${player.nickname} (${playerId}) disconnected from ${pin}.`);
    player.isConnected = false;
    player.ws = null;
    
    // --- NEU: Host-Disconnect-Logik ---
    if (playerId === game.hostId && game.gameState !== 'FINISHED') {
        console.log(`Host ${playerId} disconnected from game ${pin}. Ending game.`);
        
        const finalScores = getScores(pin);
        broadcastToLobby(pin, { 
            type: 'game-over', 
            payload: { 
                scores: finalScores,
                message: "Der Host hat das Spiel verlassen." // Extra-Info für den Client
            } 
        });

        // --- NEU: 10% Trostpreis-Logik ---
        console.log(`Awarding consolation stats for game ${pin} (host left).`);
        const gamePlayers = Object.values(game.players);
        
        for (const p of gamePlayers) {
            // Nur verbundene Spieler, die nicht der Host und keine Gäste sind
            if (p.isGuest || !p.id || p.id === game.hostId || !p.isConnected) continue;
            
            const score = p.score || 0;
            const spotBonus = Math.max(1, Math.floor(score * 0.10)); // 10% Trostpreis-Spots
            const xpBonus = Math.max(5, Math.floor(score / 20)); // Kleiner Trostpreis-XP (1/20)
            
            try {
                // Update-Aufruf (ohne games_played/wins)
                const { error } = await supabase
                    .from('profiles')
                    .update({
                        xp: supabase.sql(`xp + ${xpBonus}`),
                        spots: supabase.sql(`spots + ${spotBonus}`)
                    })
                    .eq('id', p.id);
                
                if (error) throw error;
                
                console.log(`Awarded ${xpBonus} XP and ${spotBonus} Spots to ${p.id} (consolation).`);
                showToastToPlayer(p.ws, `Spiel abgebrochen. +${xpBonus} XP & +${spotBonus} 🎵 (Trostpreis)`, false);

            } catch (e) {
                console.error(`Exception awarding consolation stats for ${p.id}:`, e);
            }
        }
        // --- ENDE NEU ---
        
        // Spiel-Instanz aufräumen
        Object.values(game.players).forEach(p => {
            if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                p.ws.pin = null; // Verknüpfung für alle verbleibenden Spieler entfernen
            }
        });
        delete games[pin];
        console.log(`Game ${pin} deleted because host left.`);
        return; // Keine weiteren Updates für diese Lobby senden
    }
    // --- ENDE NEU ---
    
    broadcastLobbyUpdate(pin);
    
    // --- NEU: Leere Spiele aufräumen ---
    const connectedPlayers = Object.values(game.players).filter(p => p.isConnected).length;
    if (connectedPlayers === 0 && game.gameState === 'LOBBY') { // Nur leere Lobbys aufräumen
        console.log(`Game ${pin} is empty. Deleting.`);
        delete games[pin];
    }
    // --- ENDE NEU ---
}

// --- joinGame Logic ---
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
        player.nickname = user.username;
    } else {
        // --- Neuer Spieler tritt bei ---
        console.log(`Player ${user.username} (${playerId}) joining ${pin}.`);
        
        let iconId = 1;
        let colorId = null;
        let titleId = 1;
        let backgroundId = null;

        if (!user.isGuest) {
            try {
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('equipped_icon_id, equipped_color_id, equipped_title_id, equipped_background_id')
                    .eq('id', playerId)
                    .single();
                if (error) throw error;
                if (profile) {
                    iconId = profile.equipped_icon_id || 1;
                    colorId = profile.equipped_color_id || null;
                    titleId = profile.equipped_title_id || 1;
                    backgroundId = profile.equipped_background_id || null;
                }
            } catch (e) {
                console.error(`Could not fetch profile items for player ${playerId}:`, e.message);
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
            iconId: iconId,
            colorId: colorId,
            titleId: titleId,
            backgroundId: backgroundId
        };
        game.players[playerId] = player;
    }
    
    ws.pin = pin;
    ws.playerId = playerId;
    
    broadcastLobbyUpdate(pin);
}


// --- NEU: Game Logic (mit Bugfix) ---
async function startGameLogic(pin) {
    const game = games[pin];
    if (!game) return;

    game.gameState = 'STARTING';
    broadcastToLobby(pin, { type: 'game-starting' });
    
    console.log(`Spiel ${pin} startet. Lade Tracks...`);
    const tracks = await getPlaylistTracks(game.settings.playlistId, game.spotifyToken);

    if (!tracks || tracks.length === 0) {
        throw new Error("Playlist konnte nicht geladen werden oder ist leer.");
    }

    console.log(`Spiel ${pin}: ${tracks.length} Tracks geladen. Mische...`);
    let songCount = game.settings.songCount;
    if (songCount <= 0 || songCount > tracks.length) {
        songCount = tracks.length;
    }

    game.tracks = shuffleArray(tracks).slice(0, songCount);
    game.currentRound = 0;
    
    // Pause Spotify, bevor es losgeht
    // --- KORREKTE URL ---
    await spotifyApiCall('PUT', `https://api.spotify.com/v1/me/player/pause?device_id=${game.settings.deviceId}`, game.spotifyToken, null);
    // --- ENDE KORREKTUR ---
    await sleep(500); // Kurze Pause

    // Countdown
    console.log(`Spiel ${pin}: Starte Countdown...`);
    for (let i = 3; i > 0; i--) {
        broadcastToLobby(pin, { type: 'countdown', payload: { number: i } });
        await sleep(1000);
    }

    // Erste Runde starten
    await startNewRound(pin);
}

async function startNewRound(pin) {
    const game = games[pin];
    if (!game) return;

    if (game.roundTimer) clearTimeout(game.roundTimer);

    if (game.currentRound >= game.tracks.length) {
        await endGame(pin);
        return;
    }
    
    game.gameState = 'PLAYING';
    game.currentRound++;
    const track = game.tracks[game.currentRound - 1];
    game.currentTrack = track;
    
    console.log(`Spiel ${pin}, Runde ${game.currentRound}: Song ${track.title}`);

    // Starte Spotify-Wiedergabe
    // --- KORREKTE URL ---
    const success = await spotifyApiCall('PUT', `https://api.spotify.com/v1/me/player/play?device_id=${game.settings.deviceId}`, game.spotifyToken, { 
        uris: [`spotify:track:${track.spotifyId}`] 
    });
    // --- ENDE KORREKTUR ---

    if (!success) {
        broadcastToLobby(pin, { type: 'toast', payload: { message: "Fehler bei Spotify-Wiedergabe.", isError: true } });
        await sleep(2000);
        await startNewRound(pin); // Versuche nächste Runde
        return;
    }

    // Runde an Clients senden
    broadcastToLobby(pin, { 
        type: 'new-round', 
        payload: { 
            round: game.currentRound, 
            totalRounds: game.tracks.length
        } 
    });

    // Timer für Rundenende starten
    game.roundTimer = setTimeout(() => {
        endRound(pin);
    }, game.settings.guessTime * 1000);
}

async function endRound(pin) {
    const game = games[pin];
    if (!game || game.gameState !== 'PLAYING') return;

    console.log(`Spiel ${pin}, Runde ${game.currentRound} beendet.`);
    game.gameState = 'RESULTS';
    if (game.roundTimer) clearTimeout(game.roundTimer);

    // --- KORREKTE URL ---
    await spotifyApiCall('PUT', `https://api.spotify.com/v1/me/player/pause?device_id=${game.settings.deviceId}`, game.spotifyToken, null);
    // --- ENDE KORREKTUR ---

    // TODO: Ergebnisse berechnen
    const scores = getScores(pin); // Platzhalter

    broadcastToLobby(pin, { 
        type: 'round-result', 
        payload: { 
            correctTrack: game.currentTrack,
            scores: scores 
        } 
    });
    
    setTimeout(() => {
        startNewRound(pin);
    }, 8000); // 8 Sekunden Pause
}

async function endGame(pin, cleanup = true) {
    const game = games[pin];
    if (!game) return;

    console.log(`Spiel ${pin} beendet.`);
    game.gameState = 'FINISHED';
    if (game.roundTimer) clearTimeout(game.roundTimer);

    // --- KORREKTE URL ---
    await spotifyApiCall('PUT', `https://api.spotify.com/v1/me/player/pause?device_id=${game.settings.deviceId}`, game.spotifyToken, null);
    // --- ENDE KORREKTUR ---
    
    const finalScores = getScores(pin);
    broadcastToLobby(pin, { 
        type: 'game-over', 
        payload: { 
            scores: finalScores 
        } 
    });

    // --- NEU: Überarbeitete Spot/XP Vergabe (für normales Spielende) ---
    console.log(`Awarding stats for game ${pin}...`);
    const gamePlayers = Object.values(game.players);
    
    for (const player of gamePlayers) {
        if (player.isGuest || !player.id) continue;
        
        const score = player.score || 0;
        const placement = finalScores.findIndex(p => p.id === player.id);
        const isWinner = (placement === 0) && (finalScores[0].score > 0);
        
        let placementBonusSpots = 0;
        if (placement === 0) placementBonusSpots = 15; // 1. Platz
        else if (placement === 1) placementBonusSpots = 10; // 2. Platz
        else if (placement === 2) placementBonusSpots = 5;  // 3. Platz
        
        const scoreSpots = Math.max(1, Math.floor(score * 0.20)); // 20% des Scores als Spots
        const totalSpotBonus = scoreSpots + placementBonusSpots;
        
        const scoreXp = Math.max(10, Math.floor(score / 15)); // 1 XP pro 15 Punkte (min 10)
        const winnerXpBonus = isWinner ? 25 : 0; // 25 XP extra für den Sieg
        const totalXpBonus = scoreXp + winnerXpBonus;
        
        try {
            // Fetch current stats first
            const { data: profile, error: fetchError } = await supabase
                .from('profiles')
                .select('xp, spots, games_played, wins, highscore')
                .eq('id', player.id)
                .single();
                
            if (fetchError) throw fetchError;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    xp: profile.xp + totalXpBonus,
                    spots: profile.spots + totalSpotBonus,
                    games_played: profile.games_played + 1,
                    wins: isWinner ? profile.wins + 1 : profile.wins,
                    highscore: score > profile.highscore ? score : profile.highscore
                })
                .eq('id', player.id);
            
            if (updateError) throw updateError;
            
            console.log(`Awarded ${totalXpBonus} XP and ${totalSpotBonus} Spots to ${player.id}.`);
            showToastToPlayer(player.ws, `Spiel beendet! +${totalXpBonus} XP & +${totalSpotBonus} 🎵`, false);

        } catch (e) {
            console.error(`Exception awarding stats for ${player.id}:`, e);
        }
    }
    // --- ENDE NEU ---

    // Spiel-Instanz löschen
    setTimeout(() => {
        console.log(`Deleting finished game ${pin}.`);
        delete games[pin];
    }, 10000); // Delete game after 10 seconds
}
// --- Ende Game Logic ---


// --- NEU: Friend Handlers (Implementiert) ---
async function handleLoadFriends(ws, userId) {
    if (!userId) return;
    try {
        const { data, error } = await supabase
            .from('friends')
            .select(`
                user_id_1, user_id_2, status, requested_by,
                profile_1:profiles!friends_user_id_1_fkey (id, username),
                profile_2:profiles!friends_user_id_2_fkey (id, username)
            `)
            .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

        if (error) throw error;

        const friendsList = [];
        const requestsList = [];

        data.forEach(friendship => {
            const otherUser = friendship.profile_1.id === userId ? friendship.profile_2 : friendship.profile_1;
            const isOnline = onlineUsers.has(otherUser.id);

            const friendData = {
                id: otherUser.id,
                username: otherUser.username,
                isOnline: isOnline
            };

            if (friendship.status === 'accepted') {
                friendsList.push(friendData);
            } else if (friendship.status === 'pending' && friendship.requested_by !== userId) {
                // Nur Anfragen anzeigen, die an mich gerichtet sind
                requestsList.push(friendData);
            }
        });

        ws.send(JSON.stringify({ 
            type: 'friends-update', 
            payload: { 
                friends: friendsList, 
                requests: requestsList 
            } 
        }));

    } catch (error) {
        console.error("Fehler beim Laden der Freunde:", error);
        showToastToPlayer(ws, "Fehler beim Laden der Freunde.", true);
    }
}

async function handleAddFriend(ws, senderId, payload) {
    const { friendName } = payload;
    if (!friendName || friendName.trim() === '') {
        return showToastToPlayer(ws, "Name darf nicht leer sein.", true);
    }
    
    const { data: friend, error: friendError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', friendName.trim())
        .single();

    if (friendError || !friend) {
        return showToastToPlayer(ws, "Benutzer nicht gefunden.", true);
    }
    
    if (friend.id === senderId) {
        return showToastToPlayer(ws, "Du kannst dich nicht selbst hinzufügen.", true);
    }

    const { data: existing, error: existingError } = await supabase
        .from('friends')
        .select('id')
        .or(`(user_id_1.eq.${senderId},user_id_2.eq.${friend.id}),(user_id_1.eq.${friend.id},user_id_2.eq.${senderId})`)
        .single();
        
    if (existing) {
        return showToastToPlayer(ws, "Du bist bereits mit diesem Benutzer befreundet oder hast eine Anfrage gesendet.", true);
    }
    
    const user1 = senderId < friend.id ? senderId : friend.id;
    const user2 = senderId > friend.id ? senderId : friend.id;

    const { error: insertError } = await supabase
        .from('friends')
        .insert({
            user_id_1: user1,
            user_id_2: user2,
            status: 'pending',
            requested_by: senderId
        });
        
    if (insertError) {
        console.error("Fehler beim Senden der Freundschaftsanfrage:", insertError);
        return showToastToPlayer(ws, "Anfrage fehlgeschlagen.", true);
    }
    
    showToastToPlayer(ws, `Anfrage an ${friend.username} gesendet!`);
    
    const friendWs = onlineUsers.get(friend.id);
    if (friendWs) {
        showToastToPlayer(friendWs, `Du hast eine Freundschaftsanfrage von ${ws.nickname}!`);
        handleLoadFriends(friendWs, friend.id); // Freundesliste des Empfängers aktualisieren
    }
    
    awardAchievement(ws, senderId, 14);
}

async function handleAcceptFriendRequest(ws, receiverId, payload) {
    const { senderId } = payload; // ID der Person, die die ANFRAGE GESENDET hat

    const { error } = await supabase
        .from('friends')
        .update({ status: 'accepted' })
        .match({ requested_by: senderId, status: 'pending' })
        .or(`user_id_1.eq.${receiverId},user_id_2.eq.${receiverId}`);
        
    if (error) {
        console.error("Fehler beim Annehmen der Anfrage:", error);
        return showToastToPlayer(ws, "Anfrage annehmen fehlgeschlagen.", true);
    }
    
    showToastToPlayer(ws, "Freundschaft angenommen!");
    handleLoadFriends(ws, receiverId); // Eigene Liste aktualisieren

    const senderWs = onlineUsers.get(senderId);
    if (senderWs) {
        showToastToPlayer(senderWs, `${ws.nickname} hat deine Anfrage angenommen!`);
        handleLoadFriends(senderWs, senderId); // Liste des Senders aktualisieren
    }
}

async function handleRemoveFriend(ws, currentUserId, payload) {
    const { friendId } = payload; // ID der Person, die entfernt/abgelehnt wird

    const { error } = await supabase
        .from('friends')
        .delete()
        .or(`(user_id_1.eq.${currentUserId},user_id_2.eq.${friendId}),(user_id_1.eq.${friendId},user_id_2.eq.${currentUserId})`);
        
    if (error) {
        console.error("Fehler beim Entfernen/Ablehnen des Freundes:", error);
        return showToastToPlayer(ws, "Aktion fehlgeschlagen.", true);
    }
    
    showToastToPlayer(ws, "Freund entfernt/abgelehnt.");
    handleLoadFriends(ws, currentUserId); // Eigene Liste aktualisieren

    const friendWs = onlineUsers.get(friendId);
    if (friendWs) {
        showToastToPlayer(friendWs, `${ws.nickname} hat dich als Freund entfernt.`);
        handleLoadFriends(friendWs, friendId); // Liste des anderen aktualisieren
    }
}

async function handleInviteFriend(ws, senderId, payload) {
    const { friendId } = payload;
    const game = games[ws.pin];
    
    if (!game) {
        return showToastToPlayer(ws, "Du bist in keiner Lobby.", true);
    }
    
    const friendWs = onlineUsers.get(friendId);
    if (!friendWs) {
        return showToastToPlayer(ws, "Dieser Freund ist nicht online.", true);
    }
    
    friendWs.send(JSON.stringify({
        type: 'invite-received',
        payload: {
            from: ws.nickname,
            pin: game.pin
        }
    }));
    
    showToastToPlayer(ws, "Einladung gesendet!");
}
// --- Ende Friend Handlers ---


// --- Utility-Funktionen ---
function shuffleArray(array) { 
    for (let i = array.length - 1; i > 0; i--) { 
        const j = Math.floor(Math.random() * (i + 1)); 
        [array[i], array[j]] = [array[j], array[i]]; 
    } 
    return array; 
}

// --- Start Server ---
server.listen(process.env.PORT || 8080, () => { console.log(`✅ Fakester-Server läuft auf Port ${process.env.PORT || 8080}`); });