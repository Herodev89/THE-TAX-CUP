(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('login-form');
  const error = $('login-error');
  const submit = $('login-submit');
  const label = $('login-label');
  const params = new URLSearchParams(location.search);
  const redirect = params.get('redirect') || 'index.html';

  if (params.get('registered') === '1') {
    $('registered-box').hidden = false;
    try {
      const email = sessionStorage.getItem('taxcup_registered_email');
      if (email) {
        $('email').value = email;
        sessionStorage.removeItem('taxcup_registered_email');
        $('password').focus();
      }
    } catch (err) {}
  }

  fetch('/api/config', { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((config) => {
      if (!config.demo) return;
      $('demo-email').textContent = config.demoEmail;
      $('demo-box').hidden = false;
      $('demo-box').classList.remove('hidden');
      $('demo-fill').addEventListener('click', () => {
        $('email').value = config.demoEmail;
        $('password').value = 'demo-password';
        error.textContent = '';
        $('password').focus();
      });
    })
    .catch(() => {});

  $('toggle-password').addEventListener('click', () => {
    const input = $('password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('toggle-password').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  function busy(state) {
    submit.disabled = state;
    label.textContent = state ? 'Signing in…' : 'Sign in';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('email').value.trim().toLowerCase();
    const password = $('password').value;
    if (!email || !password) {
      error.textContent = 'Enter your email address and password.';
      return;
    }
    error.textContent = '';
    busy(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password, redirect }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        error.textContent = result.message || 'Sign-in failed. Please try again.';
        busy(false);
        return;
      }
      label.textContent = 'Signed in — opening workspace…';
      window.location.href = result.redirect;
    } catch (err) {
      error.textContent = 'The sign-in service is unavailable. Please try again shortly.';
      busy(false);
    }
  });
}());
