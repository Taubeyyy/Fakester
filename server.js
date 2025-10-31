// server.js

// Lade Umgebungsvariablen aus .env-Datei
require('dotenv').config();

// Überprüfe, ob alle notwendigen Umgebungsvariablen gesetzt sind
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const SERVER_PORT = process.env.SERVER_PORT || 3000;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
    console.error("Fehler: Eine oder mehrere notwendige Umgebungsvariablen (SUPABASE_URL, SUPABASE_ANON_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI) sind nicht gesetzt.");
    process.exit(1); // Beende den Prozess, wenn wichtige Variablen fehlen
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const cors = require('cors'); // Füge CORS hinzu
const jwt = require('jsonwebtoken'); // Für JWT-Verifizierung

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Supabase Client Initialisierung
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: false // Wichtig für Serverseiten-Anwendungen, damit keine Sessions im Dateisystem gespeichert werden
    }
});

app.use(express.json()); // Ermöglicht das Parsen von JSON im Request Body
app.use(cors()); // Aktiviere CORS für alle Routen

// --- Globale Variablen ---
const activeGames = {}; // Speichert aktive Spiele: { pin: gameData }
const clientConnections = new Map(); // Speichert WebSocket-Verbindungen: Map<userId, WebSocket>

// --- Game-Konstanten ---
const QUIZ_GAME_MODES = {
    quiz: {
        rounds: 10,
        roundTime: 20, // Sekunden
        maxPlayers: 8,
        xpPerCorrectAnswer: 10,
        xpPerWin: 50,
        spotsPerCorrectAnswer: 5, // NEU: Spots für korrekte Antworten
        spotsPerWin: 20 // NEU: Spots für Gewinn
    }
    // Fakester und Truth Game Modes würden hier definiert
};

const ITEMS_LIST = require('./items'); // Lade die items.js Liste

// --- HELPER-FUNKTIONEN ---

// Middleware zur Überprüfung des JWT (für geschützte API-Routen)
async function verifyJwt(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Token missing' });
    }

    try {
        // Supabase JWTs sind asymmetrisch signiert. Wir müssen den Public Key von Supabase holen
        // In einer Produktionsumgebung sollte der Public Key gecached oder als ENV-Variable gesetzt werden.
        // Für diese Demo rufen wir ihn direkt ab.
        const { data: { public_key }, error: publicKeyError } = await supabase.rpc('get_jwt_secret'); // Beispiel: Supabase Edge Function
        if (publicKeyError) throw publicKeyError;

        const decoded = jwt.verify(token, public_key || process.env.SUPABASE_JWT_SECRET); // Fallback für lokalen Test
        req.user = decoded; // Fügt Benutzerinformationen zum Request hinzu
        next();
    } catch (error) {
        console.error("JWT verification error:", error);
        return res.status(401).json({ message: 'Invalid or expired token', error: error.message });
    }
}

// Funktion zum Generieren eines einzigartigen PINs
function generatePin() {
    let pin;
    do {
        pin = Math.floor(1000 + Math.random() * 9000).toString();
    } while (activeGames[pin]);
    return pin;
}

// Spotify API Helfer
async function refreshSpotifyToken(refreshToken) {
    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET
    });

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        const data = await response.json();
        if (response.ok) {
            console.log("Spotify token refreshed successfully.");
            return data.access_token;
        } else {
            console.error("Error refreshing Spotify token:", data);
            return null;
        }
    } catch (error) {
        console.error("Network error during Spotify token refresh:", error);
        return null;
    }
}

// Helper zum Senden einer Nachricht an einen einzelnen Client
function sendToClient(userId, message) {
    const ws = clientConnections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

// Helper zum Senden einer Nachricht an alle Spieler in einem Spiel
function broadcastToGame(pin, message) {
    const game = activeGames[pin];
    if (game && game.players) {
        game.players.forEach(player => {
            sendToClient(player.id, message);
        });
    }
}

// Helper zum Aktualisieren der Spielerliste in der Lobby
function updateLobbyPlayers(game) {
    if (!game) return;

    // Tiefenkopie der Spieler, um sensitive Daten (wie WS) zu vermeiden
    const playersPublicData = game.players.map(p => ({
        id: p.id,
        username: p.username,
        isHost: p.isHost,
        equipped_title_id: p.equipped_title_id, // NEU
        equipped_icon_id: p.equipped_icon_id,   // NEU
        equipped_color_id: p.equipped_color_id, // NEU
        equipped_bg_color_id: p.equipped_bg_color_id, // NEU
        equipped_bg_symbol_id: p.equipped_bg_symbol_id, // NEU
        // Weitere öffentliche Profildaten hier hinzufügen
    }));

    broadcastToGame(game.pin, {
        type: 'lobby-update',
        payload: {
            pin: game.pin,
            hostId: game.hostId,
            players: playersPublicData,
            gameSettings: game.gameSettings,
            hostSettings: game.hostSettings,
            maxPlayers: game.maxPlayers
        }
    });
}

// Helper um den Spieler im Spiel zu aktualisieren (für In-Game-Updates wie Scores)
function updateGamePlayers(game) {
    if (!game) return;

    const playersPublicData = game.players.map(p => ({
        id: p.id,
        username: p.username,
        score: p.score,
        lives: p.lives,
        // ... weitere In-Game-Daten, die Clients sehen sollen
    }));

    broadcastToGame(game.pin, {
        type: 'game-players-update',
        payload: {
            players: playersPublicData
        }
    });
}


// --- REST API Routen ---

// Stellt Supabase-Konfiguration bereit
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY,
    });
});

// Spotify Login
app.get('/login', (req, res) => {
    const scopes = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative user-top-read';
    res.redirect('https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
            response_type: 'code',
            client_id: SPOTIFY_CLIENT_ID,
            scope: scopes,
            redirect_uri: SPOTIFY_REDIRECT_URI,
            show_dialog: 'true'
        }).toString()
    );
});

// Spotify Callback
app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    if (!code) {
        return res.redirect('/#error=no_code');
    }

    const params = new URLSearchParams({
        code: code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        grant_type: 'authorization_code',
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET
    });

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        const data = await response.json();
        if (response.ok) {
            // Speichere die Tokens im Supabase-Profil des Benutzers
            const accessToken = data.access_token;
            const refreshToken = data.refresh_token;
            const expiresIn = data.expires_in; // Sekunden
            const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

            const { user } = await supabase.auth.getUser(); // Hole den aktuell angemeldeten Benutzer
            if (user) {
                const { error } = await supabase.from('profiles')
                    .update({
                        spotify_access_token: accessToken,
                        spotify_refresh_token: refreshToken,
                        spotify_token_expires_at: expiresAt
                    })
                    .eq('id', user.id);

                if (error) {
                    console.error("Error updating Spotify tokens in DB:", error);
                    return res.redirect('/#error=db_update_failed');
                }
                // Weiterleitung zur Startseite der App mit den Tokens als Hash-Parameter
                res.redirect(`/#spotify_access_token=${accessToken}&spotify_refresh_token=${refreshToken}&expires_in=${expiresIn}`);
            } else {
                res.redirect('/#error=not_authenticated');
            }
        } else {
            console.error("Spotify token error:", data);
            res.redirect('/#error=' + (data.error || 'spotify_auth_failed'));
        }
    } catch (error) {
        console.error("Network error during Spotify callback:", error);
        res.redirect('/#error=network_error');
    }
});

// Überprüfe Spotify-Status und gib Tokens zurück
app.get('/api/spotify-status', verifyJwt, async (req, res) => {
    const userId = req.user.sub; // Supabase user ID aus dem JWT
    try {
        const { data, error } = await supabase.from('profiles').select('spotify_access_token, spotify_refresh_token, spotify_token_expires_at').eq('id', userId).single();

        if (error) {
            console.error("Error fetching Spotify tokens:", error);
            return res.status(500).json({ connected: false, message: 'DB error' });
        }

        if (data && data.spotify_access_token && data.spotify_refresh_token && data.spotify_token_expires_at) {
            let accessToken = data.spotify_access_token;
            let refreshToken = data.spotify_refresh_token;
            let expiresAt = data.spotify_token_expires_at;

            // Überprüfe, ob der Token abgelaufen ist
            if (expiresAt < Math.floor(Date.now() / 1000) + 60) { // Refresh if less than 60 seconds left
                console.log("Spotify access token expired or near expiry, refreshing...");
                const newAccessToken = await refreshSpotifyToken(refreshToken);
                if (newAccessToken) {
                    accessToken = newAccessToken;
                    expiresAt = Math.floor(Date.now() / 1000) + 3600; // Spotify tokens usually last 1 hour
                    // Update tokens in DB
                    const { error: updateError } = await supabase.from('profiles')
                        .update({ spotify_access_token: accessToken, spotify_token_expires_at: expiresAt })
                        .eq('id', userId);
                    if (updateError) console.error("Error updating refreshed Spotify token in DB:", updateError);
                } else {
                    return res.json({ connected: false, message: 'Token refresh failed' });
                }
            }

            res.json({
                connected: true,
                accessToken: accessToken,
                refreshToken: refreshToken,
                expiresIn: expiresAt - Math.floor(Date.now() / 1000)
            });
        } else {
            res.json({ connected: false, message: 'No Spotify tokens found' });
        }
    } catch (error) {
        console.error("Spotify status check failed:", error);
        res.status(500).json({ connected: false, message: error.message });
    }
});

// Spotify Devices API (Proxy)
app.get('/api/devices', verifyJwt, async (req, res) => {
    const accessToken = req.headers['authorization'].split(' ')[1]; // Token kommt von Client
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (response.ok) {
            res.json(data);
        } else {
            console.error("Spotify devices API error:", data);
            res.status(response.status).json(data);
        }
    } catch (error) {
        console.error("Network error fetching Spotify devices:", error);
        res.status(500).json({ message: 'Error fetching Spotify devices' });
    }
});

// Spotify Playlists API (Proxy)
app.get('/api/playlists', verifyJwt, async (req, res) => {
    const accessToken = req.headers['authorization'].split(' ')[1]; // Token kommt von Client
    try {
        // Holen Sie sich nur Playlists, die der aktuelle Benutzer besitzt oder zu denen er beigetragen hat
        // (type=owner) oder alle (blank)
        const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (response.ok) {
            res.json(data);
        } else {
            console.error("Spotify playlists API error:", data);
            res.status(response.status).json(data);
        }
    } catch (error) {
        console.error("Network error fetching Spotify playlists:", error);
        res.status(500).json({ message: 'Error fetching Spotify playlists' });
    }
});

// Shop-Endpunkte
app.get('/api/shop/items', verifyJwt, async (req, res) => {
    const userId = req.user.sub;
    try {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id') // Select only id, no need for spots here as we filter owned items
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        // Hole alle vom Benutzer besessenen Gegenstände aus der Datenbank
        const { data: userItems, error: userItemsError } = await supabase
            .from('user_inventory')
            .select('item_id')
            .eq('user_id', userId);

        if (userItemsError) throw userItemsError;

        const ownedItemIds = new Set(userItems.map(item => item.item_id));

        // Füge 'isOwned' Eigenschaft zu den Shop-Items hinzu
        const shopItemsWithStatus = ITEMS_LIST.filter(item => item.unlockType === 'spots').map(item => ({
            ...item,
            isOwned: ownedItemIds.has(item.id)
        }));

        res.json({ items: shopItemsWithStatus });
    } catch (error) {
        console.error("Error loading shop items for user:", error);
        res.status(500).json({ message: "Fehler beim Laden der Shop-Items." });
    }
});


app.post('/api/shop/buy', verifyJwt, async (req, res) => {
    const userId = req.user.sub;
    const { itemId } = req.body;

    // Finde das Item in der ITEMS_LIST
    const itemToBuy = ITEMS_LIST.find(item => item.id === itemId && item.unlockType === 'spots');

    if (!itemToBuy) {
        return res.status(404).json({ success: false, message: "Item nicht gefunden oder nicht kaufbar." });
    }

    try {
        // Transaktion starten (optional, aber empfohlen für Finanzoperationen)
        // Supabase Realtime bietet keine expliziten Transaktionen über RPC,
        // daher ist eine Edge Function oder eine Abfolge von Operationen notwendig.
        // Für diese Demo führen wir sequentielle Operationen durch.

        // 1. Benutzerprofil abrufen (Spots und vorhandene Items)
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('spots')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;
        if (!profile) {
            return res.status(404).json({ success: false, message: "Benutzerprofil nicht gefunden." });
        }

        const userSpots = profile.spots;

        // 2. Prüfen, ob der Benutzer das Item bereits besitzt
        const { data: existingItem, error: existingItemError } = await supabase
            .from('user_inventory')
            .select('id')
            .eq('user_id', userId)
            .eq('item_id', itemId);

        if (existingItemError) throw existingItemError;
        if (existingItem.length > 0) {
            return res.status(400).json({ success: false, message: "Du besitzt dieses Item bereits." });
        }

        // 3. Prüfen, ob der Benutzer genug Spots hat
        if (userSpots < itemToBuy.cost) {
            return res.status(400).json({ success: false, message: "Nicht genügend Spots." });
        }

        // 4. Spots abziehen und Item zum Inventar hinzufügen (innerhalb einer einzigen Supabase-Transaktion/RPC-Call, wenn möglich)
        // Da Supabase Client-seitig keine echten Transaktionen erlaubt, simulieren wir dies mit einer PL/pgSQL-Funktion oder einer Edge Function.
        // Für diese Demo nutzen wir zwei separate Operationen, was bei gleichzeitigem Zugriff zu Race Conditions führen KÖNNTE.
        // In Produktion würde man eine Supabase Function (RPC) oder eine Edge Function nutzen, die beides atomar durchführt.

        const { error: updateProfileError } = await supabase
            .from('profiles')
            .update({ spots: userSpots - itemToBuy.cost })
            .eq('id', userId);

        if (updateProfileError) throw updateProfileError;

        const { error: insertItemError } = await supabase
            .from('user_inventory')
            .insert({ user_id: userId, item_id: itemId });

        if (insertItemError) throw insertItemError;
        
        // 5. Item als "ausgerüstet" setzen, wenn es der entsprechende Typ ist
        // (Dies ist eine einfache Logik, komplexe Spiele könnten mehr erfordern)
        let updatePayload = {};
        let successMessage = `Item "${itemToBuy.name}" erfolgreich gekauft!`;

        if (itemToBuy.type === 'title') {
            updatePayload = { equipped_title_id: itemId };
            successMessage += " Es wurde automatisch ausgerüstet.";
        } else if (itemToBuy.type === 'icon') {
            updatePayload = { equipped_icon_id: itemId };
            successMessage += " Es wurde automatisch ausgerüstet.";
        } else if (itemToBuy.type === 'color') {
            updatePayload = { equipped_color_id: itemId };
            successMessage += " Es wurde automatisch ausgerüstet.";
        } else if (itemToBuy.type === 'bg_color') {
            updatePayload = { equipped_bg_color_id: itemToBuy.storageKey };
            successMessage += " Es wurde automatisch ausgerüstet.";
        } else if (itemToBuy.type === 'bg_symbol') {
            updatePayload = { equipped_bg_symbol_id: itemToBuy.storageKey };
            successMessage += " Es wurde automatisch ausgerüstet.";
        }
        
        if (Object.keys(updatePayload).length > 0) {
            const { error: equipError } = await supabase
                .from('profiles')
                .update(updatePayload)
                .eq('id', userId);

            if (equipError) {
                console.warn("Fehler beim automatischen Ausrüsten des Items:", equipError);
                successMessage += " (Ausrüsten fehlgeschlagen, aber Item gekauft.)";
            }
        }

        // Erfolg
        res.json({
            success: true,
            message: successMessage,
            newSpots: userSpots - itemToBuy.cost,
            itemType: itemToBuy.type // Für Client-Side-Update
        });

    } catch (error) {
        console.error("Fehler beim Item-Kauf:", error);
        res.status(500).json({ success: false, message: "Interner Serverfehler beim Kauf." });
    }
});


// --- WebSocket Server Logik ---
wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
            // console.log('Received:', parsedMessage.type);
        } catch (error) {
            console.error('Invalid JSON received:', message.toString(), error);
            return;
        }

        const { type, payload } = parsedMessage;

        // --- AUTH/INITIAL CONNECTION ---
        if (type === 'auth-init') {
            const { user, isGuest } = payload;
            if (!user || !user.id) {
                console.warn("Auth-init received without valid user ID.");
                ws.send(JSON.stringify({ type: 'error', payload: 'Invalid user for auth-init' }));
                ws.close(1008, 'Invalid user ID');
                return;
            }
            // Weise die Verbindung dem Benutzer zu
            clientConnections.set(user.id, ws);
            ws.userId = user.id; // Speichere userId auf dem WebSocket-Objekt
            ws.isGuest = isGuest;

            console.log(`User ${user.id} (${user.username}) connected.`);

            // Wenn der Benutzer ein Spiel verlassen hat, aber die WS-Verbindung noch besteht,
            // überprüfen, ob er in einem aktiven Spiel sein sollte.
            // Dies ist ein Reconnect-Szenario.
            const existingGamePin = Object.values(activeGames).find(game =>
                game.players.some(p => p.id === user.id)
            )?.pin;

            if (existingGamePin) {
                console.log(`User ${user.id} reconnected to existing game ${existingGamePin}`);
                const game = activeGames[existingGamePin];

                // Finde den Spieler im Spiel und aktualisiere seine WS-Verbindung
                const playerInGame = game.players.find(p => p.id === user.id);
                if (playerInGame) {
                    playerInGame.ws = ws; // Aktualisiere die WebSocket-Referenz

                    // Sende den Client direkt in den passenden Spielstatus
                    ws.send(JSON.stringify({
                        type: 'reconnect-to-game',
                        payload: {
                            pin: game.pin,
                            gameMode: game.gameMode,
                            isHost: playerInGame.isHost,
                            gameSettings: game.gameSettings, // Sende aktuelle Einstellungen
                            hostSettings: game.hostSettings, // Sende aktuelle Host-Einstellungen
                            currentScreen: game.currentScreen || 'lobby-screen', // Oder den aktuellen Spiel-Screen
                            playerState: playerInGame // Sende den individuellen Spielerstatus
                        }
                    }));
                    // Aktualisiere die Lobby oder das Spiel für alle
                    if (game.currentScreen === 'lobby-screen') {
                        updateLobbyPlayers(game);
                    } else if (game.currentScreen === 'game-screen') {
                        // Sende den aktuellen Game-State, wenn das Spiel läuft
                        // Dies ist eine Vereinfachung, im echten Spiel müsste der genaue Status (Runde, Timer, etc.) gesendet werden
                        broadcastToGame(game.pin, { type: 'game-state-update', payload: { currentRound: game.currentRound, totalRounds: game.totalRounds } });
                        updateGamePlayers(game);
                    }
                }
            }
            return;
        }

        // Alle weiteren Nachrichten erfordern, dass der Client bereits authentifiziert ist
        if (!ws.userId) {
            console.warn("Received message from unauthenticated client:", type);
            ws.send(JSON.stringify({ type: 'error', payload: 'Not authenticated' }));
            return;
        }

        const userId = ws.userId;
        const username = payload.user?.username || 'Gast'; // Fallback für Gäste

        // --- CREATE GAME ---
        if (type === 'create-game') {
            const { user, token, gameMode, gameType, lives } = payload;
            if (!user || !token || !gameMode || !gameType) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Ungültige Spiel-Erstellungsdaten.' }));
                return;
            }

            const gamePin = generatePin();
            const gameConfig = QUIZ_GAME_MODES[gameMode]; // Holen Sie sich die Konfiguration für den Modus

            const newGame = {
                pin: gamePin,
                hostId: userId,
                gameMode: gameMode,
                spotifyToken: token, // Speichern des Spotify Tokens für den Host
                isPlaying: false,
                currentScreen: 'lobby-screen', // Start in der Lobby
                roundTimer: null,
                currentRound: 0,
                totalRounds: gameConfig.rounds,
                maxPlayers: gameConfig.maxPlayers,
                players: [],
                gameSettings: { // Allgemeine Spieleinstellungen (vom Host wählbar)
                    gameType: gameType, // 'points' oder 'lives'
                    lives: gameType === 'lives' ? lives : 0, // Nur wenn gameType 'lives' ist
                    guessTypes: ['title', 'artist'] // Standard für Quiz
                },
                hostSettings: { // Host-spezifische Einstellungen (Spotify etc.)
                    deviceId: null,
                    deviceName: null,
                    playlistId: null,
                    playlistName: null,
                    // NEU: Hintergrund für die Lobby
                    chosenBgColorId: null, // Initial keine Farbe
                    chosenBgSymbolId: null, // Initial kein Symbol
                },
                currentTrack: null, // Aktueller Spotify-Track
                answers: new Map(), // Speichert Antworten pro Runde: Map<playerId, answer>
                timeline: [], // Protokoll für vergangene Runden
            };

            activeGames[gamePin] = newGame;
            console.log(`Game created with PIN: ${gamePin} by ${username} (${userId})`);

            // Profilinformationen vom Supabase abrufen
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('username, equipped_title_id, equipped_icon_id, equipped_color_id, equipped_bg_color_id, equipped_bg_symbol_id')
                .eq('id', userId)
                .single();

            if (profileError) {
                console.error("Error fetching host profile for new game:", profileError);
                ws.send(JSON.stringify({ type: 'error', payload: 'Fehler beim Laden deines Profils.' }));
                delete activeGames[gamePin];
                return;
            }

            const hostPlayer = {
                id: userId,
                username: profileData.username,
                isHost: true,
                score: 0,
                lives: newGame.gameSettings.lives,
                ws: ws,
                equipped_title_id: profileData.equipped_title_id,
                equipped_icon_id: profileData.equipped_icon_id,
                equipped_color_id: profileData.equipped_color_id,
                equipped_bg_color_id: profileData.equipped_bg_color_id,
                equipped_bg_symbol_id: profileData.equipped_bg_symbol_id,
            };
            newGame.players.push(hostPlayer);

            ws.send(JSON.stringify({
                type: 'game-created',
                payload: {
                    pin: gamePin,
                    gameMode: gameMode,
                    isHost: true,
                    gameSettings: newGame.gameSettings,
                    hostSettings: newGame.hostSettings,
                    playerState: { // Sende individuellen PlayerState auch an Host
                        id: userId,
                        username: profileData.username,
                        isHost: true,
                        score: 0,
                        lives: newGame.gameSettings.lives,
                        equipped_title_id: profileData.equipped_title_id,
                        equipped_icon_id: profileData.equipped_icon_id,
                        equipped_color_id: profileData.equipped_color_id,
                        equipped_bg_color_id: profileData.equipped_bg_color_id,
                        equipped_bg_symbol_id: profileData.equipped_bg_symbol_id,
                    }
                }
            }));

            // Initialisiere die Host-Einstellungen für den Hintergrund mit den ausgerüsteten des Hosts
            newGame.hostSettings.chosenBgColorId = profileData.equipped_bg_color_id;
            newGame.hostSettings.chosenBgSymbolId = profileData.equipped_bg_symbol_id;

            updateLobbyPlayers(newGame);
            return;
        }

        // --- JOIN GAME ---
        if (type === 'join-game') {
            const { pin, user } = payload;
            const game = activeGames[pin];

            if (!game) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Spiel nicht gefunden.' }));
                return;
            }
            if (game.isPlaying) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Das Spiel hat bereits begonnen.' }));
                return;
            }
            if (game.players.length >= game.maxPlayers) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Lobby ist voll.' }));
                return;
            }
            if (game.players.some(p => p.id === userId)) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Du bist bereits in dieser Lobby.' }));
                // Sollte nicht passieren, wenn Reconnect korrekt behandelt wird, aber zur Sicherheit
                return;
            }

            // Profilinformationen vom Supabase abrufen
            let profileData;
            let profileError;

            if (ws.isGuest) {
                profileData = {
                    username: user.username,
                    equipped_title_id: null,
                    equipped_icon_id: null,
                    equipped_color_id: null,
                    equipped_bg_color_id: null,
                    equipped_bg_symbol_id: null,
                };
            } else {
                ({ data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('username, equipped_title_id, equipped_icon_id, equipped_color_id, equipped_bg_color_id, equipped_bg_symbol_id')
                    .eq('id', userId)
                    .single());

                if (profileError) {
                    console.error("Error fetching player profile for join game:", profileError);
                    ws.send(JSON.stringify({ type: 'error', payload: 'Fehler beim Laden deines Profils.' }));
                    return;
                }
            }


            const newPlayer = {
                id: userId,
                username: profileData.username,
                isHost: false,
                score: 0,
                lives: game.gameSettings.lives,
                ws: ws,
                equipped_title_id: profileData.equipped_title_id,
                equipped_icon_id: profileData.equipped_icon_id,
                equipped_color_id: profileData.equipped_color_id,
                equipped_bg_color_id: profileData.equipped_bg_color_id,
                equipped_bg_symbol_id: profileData.equipped_bg_symbol_id,
            };
            game.players.push(newPlayer);
            console.log(`${username} (${userId}) joined game ${pin}.`);

            ws.send(JSON.stringify({
                type: 'joined-game',
                payload: {
                    pin: pin,
                    gameMode: game.gameMode,
                    isHost: false,
                    gameSettings: game.gameSettings,
                    hostSettings: game.hostSettings,
                    playerState: { // Sende individuellen PlayerState auch an den beitretenden Spieler
                        id: userId,
                        username: profileData.username,
                        isHost: false,
                        score: 0,
                        lives: game.gameSettings.lives,
                        equipped_title_id: profileData.equipped_title_id,
                        equipped_icon_id: profileData.equipped_icon_id,
                        equipped_color_id: profileData.equipped_color_id,
                        equipped_bg_color_id: profileData.equipped_bg_color_id,
                        equipped_bg_symbol_id: profileData.equipped_bg_symbol_id,
                    }
                }
            }));
            updateLobbyPlayers(game);
            return;
        }

        // --- LEAVE GAME ---
        if (type === 'leave-game') {
            const { pin } = payload;
            const game = activeGames[pin];

            if (!game) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Spiel nicht gefunden.' }));
                return;
            }

            const playerIndex = game.players.findIndex(p => p.id === userId);
            if (playerIndex > -1) {
                game.players.splice(playerIndex, 1);
                console.log(`${username} (${userId}) left game ${pin}.`);

                if (game.players.length === 0) {
                    // Wenn kein Spieler mehr da ist, Spiel auflösen
                    clearInterval(game.roundTimer); // Timer stoppen, falls vorhanden
                    if (game.currentTrack?.spotifyPlayerId) {
                        try {
                            await spotifyPausePlayback(game.spotifyToken, game.currentTrack.spotifyPlayerId);
                        } catch (e) { console.error("Error pausing spotify playback on game end:", e); }
                    }
                    delete activeGames[pin];
                    console.log(`Game ${pin} dissolved.`);
                } else {
                    // Wenn der Host gegangen ist, den nächsten Spieler zum Host machen
                    if (game.hostId === userId) {
                        const newHost = game.players[0];
                        newHost.isHost = true;
                        game.hostId = newHost.id;
                        console.log(`New host for game ${pin} is ${newHost.username} (${newHost.id}).`);
                        sendToClient(newHost.id, { type: 'set-host', payload: true });
                    }
                    updateLobbyPlayers(game);
                }
            } else {
                ws.send(JSON.stringify({ type: 'error', payload: 'Du bist nicht in diesem Spiel.' }));
            }
            return;
        }

        // --- UPDATE SETTINGS (HOST ONLY) ---
        if (type === 'update-settings') {
            const { pin } = payload;
            const game = activeGames[pin];

            if (!game || game.hostId !== userId) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Du bist nicht der Host oder Spiel nicht gefunden.' }));
                return;
            }
            if (game.isPlaying) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Einstellungen können nicht während des Spiels geändert werden.' }));
                return;
            }

            // Update spezifische Einstellungen
            if (payload.deviceId !== undefined) game.hostSettings.deviceId = payload.deviceId;
            if (payload.deviceName !== undefined) game.hostSettings.deviceName = payload.deviceName;
            if (payload.playlistId !== undefined) game.hostSettings.playlistId = payload.playlistId;
            if (payload.playlistName !== undefined) game.hostSettings.playlistName = payload.playlistName;
            if (payload.guessTypes !== undefined) game.gameSettings.guessTypes = payload.guessTypes;
            if (payload.chosenBgColorId !== undefined) game.hostSettings.chosenBgColorId = payload.chosenBgColorId; // NEU
            if (payload.chosenBgSymbolId !== undefined) game.hostSettings.chosenBgSymbolId = payload.chosenBgSymbolId; // NEU

            console.log(`Game ${pin} settings updated by host:`, game.hostSettings, game.gameSettings);
            updateLobbyPlayers(game); // Informiere alle über die geänderten Einstellungen
            return;
        }

        // --- START GAME (HOST ONLY) ---
        if (type === 'start-game') {
            const { pin } = payload;
            const game = activeGames[pin];

            if (!game || game.hostId !== userId) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Du bist nicht der Host oder Spiel nicht gefunden.' }));
                return;
            }
            if (game.isPlaying) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Spiel läuft bereits.' }));
                return;
            }
            if (!game.hostSettings.deviceId || !game.hostSettings.playlistId) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Host muss ein Spotify-Gerät und eine Playlist auswählen.' }));
                return;
            }
            if (game.players.length < 1) { // Min. 1 Spieler (Host)
                ws.send(JSON.stringify({ type: 'error', payload: 'Es muss mindestens ein Spieler in der Lobby sein.' }));
                return;
            }
            if (game.gameMode === 'quiz' && game.gameSettings.guessTypes.length === 0) {
                 ws.send(JSON.stringify({ type: 'error', payload: 'Für Quiz muss mindestens ein Rate-Typ (Titel/Interpret) ausgewählt sein.' }));
                 return;
            }


            game.isPlaying = true;
            game.currentScreen = 'game-screen';
            game.currentRound = 0;
            console.log(`Game ${pin} starting!`);
            broadcastToGame(pin, { type: 'game-starting' });

            // Starte die erste Runde
            await startNewRound(game);
            return;
        }

        // --- SEND REACTION ---
        if (type === 'send-reaction') {
            const { reaction } = payload;
            // Finde das Spiel, in dem der User ist
            const game = Object.values(activeGames).find(g => g.players.some(p => p.id === userId));

            if (game) {
                broadcastToGame(game.pin, {
                    type: 'player-reaction',
                    payload: { playerId: userId, reaction: reaction }
                });
            }
            return;
        }

        // --- SUBMIT ANSWER (IN-GAME) ---
        if (type === 'submit-answer') {
            const { pin, answer } = payload;
            const game = activeGames[pin];

            if (!game || !game.isPlaying || game.currentScreen !== 'game-screen') {
                ws.send(JSON.stringify({ type: 'error', payload: 'Kein aktives Spiel zum Antworten.' }));
                return;
            }

            // Sicherstellen, dass der Spieler noch nicht geantwortet hat
            if (game.answers.has(userId)) {
                ws.send(JSON.stringify({ type: 'error', payload: 'Du hast bereits geantwortet!' }));
                return;
            }

            game.answers.set(userId, { answer: answer, submittedAt: Date.now() });
            ws.send(JSON.stringify({ type: 'answer-received', payload: 'Antwort erhalten.' }));
            console.log(`${username} (${userId}) submitted answer: ${answer} in game ${pin}.`);

            // Wenn alle Spieler geantwortet haben, Runde vorzeitig beenden
            if (game.answers.size === game.players.length) {
                console.log(`All players in game ${pin} have answered. Ending round early.`);
                clearTimeout(game.roundTimer);
                await endRound(game);
            }
            return;
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`Client disconnected: ${code} - ${reason.toString()}`);

        if (ws.userId) {
            clientConnections.delete(ws.userId);
            // Überprüfen, ob der getrennte Client in einem aktiven Spiel war
            Object.values(activeGames).forEach(game => {
                const playerIndex = game.players.findIndex(p => p.id === ws.userId);
                if (playerIndex > -1) {
                    game.players[playerIndex].ws = null; // Markiere die WS-Verbindung als getrennt, aber halte Spieler im Spiel
                    console.log(`Player ${ws.userId} in game ${game.pin} lost WS connection.`);

                    // Wenn es ein Host war, müssen wir ihn nach einer Zeit entfernen
                    // oder wenn kein anderer Host da ist
                    if (game.hostId === ws.userId) {
                        // Der Host hat die Verbindung verloren. Wenn er nicht schnell reconnectet,
                        // muss ein neuer Host bestimmt oder das Spiel aufgelöst werden.
                        // Für diese Demo: Spiel auflösen oder neuen Host bestimmen (vereinfacht)
                        console.warn(`Host ${ws.userId} of game ${game.pin} disconnected!`);
                        if (game.players.length === 1) { // Nur Host war da
                            clearInterval(game.roundTimer);
                            if (game.currentTrack?.spotifyPlayerId) {
                                spotifyPausePlayback(game.spotifyToken, game.currentTrack.spotifyPlayerId)
                                    .catch(e => console.error("Error pausing spotify playback on host disconnect:", e));
                            }
                            delete activeGames[game.pin];
                            console.log(`Game ${game.pin} dissolved due to host disconnect.`);
                        } else {
                            // Versuche, neuen Host zu ernennen
                            const newHost = game.players.find(p => p.id !== ws.userId); // Erster Nicht-Host
                            if (newHost) {
                                newHost.isHost = true;
                                game.hostId = newHost.id;
                                console.log(`New host for game ${game.pin} is ${newHost.username} (${newHost.id}).`);
                                // Sende dem neuen Host die Info (falls er noch verbunden ist)
                                sendToClient(newHost.id, { type: 'set-host', payload: true });
                            }
                            // Entferne den alten Host, der gegangen ist
                            game.players.splice(playerIndex, 1);
                            updateLobbyPlayers(game); // Aktualisiere die Lobby oder das Spiel
                        }
                    } else {
                        // Normale Spieler werden nicht direkt aus dem Spiel entfernt,
                        // sondern nur ihre WS-Verbindung ist weg. Sie können wieder verbinden.
                        updateLobbyPlayers(game); // Immer die Lobby-Ansicht aktualisieren, um discon. Spieler anzuzeigen (oder als "disconnected" markieren)
                    }
                }
            });
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket Error:', error);
    });
});

// --- GAME LOGIC FUNKTIONEN (Quiz-Spezifisch) ---

async function startNewRound(game) {
    game.currentRound++;
    game.answers.clear(); // Antworten der letzten Runde zurücksetzen
    game.roundStartTime = Date.now(); // Zeitpunkt des Rundenstarts

    // Wenn alle Runden gespielt wurden
    if (game.currentRound > game.totalRounds) {
        await endGame(game);
        return;
    }

    console.log(`Game ${game.pin}: Starting Round ${game.currentRound}`);
    broadcastToGame(game.pin, { type: 'round-start', payload: { round: game.currentRound, totalRounds: game.totalRounds } });

    try {
        const track = await playRandomSpotifyTrack(game);
        if (!track) {
            console.error(`Game ${game.pin}: Could not play track. Ending game.`);
            broadcastToGame(game.pin, { type: 'error', payload: 'Spotify Wiedergabefehler, Spiel beendet.' });
            await endGame(game);
            return;
        }
        game.currentTrack = track;
        game.roundCountdown = QUIZ_GAME_MODES.quiz.roundTime; // Setze den Countdown für die Runde
        // console.log(`Current track for game ${game.pin}: ${track.title} by ${track.artist}`);

        // Setze den Runden-Timer
        clearTimeout(game.roundTimer); // Sicherstellen, dass kein alter Timer läuft
        game.roundTimer = setInterval(() => {
            game.roundCountdown--;
            // Schicke jede Sekunde den Countdown an die Clients
            broadcastToGame(game.pin, { type: 'countdown-update', payload: game.roundCountdown });

            if (game.roundCountdown <= 0) {
                clearInterval(game.roundTimer);
                endRound(game);
            }
        }, 1000);

    } catch (error) {
        console.error(`Game ${game.pin}: Error starting new round:`, error);
        broadcastToGame(game.pin, { type: 'error', payload: 'Fehler beim Starten der Runde.' });
        await endGame(game);
    }
}

async function endRound(game) {
    console.log(`Game ${game.pin}: Ending Round ${game.currentRound}`);
    clearInterval(game.roundTimer); // Stoppe den Countdown
    game.roundTimer = null;

    // Spotify-Wiedergabe stoppen
    if (game.currentTrack?.spotifyPlayerId) {
        try {
            await spotifyPausePlayback(game.spotifyToken, game.currentTrack.spotifyPlayerId);
        } catch (e) { console.error("Error pausing spotify playback:", e); }
    }

    const roundResults = {
        round: game.currentRound,
        track: game.currentTrack,
        playerScores: []
    };

    const xpPerCorrect = QUIZ_GAME_MODES.quiz.xpPerCorrectAnswer;
    const spotsPerCorrect = QUIZ_GAME_MODES.quiz.spotsPerCorrectAnswer;

    for (const player of game.players) {
        const playerAnswer = game.answers.get(player.id);
        let correctTitle = false;
        let correctArtist = false;
        let pointsEarned = 0;
        let spotsEarned = 0;

        if (playerAnswer) {
            const { answer } = playerAnswer;
            const normalizedAnswer = answer.toLowerCase().trim();
            const normalizedTitle = game.currentTrack.title.toLowerCase().trim();
            const normalizedArtist = game.currentTrack.artist.toLowerCase().trim();

            if (game.gameSettings.guessTypes.includes('title') && normalizedAnswer.includes(normalizedTitle)) {
                correctTitle = true;
            }
            if (game.gameSettings.guessTypes.includes('artist') && normalizedAnswer.includes(normalizedArtist)) {
                correctArtist = true;
            }

            if (correctTitle || correctArtist) {
                pointsEarned = 1; // 1 Punkt für mindestens eine richtige Antwort
                player.score += pointsEarned;
                // Update XP und Spots (async, nicht blockierend)
                if (!player.isGuest) { // Gäste sammeln keine XP/Spots
                    await updatePlayerStats(player.id, xpPerCorrect, spotsPerCorrect, 0, pointsEarned, 0);
                }
            } else if (game.gameSettings.gameType === 'lives') {
                player.lives--;
            }
        } else if (game.gameSettings.gameType === 'lives') {
            player.lives--; // Leben verlieren, wenn nicht geantwortet
        }

        // Update Highscore
        if (!player.isGuest && player.score > (player.highscore || 0)) {
            await supabase.from('profiles').update({ highscore: player.score }).eq('id', player.id);
        }

        roundResults.playerScores.push({
            playerId: player.id,
            username: player.username,
            answer: playerAnswer?.answer || 'Keine Antwort',
            correctTitle: correctTitle,
            correctArtist: correctArtist,
            score: player.score,
            lives: player.lives,
            pointsEarned: pointsEarned
        });
    }

    game.timeline.push(roundResults); // Speichere die Ergebnisse dieser Runde
    broadcastToGame(game.pin, { type: 'round-results', payload: roundResults });
    updateGamePlayers(game); // Sende aktualisierte Scores/Lives an alle

    // Überprüfe, ob im 'lives'-Modus Spieler ausgeschieden sind
    if (game.gameSettings.gameType === 'lives') {
        const playersStillInGame = game.players.filter(p => p.lives > 0);
        if (playersStillInGame.length < 2 && playersStillInGame.length !== game.players.length) { // Spiel beenden, wenn < 2 übrig sind (und es nicht von Anfang an 1 war)
            await endGame(game);
            return;
        }
    }


    // Warte kurz, bevor die nächste Runde beginnt oder das Spiel endet
    setTimeout(async () => {
        // Überprüfe hier nach Rundenende, ob das Spiel beendet werden soll
        // (z.B. alle Leben weg oder maximale Runden erreicht)
        if (game.gameSettings.gameType === 'lives') {
            const livingPlayers = game.players.filter(p => p.lives > 0);
            if (livingPlayers.length <= 1) { // Nur ein oder kein Spieler mehr mit Leben
                await endGame(game);
                return;
            }
        }

        if (game.currentRound >= game.totalRounds) {
            await endGame(game);
        } else {
            await startNewRound(game);
        }
    }, 5000); // 5 Sekunden Wartezeit nach den Ergebnissen
}

async function endGame(game) {
    console.log(`Game ${game.pin}: Ending.`);
    clearInterval(game.roundTimer); // Stoppe Timer
    game.roundTimer = null;
    game.isPlaying = false;
    game.currentScreen = 'lobby-screen'; // Zurück zur Lobby
    
    // Spotify-Wiedergabe stoppen
    if (game.currentTrack?.spotifyPlayerId) {
        try {
            await spotifyPausePlayback(game.spotifyToken, game.currentTrack.spotifyPlayerId);
        } catch (e) { console.error("Error pausing spotify playback on game end:", e); }
    }

    let winner = null;
    if (game.gameSettings.gameType === 'points') {
        winner = game.players.reduce((prev, current) => (prev.score > current.score ? prev : current));
    } else { // lives-Modus
        const livingPlayers = game.players.filter(p => p.lives > 0);
        if (livingPlayers.length === 1) {
            winner = livingPlayers[0];
        } else if (livingPlayers.length > 1) {
            // Wenn mehrere Spieler mit Leben übrig sind, wähle den mit den meisten Punkten
            winner = livingPlayers.reduce((prev, current) => (prev.score > current.score ? prev : current));
        }
    }

    // Wenn es einen Gewinner gibt, XP und Spots vergeben
    if (winner && !winner.isGuest) {
        const xpPerWin = QUIZ_GAME_MODES.quiz.xpPerWin;
        const spotsPerWin = QUIZ_GAME_MODES.quiz.spotsPerWin;
        await updatePlayerStats(winner.id, xpPerWin, spotsPerWin, 1, 0, 0); // +1 Win
        console.log(`Game ${game.pin} Winner: ${winner.username}. Awarded ${xpPerWin} XP and ${spotsPerWin} Spots.`);
    }

    broadcastToGame(game.pin, {
        type: 'game-over',
        payload: {
            winner: winner ? { id: winner.id, username: winner.username } : null,
            finalScores: game.players.map(p => ({
                id: p.id,
                username: p.username,
                score: p.score,
                lives: p.lives
            }))
        }
    });

    // Timeout vor dem Löschen des Spiels, damit Clients die Ergebnisse sehen können
    setTimeout(() => {
        delete activeGames[game.pin];
        console.log(`Game ${game.pin} removed from active games.`);
    }, 10000); // 10 Sekunden, bevor das Spiel vom Server gelöscht wird
}


// Spotify-Integration
async function playRandomSpotifyTrack(game) {
    const accessToken = game.spotifyToken;
    const deviceId = game.hostSettings.deviceId;
    const playlistId = game.hostSettings.playlistId;

    if (!accessToken || !deviceId || !playlistId) {
        console.error("Missing Spotify credentials or selected device/playlist.");
        throw new Error("Spotify-Setup unvollständig.");
    }

    try {
        // 1. Hole Tracks von der Playlist
        const tracksResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!tracksResponse.ok) {
            const errorData = await tracksResponse.json();
            console.error("Spotify playlist tracks error:", errorData);
            throw new Error(`Fehler beim Abrufen der Playlist-Tracks: ${errorData.error.message || tracksResponse.statusText}`);
        }
        const tracksData = await tracksResponse.json();
        const availableTracks = tracksData.items.filter(item => item.track && item.track.preview_url); // Nur Tracks mit Preview-URL

        if (availableTracks.length === 0) {
            throw new Error("Keine spielbaren Tracks (mit Vorschau) in der ausgewählten Playlist gefunden.");
        }

        const randomTrackItem = availableTracks[Math.floor(Math.random() * availableTracks.length)];
        const track = randomTrackItem.track;

        // 2. Spiele den Track ab
        const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uris: [track.uri],
                position_ms: 0 // Start von Anfang
            })
        });

        if (!playResponse.ok) {
            const errorData = await playResponse.json();
            console.error("Spotify play error:", errorData);
            // Spezifischer Fehler für "Player command failed: Restriction violated"
            if (errorData.error && errorData.error.reason === "PLAYER_COMMAND_FAILED") {
                throw new Error("Spotify-Wiedergabefehler: Gerät nicht aktiv oder Einschränkung verletzt. Starte die Wiedergabe manuell auf dem Gerät und versuche es erneut.");
            }
            throw new Error(`Fehler bei der Spotify-Wiedergabe: ${errorData.error.message || playResponse.statusText}`);
        }

        return {
            title: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            albumCover: track.album.images.length > 0 ? track.album.images[0].url : null,
            previewUrl: track.preview_url, // Kann für Client-Side-Play auch gesendet werden
            spotifyPlayerId: deviceId // Welcher Player genutzt wird, um es später zu stoppen
        };

    } catch (error) {
        console.error("Error playing Spotify track:", error);
        throw error;
    }
}

async function spotifyPausePlayback(accessToken, deviceId) {
    if (!accessToken || !deviceId) return;
    try {
        const response = await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Spotify pause error:", errorData);
            // Fehler ignorieren, wenn der Player bereits pausiert ist oder kein Gerät aktiv ist
            if (errorData.error && errorData.error.reason === "NO_ACTIVE_DEVICE") {
                console.log("No active device to pause playback, or playback already paused.");
            } else {
                 throw new Error(`Fehler beim Pausieren der Spotify-Wiedergabe: ${errorData.error.message || response.statusText}`);
            }
        }
    } catch (error) {
        console.error("Network error pausing Spotify playback:", error);
        throw error;
    }
}


// --- Supabase Profil Statistik Updates ---
async function updatePlayerStats(userId, xpChange = 0, spotsChange = 0, winsChange = 0, correctAnswersChange = 0, gamesPlayedChange = 0) {
    if (!userId) return;

    try {
        // Hole aktuelle Statistiken
        const { data, error } = await supabase
            .from('profiles')
            .select('xp, spots, wins, correct_answers, games_played, highscore')
            .eq('id', userId)
            .single();

        if (error) throw error;

        const currentXp = data.xp || 0;
        const currentSpots = data.spots || 0;
        const currentWins = data.wins || 0;
        const currentCorrectAnswers = data.correct_answers || 0;
        const currentGamesPlayed = data.games_played || 0;
        const currentHighscore = data.highscore || 0;

        const newXp = currentXp + xpChange;
        const newSpots = currentSpots + spotsChange;
        const newWins = currentWins + winsChange;
        const newCorrectAnswers = currentCorrectAnswers + correctAnswersChange;
        const newGamesPlayed = currentGamesPlayed + gamesPlayedChange;

        const updatePayload = {
            xp: newXp,
            spots: newSpots,
            wins: newWins,
            correct_answers: newCorrectAnswers,
            games_played: newGamesPlayed,
        };

        // Highscore nur aktualisieren, wenn der aktuelle Score höher ist (muss vom Game-State kommen)
        // Hier wird nur der `correct_answers` als potentieller Highscore-Wert genutzt, das muss angepasst werden
        // wenn ein echtes "Score"-System im Spiel ist.
        if (correctAnswersChange > 0 && correctAnswersChange > currentHighscore) {
            updatePayload.highscore = correctAnswersChange; // ACHTUNG: Dies ist eine sehr einfache Highscore-Logik
        }
        
        const { error: updateError } = await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);

        if (updateError) throw updateError;
        // console.log(`Player ${userId} stats updated: XP=${newXp}, Spots=${newSpots}`);

        // Sende Update an den Client (falls verbunden)
        sendToClient(userId, {
            type: 'profile-stats-update',
            payload: {
                xp: newXp,
                spots: newSpots,
                wins: newWins,
                correct_answers: newCorrectAnswers,
                games_played: newGamesPlayed,
                highscore: updatePayload.highscore || currentHighscore
            }
        });

    } catch (error) {
        console.error(`Fehler beim Aktualisieren der Spieler-Statistiken für ${userId}:`, error);
    }
}


// --- Statische Dateien bereitstellen ---
app.use(express.static(path.join(__dirname, 'public')));

// Fallback für alle anderen Routen (Single Page Application)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Starte den Server
server.listen(SERVER_PORT, () => {
    console.log(`Server gestartet auf Port ${SERVER_PORT}`);
    console.log(`Open http://localhost:${SERVER_PORT} in your browser`);
});

