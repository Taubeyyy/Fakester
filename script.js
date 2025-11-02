document.addEventListener('DOMContentLoaded', () => {
    let supabase, currentUser = null, spotifyToken = null, ws = { socket: null };
    let pinInput = "", customValueInput = "", currentCustomType = null;
    let currentConfirmAction = null;

    let userProfile = {};
    let userUnlockedAchievementIds = [];
    let onlineFriends = []; 
    let ownedTitleIds = new Set();
    let ownedIconIds = new Set();
    let ownedBackgroundIds = new Set();
    let ownedColorIds = new Set();
    let ownedAccentColorIds = new Set(); 
    let inventory = {};

    let currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [], players: [], settings: {} };
    let screenHistory = ['auth-screen'];

    let selectedGameMode = null;
    let gameCreationSettings = {
        gameType: null,
        lives: 3,
        guessTypes: [], 
        answerType: 'freestyle',
        guessTime: 30
    };

    let allPlaylists = [], availableDevices = [], currentPage = 1, itemsPerPage = 10;
    let wsPingInterval = null;
    let guessDebounceTimer = null; 
    let reactionCooldown = false; 
    let wsRetryCount = 0;
    
    let pendingGameInvites = {};
    let inviteCooldowns = {};
    let activePopups = {
        invite: null,
        friendRequest: null
    };

    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');
    const closeConsoleBtn = document.getElementById('close-console-btn');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    const copyConsoleBtn = document.getElementById('copy-console-btn');
    const originalConsole = { ...console };
    const formatArg = (arg) => { if (arg instanceof Error) { return `❌ Error: ${arg.message}\nStack:\n${arg.stack || 'No stack trace available'}`; } if (typeof arg === 'object' && arg !== null) { try { return JSON.stringify(arg, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2); } catch (e) { return '[Object (circular structure or stringify failed)]'; } } return String(arg); };
    
    const logToPage = (type, args) => { 
        if (!consoleOutput) return; 
        try { 
            const message = args.map(formatArg).join(' '); 
            const logEntry = document.createElement('div'); 
            logEntry.classList.add(`log-${type}`); 
            logEntry.dataset.rawText = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; 
            
            const prefix = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: `;
            const pre = document.createElement('pre');
            pre.textContent = message; 
            logEntry.append(prefix, pre);
            
            consoleOutput.appendChild(logEntry); 
            consoleOutput.scrollTop = consoleOutput.scrollHeight; 
        } catch (e) { 
            originalConsole.error("Error logging to page console:", e); 
        } 
    };
    
    console.log = (...args) => { originalConsole.log(...args); logToPage('log', args); };
    console.warn = (...args) => { originalConsole.warn(...args); logToPage('warn', args); };
    console.error = (...args) => { originalConsole.error(...args); logToPage('error', args); };
    console.info = (...args) => { originalConsole.info(...args); logToPage('info', args); };
    window.onerror = (message, source, lineno, colno, error) => { const errorArgs = error ? [error] : [message, `at ${source}:${lineno}:${colno}`]; originalConsole.error('Uncaught Error:', ...errorArgs); logToPage('error', ['🚨 Uncaught Error:', ...errorArgs]); return true; };
    window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason)); originalConsole.error('Unhandled Promise Rejection:', reason); logToPage('error', ['🚧 Unhandled Promise Rejection:', reason]); };

    const achievementsList = [ 
        { id: 1, name: 'Erstes Spiel', description: 'Spiele dein erstes Spiel.' }, 
        { id: 2, name: 'Besserwisser', description: 'Beantworte 100 Fragen richtig (gesamt).' }, 
        { id: 3, name: 'Seriensieger', description: 'Gewinne 10 Spiele.' }, 
        { id: 4, name: 'Historiker', description: 'Gewinne eine Timeline-Runde.' }, 
        { id: 5, name: 'Trendsetter', description: 'Gewinne eine Fame-Runde.' }, 
        { id: 6, name: 'Musik-Lexikon', description: 'Beantworte 500 Fragen richtig (gesamt).' }, 
        { id: 7, name: 'Unbesiegbar', description: 'Gewinne 5 Spiele in Folge.' }, 
        { id: 8, name: 'Jahrhundert-Genie', description: 'Errate das Jahr 25 Mal exakt (gesamt).' }, 
        { id: 9, name: 'Spotify-Junkie', description: 'Verbinde dein Spotify-Konto.' }, 
        { id: 10, name: 'Gastgeber', description: 'Hoste dein erstes Spiel.' }, 
        { id: 11, name: 'Party-Löwe', description: 'Spiele mit 3+ Freunden (in einer Lobby).' }, 
        { id: 12, name: 'Knapp Daneben', description: 'Antworte 5 Mal falsch in einem Spiel.' }, 
        { id: 13, name: 'Präzisionsarbeit', description: 'Errate Titel, Künstler UND Jahr exakt in einer Runde (Quiz).'}, 
        { id: 14, name: 'Sozial Vernetzt', description: 'Füge deinen ersten Freund hinzu.' }, 
        { id: 15, name: 'Sammler', description: 'Schalte 5 Titel frei.' }, 
        { id: 16, name: 'Icon-Liebhaber', description: 'Schalte 5 Icons frei.' }, 
        { id: 17, name: 'Aufwärmrunde', description: 'Spiele 3 Spiele.' }, 
        { id: 18, name: 'Highscorer', description: 'Erreiche über 1000 Punkte in einem Spiel.' }, 
        { id: 19, name: 'Perfektionist', description: 'Beantworte alle Fragen in einem Spiel richtig (min. 5 Runden).'}, 
        { id: 20, name: 'Dabei sein ist alles', description: 'Verliere 3 Spiele.'},
        { id: 21, name: 'Shopaholic', description: 'Kaufe deinen ersten Gegenstand im Shop.' },
        { id: 22, name: 'Millionär', description: 'Besitze 1000 Spots auf einmal.' },
        { id: 23, name: 'Level 10', description: 'Erreiche Level 10.' },
        { id: 24, name: 'Anpassungs-Künstler', description: 'Ändere dein Icon, Titel und Farbe.' },
        { id: 25, name: 'Willkommen!', description: 'Registriere dein Konto.' },
        { id: 26, name: 'Host-Flucht', description: 'Überlebe ein Spiel, das der Host abgebrochen hat.' },
        { id: 27, name: 'Schnell-Rater', description: 'Sei der Erste, der in einer Runde auf "Bereit" klickt.' }, 
        { id: 28, name: 'Bling-Bling', description: 'Rüste eine Gold-Namensfarbe aus.' },
        { id: 29, name: 'Gönner', description: 'Verschenke Spots an einen Freund.' },
        { id: 30, name: 'Loyal', description: 'Spiele 50 Spiele.' },
        { id: 31, name: 'Spam-König', description: 'Sende 5 Reaktionen in 15 Sekunden.' },
        { id: 32, name: 'Fashionista', description: 'Ändere deine Akzentfarbe.'},
        { id: 33, name: 'Vollgas', description: 'Beende eine Runde (Quiz) in unter 5 Sekunden.'},
        { id: 34, name: 'Timeline-Anfänger', description: 'Spiele 3 Timeline-Runden.' },
        { id: 35, name: 'Streber', description: 'Gewinne ein Spiel mit über 2000 Punkten.' },
        { id: 36, name: 'Fashion-Show', description: 'Rüste einen Shop-Hintergrund aus.' },
        { id: 37, name: 'Perfektes Timing', description: 'Platziere einen Song in Timeline exakt richtig.' },
        { id: 38, name: 'Quiz-Veteran', description: 'Beantworte 1000 Fragen richtig (gesamt).' },
        { id: 39, name: 'Hattrick', description: 'Gewinne 3 Spiele in Folge.' },
        { id: 40, name: 'Comeback-King', description: 'Gewinne ein Spiel, nachdem du Letzter warst.' },
        { id: 41, name: 'Musik-Historiker', description: 'Gewinne ein Spiel im Timeline-Modus.' },
        { id: 42, name: 'Unaufhaltsam', description: 'Erreiche Level 25.' },
        { id: 43, name: 'Spot-Sparfuchs', description: 'Besitze 5000 Spots auf einmal.' },
        { id: 44, name: 'Gute Gesellschaft', description: 'Nimm eine Einladung eines Freundes an.' },
        { id: 45, name: 'Volles Haus', description: 'Spiele in einer Lobby mit 6+ Spielern.' }
    ];
    const getXpForLevel = (level) => Math.max(0, Math.ceil(Math.pow(level - 1, 1 / 0.7) * 100));
    const getLevelForXp = (xp) => Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / 100, 0.7)) + 1);
    const titlesList = [ 
        { id: 1, name: 'Neuling', unlockType: 'level', unlockValue: 1, type:'title' }, 
        { id: 2, name: 'Anfänger', unlockType: 'level', unlockValue: 2, type:'title' }, 
        { id: 10, name: 'Kenner', unlockType: 'level', unlockValue: 5, type:'title' }, 
        { id: 11, name: 'Experte', unlockType: 'level', unlockValue: 10, type:'title' }, 
        { id: 12, name: 'Meister', unlockType: 'level', unlockValue: 15, type:'title' }, 
        { id: 13, name: 'Virtuose', unlockType: 'level', unlockValue: 20, type:'title' }, 
        { id: 14, name: 'Maestro', unlockType: 'level', unlockValue: 25, type:'title' }, 
        { id: 15, name: 'Großmeister', unlockType: 'level', unlockValue: 30, type:'title' }, 
        { id: 16, name: 'Orakel', unlockType: 'level', unlockValue: 40, type:'title' }, 
        { id: 17, name: 'Musikgott', unlockType: 'level', unlockValue: 50, type:'title' },
        { id: 3, name: 'Besserwisser', unlockType: 'achievement', unlockValue: 2, type:'title' }, 
        { id: 4, name: 'Legende', unlockType: 'achievement', unlockValue: 3, type:'title' }, 
        { id: 5, name: 'Zeitreisender', unlockType: 'achievement', unlockValue: 4, type:'title' }, 
        { id: 6, name: 'Pechvogel', unlockType: 'achievement', unlockValue: 12, type:'title' }, 
        { id: 7, name: 'Präzise', unlockType: 'achievement', unlockValue: 13, type:'title' }, 
        { id: 8, name: 'Gesellig', unlockType: 'achievement', unlockValue: 14, type:'title' }, 
        { id: 9, name: 'Sammler', unlockType: 'achievement', unlockValue: 15, type:'title' }, 
        { id: 18, name: 'Perfektionist', unlockType: 'achievement', unlockValue: 19, type:'title' }, 
        { id: 19, name: 'Highscorer', unlockType: 'achievement', unlockValue: 18, type:'title' }, 
        { id: 20, name: 'Dauerbrenner', unlockType: 'achievement', unlockValue: 17, type:'title' },
        { id: 21, name: 'Shopper', unlockType: 'achievement', unlockValue: 21, type:'title' },
        { id: 25, name: 'Neuzugang', unlockType: 'achievement', unlockValue: 25, type:'title', description: 'Erfolg: Willkommen!' },
        { id: 26, name: 'Überlebender', unlockType: 'achievement', unlockValue: 26, type:'title', description: 'Erfolg: Host-Flucht' },
        { id: 27, name: 'Schnell-Rater', unlockType: 'achievement', unlockValue: 27, type:'title', description: 'Erfolg: Schnell-Rater' },
        { id: 28, name: 'Gönnerhaft', unlockType: 'achievement', unlockValue: 29, type:'title', description: 'Erfolg: Gönner' },
        { id: 29, name: 'Historiker', unlockType: 'achievement', unlockValue: 41, type:'title', description: 'Erfolg: Musik-Historiker' },
        { id: 30, name: 'Veteran', unlockType: 'achievement', unlockValue: 38, type:'title', description: 'Erfolg: Quiz-Veteran' },
        { id: 101, name: 'Musik-Guru', unlockType: 'spots', cost: 100, unlockValue: 100, description: 'Nur im Shop', type:'title' }, 
        { id: 102, name: 'Playlist-Meister', unlockType: 'spots', cost: 150, unlockValue: 150, description: 'Nur im Shop', type:'title' }, 
        { id: 103, name: 'Beat-Dropper', cost: 200, unlockType: 'spots', description: 'Nur im Shop', type:'title' }, 
        { id: 104, name: '80er-Kind', cost: 150, unlockType: 'spots', description: 'Nur im Shop', type:'title' }, 
        { id: 105, name: 'Gold-Kehlchen', cost: 300, unlockType: 'spots', description: 'Nur im Shop', type:'title' }, 
        { id: 106, name: 'Platin', cost: 1000, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 107, name: 'Rockstar', cost: 500, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 108, name: 'Pop-Prinzessin', cost: 500, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 109, name: 'Hip-Hop-Head', cost: 500, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 110, name: 'DJ', cost: 300, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 111, name: 'Oldtimer', cost: 250, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 112, name: 'One-Hit-Wonder', cost: 50, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 113, name: 'Vinyl-Junkie', cost: 400, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 114, name: 'Festivalgänger', cost: 350, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 115, name: 'Audiophil', cost: 600, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 116, name: 'Klassiker', cost: 250, unlockType: 'spots', description: 'Nur im Shop', type:'title' },
        { id: 99, name: 'Entwickler', iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Titel', type:'title' } 
    ];
    const iconsList = [ 
        { id: 1, iconClass: 'fa-user', unlockType: 'level', unlockValue: 1, description: 'Standard-Icon', type:'icon' }, 
        { id: 2, iconClass: 'fa-music', unlockType: 'level', unlockValue: 3, description: 'Erreiche Level 3', type:'icon' }, 
        { id: 3, iconClass: 'fa-star', unlockType: 'level', unlockValue: 7, description: 'Erreiche Level 7', type:'icon' }, 
        { id: 7, iconClass: 'fa-guitar', unlockType: 'level', unlockValue: 12, description: 'Erreiche Level 12', type:'icon' }, 
        { id: 5, iconClass: 'fa-crown', unlockType: 'level', unlockValue: 18, description: 'Erreiche Level 18', type:'icon' }, 
        { id: 8, iconClass: 'fa-bolt', unlockType: 'level', unlockValue: 22, description: 'Erreiche Level 22', type:'icon' }, 
        { id: 9, iconClass: 'fa-record-vinyl', unlockType: 'level', unlockValue: 28, description: 'Erreiche Level 28', type:'icon' }, 
        { id: 10, name: 'Feuer', iconClass: 'fa-fire', unlockType: 'level', unlockValue: 35, description: 'Erreiche Level 35', type:'icon' }, 
        { id: 11, name: 'Geist', iconClass: 'fa-ghost', unlockType: 'level', unlockValue: 42, description: 'Erreiche Level 42', type:'icon' }, 
        { id: 12, name: 'Meteor', iconClass: 'fa-meteor', unlockType: 'level', unlockValue: 50, description: 'Erreiche Level 50', type:'icon' },
        { id: 4, iconClass: 'fa-trophy', unlockType: 'achievement', unlockValue: 3, description: 'Erfolg: Seriensieger', type:'icon' }, 
        { id: 6, iconClass: 'fa-headphones', unlockType: 'achievement', unlockValue: 2, description: 'Erfolg: Besserwisser', type:'icon' }, 
        { id: 13, iconClass: 'fa-icons', unlockType: 'achievement', unlockValue: 16, description: 'Erfolg: Icon-Liebhaber', type:'icon'},
        { id: 14, iconClass: 'fa-handshake', unlockType: 'achievement', unlockValue: 14, description: 'Erfolg: Sozial Vernetzt', type:'icon' },
        { id: 15, iconClass: 'fa-clock', unlockType: 'achievement', unlockValue: 34, description: 'Erfolg: Timeline-Anfänger', type:'icon' },
        { id: 16, iconClass: 'fa-user-astronaut', unlockType: 'achievement', unlockValue: 42, description: 'Erfolg: Unaufhaltsam', type:'icon' },
        { id: 17, iconClass: 'fa-piggy-bank', unlockType: 'achievement', unlockValue: 43, description: 'Erfolg: Spot-Sparfuchs', type:'icon' },
        { id: 201, name: 'Diamant', iconClass: 'fa-diamond', unlockType: 'spots', cost: 250, unlockValue: 250, description: 'Nur im Shop', type:'icon' }, 
        { id: 202, name: 'Zauberhut', iconClass: 'fa-hat-wizard', unlockType: 'spots', cost: 300, unlockValue: 300, description: 'Nur im Shop', type:'icon' }, 
        { id: 203, type: 'icon', name: 'Raumschiff', iconClass: 'fa-rocket', cost: 400, unlockType: 'spots', description: 'Nur im Shop', type:'icon' }, 
        { id: 204, type: 'icon', name: 'Bombe', iconClass: 'fa-bomb', cost: 350, unlockType: 'spots', description: 'Nur im Shop', type:'icon' }, 
        { id: 205, type: 'icon', name: 'Ninja', iconClass: 'fa-user-secret', cost: 500, unlockType: 'spots', description: 'Nur im Shop', type:'icon' }, 
        { id: 206, type: 'icon', name: 'Drache', iconClass: 'fa-dragon', cost: 750, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 207, type: 'icon', name: 'Anker', iconClass: 'fa-anchor', cost: 200, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 208, type: 'icon', name: 'Kaffeetasse', iconClass: 'fa-coffee', cost: 150, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 209, type: 'icon', name: 'Mond', iconClass: 'fa-moon', cost: 300, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 210, type: 'icon', name: 'Sonne', iconClass: 'fa-sun', cost: 300, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 211, type: 'icon', name: 'Herz', iconClass: 'fa-heart', cost: 100, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 212, type: 'icon', name: 'Pflanze', iconClass: 'fa-leaf', cost: 150, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 213, type: 'icon', name: 'Saturn', iconClass: 'fa-satellite', cost: 450, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 214, type: 'icon', name: 'Kamera', iconClass: 'fa-camera-retro', cost: 300, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 215, type: 'icon', name: 'Schneeflocke', iconClass: 'fa-snowflake', cost: 350, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 216, type: 'icon', name: 'Maske', iconClass: 'fa-masks-theater', cost: 400, unlockType: 'spots', description: 'Nur im Shop', type:'icon' },
        { id: 99, iconClass: 'fa-bug', unlockType: 'special', unlockValue: 'Taubey', description: 'Entwickler-Icon', type:'icon' } 
    ];
    const backgroundsList = [ 
        { id: 'default', name: 'Standard', cssClass: 'radial-only', cost: 0, unlockType: 'free', type: 'background', backgroundId: 'default'}, 
        { id: '301', name: 'Synthwave', cssClass: 'bg-synthwave', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '301'}, 
        { id: '302', name: 'Konzertbühne', cssClass: 'bg-concert', cost: 600, unlockType: 'spots', unlockValue: 600, type: 'background', backgroundId: '302'}, 
        { id: '303', name: 'Plattenladen', cssClass: 'bg-vinyl', cost: 700, unlockType: 'spots', unlockValue: 700, type: 'background', backgroundId: '303'},
        { id: '304', name: 'Sonnenuntergang', cssClass: 'bg-sunset', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '304'},
        { id: '305', name: 'Ozean', cssClass: 'bg-ocean', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '305'},
        { id: '306', name: 'Wald', cssClass: 'bg-forest', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '306'},
        { id: '307', name: 'Sternenhimmel', cssClass: 'bg-stars', cost: 750, unlockType: 'spots', unlockValue: 750, type: 'background', backgroundId: '307'},
        { id: '308', name: 'Retro-Rot', cssClass: 'bg-retro', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '308'},
        { id: '309', name: 'Studio', cssClass: 'bg-studio', cost: 600, unlockType: 'spots', unlockValue: 600, type: 'background', backgroundId: '309'},
        { id: '310', name: 'Party', cssClass: 'bg-party', cost: 1000, unlockType: 'spots', unlockValue: 1000, type: 'background', backgroundId: '310'},
        { id: '311', name: 'Aurora', cssClass: 'bg-aurora', cost: 1200, unlockType: 'spots', unlockValue: 1200, type: 'background', backgroundId: '311'},
        { id: '312', name: 'Comic', cssClass: 'bg-comic', cost: 800, unlockType: 'spots', unlockValue: 800, type: 'background', backgroundId: '312'},
        { id: '313', name: 'Matrix', cssClass: 'bg-matrix', cost: 1500, unlockType: 'spots', unlockValue: 1500, type: 'background', backgroundId: '313'},
        { id: '314', name: 'Nebula', cssClass: 'bg-nebula', cost: 1500, unlockType: 'spots', unlockValue: 1500, type: 'background', backgroundId: '314'},
        { id: '315', name: 'Schaltkreis', cssClass: 'bg-circuit', cost: 1000, unlockType: 'spots', unlockValue: 1000, type: 'background', backgroundId: '315'},
        { id: '316', name: 'Lava', cssClass: 'bg-lava', cost: 800, unlockType: 'spots', unlockValue: 800, type: 'background', backgroundId: '316'},
        { id: '317', name: 'Eis', cssClass: 'bg-ice', cost: 800, unlockType: 'spots', unlockValue: 800, type: 'background', backgroundId: '317'},
        { id: '318', name: 'Wüste', cssClass: 'bg-desert', cost: 600, unlockType: 'spots', unlockValue: 600, type: 'background', backgroundId: '318'},
        { id: '319', name: 'Metall', cssClass: 'bg-metal', cost: 900, unlockType: 'spots', unlockValue: 900, type: 'background', backgroundId: '319'},
        { id: '320', name: 'Holz', cssClass: 'bg-wood', cost: 500, unlockType: 'spots', unlockValue: 500, type: 'background', backgroundId: '320'}
    ];
    const nameColorsList = [ 
        { id: 501, name: 'Giftgrün', type: 'color', colorHex: '#00FF00', cost: 750, unlockType: 'spots', description: 'Ein knalliges Grün.' }, 
        { id: 502, name: 'Leuchtend Pink', type: 'color', colorHex: '#FF00FF', cost: 750, unlockType: 'spots', description: 'Ein echter Hingucker.' }, 
        { id: 503, name: 'Gold', type: 'color', colorHex: '#FFD700', cost: 1500, unlockType: 'spots', description: 'Zeig deinen Status.' }, 
        { id: 504, name: 'Cyber-Blau', type: 'color', colorHex: '#00FFFF', cost: 1000, unlockType: 'spots', description: 'Neon-Look.' },
        { id: 505, name: 'Blutrot', type: 'color', colorHex: '#DC143C', cost: 750, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 506, name: 'Sonnengelb', type: 'color', colorHex: '#FFC700', cost: 750, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 507, name: 'Himmelblau', type: 'color', colorHex: '#87CEEB', cost: 500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 508, name: 'Lavendel', type: 'color', colorHex: '#E6E6FA', cost: 500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 509, name: 'Königs-Lila', type: 'color', colorHex: '#8a2be2', cost: 750, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 510, name: 'Schneeweiß', type: 'color', colorHex: '#FFFFFF', cost: 1000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 511, name: 'Tiefschwarz', type: 'color', colorHex: '#010101', cost: 1000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 512, name: 'Feuriges Orange', type: 'color', colorHex: '#ff4500', cost: 750, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 550, name: 'Regenbogen', type: 'color', colorHex: 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)', cost: 5000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 551, name: 'Synthwave-Verlauf', type: 'color', colorHex: 'linear-gradient(90deg, #ff00ff, #00ffff)', cost: 2500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 552, name: 'Sonnen-Verlauf', type: 'color', colorHex: 'linear-gradient(90deg, #ff7e5f, #feb47b)', cost: 2500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 553, name: 'Ozean-Verlauf', type: 'color', colorHex: 'linear-gradient(90deg, #005c97, #363795)', cost: 2500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 554, name: 'Wald-Verlauf', type: 'color', colorHex: 'linear-gradient(90deg, #136a8a, #267871)', cost: 2500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 555, name: 'Feuer-Verlauf', type: 'color', colorHex: 'linear-gradient(90deg, #ff4500, #ffd700)', cost: 3000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 556, name: 'Kaugummi', type: 'color', colorHex: 'linear-gradient(90deg, #ff7eb9, #a0c2ff)', cost: 2000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 557, name: 'Gift-Verlauf', type: 'color', colorHex: 'linear-gradient(90deg, #00ff00, #8a2be2)', cost: 3000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 558, name: 'Dunkel-Verlauf', type: 'color', colorHex: 'linear-gradient(90deg, #434343, #000000)', cost: 1500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 559, name: 'Heller Verlauf', type: 'color', colorHex: 'linear-gradient(90deg, #e0e0e0, #ffffff)', cost: 1500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 560, name: 'Metallisch', type: 'color', colorHex: 'linear-gradient(90deg, #808080, #c0c0c0, #808080)', cost: 4000, unlockType: 'spots', description: 'Nur im Shop' }
    ];
    const accentColorsList = [
        { id: 1, name: 'Fakester Grün', type: 'accent-color', colorHex: '#1DB954', unlockType: 'free', description: 'Standardfarbe' },
        { id: 2, name: 'Spotify Grün', type: 'accent-color', colorHex: '#1ED760', unlockType: 'achievement', unlockValue: 9, description: 'Erfolg: Spotify-Junkie' },
        { id: 3, name: 'Ozeanblau', type: 'accent-color', colorHex: '#0077be', unlockType: 'level', unlockValue: 4, description: 'Erreiche Level 4' },
        { id: 4, name: 'Königs-Lila', type: 'accent-color', colorHex: '#8a2be2', unlockType: 'level', unlockValue: 8, description: 'Erreiche Level 8' },
        { id: 5, name: 'Rubinrot', type: 'accent-color', colorHex: '#e01e5a', unlockType: 'level', unlockValue: 14, description: 'Erreiche Level 14' },
        { id: 6, name: 'Sonnengelb', type: 'accent-color', colorHex: '#ffc700', unlockType: 'level', unlockValue: 26, description: 'Erreiche Level 26' },
        { id: 7, name: 'Platin', type: 'accent-color', colorHex: '#e5e4e2', unlockType: 'level', unlockValue: 48, description: 'Erreiche Level 48' },
        { id: 8, name: 'Fashion-Pink', type: 'accent-color', colorHex: '#FF69B4', unlockType: 'achievement', unlockValue: 36, description: 'Erfolg: Fashion-Show' },
        { id: 601, name: 'Dynamisches Pink', type: 'accent-color', colorHex: '#FF00FF', cost: 500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 602, name: 'Dynamisches Blau', type: 'accent-color', colorHex: '#00FFFF', cost: 500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 603, name: 'Feuriges Orange', type: 'accent-color', colorHex: '#ff4500', cost: 500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 604, name: 'Reines Gold', type: 'accent-color', colorHex: '#FFD700', cost: 2000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 605, name: 'Regenbogen', type: 'accent-color', colorHex: 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)', cost: 5000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 606, name: 'Synthwave-Verlauf', type: 'accent-color', colorHex: 'linear-gradient(90deg, #ff00ff, #00ffff)', cost: 2500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 607, name: 'Sonnen-Verlauf', type: 'accent-color', colorHex: 'linear-gradient(90deg, #ff7e5f, #feb47b)', cost: 2500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 608, name: 'Matrix-Grün', type: 'accent-color', colorHex: '#39FF14', cost: 1000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 609, name: 'Blutmond', type: 'accent-color', colorHex: '#FF4500', cost: 1000, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 610, name: 'Geist-Weiß', type: 'accent-color', colorHex: '#F8F8FF', cost: 1500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 611, name: 'Dunkle Materie', type: 'accent-color', colorHex: '#010101', cost: 1500, unlockType: 'spots', description: 'Nur im Shop' },
        { id: 612, name: 'Lava-Verlauf', type: 'accent-color', colorHex: 'linear-gradient(90deg, #f7b733, #fc4a1a)', cost: 2500, unlockType: 'spots', description: 'Nur im Shop' }
    ];
    
    const allItems = [...titlesList, ...iconsList, ...backgroundsList, ...nameColorsList, ...accentColorsList];
    window.titlesList = titlesList; window.iconsList = iconsList; window.backgroundsList = backgroundsList; window.nameColorsList = nameColorsList; window.accentColorsList = accentColorsList; window.allItems = allItems;
    const PLACEHOLDER_ICON = `<div class="placeholder-icon"><i class="fa-solid fa-question"></i></div>`;

    const elements = { 
        screens: document.querySelectorAll('.screen'), 
        leaveGameButton: document.getElementById('leave-game-button'), 
        loadingOverlay: document.getElementById('loading-overlay'), 
        loadingOverlayMessage: document.getElementById('loading-overlay-message'),
        countdownOverlay: document.getElementById('countdown-overlay'), 
        appBackground: document.querySelector('.app-background'), 
        auth: { loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'), showRegister: document.getElementById('show-register-form'), showLogin: document.getElementById('show-login-form') }, 
        home: { logoutBtn: document.getElementById('corner-logout-button'), achievementsBtn: document.getElementById('achievements-button'), createRoomBtn: document.getElementById('show-create-button-action'), joinRoomBtn: document.getElementById('show-join-button'), usernameContainer: document.getElementById('username-container'), profileTitleBtn: document.querySelector('.profile-title-button'), friendsBtn: document.getElementById('friends-button'), statsBtn: document.getElementById('stats-button'), profilePictureBtn: document.getElementById('profile-picture-button'), profileIcon: document.getElementById('profile-icon'), profileLevel: document.getElementById('profile-level'), profileXpFill: document.getElementById('profile-xp-fill'), levelProgressBtn: document.getElementById('level-progress-button'), profileXpText: document.getElementById('profile-xp-text'), spotsBalance: document.getElementById('header-spots-balance'), shopButton: document.getElementById('shop-button'), spotifyConnectBtn: document.getElementById('spotify-connect-button'), customizationBtn: document.getElementById('customization-button') }, 
        modeSelection: { container: document.getElementById('mode-selection-screen')?.querySelector('.mode-selection-container') }, 
        lobby: { 
            pinDisplay: document.getElementById('lobby-pin'), 
            playerList: document.getElementById('player-list'), 
            hostSettings: document.getElementById('host-settings'), 
            guestWaitingMessage: document.getElementById('guest-waiting-message'), 
            deviceSelectBtn: document.getElementById('device-select-button'), 
            playlistSelectBtn: document.getElementById('playlist-select-button'), 
            startGameBtn: document.getElementById('start-game-button'), 
            inviteFriendsBtn: document.getElementById('invite-friends-button'), 
            songCountPresets: document.getElementById('song-count-presets'), 
            guessTimePresets: document.getElementById('guess-time-presets'), 
            backgroundSelectButton: null, 
        }, 
        game: { 
            round: document.getElementById('current-round'), 
            totalRounds: document.getElementById('total-rounds'), 
            timerBar: document.getElementById('timer-bar'), 
            gameContentArea: document.getElementById('game-content-area'), 
            playerList: document.getElementById('game-player-list'),
            reactionButtons: document.getElementById('reaction-buttons') 
        }, 
        guestModal: { overlay: document.getElementById('guest-modal-overlay'), closeBtn: document.getElementById('close-guest-modal-button'), submitBtn: document.getElementById('guest-nickname-submit'), openBtn: document.getElementById('guest-mode-button'), input: document.getElementById('guest-nickname-input') }, 
        joinModal: { overlay: document.getElementById('join-modal-overlay'), closeBtn: document.getElementById('close-join-modal-button'), pinDisplay: document.querySelectorAll('#join-pin-display .pin-digit'), numpad: document.querySelector('#numpad-join'), }, 
        friendsModal: { overlay: document.getElementById('friends-modal-overlay'), closeBtn: document.getElementById('close-friends-modal-button'), addFriendInput: document.getElementById('add-friend-input'), addFriendBtn: document.getElementById('add-friend-button'), friendsList: document.getElementById('friends-list'), requestsList: document.getElementById('requests-list'), requestsCount: document.getElementById('requests-count'), tabsContainer: document.querySelector('.friends-modal .tabs'), tabs: document.querySelectorAll('.friends-modal .tab-button'), tabContents: document.querySelectorAll('.friends-modal .tab-content') }, 
        inviteFriendsModal: { overlay: document.getElementById('invite-friends-modal-overlay'), closeBtn: document.getElementById('close-invite-modal-button'), list: document.getElementById('online-friends-list') }, 
        giftModal: { overlay: document.getElementById('gift-modal-overlay'), closeBtn: document.getElementById('close-gift-modal-button'), recipientName: document.getElementById('gift-recipient-name'), spotsAmount: document.getElementById('gift-spots-amount'), sendBtn: document.getElementById('gift-send-button') },
        customValueModal: { overlay: document.getElementById('custom-value-modal-overlay'), closeBtn: document.getElementById('close-custom-value-modal-button'), title: document.getElementById('custom-value-title'), display: document.querySelectorAll('#custom-value-display .pin-digit'), numpad: document.querySelector('#numpad-custom-value'), confirmBtn: document.getElementById('confirm-custom-value-button')}, 
        achievements: { grid: document.getElementById('achievement-grid'), screen: document.getElementById('achievements-screen') }, 
        levelProgress: { list: document.getElementById('level-progress-list'), screen: document.getElementById('level-progress-screen') }, 
        titles: { list: document.getElementById('title-list'), screen: document.getElementById('title-selection-screen') }, 
        icons: { list: document.getElementById('icon-list'), screen: document.getElementById('icon-selection-screen') }, 
        gameTypeScreen: { 
            screen: document.getElementById('game-type-selection-screen'), 
            pointsBtn: document.getElementById('game-type-points'), 
            livesBtn: document.getElementById('game-type-lives'), 
            livesSettings: document.getElementById('lives-settings-container'), 
            livesPresets: document.getElementById('lives-count-presets'), 
            createLobbyBtn: document.getElementById('create-lobby-button'),
            quizSettingsContainer: document.getElementById('quiz-settings-container'), 
            guessTypesCheckboxes: document.querySelectorAll('#guess-types-setting input[type="checkbox"]'), 
            guessTypesError: document.getElementById('guess-types-error'), 
            answerTypePresets: document.getElementById('answer-type-presets') 
        }, 
        changeNameModal: { overlay: document.getElementById('change-name-modal-overlay'), closeBtn: document.getElementById('close-change-name-modal-button'), submitBtn: document.getElementById('change-name-submit'), input: document.getElementById('change-name-input'), }, 
        deviceSelectModal: { overlay: document.getElementById('device-select-modal-overlay'), closeBtn: document.getElementById('close-device-select-modal'), list: document.getElementById('device-list'), refreshBtn: document.getElementById('refresh-devices-button-modal'), }, 
        playlistSelectModal: { overlay: document.getElementById('playlist-select-modal-overlay'), closeBtn: document.getElementById('close-playlist-select-modal'), list: document.getElementById('playlist-list'), search: document.getElementById('playlist-search'), pagination: document.getElementById('playlist-pagination'), }, 
        leaveConfirmModal: { overlay: document.getElementById('leave-confirm-modal-overlay'), confirmBtn: document.getElementById('confirm-leave-button'), cancelBtn: document.getElementById('cancel-leave-button'), }, 
        confirmActionModal: { overlay: document.getElementById('confirm-action-modal-overlay'), title: document.getElementById('confirm-action-title'), text: document.getElementById('confirm-action-text'), confirmBtn: document.getElementById('confirm-action-confirm-button'), cancelBtn: document.getElementById('confirm-action-cancel-button'), }, 
        stats: { screen: document.getElementById('stats-screen'), gamesPlayed: document.getElementById('stat-games-played'), wins: document.getElementById('stat-wins'), winrate: document.getElementById('stat-winrate'), highscore: document.getElementById('stat-highscore'), correctAnswers: document.getElementById('stat-correct-answers'), avgScore: document.getElementById('stat-avg-score'), gamesPlayedPreview: document.getElementById('stat-games-played-preview'), winsPreview: document.getElementById('stat-wins-preview'), correctAnswersPreview: document.getElementById('stat-correct-answers-preview'), }, 
        shop: { screen: document.getElementById('shop-screen'), titlesList: document.getElementById('shop-titles-list'), iconsList: document.getElementById('shop-icons-list'), backgroundsList: document.getElementById('shop-backgrounds-list'), colorsList: document.getElementById('shop-colors-list'), spotsBalance: document.getElementById('shop-spots-balance'), }, 
        customize: { 
            screen: document.getElementById('customization-screen'), 
            tabsContainer: document.getElementById('customization-tabs'), 
            tabContents: document.querySelectorAll('#customization-screen .tab-content'), 
            titlesList: document.getElementById('customize-title-list'), 
            iconsList: document.getElementById('customize-icon-list'), 
            colorsList: document.getElementById('customize-color-list'),
            backgroundsList: document.getElementById('owned-backgrounds-list'),
            accentColorsList: document.getElementById('customize-accent-color-list') 
        }, 
        popups: {
            container: document.getElementById('popup-overlay-container'),
            invite: null,
            friendRequest: null
        },
        endScreen: {
            screen: document.getElementById('end-screen'),
            leaderboard: document.getElementById('end-screen-leaderboard'),
            xp: document.getElementById('end-screen-xp'),
            spots: document.getElementById('end-screen-spots'),
            backButton: document.getElementById('end-screen-back-button')
        }
    };


    const showToast = (message, isError = false) => {
        if (typeof iziToast === 'undefined') {
            console.error("iziToast ist nicht geladen!");
            alert(`[${isError ? 'FEHLER' : 'INFO'}]\n${message}`);
            return;
        }
        
        console.log(`Toast: ${message} (Error: ${isError})`);
        
        iziToast.show({
            message: message,
            position: 'topCenter', 
            timeout: 3000,
            progressBarColor: isError ? 'var(--danger-color)' : 'var(--accent-color)',
            theme: 'dark',
            layout: 1,
            displayMode: 'replace',
            backgroundColor: 'var(--dark-grey)',
            messageColor: 'var(--text-color)',
            icon: isError ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-check',
            iconColor: isError ? 'var(--danger-color)' : 'var(--accent-color)',
        });
    }

    const showScreen = (screenId) => { console.log(`Navigating to screen: ${screenId}`); const targetScreen = document.getElementById(screenId); if (!targetScreen) { console.error(`Screen with ID "${screenId}" not found!`); return; } const currentScreenId = screenHistory[screenHistory.length - 1]; if (screenId !== currentScreenId) screenHistory.push(screenId); elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen', 'end-screen'].includes(screenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); };
    const goBack = () => { if (screenHistory.length > 1) { const currentScreenId = screenHistory.pop(); const previousScreenId = screenHistory[screenHistory.length - 1]; console.log(`Navigating back to screen: ${previousScreenId}`); if (['game-screen', 'lobby-screen'].includes(currentScreenId)) { elements.leaveConfirmModal.overlay.classList.remove('hidden'); screenHistory.push(currentScreenId); return; } const targetScreen = document.getElementById(previousScreenId); if (!targetScreen) { console.error(`Back navigation failed: Screen "${previousScreenId}" not found!`); screenHistory = ['auth-screen']; window.location.reload(); return; } elements.screens.forEach(s => s.classList.remove('active')); targetScreen.classList.add('active'); const showLeaveButton = !['auth-screen', 'home-screen', 'end-screen'].includes(previousScreenId); elements.leaveGameButton.classList.toggle('hidden', !showLeaveButton); } };
    
    const setLoading = (isLoading, message = null) => {
        console.log(`Setting loading overlay: ${isLoading}, Message: ${message}`);
        const overlay = elements.loadingOverlay;
        const overlayMessage = elements.loadingOverlayMessage;

        if (isLoading) {
            if (overlayMessage) {
                overlayMessage.textContent = message || '';
            }
            if (overlay) {
                overlay.classList.remove('hidden');
            }
            elements.countdownOverlay?.classList.add('hidden');
        } else {
            if (overlay) {
                overlay.classList.add('hidden');
            }
            if (overlayMessage) {
                overlayMessage.textContent = '';
            }
        }
    }

    const showConfirmModal = (title, text, onConfirm) => { 
        elements.confirmActionModal.title.textContent = title; 
        elements.confirmActionModal.text.textContent = text; 
        currentConfirmAction = onConfirm; 
        elements.confirmActionModal.overlay.classList.remove('hidden'); 
    };

    function isItemUnlocked(item, currentLevel) { 
        if (!item || !currentUser ) return false; 
        if (!currentUser.isGuest && currentUser.username.toLowerCase() === 'taubey') return true; 
        
        if (item.unlockType === 'spots') { 
            if (currentUser.isGuest) return false; 
            if (item.type === 'title') return ownedTitleIds.has(item.id); 
            if (item.type === 'icon') return ownedIconIds.has(item.id); 
            if (item.type === 'background') return ownedBackgroundIds.has(item.backgroundId); 
            if (item.type === 'color') return ownedColorIds.has(item.id);
            if (item.type === 'accent-color') return ownedAccentColorIds.has(item.id); 
        } 
        
        switch (item.unlockType) { 
            case 'level': return currentLevel >= item.unlockValue; 
            case 'achievement': return userUnlockedAchievementIds.includes(item.unlockValue); 
            case 'special': return !currentUser.isGuest && currentUser.username.toLowerCase() === item.unlockValue.toLowerCase(); 
            case 'free': return true; 
            default: return false; 
        } 
    }
    function getUnlockDescription(item) { if (!item) return ''; if (item.unlockType === 'spots') return `Kosten: ${item.cost} 🎵`; switch (item.unlockType) { case 'level': return `Erreiche Level ${item.unlockValue}`; case 'achievement': const ach = achievementsList.find(a => a.id === item.unlockValue); return `Erfolg: ${ach ? ach.name : 'Unbekannt'}`; case 'special': return 'Spezial'; case 'free': return 'Standard'; default: return ''; } }
    function updateSpotsDisplay() { const spots = userProfile?.spots ?? 0; if (elements.home.spotsBalance) elements.home.spotsBalance.textContent = spots; if (elements.shop.spotsBalance) elements.shop.spotsBalance.textContent = spots; }


    async function equipTitle(titleId, saveToDb = true) {
        if (currentUser.isGuest) return;
        const title = titlesList.find(t => t.id === titleId);
        if (!title) return;
        
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        if (!isItemUnlocked(title, currentLevel)) {
            showToast("Du hast diesen Titel noch nicht freigeschaltet.", true);
            return;
        }

        userProfile.equipped_title_id = titleId;
        if (elements.home.profileTitleBtn) {
            elements.home.profileTitleBtn.querySelector('span').textContent = title.name; 
        }
        renderTitles(); 
        renderCustomTitles(); 

        if (saveToDb && supabase) {
            const { error } = await supabase.from('profiles').update({ equipped_title_id: titleId }).eq('id', currentUser.id);
            if (error) {
                showToast("Fehler beim Speichern des Titels.", true);
            } else {
                showToast(`Titel "${title.name}" ausgerüstet!`, false);
            }
        }
    }

    async function equipIcon(iconId, saveToDb = true) {
        if (currentUser.isGuest) return;
        const icon = iconsList.find(i => i.id === iconId);
        if (!icon) return;

        const currentLevel = getLevelForXp(userProfile.xp || 0);
        if (!isItemUnlocked(icon, currentLevel)) {
            showToast("Du hast dieses Icon noch nicht freigeschaltet.", true);
            return;
        }

        userProfile.equipped_icon_id = iconId;
        if (elements.home.profileIcon) {
            elements.home.profileIcon.className = `fa-solid ${icon.iconClass}`;
        }
        renderIcons(); 
        renderCustomIcons(); 

        if (saveToDb && supabase) {
            const { error } = await supabase.from('profiles').update({ equipped_icon_id: iconId }).eq('id', currentUser.id);
            if (error) {
                showToast("Fehler beim Speichern des Icons.", true);
            } else {
                showToast(`Icon ausgerüstet!`, false);
            }
        }
    }
    
    async function equipColor(colorId, saveToDb = true) {
        if (currentUser.isGuest) return;
        
        const nicknameEl = document.getElementById('welcome-nickname');
        if (!nicknameEl) {
            console.error("Konnte #welcome-nickname nicht finden!");
            return;
        }

        if (!colorId) {
            userProfile.equipped_color_id = null;
            nicknameEl.style.color = '';
            nicknameEl.style.background = '';
            nicknameEl.classList.remove('gradient-text');
            
            renderCustomColors();
            if (saveToDb && supabase) {
                const { error } = await supabase.from('profiles').update({ equipped_color_id: null }).eq('id', currentUser.id);
                if (error) {
                    console.error("Fehler beim Abwählen der Farbe:", error);
                    showToast("Fehler beim Speichern der Farbe.", true);
                }
            }
            return;
        }

        const color = nameColorsList.find(c => c.id === colorId);
        if (!color) return;

        const currentLevel = getLevelForXp(userProfile.xp || 0);
        if (!isItemUnlocked(color, currentLevel)) {
            showToast("Du hast diese Farbe noch nicht freigeschaltet.", true);
            return;
        }

        userProfile.equipped_color_id = colorId;
        
        if (color.colorHex.includes('gradient')) {
            nicknameEl.style.color = '';
            nicknameEl.style.background = color.colorHex;
            nicknameEl.classList.add('gradient-text');
        } else {
            nicknameEl.style.background = '';
            nicknameEl.classList.remove('gradient-text');
            nicknameEl.style.color = color.colorHex;
        }
        
        renderCustomColors(); 

        if (saveToDb && supabase) {
            const { error } = await supabase.from('profiles').update({ equipped_color_id: colorId }).eq('id', currentUser.id);
            if (error) {
                console.error("Fehler beim Speichern der Farbe:", error);
                showToast("Fehler beim Speichern der Farbe.", true);
            } else {
                showToast(`Farbe "${color.name}" ausgerüstet!`, false);
            }
        }
    }

    async function equipAccentColor(colorId, saveToDb = true) {
        if (currentUser.isGuest) return;
        
        const color = accentColorsList.find(c => c.id === colorId);
        if (!color) return;

        const currentLevel = getLevelForXp(userProfile.xp || 0);
        if (!isItemUnlocked(color, currentLevel)) {
            showToast("Du hast diese Akzentfarbe noch nicht freigeschaltet.", true);
            return;
        }

        userProfile.equipped_accent_color_id = colorId;
        
        document.documentElement.style.setProperty('--accent-color', color.colorHex);
        
        const isGradient = color.colorHex.includes('linear-gradient');
        
        if (isGradient) {
             document.documentElement.style.setProperty('--accent-color-faded', color.colorHex.replace('linear-gradient(90deg, ', 'linear-gradient(90deg, #ffffff20, '));
        } else {
             document.documentElement.style.setProperty('--accent-color-faded', color.colorHex + '20');
        }

        document.querySelectorAll('.stat-value').forEach(el => {
            el.classList.toggle('gradient-text', isGradient);
            if (isGradient) {
                el.style.background = color.colorHex;
            } else {
                el.style.background = '';
            }
        });

        renderCustomAccentColors(); 

        if (saveToDb && supabase) {
            const { error } = await supabase.from('profiles').update({ equipped_accent_color_id: colorId }).eq('id', currentUser.id);
            if (error) {
                console.error("Fehler beim Speichern der Akzentfarbe:", error);
                showToast("Fehler beim Speichern der Akzentfarbe.", true);
            } else {
                showToast(`Akzentfarbe "${color.name}" ausgerüstet!`, false);
            }
        }
    }
    
    async function equipBackground(backgroundId, saveToDb = true) {
        if (currentUser.isGuest) return;
        
        const background = backgroundsList.find(b => b.backgroundId === backgroundId);
        if (!background) return;

        const currentLevel = getLevelForXp(userProfile.xp || 0);
        if (!isItemUnlocked(background, currentLevel)) {
            showToast("Du hast diesen Hintergrund noch nicht freigeschaltet.", true);
            return;
        }

        userProfile.equipped_background_id = backgroundId;
        applyBackground(backgroundId); 
        renderCustomBackgrounds(); 

        if (saveToDb && supabase) {
            const { error } = await supabase.from('profiles').update({ equipped_background_id: backgroundId }).eq('id', currentUser.id);
            if (error) {
                console.error("Fehler beim Speichern des Hintergrunds:", error);
                showToast("Fehler beim Speichern des Hintergrunds.", true);
            } else {
                showToast(`Hintergrund "${background.name}" ausgerüstet!`, false);
            }
        }
    }

    function applyBackground(backgroundId) {
        const bg = backgroundsList.find(b => b.backgroundId === backgroundId) || backgroundsList[0];
        
        if (elements.appBackground) {
            elements.appBackground.className = 'app-background';
            elements.appBackground.classList.add(bg.cssClass || 'radial-only');
        }
    }

    const initializeApp = (user, isGuest = false) => { 
        console.log(`initializeApp called for user: ${user.username || user.id}, isGuest: ${isGuest}`); 
        localStorage.removeItem('fakesterGame'); 
        const fallbackUsername = isGuest ? user.username : user.user_metadata?.username || user.email?.split('@')[0] || 'Unbekannt'; 
        
        const fallbackProfile = { id: user.id, username: fallbackUsername, xp: 0, games_played: 0, wins: 0, correct_answers: 0, highscore: 0, spots: 0, equipped_title_id: 1, equipped_icon_id: 1, equipped_color_id: null, equipped_background_id: 'default', equipped_accent_color_id: 1 }; 
        
        if (isGuest) { 
            currentUser = { id: 'guest-' + Date.now(), username: user.username, isGuest }; 
            userProfile = { ...fallbackProfile, id: currentUser.id, username: currentUser.username }; 
            userUnlockedAchievementIds = []; 
            ownedTitleIds.clear(); 
            ownedIconIds.clear(); 
            ownedBackgroundIds.clear(); 
            ownedColorIds.clear();
            ownedAccentColorIds.clear();
            inventory = {}; 
        } else { 
            currentUser = { id: user.id, username: fallbackUsername, isGuest }; 
            userProfile = { ...fallbackProfile, id: user.id, username: currentUser.username }; 
            userUnlockedAchievementIds = []; 
            ownedTitleIds.clear(); 
            ownedIconIds.clear(); 
            ownedBackgroundIds.clear(); 
            ownedColorIds.clear();
            ownedAccentColorIds.clear();
            inventory = {}; 
        } 
        
        console.log("Setting up initial UI with fallback data..."); 
        document.body.classList.toggle('is-guest', isGuest); 
        
        if (!isGuest && currentUser.username.toLowerCase() === 'taubey') {
            if (toggleConsoleBtn) toggleConsoleBtn.classList.remove('hidden');
        }

        if(document.getElementById('welcome-nickname')) document.getElementById('welcome-nickname').textContent = currentUser.username; 
        if(document.getElementById('profile-title')) equipTitle(userProfile.equipped_title_id || 1, false); 
        if(elements.home.profileIcon) equipIcon(userProfile.equipped_icon_id || 1, false);
        equipColor(userProfile.equipped_color_id, false);
        equipAccentColor(userProfile.equipped_accent_color_id || 1, false);
        applyBackground(userProfile.equipped_background_id || 'default');
        if(elements.home.profileLevel) updatePlayerProgressDisplay(); 
        if(elements.stats.gamesPlayed) updateStatsDisplay(); 
        updateSpotsDisplay(); 
        if(elements.achievements.grid) renderAchievements(); 
        if(elements.titles.list) renderTitles(); 
        if(elements.icons.list) renderIcons(); 
        if(elements.levelProgress.list) renderLevelProgress(); 
        console.log("Showing home screen (non-blocking)..."); 
        showScreen('home-screen'); 
        setLoading(false); 
        
        if (!isGuest && supabase) { 
            console.log("Fetching profile, owned items, achievements, and Spotify status in background..."); 
            Promise.all([ 
                supabase.from('profiles').select('*').eq('id', user.id).single(), 
                supabase.from('user_owned_titles').select('title_id').eq('user_id', user.id), 
                supabase.from('user_owned_icons').select('icon_id').eq('user_id', user.id), 
                supabase.from('user_owned_backgrounds').select('background_id').eq('user_id', user.id),
                supabase.from('user_owned_colors').select('color_id').eq('user_id', user.id),
                supabase.from('user_owned_accent_colors').select('accent_color_id').eq('user_id', user.id), 
                supabase.from('user_inventory').select('item_id, quantity').eq('user_id', user.id) 
            ]).then((results) => { 
                const [profileResult, titlesResult, iconsResult, backgroundsResult, colorsResult, accentColorsResult, inventoryResult] = results; 
                if (profileResult.error || !profileResult.data) { 
                    console.error("BG Profile Error:", profileResult.error || "No data"); 
                    if (!profileResult.error?.details?.includes("0 rows")) showToast("Fehler beim Laden des Profils.", true); 
                    document.getElementById('welcome-nickname').textContent = currentUser.username; 
                    updatePlayerProgressDisplay(); 
                    updateStatsDisplay(); 
                    updateSpotsDisplay(); 
                } else { 
                    userProfile = profileResult.data; 
                    currentUser.username = profileResult.data.username; 
                    console.log("BG Profile fetched:", userProfile); 
                    document.getElementById('welcome-nickname').textContent = currentUser.username; 
                    equipTitle(userProfile.equipped_title_id || 1, false); 
                    equipIcon(userProfile.equipped_icon_id || 1, false); 
                    equipColor(userProfile.equipped_color_id, false);
                    equipAccentColor(userProfile.equipped_accent_color_id || 1, false);
                    applyBackground(userProfile.equipped_background_id || 'default');
                    updatePlayerProgressDisplay(); 
                    updateStatsDisplay(); 
                    updateSpotsDisplay(); 
                } 
                ownedTitleIds = new Set(titlesResult.data?.map(t => t.title_id) || []); 
                ownedIconIds = new Set(iconsResult.data?.map(i => i.icon_id) || []); 
                ownedBackgroundIds = new Set(backgroundsResult.data?.map(b => b.background_id) || []);
                ownedColorIds = new Set(colorsResult.data?.map(c => c.color_id) || []);
                ownedAccentColorIds = new Set(accentColorsResult.data?.map(a => a.accent_color_id) || []); 
                inventory = {}; 
                inventoryResult.data?.forEach(item => inventory[item.item_id] = item.quantity); 
                console.log("BG Owned items fetched:", { T: ownedTitleIds.size, I: ownedIconIds.size, B: ownedBackgroundIds.size, C: ownedColorIds.size, A: ownedAccentColorIds.size, Inv: Object.keys(inventory).length }); 
                if(elements.titles.list) renderTitles(); 
                if(elements.icons.list) renderIcons(); 
                if(elements.levelProgress.list) renderLevelProgress(); 
                return supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id); 
            }).then(({ data: achievements, error: achError }) => { 
                if (achError) { console.error("BG Achievement Error:", achError); userUnlockedAchievementIds = []; } 
                else { userUnlockedAchievementIds = achievements.map(a => parseInt(a.achievement_id, 10)).filter(id => !isNaN(id)); console.log("BG Achievements fetched:", userUnlockedAchievementIds); } 
                if(elements.achievements.grid) renderAchievements(); 
                if(elements.titles.list) renderTitles(); 
                if(elements.icons.list) renderIcons(); 
                console.log("Checking Spotify status after achievements (async)..."); 
                return checkSpotifyStatus(); 
            }).then(() => { 
                console.log("Spotify status checked after achievements (async)."); 
                if (spotifyToken && !userUnlockedAchievementIds.includes(9)) { awardClientSideAchievement(9); } 
                console.log("Connecting WebSocket for logged-in user (after async loads)..."); 
                connectWebSocket(); 
            }).catch(error => { 
                console.error("Error during background data loading chain:", error); 
                showToast("Fehler beim Laden einiger Daten.", true); 
                console.log("Connecting WebSocket despite background load error..."); 
                connectWebSocket(); 
            }); 
        } else { 
            console.log("Connecting WebSocket for guest..."); 
            checkSpotifyStatus(); 
            connectWebSocket(); 
        } 
        console.log("initializeApp finished (non-blocking setup complete)."); 
    };
    const checkSpotifyStatus = async () => { if (currentUser && currentUser.isGuest) { console.log("Guest mode, hiding Spotify connect button."); elements.home.spotifyConnectBtn?.classList.add('guest-hidden'); elements.home.createRoomBtn?.classList.add('hidden'); return; } try { const response = await fetch('/api/status'); const data = await response.json(); if (data.loggedIn && data.token) { console.log("Spotify is connected."); spotifyToken = data.token; elements.home.spotifyConnectBtn?.classList.add('hidden'); elements.home.createRoomBtn?.classList.remove('hidden'); if (currentUser && !currentUser.isGuest && !userUnlockedAchievementIds.includes(9)) { awardClientSideAchievement(9); } } else { console.log("Spotify is NOT connected."); spotifyToken = null; elements.home.spotifyConnectBtn?.classList.remove('hidden'); elements.home.createRoomBtn?.classList.add('hidden'); } } catch (error) { console.error("Error checking Spotify status:", error); spotifyToken = null; elements.home.spotifyConnectBtn?.classList.remove('hidden'); elements.home.createRoomBtn?.classList.add('hidden'); } };
    
    const handleAuthAction = async (action, form, isRegister = false) => { 
        if (!supabase) { showToast("Verbindung wird aufgebaut, bitte warte...", true); return; } 
        setLoading(true, "Authentifiziere..."); 
        const formData = new FormData(form); 
        const credentials = {}; 
        let username; 
        if (isRegister) { 
            username = formData.get('username'); 
            credentials.email = `${username}@fakester.app`; 
            credentials.password = formData.get('password'); 
            credentials.options = { data: { 
                username: username, 
                xp: 0, 
                spots: 100, 
                equipped_title_id: 25, 
                equipped_icon_id: 1, 
                equipped_color_id: null,
                equipped_background_id: 'default',
                equipped_accent_color_id: 1
            } }; 
        } else { 
            username = formData.get('username'); 
            credentials.email = `${username}@fakester.app`; 
            credentials.password = formData.get('password'); 
        } 
        const { data, error } = await action(credentials); 
        setLoading(false); 
        if (error) { 
            console.error(`Auth Error (${isRegister ? 'Register' : 'Login'}):`, error); 
            showToast(error.message, true); 
        } 
        else if (data.user) { 
            console.log(`Auth Success (${isRegister ? 'Register' : 'Login'}):`, data.user.id); 
            if (isRegister) {
                setTimeout(() => awardClientSideAchievement(25), 500); 
            }
        } 
        else { 
            console.warn("Auth: Kein Fehler, aber auch keine User-Daten."); 
        } 
    };

    const handleLogout = async () => { if (!supabase) return; showConfirmModal("Abmelden", "Möchtest du dich wirklich abmelden?", async () => { setLoading(true, "Melde ab..."); console.log("Logging out..."); const { error: signOutError } = await supabase.auth.signOut(); try { await fetch('/logout', { method: 'POST' }); console.log("Spotify cookie cleared."); } catch (fetchError) { console.error("Error clearing Spotify cookie:", fetchError); } setLoading(false); if (signOutError) { console.error("SignOut Error:", signOutError); showToast(signOutError.message, true); } else { console.log("Logout successful."); } }); };
    const awardClientSideAchievement = (achievementId) => { if (!currentUser || currentUser.isGuest || !supabase || userUnlockedAchievementIds.includes(achievementId)) { if(userUnlockedAchievementIds.includes(achievementId)) { console.log(`Achievement ${achievementId} already in list, not awarding again.`); } return; } console.log(`Awarding client-side achievement: ${achievementId}`); userUnlockedAchievementIds.push(achievementId); const achievement = achievementsList.find(a => a.id === achievementId); showToast(`Erfolg freigeschaltet: ${achievement?.name || `ID ${achievementId}`}!`); if(elements.achievements.grid) renderAchievements(); if(elements.titles.list) renderTitles(); if(elements.icons.list) renderIcons(); supabase.from('user_achievements').insert({ user_id: currentUser.id, achievement_id: achievementId }).then(({ error }) => { if (error) { console.error(`Fehler beim Speichern von Client-Achievement ${achievementId} im Hintergrund:`, error); } else { console.log(`Client-Achievement ${achievementId} erfolgreich im Hintergrund gespeichert.`); } }); };

    const connectWebSocket = () => {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${proto}//${host}`;
        console.log(`Connecting WebSocket to ${wsUrl}...`);

        if (ws.socket && (ws.socket.readyState === WebSocket.OPEN || ws.socket.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket is already open or connecting.");
            return;
        }

        try {
            ws.socket = new WebSocket(wsUrl);
        } catch (e) {
            console.error("Failed to create WebSocket:", e);
            showToast("WebSocket-Erstellung fehlgeschlagen.", true);
            return;
        }

        ws.socket.onopen = () => {
            console.log("WebSocket connected successfully.");
            
            showToast("Server verbunden!", false); 
            wsRetryCount = 0; 

            if (currentUser && !currentUser.isGuest) {
                ws.socket.send(JSON.stringify({ type: 'register-online', payload: { userId: currentUser.id, username: currentUser.username } }));
            }

            if (wsPingInterval) clearInterval(wsPingInterval);
            wsPingInterval = setInterval(() => {
                if (ws.socket && ws.socket.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000); 
        };

        ws.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (e) {
                console.error("Error parsing WS message:", e);
            }
        };

        ws.socket.onerror = (error) => {
            console.error("WebSocket Error:", error);
        };

        ws.socket.onclose = (event) => {
            console.warn(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
            if (wsPingInterval) clearInterval(wsPingInterval);
            wsPingInterval = null;
            ws.socket = null;
            
            const maxRetries = 5;
            if (event.code !== 1000 && event.code !== 1005 && wsRetryCount < maxRetries) {
                 wsRetryCount++;
                 const delay = Math.pow(2, wsRetryCount) * 1000 + (Math.random() * 1000); 
                 showToast(`Serververbindung verloren. Versuche erneut in ${Math.round(delay/1000)}s...`, true);
                 setTimeout(() => {
                    console.log(`WebSocket: Reconnect attempt ${wsRetryCount}...`);
                    connectWebSocket(); 
                 }, delay);
            } else if (wsRetryCount >= maxRetries) {
                showToast("Reconnect fehlgeschlagen. Bitte lade die Seite neu.", true);
            }
        };
    }

    const handleWebSocketMessage = ({ type, payload }) => {
        console.log(`WS Message Received: ${type}`, payload || '');

        switch (type) {
            case 'lobby-update':
                handleLobbyUpdate(payload);
                setLoading(false); 
                elements.joinModal.overlay.classList.add('hidden'); 
                if (screenHistory[screenHistory.length - 1] !== 'game-screen' && screenHistory[screenHistory.length - 1] !== 'end-screen') {
                    showScreen('lobby-screen');
                }
                break;
            case 'toast':
                showToast(payload.message, payload.isError);
                setLoading(false); 
                break;
            case 'friends-update': 
                renderFriendsList(payload.friends);
                renderRequestsList(payload.requests);
                break;
            case 'game-starting':
                setLoading(true, "Spiel startet...");
                break;
            case 'countdown':
                setLoading(false); 
                showCountdown(payload.number); 
                break;
            case 'new-round':
                setLoading(false);
                setupNewRound(payload); 
                showScreen('game-screen');
                break;
            
            case 'timeline-start':
                setLoading(false);
                setupTimelineStart(payload); 
                showScreen('game-screen');
                break;
            case 'new-timeline-round': 
                setLoading(false);
                setupTimelineRound(payload); 
                showScreen('game-screen');
                break;
            case 'new-popularity-round': 
                setLoading(false);
                setupPopularityRound(payload); 
                showScreen('game-screen');
                break;

            case 'round-result':
                if (currentGame.gameMode === 'timeline') {
                    showTimelineResult(payload);
                } else {
                    showRoundResult(payload); 
                }
                break;
            
            case 'game-over':
                setLoading(false);
                pendingGameInvites = {};
                showGameOver(payload); 
                break;

            case 'player-reacted':
                displayReaction(payload.playerId, payload.nickname, payload.iconId, payload.reaction);
                break;
            case 'invite-received':
                pendingGameInvites[payload.fromUserId] = payload.pin;
                showInvitePopup(payload.from, payload.pin, payload.fromUserId);
                break;
            case 'friend-request-received':
                showFriendRequestPopup(payload.from, payload.senderId);
                break;

            default:
                console.warn(`Unhandled WS message type: ${type}`);
        }
    };
    
    function handleLobbyUpdate(data) {
        console.log("Handling lobby update", data);
        const { pin, hostId, players, settings, gameMode } = data;
        
        currentGame.pin = pin;
        currentGame.playerId = currentUser.id;
        currentGame.isHost = hostId === currentUser.id;
        currentGame.gameMode = gameMode;
        currentGame.players = players; 
        currentGame.settings = settings; 
        
        gameCreationSettings.guessTypes = settings.guessTypes || [];
        gameCreationSettings.answerType = settings.answerType || 'freestyle';
        gameCreationSettings.guessTime = settings.guessTime || 30;

        if (elements.lobby.pinDisplay) {
            elements.lobby.pinDisplay.textContent = pin;
        }

        renderPlayerList(players, hostId);
        renderGamePlayerList(players, hostId);

        if (document.getElementById('ready-status-display')) {
            const readyPlayers = players.filter(p => p.isReady).length;
            const totalPlayers = players.length;
            document.getElementById('ready-status-display').textContent = `${readyPlayers} / ${totalPlayers} Spieler bereit`;
        }

        elements.lobby.hostSettings?.classList.toggle('hidden', !currentGame.isHost);
        elements.lobby.guestWaitingMessage?.classList.toggle('hidden', currentGame.isHost);

        updateHostSettings(settings, currentGame.isHost);
        
        pendingGameInvites = {};
    }
    
    function showGameOver(payload) {
        console.log("Game Over. Payload:", payload);
        
        if (spotifyToken && currentGame.settings?.deviceId) {
            spotifyApiCall('PUT', `https://api.spotify.com/v1/me/player/pause?device_id=${currentGame.settings.deviceId}`, spotifyToken, null);
        }

        if (payload.message) {
            const myPlayer = payload.scores.find(p => p.id === currentUser.id);
            const mySpots = myPlayer ? Math.max(1, Math.floor((myPlayer.score || 0) * 0.10)) : 0;
            
            showConfirmModal(
                "Spiel beendet", 
                `Der Host hat das Spiel verlassen.\nDir werden ${mySpots} 🎵 als Trostpreis gutgeschrieben.`, 
                () => {
                    updatePlayerProgress(); 
                    showScreen('home-screen');
                }
            );
            elements.confirmActionModal.cancelBtn.classList.add('hidden'); 
            elements.confirmActionModal.confirmBtn.classList.remove('hidden');
        
        } else {
            const leaderboardEl = elements.endScreen.leaderboard;
            const xpEl = elements.endScreen.xp;
            const spotsEl = elements.endScreen.spots;
            
            if (leaderboardEl) leaderboardEl.innerHTML = ''; 
            
            const myResult = payload.scores.find(p => p.id === currentUser.id);
            
            payload.scores.forEach((player, index) => {
                const rank = index + 1;
                const playerEl = document.createElement('div');
                playerEl.className = `end-screen-player rank-${rank}`;
                
                const infoEl = document.createElement('div');
                infoEl.className = 'end-screen-player-info';
                
                const rankEl = document.createElement('span');
                rankEl.className = 'end-screen-player-rank';
                rankEl.textContent = `#${rank}`;
                
                const nameEl = document.createElement('span');
                nameEl.className = 'end-screen-player-name';
                nameEl.textContent = player.nickname; 
                
                infoEl.append(rankEl, nameEl);
                
                const scoreEl = document.createElement('span');
                scoreEl.className = 'end-screen-player-score';
                scoreEl.textContent = player.score;
                
                playerEl.append(infoEl, scoreEl);
                if (leaderboardEl) leaderboardEl.appendChild(playerEl);
            });
            
            if (myResult && myResult.rewards) {
                if(xpEl) xpEl.textContent = myResult.rewards.xp;
                if(spotsEl) spotsEl.textContent = myResult.rewards.spots;
            } else {
                if(xpEl) xpEl.textContent = '0';
                if(spotsEl) spotsEl.textContent = '0';
            }
            
            updatePlayerProgress(); 
            showScreen('end-screen');
        }
        
        if(elements.game.playerList) elements.game.playerList.innerHTML = '';
    }

    function renderPlayerList(players, hostId) {
        if (!elements.lobby.playerList) return;
        elements.lobby.playerList.innerHTML = ''; 
        
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

        sortedPlayers.forEach(player => {
            const isHost = player.id === hostId;
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            playerCard.classList.toggle('is-host', isHost); 
            playerCard.dataset.playerId = player.id;
            
            const iconData = iconsList.find(i => i.id === player.iconId) || iconsList[0];
            const iconClass = iconData ? iconData.iconClass : 'fa-user'; 
            
            const colorData = nameColorsList.find(c => c.id === player.colorId); 
            const colorStyle = colorData ? (colorData.colorHex.includes('gradient') ? `background: ${colorData.colorHex}; -webkit-background-clip: text; -webkit-text-fill-color: transparent;` : `color: ${colorData.colorHex}`) : '';

            const titleData = titlesList.find(t => t.id === player.titleId) || titlesList[0];
            const backgroundData = backgroundsList.find(b => b.backgroundId === player.backgroundId);
            const backgroundStyle = backgroundData ? backgroundData.cssClass : 'radial-only';
            
            const accentColorData = accentColorsList.find(c => c.id === player.accentColorId) || accentColorsList[0];
            if (accentColorData) {
                playerCard.style.setProperty('--player-accent-color', accentColorData.colorHex);
            }
            
            const backgroundEl = document.createElement('div');
            backgroundEl.className = `player-card-background ${backgroundStyle}`;
            
            const contentEl = document.createElement('div');
            contentEl.className = 'player-card-content';
            
            const iconEl = document.createElement('i');
            iconEl.className = `player-icon fa-solid ${iconClass}`; 
            
            const infoEl = document.createElement('div');
            infoEl.className = 'player-info';
            
            const titleEl = document.createElement('span');
            titleEl.className = 'player-title';
            titleEl.textContent = titleData.name; 
            
            const nameEl = document.createElement('span');
            nameEl.className = 'player-name';
            nameEl.style.cssText = colorStyle;
            nameEl.textContent = player.nickname || 'Unbekannt'; 
            
            infoEl.append(titleEl, nameEl);
            contentEl.append(iconEl, infoEl);
            playerCard.append(backgroundEl, contentEl);
            
            elements.lobby.playerList.appendChild(playerCard);
        });
    }

    function renderGamePlayerList(players, hostId) { 
        if (!elements.game.playerList) return;
        elements.game.playerList.innerHTML = ''; 
        
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        
        sortedPlayers.forEach(player => {
            const isHost = player.id === hostId; 
            const playerCard = document.createElement('div');
            playerCard.className = 'game-player-card';
            playerCard.classList.toggle('is-ready', player.isReady); 
            playerCard.classList.toggle('is-host', isHost); 
            playerCard.dataset.playerId = player.id;
            
            const iconData = iconsList.find(i => i.id === player.iconId) || iconsList[0];
            const iconClass = iconData ? iconData.iconClass : 'fa-user';
            
            const colorData = nameColorsList.find(c => c.id === player.colorId); 
            const colorStyle = colorData ? (colorData.colorHex.includes('gradient') ? `background: ${colorData.colorHex}; -webkit-background-clip: text; -webkit-text-fill-color: transparent;` : `color: ${colorData.colorHex}`) : '';

            const titleData = titlesList.find(t => t.id === player.titleId) || titlesList[0];
            const backgroundData = backgroundsList.find(b => b.backgroundId === player.backgroundId);
            const backgroundStyle = backgroundData ? backgroundData.cssClass : 'radial-only';
            
            const accentColorData = accentColorsList.find(c => c.id === player.accentColorId) || accentColorsList[0];
            if (accentColorData) {
                playerCard.style.setProperty('--player-accent-color', accentColorData.colorHex);
            }
            
            const backgroundEl = document.createElement('div');
            backgroundEl.className = `player-card-background ${backgroundStyle}`;
            
            const contentEl = document.createElement('div');
            contentEl.className = 'player-card-content';

            const iconEl = document.createElement('i');
            iconEl.className = `player-icon fa-solid ${iconClass}`; 
            
            const infoEl = document.createElement('div');
            infoEl.className = 'player-info';
            
            const titleEl = document.createElement('span');
            titleEl.className = 'player-title';
            titleEl.textContent = titleData.name; 
            
            const nameEl = document.createElement('span');
            nameEl.className = 'player-name';
            nameEl.style.cssText = colorStyle;
            nameEl.textContent = player.nickname || 'Unbekannt'; 
            
            infoEl.append(titleEl, nameEl);
            
            const scoreEl = document.createElement('span');
            scoreEl.className = 'player-score';
            scoreEl.textContent = player.score;
            
            contentEl.append(iconEl, infoEl, scoreEl);
            
            if (player.isReady) {
                const readyIconEl = document.createElement('i');
                readyIconEl.className = 'player-ready-icon fa-solid fa-check-circle';
                contentEl.appendChild(readyIconEl);
            }
            
            playerCard.append(backgroundEl, contentEl);
            
            elements.game.playerList.appendChild(playerCard);
        });
    }

    function updateHostSettings(settings, isHost) {
        console.log("Updating host settings display", settings);

        const updatePresets = (presetContainer, value, customValueType) => {
            if (!presetContainer) return;
            let valueFound = false;
            presetContainer.querySelectorAll('.preset-button').forEach(btn => {
                if (btn.dataset.value === String(value)) {
                    btn.classList.add('active');
                    valueFound = true;
                } else {
                    btn.classList.remove('active');
                }
            });
            
            const customBtn = presetContainer.querySelector(`[data-value="custom"][data-type="${customValueType}"]`);
            if (!valueFound && customBtn && value) {
                customBtn.classList.add('active');
                
                let textContent = `${value}`;
                if (customValueType === 'guess-time') textContent = `${value}s`;
                else if (customValueType === 'lives') textContent = `${value} ❤️`;
                customBtn.textContent = textContent;
        
            } else if (customBtn) {
                if (customValueType === 'guess-time') customBtn.textContent = 'Custom';
                else if (customValueType === 'lives') customBtn.textContent = 'Custom';
                else customBtn.textContent = 'Custom';
                if (valueFound) {
                    customBtn.classList.remove('active');
                }
            }
        };

        if (elements.lobby.deviceSelectBtn) {
            elements.lobby.deviceSelectBtn.textContent = settings.deviceName || 'Gerät auswählen';
        }
        if (elements.lobby.playlistSelectBtn) {
            elements.lobby.playlistSelectBtn.textContent = settings.playlistName || 'Playlist auswählen';
        }
        
        updatePresets(elements.lobby.songCountPresets, settings.songCount, 'song-count');
        updatePresets(elements.lobby.guessTimePresets, settings.guessTime, 'guess-time');
        
        if (isHost && elements.lobby.startGameBtn) {
            const canStart = settings.deviceName && settings.playlistName;
            elements.lobby.startGameBtn.disabled = !canStart;
            if (!canStart) {
                elements.lobby.startGameBtn.title = "Wähle zuerst Gerät und Playlist.";
            } else {
                elements.lobby.startGameBtn.title = "";
            }
        }
    }

    function renderAchievements() {
        if (!elements.achievements.grid || currentUser.isGuest) return;
        elements.achievements.grid.innerHTML = '';
        
        const sortedAchievements = [...achievementsList].sort((a, b) => {
            const aUnlocked = userUnlockedAchievementIds.includes(a.id);
            const bUnlocked = userUnlockedAchievementIds.includes(b.id);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id; 
        });
        
        sortedAchievements.forEach(ach => { 
            const isUnlocked = userUnlockedAchievementIds.includes(ach.id);
            const isHidden = ach.hidden && !isUnlocked;
            
            const card = document.createElement('div');
            card.className = 'achievement-card';
            card.classList.toggle('unlocked', isUnlocked);
            card.classList.toggle('hidden-achievement', isHidden);
            
            const reward = allItems.find(item => item.unlockType === 'achievement' && item.unlockValue === ach.id);
            let rewardText = '<span class="reward">+50 🎵</span>'; 
            if (reward) {
                rewardText += ` & ${reward.type === 'title' ? 'Titel' : 'Icon'}: ${reward.name || reward.iconClass}`;
            }

            card.innerHTML = `
                <h3>${isHidden ? '???' : ach.name}</h3>
                <p>${isHidden ? '???' : ach.description}</p>
                ${isUnlocked ? `<span class="reward">Freigeschaltet!</span>` : (isHidden ? '' : rewardText)}
            `;
            elements.achievements.grid.appendChild(card);
        });
    }