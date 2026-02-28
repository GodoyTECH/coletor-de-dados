import { execFile } from 'child_process';

function runWhisperLocal(filePath, timeoutMs) {
  const cliPath = process.env.WHISPER_LOCAL_CLI || '/home/godoy/.local/bin/whisper_local.py';
  const model = process.env.AUDIO_STT_MODEL || 'base';
  const language = process.env.AUDIO_STT_LANGUAGE || 'pt';
  const beamSize = process.env.AUDIO_STT_BEAM_SIZE || '3';

  return new Promise((resolve, reject) => {
    execFile(
      cliPath,
      ['--model', model, '--language', language, '--beam_size', String(beamSize), filePath],
      { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr?.trim() || error.message || 'whisper_local failed'));
        }

        const text = String(stdout || '').trim();
        if (!text) {
          return reject(new Error('transcrição vazia'));
        }

        return resolve(text);
      }
    );
  });
}

/**
 * STT local (faster-whisper) com fallback resiliente.
 */
export async function transcribeAudioPlaceholder(filePath) {
  const timeoutMs = Number(process.env.AUDIO_STT_TIMEOUT_MS || 25000);

  try {
    const text = await runWhisperLocal(filePath, timeoutMs);
    return {
      text,
      provider: 'faster-whisper-local',
      filePath
    };
  } catch (error) {
    return {
      text: 'Áudio enviado. Pode me ajudar com este comprovante?',
      provider: 'fallback-placeholder',
      filePath,
      warning: error.message
    };
  }
}
