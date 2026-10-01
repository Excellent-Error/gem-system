import { createRequire } from 'node:module';
import path from 'node:path';
import { config } from '../config.js';
import { JsonStore } from './jsonStore.js';

const require = createRequire(import.meta.url);

export function createStore() {
  if (config.dbDriver === 'json') {
    return new JsonStore(path.join(config.dataDir, 'gem-data.json'));
  }
  if (config.dbDriver === 'sqlite') {
    return new (require('./sqliteStore.js').SqliteStore)(config.dbFile || path.join(config.dataDir, 'gem.db'));
  }
  throw new Error(`Unknown DB_DRIVER: ${config.dbDriver} (expected "sqlite" or "json")`);
}
