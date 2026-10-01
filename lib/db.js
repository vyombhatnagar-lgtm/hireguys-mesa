import { neon } from '@neondatabase/serverless';
import { SCHEMA_SQL, RUBRIC_ROWS } from './schema';

let sqlClient;
export function sql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    // Vercel's filesystem does not persist, so the embedded fallback is local-only
    if (!url && process.env.VERCEL) throw new Error('Missing DATABASE_URL: connect a Neon database in Vercel > Storage, then redeploy');
    if (url) {
      const client = neon(url);
      sqlClient = { query: (text, params) => client.query(text, params) };
    } else {
      // No DATABASE_URL: fall back to an embedded Postgres stored in ./.localdb (local dev only)
      globalThis.__localdb ??= import('@electric-sql/pglite').then(({ PGlite }) => new PGlite('./.localdb'));
      const db = globalThis.__localdb;
      sqlClient = { query: async (text, params) => (await (await db).query(text, params)).rows };
    }
  }
  return sqlClient;
}

// Run a parameterised query: q('select * from t where id = $1', [id])
export const q = (text, params = []) => sql().query(text, params);

// Creates tables and seeds the rubric on first use. Safe to call repeatedly.
let ready;
export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      for (const stmt of SCHEMA_SQL) await q(stmt);
      const [{ n }] = await q('select count(*)::int as n from rubric_criteria');
      if (n === 0) {
        for (const r of RUBRIC_ROWS) {
          await q(
            'insert into rubric_criteria (role, position, name, description, weight) values ($1,$2,$3,$4,$5)',
            [r.role, r.position, r.name, r.description, r.weight]
          );
        }
      }
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export async function getRubric() {
  await ensureSchema();
  const rows = await q('select * from rubric_criteria order by role, position');
  rows.forEach((r) => (r.weight = Number(r.weight)));
  return { PM: rows.filter((r) => r.role === 'PM'), SPM: rows.filter((r) => r.role === 'SPM') };
}

// Update selected columns of a candidate. JSON columns are passed as objects.
const JSON_COLS = new Set(['personal', 'scores']);
export async function updateCandidate(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}${JSON_COLS.has(k) ? '::jsonb' : ''}`).join(', ');
  const vals = keys.map((k) => (JSON_COLS.has(k) ? JSON.stringify(patch[k]) : patch[k]));
  await q(`update candidates set ${sets} where id = $1`, [id, ...vals]);
}
