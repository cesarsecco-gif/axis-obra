// Testes de API: sobem o servidor com banco temporário e verificam autenticação, permissões e regras do RDO.
// Executar: npm test (na pasta backend) ou npm test (na raiz).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let tmpDir;
let server;
let serverLog = '';

async function api(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(email, password = '123456') {
  const { status, data } = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(status, 200, `login de ${email} falhou: ${JSON.stringify(data)}`);
  return data.token;
}

async function waitForCode(email, purpose) {
  const re = new RegExp(`Código ${purpose} para ${email.replace('.', '\\.')}: (\\d{6})`, 'g');
  for (let i = 0; i < 40; i++) {
    const matches = [...serverLog.matchAll(re)];
    if (matches.length) return matches[matches.length - 1][1];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Código não apareceu no log do servidor');
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axis-obra-test-'));
  fs.mkdirSync(path.join(tmpDir, 'uploads'));
  server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      DATA_DIR: tmpDir,
      UPLOADS_DIR: path.join(tmpDir, 'uploads'),
      SMTP_HOST: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (d) => (serverLog += d.toString()));
  server.stderr.on('data', (d) => (serverLog += d.toString()));

  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* aguardando */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Servidor não iniciou:\n${serverLog}`);
});

after(() => {
  if (server) server.kill();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('administrador principal entra com e-mail e senha', async () => {
  const token = await login('cesarsecco@gmail.com');
  const me = await api('/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, 'ADMIN');
});

test('senha errada é recusada', async () => {
  const { status } = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'cesarsecco@gmail.com', password: 'errada' }
  });
  assert.equal(status, 401);
});

test('login sem senha (somente userId) não é mais aceito', async () => {
  const { status, data } = await api('/api/auth/login', { method: 'POST', body: { userId: 1 } });
  assert.equal(status, 400);
  assert.equal(data.token, undefined);
});

test('cabeçalho x-user-id sem token não autentica', async () => {
  const { status } = await api('/api/projects', { headers: { 'x-user-id': '1' } });
  assert.equal(status, 401);
});

test('lista pública de usuários de demonstração foi removida', async () => {
  const res = await fetch(`${BASE}/api/auth/demo-users`);
  assert.notEqual(res.headers.get('content-type')?.includes('application/json') && res.status, 200);
});

test('token adulterado é recusado', async () => {
  const token = await login('joao@axisobra.com.br');
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), id: 1, role: 'ADMIN' })
  ).toString('base64url');
  const { status } = await api('/api/users', { token: `${forged}.${sig}` });
  assert.equal(status, 401);
});

test('somente ADMIN lista usuários', async () => {
  const enc = await login('joao@axisobra.com.br');
  assert.equal((await api('/api/users', { token: enc })).status, 403);
  const admin = await login('cesarsecco@gmail.com');
  assert.equal((await api('/api/users', { token: admin })).status, 200);
});

test('usuário sem vínculo não acessa a obra', async () => {
  const enc = await login('joao@axisobra.com.br'); // vinculado somente à obra 1
  const { status } = await api('/api/rdo/sync-services', {
    method: 'POST',
    token: enc,
    body: { project_id: 2, rdo_date: '2026-10-20' }
  });
  assert.equal(status, 403);
});

test('login por código enviado por e-mail (código de uso único)', async () => {
  const email = 'mariana@axisobra.com.br';
  const req = await api('/api/auth/request-code', { method: 'POST', body: { email, purpose: 'LOGIN' } });
  assert.equal(req.status, 200);
  const code = await waitForCode(email, 'LOGIN');

  const wrong = await api('/api/auth/login-code', { method: 'POST', body: { email, code: '000000' === code ? '111111' : '000000' } });
  assert.equal(wrong.status, 401);

  const ok = await api('/api/auth/login-code', { method: 'POST', body: { email, code } });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);

  const reused = await api('/api/auth/login-code', { method: 'POST', body: { email, code } });
  assert.equal(reused.status, 401);
});

test('pedido de código para e-mail inexistente não revela se o usuário existe', async () => {
  const res = await api('/api/auth/request-code', {
    method: 'POST',
    body: { email: 'ninguem@exemplo.com', purpose: 'LOGIN' }
  });
  assert.equal(res.status, 200);
});

test('recuperação de senha por código', async () => {
  const email = 'roberto@axisobra.com.br';
  await api('/api/auth/request-code', { method: 'POST', body: { email, purpose: 'RESET' } });
  const code = await waitForCode(email, 'RESET');
  const reset = await api('/api/auth/reset-password', {
    method: 'POST',
    body: { email, code, newPassword: 'novaSenha#2026' }
  });
  assert.equal(reset.status, 200);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email, password: '123456' } })).status, 401);
  await login(email, 'novaSenha#2026');
});

test('usuário altera a própria senha', async () => {
  const token = await login('joao@axisobra.com.br');
  const bad = await api('/api/auth/password', {
    method: 'PUT',
    token,
    body: { currentPassword: 'errada', newPassword: 'outra123' }
  });
  assert.equal(bad.status, 400);
  const ok = await api('/api/auth/password', {
    method: 'PUT',
    token,
    body: { currentPassword: '123456', newPassword: 'outra123' }
  });
  assert.equal(ok.status, 200);
  await login('joao@axisobra.com.br', 'outra123');
  // volta a senha para os demais testes
  const t2 = await login('joao@axisobra.com.br', 'outra123');
  await api('/api/auth/password', { method: 'PUT', token: t2, body: { currentPassword: 'outra123', newPassword: '123456' } });
});

test('ADMIN desativa usuário e ele não consegue mais entrar', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const created = await api('/api/users', {
    method: 'POST',
    token: admin,
    body: { name: 'Teste Fiscal', email: 'fiscal.teste@exemplo.com', password: 'fiscal123', role: 'FISCAL', projectIds: [1] }
  });
  assert.equal(created.status, 201);
  const fiscalToken = await login('fiscal.teste@exemplo.com', 'fiscal123');

  // FISCAL é somente leitura
  assert.equal((await api('/api/projects', { token: fiscalToken })).status, 200);
  const write = await api('/api/occurrences', {
    method: 'POST',
    token: fiscalToken,
    body: { project_id: 1, title: 'x', type: 'QUALIDADE', severity: 'BAIXA', description: 'x' }
  });
  assert.equal(write.status, 403);

  const off = await api(`/api/users/${created.data.id}`, { method: 'PUT', token: admin, body: { active: false } });
  assert.equal(off.status, 200);
  assert.equal(
    (await api('/api/auth/login', { method: 'POST', body: { email: 'fiscal.teste@exemplo.com', password: 'fiscal123' } })).status,
    401
  );
  assert.equal((await api('/api/projects', { token: fiscalToken })).status, 401);
});

test('ADMIN simula acesso de outro usuário e volta', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const imp = await api('/api/auth/impersonate', { method: 'POST', token: admin, body: { userId: 4 } });
  assert.equal(imp.status, 200);
  assert.equal(imp.data.user.id, 4);
  const back = await api('/api/auth/stop-impersonation', { method: 'POST', token: imp.data.token });
  assert.equal(back.status, 200);
  assert.equal(back.data.user.role, 'ADMIN');

  const enc = await login('joao@axisobra.com.br');
  assert.equal((await api('/api/auth/impersonate', { method: 'POST', token: enc, body: { userId: 1 } })).status, 403);
});

test('RDO finalizado fica bloqueado, só reabre com motivo e não pode ser excluído', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const enc = await login('joao@axisobra.com.br');
  const date = '2026-09-01';

  const encFinal = await api('/api/rdo', { method: 'POST', token: enc, body: { project_id: 1, rdo_date: date, status: 'final' } });
  assert.equal(encFinal.status, 403, 'Encarregado não pode finalizar');

  const fin = await api('/api/rdo', { method: 'POST', token: admin, body: { project_id: 1, rdo_date: date, status: 'final' } });
  assert.equal(fin.status, 200);
  assert.equal(fin.data.status, 'final');
  assert.ok(fin.data.finalized_at);

  const edit = await api('/api/rdo', {
    method: 'POST',
    token: enc,
    body: { project_id: 1, rdo_date: date, status: 'final', contractor_notes: 'alterado' }
  });
  assert.equal(edit.status, 409);

  const del = await api(`/api/rdo/${fin.data.id}`, { method: 'DELETE', token: admin });
  assert.equal(del.status, 409);

  const noReason = await api('/api/rdo', { method: 'POST', token: admin, body: { project_id: 1, rdo_date: date, status: 'draft' } });
  assert.equal(noReason.status, 400);

  const reopen = await api('/api/rdo', {
    method: 'POST',
    token: admin,
    body: { project_id: 1, rdo_date: date, status: 'draft', reopened_reason: 'Correção do efetivo' }
  });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.data.status, 'draft');

  const history = await api(`/api/rdo/${fin.data.id}/history`, { token: admin });
  assert.deepEqual(
    history.data.map((h) => h.action),
    ['CRIADO', 'FINALIZADO', 'REABERTO']
  );
});

test('número da folha do RDO é definido pelo servidor', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const a = await api('/api/rdo', { method: 'POST', token: admin, body: { project_id: 1, rdo_date: '2026-09-10', folio_number: 1 } });
  const b = await api('/api/rdo', { method: 'POST', token: admin, body: { project_id: 1, rdo_date: '2026-09-11', folio_number: 1 } });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.data.folio_number, b.data.folio_number);
});

test('upload de SVG ou arquivo que não é imagem é recusado', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
  const r1 = await api('/api/occurrences/1/photos', {
    method: 'POST',
    token: admin,
    body: { photos: [{ base64: `data:image/svg+xml;base64,${svg}` }] }
  });
  assert.equal(r1.status, 400);

  const fakePng = Buffer.from('isto não é uma imagem').toString('base64');
  const r2 = await api('/api/occurrences/1/photos', {
    method: 'POST',
    token: admin,
    body: { photos: [{ base64: `data:image/png;base64,${fakePng}` }] }
  });
  assert.equal(r2.status, 400);

  // PNG válido de 1x1
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const r3 = await api('/api/occurrences/1/photos', {
    method: 'POST',
    token: admin,
    body: { photos: [{ base64: `data:image/png;base64,${png}` }] }
  });
  assert.equal(r3.status, 201);
});

test('arquivos enviados são servidos com cabeçalhos de proteção', async () => {
  const res = await fetch(`${BASE}/uploads/foto-seguranca-bandeja.svg`); // imagem de exemplo criada no seed
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy') || '', /sandbox/);
});

test('restaurar campos padrão de ocorrência (rota que faltava)', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const res = await api('/api/occurrence-params/reset', { method: 'POST', token: admin });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data) && res.data.length > 0);
  const enc = await login('joao@axisobra.com.br');
  assert.equal((await api('/api/occurrence-params/reset', { method: 'POST', token: enc })).status, 403);
});

test('backup do banco disponível somente para ADMIN', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const res = await fetch(`${BASE}/api/admin/backup`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.slice(0, 15).toString(), 'SQLite format 3');
  const enc = await login('joao@axisobra.com.br');
  assert.equal((await api('/api/admin/backup', { token: enc })).status, 403);
});
