'use strict';

// Overlay transparent always-on-top (optionnel) pour superposer le coach
// par-dessus le jeu sur un seul écran.
//
//   1) Lance le serveur :   npm start
//   2) Installe Electron :  npm i -D electron     (une seule fois)
//   3) Lance l'overlay :    npm run overlay
//
// Variables d'env optionnelles :
//   COACH_URL   (def. http://localhost:3000/?overlay=1)
//   OVERLAY_W / OVERLAY_H   dimensions de la fenêtre

const { app, BrowserWindow, globalShortcut } = require('electron');

const URL = process.env.COACH_URL || 'http://localhost:3000/?overlay=1';
const W = parseInt(process.env.OVERLAY_W, 10) || 420;
const H = parseInt(process.env.OVERLAY_H, 10) || 760;

let win = null;
let clickThrough = false;

function createWindow() {
  win = new BrowserWindow({
    width: W,
    height: H,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    fullscreenable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // Reste au-dessus même des fenêtres de jeu en plein écran (borderless).
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(URL);

  // Ctrl+Shift+X : bascule le « clic-traversant » (souris passe à travers l'overlay).
  globalShortcut.register('CommandOrControl+Shift+X', () => {
    clickThrough = !clickThrough;
    win.setIgnoreMouseEvents(clickThrough, { forward: true });
  });
  // Ctrl+Shift+H : masque/affiche l'overlay.
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (win.isVisible()) win.hide();
    else win.show();
  });
}

app.whenReady().then(createWindow);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
