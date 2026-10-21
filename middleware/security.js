const { rateLimit } = require('express-rate-limit');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://images.unsplash.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') {
    return res.status(403).json({ ok: false, message: 'Cross-site request blocked.' });
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const expectedHost = req.headers['x-forwarded-host'] || req.headers.host;
      if (expectedHost && originHost !== expectedHost) {
        return res.status(403).json({ ok: false, message: 'Cross-origin request blocked.' });
      }
    } catch {
      return res.status(403).json({ ok: false, message: 'Invalid origin header.' });
    }
  }

  next();
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Too many sign-in attempts. Please try again in 15 minutes.' },
});

module.exports = {
  securityHeaders,
  csrfProtection,
  loginLimiter,
};
