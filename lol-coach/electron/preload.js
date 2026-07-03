'use strict';

// Pont sécurisé (contextIsolation) entre la page du coach et le process Electron.
// Permet à l'overlay plein écran de gérer le « clic-traversant » : les zones vides
// laissent passer les clics vers le jeu, les panneaux restent interactifs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coachOverlay', {
  // true si l'overlay tourne en plein écran (clic-traversant géré par survol).
  fullscreen: process.env.OVERLAY_FULLSCREEN !== '0',
  // Active/désactive l'interactivité de la souris (survol d'un panneau -> true).
  setInteractive: (on) => ipcRenderer.send('coach:interactive', !!on),
});
