import fs from 'fs';
import path from 'path';

export function ensureStoragePath() {
  const base = process.env.STORAGE_PATH || './storage';
  const fullPath = path.resolve(process.cwd(), base);
  fs.mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

export function buildPublicFileUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/files/${encodeURIComponent(filename)}`;
}
