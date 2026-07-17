'use strict';

// Fenêtre in-game Overwolf : hôte transparent qui affiche l'UI du coach (iframe
// vers le serveur local) et gère le déplacement de la fenêtre + les hotkeys.
const COACH_URL = 'http://localhost:3000/?overlay=1&hud=1';
const HEALTH_URL = 'http://localhost:3000/api/health';

let clickThrough = false;
let selfWindowId = null;

overwolf.windows.getCurrentWindow((res) => { if (res.success) selfWindowId = res.window.id; });

// Déplacement de la fenêtre via la barre du haut.
document.getElementById('dragbar').addEventListener('mousedown', () => {
  if (selfWindowId) overwolf.windows.dragMove(selfWindowId);
});

// Vérifie que le serveur tourne ; sinon affiche l'aide et réessaie.
function checkServer() {
  fetch(HEALTH_URL, { cache: 'no-store' })
    .then((r) => { document.getElementById('err').style.display = r.ok ? 'none' : 'flex'; })
    .catch(() => { document.getElementById('err').style.display = 'flex'; setTimeout(checkServer, 3000); });
}
checkServer();

// Relaie les hotkeys custom reçues du background vers l'UI du coach (iframe).
overwolf.windows.onMessageReceived.addListener((msg) => {
  const name = msg && (msg.id || msg.content);
  const iframe = document.getElementById('coach');
  if (name === 'coach_cycle_next') iframe.contentWindow.postMessage({ type: 'coach-cycle-target', dir: 1 }, '*');
  else if (name === 'coach_cycle_prev') iframe.contentWindow.postMessage({ type: 'coach-cycle-target', dir: -1 }, '*');
  else if (name === 'coach_clickthrough' && selfWindowId) {
    clickThrough = !clickThrough;
    overwolf.windows.setWindowStyle(selfWindowId, clickThrough ? 'InputPassThrough' : 'Normal', () => {});
  }
});
