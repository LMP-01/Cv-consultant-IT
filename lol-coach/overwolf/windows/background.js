'use strict';

// Contrôleur de fond Overwolf : ouvre la fenêtre in-game quand League tourne,
// la ferme sinon, et relaie les hotkeys custom à la fenêtre in-game.
// L'UI réelle du coach est chargée par ingame.html depuis le serveur local
// (http://localhost:3000/?overlay=1) -> une seule source de vérité (web + Overwolf).

const LOL_CLASS_ID = 5426; // League of Legends (Overwolf)

function isLoL(gameInfo) {
  return gameInfo && Math.floor(gameInfo.id / 10) === LOL_CLASS_ID;
}

function openIngame() {
  overwolf.windows.obtainDeclaredWindow('ingame', (res) => {
    if (res.success) overwolf.windows.restore(res.window.id, () => {});
  });
}
function closeIngame() {
  overwolf.windows.obtainDeclaredWindow('ingame', (res) => {
    if (res.success) overwolf.windows.close(res.window.id, () => {});
  });
}

// Ouverture/fermeture selon l'état de League.
overwolf.games.onGameInfoUpdated.addListener((res) => {
  if (!res || !res.gameInfo || !isLoL(res.gameInfo)) return;
  if (res.runningChanged || res.gameChanged) {
    if (res.gameInfo.isRunning) openIngame();
    else closeIngame();
  }
});
overwolf.games.getRunningGameInfo((info) => {
  if (isLoL(info) && info.isRunning) openIngame();
});

// Hotkeys custom (clic-traversant + cycle de cible) -> relayés à la fenêtre in-game.
overwolf.settings.hotkeys.onPressed.addListener((e) => {
  overwolf.windows.sendMessage('ingame', e.name, e.name, () => {});
});
