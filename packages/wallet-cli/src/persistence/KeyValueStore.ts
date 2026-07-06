import type { Json } from '@metamask/utils';
import Sqlite from 'better-sqlite3';

/**
 * A synchronous key-value store backed by better-sqlite3.
 *
 * Uses a single `kv` table with TEXT key (primary key) and TEXT value
 * (JSON-serialized). Intended as the persistence backend for wallet
 * controller state.
 */
export class KeyValueStore {
  readonly #db: Sqlite.Database;

  readonly #getStmt: Sqlite.Statement<[string], { value: string } | undefined>;

  readonly #setStmt: Sqlite.Statement<[string, string], void>;

  readonly #deleteStmt: Sqlite.Statement<[string], void>;

  readonly #getAllStmt: Sqlite.Statement<[], { key: string; value: string }>;

  constructor(databasePath: string) {
    this.#db = new Sqlite(databasePath);
    this.#db.pragma('journal_mode = WAL');
    this.#db.exec(
      'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );

    this.#getStmt = this.#db.prepare('SELECT value FROM kv WHERE key = ?');
    this.#setStmt = this.#db.prepare(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
    );
    this.#deleteStmt = this.#db.prepare('DELETE FROM kv WHERE key = ?');
    this.#getAllStmt = this.#db.prepare('SELECT key, value FROM kv');
  }

  get(key: string): Json | undefined {
    const row = this.#getStmt.get(key);
    if (!row) {
      return undefined;
    }
    try {
      return JSON.parse(row.value);
    } catch {
      throw new Error(`Failed to parse stored value for key '${key}'`);
    }
  }

  set(key: string, value: Json): void {
    this.#setStmt.run(key, JSON.stringify(value));
  }

  getAll(): Record<string, Json> {
    const rows = this.#getAllStmt.all();
    const result: Record<string, Json> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        throw new Error(`Failed to parse stored value for key '${row.key}'`);
      }
    }
    return result;
  }

  delete(key: string): void {
    this.#deleteStmt.run(key);
  }

  close(): void {
    this.#db.close();
  }
}
