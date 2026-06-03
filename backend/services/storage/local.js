// Local-disk storage adapter. Implements the storage interface used by the
// document module. Files are written under UPLOAD_DIR (default backend/uploads,
// gitignored). This is the zero-config default so dev + tests work without any
// cloud credentials.
//
// ⚠️ On ephemeral hosts (e.g. Render's default disk) local files do NOT survive
// a redeploy/restart — point STORAGE_PROVIDER at a cloud adapter for durability.
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Keep the original extension so previews/downloads get a sensible filename,
// but the stored key is otherwise random + unguessable.
function makeKey(fileName = '') {
  const ext = path.extname(fileName || '').slice(0, 12); // guard against absurd extensions
  return `${nanoid(21)}${ext}`;
}

// Persist a buffer. Returns { key, url, size }. `url` is empty for local
// storage (downloads are streamed through the API), but cloud adapters return
// a CDN/object URL here so the same metadata shape works everywhere.
export async function save({ buffer, fileName, mimeType: _mimeType }) {
  ensureDir();
  const key = makeKey(fileName);
  await fs.promises.writeFile(path.join(UPLOAD_DIR, key), buffer);
  return { key, url: '', size: buffer.length };
}

// Resolve safely inside UPLOAD_DIR — never let a key escape via traversal.
function resolveKey(key) {
  const full = path.resolve(UPLOAD_DIR, key);
  if (!full.startsWith(UPLOAD_DIR + path.sep) && full !== UPLOAD_DIR) {
    throw new Error('Invalid storage key');
  }
  return full;
}

export function getStream(key) {
  return fs.createReadStream(resolveKey(key));
}

export async function exists(key) {
  try {
    await fs.promises.access(resolveKey(key), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function remove(key) {
  try {
    await fs.promises.unlink(resolveKey(key));
  } catch {
    // already gone — treat as success so archive/delete stays idempotent
  }
}

export const provider = 'local';
