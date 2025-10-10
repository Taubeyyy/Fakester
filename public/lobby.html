document.addEventListener('DOMContentLoaded', () => {
    // Diese Funktion wird ausgeführt, sobald die lobby.html-Seite geladen ist.
    fetchPlaylists();
});

async function fetchPlaylists() {
    const container = document.getElementById('playlist-container');
    try {
        // Ruft die /api/playlists Route auf unserem Server auf
        const response = await fetch('/api/playlists');
        
        if (!response.ok) {
            // Wenn der Server einen Fehler meldet (z.B. 401 No token), zeigen wir das an.
            const errorData = await response.json();
            throw new Error(errorData.message || 'Konnte Playlists nicht laden.');
        }

        const data = await response.json();
        
        // Wenn keine Playlists gefunden wurden
        if (!data.items || data.items.length === 0) {
            container.innerHTML = '<p>Du hast keine Playlists auf Spotify.</p>';
            return;
        }

        // Playlists anzeigen
        container.innerHTML = '<h2>Deine Playlists:</h2>';
        const ul = document.createElement('ul');
        data.items.forEach(playlist => {
            const li = document.createElement('li');
            li.textContent = playlist.name;
            // Hier könntest du einen Button hinzufügen, um das Spiel mit dieser Playlist zu starten
            ul.appendChild(li);
        });
        container.appendChild(ul);

    } catch (error) {
        console.error('Fehler:', error);
        container.innerHTML = `<p style="color: red;">Ein Fehler ist aufgetreten: ${error.message}</p><p>Bitte versuche, dich <a href="/">neu anzumelden</a>.</p>`;
    }
}