/** Wire format shared by the client and the Worker. */

export interface EntityRow {
  id: string;
  type: string;
  code: string;
  title: string;
  /** The JSON blob, transported as text exactly as stored. */
  data: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

export interface LinkRow {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

export interface Changeset {
  entities: EntityRow[];
  links: LinkRow[];
}

export interface PushRequest extends Changeset {
  /** Highest server_seq this device has already applied. */
  since: number;
}

export interface PushResponse {
  /** Server sequence assigned to each accepted row, by id. */
  applied: Record<string, number>;
  /** Rows the server refused because it holds something newer. */
  rejected: string[];
  cursor: number;
}

export interface PullResponse extends Changeset {
  /** Server sequence per row id, so the client can advance its cursor. */
  seq: Record<string, number>;
  cursor: number;
  /** True when the page was truncated and another pull should follow. */
  more: boolean;
}

/** Rows per request. Keeps a first sync off a big graph from timing out. */
export const PAGE_SIZE = 500;
