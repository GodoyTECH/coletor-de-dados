import fs from 'fs';
import path from 'path';

export function ensureStoragePath() {
  const base = process.env.STORAGE_PATH || './storage';
  const fullPath = path.resolve(process.cwd(), base);
  fs.mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

export function buildPublicFileUrl(req, filename) {
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  return `${protocol}://${req.get('host')}/files/${encodeURIComponent(filename)}`;
}
