'use strict';

// Pont sécurisé (contextIsolation) entre la page du coach et le process Electron.
// Permet à l'overlay plein écran de gérer le « clic-traversant » : les zones vides
// laissent passer les clics vers le jeu, les panneaux restent interactifs.
const { contextBridge, ipcRenderer } = require('electron');

const style = process.env.OVERLAY_STYLE_RESOLVED || (process.platform === 'darwin' ? 'solid' : 'transparent');
contextBridge.exposeInMainWorld('coachOverlay', {
  style, // "solid" (fenêtre opaque, Mac) | "transparent" (plein écran clic-traversant)
  // true seulement en mode transparent plein écran (clic-traversant géré par survol).
  fullscreen: style === 'transparent',
  // Active/désactive l'interactivité de la souris (survol d'un panneau -> true).
  setInteractive: (on) => ipcRenderer.send('coach:interactive', !!on),
});
