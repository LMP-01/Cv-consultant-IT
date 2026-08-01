import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyPrefs, getPrefs, watchSystemTheme } from './ui/prefs';
import './styles.css';

/*
 * Les préférences d'affichage sont réappliquées ici, alors que le script en
 * tête d'`index.html` les a déjà posées. Ce n'est pas une redite : ce script
 * évite le clignotement au démarrage, celle-ci fait autorité pour la suite —
 * l'échelle typographique et le contraste que ce module valide, et le suivi du
 * thème système quand « Auto » est choisi.
 */
applyPrefs(getPrefs());
watchSystemTheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
