import { spawn } from 'child_process';

const RUNTIME_SCRIPT = process.env.MADRUGUINHA_RUNTIME_SCRIPT || '/home/godoy/.openclaw/agents/madruguinha/agent/runtime/madruguinha_runtime.mjs';

export function runMadruguinhaRuntime(mode, payload = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [RUNTIME_SCRIPT, mode], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let out = '';
    let err = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Runtime timeout (${mode})`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`Runtime failed (${mode}) code=${code} ${err || out}`));
      }
      try {
        const parsed = out ? JSON.parse(out) : {};
        if (!parsed?.ok) return reject(new Error(parsed?.error || `Runtime invalid response (${mode})`));
        resolve(parsed.result);
      } catch (e) {
        reject(new Error(`Runtime parse error (${mode}): ${e.message}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
