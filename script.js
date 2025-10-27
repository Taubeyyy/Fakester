// script.js - Test ONLY toggleConsoleBtn Scope

alert("TEST 1: Script loaded");

document.addEventListener('DOMContentLoaded', () => {
    alert("TEST 2: DOMContentLoaded fired");

    let toggleConsoleBtn = null; // Deklariere mit let, um hoisting-Probleme auszuschließen

    try {
        alert("TEST 3: Before getting toggleConsoleBtn element");
        toggleConsoleBtn = document.getElementById('toggle-console-btn'); // Hole das Element

        if (!toggleConsoleBtn) {
             alert("FEHLER: toggleConsoleBtn Element wurde NICHT gefunden! Check HTML ID.");
             return; // Stoppen
        }
        alert("TEST 4: toggleConsoleBtn element FOUND.");

    } catch(e) {
         alert("FATAL ERROR getting toggleConsoleBtn: " + e.message);
         return; // Stoppen
    }

    // Funktion, die darauf zugreift
    function testAccess() {
         alert("TEST 5: Inside testAccess function, before using toggleConsoleBtn");
         try {
             if (toggleConsoleBtn) { // Versuche zuzugreifen
                 alert("TEST 6: SUCCESS! toggleConsoleBtn is accessible here.");
                 // Testweise Listener hinzufügen
                 toggleConsoleBtn.addEventListener('click', () => {
                      alert("Toggle Console Button Clicked (Minimal Test)!");
                      document.getElementById('on-page-console')?.classList.toggle('hidden');
                 });
                  alert("TEST 7: Listener for toggleConsoleBtn added.");
             } else {
                 alert("FEHLER in testAccess: toggleConsoleBtn is null/undefined!");
             }
         } catch (e) {
             // Hier sollte der "Can't find variable" Fehler kommen, wenn es ein Scope-Problem ist
             alert("FATAL ERROR inside testAccess accessing toggleConsoleBtn: " + e.message);
         }
    }

    alert("TEST 4.5: Before calling testAccess function");
    testAccess(); // Rufe die Funktion auf
    alert("TEST 8: After calling testAccess function. Script finished.");

}); // Ende DOMContentLoaded
