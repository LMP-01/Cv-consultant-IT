"""Dashboard web « temps réel » (sans dépendance externe).

Le serveur relit les logs Claude Code à chaque appel d'API ; la page web
interroge ``/api/summary`` toutes les quelques secondes. Comme Claude Code
écrit ses logs au fil de l'eau, le tableau de bord se met à jour en direct
au fur et à mesure que les conversations consomment des tokens.

Lancement :  python -m token_tracker serve  (puis ouvrir http://localhost:8787)
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from . import advisor, aggregate, config, parser

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_payload() -> dict[str, Any]:
    cfg = config.load_config(_PROJECT_ROOT)
    plan = config.plan_settings(cfg)
    records = parser.parse_logs(project_root=_PROJECT_ROOT)
    summary = aggregate.summarize(records, plan=plan)
    summary["advice"] = advisor.global_advice(summary, top_n=12)
    summary["plan"] = plan
    return summary


INDEX_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Suivi tokens Claude</title>
<style>
  :root { --bg:#0f1419; --card:#1a2129; --accent:#e07a5f; --text:#e8e6e1;
          --muted:#8a94a0; --line:#2a333d; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif;
         background:var(--bg); color:var(--text); }
  header { padding:18px 24px; border-bottom:1px solid var(--line);
           display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; }
  h1 { font-size:18px; margin:0; font-weight:600; }
  .live { font-size:12px; color:var(--muted); }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%;
         background:#5fb37a; margin-right:6px; animation:pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  main { padding:24px; max-width:1100px; margin:0 auto; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
           gap:14px; margin-bottom:24px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
          padding:16px; }
  .card .k { font-size:12px; color:var(--muted); text-transform:uppercase;
             letter-spacing:.04em; }
  .card .v { font-size:24px; font-weight:600; margin-top:6px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px;
            padding:18px 20px; margin-bottom:20px; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.05em;
       color:var(--muted); margin:0 0 14px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-weight:500; font-size:12px; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .bar { height:6px; background:var(--accent); border-radius:3px; }
  .tag { display:inline-block; background:#252e38; color:var(--muted);
         padding:1px 7px; border-radius:5px; font-size:11px; margin-right:4px; }
  .tip { border-left:3px solid var(--accent); padding:8px 12px; margin:8px 0;
         background:#222a33; border-radius:0 6px 6px 0; }
  .tip .t { font-weight:600; font-size:14px; }
  .tip .d { color:var(--muted); font-size:13px; margin-top:3px; }
  .task-label { color:var(--text); }
  .empty { color:var(--muted); padding:20px; text-align:center; }
  .gain { color:#5fb37a; font-size:12px; }
  .window { background:linear-gradient(135deg,#1c2530,#161d26);
            border:1px solid var(--line); border-radius:12px; padding:20px 22px;
            margin-bottom:22px; }
  .window .top { display:flex; justify-content:space-between; align-items:baseline;
                 flex-wrap:wrap; gap:8px; }
  .window .pct { font-size:30px; font-weight:700; }
  .window .meta { color:var(--muted); font-size:13px; margin-top:4px; }
  .gauge { height:14px; background:#0d1217; border-radius:7px; margin:14px 0 4px;
           overflow:hidden; }
  .gauge > div { height:100%; border-radius:7px; transition:width .6s; }
  .g-ok { background:#5fb37a; } .g-warn { background:#e0a85f; }
  .g-hot { background:#e0604f; }
  .reset { font-size:13px; color:var(--text); }
  .reset b { color:var(--accent); }
</style>
</head>
<body>
<header>
  <h1>Suivi de consommation de tokens Claude</h1>
  <span class="live"><span class="dot"></span>mise à jour en direct
        · <span id="updated">—</span></span>
</header>
<main>
  <div id="window"></div>
  <div class="cards" id="cards"></div>
  <section><h2>Consommation par modèle</h2><div id="by-model"></div></section>
  <section><h2>Tâches qui consomment le plus de quota</h2><div id="tasks"></div></section>
  <section><h2>Conseils d'optimisation</h2><div id="advice"></div></section>
</main>
<script>
const money = v => '$' + (v||0).toLocaleString('fr-FR',
  {minimumFractionDigits:4, maximumFractionDigits:4});
const num = v => (v||0).toLocaleString('fr-FR');

function bar(frac){ return '<div class="bar" style="width:'+
  Math.max(2, Math.round((frac||0)*100))+'%"></div>'; }

function dur(s){ s=Math.max(0,Math.floor(s)); const h=Math.floor(s/3600),
  m=Math.floor((s%3600)/60); return h? h+' h '+String(m).padStart(2,'0')+' min' : m+' min'; }

function renderWindow(d){
  const el = document.getElementById('window');
  const st = d.window_status; const plan = d.plan || {};
  if(!st || !st.current){ el.innerHTML = ''; return; }
  const c = st.current, pct = c.pct, p100 = Math.round(pct*100);
  const cls = pct>=0.85?'g-hot':(pct>=0.6?'g-warn':'g-ok');
  const cal = st.auto_calibrated ? ' · repère auto-calibré' : '';
  el.innerHTML = `<div class="window">
    <div class="top">
      <div>
        <div style="font-size:13px;color:var(--muted);text-transform:uppercase;
             letter-spacing:.05em">Fenêtre de ${Math.round(st.window_hours)} h en cours
             · ${esc(plan.label||'')}</div>
        <div class="meta">${money(c.consumed)} éq. API consommés
             / repère ~${money(c.reference)}${cal}</div>
      </div>
      <div class="pct">${p100}%</div>
    </div>
    <div class="gauge"><div class="${cls}" style="width:${Math.min(100,p100)}%"></div></div>
    <div class="reset">Réinitialisation dans <b>${dur(c.reset_in_seconds)}</b>
         · ${num(c.messages)} messages dans cette fenêtre</div>
  </div>`;
}

function render(d){
  document.getElementById('updated').textContent =
    new Date().toLocaleTimeString('fr-FR');
  renderWindow(d);
  const t = d.totals || {};
  const wk = (d.window_status||{}).weekly || {};
  document.getElementById('cards').innerHTML = [
    ['Sur 7 jours', money(wk.consumed||0) + ' / ~' + money(wk.budget||0)],
    ['Consommation totale', money(t.total)],
    ['Messages', num(t.messages)],
    ['Tokens sortie', num(t.output_tokens)],
    ['Cache lu', num(t.cache_read_tokens)],
  ].map(([k,v])=>`<div class="card"><div class="k">${k}</div>
       <div class="v">${v}</div></div>`).join('');

  if(!d.record_count){
    document.getElementById('by-model').innerHTML =
      '<div class="empty">Aucun log Claude Code trouvé pour l’instant.</div>';
    document.getElementById('tasks').innerHTML = '';
    document.getElementById('advice').innerHTML = '';
    return;
  }

  const maxM = Math.max(...(d.by_model||[]).map(m=>m.total), 1e-9);
  document.getElementById('by-model').innerHTML =
    '<table><tr><th>Modèle</th><th class="num">Conso (éq.$)</th>'+
    '<th class="num">Msg</th><th style="width:30%"></th></tr>'+
    (d.by_model||[]).map(m=>`<tr><td>${m.model}</td>
       <td class="num">${money(m.total)}</td>
       <td class="num">${num(m.messages)}</td>
       <td>${bar(m.total/maxM)}</td></tr>`).join('')+'</table>';

  const maxT = Math.max(...(d.tasks||[]).map(x=>x.total), 1e-9);
  document.getElementById('tasks').innerHTML =
    '<table><tr><th>Tâche (premier prompt)</th><th>Modèle(s)</th>'+
    '<th class="num">Conso (éq.$)</th><th style="width:22%"></th></tr>'+
    (d.tasks||[]).slice(0,15).map(x=>`<tr>
       <td class="task-label">${esc(x.task_label)}</td>
       <td>${(x.models||[]).map(m=>'<span class="tag">'+esc(m)+'</span>').join('')}</td>
       <td class="num">${money(x.total)}</td>
       <td>${bar(x.total/maxT)}</td></tr>`).join('')+'</table>';

  const a = d.advice || {general:[], per_task:[]};
  let html = a.general.map(g=>`<div class="tip"><div class="t">${esc(g.titre)}</div>
       <div class="d">${esc(g.detail)}</div></div>`).join('');
  a.per_task.forEach(item=>{
    html += `<div style="margin-top:14px"><b>${esc(item.task_label)}</b>
       <span class="gain">(${money(item.total)})</span></div>`;
    item.tips.forEach(tp=>{
      const g = tp.gain_estime>0 ? ` <span class="gain">~${money(tp.gain_estime)}</span>`:'';
      html += `<div class="tip"><div class="t">${esc(tp.titre)}${g}</div>
         <div class="d">${esc(tp.detail)}</div></div>`;
    });
  });
  document.getElementById('advice').innerHTML =
    html || '<div class="empty">Consommation déjà bien optimisée.</div>';
}
function esc(s){ return (s||'').replace(/[&<>]/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function tick(){
  try{ const r = await fetch('/api/summary'); render(await r.json()); }
  catch(e){ /* on réessaiera au prochain tick */ }
}
tick(); setInterval(tick, 4000);
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silence le bruit dans la console
        pass

    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 (nom imposé par BaseHTTPRequestHandler)
        if self.path.startswith("/api/summary"):
            try:
                payload = json.dumps(build_payload()).encode("utf-8")
                self._send(200, payload, "application/json; charset=utf-8")
            except Exception as exc:  # robustesse : on renvoie l'erreur en JSON
                body = json.dumps({"error": str(exc)}).encode("utf-8")
                self._send(500, body, "application/json; charset=utf-8")
            return
        self._send(200, INDEX_HTML.encode("utf-8"), "text/html; charset=utf-8")


def serve(host: str = "127.0.0.1", port: int = 8787) -> None:
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Dashboard tokens Claude → http://{host}:{port}")
    print("Ctrl+C pour arrêter.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")
        server.shutdown()
