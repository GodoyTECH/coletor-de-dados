import fs from 'fs';

const file = 'netlify.toml';
const content = fs.readFileSync(file, 'utf8');
const match = content.match(/^\s*publish\s*=\s*"([^"]+)"/m);

if (!match) {
  console.error('❌ publish not found in netlify.toml');
  process.exit(1);
}

const publishDir = match[1].trim();
if (publishDir.startsWith('../')) {
  console.error(`❌ Invalid build.publish: ${publishDir}. It must stay inside repository root.`);
  process.exit(1);
}

console.log(`✅ netlify.toml publish is valid: ${publishDir}`);
