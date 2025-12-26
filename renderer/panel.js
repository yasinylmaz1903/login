(() => {
  const splitRange = document.getElementById('split-range');
  const splitValue = document.getElementById('split-value');
  const btnLeftOnly = document.getElementById('btn-left-only');
  const btnRightOnly = document.getElementById('btn-right-only');
  const btnRestoreSplit = document.getElementById('btn-restore-split');
  const btnClose = document.getElementById('panel-close');

  function updateRangeBackground(value) {
    if (splitRange) {
      const percentage = value;
      splitRange.style.background = `linear-gradient(to right, #2f89ff 0%, #2f89ff ${percentage}%, #1f2630 ${percentage}%, #1f2630 100%)`;
    }
  }

  function setSplit(val) {
    const ratio = Math.min(1, Math.max(0, val));
    window.browserAPI.setSplit?.(ratio);
    const percentage = Math.round(ratio * 100);
    if (splitRange) splitRange.value = percentage;
    if (splitValue) splitValue.textContent = `${percentage}%`;
    updateRangeBackground(percentage);
  }

  function applySplit(ratio) {
    const next = Math.min(1, Math.max(0, Number(ratio)));
    const percentage = Math.round(next * 100);
    if (splitRange) splitRange.value = percentage;
    if (splitValue) splitValue.textContent = `${percentage}%`;
    updateRangeBackground(percentage);
  }

  btnLeftOnly?.addEventListener('click', () => setSplit(1));
  btnRightOnly?.addEventListener('click', () => setSplit(0));
  btnRestoreSplit?.addEventListener('click', () => setSplit(0.5));


  splitRange?.addEventListener('input', (e) => {
    const val = Number(e.target.value) / 100;
    setSplit(val);
  });

  btnClose?.addEventListener('click', () => {
    window.browserAPI.closePanelWindow?.();
  });

  // Hide notes popup if user clicks anywhere in the panel window
  document.addEventListener('mousedown', () => {
    window.browserAPI.closeNotesWindow?.();
  });

  // Sync initial split and listen for updates from main UI
  (async () => {
    try {
      const current = await window.browserAPI.getSplit?.();
      if (typeof current === 'number') applySplit(current);
    } catch (_err) {
      /* ignore */
    }
  })();

  window.browserAPI.onSplitUpdated?.((ratio) => applySplit(ratio));

})();
