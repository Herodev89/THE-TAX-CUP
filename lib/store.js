// JSON-file storage for users, employees, payroll records, runs, archive and audit.
// Every collection lives in DATA_DIR/<name>.json. Swap this module for a managed
// database (e.g. Supabase/Postgres) when deploying to a read-only host such as Vercel.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const cache = new Map();

class StorageError extends Error {}

function fileFor(name) {
  return path.join(dataDir, `${name}.json`);
}

function load(name) {
  if (cache.has(name)) return cache.get(name);
  let items = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
    if (Array.isArray(parsed)) items = parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`[store] Could not read ${name}.json:`, error.message);
  }
  cache.set(name, items);
  return items;
}

// Returns copies so callers cannot mutate the cache without saving.
function list(name) {
  return load(name).map((item) => ({ ...item }));
}

function save(name, items, { memoryFallback = false } = {}) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const target = fileFor(name);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(items, null, 2));
    fs.renameSync(temp, target);
  } catch (error) {
    if (!memoryFallback) {
      throw new StorageError('Changes could not be saved because the server storage is read-only. Configure DATA_DIR or a database.');
    }
    console.warn(`[store] ${name} kept in memory only: ${error.message}`);
  }
  cache.set(name, items);
}

function readOrCreateSecret() {
  const secretFile = path.join(dataDir, '.session-secret');
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (error) { /* create below */ }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretFile, secret, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.warn('[store] Session secret could not be persisted; sessions reset on restart.');
  }
  return secret;
}

module.exports = { list, save, readOrCreateSecret, StorageError, dataDir };
