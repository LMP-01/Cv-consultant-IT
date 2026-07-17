'use strict';

// Overlay transparent always-on-top pour superposer le coach par-dessus le jeu.
//
//   1) Lance le serveur :   npm start
//   2) Installe Electron :  npm i -D electron     (une seule fois)
//   3) Lance l'overlay :    npm run overlay
//
// Deux modes :
//   • PLEIN ÉCRAN (défaut) : la fenêtre couvre tout l'écran, transparente et
//     CLIC-TRAVERSANTE — les zones vides laissent passer les clics vers le jeu,
//     et chaque panneau (déplaçable) reste interactif au survol. C'est ce qui
//     permet de voir TOUS les panneaux et de les placer où tu veux.
//   • FENÊTRE (OVERLAY_FULLSCREEN=0) : petite fenêtre flottante classique.
//
// Variables d'env optionnelles :
//   COACH_URL           (def. http://localhost:3000/?overlay=1)
//   OVERLAY_FULLSCREEN  ("0" pour l'ancien mode petite fenêtre)
//   OVERLAY_W / OVERLAY_H   dimensions en mode fenêtre
//   OVERLAY_CYCLE_PREV / OVERLAY_CYCLE_NEXT   touches de cycle de cible

const path = require('path');
const { app, BrowserWindow, globalShortcut, screen, ipcMain } = require('electron');

const URL = process.env.COACH_URL || 'http://localhost:3000/?overlay=1';
const W = parseInt(process.env.OVERLAY_W, 10) || 460;
const H = parseInt(process.env.OVERLAY_H, 10) || 920;

// Style de fenêtre :
//   • "solid"       : fenêtre OPAQUE always-on-top déplaçable (FIABLE sur macOS,
//                     où les overlays transparents clic-traversants sont
//                     capricieux). Défaut sur Mac.
//   • "transparent" : overlay plein écran transparent clic-traversant. Défaut
//                     sur Windows.
// Forçable via OVERLAY_STYLE=solid|transparent.
const STYLE = process.env.OVERLAY_STYLE || (process.platform === 'darwin' ? 'solid' : 'transparent');
const TRANSPARENT = STYLE === 'transparent';
// Le renderer lit ce style via le preload (process.env hérité par la fenêtre).
process.env.OVERLAY_STYLE_RESOLVED = STYLE;

let win = null;
let clickThrough = false;
let locked = false; // mode transparent : interactivité forcée (« arrangement »)

function createWindow() {
  const opts = {
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    fullscreenable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  };
  if (TRANSPARENT) {
    const b = screen.getPrimaryDisplay().bounds;
    Object.assign(opts, { transparent: true, hasShadow: false, resizable: false, x: b.x, y: b.y, width: b.width, height: b.height });
  } else {
    // Fenêtre opaque, déplaçable, à poser dans un coin ou sur un 2e écran.
    Object.assign(opts, { transparent: false, backgroundColor: '#0a0d15', hasShadow: true, resizable: true, width: W, height: H });
  }
  win = new BrowserWindow(opts);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(URL);

  if (TRANSPARENT) {
    // Clic-traversant par défaut ; le survol d'un panneau réactive l'interactivité.
    win.setIgnoreMouseEvents(true, { forward: true });
    ipcMain.on('coach:interactive', (_e, on) => {
      if (win && !locked) win.setIgnoreMouseEvents(!on, { forward: true });
    });
  }

  // Ctrl+Shift+X :
  //  • transparent -> bascule le mode « arrangement » (tout cliquable) ;
  //  • solide       -> bascule le clic-traversant global (souris passe à travers).
  globalShortcut.register('CommandOrControl+Shift+X', () => {
    if (!win) return;
    if (TRANSPARENT) {
      locked = !locked;
      win.setIgnoreMouseEvents(!locked, { forward: true });
    } else {
      clickThrough = !clickThrough;
      win.setIgnoreMouseEvents(clickThrough, { forward: true });
    }
  });
  // Ctrl+Shift+H : masque/affiche l'overlay.
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (win.isVisible()) win.hide();
    else win.show();
  });

  // Flèches gauche/droite : cycle la CIBLE du panneau Duel (même quand League a
  // le focus). Personnalisable via OVERLAY_CYCLE_PREV / OVERLAY_CYCLE_NEXT.
  const cycle = (dir) => {
    if (win && win.webContents) {
      win.webContents.executeJavaScript(`window.coachCycleTarget && window.coachCycleTarget(${dir})`).catch(() => {});
    }
  };
  const prevKey = process.env.OVERLAY_CYCLE_PREV || 'Left';
  const nextKey = process.env.OVERLAY_CYCLE_NEXT || 'Right';
  try { globalShortcut.register(prevKey, () => cycle(-1)); } catch (e) { console.warn('Raccourci', prevKey, 'indisponible:', e.message); }
  try { globalShortcut.register(nextKey, () => cycle(1)); } catch (e) { console.warn('Raccourci', nextKey, 'indisponible:', e.message); }
}

app.whenReady().then(createWindow);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
