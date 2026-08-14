/** One input per descriptor field type. Everything else composes these. */
import type { ReactNode } from 'react';
import type { FieldDef } from '../../domain/schema';

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

const asString = (v: unknown): string => (v == null ? '' : String(v));
const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function FieldInput({ field, value, onChange }: Props): ReactNode {
  const id = `f-${field.name}`;

  const control = ((): ReactNode => {
    switch (field.type) {
      case 'longtext':
        return (
          <textarea
            id={id}
            value={asString(value)}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
          />
        );

      case 'select':
        return (
          <select id={id} value={asString(value)} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div className="chips">
            {field.options?.map((o) => {
              const on = asArray(value).includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  className={`chip${on ? ' on' : ''}`}
                  onClick={() =>
                    onChange(on ? asArray(value).filter((x) => x !== o) : [...asArray(value), o])
                  }
                >
                  {o}
                </button>
              );
            })}
          </div>
        );

      case 'number':
        return (
          <input
            id={id}
            type="number"
            value={asString(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        );

      case 'percent':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Number(value ?? 0)}
              onChange={(e) => onChange(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-labelledby={`${id}-label`}
            />
            <input
              id={id}
              type="number"
              min={0}
              max={100}
              value={asString(value)}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
              style={{ width: 84 }}
            />
          </div>
        );

      case 'date':
        return (
          <input
            id={id}
            type="date"
            value={asString(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'url':
        return (
          <input
            id={id}
            type="url"
            value={asString(value)}
            placeholder="https://…"
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'tags':
        return (
          <input
            id={id}
            type="text"
            value={asArray(value).join(', ')}
            placeholder="fatigue, jambe, base"
            onChange={(e) =>
              onChange(
                e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
          />
        );

      case 'sequence':
        // One step per line: typing a combination is faster than managing a
        // list widget, and the detail view numbers them on display.
        return (
          <textarea
            id={id}
            value={asArray(value).join('\n')}
            placeholder={'Jab avant\nPas de côté\nLow kick arrière'}
            rows={4}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        );

      case 'text':
      default:
        return (
          <input
            id={id}
            type="text"
            value={asString(value)}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  })();

  return (
    <div>
      <label className="field-label" id={`${id}-label`} htmlFor={id}>
        {field.label}
      </label>
      {control}
      {field.help && <div className="field-help">{field.help}</div>}
    </div>
  );
}
