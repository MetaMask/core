import type { Json } from '@metamask/utils';
import BetterSqlite3 from 'better-sqlite3';

/**
 * A synchronous key-value store backed by better-sqlite3.
 *
 * Uses a single `kv` table with TEXT key (primary key) and TEXT value
 * (JSON-serialized). Intended as the persistence backend for wallet
 * controller state.
 */
export class KeyValueStore {
  readonly #db: BetterSqlite3.Database;

  readonly #getStmt: BetterSqlite3.Statement;

  readonly #setStmt: BetterSqlite3.Statement;

  readonly #deleteStmt: BetterSqlite3.Statement;

  readonly #getAllStmt: BetterSqlite3.Statement;

  constructor(databasePath: string) {
    this.#db = new BetterSqlite3(databasePath);
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
    const row = this.#getStmt.get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as Json) : undefined;
  }

  set(key: string, value: Json): void {
    this.#setStmt.run(key, JSON.stringify(value));
  }

  getAll(): Record<string, Json> {
    const rows = this.#getAllStmt.all() as { key: string; value: string }[];
    const result: Record<string, Json> = {};
    for (const row of rows) {
      result[row.key] = JSON.parse(row.value) as Json;
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
