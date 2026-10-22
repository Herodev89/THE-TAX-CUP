(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('register-form');
  const error = $('register-error');
  const submit = $('register-submit');
  const label = $('register-label');

  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = $(targetId);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  function busy(state) {
    submit.disabled = state;
    label.textContent = state ? 'Creating account…' : 'Create your account';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('name').value.trim();
    const email = $('email').value.trim().toLowerCase();
    const department = $('department').value.trim();
    const title = $('title').value.trim();
    const password = $('password').value;
    const confirmPassword = $('confirm-password').value;

    if (!name) {
      error.textContent = 'Please enter your full name.';
      $('name').focus();
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      error.textContent = 'Please provide a valid work email address.';
      $('email').focus();
      return;
    }
    if (!password || password.length < 8) {
      error.textContent = 'Password must be at least 8 characters long.';
      $('password').focus();
      return;
    }
    if (password !== confirmPassword) {
      error.textContent = 'Passwords do not match.';
      $('confirm-password').focus();
      return;
    }

    error.textContent = '';
    busy(true);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name,
          email,
          department,
          title,
          password,
          confirmPassword,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        error.textContent = result.message || 'Registration failed. Please try again.';
        busy(false);
        return;
      }

      label.textContent = 'Account created — taking you to sign in…';
      try { sessionStorage.setItem('taxcup_registered_email', email); } catch (err) {}
      window.location.href = result.redirect || 'login.html?registered=1';
    } catch (err) {
      error.textContent = 'Unable to reach the server. Please check your connection and try again.';
      busy(false);
    }
  });
}());
