import type { CreatureInstance } from '../systems/CreatureInstance.ts';
import { getMove } from '../data/moves.ts';
import { TYPE_COLORS } from '../data/types.ts';
import type { MapDef } from '../data/mapSchema.ts';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing HUD element #${id}`);
  return found as T;
}

export interface DialoguePage {
  speaker: string;
  text: string;
}

export class HUD {
  private minimap = el<HTMLCanvasElement>('minimap');
  private minimapCtx = this.minimap.getContext('2d')!;
  private partyHpEl = el<HTMLElement>('party-hp');
  private battleLogEl = el<HTMLElement>('battle-log');
  private dialogueBoxEl = el<HTMLElement>('dialogue-box');
  private dialogueSpeakerEl = el<HTMLElement>('dialogue-speaker');
  private dialogueTextEl = el<HTMLElement>('dialogue-text');
  private battleHudEl = el<HTMLElement>('battle-hud');
  private battleOpponentInfoEl = el<HTMLElement>('battle-opponent-info');
  private moveWheelEl = el<HTMLElement>('move-wheel');
  private btnFlee = el<HTMLButtonElement>('btn-flee');
  private btnCapture = el<HTMLButtonElement>('btn-capture');
  private btnInteract = el<HTMLButtonElement>('btn-interact');
  private btnMenu = el<HTMLButtonElement>('btn-menu');
  private menuScreenEl = el<HTMLElement>('menu-screen');
  private titleScreenEl = el<HTMLElement>('title-screen');

  private dialogueQueue: DialoguePage[] = [];
  private dialogueResolve?: () => void;

  onInteractPressed?: () => void;

  constructor() {
    this.dialogueBoxEl.addEventListener('click', () => this.advanceDialogue());
    this.btnInteract.addEventListener('click', () => {
      if (!this.dialogueBoxEl.classList.contains('hidden')) this.advanceDialogue();
      else this.onInteractPressed?.();
    });
  }

  // ---------- Title screen ----------
  showTitleScreen(opts: { hasSave: boolean; onNewGame: () => void; onContinue: () => void }): void {
    this.titleScreenEl.classList.remove('hidden');
    this.titleScreenEl.innerHTML = '';
    const h1 = document.createElement('h1');
    h1.textContent = 'WYLDMOOR';
    const p = document.createElement('p');
    p.textContent = 'Une région inédite, des Wyldes originaux, et une aventure qui vous appartient.';
    const newBtn = document.createElement('button');
    newBtn.className = 'menu-btn';
    newBtn.textContent = 'Nouvelle Aventure';
    newBtn.onclick = opts.onNewGame;
    this.titleScreenEl.append(h1, p, newBtn);
    if (opts.hasSave) {
      const contBtn = document.createElement('button');
      contBtn.className = 'menu-btn secondary';
      contBtn.textContent = 'Continuer';
      contBtn.onclick = opts.onContinue;
      this.titleScreenEl.append(contBtn);
    }
  }

  hideTitleScreen(): void {
    this.titleScreenEl.classList.add('hidden');
  }

  // ---------- Party HP ----------
  updatePartyHp(team: CreatureInstance[]): void {
    this.partyHpEl.innerHTML = '';
    for (const creature of team) {
      const row = document.createElement('div');
      row.className = 'party-slot';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = creature.nickname;
      const lvl = document.createElement('div');
      lvl.className = 'lvl';
      lvl.textContent = `N.${creature.level}`;
      const track = document.createElement('div');
      track.className = 'hp-bar-track';
      const fill = document.createElement('div');
      const frac = creature.hpFraction;
      fill.className = `hp-bar-fill ${frac < 0.2 ? 'low' : frac < 0.5 ? 'mid' : ''}`;
      fill.style.width = `${Math.max(0, frac * 100)}%`;
      track.appendChild(fill);
      const hpText = document.createElement('div');
      hpText.className = 'hp-text';
      hpText.textContent = `${creature.currentHp}/${creature.stats.hp}`;
      row.append(name, lvl, track, hpText);
      this.partyHpEl.appendChild(row);
    }
  }

  // ---------- Dialogue ----------
  playDialogue(pages: DialoguePage[]): Promise<void> {
    return new Promise((resolve) => {
      this.dialogueQueue = [...pages];
      this.dialogueResolve = resolve;
      this.dialogueBoxEl.classList.remove('hidden');
      this.renderDialoguePage();
    });
  }

  private renderDialoguePage(): void {
    const page = this.dialogueQueue[0];
    if (!page) {
      this.dialogueBoxEl.classList.add('hidden');
      this.dialogueResolve?.();
      this.dialogueResolve = undefined;
      return;
    }
    this.dialogueSpeakerEl.textContent = page.speaker;
    this.dialogueTextEl.textContent = page.text;
  }

  private advanceDialogue(): void {
    if (this.dialogueQueue.length === 0) return;
    this.dialogueQueue.shift();
    this.renderDialoguePage();
  }

  // ---------- Battle log ----------
  clearLog(): void {
    this.battleLogEl.innerHTML = '';
  }

  pushLog(text: string): void {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = text;
    this.battleLogEl.appendChild(line);
    while (this.battleLogEl.childElementCount > 5) {
      this.battleLogEl.removeChild(this.battleLogEl.firstElementChild!);
    }
    this.battleLogEl.scrollTop = this.battleLogEl.scrollHeight;
  }

  // ---------- Battle HUD ----------
  showBattleHud(): void {
    this.battleHudEl.classList.remove('hidden');
    this.battleLogEl.classList.remove('hidden');
  }

  hideBattleHud(): void {
    this.battleHudEl.classList.add('hidden');
    this.battleLogEl.classList.add('hidden');
    this.moveWheelEl.innerHTML = '';
  }

  updateOpponentInfo(creature: CreatureInstance): void {
    const frac = creature.hpFraction;
    this.battleOpponentInfoEl.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = `${creature.nickname}  N.${creature.level}`;
    title.style.fontWeight = 'bold';
    const track = document.createElement('div');
    track.className = 'hp-bar-track';
    track.style.marginTop = '4px';
    const fill = document.createElement('div');
    fill.className = `hp-bar-fill ${frac < 0.2 ? 'low' : frac < 0.5 ? 'mid' : ''}`;
    fill.style.width = `${Math.max(0, frac * 100)}%`;
    track.appendChild(fill);
    this.battleOpponentInfoEl.append(title, track);
  }

  setCaptureEnabled(enabled: boolean): void {
    this.btnCapture.style.display = enabled ? 'inline-block' : 'none';
  }

  private static readonly MOVE_WHEEL_POSITIONS = [
    { top: '0%', left: '50%' },
    { top: '50%', left: '0%' },
    { top: '50%', left: '100%' },
    { top: '100%', left: '50%' },
  ];
  private moveWheelButtons: { moveId: string; btn: HTMLButtonElement; ppEl: HTMLElement }[] = [];

  /** Rebuilds the move buttons only when the set of known moves actually changes (e.g. level up); otherwise just refreshes cooldown/enabled state in place, since this runs every battle tick. */
  renderMoveWheel(moves: { moveId: string; cooldownRemaining: number }[], onSelect: (moveId: string) => void): void {
    const shown = moves.slice(0, 4);
    const sameShape =
      shown.length === this.moveWheelButtons.length &&
      shown.every((slot, i) => slot.moveId === this.moveWheelButtons[i].moveId);

    if (!sameShape) {
      this.moveWheelEl.innerHTML = '';
      this.moveWheelButtons = shown.map((slot, i) => {
        const move = getMove(slot.moveId);
        const btn = document.createElement('button');
        btn.className = 'move-btn';
        btn.style.top = HUD.MOVE_WHEEL_POSITIONS[i].top;
        btn.style.left = HUD.MOVE_WHEEL_POSITIONS[i].left;
        btn.style.background = TYPE_COLORS[move.type];
        const nameEl = document.createElement('div');
        nameEl.className = 'move-name';
        nameEl.textContent = move.name;
        const ppEl = document.createElement('div');
        ppEl.className = 'move-pp';
        btn.append(nameEl, ppEl);
        btn.addEventListener('click', () => onSelect(slot.moveId));
        this.moveWheelEl.appendChild(btn);
        return { moveId: slot.moveId, btn, ppEl };
      });
    }

    shown.forEach((slot, i) => {
      const entry = this.moveWheelButtons[i];
      entry.btn.disabled = slot.cooldownRemaining > 0;
      entry.ppEl.textContent = slot.cooldownRemaining > 0 ? `${slot.cooldownRemaining.toFixed(1)}s` : getMove(slot.moveId).type;
    });
  }

  bindFlee(cb: () => void): void {
    this.btnFlee.onclick = cb;
  }

  bindCapture(cb: () => void): void {
    this.btnCapture.onclick = cb;
  }

  bindMenu(cb: () => void): void {
    this.btnMenu.onclick = cb;
  }

  // ---------- Minimap ----------
  drawMinimap(map: MapDef, playerGx: number, playerGy: number): void {
    const ctx = this.minimapCtx;
    const size = this.minimap.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(10,14,10,0.9)';
    ctx.fillRect(0, 0, size, size);
    const range = 12;
    const scale = size / (range * 2);
    for (let dy = -range; dy < range; dy += 1) {
      for (let dx = -range; dx < range; dx += 1) {
        const gx = playerGx + dx;
        const gy = playerGy + dy;
        const tile = map.tiles[gy]?.[gx];
        if (!tile || tile === ' ') continue;
        ctx.fillStyle = tile === '~' ? '#3a7bd5' : tile === '#' ? '#1e5a2a' : tile === '^' ? '#8a8478' : tile === 'B' ? '#d7c9a3' : '#3f8a44';
        ctx.fillRect((dx + range) * scale, (dy + range) * scale, scale + 1, scale + 1);
      }
    }
    ctx.fillStyle = '#e8c93a';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  showMenu(contentBuilder: (root: HTMLElement, close: () => void) => void): void {
    this.menuScreenEl.classList.remove('hidden');
    this.menuScreenEl.innerHTML = '';
    contentBuilder(this.menuScreenEl, () => this.hideMenu());
  }

  hideMenu(): void {
    this.menuScreenEl.classList.add('hidden');
  }

  bindInteract(cb: () => void): void {
    this.onInteractPressed = cb;
  }
}
