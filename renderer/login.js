(() => {
  const form = document.getElementById('login-form');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const rememberMe = document.getElementById('remember-me');
  const error = document.getElementById('error');
  const btn = document.getElementById('btn-login');

  const setError = (msg) => {
    if (!error) return;
    error.textContent = msg || '';
  };

  const setBusy = (busy) => {
    if (btn) btn.disabled = !!busy;
    if (username) username.disabled = !!busy;
    if (password) password.disabled = !!busy;
  };

  username?.focus();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');

    const u = (username?.value || '').trim();
    const p = (password?.value || '').trim();

    if (!u || !p) {
      setError('Kullanıcı adı ve şifre gerekli.');
      return;
    }

    setBusy(true);
    try {
      const res = await window.browserAPI?.authLogin?.({ username: u, password: p });
      if (!res?.ok) {
        if (res?.code === 'GEO_BLOCK_TR') {
          const downloadUrl = encodeURIComponent(String(res?.downloadUrl || ''));
          window.location.href = `blocked.html?download=${downloadUrl}`;
          return;
        }
        setError(res?.message || 'Giriş başarısız.');
        return;
      }
      // Başarılı girişte pencere main process tarafından yönlendirilir.
    } catch (err) {
      console.error('[LOGIN DEBUG] Login error:', err);
      setError('Giriş başarısız.');
    } finally {
      setBusy(false);
    }
  });
})();
