import Database from "better-sqlite3";

/**
 * Initialize the database schema: create all tables and indexes if they don't exist.
 */
export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      model TEXT NOT NULL,
      provider TEXT DEFAULT 'deepseek',
      stream INTEGER DEFAULT 0,
      status_code INTEGER,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      ttfb_ms INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0.0,
      error_type TEXT,
      endpoint TEXT,
      app_source TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model);

    CREATE TABLE IF NOT EXISTS hourly_stats (
      hour_ts INTEGER NOT NULL,
      model TEXT NOT NULL,
      request_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_read_tokens INTEGER DEFAULT 0,
      total_cache_write_tokens INTEGER DEFAULT 0,
      avg_latency_ms REAL DEFAULT 0,
      avg_ttfb_ms REAL DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      PRIMARY KEY (hour_ts, model)
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      date_ts INTEGER NOT NULL,
      model TEXT NOT NULL,
      request_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_read_tokens INTEGER DEFAULT 0,
      total_cache_write_tokens INTEGER DEFAULT 0,
      avg_latency_ms REAL DEFAULT 0,
      avg_ttfb_ms REAL DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      PRIMARY KEY (date_ts, model)
    );

    CREATE TABLE IF NOT EXISTS speed_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      target_url TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      ttfb_ms INTEGER,
      success INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS pricing (
      model TEXT PRIMARY KEY,
      input_price REAL NOT NULL,
      output_price REAL NOT NULL,
      cache_read_price REAL DEFAULT 0,
      cache_write_price REAL DEFAULT 0
    );
  `);
}

/**
 * Seed default DeepSeek pricing into the pricing table.
 * Uses INSERT OR IGNORE so existing rows are not overwritten.
 */
export function seedPricing(db: Database.Database): void {
  db.exec(`
    INSERT OR IGNORE INTO pricing (model, input_price, output_price, cache_read_price, cache_write_price)
    VALUES
      ('deepseek-v4-flash',  0.00000014,  0.00000028,  0.0000000028,  0),
      ('deepseek-v4-pro',    0.000000435, 0.00000087,  0.000000003625, 0),
      ('deepseek-chat',      0.00000014,  0.00000028,  0.0000000028,  0),
      ('deepseek-reasoner',  0.00000055,  0.00000219,  0,              0);
  `);
}
