import https from 'https';

const NEON_CONN = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Ae8UCthEPc4v@ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const NEON_HOST = 'ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech';
const NEON_IP = '3.18.239.121';

// Universal HTTPS-based Neon Pooler (bypasses port 5432 firewall blocking on shared hosting)
export const pool = {
  on: () => {},
  end: async () => {},
  async query(text, params = []) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ query: text, params });
      
      const options = {
        host: NEON_HOST,
        port: 443,
        path: '/sql',
        method: 'POST',
        headers: {
          'Host': NEON_HOST,
          'Neon-Connection-String': NEON_CONN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 15000
      };

      const doRequest = (opts) => {
        const req = https.request(opts, (res) => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (res.statusCode >= 400 || json.error) {
                return reject(new Error(json.message || json.error || `HTTP ${res.statusCode}`));
              }
              const rows = (json.rows || []).map(r => {
                if (r.data && typeof r.data === 'string') {
                  try { r.data = JSON.parse(r.data); } catch {}
                }
                return r;
              });
              resolve({
                rows,
                rowCount: json.rowCount ?? rows.length,
                command: json.command || 'SELECT'
              });
            } catch (e) {
              reject(new Error(`Failed to parse Neon response: ${body.slice(0, 100)}`));
            }
          });
        });

        req.on('error', (err) => {
          if (err.code === 'ENOTFOUND' && opts.host !== NEON_IP) {
            doRequest({
              ...options,
              host: NEON_IP,
              servername: NEON_HOST
            });
            return;
          }
          reject(err);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Neon query timed out'));
        });

        req.write(payload);
        req.end();
      };

      doRequest(options);
    });
  }
};

class PgDatabase {
  constructor() {
    this.pool = pool;
  }

  tableName(entity) {
    return `entity_${entity.toLowerCase()}`;
  }

  async list(entity, sort = '-created_date', limit = 500, skip = 0) {
    const table = this.tableName(entity);
    let orderClause = 'ORDER BY created_date DESC';
    if (sort) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      orderClause = `ORDER BY (data->>'${field}') ${desc ? 'DESC' : 'ASC'} NULLS LAST`;
    }

    const lim = Number(limit) || 500;
    const off = Number(skip) || 0;

    try {
      const res = await pool.query(`
        SELECT data FROM "${table}"
        ${orderClause}
        LIMIT $1 OFFSET $2
      `, [lim, off]);

      return res.rows.map(r => r.data);
    } catch (err) {
      console.warn(`[PgDB] list error for ${entity}:`, err.message);
      return [];
    }
  }

  async filter(entity, query = {}, sort = '-created_date', limit = 500, skip = 0) {
    const table = this.tableName(entity);
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, val] of Object.entries(query || {})) {
      if (val === null || val === undefined) {
        conditions.push(`(data->>'${key}') IS NULL`);
      } else if (typeof val === 'object' && val.$regex !== undefined) {
        conditions.push(`(data->>'${key}') ~* $${paramIndex}`);
        values.push(String(val.$regex));
        paramIndex++;
      } else if (typeof val === 'object' && Array.isArray(val.$in)) {
        conditions.push(`(data->>'${key}') = ANY($${paramIndex})`);
        values.push(val.$in.map(String));
        paramIndex++;
      } else if (typeof val === 'object' && val.$ne !== undefined) {
        conditions.push(`(data->>'${key}') != $${paramIndex}`);
        values.push(String(val.$ne));
        paramIndex++;
      } else {
        conditions.push(`(data->>'${key}') = $${paramIndex}`);
        values.push(String(val));
        paramIndex++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    let orderClause = 'ORDER BY created_date DESC';
    if (sort) {
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      orderClause = `ORDER BY (data->>'${field}') ${desc ? 'DESC' : 'ASC'} NULLS LAST`;
    }

    const lim = Number(limit) || 500;
    const off = Number(skip) || 0;
    values.push(lim, off);

    try {
      const res = await pool.query(`
        SELECT data FROM "${table}"
        ${whereClause}
        ${orderClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, values);

      return res.rows.map(r => r.data);
    } catch (err) {
      console.warn(`[PgDB] filter error for ${entity}:`, err.message);
      return [];
    }
  }

  async get(entity, id) {
    const table = this.tableName(entity);
    try {
      const res = await pool.query(`SELECT data FROM "${table}" WHERE id = $1`, [id]);
      return res.rows.length > 0 ? res.rows[0].data : null;
    } catch (err) {
      console.warn(`[PgDB] get error for ${entity}:`, err.message);
      return null;
    }
  }

  async create(entity, payload) {
    const table = this.tableName(entity);
    const now = new Date().toISOString();
    const id = payload.id || `${entity.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullItem = {
      ...payload,
      id,
      created_date: payload.created_date || now,
      updated_date: now
    };

    try {
      await pool.query(`
        INSERT INTO "${table}" (id, data, created_date, updated_date)
        VALUES ($1, $2::jsonb, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          data = EXCLUDED.data,
          updated_date = EXCLUDED.updated_date
      `, [id, JSON.stringify(fullItem), fullItem.created_date, now]);

      return fullItem;
    } catch (err) {
      console.error(`[PgDB] create error for ${entity}:`, err.message);
      throw err;
    }
  }

  async update(entity, id, payload) {
    const table = this.tableName(entity);
    const existing = await this.get(entity, id);
    if (!existing) return null;

    let updated = { ...existing };
    if (payload.$set) {
      Object.assign(updated, payload.$set);
    }
    if (payload.$unset) {
      for (const k of Object.keys(payload.$unset)) {
        delete updated[k];
      }
    }
    if (!payload.$set && !payload.$unset) {
      Object.assign(updated, payload);
    }

    updated.updated_date = new Date().toISOString();

    try {
      await pool.query(`
        UPDATE "${table}"
        SET data = $1::jsonb, updated_date = $2
        WHERE id = $3
      `, [JSON.stringify(updated), updated.updated_date, id]);

      return updated;
    } catch (err) {
      console.error(`[PgDB] update error for ${entity}:`, err.message);
      return null;
    }
  }

  async updateMany(entity, filter = {}, payload = {}) {
    const table = this.tableName(entity);
    const items = await this.filter(entity, filter, null, 10000, 0);
    let count = 0;

    for (const item of items) {
      const updated = await this.update(entity, item.id, payload);
      if (updated) count++;
    }

    return { modifiedCount: count };
  }

  async delete(entity, id) {
    const table = this.tableName(entity);
    try {
      const res = await pool.query(`DELETE FROM "${table}" WHERE id = $1`, [id]);
      return res.rowCount > 0;
    } catch (err) {
      console.error(`[PgDB] delete error for ${entity}:`, err.message);
      return false;
    }
  }

  async getCollection(entity) {
    return this.list(entity, '-created_date', 10000, 0);
  }
}

export const db = new PgDatabase();
