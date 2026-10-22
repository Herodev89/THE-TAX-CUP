// Runs the server with demo mode off (as on a live deploy) against a data folder that
// already holds the old demo admin, and checks that account can no longer be used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taxcup-nodemo-'));
process.env.DATA_DIR = dataDir;
process.env.DEMO_MODE = 'false';

const { DEMO_EMAIL, hashPassword } = require('../middleware/auth');
fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify([{
  id: 'USR-ADMIN',
  name: 'Administrator',
  email: DEMO_EMAIL,
  role: 'Super Administrator',
  passwordHash: hashPassword('demo-password'),
  sessionVersion: 0,
  active: true,
  createdAt: new Date().toISOString(),
}]));

const app = require('../server');
let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('login page does not advertise the demo account', async () => {
  const data = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.equal(data.demo, false);
  assert.equal(data.demoEmail, null);
});

test('the demo account cannot sign in', async () => {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: 'demo-password' }),
  });
  assert.equal(res.status, 401);
});

test('a left-over demo account is deactivated on startup', async () => {
  await fetch(`${baseUrl}/api/health`);
  const users = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'));
  const demo = users.find((user) => user.email === DEMO_EMAIL);
  assert.equal(demo.active, false);
});
