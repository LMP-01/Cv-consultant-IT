/**
 * The contract between the language model and the database.
 *
 * The model never writes SQL and never touches the database. It translates a
 * question into this small, closed structure, which is then validated field by
 * field and executed by the ordinary search code. Anything the model invents —
 * an unknown module, a made-up field, an extra key — is dropped here rather
 * than reaching a query.
 *
 * This is also what makes small free-tier models good enough for the job:
 * emitting a dozen constrained tokens is a much easier task than writing
 * correct SQL, and the failure mode is a filter that is too broad rather than
 * a query that is wrong.
 */
import { ENTITY_DEFS, isEntityKey, type EntityKey } from '../domain/schema';
import { parseCode } from '../domain/ids';

export interface FilterSpec {
  /** Free text handed to FTS. */
  text?: string;
  types?: EntityKey[];
  /** Descriptor field → allowed values. */
  fields?: Record<string, string[]>;
  tags?: string[];
  /** Codes (K003, S001) the results must be linked to. */
  linkedTo?: string[];
}

/** Every field name any module declares — the allow-list for `fields`. */
const KNOWN_FIELDS = new Set(ENTITY_DEFS.flatMap((d) => d.fields.map((f) => f.name)));

const asStringArray = (value: unknown, limit = 20): string[] => {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, limit);
};

/**
 * Models wrap JSON in prose or fences more often than they should.
 * Pull out the first balanced object rather than failing the whole call.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next shape */
    }
  }
  throw new Error('Le modèle n’a pas renvoyé de JSON exploitable.');
}

/** Coerce arbitrary model output into a FilterSpec, discarding the rest. */
export function parseFilterSpec(raw: unknown): FilterSpec {
  if (typeof raw !== 'object' || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const spec: FilterSpec = {};

  if (typeof input.text === 'string' && input.text.trim()) {
    spec.text = input.text.trim().slice(0, 200);
  }

  const types = asStringArray(input.types).filter(isEntityKey);
  if (types.length) spec.types = types;

  const tags = asStringArray(input.tags);
  if (tags.length) spec.tags = tags;

  // Only codes that parse; a hallucinated "K999" simply drops out and the
  // query is broader, never wrong.
  const linked = asStringArray(input.linkedTo)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => parseCode(c) !== undefined);
  if (linked.length) spec.linkedTo = linked;

  if (typeof input.fields === 'object' && input.fields !== null) {
    const fields: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(input.fields as Record<string, unknown>)) {
      if (!KNOWN_FIELDS.has(name)) continue; // invented field
      const values = asStringArray(value);
      if (values.length) fields[name] = values;
    }
    if (Object.keys(fields).length) spec.fields = fields;
  }

  return spec;
}

/** True when the spec would match everything — worth telling the user. */
export function isEmptySpec(spec: FilterSpec): boolean {
  return (
    !spec.text && !spec.types?.length && !spec.tags?.length && !spec.linkedTo?.length && !spec.fields
  );
}

/** Human-readable rendering, so the user can see what was actually run. */
export function describeSpec(spec: FilterSpec): string {
  const parts: string[] = [];
  if (spec.text) parts.push(`texte « ${spec.text} »`);
  if (spec.types?.length) {
    parts.push(
      `modules : ${spec.types
        .map((t) => ENTITY_DEFS.find((d) => d.key === t)?.plural ?? t)
        .join(', ')}`,
    );
  }
  for (const [field, values] of Object.entries(spec.fields ?? {})) {
    parts.push(`${field} = ${values.join(' ou ')}`);
  }
  if (spec.tags?.length) parts.push(`tags : ${spec.tags.map((t) => `#${t}`).join(', ')}`);
  if (spec.linkedTo?.length) parts.push(`lié à ${spec.linkedTo.join(', ')}`);
  return parts.join(' · ') || 'aucun filtre';
}
