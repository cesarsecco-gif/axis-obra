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

test('etapas construtivas configuráveis: padrão semeado, criar, editar e excluir', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const list = await api('/api/occurrence-params?group=PHOTO_STAGE', { token: admin });
  assert.equal(list.status, 200);
  assert.ok(list.data.some((p) => p.code === 'ESTRUTURA' && p.label === 'Estrutura / Concreto'));

  const created = await api('/api/occurrence-params', {
    method: 'POST',
    token: admin,
    body: { group_key: 'PHOTO_STAGE', label: 'Pavimentação Asfáltica', color: 'slate' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.code, 'PAVIMENTACAO_ASFALTICA');

  const edited = await api(`/api/occurrence-params/${created.data.id}`, {
    method: 'PUT',
    token: admin,
    body: { label: 'Pavimentação / CBUQ', color: 'amber' }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.code, 'PAVIMENTACAO_ASFALTICA'); // código estável para fotos já cadastradas

  const del = await api(`/api/occurrence-params/${created.data.id}`, { method: 'DELETE', token: admin });
  assert.equal(del.status, 200);
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

// ---------------------------------------------------------------------------
// Perfis de acesso configuráveis e Gestão de Contas
// ---------------------------------------------------------------------------
const emptyPerms = () => ({});

test('lista de perfis traz os 4 perfis padrão e os módulos', async () => {
  const enc = await login('joao@axisobra.com.br');
  const res = await api('/api/roles', { token: enc });
  assert.equal(res.status, 200);
  const keys = res.data.roles.map((r) => r.key);
  for (const k of ['ADMIN', 'ENGENHEIRO', 'ENCARREGADO', 'FISCAL']) assert.ok(keys.includes(k));
  assert.ok(res.data.modules.some((m) => m.key === 'ACCOUNTS'));
});

test('perfil personalizado: cria, aplica permissões e não pode ser excluído em uso', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const enc = await login('joao@axisobra.com.br');

  // Sem "manage_roles" não cria perfis
  assert.equal((await api('/api/roles', { method: 'POST', token: enc, body: { name: 'X' } })).status, 403);

  const created = await api('/api/roles', {
    method: 'POST',
    token: admin,
    body: {
      name: 'Técnico de Segurança',
      color: '#db2777',
      scope: 'LINKED',
      permissions: {
        DASHBOARD: { view: true },
        OCCURRENCES: { view: true, create: true, edit: true, special: { change_status: true } },
        EMPLOYEES: { view: true, edit: true },
        EQUIPMENTS: { view: true },
        RDO: { view: true }
      }
    }
  });
  assert.equal(created.status, 201);
  const key = created.data.key;
  assert.match(key, /^P_TECNICO_DE_SEGURANCA_/);

  const acc = await api('/api/users', {
    method: 'POST',
    token: admin,
    body: {
      name: 'Rafael Tonin',
      email: 'rafael@exemplo.com',
      first_access: 'PASSWORD',
      password: 'tecnico123',
      role: key,
      job_title: 'Técnico de Segurança do Trabalho',
      employment_type: 'TERCEIRIZADO',
      cpf: '123.456.789-09',
      assignments: [{ project_id: 1, role_in_project: 'TST frente norte', since_date: '2026-10-01' }]
    }
  });
  assert.equal(acc.status, 201);
  assert.equal(acc.data.must_change_password, 1);
  assert.equal(acc.data.projects[0].role_in_project, 'TST frente norte');

  const tst = await login('rafael@exemplo.com', 'tecnico123');
  const me = await api('/api/auth/me', { token: tst });
  assert.equal(me.data.user.role_info.name, 'Técnico de Segurança');

  // Pode ver e registrar ocorrências; não pode excluir; não acessa pluviometria nem contas
  assert.equal((await api('/api/occurrences', { token: tst })).status, 200);
  assert.equal((await api('/api/occurrences/1', { method: 'DELETE', token: tst })).status, 403);
  assert.equal((await api('/api/pluviometry', { token: tst })).status, 403);
  assert.equal((await api('/api/users', { token: tst })).status, 403);
  // RDO somente consulta
  assert.equal(
    (await api('/api/rdo', { method: 'POST', token: tst, body: { project_id: 1, rdo_date: '2026-08-01' } })).status,
    403
  );
  // Custos ocultos (sem "ver custos")
  const eq = await api('/api/equipments', { token: tst });
  assert.equal(eq.status, 200);
  assert.ok(eq.data.length > 0 && eq.data.every((e) => e.daily_cost === null));

  // Perfil em uso não pode ser excluído
  assert.equal((await api(`/api/roles/${key}`, { method: 'DELETE', token: admin })).status, 409);
  // Perfil padrão não pode ser excluído
  assert.equal((await api('/api/roles/FISCAL', { method: 'DELETE', token: admin })).status, 400);
  // Administrador não pode ser alterado
  assert.equal(
    (await api('/api/roles/ADMIN', { method: 'PUT', token: admin, body: { permissions: emptyPerms() } })).status,
    400
  );

  // Alterar o perfil vale na hora: tira "ver" de ocorrências
  const upd = await api(`/api/roles/${key}`, {
    method: 'PUT',
    token: admin,
    body: { permissions: { DASHBOARD: { view: true }, EMPLOYEES: { view: true } } }
  });
  assert.equal(upd.status, 200);
  assert.equal((await api('/api/occurrences', { token: tst })).status, 403);
});

test('alterar status de ocorrência exige a ação especial', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const role = await api('/api/roles', {
    method: 'POST',
    token: admin,
    body: { name: 'Apontador', permissions: { OCCURRENCES: { view: true, create: true, edit: true } } }
  });
  await api('/api/users', {
    method: 'POST',
    token: admin,
    body: { name: 'Apontador Teste', email: 'apontador@exemplo.com', password: 'apont123', role: role.data.key, assignments: [{ project_id: 1 }] }
  });
  const t = await login('apontador@exemplo.com', 'apont123');
  const list = await api('/api/occurrences?projectId=1', { token: t });
  const occ = list.data.find((o) => o.status !== 'RESOLVIDA');
  const res = await api(`/api/occurrences/${occ.id}`, { method: 'PUT', token: t, body: { ...occ, status: 'RESOLVIDA' } });
  assert.equal(res.status, 403);
  const ok = await api(`/api/occurrences/${occ.id}`, { method: 'PUT', token: t, body: { ...occ, title: occ.title + ' (rev)' } });
  assert.equal(ok.status, 200);
});

test('conta criada por convite: código do e-mail cria a senha e encerra o convite pendente', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const email = 'convidada@exemplo.com';
  const acc = await api('/api/users', {
    method: 'POST',
    token: admin,
    body: { name: 'Juliana Matos', email, role: 'ENCARREGADO', first_access: 'INVITE' }
  });
  assert.equal(acc.status, 201);
  assert.equal(acc.data.invite_pending, 1);
  const code = await waitForCode(email, 'INVITE');
  assert.match(serverLog, /convite=1&email=convidada%40exemplo\.com&codigo=\d{6}/);

  const set = await api('/api/auth/reset-password', { method: 'POST', body: { email, code, newPassword: 'minhaSenha1' } });
  assert.equal(set.status, 200);
  await login(email, 'minhaSenha1');
  const after = await api(`/api/users/${acc.data.id}`, { token: admin });
  assert.equal(after.data.invite_pending, 0);
  assert.ok(after.data.last_login_at);
});

test('conta com prazo de acesso vencido não entra', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const acc = await api('/api/users', {
    method: 'POST',
    token: admin,
    body: { name: 'Temporário', email: 'temp@exemplo.com', password: 'temp1234', role: 'FISCAL', access_expires_at: '2026-12-31' }
  });
  const t = await login('temp@exemplo.com', 'temp1234');
  await api(`/api/users/${acc.data.id}`, { method: 'PUT', token: admin, body: { access_expires_at: '2020-01-01' } });
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'temp@exemplo.com', password: 'temp1234' } })).status, 401);
  assert.equal((await api('/api/projects', { token: t })).status, 401);
});

test('somente Administrador atribui o perfil Administrador', async () => {
  const admin = await login('cesarsecco@gmail.com');
  const role = await api('/api/roles', {
    method: 'POST',
    token: admin,
    body: { name: 'RH', permissions: { ACCOUNTS: { view: true, create: true, edit: true } } }
  });
  await api('/api/users', {
    method: 'POST',
    token: admin,
    body: { name: 'RH Teste', email: 'rh@exemplo.com', password: 'rhteste1', role: role.data.key }
  });
  const rh = await login('rh@exemplo.com', 'rhteste1');
  const esc = await api('/api/users', {
    method: 'POST',
    token: rh,
    body: { name: 'Novo Admin', email: 'novo.admin@exemplo.com', password: 'admin123', role: 'ADMIN' }
  });
  assert.equal(esc.status, 403);
  const ok = await api('/api/users', {
    method: 'POST',
    token: rh,
    body: { name: 'Novo Encarregado', email: 'novo.enc@exemplo.com', password: 'enc12345', role: 'ENCARREGADO' }
  });
  assert.equal(ok.status, 201);
  // RH não altera o próprio perfil
  assert.equal((await api(`/api/roles/${role.data.key}`, { method: 'PUT', token: rh, body: { name: 'RH+' } })).status, 403);
});
