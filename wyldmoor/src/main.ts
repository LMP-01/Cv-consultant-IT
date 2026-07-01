import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { GameApp } from './core/GameApp.ts';

registerSW({ immediate: true });

const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
new GameApp(canvas);
