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
        { id: 3, name: 'Ozeanblau', type: 'accent-color', colorHex: '#0077be', unlockType: 'level', unlockValue: 5, description: 'Erreiche Level 5' },
        { id: 4, name: 'Königs-Lila', type: 'accent-color', colorHex: '#8a2be2', unlockType: 'level', unlockValue: 10, description: 'Erreiche Level 10' },
        { id: 5, name: 'Rubinrot', type: 'accent-color', colorHex: '#e01e5a', unlockType: 'level', unlockValue: 15, description: 'Erreiche Level 15' },
        { id: 6, name: 'Sonnengelb', type: 'accent-color', colorHex: '#ffc700', unlockType: 'level', unlockValue: 20, description: 'Erreiche Level 20' },
        { id: 7, name: 'Platin', type: 'accent-color', colorHex: '#e5e4e2', unlockType: 'level', unlockValue: 50, description: 'Erreiche Level 50' },
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
    function renderTitles() {
        if (!elements.titles.list || currentUser.isGuest) return;
        elements.titles.list.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        
        const sortedTitles = [...titlesList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });
        
        sortedTitles.forEach(title => { 
            const isUnlocked = isItemUnlocked(title, currentLevel);
            const isEquipped = userProfile.equipped_title_id === title.id;

            const card = document.createElement('div');
            card.className = 'title-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.titleId = title.id;

            card.innerHTML = `
                <span class="title-name">${title.name}</span>
                <span class="title-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : getUnlockDescription(title)}</span>
            `;
            elements.titles.list.appendChild(card);
        });
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

    function renderIcons() {
        if (!elements.icons.list || currentUser.isGuest) return;
        elements.icons.list.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);

        const sortedIcons = [...iconsList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });

        sortedIcons.forEach(icon => { 
            const isUnlocked = isItemUnlocked(icon, currentLevel);
            const isEquipped = userProfile.equipped_icon_id === icon.id;

            const card = document.createElement('div');
            card.className = 'icon-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.iconId = icon.id;

            card.innerHTML = `
                <div class="icon-preview"><i class="fa-solid ${icon.iconClass}"></i></div>
                <span class="title-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : (icon.description || getUnlockDescription(icon))}</span>
            `;
            elements.icons.list.appendChild(card);
        });
    }
    
    function renderCustomizationMenu() {
        if (!elements.customize.screen || currentUser.isGuest) return;
        renderCustomTitles();
        renderCustomIcons();
        renderCustomColors();
        renderCustomBackgrounds();
        renderCustomAccentColors(); 
    }
    
    function renderCustomTitles() {
        const container = elements.customize.titlesList;
        if (!container) return;
        container.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        
        const sortedTitles = [...titlesList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });
        
        sortedTitles.forEach(title => {
            const isUnlocked = isItemUnlocked(title, currentLevel);
            const isEquipped = userProfile.equipped_title_id === title.id;

            const card = document.createElement('div');
            card.className = 'title-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.titleId = title.id;
            card.innerHTML = `
                <span class="title-name">${title.name}</span>
                <span class="title-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : getUnlockDescription(title)}</span>
            `;
            container.appendChild(card);
        });
    }

    function renderCustomIcons() {
        const container = elements.customize.iconsList;
        if (!container) return;
        container.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        
        const sortedIcons = [...iconsList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });

        sortedIcons.forEach(icon => {
            const isUnlocked = isItemUnlocked(icon, currentLevel);
            const isEquipped = userProfile.equipped_icon_id === icon.id;

            const card = document.createElement('div');
            card.className = 'icon-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.iconId = icon.id;
            card.innerHTML = `
                <div class="icon-preview"><i class="fa-solid ${icon.iconClass}"></i></div>
                <span class="title-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Zum Ausrüsten klicken') : (icon.description || getUnlockDescription(icon))}</span>
            `;
            container.appendChild(card);
        });
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

    function renderCustomColors() {
        const container = elements.customize.colorsList;
        if (!container || currentUser.isGuest) return;
        container.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);

        const sortedColors = [...nameColorsList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });

        const noneCard = document.createElement('div');
        noneCard.className = 'color-card';
        noneCard.classList.toggle('equipped', !userProfile.equipped_color_id);
        noneCard.dataset.colorId = ''; 
        noneCard.innerHTML = `
            <div class="color-preview" style="background-color: var(--dark-grey); border: 2px dashed var(--medium-grey);">
                <i class="fa-solid fa-ban"></i>
            </div>
            <span class="color-name">Standard</span>
            <span class="color-desc">${!userProfile.equipped_color_id ? 'Ausgerüstet' : 'Keine Farbe'}</span>
        `;
        container.appendChild(noneCard);

        sortedColors.forEach(color => {
            const isUnlocked = isItemUnlocked(color, currentLevel);
            const isEquipped = userProfile.equipped_color_id === color.id;

            const card = document.createElement('div');
            card.className = 'color-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.colorId = color.id;
            
            let preview;
            if (color.colorHex.includes('gradient')) {
                preview = `<div class="color-preview" style="background: ${color.colorHex};">
                               <span class="gradient-text" style="background: ${color.colorHex};">Aa</span>
                           </div>`;
            } else {
                preview = `<div class="color-preview" style="background-color: ${color.colorHex}">
                               <i class="fa-solid fa-font" style="color: ${color.colorHex}; filter: invert(1);"></i>
                           </div>`;
            }

            card.innerHTML = `
                ${preview}
                <span class="color-name">${color.name}</span>
                <span class="color-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Klicken') : getUnlockDescription(color)}</span>
            `;
            container.appendChild(card);
        });
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

    function renderCustomAccentColors() {
        const container = elements.customize.accentColorsList;
        if (!container || currentUser.isGuest) return;
        container.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);

        const sortedColors = [...accentColorsList].sort((a, b) => {
            const aUnlocked = isItemUnlocked(a, currentLevel);
            const bUnlocked = isItemUnlocked(b, currentLevel);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return a.id - b.id;
        });

        sortedColors.forEach(color => {
            const isUnlocked = isItemUnlocked(color, currentLevel);
            const isEquipped = userProfile.equipped_accent_color_id === color.id;

            const card = document.createElement('div');
            card.className = 'color-card';
            card.classList.toggle('locked', !isUnlocked);
            card.classList.toggle('equipped', isEquipped);
            card.dataset.colorId = color.id;

            card.innerHTML = `
                <div class="color-preview" style="background: ${color.colorHex}">
                </div>
                <span class="color-name">${color.name}</span>
                <span class="color-desc">${isUnlocked ? (isEquipped ? 'Ausgerüstet' : 'Klicken') : getUnlockDescription(color)}</span>
            `;
            container.appendChild(card);
        });
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

    function renderCustomBackgrounds() {
        const container = elements.customize.backgroundsList;
        if (currentUser.isGuest || !container) return;
        container.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        
        const unlockedBGs = backgroundsList.filter(bg => isItemUnlocked(bg, currentLevel));
        
        unlockedBGs.forEach(bg => {
            const isEquipped = (userProfile.equipped_background_id === bg.backgroundId) || (!userProfile.equipped_background_id && bg.backgroundId === 'default');
            
            const card = document.createElement('div');
            card.className = 'background-card'; 
            card.classList.toggle('equipped', isEquipped);
            card.dataset.bgId = bg.backgroundId;

            card.innerHTML = `
                <div class="background-preview ${bg.cssClass}"></div>
                <span class="background-name">${bg.name}</span>
                <span class="background-desc">${isEquipped ? 'Ausgerüstet' : 'Klicken'}</span>
            `;
            container.appendChild(card);
        });
    }

    function applyBackground(backgroundId) {
        const bg = backgroundsList.find(b => b.backgroundId === backgroundId) || backgroundsList[0];
        
        if (elements.appBackground) {
            elements.appBackground.className = 'app-background';
            elements.appBackground.classList.add(bg.cssClass || 'radial-only');
        }
    }
    
    function renderLevelProgress() {
        if (!elements.levelProgress.list || currentUser.isGuest) return;
        elements.levelProgress.list.innerHTML = '';
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const maxDisplayLevel = 50;

        for (let level = 1; level <= maxDisplayLevel; level++) {
            const isUnlocked = currentLevel >= level;
            const item = document.createElement('div');
            item.className = 'level-progress-item';
            item.classList.toggle('unlocked', isUnlocked);
            
            const xpNeeded = getXpForLevel(level + 1);
            
            const levelTitles = titlesList.filter(t => t.unlockType === 'level' && t.unlockValue === level);
            const levelIcons = iconsList.filter(i => i.unlockType === 'level' && i.unlockValue === level);
            const levelAccents = accentColorsList.filter(a => a.unlockType === 'level' && a.unlockValue === level);
            const rewards = [...levelTitles, ...levelIcons, ...levelAccents];

            let rewardsHtml = '';
            
            const spotAmount = 10 + (level * 2); 
            rewardsHtml += `
                <div class="reward-item">
                    <i class="fa-solid fa-coins" style="color: #FFD700;"></i>
                    <span>${spotAmount} 🎵</span>
                </div>
            `;
            
            if (rewards.length > 0) {
                rewards.forEach(reward => {
                    let icon = 'fa-ticket';
                    if (reward.type === 'icon') icon = reward.iconClass;
                    else if (reward.type === 'accent-color') icon = 'fa-palette';
                    
                    rewardsHtml += `
                        <div class="reward-item">
                            <i class="fa-solid ${icon}"></i>
                            <span>${reward.name || reward.description}</span>
                        </div>
                    `;
                });
            }
            
            if (rewardsHtml === '' && spotAmount === 0) {
                rewardsHtml = '<div class="no-reward">Keine spezielle Belohnung</div>';
            }

            item.innerHTML = `
                <div class="level-progress-header">
                    <h3>Level ${level}</h3>
                    <span>${isUnlocked ? 'Erreicht' : `Nächstes Level bei ${xpNeeded} XP`}</span>
                </div>
                <div class="level-progress-rewards">
                    ${rewardsHtml}
                </div>
            `;
            elements.levelProgress.list.appendChild(item);
        }
    }
    
    function updatePlayerProgressDisplay() {
        if (currentUser.isGuest) return;
        
        const currentLevel = getLevelForXp(userProfile.xp || 0);
        const currentLevelXp = getXpForLevel(currentLevel);
        const nextLevelXp = getXpForLevel(currentLevel + 1);
        const xpForThisLevel = nextLevelXp - currentLevelXp;
        const xpProgress = (userProfile.xp || 0) - currentLevelXp;
        const progressPercent = xpForThisLevel > 0 ? (xpProgress / xpForThisLevel) * 100 : 0;
        
        if (elements.home.profileLevel) elements.home.profileLevel.textContent = currentLevel;
        if (elements.home.profileXpFill) elements.home.profileXpFill.style.width = `${progressPercent}%`;
        if (elements.home.profileXpText) elements.home.profileXpText.textContent = `${userProfile.xp || 0} / ${nextLevelXp} XP`;
    }

    async function updatePlayerProgress() {
        if (currentUser.isGuest || !supabase) return;
        try {
            console.log("Fetching latest profile data (XP, Spots, Stats)...");
            const { data, error } = await supabase.from('profiles').select('xp, games_played, wins, correct_answers, highscore, spots').eq('id', currentUser.id).single();
            if (error) throw error;
            userProfile = { ...userProfile, ...data };
            
            updatePlayerProgressDisplay(); 
            updateStatsDisplay(); 
            updateSpotsDisplay(); 
            console.log("Live UI updated with new stats.");

        } catch(error) {
            console.error("Fehler beim Aktualisieren der Spieler-Progression:", error);
        }
    }
    
    function updateStatsDisplay() {
        if (currentUser.isGuest) return;
        const stats = userProfile;
        const winrate = (stats.games_played > 0 ? (stats.wins / stats.games_played) * 100 : 0).toFixed(0);
        const avgScore = (stats.games_played > 0 ? (stats.correct_answers / stats.games_played) : 0).toFixed(1); 
        
        if(elements.stats.gamesPlayedPreview) elements.stats.gamesPlayedPreview.textContent = stats.games_played || 0;
        if(elements.stats.winsPreview) elements.stats.winsPreview.textContent = stats.wins || 0;
        if(elements.stats.correctAnswersPreview) elements.stats.correctAnswersPreview.textContent = stats.correct_answers || 0;
        if(elements.stats.gamesPlayed) elements.stats.gamesPlayed.textContent = stats.games_played || 0;
        if(elements.stats.wins) elements.stats.wins.textContent = stats.wins || 0;
        if(elements.stats.winrate) elements.stats.winrate.textContent = `${winrate}%`;
        if(elements.stats.highscore) elements.stats.highscore.textContent = stats.highscore || 0;
        if(elements.stats.correctAnswers) elements.stats.correctAnswers.textContent = stats.correct_answers || 0;
        if(elements.stats.avgScore) elements.stats.avgScore.textContent = avgScore;
    }

    async function loadShopItems() {
        if (currentUser.isGuest) return;
        setLoading(true, "Lade Shop...");
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                throw new Error(sessionError?.message || "Authentifizierung fehlgeschlagen. Bitte neu einloggen.");
            }
            const accessToken = session.access_token;

            const { data: profileData, error: profileError } = await supabase.from('profiles').select('spots').eq('id', currentUser.id).single();
            if (profileError) throw profileError;
            userProfile.spots = profileData.spots;
            updateSpotsDisplay();

            const response = await fetch('/api/shop/items', {
                headers: { 'Authorization': `Bearer ${accessToken}` } 
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Shop-Daten konnten nicht geladen werden.');
            }
            
            const { items: shopItemsFromServer } = await response.json();
            
            const titlesListEl = elements.shop.titlesList;
            const iconsListEl = elements.shop.iconsList;
            const backgroundsListEl = elements.shop.backgroundsList;
            const colorsListEl = elements.shop.colorsList;

            titlesListEl.innerHTML = '';
            iconsListEl.innerHTML = '';
            backgroundsListEl.innerHTML = '';
            colorsListEl.innerHTML = '';

            const allShopItems = [...titlesList, ...iconsList, ...backgroundsList, ...nameColorsList, ...accentColorsList]
                .filter(item => item.unlockType === 'spots');

            allShopItems.forEach(item => {
                const serverItem = shopItemsFromServer.find(si => si.id === item.id || si.id === item.backgroundId);
                const isOwned = serverItem ? serverItem.isOwned : false;
                
                if (isOwned) {
                    if (item.type === 'title') ownedTitleIds.add(item.id);
                    else if (item.type === 'icon') ownedIconIds.add(item.id);
                    else if (item.type === 'background') ownedBackgroundIds.add(item.backgroundId);
                    else if (item.type === 'color') ownedColorIds.add(item.id);
                    else if (item.type === 'accent-color') ownedAccentColorIds.add(item.id); 
                }

                if (item.type === 'title') {
                    titlesListEl.appendChild(renderShopItem(item, userProfile.spots, isOwned));
                } else if (item.type === 'icon') {
                    iconsListEl.appendChild(renderShopItem(item, userProfile.spots, isOwned));
                } else if (item.type === 'background') {
                    backgroundsListEl.appendChild(renderShopItem(item, userProfile.spots, isOwned));
                } else if (item.type === 'color') {
                    colorsListEl.appendChild(renderShopItem(item, userProfile.spots, isOwned));
                }
            });

        } catch (error) {
            console.error("Error loading shop items:", error);
            showToast(error.message || "Fehler beim Laden des Shops.", true);
        } finally {
            setLoading(false);
        }
    }

    function renderShopItem(item, userSpots, isOwned) {
        const el = document.createElement('div');
        el.className = 'shop-item';
        el.classList.toggle('owned', isOwned);
        
        let previewHtml = '';
        if (item.type === 'icon') {
            previewHtml = `<div class="item-preview-icon"><i class="fa-solid ${item.iconClass}"></i></div>`;
        } else if (item.type === 'background') {
            previewHtml = `<div class="item-preview-background ${item.cssClass || 'radial-only'}"></div>`;
        } else if (item.type === 'color') {
             if (item.colorHex.includes('gradient')) {
                previewHtml = `<div class="item-preview-color" style="background: ${item.colorHex};">
                               <span class="gradient-text" style="background: ${item.colorHex};">Aa</span>
                           </div>`;
            } else {
                previewHtml = `<div class="item-preview-color" style="background-color: ${item.colorHex}">
                               <i class="fa-solid fa-font" style="color: ${item.colorHex}; filter: invert(1);"></i>
                           </div>`;
            }
        } else if (item.type === 'accent-color') {
             previewHtml = `<div class="item-preview-color" style="background: ${item.colorHex}"></div>`;
        } else {
            previewHtml = `<div class="item-preview-icon"><i class="fa-solid fa-ticket"></i></div>`;
        }

        const canAfford = userSpots >= item.cost;
        el.classList.toggle('cannot-afford', !canAfford && !isOwned);
        el.classList.toggle('can-afford', canAfford && !isOwned);

        el.innerHTML = `
            ${previewHtml}
            <div class="shop-item-info">
                <span class="item-name">${item.name}</span>
                <span class="item-description">${item.description || getUnlockDescription(item)}</span>
                <div class="buy-button-container">
                    <span class="item-cost">${item.cost} 🎵</span>
                    <button class="button-primary buy-button" data-item-id="${item.id}" ${isOwned || !canAfford ? 'disabled' : ''}>
                        ${isOwned ? 'Besitzt' : 'Kaufen'}
                    </button>
                </div>
            </div>
        `;
        return el;
    }

    async function handleBuyItem(itemId) {
        const item = allItems.find(i => i.id == itemId || i.backgroundId == itemId);
        if (!item) return;

        showConfirmModal(
            `Kauf bestätigen`,
            `Möchtest du "${item.name}" für ${item.cost} 🎵 kaufen?`,
            async () => {
                setLoading(true, "Kauf wird verarbeitet...");
                try {
                    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                    if (sessionError || !session) {
                        throw new Error(sessionError?.message || "Authentifizierung fehlgeschlagen. Bitte neu einloggen.");
                    }
                    const accessToken = session.access_token;

                    const response = await fetch('/api/shop/buy', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`
                        },
                        body: JSON.stringify({ itemId: item.id })
                    });
                    const result = await response.json();
                    if (!response.ok || !result.success) {
                        throw new Error(result.message || "Kauf fehlgeschlagen.");
                    }
                    setLoading(false);
                    showToast(result.message, false);
                    userProfile.spots = result.newSpots;
                    updateSpotsDisplay();
                    if (result.itemType === 'title') ownedTitleIds.add(item.id);
                    else if (result.itemType === 'icon') ownedIconIds.add(item.id);
                    else if (result.itemType === 'background') ownedBackgroundIds.add(item.backgroundId);
                    else if (result.itemType === 'color') ownedColorIds.add(item.id);
                    else if (result.itemType === 'accent-color') ownedAccentColorIds.add(item.id); 
                    loadShopItems(); 
                    
                    awardClientSideAchievement(21);

                } catch (error) {
                    setLoading(false);
                    console.error("Fehler beim Kaufen:", error);
                    showToast(error.message, true);
                }
            }
        );
    }
    
    function displayReaction(playerId, nickname, iconId, reaction) {
        const iconData = iconsList.find(i => i.id === iconId) || iconsList[0];
        const iconClass = iconData ? iconData.iconClass : 'fa-user';

        const toast = document.createElement('div');
        toast.className = 'reaction-toast';
        
        const iconEl = document.createElement('i');
        iconEl.className = `icon fa-solid ${iconClass}`;
        
        const nameEl = document.createElement('span');
        nameEl.className = 'name';
        nameEl.textContent = nickname; 
        
        const reactionEl = document.createElement('span');
        reactionEl.className = 'reaction';
        reactionEl.textContent = reaction; 
        
        toast.append(iconEl, nameEl, reactionEl);
        elements.popups.container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 2000);
    }
    
    function showCountdown(number) { 
        console.log(`Countdown: ${number}`); 
        elements.countdownOverlay.textContent = number;
        elements.countdownOverlay.classList.remove('hidden');
    }
    
    function setupNewRound(data) { 
        console.log("New Round Setup", data); 
        elements.countdownOverlay.classList.add('hidden');
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds;

        const guessTypes = gameCreationSettings.guessTypes;
        const answerType = gameCreationSettings.answerType;
        const mcOptions = data.mcOptions;
        
        const guessContainer = document.createElement('div');
        guessContainer.className = 'guess-container';
        
        const me = currentGame.players.find(p => p.id === currentUser.id);
        const isReady = me ? me.isReady : false;
        
        if (answerType === 'freestyle') {
            const h2 = document.createElement('h2');
            h2.textContent = 'Was ist das für ein Song?';
            guessContainer.appendChild(h2);
            
            if (guessTypes.includes('title')) {
                const input = document.createElement('input');
                input.type = 'text';
                input.id = 'guess-input-title';
                input.className = 'guess-input';
                input.placeholder = 'Titel...';
                input.autocomplete = 'off';
                guessContainer.appendChild(input);
            }
            if (guessTypes.includes('artist')) {
                const input = document.createElement('input');
                input.type = 'text';
                input.id = 'guess-input-artist';
                input.className = 'guess-input';
                input.placeholder = 'Künstler...';
                input.autocomplete = 'off';
                guessContainer.appendChild(input);
            }
            if (guessTypes.includes('year')) {
                const input = document.createElement('input');
                input.type = 'number';
                input.id = 'guess-input-year';
                input.className = 'guess-input';
                input.placeholder = 'Jahr (z.B. 1999)';
                input.autocomplete = 'off';
                guessContainer.appendChild(input);
            }
        } else {
            const createMcGroup = (type, title, options) => {
                const group = document.createElement('div');
                group.className = 'mc-button-group';
                group.dataset.guessType = type;
                
                const h3 = document.createElement('h3');
                h3.textContent = title;
                group.appendChild(h3);
                
                options.forEach(option => {
                    const btn = document.createElement('button');
                    btn.className = 'button-secondary mc-button';
                    btn.dataset.value = option;
                    btn.textContent = option; 
                    group.appendChild(btn);
                });
                return group;
            };
            
            if (guessTypes.includes('title')) {
                guessContainer.appendChild(createMcGroup('title', 'Titel', mcOptions.title));
            }
            if (guessTypes.includes('artist')) {
                guessContainer.appendChild(createMcGroup('artist', 'Künstler', mcOptions.artist));
            }
            if (guessTypes.includes('year')) {
                guessContainer.appendChild(createMcGroup('year', 'Jahr', mcOptions.year));
            }
        }
        
        const readyContainer = document.createElement('div');
        readyContainer.className = 'ready-container';
        
        const readyBtn = document.createElement('button');
        readyBtn.id = 'player-ready-button';
        readyBtn.className = 'button-primary';
        readyBtn.disabled = isReady;
        readyBtn.textContent = isReady ? 'Bereit!' : 'Bereit?';
        
        const readyStatus = document.createElement('span');
        readyStatus.id = 'ready-status-display';
        const readyPlayers = currentGame.players.filter(p => p.isReady).length;
        const totalPlayers = currentGame.players.length;
        readyStatus.textContent = `${readyPlayers} / ${totalPlayers} Spieler bereit`;
        
        readyContainer.append(readyBtn, readyStatus);
        guessContainer.appendChild(readyContainer);
        
        elements.game.gameContentArea.innerHTML = ''; 
        elements.game.gameContentArea.appendChild(guessContainer);
        
        elements.game.timerBar.style.transition = 'none';
        elements.game.timerBar.style.width = '100%';
        setTimeout(() => {
            elements.game.timerBar.style.transition = `width ${gameCreationSettings.guessTime}s linear`;
            elements.game.timerBar.style.width = '0%';
        }, 100);
    }
    
    function setupTimelineStart(data) {
        console.log("Timeline-Modus gestartet, Basis-Song:", data.baseTrack);
        elements.countdownOverlay.classList.add('hidden');
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds;
    
        const container = document.createElement('div');
        container.className = 'round-result-container'; 
    
        const h2 = document.createElement('h2');
        h2.textContent = 'Timeline-Modus!';
        container.appendChild(h2);

        const p = document.createElement('p');
        p.textContent = 'Merkt euch diesen Song als Startpunkt:';
        container.appendChild(p);
    
        const card = document.createElement('div');
        card.className = 'correct-answer-card';
        
        const img = document.createElement('img');
        img.src = data.baseTrack.albumArtUrl || '';
        img.alt = 'Album Art';
        img.className = 'album-art';
        
        const trackInfo = document.createElement('div');
        trackInfo.className = 'track-info';
        
        const title = document.createElement('span');
        title.className = 'track-title';
        title.textContent = data.baseTrack.title;
        
        const artist = document.createElement('span');
        artist.className = 'track-artist';
        artist.textContent = data.baseTrack.artist;
        
        const year = document.createElement('span');
        year.className = 'track-year';
        year.textContent = data.baseTrack.year;
        
        trackInfo.append(title, artist, year);
        card.append(img, trackInfo);
        container.appendChild(card);
    
        elements.game.gameContentArea.innerHTML = '';
        elements.game.gameContentArea.appendChild(container);
    }
    
    function setupTimelineRound(data) {
        console.log("Neue Timeline-Runde:", data);
        elements.countdownOverlay.classList.add('hidden');
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds;
    
        const trackToGuess = data.trackToGuess;
        const currentTimeline = data.currentTimeline;
        
        const container = document.createElement('div');
        container.className = 'guess-container';
        
        const h2 = document.createElement('h2');
        h2.textContent = 'Wohin gehört dieser Song?';
        container.appendChild(h2);
        
        const songToPlace = document.createElement('div');
        songToPlace.className = 'song-to-place';
        songToPlace.textContent = `${trackToGuess.title} - ${trackToGuess.artist}`;
        container.appendChild(songToPlace);
        
        const timelineContainer = document.createElement('div');
        timelineContainer.className = 'timeline-container';
        
        currentTimeline.forEach(track => {
            const trackEl = document.createElement('div');
            trackEl.className = 'timeline-track';
            
            const img = document.createElement('img');
            img.src = track.albumArtUrl || '';
            
            const year = document.createElement('span');
            year.className = 'track-year';
            year.textContent = track.year;
            
            const title = document.createElement('span');
            title.className = 'track-title';
            title.textContent = track.title;
            
            trackEl.append(img, year, title);
            timelineContainer.appendChild(trackEl);
        });
        
        container.appendChild(timelineContainer);
        
        elements.game.gameContentArea.innerHTML = '';
        elements.game.gameContentArea.appendChild(container);
        
        elements.game.timerBar.style.transition = 'none';
        elements.game.timerBar.style.width = '100%';
        setTimeout(() => {
            elements.game.timerBar.style.transition = `width ${gameCreationSettings.guessTime}s linear`;
            elements.game.timerBar.style.width = '0%';
        }, 100);
    }
    
    function setupPopularityRound(data) {
        console.log("Neue Beliebtheit-Runde:", data);
        elements.countdownOverlay.classList.add('hidden');
        elements.game.round.textContent = data.round;
        elements.game.totalRounds.textContent = data.totalRounds;
        
        elements.game.gameContentArea.innerHTML = '<h2>Beliebtheit-Raten (UI STUB)</h2>'; 
        
        elements.game.timerBar.style.transition = 'none';
        elements.game.timerBar.style.width = '100%';
        setTimeout(() => {
            elements.game.timerBar.style.transition = `width ${gameCreationSettings.guessTime}s linear`;
            elements.game.timerBar.style.width = '0%';
        }, 100);
    }
    
    function showRoundResult(data) { 
        console.log("Round Result", data);
        
        elements.game.timerBar.style.transition = 'none';
        elements.game.timerBar.style.width = '0%';
        
        const correct = data.correctTrack;
        
        const container = document.createElement('div');
        container.className = 'round-result-container';
        
        const h2 = document.createElement('h2');
        h2.textContent = 'Runde vorbei!';
        container.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'correct-answer-card';
        
        const img = document.createElement('img');
        img.src = correct.albumArtUrl || '';
        img.alt = 'Album Art';
        img.className = 'album-art';
        
        const trackInfo = document.createElement('div');
        trackInfo.className = 'track-info';
        
        const title = document.createElement('span');
        title.className = 'track-title';
        title.textContent = correct.title; 
        
        const artist = document.createElement('span');
        artist.className = 'track-artist';
        artist.textContent = correct.artist; 
        
        const year = document.createElement('span');
        year.className = 'track-year';
        year.textContent = correct.year; 
        
        trackInfo.append(title, artist, year);
        card.append(img, trackInfo);
        container.appendChild(card);
        
        const h3 = document.createElement('h3');
        h3.textContent = 'Ergebnisse:';
        container.appendChild(h3);
        
        const detailsContainer = document.createElement('div');
        detailsContainer.className = 'round-result-details';
        
        data.scores.forEach(player => {
            const playerCard = document.createElement('div');
            playerCard.className = 'player-result-card';
            
            const playerName = document.createElement('span');
            playerName.className = 'player-name';
            playerName.textContent = player.nickname; 
            
            const breakdownEl = document.createElement('div');
            breakdownEl.className = 'points-breakdown';
            
            const totalPointsEl = document.createElement('span');
            totalPointsEl.className = 'round-total-points';
            
            if (player.lastPointsBreakdown) {
                const breakdown = player.lastPointsBreakdown.breakdown;
                Object.keys(breakdown).forEach(key => {
                    const item = document.createElement('span');
                    item.className = `point-item ${breakdown[key].points > 0 ? 'correct' : 'wrong'}`;
                    
                    const itemText = document.createElement('span');
                    itemText.textContent = `${breakdown[key].text}: `; 
                    
                    const itemPoints = document.createElement('strong');
                    itemPoints.textContent = `+${breakdown[key].points}`; 
                    
                    item.append(itemText, itemPoints);
                    breakdownEl.appendChild(item);
                });
                totalPointsEl.textContent = `+${player.lastPointsBreakdown.total}`;
            } else {
                totalPointsEl.textContent = '+0';
            }
            
            playerCard.append(playerName, breakdownEl, totalPointsEl);
            detailsContainer.appendChild(playerCard);
        });
        
        container.appendChild(detailsContainer);
        
        elements.game.gameContentArea.innerHTML = '';
        elements.game.gameContentArea.appendChild(container);
        
        renderGamePlayerList(data.scores, currentGame.isHost ? currentGame.playerId : null); 
    }
    
    function showTimelineResult(data) {
        console.log("Timeline Round Result", data);
        
        elements.game.timerBar.style.transition = 'none';
        elements.game.timerBar.style.width = '0%';
        
        const correct = data.correctTrack;
        
        const container = document.createElement('div');
        container.className = 'round-result-container';
        
        const h2 = document.createElement('h2');
        h2.textContent = 'Runde vorbei!';
        container.appendChild(h2);
        
        const card = document.createElement('div');
        card.className = 'correct-answer-card';
        
        const img = document.createElement('img');
        img.src = correct.albumArtUrl || '';
        img.alt = 'Album Art';
        img.className = 'album-art';
        
        const trackInfo = document.createElement('div');
        trackInfo.className = 'track-info';
        
        const title = document.createElement('span');
        title.className = 'track-title';
        title.textContent = correct.title; 
        
        const artist = document.createElement('span');
        artist.className = 'track-artist';
        artist.textContent = correct.artist; 
        
        const year = document.createElement('span');
        year.className = 'track-year';
        year.textContent = correct.year; 
        
        trackInfo.append(title, artist, year);
        card.append(img, trackInfo);
        container.appendChild(card);
        
        elements.game.gameContentArea.innerHTML = '';
        elements.game.gameContentArea.appendChild(container);

        renderGamePlayerList(data.scores, currentGame.isHost ? currentGame.playerId : null); 
    }
    
    async function loadFriendsData() { 
        if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            showToast("Keine Serververbindung.", true);
            return;
        }
        console.log("Lade Freunde...");
        elements.friendsModal.friendsList.innerHTML = '<li>Lade Freunde...</li>';
        elements.friendsModal.requestsList.innerHTML = '<li>Lade Anfragen...</li>';
        ws.socket.send(JSON.stringify({ type: 'load-friends' }));
    }
    
    function renderFriendsList(friends) {
        if (!elements.friendsModal.friendsList) return;
        elements.friendsModal.friendsList.innerHTML = '';
        onlineFriends = friends.filter(f => f.isOnline); 
        
        if (friends.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Du hast noch keine Freunde.';
            elements.friendsModal.friendsList.appendChild(li);
            return;
        }
        
        friends.sort((a, b) => b.isOnline - a.isOnline);
        
        friends.forEach(friend => {
            const li = document.createElement('li');
            
            const infoEl = document.createElement('div');
            infoEl.className = 'friend-info';
            
            const nameEl = document.createElement('span');
            nameEl.className = 'friend-name';
            nameEl.textContent = friend.username; 
            
            const statusEl = document.createElement('span');
            statusEl.className = `friend-status ${friend.isOnline ? 'online' : ''}`;
            statusEl.textContent = friend.isOnline ? 'Online' : 'Offline'; 
            
            infoEl.append(nameEl, statusEl);
            
            const actionsEl = document.createElement('div');
            actionsEl.className = 'friend-actions';
            
            if (pendingGameInvites[friend.id]) {
                actionsEl.innerHTML = `
                    <button class="button-primary button-small button-join" data-friend-id="${friend.id}" title="Lobby beitreten">
                        <i class="fa-solid fa-right-to-bracket"></i> Beitreten
                    </button>
                `; 
            } else {
                actionsEl.innerHTML = `
                    <button class="button-icon button-gift" data-friend-id="${friend.id}" data-friend-name="${friend.username}" title="Spots schenken"><i class="fa-solid fa-gift"></i></button>
                    <button class="button-icon button-danger button-remove-friend" data-friend-id="${friend.id}" data-friend-name="${friend.username}" title="Freund entfernen"><i class="fa-solid fa-user-minus"></i></button>
                `;
            }
            
            li.append(infoEl, actionsEl);
            elements.friendsModal.friendsList.appendChild(li);
        });
    }

    function renderRequestsList(requests) {
        if (!elements.friendsModal.requestsList) return;
        elements.friendsModal.requestsList.innerHTML = '';
        
        if (requests.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Keine neuen Anfragen.';
            elements.friendsModal.requestsList.appendChild(li);
            elements.friendsModal.requestsCount.classList.add('hidden');
            return;
        }
        
        elements.friendsModal.requestsCount.textContent = requests.length;
        elements.friendsModal.requestsCount.classList.remove('hidden');

        requests.forEach(req => {
            const li = document.createElement('li');
            
            const infoEl = document.createElement('div');
            infoEl.className = 'friend-info';
            
            const nameEl = document.createElement('span');
            nameEl.className = 'friend-name';
            nameEl.textContent = req.username; 
            
            infoEl.appendChild(nameEl);
            
            const actionsEl = document.createElement('div');
            actionsEl.className = 'friend-actions';
            actionsEl.innerHTML = `
                <button class="button-icon button-primary button-accept-request" data-sender-id="${req.id}" title="Annehmen"><i class="fa-solid fa-check"></i></button>
                <button class="button-icon button-danger button-decline-request" data-sender-id="${req.id}" title="Ablehnen"><i class="fa-solid fa-user-minus"></i></button>
            `;
            
            li.append(infoEl, actionsEl);
            elements.friendsModal.requestsList.appendChild(li);
        });
    }
    
    async function fetchHostData(isRefresh = false) {
        console.log(`Fetching host data... Refresh: ${isRefresh}`);
        if (!spotifyToken) {
            showToast("Spotify ist nicht verbunden.", true);
            return;
        }
        
        if (allPlaylists.length > 0 && availableDevices.length > 0 && !isRefresh) {
            console.log("Using cached host data.");
            renderPaginatedPlaylists(allPlaylists, 1);
            renderDeviceList(availableDevices);
            return;
        }

        setLoading(true, "Lade Spotify-Daten...");
        try {
            const authHeader = { 'Authorization': `Bearer ${spotifyToken}` };
            
            const [deviceResponse, playlistResponse] = await Promise.all([
                fetch('/api/devices', { headers: authHeader }),
                fetch('/api/playlists', { headers: authHeader })
            ]);

            if (!deviceResponse.ok) throw new Error(`Gerätefehler: ${deviceResponse.statusText}`);
            const deviceData = await deviceResponse.json();
            availableDevices = deviceData.devices || [];
            renderDeviceList(availableDevices);

            if (!playlistResponse.ok) throw new Error(`Playlistfehler: ${playlistResponse.statusText}`);
            const playlistData = await playlistResponse.json();
            allPlaylists = playlistData.items || [];
            renderPaginatedPlaylists(allPlaylists, 1);
            
            console.log(`Fetched ${availableDevices.length} devices and ${allPlaylists.length} playlists.`);

        } catch (error) {
            console.error("Error fetching host data:", error);
            showToast(`Fehler: ${error.message}`, true);
            spotifyToken = null; 
            checkSpotifyStatus();
        } finally {
            setLoading(false);
        }
    }

    function renderDeviceList(devices) {
        if (!elements.deviceSelectModal.list) return;
        elements.deviceSelectModal.list.innerHTML = '';
        if (devices.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Keine aktiven Geräte gefunden. Starte Spotify auf einem Gerät.';
            elements.deviceSelectModal.list.appendChild(li);
            return;
        }
        devices.forEach(device => {
            const li = document.createElement('li');
            li.dataset.deviceId = device.id;
            li.dataset.deviceName = device.name;
            
            const btn = document.createElement('button');
            btn.className = 'button-select';
            if(device.is_active) btn.classList.add('active');
            
            const icon = document.createElement('i');
            icon.className = `fa-solid ${getDeviceIcon(device.type)}`;
            
            btn.append(icon, ` ${device.name}`); 
            
            li.appendChild(btn);
            elements.deviceSelectModal.list.appendChild(li);
        });
    }
    
    function getDeviceIcon(type) {
        switch (type.toLowerCase()) {
            case 'computer': return 'fa-desktop';
            case 'smartphone': return 'fa-mobile-alt';
            case 'speaker': return 'fa-volume-high';
            default: return 'fa-question-circle';
        }
    }

    function renderPaginatedPlaylists(playlistsToRender, page = 1) {
        if (!elements.playlistSelectModal.list) return;
        
        const searchTerm = elements.playlistSelectModal.search.value.toLowerCase();
        const filteredPlaylists = searchTerm 
            ? playlistsToRender.filter(p => p.name.toLowerCase().includes(searchTerm))
            : playlistsToRender;

        currentPage = page;
        const totalPages = Math.ceil(filteredPlaylists.length / itemsPerPage);
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedItems = filteredPlaylists.slice(startIndex, endIndex);

        elements.playlistSelectModal.list.innerHTML = '';
        if (paginatedItems.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Keine Playlists gefunden.';
            elements.playlistSelectModal.list.appendChild(li);
        } else {
            paginatedItems.forEach(p => {
                const li = document.createElement('li');
                li.dataset.playlistId = p.id;
                li.dataset.playlistName = p.name;
                
                const btn = document.createElement('button');
                btn.className = 'button-select';
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = p.name; 
                
                const countSpan = document.createElement('span');
                countSpan.style.color = 'var(--text-muted-color)';
                countSpan.style.fontSize = '0.8rem';
                countSpan.textContent = ` (${p.tracks.total} Songs)`; 
                
                btn.append(nameSpan, countSpan);
                li.appendChild(btn);
                elements.playlistSelectModal.list.appendChild(li);
            });
        }

        if (elements.playlistSelectModal.pagination) {
            elements.playlistSelectModal.pagination.innerHTML = '';
            if (totalPages > 1) {
                const prevBtn = document.createElement('button');
                prevBtn.className = 'button-secondary button-small';
                prevBtn.textContent = 'Zurück';
                prevBtn.dataset.page = (page - 1).toString();
                prevBtn.disabled = page === 1;
                elements.playlistSelectModal.pagination.appendChild(prevBtn);

                const pageIndicator = document.createElement('span');
                pageIndicator.textContent = `Seite ${page} / ${totalPages}`;
                pageIndicator.style.fontSize = '0.9rem';
                elements.playlistSelectModal.pagination.appendChild(pageIndicator);

                const nextBtn = document.createElement('button');
                nextBtn.className = 'button-secondary button-small';
                nextBtn.textContent = 'Vor';
                nextBtn.dataset.page = (page + 1).toString();
                nextBtn.disabled = page === totalPages;
                elements.playlistSelectModal.pagination.appendChild(nextBtn);
            }
        }
    }
    
    function openCustomValueModal(type, title, min = 1, max = 100) { 
        currentCustomType = { type, min, max };
        customValueInput = "";
        elements.customValueModal.title.textContent = title; 
        elements.customValueModal.display.forEach(d => d.textContent = "");
        elements.customValueModal.confirmBtn.disabled = true;
        elements.customValueModal.overlay.classList.remove('hidden');
    }

    function showInvitePopup(from, pin, fromUserId) { 
        if (activePopups.invite) {
            activePopups.invite.remove();
        }
        
        const popup = document.createElement('div');
        popup.className = 'invite-popup';
        
        const p = document.createElement('p');
        const nameSpan = document.createElement('span');
        nameSpan.id = 'invite-sender-name';
        nameSpan.textContent = from; 
        p.append(nameSpan, ' lädt dich ein!');
        
        const actions = document.createElement('div');
        actions.className = 'invite-actions';
        actions.innerHTML = `
            <button class="accept-invite-button button-primary button-small">Annehmen</button>
            <button class="decline-invite-button button-secondary button-small">Ablehnen</button>
        `;
            
        popup.append(p, actions);
        elements.popups.container.appendChild(popup);
        activePopups.invite = popup;
        
        const closePopup = () => {
            popup.remove();
            activePopups.invite = null;
            renderFriendsList(onlineFriends);
        };
        
        popup.querySelector('.accept-invite-button').onclick = () => {
            if(!currentUser){ showToast("Anmelden/Gast zuerst.", true); return; } 
            if(!ws.socket || ws.socket.readyState !== WebSocket.OPEN){ showToast("Keine Serververbindung.", true); return; } 
            setLoading(true, "Trete Lobby bei..."); 
            ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pin, user: currentUser } })); 
            delete pendingGameInvites[fromUserId];
            closePopup();
        };
        popup.querySelector('.decline-invite-button').onclick = () => {
            delete pendingGameInvites[fromUserId];
            closePopup();
        };
        
        setTimeout(closePopup, 10000);
    }
    
    function showFriendRequestPopup(from, senderId) {
        if (activePopups.friendRequest) {
            activePopups.friendRequest.remove();
        }
        
        const popup = document.createElement('div');
        popup.className = 'friend-request-popup';
        
        const p = document.createElement('p');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = from; 
        p.append(nameSpan, ' hat dir eine Freundschaftsanfrage gesendet!');
        
        const actions = document.createElement('div');
        actions.className = 'invite-actions';
        actions.innerHTML = `
            <button class="button-primary button-small accept-friend-request">Annehmen</button>
            <button class="button-secondary button-small decline-friend-request">Ablehnen</button>
        `;
            
        popup.append(p, actions);
        elements.popups.container.appendChild(popup);
        activePopups.friendRequest = popup;
        
        const closePopup = () => {
            popup.remove();
            activePopups.friendRequest = null;
        };
        
        popup.querySelector('.accept-friend-request').onclick = () => {
            if (ws.socket?.readyState === WebSocket.OPEN) {
                ws.socket.send(JSON.stringify({ type: 'accept-friend-request', payload: { senderId: senderId } }));
            }
            closePopup();
        };
        popup.querySelector('.decline-friend-request').onclick = () => {
            if (ws.socket?.readyState === WebSocket.OPEN) {
                ws.socket.send(JSON.stringify({ type: 'decline-friend-request', payload: { friendId: senderId } }));
            }
            closePopup();
        };
        
        setTimeout(closePopup, 10000);
    }
    
    function handlePresetClick(e, groupId) { 
        const btn = e.target.closest('.preset-button');
        if (!btn || !btn.closest('.preset-group')) return;
        
        const presetGroup = btn.closest('.preset-group');
        presetGroup.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const value = btn.dataset.value;
        const type = btn.dataset.type;
        
        if (value === 'custom') {
            if (type === 'song-count') openCustomValueModal('song-count', 'Anzahl Songs', 1, 999);
            else if (type === 'guess-time') openCustomValueModal('guess-time', 'Ratezeit (Sek.)', 10, 999); 
            else if (type === 'lives') openCustomValueModal('lives', 'Leben', 1, 999);
            return;
        }

        if (currentGame.pin && currentGame.isHost) {
            let setting = {};
            if (groupId === 'song-count-presets') setting.songCount = parseInt(value);
            if (groupId === 'guess-time-presets') setting.guessTime = parseInt(value);
            
            ws.socket.send(JSON.stringify({
                type: 'update-settings',
                payload: setting
            }));
        }
    }
    
    async function handleGiftSpots(friendId, friendName) {
        if (!elements.giftModal.overlay) return;
        elements.giftModal.recipientName.textContent = friendName || '...';
        elements.giftModal.overlay.classList.remove('hidden');
        
        elements.giftModal.sendBtn.onclick = () => {
            const amount = parseInt(elements.giftModal.spotsAmount.value, 10);
            if (!amount || amount <= 0 || amount > userProfile.spots) {
                showToast("Ungültige Anzahl oder nicht genug Spots.", true);
                return;
            }
            
            showConfirmModal(
                `Senden bestätigen`,
                `Möchtest du ${amount} 🎵 an ${friendName} senden?`,
                () => {
                    if (ws.socket?.readyState === WebSocket.OPEN) {
                        setLoading(true, "Geschenk wird gesendet...");
                        ws.socket.send(JSON.stringify({
                            type: 'handle-gift',
                            payload: {
                                recipientId: friendId,
                                itemType: 'spots',
                                amount: amount
                            }
                        }));
                        elements.giftModal.overlay.classList.add('hidden');
                        elements.giftModal.spotsAmount.value = '';
                    }
                }
            );
        };
    }
    
    function sendGuess() {
        if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) return;
        
        const guess = {
            title: document.getElementById('guess-input-title')?.value || '',
            artist: document.getElementById('guess-input-artist')?.value || '',
            year: document.getElementById('guess-input-year')?.value || ''
        };
        
        ws.socket.send(JSON.stringify({
            type: 'submit-guess',
            payload: { guess }
        }));
    }

    function addEventListeners() {
        try { 
            console.log("Adding all application event listeners...");
            
            document.body.addEventListener('click', (e) => {
                const btn = e.target.closest('.reaction-btn');
                if (btn && ws.socket?.readyState === WebSocket.OPEN && !reactionCooldown) {
                    
                    reactionCooldown = true;
                    elements.game.reactionButtons.classList.add('cooldown');
                    
                    ws.socket.send(JSON.stringify({
                        type: 'send-reaction',
                        payload: { reaction: btn.dataset.reaction }
                    }));
                    
                    setTimeout(() => {
                        reactionCooldown = false;
                        if (elements.game.reactionButtons) {
                            elements.game.reactionButtons.classList.remove('cooldown');
                        }
                    }, 2000); 
                }
                
                const helpIcon = e.target.closest('.help-icon');
                if (helpIcon && helpIcon.title) {
                    e.preventDefault();
                    showToast(helpIcon.title, false);
                }
            });
            
            elements.leaveGameButton?.addEventListener('click', goBack);
            elements.leaveConfirmModal.cancelBtn?.addEventListener('click', () => elements.leaveConfirmModal.overlay.classList.add('hidden'));
            elements.leaveConfirmModal.confirmBtn?.addEventListener('click', () => { if (ws.socket && ws.socket.readyState === WebSocket.OPEN) { ws.socket.send(JSON.stringify({ type: 'leave-game', payload: { pin: currentGame.pin, playerId: currentGame.playerId } })); } localStorage.removeItem('fakesterGame'); currentGame = { pin: null, playerId: null, isHost: false, gameMode: null, lastTimeline: [], players: [], settings: {} }; screenHistory = ['auth-screen', 'home-screen']; showScreen('home-screen'); elements.leaveConfirmModal.overlay.classList.add('hidden'); });

            elements.auth.loginForm?.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signInWithPassword.bind(supabase.auth), e.target, false); });
            elements.auth.registerForm?.addEventListener('submit', (e) => { e.preventDefault(); handleAuthAction(supabase.auth.signUp.bind(supabase.auth), e.target, true); });
            elements.auth.showRegister?.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm?.classList.add('hidden'); elements.auth.registerForm?.classList.remove('hidden'); });
            elements.auth.showLogin?.addEventListener('click', (e) => { e.preventDefault(); elements.auth.loginForm?.classList.remove('hidden'); elements.auth.registerForm?.classList.add('hidden'); });

            elements.guestModal.openBtn?.addEventListener('click', () => { elements.guestModal.overlay?.classList.remove('hidden'); elements.guestModal.input?.focus(); });
            elements.guestModal.closeBtn?.addEventListener('click', () => elements.guestModal.overlay?.classList.add('hidden'));
            elements.guestModal.submitBtn?.addEventListener('click', () => { const nickname = elements.guestModal.input?.value; if (!nickname || nickname.trim().length < 3 || nickname.trim().length > 15) { showToast("Nickname muss 3-15 Zeichen lang sein.", true); return; } elements.guestModal.overlay?.classList.add('hidden'); initializeApp({ username: nickname }, true); });

            elements.home.logoutBtn?.addEventListener('click', handleLogout);
            elements.home.spotifyConnectBtn?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/login'; });
            elements.home.createRoomBtn?.addEventListener('click', () => showScreen('mode-selection-screen'));
            elements.home.joinRoomBtn?.addEventListener('click', () => { if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN) { showToast("Verbindung zum Server wird aufgebaut...", true); connectWebSocket(); return; } pinInput = ""; elements.joinModal.pinDisplay?.forEach(d => d.textContent = ""); elements.joinModal.overlay?.classList.remove('hidden'); });
            elements.home.statsBtn?.addEventListener('click', () => showScreen('stats-screen'));
            elements.home.achievementsBtn?.addEventListener('click', () => showScreen('achievements-screen'));
            elements.home.levelProgressBtn?.addEventListener('click', () => showScreen('level-progress-screen'));
            elements.home.profileTitleBtn?.addEventListener('click', () => showScreen('title-selection-screen'));
            elements.home.profilePictureBtn?.addEventListener('click', () => showScreen('icon-selection-screen'));
            elements.home.friendsBtn?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { loadFriendsData(); elements.friendsModal.overlay?.classList.remove('hidden'); } });
            elements.home.usernameContainer?.addEventListener('click', () => { if (!currentUser || currentUser.isGuest) return; elements.changeNameModal.input.value = currentUser.username; elements.changeNameModal.overlay?.classList.remove('hidden'); elements.changeNameModal.input?.focus(); });
            elements.home.shopButton?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { loadShopItems(); showScreen('shop-screen'); } });
            elements.home.customizationBtn?.addEventListener('click', () => { if(currentUser && !currentUser.isGuest) { renderCustomizationMenu(); showScreen('customization-screen'); } }); 

            elements.endScreen.backButton?.addEventListener('click', () => {
                showScreen('home-screen');
                screenHistory = ['auth-screen', 'home-screen']; 
            });

             elements.modeSelection.container?.addEventListener('click', (e) => { 
                const mb=e.target.closest('.mode-box'); 
                if(mb && !mb.disabled){ 
                    selectedGameMode=mb.dataset.mode; 
                    console.log(`Mode: ${selectedGameMode}`); 
                    
                    gameCreationSettings = { gameType: null, lives: 3, guessTypes: [], answerType: 'freestyle', guessTime: 30 };
                    
                    if (elements.gameTypeScreen.createLobbyBtn) elements.gameTypeScreen.createLobbyBtn.disabled=true; 
                    if (elements.gameTypeScreen.pointsBtn) elements.gameTypeScreen.pointsBtn.classList.remove('active'); 
                    if (elements.gameTypeScreen.livesBtn) elements.gameTypeScreen.livesBtn.classList.remove('active'); 
                    if (elements.gameTypeScreen.livesSettings) elements.gameTypeScreen.livesSettings.classList.add('hidden'); 
                    
                    elements.gameTypeScreen.quizSettingsContainer.classList.toggle('hidden', selectedGameMode !== 'quiz');
                    
                    showScreen('game-type-selection-screen'); 
                } 
            });
            
            elements.gameTypeScreen.pointsBtn?.addEventListener('click', () => { gameCreationSettings.gameType='points'; elements.gameTypeScreen.pointsBtn.classList.add('active'); elements.gameTypeScreen.livesBtn?.classList.remove('active'); elements.gameTypeScreen.livesSettings?.classList.add('hidden'); if(elements.gameTypeScreen.createLobbyBtn) elements.gameTypeScreen.createLobbyBtn.disabled=false; });
            elements.gameTypeScreen.livesBtn?.addEventListener('click', () => { gameCreationSettings.gameType='lives'; elements.gameTypeScreen.pointsBtn?.classList.remove('active'); elements.gameTypeScreen.livesBtn.classList.add('active'); elements.gameTypeScreen.livesSettings?.classList.remove('hidden'); if(elements.gameTypeScreen.createLobbyBtn) elements.gameTypeScreen.createLobbyBtn.disabled=false; });
            elements.gameTypeScreen.livesPresets?.addEventListener('click', (e) => { const btn=e.target.closest('.preset-button'); if(btn){ elements.gameTypeScreen.livesPresets.querySelectorAll('.preset-button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); const v=btn.dataset.value; if(v==='custom'){ openCustomValueModal('lives', 'Leben', 1, 999); } else { gameCreationSettings.lives=parseInt(v); console.log(`Lives: ${gameCreationSettings.lives}`); } } });
            
            elements.gameTypeScreen.guessTypesCheckboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    const checked = Array.from(elements.gameTypeScreen.guessTypesCheckboxes).filter(c => c.checked).map(c => c.value);
                    if (checked.length === 0) {
                        elements.gameTypeScreen.guessTypesError.classList.remove('hidden');
                    } else {
                        elements.gameTypeScreen.guessTypesError.classList.add('hidden');
                    }
                    gameCreationSettings.guessTypes = checked;
                });
            });
            elements.gameTypeScreen.answerTypePresets?.addEventListener('click', (e) => {
                const btn = e.target.closest('.preset-button');
                if (btn) {
                    elements.gameTypeScreen.answerTypePresets.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    gameCreationSettings.answerType = btn.dataset.value;
                }
            });
            
            elements.gameTypeScreen.createLobbyBtn?.addEventListener('click', () => { 
                if(!selectedGameMode || !gameCreationSettings.gameType){ showToast("Modus/Typ fehlt.", true); return; } 
                if(selectedGameMode === 'quiz' && gameCreationSettings.guessTypes.length === 0) {
                    showToast("Wähle mindestens eine Sache zum Raten aus.", true);
                    elements.gameTypeScreen.guessTypesError.classList.remove('hidden');
                    return;
                }
                if (!ws.socket || ws.socket.readyState !== WebSocket.OPEN){ showToast("Keine Serververbindung.", true); return; } 
                
                setLoading(true, "Lobby wird erstellt...");
                
                ws.socket.send(JSON.stringify({ 
                    type: 'create-game', 
                    payload: { 
                        user: currentUser, 
                        token: spotifyToken, 
                        gameMode: selectedGameMode,
                        ...gameCreationSettings 
                    } 
                })); 
            });

            elements.lobby.inviteFriendsBtn?.addEventListener('click', async () => { 
                elements.inviteFriendsModal.list.innerHTML = '';
                if(onlineFriends.length === 0) {
                    elements.inviteFriendsModal.list.innerHTML = '<li>Keine Freunde online.</li>';
                } else {
                    onlineFriends.forEach(friend => {
                        const li = document.createElement('li');
                        const isCoolingDown = inviteCooldowns[friend.id];
                        const btn = document.createElement('button');
                        btn.className = 'button-select';
                        btn.dataset.friendId = friend.id;
                        btn.disabled = isCoolingDown;
                        btn.textContent = friend.username; 
                        
                        if (isCoolingDown) {
                            const waitSpan = document.createElement('span');
                            waitSpan.style.color = 'var(--text-muted-color)';
                            waitSpan.style.fontSize = '0.8rem';
                            waitSpan.textContent = ' (Warte...)';
                            btn.appendChild(waitSpan);
                        }
                        li.appendChild(btn);
                        elements.inviteFriendsModal.list.appendChild(li);
                    });
                }
                elements.inviteFriendsModal.overlay.classList.remove('hidden');
            });
            elements.lobby.deviceSelectBtn?.addEventListener('click', async () => { await fetchHostData(false); elements.deviceSelectModal.overlay?.classList.remove('hidden'); }); 
            elements.lobby.playlistSelectBtn?.addEventListener('click', async () => { await fetchHostData(false); elements.playlistSelectModal.overlay?.classList.remove('hidden'); });
            
            elements.lobby.songCountPresets?.addEventListener('click', (e) => handlePresetClick(e, 'song-count-presets'));
            elements.lobby.guessTimePresets?.addEventListener('click', (e) => handlePresetClick(e, 'guess-time-presets'));
            
            elements.lobby.startGameBtn?.addEventListener('click', () => { if (elements.lobby.startGameBtn && !elements.lobby.startGameBtn.disabled && ws.socket?.readyState === WebSocket.OPEN) { setLoading(true, "Spiel startet..."); ws.socket.send(JSON.stringify({ type: 'start-game', payload: { pin: currentGame.pin } })); } else { showToast("Wähle Gerät & Playlist.", true); } });

            elements.game.gameContentArea?.addEventListener('input', (e) => {
                if (e.target.classList.contains('guess-input')) {
                    if (guessDebounceTimer) clearTimeout(guessDebounceTimer);
                    guessDebounceTimer = setTimeout(sendGuess, 300); 
                }
            });
            
            elements.game.gameContentArea?.addEventListener('click', (e) => {
                const mcButton = e.target.closest('.mc-button');
                const readyButton = e.target.closest('#player-ready-button');

                if (mcButton && !mcButton.classList.contains('active')) {
                    const group = mcButton.closest('.mc-button-group');
                    const guessType = group.dataset.guessType;
                    const value = mcButton.dataset.value;

                    group.querySelectorAll('.mc-button').forEach(btn => btn.classList.remove('active'));
                    mcButton.classList.add('active');
                    
                    const guess = {
                        title: (guessType === 'title') ? value : document.querySelector('.mc-button-group[data-guess-type="title"] .active')?.dataset.value || '',
                        artist: (guessType === 'artist') ? value : document.querySelector('.mc-button-group[data-guess-type="artist"] .active')?.dataset.value || '',
                        year: (guessType === 'year') ? value : document.querySelector('.mc-button-group[data-guess-type="year"] .active')?.dataset.value || ''
                    };
                    ws.socket.send(JSON.stringify({ type: 'submit-guess', payload: { guess } }));
                    
                    const allTypesGuessed = gameCreationSettings.guessTypes.every(type => {
                        return document.querySelector(`.mc-button-group[data-guess-type="${type}"] .active`);
                    });

                    if (allTypesGuessed) {
                        ws.socket.send(JSON.stringify({ type: 'player-ready' }));
                        document.getElementById('player-ready-button')?.setAttribute('disabled', 'true');
                        document.getElementById('player-ready-button').textContent = 'Bereit!';
                    }
                }
                
                if (readyButton && !readyButton.disabled) {
                    if (ws.socket?.readyState === WebSocket.OPEN) {
                        ws.socket.send(JSON.stringify({ type: 'player-ready' }));
                        readyButton.setAttribute('disabled', 'true');
                        readyButton.textContent = 'Bereit!';
                    }
                }
            });
            
            elements.titles.list?.addEventListener('click', (e) => { const card = e.target.closest('.title-card:not(.locked)'); if (card) { equipTitle(parseInt(card.dataset.titleId), true); } });
            elements.icons.list?.addEventListener('click', (e) => { const card = e.target.closest('.icon-card:not(.locked)'); if (card) { equipIcon(parseInt(card.dataset.iconId), true); } });
            
            elements.customize.tabsContainer?.addEventListener('click', (e) => {
                const tab = e.target.closest('.tab-button');
                if (tab && !tab.classList.contains('active')) {
                    elements.customize.tabsContainer.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
                    elements.customize.tabContents.forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(tab.dataset.tab)?.classList.add('active');
                }
            });
            elements.customize.titlesList?.addEventListener('click', (e) => { const card = e.target.closest('.title-card:not(.locked)'); if (card) { equipTitle(parseInt(card.dataset.titleId), true); } });
            elements.customize.iconsList?.addEventListener('click', (e) => { const card = e.target.closest('.icon-card:not(.locked)'); if (card) { equipIcon(parseInt(card.dataset.iconId), true); } });
            elements.customize.colorsList?.addEventListener('click', (e) => { const card = e.target.closest('.color-card:not(.locked)'); if (card) { const colorId = card.dataset.colorId === '' ? null : parseInt(card.dataset.colorId); equipColor(colorId, true); } });
            
            elements.customize.accentColorsList?.addEventListener('click', (e) => { 
                const card = e.target.closest('.color-card:not(.locked)'); 
                if (card) { 
                    const colorId = card.dataset.colorId === '' ? null : parseInt(card.dataset.colorId); 
                    equipAccentColor(colorId, true); 
                } 
            });
            
            elements.customize.backgroundsList?.addEventListener('click', (e) => {
                const card = e.target.closest('.background-card:not(.locked)');
                if (card) {
                    const bgId = card.dataset.bgId;
                    equipBackground(bgId, true); 
                }
            });

            elements.shop.screen?.addEventListener('click', (e) => { const buyBtn = e.target.closest('.buy-button:not([disabled])'); if (buyBtn) { handleBuyItem(buyBtn.dataset.itemId); } });
            
            document.querySelectorAll('.button-exit-modal').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.add('hidden')));
            
            elements.joinModal.numpad?.addEventListener('click', (e) => { 
                const btn=e.target.closest('button'); 
                if(!btn) return; 
                const key=btn.dataset.key, action=btn.dataset.action; 
                let confirmBtn = elements.joinModal.numpad.querySelector('[data-action="confirm"]'); 
                if(key >= '0' && key <= '9' && pinInput.length < 4) {
                    pinInput += key; 
                } else if(action==='clear'||action==='backspace') {
                    pinInput = pinInput.slice(0, -1); 
                } else if(action==='confirm' && pinInput.length===4) { 
                    if(!currentUser){ showToast("Anmelden/Gast zuerst.", true); return; } 
                    if(!ws.socket || ws.socket.readyState !== WebSocket.OPEN){ showToast("Keine Serververbindung.", true); return; } 
                    setLoading(true, "Trete Lobby bei..."); 
                    ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pinInput, user: currentUser } })); 
                    pinInput = ""; 
                } 
                elements.joinModal.pinDisplay?.forEach((d,i)=>d.textContent=pinInput[i]||""); 
                if(confirmBtn) confirmBtn.disabled = pinInput.length !== 4; 
            });
            
            elements.friendsModal.tabsContainer?.addEventListener('click', (e) => { const tab = e.target.closest('.tab-button'); if (tab && !tab.classList.contains('active')) { elements.friendsModal.tabs?.forEach(t => t.classList.remove('active')); elements.friendsModal.tabContents?.forEach(c => c.classList.remove('active')); tab.classList.add('active'); document.getElementById(tab.dataset.tab)?.classList.add('active'); } });
            elements.friendsModal.addFriendBtn?.addEventListener('click', async () => { 
                const name = elements.friendsModal.addFriendInput.value; 
                if(name && ws.socket?.readyState === WebSocket.OPEN) { 
                    ws.socket.send(JSON.stringify({ type: 'add-friend', payload: { friendName: name } }));
                    elements.friendsModal.addFriendInput.value = ''; 
                }
            });
            elements.friendsModal.requestsList?.addEventListener('click', (e) => { 
                const acceptBtn = e.target.closest('.button-accept-request');
                const declineBtn = e.target.closest('.button-decline-request');
                if (acceptBtn && ws.socket?.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'accept-friend-request', payload: { senderId: acceptBtn.dataset.senderId } }));
                } else if (declineBtn && ws.socket?.readyState === WebSocket.OPEN) {
                    ws.socket.send(JSON.stringify({ type: 'decline-friend-request', payload: { friendId: declineBtn.dataset.senderId } }));
                }
            });
            elements.friendsModal.friendsList?.addEventListener('click', (e) => { 
                const removeBtn = e.target.closest('.button-remove-friend'); 
                const giftBtn = e.target.closest('.button-gift'); 
                const joinBtn = e.target.closest('.button-join');
                
                if (removeBtn && ws.socket?.readyState === WebSocket.OPEN) { 
                    showConfirmModal("Freund entfernen", `Möchtest du ${removeBtn.dataset.friendName || 'diesen Freund'} wirklich entfernen?`, () => {
                        ws.socket.send(JSON.stringify({ type: 'remove-friend', payload: { friendId: removeBtn.dataset.friendId } }));
                    });
                } else if (giftBtn) { 
                    handleGiftSpots(giftBtn.dataset.friendId, giftBtn.dataset.friendName); 
                } else if (joinBtn) {
                    const friendId = joinBtn.dataset.friendId;
                    const pin = pendingGameInvites[friendId];
                    if (pin && ws.socket?.readyState === WebSocket.OPEN) {
                        setLoading(true, "Trete Lobby bei...");
                        ws.socket.send(JSON.stringify({ type: 'join-game', payload: { pin: pin, user: currentUser } }));
                        elements.friendsModal.overlay.classList.add('hidden');
                        delete pendingGameInvites[friendId];
                    } else {
                        showToast("Einladung ist abgelaufen oder ungültig.", true);
                        delete pendingGameInvites[friendId];
                        renderFriendsList(onlineFriends);
                    }
                }
            });

            elements.giftModal.spotsAmount?.addEventListener('input', () => {
                try {
                    const amount = parseInt(elements.giftModal.spotsAmount.value, 10);
                    const canAfford = amount > 0 && amount <= userProfile.spots;
                    elements.giftModal.sendBtn.disabled = !canAfford;
                } catch (e) {
                    elements.giftModal.sendBtn.disabled = true;
                }
            });
            
            elements.inviteFriendsModal.list?.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-friend-id]');
                if (btn && !btn.disabled && ws.socket?.readyState === WebSocket.OPEN) {
                    const friendId = btn.dataset.friendId;
                    
                    if (inviteCooldowns[friendId]) return;
                    
                    ws.socket.send(JSON.stringify({ type: 'invite-friend', payload: { friendId: friendId } }));
                    
                    btn.disabled = true;
                    btn.textContent = `${btn.textContent} (Gesendet)`;
                    inviteCooldowns[friendId] = true;
                    
                    setTimeout(() => {
                        delete inviteCooldowns[friendId];
                        const friend = onlineFriends.find(f => f.id === friendId);
                        if (btn) { 
                            btn.disabled = false;
                            btn.textContent = friend ? friend.username : 'Freund';
                        }
                    }, 10000); 
                }
            });
            
            elements.customValueModal.numpad?.addEventListener('click', (e) => { 
                const btn=e.target.closest('button'); if(!btn) return; 
                const key=btn.dataset.key, action=btn.dataset.action;
                if(key >= '0' && key <= '9' && customValueInput.length < 3) {
                    customValueInput += key; 
                } else if(action==='clear'||action==='backspace') {
                    customValueInput = customValueInput.slice(0, -1); 
                }
                elements.customValueModal.display.forEach((d,i)=>d.textContent=customValueInput[i]||""); 
                
                const value = parseInt(customValueInput || "0");
                const isValid = value >= currentCustomType.min && value <= currentCustomType.max;
                elements.customValueModal.confirmBtn.disabled = !isValid;
            });
            elements.customValueModal.confirmBtn?.addEventListener('click', () => { 
                const value = parseInt(customValueInput);
                if (!currentCustomType || isNaN(value) || value < currentCustomType.min || value > currentCustomType.max) {
                    showToast(`Ungültiger Wert. Muss zwischen ${currentCustomType.min} und ${currentCustomType.max} sein.`, true);
                    return;
                }
                
                let setting = {};
                const updateButtonText = (presetContainer, value, customValueType) => {
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
                    }
                };

                if (currentCustomType.type === 'song-count') {
                    setting.songCount = value;
                    updateButtonText(elements.lobby.songCountPresets, value, 'song-count');
                } else if (currentCustomType.type === 'guess-time') {
                    setting.guessTime = value;
                    gameCreationSettings.guessTime = value; 
                    updateButtonText(elements.lobby.guessTimePresets, value, 'guess-time');
                } else if (currentCustomType.type === 'lives') {
                    gameCreationSettings.lives = value;
                    updateButtonText(elements.gameTypeScreen.livesPresets, value, 'lives');
                }
                
                if (currentGame.pin && currentGame.isHost && (currentCustomType.type === 'song-count' || currentCustomType.type === 'guess-time')) {
                    ws.socket.send(JSON.stringify({ type: 'update-settings', payload: setting }));
                }

                elements.customValueModal.overlay.classList.add('hidden');
            });
            
            elements.changeNameModal.submitBtn?.addEventListener('click', async () => { console.log("Change name submit"); showToast("Name ändern (STUB)", false); });
            
            elements.deviceSelectModal.refreshBtn?.addEventListener('click', () => fetchHostData(true));
            elements.deviceSelectModal.list?.addEventListener('click', (e) => { 
                const li = e.target.closest('li[data-device-id]');
                if (li && ws.socket?.readyState === WebSocket.OPEN && currentGame.isHost) {
                    const { deviceId, deviceName } = li.dataset;
                    ws.socket.send(JSON.stringify({
                        type: 'update-settings',
                        payload: { deviceId, deviceName }
                    }));
                    elements.deviceSelectModal.overlay?.classList.add('hidden');
                }
            });
            
            elements.playlistSelectModal.search?.addEventListener('input', () => { 
                clearTimeout(elements.playlistSelectModal.search.debounceTimer); 
                elements.playlistSelectModal.search.debounceTimer = setTimeout(() => { 
                    renderPaginatedPlaylists(allPlaylists, 1); 
                }, 300); 
            });
            elements.playlistSelectModal.list?.addEventListener('click', (e) => { 
                const li = e.target.closest('li[data-playlist-id]');
                if (li && ws.socket?.readyState === WebSocket.OPEN && currentGame.isHost) {
                    const { playlistId, playlistName } = li.dataset;
                    ws.socket.send(JSON.stringify({
                        type: 'update-settings',
                        payload: { playlistId, playlistName }
                    }));
                    elements.playlistSelectModal.overlay?.classList.add('hidden');
                }
            });
            elements.playlistSelectModal.pagination?.addEventListener('click', (e) => { 
                const btn = e.target.closest('button[data-page]');
                if (btn && !btn.disabled) {
                    const newPage = parseInt(btn.dataset.page);
                    renderPaginatedPlaylists(allPlaylists, newPage);
                }
            });

            elements.confirmActionModal.cancelBtn?.addEventListener('click', () => { elements.confirmActionModal.overlay?.classList.add('hidden'); currentConfirmAction = null; });
            elements.confirmActionModal.confirmBtn?.addEventListener('click', () => { if (typeof currentConfirmAction === 'function') { currentConfirmAction(); } elements.confirmActionModal.overlay?.classList.add('hidden'); currentConfirmAction = null; });

            toggleConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.toggle('hidden'));
            closeConsoleBtn?.addEventListener('click', () => onPageConsole?.classList.add('hidden'));
            clearConsoleBtn?.addEventListener('click', () => { if (consoleOutput) consoleOutput.innerHTML = ''; });
            copyConsoleBtn?.addEventListener('click', () => { if (!consoleOutput) return; const txt = Array.from(consoleOutput.children).map(e => e.dataset.rawText || e.textContent).join('\n'); navigator.clipboard.writeText(txt).then(() => showToast('Logs kopiert!', false), err => { console.error('Fehler: Logs kopieren:', err); showToast('Kopieren fehlgeschlagen.', true); }); });

            console.log("All event listeners added successfully.");

        } catch (error) {
            console.error("FATAL ERROR adding event listeners:", error);
            logToPage('error', ["FATAL ERROR adding event listeners:", error]);
            document.body.innerHTML = `<div class="fatal-error"><h1>Fehler</h1><p>Ein unerwarteter Fehler ist beim Initialisieren aufgetreten. (${error.message}) Bitte lade die Seite neu.</p></div>`;
        }
    }

    async function initializeSupabase() {
        try {
            console.log("Fetching /api/config...");
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error(`Config fetch failed: ${response.statusText}`);
            const config = await response.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) { throw new Error("Supabase config missing."); }

            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { global: { fetch: (...args) => window.fetch(...args) }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
            console.log("Supabase client initialized.");

            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`Supabase Auth Event: ${event}`, session ? `User: ${session.user.id}` : 'No session');
                if (event === 'SIGNED_OUT') { 
                    currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null; 
                    ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); ownedAccentColorIds.clear(); inventory = {};
                    if (ws.socket?.readyState === WebSocket.OPEN) ws.socket.close(1000); 
                    if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null; 
                    localStorage.removeItem('fakesterGame'); screenHistory = ['auth-screen']; showScreen('auth-screen'); 
                    document.body.classList.add('is-guest'); setLoading(false); 
                    elements.home.spotifyConnectBtn?.classList.remove('hidden'); elements.home.createRoomBtn?.classList.add('hidden'); 
                    return; 
                }
                if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                     if (!window.initializeAppRunning && (!currentUser || currentUser.id !== session.user.id)) {
                          window.initializeAppRunning = true; console.log(`Session available/updated for ${session.user.id}. Initializing app...`); setLoading(true, "Lade Profil...");
                          try { initializeApp(session.user, false); }
                          catch(initError) { console.error("Error calling initializeApp:", initError); setLoading(false); showScreen('auth-screen'); }
                          finally { window.initializeAppRunning = false; }
                     } else if (event === 'TOKEN_REFRESHED') { console.log("Token refreshed, checking Spotify status (async)..."); checkSpotifyStatus(); }
                     else if (!window.initializeAppRunning) { console.log("App already initialized for this session or init running."); }
                } else if (!session && !['USER_UPDATED', 'PASSWORD_RECOVERY', 'MFA_CHALLENGE_VERIFIED'].includes(event)) {
                     console.log(`No active session or invalid (Event: ${event}). Showing auth.`);
                     if (currentUser) { 
                         currentUser = null; userProfile = {}; userUnlockedAchievementIds = []; spotifyToken = null; 
                         ownedTitleIds.clear(); ownedIconIds.clear(); ownedBackgroundIds.clear(); ownedColorIds.clear(); ownedAccentColorIds.clear(); inventory = {};
                         if (ws.socket?.readyState === WebSocket.OPEN) ws.socket.close(1000); 
                         if (wsPingInterval) clearInterval(wsPingInterval); wsPingInterval = null; ws.socket = null; 
                         localStorage.removeItem('fakesterGame'); 
                    }
                     screenHistory = ['auth-screen']; showScreen('auth-screen'); setLoading(false);
                }
            });

            console.log("Getting initial session...");
            const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
            if(sessionError){ console.error("Error getting initial session:", sessionError); showScreen('auth-screen'); setLoading(false); }
            else if (!initialSession) {
                if (!document.getElementById('auth-screen')?.classList.contains('active')) { console.log("Initial: No session, show auth."); showScreen('auth-screen'); }
                else { console.log("Initial: No session, auth active."); }
                setLoading(false);
                checkSpotifyStatus(); 
             }

        } catch (error) { console.error("FATAL Supabase init error:", error); document.body.innerHTML = `<div class="fatal-error"><h1>Init Fehler</h1><p>App konnte nicht laden. (${error.message})</p></div>`; setLoading(false); }
    }

    addEventListeners(); 
    initializeSupabase(); 

});