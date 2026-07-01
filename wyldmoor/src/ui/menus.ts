import type { HUD } from './HUD.ts';
import type { GameState } from '../systems/GameState.ts';
import { SPECIES } from '../data/species.ts';
import { getItem } from '../data/items.ts';
import { grantHealingItemEffect } from '../battle/BattleController.ts';

export interface MainMenuCallbacks {
  onParty: () => void;
  onBag: () => void;
  onWyldex: () => void;
  onSave: () => void;
  onClose: () => void;
}

export function openMainMenu(hud: HUD, state: GameState, cb: MainMenuCallbacks): void {
  hud.showMenu((root, close) => {
    const title = document.createElement('h2');
    title.textContent = `${state.playerName} — ${state.badges.length} badge(s)`;
    root.appendChild(title);
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '12px';

    const makeBtn = (label: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.className = 'menu-btn';
      btn.textContent = label;
      btn.onclick = onClick;
      return btn;
    };

    row.appendChild(makeBtn('Équipe', cb.onParty));
    row.appendChild(makeBtn('Sac', cb.onBag));
    row.appendChild(makeBtn('Wyldex', cb.onWyldex));
    row.appendChild(makeBtn('Sauvegarder', () => { cb.onSave(); close(); }));
    row.appendChild(makeBtn('Fermer', () => { cb.onClose(); }));
    root.appendChild(row);
  });
}

export function openPartyMenu(hud: HUD, state: GameState): void {
  hud.showMenu((root, close) => {
    const title = document.createElement('h2');
    title.textContent = 'Votre équipe';
    root.appendChild(title);
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '10px';
    list.style.maxHeight = '60vh';
    list.style.overflowY = 'auto';
    for (const creature of state.playerTeam) {
      const row = document.createElement('div');
      row.style.textAlign = 'left';
      row.style.background = 'rgba(255,255,255,0.08)';
      row.style.padding = '10px 14px';
      row.style.borderRadius = '8px';
      row.textContent = `${creature.nickname}  N.${creature.level}  ${creature.currentHp}/${creature.stats.hp} PV${creature.status ? `  (${creature.status})` : ''}`;
      list.appendChild(row);
    }
    root.appendChild(list);
    const back = document.createElement('button');
    back.className = 'menu-btn secondary';
    back.textContent = 'Retour';
    back.onclick = () => openMainMenuFromClose(hud, state, close);
    root.appendChild(back);
  });
}

export function openBagMenu(hud: HUD, state: GameState): void {
  hud.showMenu((root, close) => {
    const title = document.createElement('h2');
    title.textContent = 'Sac';
    root.appendChild(title);
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '10px';
    list.style.maxHeight = '60vh';
    list.style.overflowY = 'auto';
    for (const [itemId, count] of Object.entries(state.bag)) {
      if (count <= 0) continue;
      const item = getItem(itemId);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.gap = '12px';
      row.style.background = 'rgba(255,255,255,0.08)';
      row.style.padding = '10px 14px';
      row.style.borderRadius = '8px';
      const label = document.createElement('span');
      label.textContent = `${item.name} x${count}`;
      row.appendChild(label);
      if (item.category === 'healing' && state.playerTeam.length > 0) {
        const useBtn = document.createElement('button');
        useBtn.className = 'menu-btn';
        useBtn.textContent = 'Utiliser';
        useBtn.onclick = () => {
          const target = item.revives ? state.playerTeam.find((c) => c.isFainted) : state.playerTeam.find((c) => !c.isFainted);
          if (target && grantHealingItemEffect(itemId, target)) {
            state.useItem(itemId, 1);
            openBagMenu(hud, state);
          }
        };
        row.appendChild(useBtn);
      }
      list.appendChild(row);
    }
    root.appendChild(list);
    const back = document.createElement('button');
    back.className = 'menu-btn secondary';
    back.textContent = 'Retour';
    back.onclick = () => openMainMenuFromClose(hud, state, close);
    root.appendChild(back);
  });
}

export function openWyldexMenu(hud: HUD, state: GameState): void {
  hud.showMenu((root, close) => {
    const title = document.createElement('h2');
    title.textContent = `Wyldex — ${state.wyldexCaught.size}/${SPECIES.length} capturés`;
    root.appendChild(title);
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
    grid.style.gap = '8px';
    grid.style.maxHeight = '60vh';
    grid.style.overflowY = 'auto';
    grid.style.width = 'min(800px, 90vw)';
    for (const species of SPECIES) {
      const seen = state.wyldexSeen.has(species.id);
      const caught = state.wyldexCaught.has(species.id);
      if (!seen) continue;
      const cell = document.createElement('div');
      cell.style.background = caught ? 'rgba(232,201,58,0.25)' : 'rgba(255,255,255,0.08)';
      cell.style.padding = '8px';
      cell.style.borderRadius = '8px';
      cell.style.fontSize = '12px';
      cell.style.textAlign = 'left';
      cell.textContent = `#${species.id.toString().padStart(3, '0')} ${caught ? species.name : '???'}`;
      grid.appendChild(cell);
    }
    root.appendChild(grid);
    const back = document.createElement('button');
    back.className = 'menu-btn secondary';
    back.textContent = 'Retour';
    back.onclick = () => openMainMenuFromClose(hud, state, close);
    root.appendChild(back);
  });
}

function openMainMenuFromClose(hud: HUD, state: GameState, close: () => void): void {
  close();
  openMainMenu(hud, state, {
    onParty: () => openPartyMenu(hud, state),
    onBag: () => openBagMenu(hud, state),
    onWyldex: () => openWyldexMenu(hud, state),
    onSave: () => {},
    onClose: () => hud.hideMenu(),
  });
}
