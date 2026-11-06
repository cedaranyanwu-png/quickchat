const path = require('path');

// Load server/.env even when the API is started from the project root.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const databaseUrl = String(
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PG_CONNECTION_STRING || '',
).trim();
const configuredType = String(process.env.DB_TYPE || '').trim().toLowerCase();
// Cloud platforms commonly provide DATABASE_URL without setting NODE_ENV or
// DB_TYPE. Detect that setup instead of silently falling back to an empty SQLite DB.
const requestedType = process.env.NODE_ENV === 'production'
  ? 'postgres'
  : configuredType || (databaseUrl ? 'postgres' : 'sqlite');
const aliases = {
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  mysql: 'mysql',
};
const type = aliases[requestedType];

if (!type) {
  throw new Error(
    `[Database] Unsupported DB_TYPE "${requestedType}". Use sqlite, postgres, or mysql.`,
  );
}

console.log(`[Database] Initializing ${type.toUpperCase()} connection.`);

let client;
let adapter;

if (type === 'postgres') {
  const { Pool } = require('pg');
  const sslEnabled = String(process.env.PG_SSL || '').trim().toLowerCase() === 'true' ||
    ['require', 'verify-ca', 'verify-full'].includes(String(process.env.PGSSLMODE || '').trim().toLowerCase());
  const ssl = sslEnabled ? { rejectUnauthorized: false } : undefined;
  const poolOptions = {
    ssl,
    max: positiveInteger(process.env.PG_POOL_SIZE, 10),
    idleTimeoutMillis: positiveInteger(process.env.PG_IDLE_TIMEOUT_MS, 10000),
    connectionTimeoutMillis: positiveInteger(process.env.PG_CONNECTION_TIMEOUT_MS, 10000),
  };

  if (databaseUrl) {
    client = new Pool({ ...poolOptions, connectionString: databaseUrl });
  } else {
    const host = String(process.env.PG_HOST || '').trim();
    const user = String(process.env.PG_USER || '').trim();
    const database = String(process.env.PG_DATABASE || '').trim();
    if (!host || !user || !database) {
      throw new Error(
        '[Database] PostgreSQL settings are incomplete. Set DATABASE_URL or PG_HOST, PG_PORT, PG_USER, and PG_DATABASE in server/.env.',
      );
    }
    const port = Number(process.env.PG_PORT || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('[Database] PG_PORT must be a valid port number.');
    }
    client = new Pool({
      ...poolOptions,
      host,
      port,
      user,
      password: process.env.PG_PASSWORD,
      database,
    });
  }

  client.on('error', (error) => {
    console.error('[Database] PostgreSQL pool error:', error.message);
  });

  adapter = {
    async query(sql, params = []) {
      const result = await client.query(toPostgresPlaceholders(sql), params);
      return result.rows;
    },
    async insert(sql, params = []) {
      const statement = /\bRETURNING\b/i.test(sql) ? sql : `${sql} RETURNING *`;
      const rows = await this.query(statement, params);
      return rows[0] || null;
    },
    async update(sql, params = []) {
      const result = await client.query(toPostgresPlaceholders(sql), params);
      return result.rowCount;
    },
    async delete(sql, params = []) {
      const result = await client.query(toPostgresPlaceholders(sql), params);
      return result.rowCount;
    },
    close: () => client.end(),
  };
} else if (type === 'mysql') {
  const mysql = require('mysql2/promise');
  client = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  });

  adapter = {
    async query(sql, params = []) {
      const [rows] = await client.execute(sql, params);
      return rows;
    },
    async insert(sql, params = []) {
      const [result] = await client.execute(sql, params);
      const table = sql.match(/\bINSERT\s+INTO\s+([a-zA-Z0-9_]+)/i)?.[1];
      if (!table || !result.insertId) return null;
      return this.getOne(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
    },
    async update(sql, params = []) {
      const [result] = await client.execute(sql, params);
      return result.affectedRows;
    },
    async delete(sql, params = []) {
      const [result] = await client.execute(sql, params);
      return result.affectedRows;
    },
    close: () => client.end(),
  };
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.resolve(__dirname, process.env.SQLITE_PATH || 'database.sqlite');
  client = new sqlite3.Database(dbPath, (error) => {
    if (error) console.error('[Database] SQLite connection error:', error.message);
    else console.log(`[Database] Connected to SQLite at ${dbPath}.`);
  });

  adapter = {
    // sqlite3's all() also executes CREATE/UPDATE statements and returns [] for them.
    query(sql, params = []) {
      return new Promise((resolve, reject) => {
        client.all(sql, params, (error, rows) => {
          if (error) reject(error);
          else resolve(rows || []);
        });
      });
    },
    async insert(sql, params = []) {
      const result = await runSqlite(sql, params);
      const table = sql.match(/\bINSERT\s+INTO\s+([a-zA-Z0-9_]+)/i)?.[1];
      if (!table || !result.lastID) return null;
      return this.getOne(`SELECT * FROM ${table} WHERE id = ?`, [result.lastID]);
    },
    async update(sql, params = []) {
      const result = await runSqlite(sql, params);
      return result.changes;
    },
    async delete(sql, params = []) {
      const result = await runSqlite(sql, params);
      return result.changes;
    },
    close() {
      return new Promise((resolve, reject) => {
        client.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function runSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    client.run(sql, params, function onComplete(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

const db = {
  type,
  ...adapter,
  async getOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  },
  async getCount(sql, params = []) {
    const row = await this.getOne(sql, params);
    return Number.parseInt(row?.count || 0, 10);
  },
};

module.exports = db;
