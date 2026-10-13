const form = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const errorElement = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit-btn');
const btnText = document.getElementById('login-btn-text');
const btnArrow = document.getElementById('login-btn-arrow');
const fillDemoBtn = document.getElementById('fill-demo-btn');
const togglePasswordBtn = document.getElementById('toggle-password');

const requestedPage = new URLSearchParams(window.location.search).get('redirect');
const allowedPages = new Set(['index.html', 'employees.html', 'company.html', 'payroll.html']);
const redirectAfterLogin = allowedPages.has(requestedPage) ? requestedPage : 'index.html';

if (fillDemoBtn) {
  fillDemoBtn.addEventListener('click', () => {
    emailInput.value = 'admin@taxcup.local';
    passwordInput.value = 'demo-password';
    errorElement.textContent = '';
    emailInput.focus();
  });
}

if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email || !password) {
    errorElement.textContent = 'Please enter both your email address and password.';
    return;
  }

  errorElement.textContent = '';
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = 'Signing in...';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, redirect: redirectAfterLogin }),
      credentials: 'same-origin',
    });

    const result = await response.json();
    if (!response.ok || !result.ok) {
      errorElement.textContent = result.message || 'The email or password is incorrect, or the account is inactive.';
      if (submitBtn) submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Sign in to workspace';
      return;
    }

    if (btnText) btnText.textContent = 'Signed in! Redirecting...';
    if (result.user) {
      localStorage.setItem('tax-cup-current-user', JSON.stringify(result.user));
      localStorage.setItem('tax-cup-current-role', result.user.role || '');
    }
    window.location.href = result.redirect || redirectAfterLogin;
  } catch (error) {
    errorElement.textContent = 'The sign-in service is not available at the moment. Please try again in a moment.';
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Sign in to workspace';
  }
});