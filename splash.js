(() => {
  const SPLASH_TIMEOUT_MS = 10000;
  const SKIP_DELAY_MS = 5000;

  let splashEl;
  let videoEl;
  let countdownEl;
  let skipBtn;
  let audioBtn;
  let fallbackEl;
  let hideTimer;
  let skipTimer;
  let countdownTimer;
  let hideCalled = false;

  function selectElements() {
    splashEl = document.getElementById('sc-splash');
    videoEl = document.getElementById('sc-splash-video');
    countdownEl = document.getElementById('sc-splash-countdown');
    skipBtn = document.getElementById('sc-splash-skip');
    audioBtn = document.getElementById('sc-splash-audio');
    fallbackEl = document.getElementById('sc-splash-fallback');
  }

  function updateCountdown(seconds) {
    if (!countdownEl) return;
    const value = Math.max(0, Math.ceil(seconds));
    countdownEl.textContent = value > 0 ? `Pular em ${value}...` : 'Pular disponível';
  }

  function enableSkip() {
    if (!skipBtn) return;
    skipBtn.disabled = false;
    skipBtn.textContent = 'Pular';
  }

  function showAudioButton() {
    if (!audioBtn) return;
    audioBtn.classList.add('is-visible');
  }

  async function tryPlayWithSound() {
    if (!videoEl) return false;
    try {
      videoEl.muted = false;
      await videoEl.play();
      return true;
    } catch (error) {
      return false;
    }
  }

  async function tryPlayMuted() {
    if (!videoEl) return false;
    try {
      videoEl.muted = true;
      await videoEl.play();
      return true;
    } catch (error) {
      return false;
    }
  }

  async function setupPlayback() {
    if (!videoEl) return;

    const playedWithSound = await tryPlayWithSound();
    if (playedWithSound) return;

    const playedMuted = await tryPlayMuted();
    if (playedMuted) {
      showAudioButton();
      return;
    }

    if (fallbackEl) {
      fallbackEl.hidden = false;
      fallbackEl.textContent = 'Carregando abertura...';
    }
  }

  function bindEvents() {
    if (skipBtn) {
      skipBtn.addEventListener('click', () => hideSplash('skip'));
    }

    if (audioBtn && videoEl) {
      audioBtn.addEventListener('click', async () => {
        videoEl.muted = false;
        try {
          await videoEl.play();
        } catch (error) {
          // Mantém mudo se não for possível liberar
          videoEl.muted = true;
          return;
        }
        audioBtn.classList.remove('is-visible');
      });
    }

    if (videoEl) {
      videoEl.addEventListener('error', () => {
        if (fallbackEl) {
          fallbackEl.hidden = false;
          fallbackEl.textContent = 'Vídeo indisponível. Continuando...';
        }
      });
    }
  }

  function startTimers() {
    const startTime = Date.now();

    updateCountdown(Math.ceil(SKIP_DELAY_MS / 1000));
    skipBtn && (skipBtn.disabled = true);
    skipBtn && (skipBtn.textContent = 'Aguarde...');

    countdownTimer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, SKIP_DELAY_MS - elapsed);
      updateCountdown(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        enableSkip();
      }
    }, 250);

    skipTimer = window.setTimeout(enableSkip, SKIP_DELAY_MS);
    hideTimer = window.setTimeout(() => hideSplash('timeout-10s'), SPLASH_TIMEOUT_MS);
  }

  function clearTimers() {
    if (hideTimer) window.clearTimeout(hideTimer);
    if (skipTimer) window.clearTimeout(skipTimer);
    if (countdownTimer) window.clearInterval(countdownTimer);
  }

  function showSplash() {
    selectElements();
    if (!splashEl) return;

    splashEl.hidden = false;
    splashEl.classList.remove('sc-splash-hidden');

    bindEvents();
    startTimers();
    setupPlayback();
  }

  function hideSplash(reason = 'unknown') {
    if (hideCalled) return;
    hideCalled = true;

    clearTimers();

    if (splashEl) {
      splashEl.classList.add('sc-splash-hidden');
      setTimeout(() => {
        splashEl?.remove();
      }, 450);
    }

    if (videoEl) {
      try {
        videoEl.pause();
      } catch (error) {
        // ignore
      }
    }

    console.log(`[SPLASH] Encerrado: ${reason}`);
  }

  window.SocialColetorSplash = {
    showSplash,
    hideSplash
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showSplash, { once: true });
  } else {
    showSplash();
  }
})();
