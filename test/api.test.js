const test = require('node:test');
const assert = require('node:assert/strict');
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
});

test('GET /api/health returns ok', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.name, 'Tax Cup API');
});

test('GET /api/session without cookie returns unauthenticated', async () => {
  const res = await fetch(`${baseUrl}/api/session`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.authenticated, false);
  assert.equal(data.user, null);
});

test('POST /api/login with demo credentials authenticates and sets session cookie', async () => {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@taxcup.local', password: 'demo-password' }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.user.email, 'admin@taxcup.local');
  assert.equal(data.user.role, 'Super Administrator');

  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie && setCookie.includes('taxcup_session='));

  // Test authenticated /api/session with this cookie
  const sessionRes = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: setCookie },
  });
  const sessionData = await sessionRes.json();
  assert.equal(sessionData.authenticated, true);
  assert.equal(sessionData.user.email, 'admin@taxcup.local');
});

test('Employee CRUD and Payroll workflow test', async () => {
  // 1. Sign in to obtain session cookie
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@taxcup.local', password: 'demo-password' }),
  });
  const cookie = loginRes.headers.get('set-cookie');
  const headers = { 'Content-Type': 'application/json', Cookie: cookie };

  // 2. Create employee
  const empRes = await fetch(`${baseUrl}/api/employees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Adewale Test',
      department: 'Finance',
      title: 'Tax Lead',
      salary: 750000,
      annualRent: 1200000,
    }),
  });
  assert.equal(empRes.status, 201);
  const empData = await empRes.json();
  assert.equal(empData.ok, true);
  const empId = empData.employee.id;

  // 3. Create payroll record for period 2026-11
  const recRes = await fetch(`${baseUrl}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      employeeId: empId,
      period: '2026-11',
      basic: 400000,
      housing: 200000,
      transport: 150000,
      paye: 65000,
      pension: 35000,
    }),
  });
  assert.equal(recRes.status, 201);
  const recData = await recRes.json();
  assert.equal(recData.ok, true);
  assert.equal(recData.record.workflowStatus, 'Draft');
  const recId = recData.record.id;

  // 4. Advance workflow: Draft -> Under Review -> Approved -> Finalized -> Paid
  let currentRec = recData.record;
  const expectedSteps = ['Under Review', 'Approved', 'Finalized', 'Paid'];

  for (const step of expectedSteps) {
    const advRes = await fetch(`${baseUrl}/api/records/${recId}/advance`, {
      method: 'POST',
      headers,
    });
    assert.equal(advRes.status, 200);
    const advData = await advRes.json();
    assert.equal(advData.record.workflowStatus, step);
    currentRec = advData.record;
  }

  assert.equal(currentRec.paymentStatus, 'Paid');

  // 5. Attempting to edit a locked (Paid) record must fail with 409
  const editRes = await fetch(`${baseUrl}/api/records/${recId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      basic: 500000,
    }),
  });
  assert.equal(editRes.status, 409);
  const editData = await editRes.json();
  assert.ok(editData.message.includes('locked'));

  // 6. Attempting to delete a non-draft record must fail with 409
  const delRes = await fetch(`${baseUrl}/api/records/${recId}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(delRes.status, 409);
});

test('POST /api/logout invalidates session', async () => {
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@taxcup.local', password: 'demo-password' }),
  });
  const cookie = loginRes.headers.get('set-cookie');

  // Verify signed in
  const check1 = await fetch(`${baseUrl}/api/session`, { headers: { Cookie: cookie } });
  assert.equal((await check1.json()).authenticated, true);

  // Logout
  const logoutRes = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(logoutRes.status, 200);

  // Attempt using old cookie must be unauthenticated now because sessionVersion bumped
  const check2 = await fetch(`${baseUrl}/api/session`, { headers: { Cookie: cookie } });
  assert.equal((await check2.json()).authenticated, false);
});
