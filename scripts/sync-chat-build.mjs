import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// O vite cria em /home/godoy/dist-chat (dois níveis acima do frontend)
const distChatDir = path.resolve(rootDir, '..', 'dist-chat');

console.log('🔄 Sync Chat Build');
console.log('Root:', rootDir);
console.log('Dist Chat:', distChatDir);

// Verificar se dist-chat existe
if (!fs.existsSync(distChatDir)) {
  console.error('❌ dist-chat not found. Run npm run build:chat first.');
  process.exit(1);
}

// 1. Copiar assets -> ./assets/
const srcAssets = path.join(distChatDir, 'assets');
const destAssets = path.join(rootDir, 'assets');

if (fs.existsSync(srcAssets)) {
  console.log('📁 Copying assets...');
  // Limpar dest assets
  if (fs.existsSync(destAssets)) {
    fs.rmSync(destAssets, { recursive: true });
  }
  fs.cpSync(srcAssets, destAssets, { recursive: true });
  console.log('✅ Assets copied');
} else {
  console.log('⚠️ No assets dir in dist-chat, checking root...');
}

// 2. Copiar avatares PNG -> ./avatars/
const srcAvatars = path.join(rootDir, 'frontend/public/avatars');
const destAvatars = path.join(rootDir, 'avatars');

if (fs.existsSync(srcAvatars)) {
  console.log('📁 Copying avatars...');
  if (fs.existsSync(destAvatars)) {
    fs.rmSync(destAvatars, { recursive: true });
  }
  fs.cpSync(srcAvatars, destAvatars, { recursive: true });
  console.log('✅ Avatars copied');
}

// 3. Copiar index.html -> ./chat.html
const srcIndex = path.join(distChatDir, 'index.html');
const destChat = path.join(rootDir, 'chat.html');

if (fs.existsSync(srcIndex)) {
  console.log('📄 Copying index.html -> chat.html');
  fs.copyFileSync(srcIndex, destChat);
  console.log('✅ chat.html created');
} else {
  console.error('❌ index.html not found in dist-chat');
  process.exit(1);
}

// Verificar o conteúdo do chat.html
const chatHtml = fs.readFileSync(destChat, 'utf-8');
const scriptMatch = chatHtml.match(/<script[^>]+src="([^"]+)"/);
if (scriptMatch) {
  console.log('✅ Script src in chat.html:', scriptMatch[1]);
}

console.log('✅ Sync complete!');
