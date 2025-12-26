(() => {
  const PROVIDERS = {
    chatgpt: { title: 'ChatGPT', url: 'https://chatgpt.com/' },
    gemini: { title: 'Gemini', url: 'https://gemini.google.com/' },
    copilot: { title: 'Copilot', url: 'https://copilot.microsoft.com/' },
    grok: { title: 'Grok', url: 'https://grok.com/' }
  };

  const dom = {
    btnChatgpt: document.getElementById('btn-chatgpt'),
    btnGemini: document.getElementById('btn-gemini'),
    btnCopilot: document.getElementById('btn-copilot'),
    btnGrok: document.getElementById('btn-grok'),
    btnHide: document.getElementById('btn-hide'),
    title: document.getElementById('ai-title'),
    status: document.getElementById('ai-status')
  };

  function setActive(which) {
    dom.btnChatgpt?.classList.toggle('active', which === 'chatgpt');
    dom.btnGemini?.classList.toggle('active', which === 'gemini');
    dom.btnCopilot?.classList.toggle('active', which === 'copilot');
    dom.btnGrok?.classList.toggle('active', which === 'grok');
    try {
      dom.title.textContent = PROVIDERS[which]?.title || 'Yapay Zeka';
    } catch (_err) {
      /* ignore */
    }
  }

  function switchProvider(which) {
    try {
      dom.status.textContent = 'Açılıyor…';
    } catch (_err) {
      /* ignore */
    }
    setActive(which);

    // Provider switch: her sağlayıcının sohbeti ayrı webContents'te kalır.
    if (window.browserAPI?.aiSwitch) {
      window.browserAPI.aiSwitch(which);
      return;
    }

    // Geriye dönük: eski sürümlerde tek view vardı.
    const url = PROVIDERS[which]?.url;
    if (url) window.browserAPI?.aiLoad?.(url);
  }

  dom.btnChatgpt?.addEventListener('click', () => switchProvider('chatgpt'));
  dom.btnGemini?.addEventListener('click', () => switchProvider('gemini'));
  dom.btnCopilot?.addEventListener('click', () => switchProvider('copilot'));
  dom.btnGrok?.addEventListener('click', () => switchProvider('grok'));
  dom.btnHide?.addEventListener('click', () => window.browserAPI?.hideAiPanel?.());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.browserAPI?.hideAiPanel?.();
    }
  });

  // Default
  setActive('chatgpt');
  switchProvider('chatgpt');

  // Main process'ten gerçek yükleme durumunu dinle
  window.browserAPI?.onAiStatus?.((payload) => {
    const loading = !!payload?.loading;
    try {
      dom.status.textContent = loading ? 'Açılıyor…' : '';
    } catch (_err) {
      /* ignore */
    }
  });
})();
