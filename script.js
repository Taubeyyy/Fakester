// script.js - Minimal Version to find early errors

alert("TEST 1: Script file loaded!");

document.addEventListener('DOMContentLoaded', () => {
    alert("TEST 2: DOMContentLoaded event fired!");

    let elements = {};
    const consoleOutput = document.getElementById('console-output'); // For manual logging if console works
    const logToPage = (type, args) => { if (!consoleOutput) return; try { const message = args.map(String).join(' '); const logEntry = document.createElement('div'); logEntry.textContent = `[${type.toUpperCase()}] ${new Date().toLocaleTimeString()}: ${message}`; consoleOutput.appendChild(logEntry); consoleOutput.scrollTop = consoleOutput.scrollHeight; } catch (e) { console.error("Error logging to page console:", e); } };
    console.log = (...args) => logToPage('log', args); // Redirect console.log
    console.error = (...args) => logToPage('error', args); // Redirect console.error

    try {
        alert("TEST 3: Getting essential DOM elements...");
        elements = {
            auth: {
                loginForm: document.getElementById('login-form'),
                registerForm: document.getElementById('register-form'),
                showRegister: document.getElementById('show-register-form'),
                showLogin: document.getElementById('show-login-form')
            },
            guestModal: {
                 openBtn: document.getElementById('guest-mode-button')
            },
            // WICHTIG: Die Konsole selbst
            toggleConsoleBtn: document.getElementById('toggle-console-btn'),
            onPageConsole: document.getElementById('on-page-console')
        };
        // Check if critical elements exist
        if (!elements.auth?.loginForm || !elements.guestModal?.openBtn || !elements.toggleConsoleBtn || !elements.onPageConsole) {
             throw new Error("Kritische Auth- oder Konsolen-Elemente im HTML nicht gefunden!");
        }
        alert("TEST 4: Essential DOM elements retrieved successfully.");

    } catch (error) {
         alert("FATAL ERROR getting DOM elements: " + error.message);
         console.error("[ERROR] FATAL ERROR getting DOM elements:", error);
         logToPage('error', ["[ERROR] FATAL ERROR getting DOM elements:", error]);
         return; // Stop execution
    }

    try {
        alert("TEST 5: Adding event listeners...");

        // Auth Screen Listeners
        elements.auth?.loginForm?.addEventListener('submit', (e) => { e.preventDefault(); alert("Login Submit!"); });
        elements.auth?.registerForm?.addEventListener('submit', (e) => { e.preventDefault(); alert("Register Submit!"); });
        elements.auth?.showRegister?.addEventListener('click', (e) => { e.preventDefault(); alert("Show Register!"); elements.auth?.loginForm?.classList.add('hidden'); elements.auth?.registerForm?.classList.remove('hidden'); });
        elements.auth?.showLogin?.addEventListener('click', (e) => { e.preventDefault(); alert("Show Login!"); elements.auth?.loginForm?.classList.remove('hidden'); elements.auth?.registerForm?.classList.add('hidden'); });

        // Gast Modal Button
        elements.guestModal?.openBtn?.addEventListener('click', () => { alert("Guest Button!"); });

        // Console Button Listener
        elements.toggleConsoleBtn?.addEventListener('click', () => {
             alert("Toggle Console Button!");
             elements.onPageConsole?.classList.toggle('hidden');
        });

        alert("TEST 6: Event listeners added successfully.");

    } catch (error) {
        alert("FATAL ERROR adding event listeners: " + error.message);
        console.error("[ERROR] FATAL ERROR adding event listeners:", error);
        logToPage('error', ["[ERROR] FATAL ERROR adding event listeners:", error]);
    }

    // initializeSupabase(); // Weggelassen für den Test

}); // Ende DOMContentLoaded

alert("TEST 7: Script file finished initial execution (outside DOMContentLoaded).");
