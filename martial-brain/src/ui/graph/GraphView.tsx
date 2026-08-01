/**
 * The interactive knowledge graph (§2.1) — the thing that makes this not a
 * training log.
 *
 * Rendering rules that are load-bearing, not decoration:
 *   · hue comes from the SECTION (5 groups), never the module (15) — a
 *     categorical palette cannot carry 15 identities;
 *   · each section also has a distinct SHAPE, which is the secondary encoding
 *     that makes the dark-mode green↔yellow pair legal;
 *   · every node is drawn with its CODE label, which is the "relief" the
 *     light-mode contrast warning requires.
 * Removing labels or shapes to tidy the picture would break the palette's
 * accessibility guarantees. See domain/schema.ts for the validator run.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getEntities, type EntityRecord } from '../../db/queries';
import { allLinks, degreeMap, egoNetwork } from '../../domain/links';
import {
  defsInSection,
  entityDef,
  SECTIONS,
  section,
  type NodeShape,
  type SectionKey,
} from '../../domain/schema';
import { useDb } from '../DbProvider';
import { Dot, Screen, sectionHue, useTheme } from '../common';
import { navigate } from '../router';
import { bounds, createNodes, settle, step, type LayoutEdge, type LayoutNode } from './layout';

const DEPTHS = [1, 2, 3] as const;

export function GraphView({ focus }: { focus?: string }): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();

  const [hidden, setHidden] = useState<Set<SectionKey>>(new Set());
  const [depth, setDepth] = useState<number>(2);
  const [selected, setSelected] = useState<string | undefined>(focus);

  useEffect(() => setSelected(focus), [focus]);

  /* ── Which slice of the graph is on screen ── */
  const graph = useMemo(() => {
    const keep = focus ? egoNetwork(db, focus, depth) : undefined;
    const degrees = degreeMap(db);
    const edges = allLinks(db);

    const visibleSections = (key: SectionKey): boolean => !hidden.has(key);
    const ids = new Set<string>();

    const all = getEntities(
      db,
      keep
        ? [...keep]
        : db
            .all<{ id: string }>(`SELECT id FROM entities WHERE deleted = 0`)
            .map((r) => r.id),
    );

    const records = new Map<string, EntityRecord>();
    for (const record of all) {
      if (!visibleSections(entityDef(record.type).section)) continue;
      records.set(record.id, record);
      ids.add(record.id);
    }

    const layoutEdges: LayoutEdge[] = edges
      .filter((e) => ids.has(e.fromId) && ids.has(e.toId))
      .map((e) => ({ from: e.fromId, to: e.toId }));

    return { records, ids: [...ids], edges: layoutEdges, degrees };
  }, [db, revision, focus, depth, hidden]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const nodesRef = useRef<Map<string, LayoutNode>>(new Map());
  const hoverRef = useRef<string | undefined>(undefined);
  const [hovered, setHovered] = useState<string | undefined>(undefined);

  /* ── Layout ── */
  useEffect(() => {
    const nodes = createNodes(graph.ids, graph.degrees);
    settle(nodes, graph.edges);
    nodesRef.current = nodes;

    // Fit to view.
    const canvas = canvasRef.current;
    if (canvas) {
      const b = bounds(nodes);
      const w = canvas.clientWidth || 800;
      const h = canvas.clientHeight || 600;
      const spanX = Math.max(b.maxX - b.minX, 1);
      const spanY = Math.max(b.maxY - b.minY, 1);
      const scale = Math.min(w / (spanX + 140), h / (spanY + 140), 2.2);
      viewRef.current = {
        scale,
        tx: w / 2 - ((b.minX + b.maxX) / 2) * scale,
        ty: h / 2 - ((b.minY + b.maxY) / 2) * scale,
      };
    }
  }, [graph]);

  /* ── Render loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let cooling = 90;

    const styles = getComputedStyle(document.documentElement);
    const lineColor = styles.getPropertyValue('--line-strong').trim() || '#888';
    const inkColor = styles.getPropertyValue('--ink').trim() || '#000';
    const mutedColor = styles.getPropertyValue('--muted').trim() || '#888';
    const surface = styles.getPropertyValue('--surface').trim() || '#fff';

    const draw = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { scale, tx, ty } = viewRef.current;
      const nodes = nodesRef.current;
      const project = (n: LayoutNode): [number, number] => [n.x * scale + tx, n.y * scale + ty];

      const active = hoverRef.current ?? selected;
      const activeNeighbours = new Set<string>();
      if (active) {
        for (const e of graph.edges) {
          if (e.from === active) activeNeighbours.add(e.to);
          if (e.to === active) activeNeighbours.add(e.from);
        }
      }

      /* Edges — recessive, 2px, and lifted only around the active node. */
      for (const edge of graph.edges) {
        const a = nodes.get(edge.from);
        const b = nodes.get(edge.to);
        if (!a || !b) continue;
        const touchesActive = active === edge.from || active === edge.to;
        const [ax, ay] = project(a);
        const [bx, by] = project(b);

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = touchesActive ? inkColor : lineColor;
        ctx.globalAlpha = active ? (touchesActive ? 0.85 : 0.15) : 0.5;
        ctx.lineWidth = touchesActive ? 2 : 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* Nodes */
      for (const [id, node] of nodes) {
        const record = graph.records.get(id);
        if (!record) continue;
        const def = entityDef(record.type);
        const sec = section(def.section);
        const hue = sectionHue(sec, theme);
        const [x, y] = project(node);
        const r = (6 + Math.min(graph.degrees.get(id) ?? 0, 10) * 0.85) * Math.min(scale, 1.4);

        const dim = active !== undefined && active !== id && !activeNeighbours.has(id);
        ctx.globalAlpha = dim ? 0.22 : 1;

        // 2px surface ring keeps overlapping marks separable.
        ctx.lineWidth = 2;
        ctx.strokeStyle = surface;
        ctx.fillStyle = hue;
        drawShape(ctx, sec.shape, x, y, r);
        ctx.fill();
        ctx.stroke();

        if (id === selected) {
          ctx.beginPath();
          ctx.arc(x, y, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = inkColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // The code label: identity never rests on hue alone.
        if (!dim && (scale > 0.55 || id === active)) {
          ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = id === active ? inkColor : mutedColor;
          ctx.fillText(record.code, x, y + r + 3);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (): void => {
      if (cooling > 0) {
        step(nodesRef.current, graph.edges);
        cooling -= 1;
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => cancelAnimationFrame(raf);
  }, [graph, theme, selected]);

  /* ── Pointer interaction: pan, zoom, tap ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let pinchStart = 0;
    let moved = 0;

    const hitTest = (cx: number, cy: number): string | undefined => {
      const { scale, tx, ty } = viewRef.current;
      let best: string | undefined;
      let bestD = 22;
      for (const [id, n] of nodesRef.current) {
        const d = Math.hypot(n.x * scale + tx - cx, n.y * scale + ty - cy);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      return best;
    };

    const local = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const onDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragging = true;
      moved = 0;
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        pinchStart = Math.hypot((p?.x ?? 0) - (q?.x ?? 0), (p?.y ?? 0) - (q?.y ?? 0));
      }
    };

    const onMove = (e: PointerEvent): void => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        const [cx, cy] = local(e);
        const hit = hitTest(cx, cy);
        if (hit !== hoverRef.current) {
          hoverRef.current = hit;
          setHovered(hit);
          canvas.style.cursor = hit ? 'pointer' : 'grab';
        }
        return;
      }

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);

      if (pointers.size === 2 && pinchStart > 0) {
        const [p, q] = [...pointers.values()];
        const dist = Math.hypot((p?.x ?? 0) - (q?.x ?? 0), (p?.y ?? 0) - (q?.y ?? 0));
        const factor = dist / pinchStart;
        pinchStart = dist;
        zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
      } else if (dragging) {
        viewRef.current.tx += dx;
        viewRef.current.ty += dy;
      }
    };

    const onUp = (e: PointerEvent): void => {
      const wasTap = moved < 6 && pointers.size === 1;
      pointers.delete(e.pointerId);
      dragging = pointers.size > 0;
      pinchStart = 0;
      if (wasTap) {
        const [cx, cy] = local(e);
        const hit = hitTest(cx, cy);
        setSelected(hit);
      }
    };

    const zoomAt = (cx: number, cy: number, factor: number): void => {
      const v = viewRef.current;
      const next = Math.max(0.15, Math.min(4, v.scale * factor));
      const k = next / v.scale;
      v.tx = cx - (cx - v.tx) * k;
      v.ty = cy - (cy - v.ty) * k;
      v.scale = next;
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.style.cursor = 'grab';

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const selectedRecord = selected ? graph.records.get(selected) : undefined;
  const hoveredRecord = hovered ? graph.records.get(hovered) : undefined;
  const shown = hoveredRecord ?? selectedRecord;

  return (
    <Screen>
      <div className="page-head">
        <div className="grow">
          <p className="sub">Graphe · §2.1</p>
          <h1>{focus ? 'Voisinage' : 'Graphe de connaissances'}</h1>
        </div>
        {focus && (
          <button type="button" className="btn" onClick={() => navigate({ name: 'graph' })}>
            Voir tout le graphe
          </button>
        )}
      </div>

      {/* Legend — always present, because identity is never colour alone */}
      <div className="chips" style={{ marginBottom: 10 }}>
        {SECTIONS.map((sec) => {
          const off = hidden.has(sec.key);
          return (
            <button
              key={sec.key}
              type="button"
              className={`chip${off ? '' : ' on'}`}
              title={defsInSection(sec.key)
                .map((d) => d.plural)
                .join(', ')}
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(sec.key)) next.delete(sec.key);
                  else next.add(sec.key);
                  return next;
                })
              }
              style={{ opacity: off ? 0.45 : 1 }}
            >
              <Dot section={sec} theme={theme} />
              <span className="t">{sec.label}</span>
            </button>
          );
        })}
      </div>

      {focus && (
        <div className="chips" style={{ marginBottom: 10 }}>
          <span className="sub" style={{ alignSelf: 'center', marginRight: 4 }}>
            Profondeur
          </span>
          {DEPTHS.map((d) => (
            <button
              key={d}
              type="button"
              className={`chip${depth === d ? ' on' : ''}`}
              onClick={() => setDepth(d)}
            >
              {d} saut{d > 1 ? 's' : ''}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)',
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 'min(62vh, 560px)', display: 'block', touchAction: 'none' }}
          aria-label={`Graphe de ${graph.ids.length} fiches et ${graph.edges.length} relations`}
        />

        {graph.ids.length === 0 && (
          <div className="empty" style={{ position: 'absolute', inset: 0, border: 'none' }}>
            Aucune fiche à afficher avec ces filtres.
          </div>
        )}

        {shown && (
          <div
            style={{
              position: 'absolute',
              left: 12,
              bottom: 12,
              right: 12,
              maxWidth: 420,
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line)',
              background: 'var(--raised)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <div className="sub">{entityDef(shown.type).plural}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
              <b>{shown.code}</b>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shown.title}
              </span>
            </div>
            {shown === selectedRecord && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => navigate({ name: 'detail', id: shown.id })}
                >
                  Ouvrir la fiche
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => navigate({ name: 'graph', focus: shown.id })}
                >
                  Centrer ici
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="sub" style={{ marginTop: 8 }}>
        {graph.ids.length} fiches · {graph.edges.length} relations · molette ou pincement pour
        zoomer, glisser pour déplacer, toucher un nœud pour le sélectionner.
      </p>
    </Screen>
  );
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: NodeShape,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(x - r * 0.86, y - r * 0.86, r * 1.72, r * 1.72);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.15, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r * 1.15, y);
      ctx.closePath();
      break;
    case 'triangle':
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.1, y + r * 0.8);
      ctx.lineTo(x - r * 1.1, y + r * 0.8);
      ctx.closePath();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + Math.cos(a) * r * 1.08;
        const py = y + Math.sin(a) * r * 1.08;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
  }
}
