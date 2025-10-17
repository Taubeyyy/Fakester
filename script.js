document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    
    // Dummy Data for Achievements & Titles
    let userUnlockedAchievementIds = [1, 3];
    
    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [] };
    let screenHistory = ['auth-screen'];

    // Temporary variables for game creation
    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3
    };

    const achievementsList = [
        { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' },
        { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig.' },
        { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' },
        { id: 4, name: 'Historiker', description: 'Gewinne eine Timeline-Runde.' },
        { id: 5, name: 'Trendsetter', description: 'Gewinne eine Fame-Runde.' },
        { id: 6, name: 'Musik-Lexikon', description: 'Beantworte 500 Fragen richtig.'},
        { id: 7, name: 'Unbesiegbar', description: 'Gewinne 5 Spiele in Folge.'},
        { id: 8, name: 'Jahrhundert-Genie', description: 'Errate das Jahr 25 Mal exakt.'}
    ];
    const titlesList = [
        { id: 1, name: 'Neuling', achievement_id: null },
        { id: 2, name: 'Musik-Kenner', achievement_id: 2 },
        { id: 3, name: 'Legende', achievement_id: 3 },
        { id: 4, name: 'Zeitreisender', achievement_id: 4 },
        { id: 5, name: 'Star-Experte', achievement_id: 5 },
        { id: 6, name: 'Maestro', achievement_id: 6 },
        { id: 7, name: 'Champion', achievement_id: 7 },
        { id: 8, name: 'Orakel', achievement_id: 8 }
    ];
    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    const elements = {
        screens: document.querySelectorAll('.screen'),
        leaveGameButton: document.getElementById('leave-game-button'),
        loadingOverlay: document.getElementById('loading-overlay'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form'), },
        home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), },
        lobby: {
            pinDisplay: document.getElementById('lobby-pin'), playerList: document.getElementById('player-list'), hostSettings: document.getElementById('host-settings'), guestWaitingMessage: document.getElementById('guest-waiting-message'),
            deviceSelectBtn: document.getElementById('device-select-button'),
            playlistSelectBtn: document.getElementById('playlist-select-button'),
            startGameBtn: document.getElementById('start-game-button'),
            inviteFriendsBtn: document.getElementById('invite-friends-button'),
            songCountPresets: document.getElementById('song-count-presets'),
            guessTimePresets: document.getElementById('guess-time-presets'),
            answerTypeContainer: document.getElementById('answer-type-container'),
            answerTypePresets: document.getElementById('answer-type-presets'),
        },
        game: { round: document.getElementById('current-round'), totalRounds: document.getElementById('total-rounds'), timerBar: document.getElementById('timer-bar'), gameContentArea: document.getElementById('game-content-area') },
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), },
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), },
        friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button') },
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')},
        achievements: { grid: document.getElementById('achievement-grid') },
        titles: { list: document.getElementById('title-list') },
        gameTypeScreen: {
            pointsBtn: document.getElementById('game-type-points'),
            livesBtn: document.getElementById('game-type-lives'),
            livesSettings: document.getElementById('lives-settings-container'),
            livesPresets: document.getElementById('lives-count-presets'),
            createLobbyBtn: document.getElementById('create-lobby-button'),
        },
        changeNameModal: {
            overlay: document.getElementById('change-name-modal-overlay'),
            closeBtn: document.getElementById('close-change-name-modal-button'),
            submitBtn: document.getElementById('change-name-submit'),
            input: document.getElementById('change-name-input'),
        },
        deviceSelectModal: {
            overlay: document.getElementById('device-select-modal-overlay'),
            closeBtn: document.getElementById('close-device-select-modal'),
            list: document.getElementById('device-list'),
            refreshBtn: document.getElementById('refresh-devices-button-modal'),
        },
        playlistSelectModal: {
            overlay: document.getElementById('playlist-select-modal-overlay'),
            closeBtn: document.getElementById('close-playlist-select-modal'),
            list: document.getElementById('playlist-list'),
            search: document.getElementById('playlist-search'),
            pagination: document.getElementById('playlist-pagination'),
        },
        leaveConfirmModal: {
            overlay: document.getElementById('leave-confirm-modal-overlay'),
            confirmBtn: document.getElementById('confirm-leave-button'),
            cancelBtn: document.getElementById('cancel-leave-button'),
        },
        stats: {
            gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'),
            highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'),
            gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'),
        }
    };

    const showToast = (message, isError = false) => Toastify({ text: message, duration: 3000, gravity: "top", position: "center", style: { background: isError ? "var(--danger-color)" : "var(--success-color)", borderRadius: "8px" } }).showToast();
    const showScreen = (screenId) => {
        const currentScreen = screenHistory[screenHistory.length - 1];
        if (screenId !== currentScreen) screenHistory.push(screenId);
        elements.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
        const showLeaveButton = !['auth-screen', 'home-screen'].includes(screenId);
        elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
    };
    const goBack = () => {
        if (screenHistory.length > 1) {
            screenHistory.pop();
            const previousScreenId = screenHistory[screenHistory.length - 1];
            elements.screens.forEach(s => s.classList.remove('active'));
            document.getElementById(previousScreenId)?.classList.add('active');
            const showLeaveButton = !['auth-screen', 'home-screen'].includes(previousScreenId);
            elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton);
        }
    };
    const setLoading = (isLoading) => elements.loadingOverlay.classList.toggle('hidden', !isLoading);
    
    const initializeApp = async (user, isGuest = false) => {
        localStorage.removeItem('fakesterGame');
        currentUser = { id: user.id, username: isGuest ? user.username : user.user_metadata.username, isGuest };
        document.body.classList.toggle('is-guest', isGuest);
        document.getElementById('welcome-nickname').textContent = currentUser.username;
        if (!isGuest) { 
            if (currentUser.username.toLowerCase() === 'taubey') {
                userUnlockedAchievementIds = achievementsList.map(a => a.id);
            }
            await checkSpotifyStatus(); 
            renderAchievements(); 
            renderTitles();
            updateStatsDisplay();
            const storedTitleId = localStorage.getItem('fakesterEquippedTitle');
            if(storedTitleId) equipTitle(parseInt(storedTitleId));
        }
        showScreen('home-screen');
        connectWebSocket();
    };

    const checkSpotifyStatus = async () => {
        try { const res = await fetch('/api/status'); const data = await res.json(); spotifyToken = data.loggedIn ? data.token : null; } catch { spotifyToken = null; }
        document.getElementById('spotify-connect-button').classList.toggle('hidden', !!spotifyToken);
        elements.home.createRoomBtn.classList.toggle('hidden', !spotifyToken);
    };

    const handleAuthAction = async (action, form) => {
        setLoading(true);
        const username = form.querySelector('input[type="text"]').value;
        const password = form.querySelector('input[type="password"]').value;
        try {
            const { error } = await action({ email: `${username}@fakester.app`, password, options: { data: { username } } });
            if (error) throw error;
        } catch (error) {
            console.error('Supabase Auth Error:', error);
            showToast(error.message, true);
        } finally {
            setLoading(false);
        }
    };
    const handleLogout = async () => { setLoading(true); if (currentUser?.isGuest) return window.location.reload(); await supabase.auth.signOut(); };

    const connectWebSocket = () => {
        if(ws.socket && ws.socket.readyState === WebSocket.OPEN) return;
        const wsUrl = window.location.protocol.replace('http', 'ws') + '//' + window.location.host;
        ws.socket = new WebSocket(wsUrl);

        ws.socket.onopen = () => {
            console.log('✅ WebSocket-Verbindung hergestellt.');
            if (currentUser && !currentUser.isGuest) { ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id } })); }
            const storedGame = JSON.parse(localStorage.getItem('fakesterGame'));
            if (storedGame) {
                currentGame = storedGame;
                showToast('Verbinde erneut mit dem Spiel...');
                ws.socket.send(JSON.stringify({ type: 'reconnect', payload: { pin: currentGame.pin, playerId: currentGame.playerId } }));
            }
        };
        ws.socket.onmessage = (event) => { try { const data = JSON.parse(event.data); handleWebSocketMessage(data); } catch (error) { console.error('Fehler bei Nachricht:', error); } };
        ws.socket.onclose = () => { console.warn('WebSocket-Verbindung getrennt.'); setTimeout(() => { if(!document.getElementById('auth-screen').classList.contains('active')) connectWebSocket() }, 3000); };
        ws.socket.onerror = (error) => { console.error('WebSocket-Fehler:', error); };
    };

    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`Nachricht: ${type}`, payload);
        setLoading(false);
        if (type !== 'round-countdown') elements.countdownOverlay.classList.add('hidden');

        switch (type) {
            case 'game-created':
            case 'join-success':
                currentGame = { ...currentGame, pin: payload.pin, playerId: payload.playerId, isHost: payload.isHost, gameMode: payload.gameMode };
                localStorage.setItem('fakesterGame', JSON.stringify(currentGame));
                if (currentGame.isHost) { fetchHostData(); }
                elements.joinModal.overlay.classList.add('hidden');
                showScreen('lobby-screen');
                break;
            case 'lobby-update':
                elements.lobby.pinDisplay.textContent = payload.pin;
                renderPlayerList(payload.players, payload.hostId);
                updateHostSettings(payload.settings, currentGame.isHost);
                break;
            case 'game-starting':
                showScreen('game-screen');
                setupPreRound(payload);
                break;
            case 'round-countdown':
                showCountdown(payload.round, payload.totalRounds);
                break;
            case 'new-round':
                showScreen('game-screen');
                setupNewRound(payload);
                break;
            case 'round-result':
                showRoundResult(payload);
                break;
            case 'game-over':
                localStorage.removeItem('fakesterGame');
                showToast('Das Spiel ist vorbei!', false);
                setTimeout(() => {
                    screenHistory = ['home-screen'];
                    showScreen('home-screen');
                }, 5000);
                break;
            case 'invite-received':
                showInvitePopup(payload.from, payload.pin);
                break;
            case 'toast':
                showToast(payload.message, payload.isError);
                break;
            case 'error':
                showToast(payload.message, true);
                pinInput = "";
                document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = "");
                break;
        }
    };

    function renderPlayerList(players, hostId) {
        const playerList = elements.lobby.playerList;
        const existingPlayerIds = new Set([...playerList.querySelectorAll('.player-card')].map(el => el.dataset.playerId));
        const incomingPlayerIds = new Set(players.map(p => p.id));

        existingPlayerIds.forEach(id => {
            if (!incomingPlayerIds.has(id)) {
                playerList.querySelector(`[data-player-id="${id}"]`)?.remove();
            }
        });

        players.forEach(player => {
            let card = playerList.querySelector(`[data-player-id="${player.id}"]`);
            if (!card) {
                card = document.createElement('div');
                card.dataset.playerId = player.id;
                card.classList.add('player-card', 'new');
                playerList.appendChild(card);
            }
            
            const isHost = player.id === hostId;
            card.className = `player-card ${!player.isConnected ? 'disconnected' : ''} ${isHost ? 'host' : ''}`;
            card.innerHTML = `<i class="fa-solid fa-user player-icon ${isHost ? 'host' : ''}"></i><span class="player-name">${player.nickname}</span>`;
        });
    }

    function updateHostSettings(settings, isHost) {
        elements.lobby.hostSettings.classList.toggle('hidden', !isHost);
        elements.lobby.guestWaitingMessage.classList.toggle('hidden', isHost);
        if (!isHost) return;

        elements.lobby.answerTypeContainer.classList.toggle('hidden', currentGame.gameMode !== 'quiz');

        ['song-count-presets', 'guess-time-presets', 'answer-type-presets'].forEach(id => {
            const container = document.getElementById(id);
            if(!container) return;
            
            let valueToMatch;
            if (id.includes('song')) valueToMatch = settings.songCount;
            else if (id.includes('time')) valueToMatch = settings.guessTime;
            else if (id.includes('answer')) valueToMatch = settings.answerType;

            let customButton = container.querySelector('[data-value="custom"]');
            let matchFound = false;
            container.querySelectorAll('.preset-button').forEach(btn => {
                const isActive = btn.dataset.value == valueToMatch;
                btn.classList.toggle('active', isActive);
                if(isActive) matchFound = true;
            });
            if (!matchFound && customButton) {
                customButton.classList.add('active');
                customButton.textContent = valueToMatch + (id.includes('time') ? 's' : '');
            } else if (customButton) {
                customButton.textContent = 'Custom';
            }
        });

        elements.lobby.deviceSelectBtn.textContent = settings.deviceName || 'Gerät auswählen';
        elements.lobby.playlistSelectBtn.textContent = settings.playlistName || 'Playlist auswählen';

        elements.lobby.startGameBtn.disabled = !(settings.deviceId && settings.playlistId);
    }
    
    function showCountdown(round, total) {
        let text = `Runde ${round}`;
        if (total > 0) text += ` von ${total}`;

        elements.countdownOverlay.classList.remove('hidden');
        document.getElementById('countdown-text').textContent = text;
        let count = 3;
        const numEl = document.getElementById('countdown-number');
        numEl.textContent = count;
        const interval = setInterval(() => {
            count--;
            if (count > 0) numEl.textContent = count;
            else clearInterval(interval);
        }, 1000);
    }

    function setupPreRound(data) {
        const gameArea = elements.game.gameContentArea;
        const { firstSong, guessTime } = data;
        elements.game.round.textContent = 'Start';
        elements.game.totalRounds.textContent = 'Song';

        gameArea.innerHTML = `
            <div class="result-info">
                <h2>${firstSong.title}</h2>
                <p>von ${firstSong.artist} (${firstSong.year})</p>
                ${currentGame.gameMode === 'popularity' ? `<p>Popularität: ${firstSong.popularity}</p>` : ''}
            </div>
            <div class="timeline-scroll-container">
                <div class="timeline-track" style="justify-content: center;">
                    <div class="timeline-card">
                        <img src="${firstSong.albumArtUrl || ''}" alt="Album Art">
                        <div class="year">${firstSong.year}</div>
                    </div>
                </div>
            </div>
            <button id="ready-button" class="button-primary">Bereit</button>
        `;

        document.getElementById('ready-button').addEventListener('click', (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Warte auf andere...';
            ws.socket.send(JSON.stringify({ type: 'player-ready' }));
        });
        
        const timerBar = elements.game.timerBar;
        timerBar.style.transition = 'none';
        timerBar.style.width = '100%';
        setTimeout(() => {
            timerBar.style.transition = `width ${guessTime}s linear`;
            timerBar.style.width = '0%';
        }, 100);
    }

    function setupNewRound(data) {
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds > 0 ? data.totalRounds : '∞';
        
        const gameArea = elements.game.gameContentArea;
        if (data.gameMode === 'quiz') {
            gameArea.innerHTML = `<div class="album-art-container">${PLACEHOLDER_ICON}</div><div id="game-guess-area" class="guess-area"></div>`;
            const guessArea = document.getElementById('game-guess-area');
            if (data.mcOptions) {
                guessArea.innerHTML = ['title', 'artist', 'year'].map(key => `
                    <div class="mc-group">
                        <label>${key.charAt(0).toUpperCase() + key.slice(1)}</label>
                        <div class="mc-options-grid" id="mc-${key}">
                            ${data.mcOptions[key].map(opt => `<button class="mc-option-button" data-key="${key}" data-value="${opt}">${opt}</button>`).join('')}
                        </div>
                    </div>`).join('');

                document.querySelectorAll('.mc-option-button').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll(`#mc-${btn.dataset.key} .mc-option-button`).forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        const guess = {
                            title: document.querySelector('#mc-title .selected')?.dataset.value || '',
                            artist: document.querySelector('#mc-artist .selected')?.dataset.value || '',
                            year: document.querySelector('#mc-year .selected')?.dataset.value || '',
                        };
                        ws.socket.send(JSON.stringify({ type: 'live-guess-update', payload: { guess } }));
                    });
                });
            } else {
                guessArea.innerHTML = `<input type="text" id="guess-title" placeholder="Titel des Songs..." autocomplete="off"><input type="text" id="guess-artist" placeholder="Künstler*in" autocomplete="off"><input type="number" id="guess-year" placeholder="Jahr" autocomplete="off" inputmode="numeric">`;
                ['guess-title', 'guess-artist', 'guess-year'].forEach(id => {
                    document.getElementById(id).addEventListener('input', () => {
                        const guess = { title: document.getElementById('guess-title').value, artist: document.getElementById('guess-artist').value, year: document.getElementById('guess-year').value };
                        ws.socket.send(JSON.stringify({ type: 'live-guess-update', payload: { guess } }));
                    });
                });
            }
        } else if (data.gameMode === 'timeline') {
            currentGame.lastTimeline = data.timeline;
            let timelineHtml = '<div class="timeline-drop-zone" data-index="0"><i class="fa-solid fa-plus"></i></div>';
            timelineHtml += data.timeline.map((song, i) => `
                <div class="timeline-card">
                    <img src="${song.albumArtUrl || ''}" alt="Album Art">
                    <div class="year">${song.year}</div>
                </div>
                <div class="timeline-drop-zone" data-index="${i + 1}"><i class="fa-solid fa-plus"></i></div>
            `).join('');
            
            gameArea.innerHTML = `
                <div class="timeline-new-song">
                    <p>Platziere diesen Song:</p>
                    <h3>${data.song.title} - ${data.song.artist}</h3>
                </div>
                <div class="timeline-scroll-container">
                    <div class="timeline-track">${timelineHtml}</div>
                </div>`;
            
            document.querySelectorAll('.timeline-drop-zone').forEach(zone => {
                zone.addEventListener('click', () => {
                    gameArea.innerHTML = `<p class="fade-in">Warte auf andere Spieler...</p>`;
                    ws.socket.send(JSON.stringify({ type: 'submit-guess', payload: { index: parseInt(zone.dataset.index) } }));
                });
            });
            document.querySelector('.timeline-scroll-container').scrollLeft = (document.querySelector('.timeline-track').scrollWidth - document.querySelector('.timeline-scroll-container').clientWidth) / 2;
        } else if (data.gameMode === 'popularity') {
            const lastSong = data.timeline[data.timeline.length - 1];
            gameArea.innerHTML = `
                <div class="popularity-container">
                    <div class="popularity-card">
                        <img src="${lastSong.albumArtUrl || ''}">
                        <div class="popularity-card-info">
                            <h3>${lastSong.title}</h3>
                            <p>${lastSong.artist}</p>
                        </div>
                        <div class="popularity-score"><span class="value">${lastSong.popularity}</span><span class="label">Popularität</span></div>
                    </div>
                    <p>Ist der nächste Song populärer oder weniger populär?</p>
                    <h3>${data.song.title} - ${data.song.artist}</h3>
                    <div class="popularity-guess-buttons">
                        <button class="guess-button" data-guess="higher"><i class="fa-solid fa-arrow-up"></i></button>
                        <button class="guess-button" data-guess="lower"><i class="fa-solid fa-arrow-down"></i></button>
                    </div>
                </div>`;

            document.querySelectorAll('.guess-button').forEach(btn => {
                btn.addEventListener('click', () => {
                     gameArea.innerHTML = `<p>Warte auf andere Spieler...</p>`;
                     ws.socket.send(JSON.stringify({type: 'submit-guess', payload: { guess: btn.dataset.guess }}));
                });
            });
        }
        
        const timerBar = elements.game.timerBar;
        timerBar.style.transition = 'none';
        timerBar.style.width = '100%';
        setTimeout(() => {
            timerBar.style.transition = `width ${data.guessTime}s linear`;
            timerBar.style.width = '0%';
        }, 100);
    }
    
    function showRoundResult(data) {
        const gameArea = elements.game.gameContentArea;
        const me = data.scores.find(p => p.id === currentUser.id);
        const resultText = data.wasCorrect ? 'Richtig!' : 'Falsch!';
        const colorClass = data.wasCorrect ? 'var(--success-color)' : 'var(--danger-color)';

        const leaderboardHtml = `
            <div class="leaderboard">
                <h3>Leaderboard</h3>
                ${data.scores.map(p => `
                    <div class="leaderboard-row ${p.id === currentUser.id ? 'me' : ''}">
                        <span>${p.nickname} ${p.lives < 1 ? ' ausgeschieden' : ''}</span>
                        <span>+${p.lastPointsBreakdown.total} (${p.score})</span>
                    </div>`).join('')}
            </div>
            <button id="ready-button" class="button-primary">Weiter</button>`;

        if (currentGame.gameMode === 'quiz') {
            gameArea.querySelector('.album-art-container').innerHTML = `<img id="album-art" src="${data.song.albumArtUrl}" alt="Album Cover">`;
            const breakdown = me ? me.lastPointsBreakdown : { artist: 0, title: 0, year: 0, total: 0 };
            document.getElementById('game-guess-area').innerHTML = `
                <div class="result-info">
                    <h2>${data.song.title}</h2>
                    <p>von ${data.song.artist} (${data.song.year})</p>
                    <div class="points-breakdown">
                        <span>Titel: +${breakdown.title}</span><span>Künstler: +${breakdown.artist}</span><span>Jahr: +${breakdown.year}</span>
                    </div>
                </div>${leaderboardHtml}`;
        } else if (currentGame.gameMode === 'timeline') {
            let timeline = [...currentGame.lastTimeline];
            const newCard = { ...data.song, status: data.wasCorrect ? 'correct' : 'incorrect' };
            timeline.splice(data.userIndex, 0, newCard);

            let timelineHtml = timeline.map(song => `
                <div class="timeline-card ${song.status || ''}" ${song.status ? `id="newly-placed-card"` : ''}>
                    <img src="${song.albumArtUrl || ''}" alt="Album Art">
                    <div class="year">${song.year}</div>
                </div>`).join('');
            
            if (!data.wasCorrect) {
                const ghostCard = `<div class="timeline-card ghost"><div class="year">${data.song.year}</div></div>`;
                const tempEl = document.createElement('div');
                let cardsHtml = timeline.map(s => `<div class="timeline-card ${s.status || ''}"><img src="${s.albumArtUrl || ''}"><div class="year">${s.year}</div></div>`).join('');
                tempEl.innerHTML = cardsHtml;
                const cards = tempEl.querySelectorAll('.timeline-card');
                
                let combinedHtml = '';
                let ghostInserted = false;
                for(let i = 0; i <= currentGame.lastTimeline.length; i++){
                    if(i === data.correctIndex && !ghostInserted) {
                        combinedHtml += ghostCard;
                        ghostInserted = true;
                    }
                    if(i < data.userIndex) combinedHtml += cards[i].outerHTML;
                    else if(i === data.userIndex) combinedHtml += `<div class="timeline-card incorrect" id="newly-placed-card"><img src="${data.song.albumArtUrl}"><div class="year">${data.song.year}</div></div>`;
                    else if (i > data.userIndex) combinedHtml += cards[i-1].outerHTML;
                }
                if (!ghostInserted) combinedHtml += ghostCard;
                timelineHtml = combinedHtml;
            }

            gameArea.innerHTML = `
                <div class="result-info"><h2 style="color: ${colorClass}">${resultText}</h2><p>${data.song.title} (${data.song.year})</p></div>
                <div class="timeline-scroll-container"><div class="timeline-track">${timelineHtml}</div></div>
                ${leaderboardHtml}`;
            
            setTimeout(() => {
                document.getElementById('newly-placed-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }, 100);

        } else {
             gameArea.innerHTML = `
                <div class="result-info">
                    <h2 style="color: ${colorClass}">${resultText}</h2>
                    <p>${data.song.title} - ${data.song.artist} (${data.song.year})</p>
                    ${currentGame.gameMode === 'popularity' ? `<p>Popularität: ${data.song.popularity}</p>` : ''}
                </div>${leaderboardHtml}`;
        }

        document.getElementById('ready-button').addEventListener('click', (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Warte auf andere...';
            ws.socket.send(JSON.stringify({ type: 'player-ready' }));
        });
    }

    async function fetchHostData(isRefresh = false) {
        if (!spotifyToken) return;
        if(isRefresh) setLoading(true);
        try {
            const [devicesRes, playlistsRes] = await Promise.all([
                fetch('/api/devices', { headers: { 'Authorization': `Bearer ${spotifyToken}` } }),
                fetch('/api/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } })
            ]);
            if (!devicesRes.ok || !playlistsRes.ok) throw new Error('Spotify API Error');
            const devices = await devicesRes.json();
            const playlists = await playlistsRes.json();
            
            const deviceList = elements.deviceSelectModal.list;
            deviceList.innerHTML = '';
            if (devices.devices && devices.devices.length > 0) {
                devices.devices.forEach(d => {
                    const li = document.createElement('li');
                    li.textContent = d.name; li.dataset.id = d.id; li.dataset.name = d.name;
                    deviceList.appendChild(li);
                });
                const activeDevice = devices.devices.find(d => d.is_active);
                if (activeDevice && !isRefresh) {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { deviceId: activeDevice.id, deviceName: activeDevice.name } }));
                }
            } else {
                deviceList.innerHTML = '<li>Keine aktiven Geräte gefunden.</li>';
            }
            
            renderPaginatedPlaylists(playlists.items);

        } catch (error) { showToast('Fehler beim Laden der Spotify-Daten.', true); } 
        finally { if(isRefresh) setLoading(false); }
    }
    
    let allPlaylists = [];
    let currentPage = 1;
    const itemsPerPage = 8;
    function renderPaginatedPlaylists(playlists, page = 1) {
        allPlaylists = playlists;
        currentPage = page;
        
        const listEl = elements.playlistSelectModal.list;
        const paginationEl = elements.playlistSelectModal.pagination;
        listEl.innerHTML = '';
        paginationEl.innerHTML = '';

        const searchTerm = elements.playlistSelectModal.search.value.toLowerCase();
        const filteredPlaylists = allPlaylists.filter(p => p.name.toLowerCase().includes(searchTerm));

        const totalPages = Math.ceil(filteredPlaylists.length / itemsPerPage);
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedItems = filteredPlaylists.slice(start, end);

        paginatedItems.forEach(p => {
            const li = document.createElement('li');
            li.textContent = p.name; li.dataset.id = p.id; li.dataset.name = p.name;
            listEl.appendChild(li);
        });

        if (totalPages > 1) {
            paginationEl.innerHTML = `
                <button id="prev-page" class="button-icon" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
                <span>Seite ${currentPage} / ${totalPages}</span>
                <button id="next-page" class="button-icon" ${currentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
            `;
        }
    }

    function openCustomValueModal(type, title) {
        currentCustomType = type;
        elements.customValueModal.title.textContent = title;
        customValueInput = "";
        updateCustomValueDisplay();
        elements.customValueModal.overlay.classList.remove('hidden');
    }

    const handleCustomNumpad = (e) => {
        const key = e.target.closest('button')?.dataset.key;
        if (key && customValueInput.length < 3) customValueInput += key;
        updateCustomValueDisplay();
    };

    const updateCustomValueDisplay = () => { elements.customValueModal.display.forEach((d, i) => d.textContent = customValueInput[i] || ""); };

    function renderAchievements() {
        elements.achievements.grid.innerHTML = achievementsList.map(a => {
            const isUnlocked = userUnlockedAchievementIds.includes(a.id);
            return `<div class="stat-card ${!isUnlocked ? 'locked' : ''}"><span class="stat-value">${a.name}</span><span class="stat-label">${a.description}</span></div>`;
        }).join('');
    }

    function equipTitle(titleId) {
        const title = titlesList.find(t => t.id === titleId);
        if (title) {
            localStorage.setItem('fakesterEquippedTitle', titleId);
            document.getElementById('profile-title').textContent = title.name;
        }
        renderTitles();
    }

    function renderTitles() {
        const equippedTitleId = parseInt(localStorage.getItem('fakesterEquippedTitle')) || 1;
        let finalTitles = [...titlesList];
        if (currentUser && currentUser.username.toLowerCase() === 'taubey') {
            finalTitles.push({ id: 99, name: 'Entwickler', achievement_id: null });
        }
        elements.titles.list.innerHTML = finalTitles.map(t => {
            const isUnlocked = !t.achievement_id || userUnlockedAchievementIds.includes(t.achievement_id);
            if (!isUnlocked) return ''; 
            const isEquipped = t.id === equippedTitleId;
            return `<div class="title-card ${isEquipped ? 'equipped' : ''}" data-title-id="${t.id}"><span class="stat-value">${t.name}</span><span class="stat-label">${t.achievement_id ? `Freigeschaltet: ${achievementsList.find(a=>a.id === t.achievement_id).name}` : 'Spezial-Titel'}</span></div>`;
        }).join('');
    }

    function updateStatsDisplay() {
        // Dummy data for now - replace with actual data fetching
        const statsData = { games: 23, wins: 12, highscore: 1850, correct: 178, avgScore: 1230 };
        elements.stats.gamesPlayed.textContent = statsData.games;
        elements.stats.wins.textContent = statsData.wins;
        elements.stats.winrate.textContent = statsData.games > 0 ? `${Math.round((statsData.wins / statsData.games) * 100)}%` : '0%';
        elements.stats.highscore.textContent = statsData.highscore;
        elements.stats.correctAnswers.textContent = statsData.correct;
        elements.stats.avgScore.textContent = statsData.avgScore;
        elements.stats.gamesPlayedPreview.textContent = statsData.games;
        elements.stats.winsPreview.textContent = statsData.wins;
        elements.stats.correctAnswersPreview.textContent = statsData.correct;
    }
    
    function showInvitePopup(from, pin) {
        const container = document.getElementById('invite-popup-container');
        const popup = document.createElement('div');
        popup.className = 'invite-popup';
        popup.innerHTML = `
            <p><strong>${from}</strong> hat dich in eine Lobby eingeladen!</p>
            <div class="modal-actions">
                <button class="button-danger">Ablehnen</button>
                <button class="button-primary">Annehmen</button>
            </div>`;
        
        popup.querySelector('.button-danger').addEventListener('click', () => popup.remove());
        popup.querySelector('.button-primary').addEventListener('click', () => {
            ws.socket.send(JSON.stringify({ type: 'invite-response', payload: { accepted: true, pin, user: currentUser }}));
            popup.remove();
        });

        container.appendChild(popup);
    }
    // =========================================================================================
    // MAIN APP INITIALIZATION AND EVENT LISTENERS
    // =========================================================================================
    const main = async () => {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Konfiguration konnte nicht geladen werden.');
            const config = await response.json();
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            document.body.addEventListener('click', async (e) => {
                const target = e.target;
                
                if (target.closest('#leave-game-button')) {
                    const inGame = document.getElementById('lobby-screen').classList.contains('active') || document.getElementById('game-screen').classList.contains('active');
                    if (inGame) {
                        elements.leaveConfirmModal.overlay.classList.remove('hidden');
                    } else {
                        goBack();
                    }
                }
                if (target.closest('#confirm-leave-button')) {
                    localStorage.removeItem('fakesterGame');
                    window.location.reload();
                }
                if (target.closest('#cancel-leave-button')) {
                    elements.leaveConfirmModal.overlay.classList.add('hidden');
                }

                if (target.closest('.help-icon')) showToast(target.closest('.help-icon').title);
                if (target.closest('#guest-mode-button')) elements.guestModal.overlay.classList.remove('hidden');
                if (target.closest('#close-guest-modal-button')) elements.guestModal.overlay.classList.add('hidden');
                if (target.closest('#guest-nickname-submit')) {
                    const name = document.getElementById('guest-nickname-input').value.trim();
                    if (name.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                    elements.guestModal.overlay.classList.add('hidden');
                    initializeApp({ id: 'guest-' + Date.now(), username: name }, true);
                }
                if (target.closest('#show-join-button')) {
                    pinInput = ""; 
                    document.querySelectorAll('#join-pin-display .pin-digit').forEach(d => d.textContent = ""); 
                    elements.joinModal.overlay.classList.remove('hidden');
                }
                if (target.closest('#close-join-modal-button')) elements.joinModal.overlay.classList.add('hidden');
                if (target.closest('#friends-button')) elements.friendsModal.overlay.classList.remove('hidden');
                if (target.closest('#close-friends-modal-button')) elements.friendsModal.overlay.classList.add('hidden');
                
                if (target.closest('#username-container')) {
                    if(currentUser && !currentUser.isGuest) {
                        elements.changeNameModal.input.value = currentUser.username;
                        elements.changeNameModal.overlay.classList.remove('hidden');
                    }
                }
                 if (target.closest('.profile-title-button')) {
                    if (currentUser && !currentUser.isGuest) showScreen('title-selection-screen');
                }
                if (target.closest('#close-change-name-modal-button')) elements.changeNameModal.overlay.classList.add('hidden');
                if (target.closest('#change-name-submit')) {
                    const newName = elements.changeNameModal.input.value.trim();
                    if(newName.length < 3) return showToast('Name muss mind. 3 Zeichen haben.', true);
                    if(newName === currentUser.username) return elements.changeNameModal.overlay.classList.add('hidden');
                    setLoading(true);
                    const { error } = await supabase.auth.updateUser({ data: { username: newName } });
                    setLoading(false);
                    if(error) { showToast(error.message, true); } 
                    else {
                        currentUser.username = newName;
                        document.getElementById('welcome-nickname').textContent = newName;
                        ws.socket.send(JSON.stringify({ type: 'update-nickname', payload: { newName } }));
                        showToast('Name erfolgreich geändert!');
                        elements.changeNameModal.overlay.classList.add('hidden');
                    }
                }
                if (target.closest('#corner-logout-button')) handleLogout();
                if (target.closest('#achievements-button')) showScreen('achievements-screen');
                if (target.closest('#stats-button')) showScreen('stats-screen');
                if (target.closest('#show-create-button-action')) showScreen('mode-selection-screen');
                
                const titleCard = target.closest('.title-card');
                if (titleCard) equipTitle(parseInt(titleCard.dataset.titleId));
                
                const modeBox = target.closest('.mode-box');
                if (modeBox) {
                    selectedGameMode = modeBox.dataset.mode;
                    showScreen('game-type-selection-screen');
                    elements.gameTypeScreen.pointsBtn.classList.remove('active');
                    elements.gameTypeScreen.livesBtn.classList.remove('active');
                    elements.gameTypeScreen.createLobbyBtn.disabled = true;
                }
                if (target.closest('#game-type-points')) {
                    elements.gameTypeScreen.pointsBtn.classList.add('active'); elements.gameTypeScreen.livesBtn.classList.remove('active');
                    elements.gameTypeScreen.livesSettings.classList.add('hidden'); elements.gameTypeScreen.createLobbyBtn.disabled = false;
                    gameCreationSettings.gameType = 'points';
                }
                 if (target.closest('#game-type-lives')) {
                    elements.gameTypeScreen.livesBtn.classList.add('active'); elements.gameTypeScreen.pointsBtn.classList.remove('active');
                    elements.gameTypeScreen.livesSettings.classList.remove('hidden'); elements.gameTypeScreen.createLobbyBtn.disabled = false;
                    gameCreationSettings.gameType = 'lives';
                    elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b=>b.classList.remove('active'));
                    elements.gameTypeScreen.livesPresets.querySelector('[data-value="3"]').classList.add('active');
                }
                 if (target.closest('#lives-count-presets .preset-button')) {
                    const btn = target.closest('#lives-count-presets .preset-button');
                    if (btn.dataset.value === 'custom') {
                        openCustomValueModal('lives', 'Anzahl Leben');
                    } else {
                        elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        gameCreationSettings.lives = parseInt(btn.dataset.value);
                    }
                }
                if (target.closest('#create-lobby-button')) {
                    setLoading(true);
                    ws.socket.send(JSON.stringify({ type: 'create-game', payload: { user: currentUser, token: spotifyToken, gameMode: selectedGameMode, gameType: gameCreationSettings.gameType, lives: gameCreationSettings.lives } }));
                }

                if (target.closest('#device-select-button')) elements.deviceSelectModal.overlay.classList.remove('hidden');
                if (target.closest('#close-device-select-modal')) elements.deviceSelectModal.overlay.classList.add('hidden');
                if (target.closest('#refresh-devices-button-modal')) fetchHostData(true);
                const deviceLi = target.closest('#device-list li');
                if (deviceLi && deviceLi.dataset.id) {
                    ws.socket.send(JSON.stringify({type: 'update-settings', payload: { deviceId: deviceLi.dataset.id, deviceName: deviceLi.dataset.name }}));
                    elements.deviceSelectModal.overlay.classList.add('hidden');
                }
                
                if (target.closest('#playlist-select-button')) elements.playlistSelectModal.overlay.classList.remove('hidden');
                if (target.closest('#close-playlist-select-modal')) elements.playlistSelectModal.overlay.classList.add('hidden');
                const playlistLi = target.closest('#playlist-list li');
                if (playlistLi && playlistLi.dataset.id) {
                    ws.socket.send(JSON.stringify({type: 'update-settings', payload: { playlistId: playlistLi.dataset.id, playlistName: playlistLi.dataset.name }}));
                    elements.playlistSelectModal.overlay.classList.add('hidden');
                }
                
                const presetBtn = target.closest('.preset-button');
                if (presetBtn && presetBtn.dataset.value === 'custom' && !presetBtn.closest('#lives-count-presets')) {
                    const type = presetBtn.dataset.type;
                    let title = 'Wert eingeben';
                    if (type === 'song-count') title = 'Anzahl Songs';
                    else if (type === 'guess-time') title = 'Ratezeit (s)';
                    openCustomValueModal(type, title);
                } else if (presetBtn && !presetBtn.closest('#lives-count-presets')) {
                    const container = presetBtn.parentElement;
                    let key;
                    if (container.id.includes('song')) key = 'songCount';
                    else if (container.id.includes('time')) key = 'guessTime';
                    else if (container.id.includes('answer')) key = 'answerType';
                    if(key) ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [key]: presetBtn.dataset.value }}));
                }
                
                if (target.closest('#start-game-button')) {
                    ws.socket.send(JSON.stringify({ type: 'start-game' }));
                    setLoading(true);
                }
            });

            elements.joinModal.numpad.addEventListener('click', (e) => {
                const target = e.target.closest('button'); if (!target) return;
                const key = target.dataset.key; const action = target.dataset.action;
                if (key && pinInput.length < 4) { pinInput += key; } 
                else if (action === 'clear') { pinInput = ""; } 
                else if (action === 'confirm' && pinInput.length === 4) {
                    setLoading(true);
                    if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                        ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } }));
                    } else {
                        showToast('Verbindung wird hergestellt... Erneut versuchen.', true);
                        connectWebSocket(); setLoading(false);
                    }
                }
                document.querySelectorAll('#join-pin-display .pin-digit').forEach((d, i) => d.textContent = pinInput[i] || "");
            });
            
            elements.customValueModal.numpad.addEventListener('click', handleCustomNumpad);
            elements.customValueModal.closeBtn.addEventListener('click', () => elements.customValueModal.overlay.classList.add('hidden'));
            elements.customValueModal.numpad.querySelector('[data-action="backspace"]').addEventListener('click', () => { customValueInput = customValueInput.slice(0, -1); updateCustomValueDisplay(); });
            elements.customValueModal.confirmBtn.addEventListener('click', () => {
                if (!customValueInput) return;
                const value = parseInt(customValueInput);
                if (currentCustomType === 'lives') {
                    gameCreationSettings.lives = value;
                    const customBtn = elements.gameTypeScreen.livesPresets.querySelector('[data-value="custom"]');
                    if(customBtn) { customBtn.textContent = value; }
                } else {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: { [currentCustomType.replace('song-count', 'songCount').replace('guess-time', 'guessTime')]: value }}));
                }
                elements.customValueModal.overlay.classList.add('hidden');
            });
            
            elements.playlistSelectModal.search.addEventListener('input', () => renderPaginatedPlaylists(allPlaylists));
            elements.playlistSelectModal.pagination.addEventListener('click', (e) => {
                if (e.target.closest('#next-page')) {
                    renderPaginatedPlaylists(allPlaylists, currentPage + 1);
                } else if (e.target.closest('#prev-page')) {
                    renderPaginatedPlaylists(allPlaylists, currentPage - 1);
                }
            });

            elements.auth.loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.currentTarget); });
            elements.auth.registerForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.currentTarget); });
            elements.auth.showRegister.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm.classList.add('hidden'); elements.auth.registerForm.classList.remove('hidden'); });
            elements.auth.showLogin.addEventListener('click', (e) => { e.preventDefault(); elements.auth.registerForm.classList.add('hidden'); elements.auth.loginForm.classList.remove('hidden'); });
            
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!ws.socket || ws.socket.readyState === WebSocket.CLOSED)) connectWebSocket(); });

            supabase.auth.onAuthStateChange(async (event, session) => {
                const storedGame = localStorage.getItem('fakesterGame');
                if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) {
                    if (!currentUser || currentUser.id !== session.user.id) {
                       await initializeApp(session.user);
                    }
                } else if (event === 'SIGNED_OUT' || (!session && !storedGame)) {
                    currentUser = null;
                    localStorage.removeItem('fakesterGame');
                    screenHistory = ['auth-screen'];
                    showScreen('auth-screen');
                }
                setLoading(false);
            });
        } catch (error) {
            setLoading(false);
            document.body.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><h1>Fehler</h1><p>${error.message}</p></div>`;
        }
    };
    main();
});
