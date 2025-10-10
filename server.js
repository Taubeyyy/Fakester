// Wichtige Pakete importieren
const express = require('express');
const axios = require('axios');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config(); // Lädt die Umgebungsvariablen

// Spotify-Zugangsdaten aus den Render Environment Variables laden
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const app = express();
// Der Port wird von Render automatisch bereitgestellt
const PORT = process.env.PORT || 3000;

// Middleware, um statische Dateien (HTML, CSS, JS) aus dem 'public' Ordner bereitzustellen
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// === ROUTE 1: LOGIN ===
// Wenn der Nutzer auf den Login-Button klickt, wird er hierher geleitet.
// Diese Route leitet ihn direkt zu Spotify weiter.
app.get('/login', (req, res) => {
  const scopes = 'user-read-private user-read-email playlist-read-private'; // Berechtigungen, die wir von Spotify anfordern
  const authUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scopes,
      redirect_uri: REDIRECT_URI,
    }).toString();
  res.redirect(authUrl);
});

// === ROUTE 2: CALLBACK ===
// Nachdem der Nutzer bei Spotify zugestimmt hat, wird er hierher zurückgeleitet.
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

  if (!code) {
    return res.status(400).send('Error: Spotify hat keinen Code bereitgestellt.');
  }

  try {
    // Den erhaltenen Code gegen einen Access Token eintauschen
    const response = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      data: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
      }
    });

    const { access_token, refresh_token } = response.data;

    // Den Token sicher in einem Cookie speichern (sicherer als im Local Storage)
    res.cookie('spotify_access_token', access_token, { httpOnly: true, secure: true, maxAge: 3600000 }); // 1 Stunde gültig

    // Den Nutzer zur Hauptseite (oder zur Lobby-Erstellungs-Seite) zurückleiten
    res.redirect('/lobby.html');

  } catch (error) {
    console.error('Fehler beim Abrufen des Tokens:', error.response ? error.response.data : error.message);
    res.status(500).send('Fehler bei der Spotify-Authentifizierung.');
  }
});

// === ROUTE 3: GESCHÜTZTE API (Beispiel) ===
// Eine Beispiel-API, um die Playlists des Nutzers abzurufen.
// Sie funktioniert nur, wenn ein gültiger Token im Cookie vorhanden ist.
app.get('/api/playlists', async (req, res) => {
  const token = req.cookies.spotify_access_token;

  if (!token) {
    // Dies ist der Fehler, den du bekommen hast!
    return res.status(401).json({ error: { status: 401, message: "No token provided" } });
  }

  try {
    const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Fehler beim Abrufen der Playlists:', error.response ? error.response.data : error.message);
    res.status(error.response.status || 500).json({ message: "Fehler beim Abrufen der Playlists." });
  }
});


// Hauptseite bereitstellen
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Fakester Server läuft auf Port ${PORT}`);
});