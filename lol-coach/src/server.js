'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const config = require('./config');
const { CoachLoop } = require('./coachLoop');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '..', 'public')));

const loop = new CoachLoop();
let lastState = null;

// Diffuse l'état à tous les clients WebSocket connectés.
function broadcast(state) {
  lastState = state;
  const payload = JSON.stringify({ type: 'state', payload: state });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        client.send(payload);
      } catch {
        /* ignore les clients morts */
      }
    }
  }
}

// Endpoint REST pratique (debug / intégrations).
app.get('/api/state', (_req, res) => {
  res.json(lastState || { phase: 'starting' });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mock: config.mockMode, ai: loop.ai.statusLabel() });
});

wss.on('connection', (ws) => {
  // Envoie immédiatement le dernier état connu au nouveau client.
  if (lastState) {
    ws.send(JSON.stringify({ type: 'state', payload: lastState }));
  }
});

server.listen(config.port, () => {
  const url = `http://localhost:${config.port}`;
  console.log('\n  ╭───────────────────────────────────────────────╮');
  console.log('  │   🐉  LoL Coach IA — temps réel                │');
  console.log('  ╰───────────────────────────────────────────────╯');
  console.log(`  Interface  : ${url}`);
  console.log(`  Mode       : ${config.mockMode ? 'DÉMO (--mock)' : 'live (client League)'}`);
  console.log(`  Moteur IA  : ${loop.ai.statusLabel()}`);
  console.log(`  Langue     : ${config.lang}`);
  console.log('  Ctrl+C pour quitter.\n');

  loop.init(broadcast).catch((err) => {
    console.error('Échec d’initialisation de la boucle de coaching:', err);
  });
});

process.on('SIGINT', () => {
  console.log('\nArrêt du coach. Bonne partie !');
  process.exit(0);
});
