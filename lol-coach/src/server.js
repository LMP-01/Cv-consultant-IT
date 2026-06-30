'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const config = require('./config');
const { CoachLoop } = require('./coachLoop');
const { buildPoolDex } = require('./advisor/championDex');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '64kb' }));
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

// Fiche de ta pool : caractéristiques, build, counters, winrates par champion.
app.get('/api/pool', (_req, res) => {
  try {
    res.json(buildPoolDex(loop.ddragon));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chat : poser une question à Claude avec le contexte de jeu courant.
app.post('/api/chat', async (req, res) => {
  const message = (req.body && req.body.message ? String(req.body.message) : '').trim().slice(0, 1000);
  if (!message) return res.status(400).json({ error: 'message requis' });
  if (!loop.ai.available) {
    return res.json({ reply: null, ai: false, hint: "Active l'abonnement Claude (CLI claude) pour discuter avec le coach IA." });
  }
  try {
    const reply = await loop.ai.askQuestion(message, loop.chatContext());
    res.json({ reply: reply || null, ai: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Historique des parties jouées avec le coach (+ stats agrégées).
app.get('/api/history', (_req, res) => {
  try {
    res.json(loop.history.list());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Analyse des faiblesses récurrentes sur l'ensemble de l'historique (Claude).
app.get('/api/history/analysis', async (_req, res) => {
  if (!loop.ai.available) {
    return res.json({ analysis: null, ai: false, hint: "Active l'abonnement Claude pour analyser tes parties." });
  }
  try {
    const analysis = await loop.ai.analyzeHistory(loop.history.list());
    res.json({ analysis: analysis || null, ai: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cooldowns (Flash / ultimes) pour le tracker en jeu.
let COOLDOWNS = null;
app.get('/api/cooldowns', (_req, res) => {
  try {
    if (!COOLDOWNS) COOLDOWNS = require('../data/cooldowns.json');
    res.json(COOLDOWNS);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
