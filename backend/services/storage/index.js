// Storage abstraction. Selects a file-storage adapter at startup via the
// STORAGE_PROVIDER env var (default 'local'). Every adapter implements the same
// async interface so routes never depend on the concrete backend:
//
//   save({ buffer, fileName, mimeType }) -> { key, url, size }
//   getStream(key)                       -> Readable stream
//   exists(key)                          -> Promise<boolean>
//   remove(key)                          -> Promise<void>
//
// To add Cloudinary or S3 later: drop in services/storage/cloudinary.js (or
// s3.js) implementing the same four functions, then set STORAGE_PROVIDER —
// no route changes required.
import * as local from './local.js';

const ADAPTERS = {
  local
  // cloudinary: () => import('./cloudinary.js'),  // future
  // s3:         () => import('./s3.js'),          // future
};

const name = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const adapter = ADAPTERS[name];

if (!adapter) {
  throw new Error(
    `Unknown STORAGE_PROVIDER "${name}". Supported: ${Object.keys(ADAPTERS).join(', ')}.`
  );
}

export const save = adapter.save;
export const getStream = adapter.getStream;
export const exists = adapter.exists;
export const remove = adapter.remove;
export const provider = adapter.provider;
