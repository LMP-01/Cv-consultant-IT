import * as THREE from 'three';
import { InputManager } from './Input.ts';
import { HUD } from '../ui/HUD.ts';
import { OverworldScene } from '../world/OverworldScene.ts';
import { BattleView } from '../battle/BattleView.ts';
import { BattleController, type BattleResult } from '../battle/BattleController.ts';
import { GameState, STARTER_TOWN_MAP_ID } from '../systems/GameState.ts';
import { hasSaveGame, loadGame, saveGame } from '../systems/SaveSystem.ts';
import { CreatureInstance } from '../systems/CreatureInstance.ts';
import { getSpecies } from '../data/species.ts';
import type { WyldeActor } from '../world/WyldeActor.ts';
import type { NpcDef } from '../data/mapSchema.ts';
import { openPartyMenu, openBagMenu, openWyldexMenu, openMainMenu } from '../ui/menus.ts';

const STARTER_SPECIES_IDS = [1, 4, 7];

export class GameApp {
  private renderer: THREE.WebGLRenderer;
  private input: InputManager;
  private hud = new HUD();
  private state = new GameState();
  private overworld?: OverworldScene;
  private battleView?: BattleView;
  private battleController?: BattleController;
  private clock = new THREE.Clock();
  private mode: 'title' | 'starter' | 'overworld' | 'battle' = 'title';
  private saveTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.input = new InputManager(
      document.getElementById('scene-canvas')!,
      document.getElementById('stick-base')!,
      document.getElementById('stick-knob')!,
    );

    this.hud.showTitleScreen({
      hasSave: hasSaveGame(),
      onNewGame: () => this.startNewGame(),
      onContinue: () => this.continueGame(),
    });

    this.hud.bindMenu(() => this.openMenu());
    this.hud.bindInteract(() => this.input.queueInteract());

    requestAnimationFrame(() => this.loop());
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.overworld) {
      this.overworld.camera.aspect = w / h;
      this.overworld.camera.updateProjectionMatrix();
    }
  }

  private startNewGame(): void {
    this.state = new GameState();
    this.hud.hideTitleScreen();
    this.showStarterSelect();
  }

  private continueGame(): void {
    const loaded = loadGame();
    if (loaded) this.state = loaded;
    this.hud.hideTitleScreen();
    this.enterOverworld();
  }

  private showStarterSelect(): void {
    this.mode = 'starter';
    this.hud.showMenu((root) => {
      const title = document.createElement('h2');
      title.textContent = 'Choisissez votre premier compagnon';
      root.appendChild(title);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '24px';
      for (const speciesId of STARTER_SPECIES_IDS) {
        const species = getSpecies(speciesId);
        const btn = document.createElement('button');
        btn.className = 'menu-btn';
        btn.textContent = `${species.name} (${species.types.join('/')})`;
        btn.onclick = () => {
          const starter = new CreatureInstance(speciesId, 5);
          this.state.addToParty(starter);
          this.state.markCaught(speciesId);
          this.hud.hideMenu();
          this.enterOverworld();
        };
        row.appendChild(btn);
      }
      root.appendChild(row);
    });
  }

  private enterOverworld(): void {
    this.mode = 'overworld';
    this.battleView?.end();
    if (!this.overworld) {
      const aspect = window.innerWidth / window.innerHeight;
      this.overworld = new OverworldScene(aspect, this.state, {
        onStartWildBattle: (actor) => this.startWildBattle(actor),
        onTalkNpc: (npc) => this.talkToNpc(npc),
        onEnterMap: () => {},
      });
      this.battleView = new BattleView(this.overworld.scene, this.overworld.camera);
      this.battleController = new BattleController(this.hud, this.battleView);
    } else {
      this.overworld.loadMap(this.state.currentMapId, this.state.playerX, this.state.playerY);
    }
    this.overworld.frozen = false;
  }

  private startWildBattle(actor: WyldeActor): void {
    if (!this.overworld || !this.battleController || this.state.playerTeam.length === 0) return;
    if (this.state.partyWiped) return;
    this.mode = 'battle';
    this.overworld.frozen = true;
    const opponent = actor.spawnInstance();
    this.battleController.start({
      playerTeam: this.state.playerTeam,
      opponentTeam: [opponent],
      battleOptions: { kind: 'wild' },
      anchorPos: this.overworld.playerObject.position.clone(),
      reuseOpponentObject: actor.object,
      objectsToHide: [this.overworld.playerObject],
      state: this.state,
      onEnd: (result) => this.endWildBattle(actor, result),
    });
  }

  private endWildBattle(actor: WyldeActor, _result: BattleResult): void {
    this.overworld?.removeWylde(actor);
    if (this.state.partyWiped) this.handleBlackout();
    this.mode = 'overworld';
    if (this.overworld) this.overworld.frozen = false;
  }

  private talkToNpc(npc: NpcDef): void {
    if (!this.overworld) return;
    const alreadyDone = npc.setFlagOnComplete ? this.state.flags.has(npc.setFlagOnComplete) : false;
    const lines = alreadyDone && npc.postBattleDialogue ? npc.postBattleDialogue : npc.dialogue;
    this.overworld.frozen = true;
    this.hud
      .playDialogue(lines.map((text) => ({ speaker: npc.name, text })))
      .then(() => {
        if (npc.givesItem) this.state.addItem(npc.givesItem, 1);
        if (npc.team && !alreadyDone && this.state.playerTeam.length > 0) {
          this.startTrainerBattle(npc);
        } else {
          if (this.overworld) this.overworld.frozen = false;
        }
      });
  }

  private startTrainerBattle(npc: NpcDef): void {
    if (!this.overworld || !this.battleController || !npc.team) return;
    this.mode = 'battle';
    const opponentTeam = npc.team.map((m) => new CreatureInstance(m.speciesId, m.level));
    this.battleController.start({
      playerTeam: this.state.playerTeam,
      opponentTeam,
      battleOptions: { kind: 'trainer', trainerName: npc.name },
      anchorPos: this.overworld.playerObject.position.clone(),
      objectsToHide: [this.overworld.playerObject],
      state: this.state,
      onEnd: (result) => this.endTrainerBattle(npc, result),
    });
  }

  private endTrainerBattle(npc: NpcDef, result: BattleResult): void {
    if (result.outcome === 'victory' && npc.setFlagOnComplete) {
      this.state.flags.add(npc.setFlagOnComplete);
      if (this.overworld?.currentMap.gym?.leaderNpcId === npc.id) {
        this.state.badges.push(this.overworld.currentMap.gym.badgeName);
      }
    }
    if (this.state.partyWiped) this.handleBlackout();
    this.mode = 'overworld';
    if (this.overworld) this.overworld.frozen = false;
  }

  private handleBlackout(): void {
    this.state.healParty();
    this.hud.playDialogue([{ speaker: '...', text: 'Vos Wyldes n’ont plus de force. Vous rentrez au dernier centre de repos.' }]);
    if (this.overworld) this.overworld.loadMap(STARTER_TOWN_MAP_ID, 8, 8);
  }

  private openMenu(): void {
    if (this.mode !== 'overworld' || !this.overworld) return;
    this.overworld.frozen = true;
    openMainMenu(this.hud, this.state, {
      onParty: () => openPartyMenu(this.hud, this.state),
      onBag: () => openBagMenu(this.hud, this.state),
      onWyldex: () => openWyldexMenu(this.hud, this.state),
      onSave: () => saveGame(this.state),
      onClose: () => {
        this.hud.hideMenu();
        if (this.overworld) this.overworld.frozen = false;
      },
    });
  }

  private loop(): void {
    const dt = Math.min(0.05, this.clock.getDelta());

    if (this.mode === 'overworld' && this.overworld) {
      this.overworld.update(dt, this.input);
      this.hud.updatePartyHp(this.state.playerTeam);
      this.hud.drawMinimap(this.overworld.currentMap, this.state.playerX, this.state.playerY);
      this.renderer.render(this.overworld.scene, this.overworld.camera);
      this.saveTimer += dt;
      if (this.saveTimer > 15) {
        this.saveTimer = 0;
        saveGame(this.state);
      }
    } else if (this.mode === 'battle' && this.overworld && this.battleController) {
      this.battleController.update(dt);
      this.renderer.render(this.overworld.scene, this.overworld.camera);
    }

    requestAnimationFrame(() => this.loop());
  }
}
