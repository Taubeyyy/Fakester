// script.js - Aggressively Simplified Full Structure

console.log("Script file loaded and executing..."); // Log 1

document.addEventListener('DOMContentLoaded', () => {
    console.log("[LOG] DOMContentLoaded event fired."); // Log 2

    // --- Minimales Setup ---
    let supabase = null; // Nur deklarieren
    let elements = {};
    const consoleOutput = document.getElementById('console-output');
    const onPageConsole = document.getElementById('on-page-console');
    const toggleConsoleBtn = document.getElementById('toggle-console-btn');

    // --- Logging ---
    const logToPage = (type, args) => { if (!consoleOutput) { /*alert(`No consoleOutput! ${type}: ${args.join(' ')}`);*/ return; } try { const message = args.map(String).join(' '); const logEntry = document.createElement('div'); logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { console.error("Error logging to page console:", e); alert("LogToPage Error: " + e.message);} };
    console.log = (...args) => logToPage('log', args);
    console.error = (...args) => logToPage('error', args);
    window.onerror = (message) => { logToPage('error', ['🚨 Uncaught Error:', message]); alert("Uncaught Error: " + message); return true; };
    window.onunhandledrejection = (event) => { const reason = event.reason instanceof Error ? event.reason.message : String(event.reason); logToPage('error', ['🚧 Unhandled Rejection:', reason]); alert("Unhandled Rejection: " + reason); };
    console.log("[LOG] Logging setup complete."); // Log 3
    // --- Ende Logging ---

    // --- Platzhalter ---
    const initializeApp = () => { console.log("initializeApp placeholder"); alert("initializeApp placeholder!");};
    const handleAuthAction = () => { console.log("handleAuthAction placeholder"); alert("handleAuthAction placeholder!");};
    const initializeSupabase = async () => { console.log("initializeSupabase placeholder"); /* Kein Supabase Code hier! */ };
    console.log("[LOG] Placeholders defined."); // Log 4

    // --- Event Listeners Hinzufügen ---
    try {
        console.log("[LOG] Adding essential event listeners..."); // Log 5

        // Console Button
        if (toggleConsoleBtn) {
            toggleConsoleBtn.addEventListener('click', () => {
                console.log("[Event] Toggle Console click");
                alert("Toggle Console Button Clicked!");
                onPageConsole?.classList.toggle('hidden');
            });
        } else {
            alert("FEHLER: Konsole-Toggle-Button NICHT gefunden!"); // Kritischer Fehlercheck
            console.error("FEHLER: Konsole-Toggle-Button NICHT gefunden!");
            logToPage('error', ["FEHLER: Konsole-Toggle-Button NICHT gefunden!"]);
        }
         // Füge hier nur die ALLERNÖTIGSTEN Listener für den Auth-Screen hinzu
         document.getElementById('guest-mode-button')?.addEventListener('click', () => { console.log("[Event] Guest button click"); alert("Guest Button!"); initializeApp();}); // Ruft Placeholder auf
         document.getElementById('show-register-form')?.addEventListener('click', (e) => { console.log("[Event] Show Register click"); e.preventDefault(); alert("Show Register!"); document.getElementById('login-form')?.classList.add('hidden'); document.getElementById('register-form')?.classList.remove('hidden'); });
         document.getElementById('show-login-form')?.addEventListener('click', (e) => { console.log("[Event] Show Login click"); e.preventDefault(); alert("Show Login!"); document.getElementById('login-form')?.classList.remove('hidden'); document.getElementById('register-form')?.classList.add('hidden'); });
         document.getElementById('login-form')?.addEventListener('submit', (e) => { console.log("[Event] Login submit click"); e.preventDefault(); alert("Login Submit!"); handleAuthAction();}); // Ruft Placeholder auf
         document.getElementById('register-form')?.addEventListener('submit', (e) => { console.log("[Event] Register submit click"); e.preventDefault(); alert("Register Submit!"); handleAuthAction();}); // Ruft Placeholder auf

        console.log("[LOG] Essential listeners added successfully."); // Log 6

    } catch (error) {
        console.error("[ERROR] FATAL ERROR adding event listeners:", error);
        logToPage('error', ["[ERROR] FATAL ERROR adding event listeners:", error]);
        alert("FATAL ERROR adding event listeners: " + error.message);
        return; // Stoppen
    }

    // --- DOM Elemente holen (weggelassen) ---
    // console.log("[LOG] Getting remaining DOM elements..."); // WEGGELASSEN

    // --- Supabase Initialisierung (weggelassen) ---
    // console.log("[LOG] Starting Supabase initialization..."); // WEGGELASSEN
    // initializeSupabase(); // WEGGELASSEN

    console.log("[LOG] End of DOMContentLoaded reached."); // Log 7

}); // Ende DOMContentLoaded

console.log("Script file finished initial execution."); // Log 8
