const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const {
  db,
  initDatabase,
  hashPassword,
  verifyPassword,
  isLegacyHash,
  seedOccurrenceParamsIfEmpty,
  dataDir,
  uploadsDir
} = require('./db');
const mailer = require('./mailer');
const perms = require('./permissions');

initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', true);

// CORS só é necessário quando o frontend roda em outro domínio. Configure CORS_ORIGIN (lista separada por vírgula).
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
}
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Arquivos enviados: nunca executam scripts (protege contra SVG/HTML malicioso aberto diretamente).
app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    next();
  },
  express.static(uploadsDir)
);

// Upload de imagens via multipart (Multer) — somente formatos de imagem.
const ALLOWED_UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = MIME_EXT[file.mimetype] || '.jpg';
    const safeName = `foto-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_MIME.includes(file.mimetype)) return cb(null, true);
    const err = new Error('Formato de arquivo não permitido. Envie uma imagem JPG, PNG, WEBP ou GIF.');
    err.status = 400;
    cb(err);
  }
});

// ============================================================================
// TOKENS DE SESSÃO (HMAC SHA-256)
// ============================================================================
function loadTokenSecret() {
  if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET;
  // Sem variável de ambiente: gera um segredo aleatório e guarda junto ao banco (volume persistente).
  const secretFile = path.join(dataDir, '.token_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, 'utf-8').trim();
      if (saved.length >= 32) return saved;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    return generated;
  } catch (err) {
    console.warn('Não foi possível persistir TOKEN_SECRET; sessões serão invalidadas ao reiniciar.', err.message);
    return crypto.randomBytes(48).toString('hex');
  }
}
const TOKEN_SECRET = loadTokenSecret();
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;

function createToken(user, extra = {}) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + TOKEN_TTL_MS, ...extra })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// ============================================================================
// PERFIS DE ACESSO
// ============================================================================
function parseRole(row) {
  if (!row) return null;
  let parsed = {};
  try {
    parsed = JSON.parse(row.permissions || '{}');
  } catch {
    parsed = {};
  }
  return { ...row, is_system: Boolean(row.is_system), permissions: perms.normalizePermissions(parsed) };
}
function getRole(key) {
  return parseRole(db.prepare('SELECT * FROM roles WHERE key = ?').get(key));
}
const can = (req, moduleKey, action) => perms.can(req.role, moduleKey, action);
// Sem a ação "ver custos", os valores não são enviados ao navegador
const hideCosts = (req, moduleKey, row, field) =>
  row && !perms.can(req.role, moduleKey, 'view_costs') ? { ...row, [field]: null } : row;
const todayLocalISO = () => new Date().toISOString().slice(0, 10);
const isAccessExpired = (user) => Boolean(user.access_expires_at) && user.access_expires_at < todayLocalISO();

// Helper: get accessible project IDs for a user
function getUserAccessibleProjectIds(user) {
  if (!user) return [];
  if (perms.hasAllProjects(getRole(user.role))) {
    return db.prepare('SELECT id FROM projects').all().map((r) => Number(r.id));
  }
  return db
    .prepare('SELECT project_id FROM project_users WHERE user_id = ?')
    .all(user.id)
    .map((r) => Number(r.project_id));
}

function canUserAccessProject(user, projectId) {
  if (!user) return false;
  if (perms.hasAllProjects(getRole(user.role))) return true;
  const ids = getUserAccessibleProjectIds(user);
  return ids.includes(Number(projectId));
}

const USER_PUBLIC_FIELDS = `id, name, email, role, crea_cft, phone, active, created_at, display_name, cpf, birth_date,
  phone_alt, employment_type, company, job_title, registration_number, council, council_number, council_uf,
  access_expires_at, avatar_url, signature_url, notes, invite_pending, must_change_password, last_login_at`;

// Auth middleware — aceita somente token Bearer assinado.
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const decoded = authHeader && authHeader.startsWith('Bearer ') ? verifyToken(authHeader.slice(7)) : null;

  if (!decoded) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
  }

  const user = db.prepare(`SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE id = ?`).get(decoded.id);

  if (!user || !user.active) {
    return res.status(401).json({ error: 'Usuário inválido ou inativo.' });
  }
  if (isAccessExpired(user)) {
    return res.status(401).json({ error: 'O prazo de acesso desta conta expirou. Procure o administrador.' });
  }

  req.user = user;
  req.role = getRole(user.role);
  req.impersonatorId = decoded.impersonatorId || null;
  req.accessibleProjectIds = getUserAccessibleProjectIds(user);
  req.allProjects = perms.hasAllProjects(req.role);

  // Permissões do perfil de acesso para a rota chamada
  const denied = perms.checkRoutePermission(req.role, req.method, req.originalUrl.split('?')[0]);
  if (denied) return res.status(403).json({ error: denied });

  next();
}

function publicRole(role) {
  if (!role) return null;
  return { key: role.key, name: role.name, color: role.color, scope: role.scope, is_system: role.is_system };
}

// Dados do usuário enviados ao frontend (inclui perfil e permissões)
function sessionUser(user) {
  const { password_hash, ...safeUser } = user;
  const role = getRole(safeUser.role);
  return {
    ...safeUser,
    role_info: publicRole(role),
    permissions: perms.isAdminRole(role) ? 'ALL' : role ? role.permissions : {},
    accessibleProjectIds: getUserAccessibleProjectIds(safeUser)
  };
}

function buildSessionResponse(user, extra = {}) {
  const { password_hash, ...safeUser } = user;
  return {
    token: createToken(safeUser, extra),
    user: sessionUser(user),
    impersonatorId: extra.impersonatorId || null
  };
}

// Registra o acesso (último login e fim do convite pendente)
function markLogin(userId) {
  db.prepare('UPDATE users SET last_login_at = ?, invite_pending = 0 WHERE id = ?').run(new Date().toISOString(), userId);
}

// ============================================================================
// LIMITE DE TENTATIVAS (em memória)
// ============================================================================
const rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}
// Conta apenas falhas (ex.: senha errada) — sem consumir o limite em logins bem-sucedidos.
function isBlocked(key, max) {
  const bucket = rateBuckets.get(key);
  return Boolean(bucket && bucket.resetAt >= Date.now() && bucket.count >= max);
}
function registerFailure(key, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
  else bucket.count += 1;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
}, 10 * 60 * 1000).unref();

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const PASSWORD_MIN = 6;

// ============================================================================
// 0. AUTENTICAÇÃO
// ============================================================================

// Healthcheck endpoint for Coolify / Docker
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'axis-obra', timestamp: new Date().toISOString() });
});

// Opções exibidas na tela de login
app.get('/api/auth/options', (_req, res) => {
  res.json({ emailCodeEnabled: mailer.emailAvailable });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }
  const normEmail = normalizeEmail(email);
  const ipKey = `login-fail:${req.ip}`;
  const emailKey = `login-fail:${normEmail}`;
  if (isBlocked(ipKey, 30) || isBlocked(emailKey, 8)) {
    return res.status(429).json({ error: 'Muitas tentativas de login sem sucesso. Aguarde 15 minutos e tente novamente.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? AND active = 1').get(normEmail);
  if (!user || !verifyPassword(password, user.password_hash)) {
    registerFailure(ipKey, 15 * 60 * 1000);
    registerFailure(emailKey, 15 * 60 * 1000);
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  if (isAccessExpired(user)) {
    return res.status(401).json({ error: 'O prazo de acesso desta conta expirou. Procure o administrador.' });
  }

  // Migra hash antigo para scrypt de forma transparente
  if (isLegacyHash(user.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  }

  markLogin(user.id);
  res.json(buildSessionResponse(user));
});

// --- Códigos por e-mail (login sem senha e recuperação de senha) ---
const CODE_TTL_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const hashCode = (code) => crypto.createHmac('sha256', TOKEN_SECRET).update(String(code)).digest('hex');

app.post('/api/auth/request-code', async (req, res) => {
  const { email, purpose } = req.body || {};
  const normEmail = normalizeEmail(email);
  const finalPurpose = purpose === 'RESET' ? 'RESET' : 'LOGIN';
  if (!normEmail) return res.status(400).json({ error: 'Informe o e-mail cadastrado.' });

  if (!mailer.emailAvailable) {
    return res.status(503).json({ error: 'O envio de códigos por e-mail não está configurado no servidor.' });
  }
  if (!rateLimit(`code-ip:${req.ip}`, 10, 15 * 60 * 1000) || !rateLimit(`code:${normEmail}`, 3, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Muitas solicitações de código. Aguarde alguns minutos.' });
  }

  // Resposta é sempre a mesma, exista ou não o e-mail (não revela usuários cadastrados).
  const genericResponse = {
    success: true,
    message: 'Se o e-mail estiver cadastrado e ativo, você receberá um código em instantes.'
  };

  const user = db.prepare('SELECT id, name, email FROM users WHERE LOWER(email) = ? AND active = 1').get(normEmail);
  if (!user) return res.json(genericResponse);

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = Date.now();
  // Invalida códigos anteriores do mesmo tipo
  db.prepare('UPDATE auth_codes SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL').run(
    now,
    user.id,
    finalPurpose
  );
  db.prepare(
    'INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(user.id, finalPurpose, hashCode(code), now + CODE_TTL_MINUTES * 60 * 1000, now);

  try {
    await mailer.sendAuthCode({
      to: user.email,
      name: user.name,
      code,
      purpose: finalPurpose,
      minutes: CODE_TTL_MINUTES
    });
  } catch (err) {
    console.error('Falha ao enviar e-mail de código:', err.message);
    return res.status(502).json({ error: 'Não foi possível enviar o e-mail agora. Tente novamente mais tarde.' });
  }

  res.json(genericResponse);
});

// Valida e consome um código. Retorna o usuário ou um objeto de erro.
function consumeAuthCode(email, code, purposes) {
  const purposeList = Array.isArray(purposes) ? purposes : [purposes];
  const normEmail = normalizeEmail(email);
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? AND active = 1').get(normEmail);
  const invalid = { error: 'Código inválido ou expirado. Solicite um novo código.' };
  if (!user || !code) return invalid;
  if (isAccessExpired(user)) return { error: 'O prazo de acesso desta conta expirou. Procure o administrador.' };

  const row = db
    .prepare(
      `SELECT * FROM auth_codes WHERE user_id = ? AND purpose IN (${purposeList.map(() => '?').join(',')})
       AND used_at IS NULL ORDER BY id DESC LIMIT 1`
    )
    .get(user.id, ...purposeList);
  if (!row || row.expires_at < Date.now() || row.attempts >= CODE_MAX_ATTEMPTS) return invalid;

  const a = Buffer.from(hashCode(String(code).trim()));
  const b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return invalid;
  }

  db.prepare('UPDATE auth_codes SET used_at = ? WHERE id = ?').run(Date.now(), row.id);
  return { user };
}

app.post('/api/auth/login-code', (req, res) => {
  const { email, code } = req.body || {};
  if (isBlocked(`verify-fail:${req.ip}`, 30)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
  }
  const result = consumeAuthCode(email, code, 'LOGIN');
  if (result.error) {
    registerFailure(`verify-fail:${req.ip}`, 15 * 60 * 1000);
    return res.status(401).json({ error: result.error });
  }
  markLogin(result.user.id);
  res.json(buildSessionResponse(result.user));
});

app.post('/api/auth/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < PASSWORD_MIN) {
    return res.status(400).json({ error: `A nova senha deve ter pelo menos ${PASSWORD_MIN} caracteres.` });
  }
  if (isBlocked(`verify-fail:${req.ip}`, 30)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
  }
  // Recuperação de senha ou aceite do convite de nova conta
  const result = consumeAuthCode(email, code, ['RESET', 'INVITE']);
  if (result.error) {
    registerFailure(`verify-fail:${req.ip}`, 15 * 60 * 1000);
    return res.status(401).json({ error: result.error });
  }

  db.prepare(
    'UPDATE users SET password_hash = ?, invite_pending = 0, must_change_password = 0 WHERE id = ?'
  ).run(hashPassword(newPassword), result.user.id);
  res.json({ success: true, message: 'Senha definida com sucesso. Faça login com a nova senha.' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: sessionUser(req.user), impersonatorId: req.impersonatorId });
});

// Alterar a própria senha
app.put('/api/auth/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (req.impersonatorId) {
    return res.status(403).json({ error: 'Não é possível alterar senha durante a simulação de acesso.' });
  }
  if (!newPassword || String(newPassword).length < PASSWORD_MIN) {
    return res.status(400).json({ error: `A nova senha deve ter pelo menos ${PASSWORD_MIN} caracteres.` });
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(currentPassword || '', row.password_hash)) {
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    hashPassword(newPassword),
    req.user.id
  );
  res.json({ success: true });
});

// Simular acesso de outro usuário (somente ADMIN). O token guarda quem iniciou a simulação.
app.post('/api/auth/impersonate', authenticate, (req, res) => {
  if (!can(req, 'ACCOUNTS', 'impersonate') || req.impersonatorId) {
    return res.status(403).json({ error: 'Seu perfil não permite simular o acesso de outro usuário.' });
  }
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(Number(req.body?.userId));
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado ou inativo.' });
  if (target.role === 'ADMIN' && !perms.isAdminRole(req.role)) {
    return res.status(403).json({ error: 'Somente um Administrador pode simular o acesso de outro Administrador.' });
  }
  res.json(buildSessionResponse(target, { impersonatorId: req.user.id }));
});

// Encerrar simulação e voltar ao administrador
app.post('/api/auth/stop-impersonation', authenticate, (req, res) => {
  if (!req.impersonatorId) return res.status(400).json({ error: 'Nenhuma simulação ativa.' });
  const original = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(req.impersonatorId);
  if (!original) return res.status(401).json({ error: 'Usuário original inválido. Faça login novamente.' });
  res.json(buildSessionResponse(original));
});

// Backup do banco de dados (somente ADMIN)
app.get('/api/admin/backup', authenticate, (_req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tmpFile = path.join(dataDir, `backup-${stamp}-${crypto.randomBytes(3).toString('hex')}.db`);
  try {
    db.exec(`VACUUM INTO '${tmpFile.replace(/'/g, "''")}'`);
    res.download(tmpFile, `axis_obra_backup_${stamp}.db`, () => {
      fs.unlink(tmpFile, () => {});
    });
  } catch (err) {
    fs.unlink(tmpFile, () => {});
    res.status(500).json({ error: `Falha ao gerar backup: ${err.message}` });
  }
});

// ============================================================================
// 1. DASHBOARD CONSOLIDADO (FILTRADO POR USUÁRIO E OBRA)
// ============================================================================

app.get('/api/dashboard', authenticate, (req, res) => {
  const { projectId } = req.query;
  let targetProjectIds = req.accessibleProjectIds;

  if (projectId && projectId !== 'ALL') {
    const pid = Number(projectId);
    if (!canUserAccessProject(req.user, pid)) {
      return res.status(403).json({ error: 'Sem permissão para acessar esta obra.' });
    }
    targetProjectIds = [pid];
  }

  if (targetProjectIds.length === 0) {
    return res.json({
      projectsCount: 0,
      employeesCount: 0,
      activeEmployeesCount: 0,
      equipmentsCount: 0,
      operationalEquipmentsCount: 0,
      photosCount: 0,
      openOccurrencesCount: 0,
      criticalOccurrencesCount: 0,
      totalRainfallMm: 0,
      totalHoursLostRain: 0,
      recentPhotos: [],
      recentOccurrences: [],
      recentPluviometry: [],
      projectsSummary: []
    });
  }

  const placeholders = targetProjectIds.map(() => '?').join(',');

  const projectsSummary = db
    .prepare(`SELECT * FROM projects WHERE id IN (${placeholders}) ORDER BY id ASC`)
    .all(...targetProjectIds)
    .map((p) => {
      const empCount = db.prepare('SELECT COUNT(*) as c FROM employees WHERE project_id = ? AND status = ?').get(p.id, 'ATIVO').c;
      const eqpCount = db.prepare('SELECT COUNT(*) as c FROM equipments WHERE project_id = ?').get(p.id).c;
      const occOpen = db.prepare("SELECT COUNT(*) as c FROM occurrences WHERE project_id = ? AND status != 'RESOLVIDA'").get(p.id).c;
      const photoCount = db.prepare('SELECT COUNT(*) as c FROM photos WHERE project_id = ?').get(p.id).c;
      const rainSum = db.prepare('SELECT COALESCE(SUM(rainfall_mm), 0) as total FROM pluviometry WHERE project_id = ?').get(p.id).total;
      const assignedUsers = db
        .prepare(`
          SELECT u.id, u.name, u.role, pu.role_in_project
          FROM project_users pu
          JOIN users u ON u.id = pu.user_id
          WHERE pu.project_id = ?
        `)
        .all(p.id);

      return {
        ...p,
        activeEmployees: empCount,
        equipmentsCount: eqpCount,
        openOccurrences: occOpen,
        photosCount: photoCount,
        totalRainfallMm: Number(rainSum.toFixed(1)),
        assignedUsers
      };
    });

  const employeesCount = db
    .prepare(`SELECT COUNT(*) as c FROM employees WHERE project_id IN (${placeholders})`)
    .get(...targetProjectIds).c;

  const activeEmployeesCount = db
    .prepare(`SELECT COUNT(*) as c FROM employees WHERE project_id IN (${placeholders}) AND status = 'ATIVO'`)
    .get(...targetProjectIds).c;

  const equipmentsCount = db
    .prepare(`SELECT COUNT(*) as c FROM equipments WHERE project_id IN (${placeholders})`)
    .get(...targetProjectIds).c;

  const operationalEquipmentsCount = db
    .prepare(`SELECT COUNT(*) as c FROM equipments WHERE project_id IN (${placeholders}) AND status = 'OPERACIONAL'`)
    .get(...targetProjectIds).c;

  const photosCount = db
    .prepare(`SELECT COUNT(*) as c FROM photos WHERE project_id IN (${placeholders})`)
    .get(...targetProjectIds).c;

  const openOccurrencesCount = db
    .prepare(`SELECT COUNT(*) as c FROM occurrences WHERE project_id IN (${placeholders}) AND status != 'RESOLVIDA'`)
    .get(...targetProjectIds).c;

  const criticalOccurrencesCount = db
    .prepare(`SELECT COUNT(*) as c FROM occurrences WHERE project_id IN (${placeholders}) AND status != 'RESOLVIDA' AND severity IN ('ALTA', 'CRITICA')`)
    .get(...targetProjectIds).c;

  const rainStats = db
    .prepare(`
      SELECT COALESCE(SUM(rainfall_mm), 0) as totalMm, COALESCE(SUM(hours_lost), 0) as totalHours
      FROM pluviometry
      WHERE project_id IN (${placeholders})
    `)
    .get(...targetProjectIds);

  const recentPhotos = db
    .prepare(`
      SELECT ph.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM photos ph
      JOIN projects p ON p.id = ph.project_id
      LEFT JOIN users u ON u.id = ph.user_id
      WHERE ph.project_id IN (${placeholders})
      ORDER BY ph.taken_at DESC, ph.id DESC
      LIMIT 4
    `)
    .all(...targetProjectIds);

  const recentOccurrences = db
    .prepare(`
      SELECT oc.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM occurrences oc
      JOIN projects p ON p.id = oc.project_id
      LEFT JOIN users u ON u.id = oc.user_id
      WHERE oc.project_id IN (${placeholders})
      ORDER BY oc.occurrence_date DESC, oc.id DESC
      LIMIT 5
    `)
    .all(...targetProjectIds);

  const recentPluviometry = db
    .prepare(`
      SELECT pl.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM pluviometry pl
      JOIN projects p ON p.id = pl.project_id
      LEFT JOIN users u ON u.id = pl.user_id
      WHERE pl.project_id IN (${placeholders})
      ORDER BY pl.record_date DESC, pl.id DESC
      LIMIT 7
    `)
    .all(...targetProjectIds);

  res.json({
    projectsCount: projectsSummary.length,
    employeesCount,
    activeEmployeesCount,
    equipmentsCount,
    operationalEquipmentsCount,
    photosCount,
    openOccurrencesCount,
    criticalOccurrencesCount,
    totalRainfallMm: Number(rainStats.totalMm.toFixed(1)),
    totalHoursLostRain: Number(rainStats.totalHours.toFixed(1)),
    recentPhotos,
    recentOccurrences,
    recentPluviometry,
    projectsSummary
  });
});

// ============================================================================
// 2. GERENCIAMENTO DE OBRAS E USUÁRIOS VINCULADOS (MÓDULO 5)
// ============================================================================

app.get('/api/projects', authenticate, (req, res) => {
  const ids = req.accessibleProjectIds;
  if (ids.length === 0) return res.json([]);

  const placeholders = ids.map(() => '?').join(',');
  const projects = db
    .prepare(`SELECT * FROM projects WHERE id IN (${placeholders}) ORDER BY id ASC`)
    .all(...ids);

  const result = projects.map((p) => {
    const users = db
      .prepare(`
        SELECT u.id, u.name, u.email, u.role, u.crea_cft, pu.role_in_project, pu.can_edit, pu.assigned_at
        FROM project_users pu
        JOIN users u ON u.id = pu.user_id
        WHERE pu.project_id = ?
        ORDER BY u.name ASC
      `)
      .all(p.id);

    const employeesCount = db.prepare('SELECT COUNT(*) as c FROM employees WHERE project_id = ?').get(p.id).c;
    const equipmentsCount = db.prepare('SELECT COUNT(*) as c FROM equipments WHERE project_id = ?').get(p.id).c;

    return { ...p, assignedUsers: users, employeesCount, equipmentsCount };
  });

  res.json(result);
});

app.post('/api/projects', authenticate, (req, res) => {

  const {
    code,
    name,
    client,
    address,
    city,
    state,
    start_date,
    expected_end_date,
    status,
    progress,
    budget,
    area_m2,
    description,
    assignedUserIds
  } = req.body;

  if (!code || !name || !client || !address || !city || !state) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios da obra.' });
  }

  try {
    const info = db
      .prepare(`
        INSERT INTO projects (code, name, client, address, city, state, start_date, expected_end_date, status, progress, budget, area_m2, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code.trim().toUpperCase(),
        name.trim(),
        client.trim(),
        address.trim(),
        city.trim(),
        state.trim().toUpperCase(),
        start_date || null,
        expected_end_date || null,
        status || 'EM_ANDAMENTO',
        Number(progress) || 0,
        Number(budget) || 0,
        Number(area_m2) || 0,
        description || ''
      );

    const projectId = Number(info.lastInsertRowid);

    // Link creator + any selected users
    const insertLink = db.prepare(`
      INSERT OR IGNORE INTO project_users (project_id, user_id, role_in_project, can_edit)
      VALUES (?, ?, ?, 1)
    `);
    insertLink.run(projectId, req.user.id, 'Gestor / Administrador');

    if (Array.isArray(assignedUserIds)) {
      for (const uid of assignedUserIds) {
        insertLink.run(projectId, Number(uid), 'Equipe Técnica Vinculada');
      }
    }

    const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Código de obra já cadastrado.' : err.message });
  }
});

app.put('/api/projects/:id', authenticate, (req, res) => {
  const projectId = Number(req.params.id);
  if (!canUserAccessProject(req.user, projectId)) {
    return res.status(403).json({ error: 'Sem permissão para editar esta obra.' });
  }

  const {
    code,
    name,
    client,
    address,
    city,
    state,
    start_date,
    expected_end_date,
    status,
    progress,
    budget,
    area_m2,
    description
  } = req.body;

  try {
    db.prepare(`
      UPDATE projects
      SET code = ?, name = ?, client = ?, address = ?, city = ?, state = ?,
          start_date = ?, expected_end_date = ?, status = ?, progress = ?,
          budget = ?, area_m2 = ?, description = ?
      WHERE id = ?
    `).run(
      code,
      name,
      client,
      address,
      city,
      state,
      start_date || null,
      expected_end_date || null,
      status || 'EM_ANDAMENTO',
      Number(progress) || 0,
      Number(budget) || 0,
      Number(area_m2) || 0,
      description || '',
      projectId
    );

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', authenticate, (req, res) => {
  const projectId = Number(req.params.id);
  if (!canUserAccessProject(req.user, projectId)) {
    return res.status(403).json({ error: 'Sem permissão para excluir esta obra.' });
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  res.json({ success: true });
});

// Manage users linked to a project
app.post('/api/projects/:id/users', authenticate, (req, res) => {
  const projectId = Number(req.params.id);
  if (!canUserAccessProject(req.user, projectId)) {
    return res.status(403).json({ error: 'Sem permissão nesta obra.' });
  }
  const { user_id, role_in_project, can_edit } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'Selecione um usuário.' });
  }

  db.prepare(`
    INSERT INTO project_users (project_id, user_id, role_in_project, can_edit)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, user_id) DO UPDATE SET
      role_in_project = excluded.role_in_project,
      can_edit = excluded.can_edit
  `).run(projectId, Number(user_id), role_in_project || 'Responsável Técnico', can_edit !== undefined ? (can_edit ? 1 : 0) : 1);

  res.json({ success: true });
});

app.delete('/api/projects/:id/users/:userId', authenticate, (req, res) => {
  const projectId = Number(req.params.id);
  if (!canUserAccessProject(req.user, projectId)) {
    return res.status(403).json({ error: 'Sem permissão nesta obra.' });
  }
  const targetUserId = Number(req.params.userId);

  db.prepare('DELETE FROM project_users WHERE project_id = ? AND user_id = ?').run(projectId, targetUserId);
  res.json({ success: true });
});

// ============================================================================
// 9. GESTÃO DE CONTAS (usuários) e PERFIS DE ACESSO
// ============================================================================
const ACCOUNT_FIELDS = [
  'name',
  'display_name',
  'cpf',
  'birth_date',
  'phone',
  'phone_alt',
  'employment_type',
  'company',
  'job_title',
  'registration_number',
  'council',
  'council_number',
  'council_uf',
  'crea_cft',
  'access_expires_at',
  'notes'
];
const EMPLOYMENT_TYPES = ['PROPRIO', 'TERCEIRIZADO', 'FISCALIZACAO', 'CLIENTE'];
const INVITE_TTL_DAYS = 7;

function listUserProjects(userId) {
  return db
    .prepare(`
      SELECT p.id, p.code, p.name, pu.role_in_project, pu.can_edit, pu.since_date
      FROM project_users pu
      JOIN projects p ON p.id = pu.project_id
      WHERE pu.user_id = ?
      ORDER BY p.id ASC
    `)
    .all(userId);
}

function getAccount(userId) {
  const u = db.prepare(`SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE id = ?`).get(userId);
  if (!u) return null;
  return { ...u, role_info: publicRole(getRole(u.role)), projects: listUserProjects(u.id) };
}

// Grava os vínculos de obra informados no cadastro da conta
function saveAssignments(userId, assignments) {
  if (!Array.isArray(assignments)) return;
  db.prepare('DELETE FROM project_users WHERE user_id = ?').run(userId);
  const stmt = db.prepare(`
    INSERT INTO project_users (project_id, user_id, role_in_project, can_edit, since_date)
    VALUES (?, ?, ?, 1, ?)
  `);
  for (const item of assignments) {
    const pid = Number(item.project_id);
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(pid)) continue;
    stmt.run(pid, userId, String(item.role_in_project || '').trim() || 'Equipe da obra', item.since_date || '');
  }
}

function validateAccountInput(body, { creating }) {
  if (creating && (!body.name || !String(body.name).trim())) return 'Informe o nome completo.';
  if (creating && (!body.email || !String(body.email).includes('@'))) return 'Informe um e-mail válido.';
  if (body.employment_type && !EMPLOYMENT_TYPES.includes(body.employment_type)) return 'Vínculo inválido.';
  if (body.cpf && String(body.cpf).replace(/\D/g, '').length !== 11) return 'CPF deve ter 11 dígitos.';
  if (body.password && String(body.password).length < PASSWORD_MIN) {
    return `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`;
  }
  return null;
}

// Só um Administrador pode criar/editar Administradores ou dar esse perfil a alguém
function checkRoleAssignment(req, targetRoleKey, existingRoleKey) {
  if (!getRole(targetRoleKey)) return 'Perfil de acesso inválido.';
  const adminInvolved = targetRoleKey === 'ADMIN' || existingRoleKey === 'ADMIN';
  if (adminInvolved && !perms.isAdminRole(req.role)) {
    return 'Somente um Administrador pode atribuir o perfil Administrador ou alterar a conta de um Administrador.';
  }
  return null;
}

function appBaseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

async function sendInvite(req, user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = Date.now();
  db.prepare("UPDATE auth_codes SET used_at = ? WHERE user_id = ? AND purpose = 'INVITE' AND used_at IS NULL").run(now, user.id);
  db.prepare(
    "INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at, created_at) VALUES (?, 'INVITE', ?, ?, ?)"
  ).run(user.id, hashCode(code), now + INVITE_TTL_DAYS * 24 * 3600 * 1000, now);
  const link = `${appBaseUrl(req)}/?convite=1&email=${encodeURIComponent(user.email)}&codigo=${code}`;
  await mailer.sendAuthCode({
    to: user.email,
    name: user.name,
    code,
    purpose: 'INVITE',
    minutes: INVITE_TTL_DAYS * 24 * 60,
    link,
    invitedBy: req.user.name
  });
}

app.get('/api/users', authenticate, (_req, res) => {
  const users = db.prepare(`SELECT ${USER_PUBLIC_FIELDS} FROM users ORDER BY active DESC, name ASC`).all();
  const roles = new Map(db.prepare('SELECT * FROM roles').all().map((r) => [r.key, publicRole(parseRole(r))]));
  res.json(users.map((u) => ({ ...u, role_info: roles.get(u.role) || null, projects: listUserProjects(u.id) })));
});

app.get('/api/users/:id', authenticate, (req, res) => {
  const account = getAccount(Number(req.params.id));
  if (!account) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json(account);
});

app.post('/api/users', authenticate, async (req, res) => {
  const body = req.body || {};
  const invalid = validateAccountInput(body, { creating: true });
  if (invalid) return res.status(400).json({ error: invalid });

  const roleKey = body.role || 'ENGENHEIRO';
  const roleError = checkRoleAssignment(req, roleKey, null);
  if (roleError) return res.status(roleError.startsWith('Somente') ? 403 : 400).json({ error: roleError });

  // Primeiro acesso: convite por e-mail (padrão) ou senha definida agora (troca obrigatória no 1º login)
  const sendInviteEmail = body.first_access ? body.first_access !== 'PASSWORD' : !body.password;
  if (!sendInviteEmail && !body.password) {
    return res.status(400).json({ error: 'Informe a senha inicial ou escolha enviar convite por e-mail.' });
  }
  if (sendInviteEmail && !mailer.emailAvailable) {
    return res.status(503).json({ error: 'O envio de e-mail não está configurado. Escolha "Definir senha agora".' });
  }

  const avatarUrl = body.avatar_base64 ? saveBase64Image(body.avatar_base64, 'avatar') : '';
  const signatureUrl = body.signature_base64 ? saveBase64Image(body.signature_base64, 'assinatura') : '';
  if ((body.avatar_base64 && !avatarUrl) || (body.signature_base64 && !signatureUrl)) {
    return res.status(400).json({ error: 'Imagem inválida. Use JPG, PNG ou WEBP de até 10 MB.' });
  }

  let newUserId;
  try {
    const cols = ['email', 'password_hash', 'role', 'active', 'invite_pending', 'must_change_password', 'avatar_url', 'signature_url', ...ACCOUNT_FIELDS];
    const values = [
      normalizeEmail(body.email),
      hashPassword(sendInviteEmail ? crypto.randomBytes(18).toString('base64url') : body.password),
      roleKey,
      body.active === false ? 0 : 1,
      sendInviteEmail ? 1 : 0,
      sendInviteEmail ? 0 : 1,
      avatarUrl || '',
      signatureUrl || '',
      ...ACCOUNT_FIELDS.map((f) => (body[f] !== undefined && body[f] !== null ? String(body[f]).trim() : f === 'employment_type' ? 'PROPRIO' : ''))
    ];
    const info = db
      .prepare(`INSERT INTO users (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...values);
    newUserId = Number(info.lastInsertRowid);
  } catch (err) {
    return res.status(400).json({ error: err.message.includes('UNIQUE') ? 'E-mail já cadastrado.' : err.message });
  }

  // Compatibilidade com o formato antigo (projectIds + role_in_project)
  const assignments = Array.isArray(body.assignments)
    ? body.assignments
    : Array.isArray(body.projectIds)
    ? body.projectIds.map((pid) => ({ project_id: pid, role_in_project: body.role_in_project }))
    : [];
  saveAssignments(newUserId, assignments);

  let inviteWarning = null;
  if (sendInviteEmail) {
    try {
      await sendInvite(req, getAccount(newUserId));
    } catch (err) {
      console.error('Falha ao enviar convite:', err.message);
      inviteWarning = 'Conta criada, mas o e-mail de convite não pôde ser enviado. Use "Reenviar convite".';
    }
  }

  res.status(201).json({ ...getAccount(newUserId), inviteWarning });
});

app.put('/api/users/:id', authenticate, (req, res) => {
  const targetId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!existing) return res.status(404).json({ error: 'Conta não encontrada.' });

  const body = req.body || {};
  const invalid = validateAccountInput(body, { creating: false });
  if (invalid) return res.status(400).json({ error: invalid });

  const newRole = body.role || existing.role;
  const newActive = body.active !== undefined ? (body.active ? 1 : 0) : existing.active;
  const roleError = checkRoleAssignment(req, newRole, existing.role);
  if (roleError) return res.status(roleError.startsWith('Somente') ? 403 : 400).json({ error: roleError });

  if (targetId === req.user.id && (newRole !== existing.role || !newActive)) {
    return res.status(400).json({ error: 'Você não pode alterar o próprio perfil de acesso nem desativar a própria conta.' });
  }
  if (existing.role === 'ADMIN' && existing.active && (newRole !== 'ADMIN' || !newActive)) {
    const otherAdmins = db
      .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'ADMIN' AND active = 1 AND id != ?")
      .get(targetId).c;
    if (otherAdmins === 0) return res.status(400).json({ error: 'O sistema precisa ter pelo menos um Administrador ativo.' });
  }

  let avatarUrl = existing.avatar_url;
  let signatureUrl = existing.signature_url;
  if (body.avatar_base64) {
    avatarUrl = saveBase64Image(body.avatar_base64, 'avatar');
    if (!avatarUrl) return res.status(400).json({ error: 'Foto inválida. Use JPG, PNG ou WEBP de até 10 MB.' });
  } else if (body.avatar_url === '') avatarUrl = '';
  if (body.signature_base64) {
    signatureUrl = saveBase64Image(body.signature_base64, 'assinatura');
    if (!signatureUrl) return res.status(400).json({ error: 'Assinatura inválida. Use JPG, PNG ou WEBP de até 10 MB.' });
  } else if (body.signature_url === '') signatureUrl = '';

  try {
    const sets = ['email = ?', 'role = ?', 'active = ?', 'avatar_url = ?', 'signature_url = ?', ...ACCOUNT_FIELDS.map((f) => `${f} = ?`)];
    const values = [
      body.email !== undefined ? normalizeEmail(body.email) : existing.email,
      newRole,
      newActive,
      avatarUrl || '',
      signatureUrl || '',
      ...ACCOUNT_FIELDS.map((f) => (body[f] !== undefined && body[f] !== null ? String(body[f]).trim() : existing[f]))
    ];
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values, targetId);
  } catch (err) {
    return res.status(400).json({ error: err.message.includes('UNIQUE') ? 'E-mail já cadastrado.' : err.message });
  }

  if (Array.isArray(body.assignments)) saveAssignments(targetId, body.assignments);
  res.json(getAccount(targetId));
});

// Definir nova senha para uma conta (pede troca no próximo acesso)
app.put('/api/users/:id/password', authenticate, (req, res) => {
  const targetId = Number(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < PASSWORD_MIN) {
    return res.status(400).json({ error: `A nova senha deve ter pelo menos ${PASSWORD_MIN} caracteres.` });
  }
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Conta não encontrada.' });
  if (target.role === 'ADMIN' && !perms.isAdminRole(req.role)) {
    return res.status(403).json({ error: 'Somente um Administrador pode redefinir a senha de outro Administrador.' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(
    hashPassword(newPassword),
    targetId === req.user.id ? 0 : 1,
    targetId
  );
  res.json({ success: true });
});

// Reenviar convite de primeiro acesso
app.post('/api/users/:id/invite', authenticate, async (req, res) => {
  const account = getAccount(Number(req.params.id));
  if (!account || !account.active) return res.status(404).json({ error: 'Conta não encontrada ou inativa.' });
  if (!mailer.emailAvailable) return res.status(503).json({ error: 'O envio de e-mail não está configurado no servidor.' });
  try {
    db.prepare('UPDATE users SET invite_pending = 1 WHERE id = ? AND last_login_at = ?').run(account.id, '');
    await sendInvite(req, account);
  } catch (err) {
    console.error('Falha ao enviar convite:', err.message);
    return res.status(502).json({ error: 'Não foi possível enviar o convite agora. Tente novamente mais tarde.' });
  }
  res.json({ success: true, message: `Convite enviado para ${account.email}.` });
});

app.put('/api/users/:id/projects', authenticate, (req, res) => {
  const targetUserId = Number(req.params.id);
  const { assignments } = req.body; // Array of { project_id, role_in_project, since_date }
  saveAssignments(targetUserId, Array.isArray(assignments) ? assignments : []);
  res.json({ success: true });
});

// --- Perfis de acesso (Módulo 8 → Perfis de Acesso) ---
function listRoles() {
  const counts = new Map(
    db.prepare('SELECT role, COUNT(*) as c FROM users WHERE active = 1 GROUP BY role').all().map((r) => [r.role, r.c])
  );
  return db
    .prepare('SELECT * FROM roles ORDER BY is_system DESC, id ASC')
    .all()
    .map((r) => ({ ...parseRole(r), users_count: counts.get(r.key) || 0 }));
}

app.get('/api/roles', authenticate, (_req, res) => {
  res.json({ roles: listRoles(), modules: perms.MODULES });
});

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
function validateRoleInput(body) {
  if (!body.name || !String(body.name).trim()) return 'Informe o nome do perfil.';
  if (String(body.name).trim().length > 60) return 'Nome do perfil muito longo (máximo 60 caracteres).';
  if (body.color && !HEX_COLOR.test(body.color)) return 'Cor inválida.';
  if (body.scope && !['LINKED', 'ALL'].includes(body.scope)) return 'Abrangência inválida.';
  return null;
}

app.post('/api/roles', authenticate, (req, res) => {
  const body = req.body || {};
  const invalid = validateRoleInput(body);
  if (invalid) return res.status(400).json({ error: invalid });
  const slug = String(body.name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);
  const key = `P_${slug || 'PERFIL'}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  try {
    db.prepare(
      'INSERT INTO roles (key, name, description, color, scope, is_system, permissions) VALUES (?, ?, ?, ?, ?, 0, ?)'
    ).run(
      key,
      String(body.name).trim(),
      String(body.description || '').trim(),
      body.color || '#475569',
      body.scope || 'LINKED',
      JSON.stringify(perms.normalizePermissions(body.permissions))
    );
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.status(201).json(listRoles().find((r) => r.key === key));
});

app.put('/api/roles/:key', authenticate, (req, res) => {
  const existing = db.prepare('SELECT * FROM roles WHERE key = ?').get(req.params.key);
  if (!existing) return res.status(404).json({ error: 'Perfil não encontrado.' });
  if (existing.key === 'ADMIN') {
    return res.status(400).json({ error: 'O perfil Administrador tem sempre acesso total e não pode ser alterado.' });
  }
  if (existing.key === req.user.role && !perms.isAdminRole(req.role)) {
    return res.status(403).json({ error: 'Você não pode alterar as permissões do seu próprio perfil.' });
  }
  const body = { name: existing.name, ...req.body };
  const invalid = validateRoleInput(body);
  if (invalid) return res.status(400).json({ error: invalid });

  db.prepare(
    'UPDATE roles SET name = ?, description = ?, color = ?, scope = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(
    String(body.name).trim(),
    body.description !== undefined ? String(body.description).trim() : existing.description,
    body.color || existing.color,
    body.scope || existing.scope,
    body.permissions ? JSON.stringify(perms.normalizePermissions(body.permissions)) : existing.permissions,
    existing.id
  );
  res.json(listRoles().find((r) => r.key === existing.key));
});

app.delete('/api/roles/:key', authenticate, (req, res) => {
  const existing = db.prepare('SELECT * FROM roles WHERE key = ?').get(req.params.key);
  if (!existing) return res.status(404).json({ error: 'Perfil não encontrado.' });
  if (existing.is_system) return res.status(400).json({ error: 'Perfis padrão podem ser ajustados, mas não excluídos.' });
  const inUse = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get(existing.key).c;
  if (inUse > 0) {
    return res.status(409).json({ error: `Este perfil está em uso por ${inUse} conta(s). Troque o perfil dessas contas antes de excluir.` });
  }
  db.prepare('DELETE FROM roles WHERE id = ?').run(existing.id);
  res.json({ success: true });
});

// ============================================================================
// 3. CADASTRO DE FUNCIONÁRIOS (MÓDULO 3)
// ============================================================================

app.get('/api/employees', authenticate, (req, res) => {
  const { projectId } = req.query;
  const accessible = req.accessibleProjectIds;

  if (accessible.length === 0 && !req.allProjects) {
    return res.json([]);
  }

  let query = `
    SELECT e.*, p.name as project_name, p.code as project_code
    FROM employees e
    LEFT JOIN projects p ON p.id = e.project_id
  `;
  const params = [];

  if (projectId && projectId !== 'ALL') {
    const pid = Number(projectId);
    if (!canUserAccessProject(req.user, pid)) {
      return res.status(403).json({ error: 'Acesso negado a esta obra.' });
    }
    query += ' WHERE e.project_id = ?';
    params.push(pid);
  } else if (!req.allProjects) {
    const placeholders = accessible.map(() => '?').join(',');
    query += ` WHERE e.project_id IN (${placeholders})`;
    params.push(...accessible);
  }

  query += ' ORDER BY e.name ASC';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map((r) => hideCosts(req, 'EMPLOYEES', r, 'daily_rate')));
});

app.post('/api/employees', authenticate, (req, res) => {
  const {
    name,
    cpf,
    registration_number,
    role,
    contract_type,
    company,
    phone,
    daily_rate,
    aso_expiry,
    nr_certifications,
    status,
    project_id
  } = req.body;

  if (!name || !cpf || !role) {
    return res.status(400).json({ error: 'Nome, CPF e Função são obrigatórios.' });
  }

  if (project_id && !canUserAccessProject(req.user, project_id)) {
    return res.status(403).json({ error: 'Sem permissão para alocar funcionário nesta obra.' });
  }

  try {
    const info = db
      .prepare(`
        INSERT INTO employees (name, cpf, registration_number, role, contract_type, company, phone, daily_rate, aso_expiry, nr_certifications, status, project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        name.trim(),
        cpf.trim(),
        registration_number || `FUNC-${Math.floor(100 + Math.random() * 900)}`,
        role.trim(),
        contract_type || 'CLT',
        company || 'Axis Construtora',
        phone || '',
        can(req, 'EMPLOYEES', 'view_costs') ? Number(daily_rate) || 0 : 0,
        aso_expiry || null,
        nr_certifications || 'NR-18',
        status || 'ATIVO',
        project_id ? Number(project_id) : null
      );

    const created = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'CPF já cadastrado no sistema.' : err.message });
  }
});

app.put('/api/employees/:id', authenticate, (req, res) => {
  const empId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
  if (!existing) return res.status(404).json({ error: 'Funcionário não encontrado.' });

  if (existing.project_id && !canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão para alterar este funcionário.' });
  }

  const {
    name,
    cpf,
    registration_number,
    role,
    contract_type,
    company,
    phone,
    daily_rate,
    aso_expiry,
    nr_certifications,
    status,
    project_id
  } = req.body;

  try {
    db.prepare(`
      UPDATE employees
      SET name = ?, cpf = ?, registration_number = ?, role = ?, contract_type = ?,
          company = ?, phone = ?, daily_rate = ?, aso_expiry = ?, nr_certifications = ?,
          status = ?, project_id = ?
      WHERE id = ?
    `).run(
      name,
      cpf,
      registration_number,
      role,
      contract_type || 'CLT',
      company || 'Axis Construtora',
      phone || '',
      can(req, 'EMPLOYEES', 'view_costs') ? Number(daily_rate) || 0 : existing.daily_rate,
      aso_expiry || null,
      nr_certifications || '',
      status || 'ATIVO',
      project_id ? Number(project_id) : null,
      empId
    );

    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/employees/:id', authenticate, (req, res) => {
  const empId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
  if (!existing) return res.status(404).json({ error: 'Funcionário não encontrado.' });

  if (existing.project_id && !canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  db.prepare('DELETE FROM employees WHERE id = ?').run(empId);
  res.json({ success: true });
});

// ============================================================================
// 4. CADASTRO DE EQUIPAMENTOS (MÓDULO 4)
// ============================================================================

app.get('/api/equipments', authenticate, (req, res) => {
  const { projectId } = req.query;
  const accessible = req.accessibleProjectIds;

  if (accessible.length === 0 && !req.allProjects) {
    return res.json([]);
  }

  let query = `
    SELECT eq.*, p.name as project_name, p.code as project_code
    FROM equipments eq
    LEFT JOIN projects p ON p.id = eq.project_id
  `;
  const params = [];

  if (projectId && projectId !== 'ALL') {
    const pid = Number(projectId);
    if (!canUserAccessProject(req.user, pid)) {
      return res.status(403).json({ error: 'Acesso negado a esta obra.' });
    }
    query += ' WHERE eq.project_id = ?';
    params.push(pid);
  } else if (!req.allProjects) {
    const placeholders = accessible.map(() => '?').join(',');
    query += ` WHERE eq.project_id IN (${placeholders})`;
    params.push(...accessible);
  }

  query += ' ORDER BY eq.code ASC';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map((r) => hideCosts(req, 'EQUIPMENTS', r, 'daily_cost')));
});

app.post('/api/equipments', authenticate, (req, res) => {
  const {
    code,
    name,
    category,
    brand,
    model,
    serial_number,
    ownership,
    supplier,
    daily_cost,
    status,
    last_maintenance,
    next_maintenance,
    project_id,
    notes
  } = req.body;

  if (!code || !name || !category) {
    return res.status(400).json({ error: 'Código/TAG, Nome e Categoria são obrigatórios.' });
  }

  if (project_id && !canUserAccessProject(req.user, project_id)) {
    return res.status(403).json({ error: 'Sem permissão para alocar equipamento nesta obra.' });
  }

  try {
    const info = db
      .prepare(`
        INSERT INTO equipments (code, name, category, brand, model, serial_number, ownership, supplier, daily_cost, status, last_maintenance, next_maintenance, project_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code.trim().toUpperCase(),
        name.trim(),
        category,
        brand || '',
        model || '',
        serial_number || '',
        ownership || 'PROPRIO',
        supplier || '',
        can(req, 'EQUIPMENTS', 'view_costs') ? Number(daily_cost) || 0 : 0,
        status || 'OPERACIONAL',
        last_maintenance || null,
        next_maintenance || null,
        project_id ? Number(project_id) : null,
        notes || ''
      );

    const created = db.prepare('SELECT * FROM equipments WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'Código/TAG de equipamento já cadastrado.' : err.message });
  }
});

app.put('/api/equipments/:id', authenticate, (req, res) => {
  const eqId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM equipments WHERE id = ?').get(eqId);
  if (!existing) return res.status(404).json({ error: 'Equipamento não encontrado.' });

  if (existing.project_id && !canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  const {
    code,
    name,
    category,
    brand,
    model,
    serial_number,
    ownership,
    supplier,
    daily_cost,
    status,
    last_maintenance,
    next_maintenance,
    project_id,
    notes
  } = req.body;

  try {
    db.prepare(`
      UPDATE equipments
      SET code = ?, name = ?, category = ?, brand = ?, model = ?, serial_number = ?,
          ownership = ?, supplier = ?, daily_cost = ?, status = ?,
          last_maintenance = ?, next_maintenance = ?, project_id = ?, notes = ?
      WHERE id = ?
    `).run(
      code,
      name,
      category,
      brand || '',
      model || '',
      serial_number || '',
      ownership || 'PROPRIO',
      supplier || '',
      can(req, 'EQUIPMENTS', 'view_costs') ? Number(daily_cost) || 0 : existing.daily_cost,
      status || 'OPERACIONAL',
      last_maintenance || null,
      next_maintenance || null,
      project_id ? Number(project_id) : null,
      notes || '',
      eqId
    );

    const updated = db.prepare('SELECT * FROM equipments WHERE id = ?').get(eqId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/equipments/:id', authenticate, (req, res) => {
  const eqId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM equipments WHERE id = ?').get(eqId);
  if (!existing) return res.status(404).json({ error: 'Equipamento não encontrado.' });

  if (existing.project_id && !canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  db.prepare('DELETE FROM equipments WHERE id = ?').run(eqId);
  res.json({ success: true });
});

// ============================================================================
// 5. REGISTRO FOTOGRÁFICO E CONFIGURAÇÃO DE RELATÓRIO (MÓDULO 1)
// ============================================================================

app.get('/api/report-settings', authenticate, (_req, res) => {
  const row = db.prepare('SELECT * FROM report_settings WHERE id = 1').get();
  res.json(row || {});
});

app.put('/api/report-settings', authenticate, upload.single('banner_file'), (req, res) => {
  const existing = db.prepare('SELECT * FROM report_settings WHERE id = 1').get();
  const {
    orientation,
    photos_per_page,
    banner_mode,
    banner_image_base64,
    banner_image_url,
    banner_text,
    banner_text_align,
    banner_font_size,
    banner_bold,
    banner_italic,
    banner_underline,
    banner_color,
    subheader_text,
    subheader_align,
    subheader_bold,
    footer_text,
    show_empty_placeholders,
    contract_number,
    contractor_company,
    supervisor_company,
    client_name,
    regional_superintendency,
    contractor_manager,
    contractor_representative,
    supervisor_engineer,
    fiscal_engineer,
    banner_logo_left_url,
    banner_logo_right_url
  } = req.body;

  let finalBannerUrl =
    banner_image_url !== undefined ? banner_image_url : existing?.banner_image_url || '';

  if (req.file) {
    finalBannerUrl = `/uploads/${req.file.filename}`;
  } else if (banner_image_base64 && banner_image_base64.startsWith('data:image/')) {
    const saved = saveBase64Image(banner_image_base64, 'banner-relatorio');
    if (!saved) return res.status(400).json({ error: 'Imagem do banner inválida. Use JPG, PNG, WEBP ou GIF de até 10 MB.' });
    finalBannerUrl = saved;
  }

  db.prepare(`
    UPDATE report_settings
    SET orientation = ?,
        photos_per_page = ?,
        banner_mode = ?,
        banner_image_url = ?,
        banner_text = ?,
        banner_text_align = ?,
        banner_font_size = ?,
        banner_bold = ?,
        banner_italic = ?,
        banner_underline = ?,
        banner_color = ?,
        subheader_text = ?,
        subheader_align = ?,
        subheader_bold = ?,
        footer_text = ?,
        show_empty_placeholders = ?,
        contract_number = ?,
        contractor_company = ?,
        supervisor_company = ?,
        client_name = ?,
        regional_superintendency = ?,
        contractor_manager = ?,
        contractor_representative = ?,
        supervisor_engineer = ?,
        fiscal_engineer = ?,
        banner_logo_left_url = ?,
        banner_logo_right_url = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(
    orientation || existing.orientation || 'PORTRAIT',
    Number(photos_per_page) || existing.photos_per_page || 6,
    banner_mode || existing.banner_mode || 'TEXT',
    finalBannerUrl,
    banner_text !== undefined ? banner_text : existing.banner_text,
    banner_text_align || existing.banner_text_align || 'CENTER',
    banner_font_size || existing.banner_font_size || 'MEDIUM',
    banner_bold !== undefined ? (banner_bold ? 1 : 0) : existing.banner_bold,
    banner_italic !== undefined ? (banner_italic ? 1 : 0) : existing.banner_italic,
    banner_underline !== undefined ? (banner_underline ? 1 : 0) : existing.banner_underline,
    banner_color || existing.banner_color || '#0f172a',
    subheader_text !== undefined ? subheader_text : existing.subheader_text,
    subheader_align || existing.subheader_align || 'CENTER',
    subheader_bold !== undefined ? (subheader_bold ? 1 : 0) : existing.subheader_bold,
    footer_text !== undefined ? footer_text : existing.footer_text,
    show_empty_placeholders !== undefined ? (show_empty_placeholders ? 1 : 0) : existing.show_empty_placeholders,
    contract_number !== undefined ? contract_number : existing.contract_number,
    contractor_company !== undefined ? contractor_company : existing.contractor_company,
    supervisor_company !== undefined ? supervisor_company : existing.supervisor_company,
    client_name !== undefined ? client_name : existing.client_name,
    regional_superintendency !== undefined ? regional_superintendency : existing.regional_superintendency,
    contractor_manager !== undefined ? contractor_manager : existing.contractor_manager,
    contractor_representative !== undefined ? contractor_representative : existing.contractor_representative,
    supervisor_engineer !== undefined ? supervisor_engineer : existing.supervisor_engineer,
    fiscal_engineer !== undefined ? fiscal_engineer : existing.fiscal_engineer,
    banner_logo_left_url !== undefined ? banner_logo_left_url : existing.banner_logo_left_url,
    banner_logo_right_url !== undefined ? banner_logo_right_url : existing.banner_logo_right_url
  );

  const updated = db.prepare('SELECT * FROM report_settings WHERE id = 1').get();
  res.json(updated);
});

app.get('/api/photos', authenticate, (req, res) => {
  const { projectId, stage } = req.query;
  const accessible = req.accessibleProjectIds;
  if (accessible.length === 0) return res.json([]);

  let targetIds = accessible;
  if (projectId && projectId !== 'ALL') {
    const pid = Number(projectId);
    if (!canUserAccessProject(req.user, pid)) {
      return res.status(403).json({ error: 'Sem acesso a esta obra.' });
    }
    targetIds = [pid];
  }

  const placeholders = targetIds.map(() => '?').join(',');
  let query = `
    SELECT ph.*, p.name as project_name, p.code as project_code, u.name as author_name
    FROM photos ph
    JOIN projects p ON p.id = ph.project_id
    LEFT JOIN users u ON u.id = ph.user_id
    WHERE ph.project_id IN (${placeholders})
  `;
  const params = [...targetIds];

  if (stage && stage !== 'ALL') {
    query += ' AND ph.stage = ?';
    params.push(stage);
  }

  query += ' ORDER BY ph.taken_at DESC, ph.id DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

app.post('/api/photos', authenticate, upload.single('image'), (req, res) => {
  const {
    project_id,
    title,
    description,
    stage,
    location_area,
    taken_at,
    weather_condition,
    image_base64
  } = req.body;

  if (!project_id || !title || !stage) {
    return res.status(400).json({ error: 'Obra, título e etapa construtiva são obrigatórios.' });
  }

  const pid = Number(project_id);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão para registrar fotos nesta obra.' });
  }

  let imageUrl = '';
  if (req.file) {
    imageUrl = `/uploads/${req.file.filename}`;
  } else if (image_base64 && image_base64.startsWith('data:image/')) {
    const matches = image_base64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      let ext = matches[1].toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      if (ext === 'svg+xml') ext = 'svg';
      const filename = `foto-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
      imageUrl = `/uploads/${filename}`;
    }
  }

  if (!imageUrl) {
    return res.status(400).json({ error: 'Selecione uma imagem (upload de arquivo ou captura).' });
  }

  const info = db
    .prepare(`
      INSERT INTO photos (project_id, user_id, title, description, stage, location_area, taken_at, image_url, weather_condition)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      pid,
      req.user.id,
      title.trim(),
      description || '',
      stage,
      location_area || '',
      taken_at || new Date().toISOString().slice(0, 10),
      imageUrl,
      weather_condition || 'SOL'
    );

  const created = db
    .prepare(`
      SELECT ph.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM photos ph
      JOIN projects p ON p.id = ph.project_id
      LEFT JOIN users u ON u.id = ph.user_id
      WHERE ph.id = ?
    `)
    .get(Number(info.lastInsertRowid));

  res.status(201).json(created);
});

app.put('/api/photos/:id', authenticate, upload.single('image'), (req, res) => {
  const photoId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
  if (!existing) {
    return res.status(404).json({ error: 'Registro fotográfico não encontrado.' });
  }

  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão para editar este registro.' });
  }

  const {
    project_id,
    title,
    description,
    stage,
    location_area,
    taken_at,
    weather_condition,
    image_base64
  } = req.body;

  const targetProjectId = project_id ? Number(project_id) : existing.project_id;
  if (!canUserAccessProject(req.user, targetProjectId)) {
    return res.status(403).json({ error: 'Sem permissão para transferir foto para esta obra.' });
  }

  let imageUrl = existing.image_url;
  if (req.file) {
    imageUrl = `/uploads/${req.file.filename}`;
  } else if (image_base64 && image_base64.startsWith('data:image/')) {
    const matches = image_base64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      let ext = matches[1].toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      if (ext === 'svg+xml') ext = 'svg';
      const filename = `foto-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
      imageUrl = `/uploads/${filename}`;
    }
  }

  db.prepare(`
    UPDATE photos
    SET project_id = ?, title = ?, description = ?, stage = ?,
        location_area = ?, taken_at = ?, image_url = ?, weather_condition = ?
    WHERE id = ?
  `).run(
    targetProjectId,
    title ? title.trim() : existing.title,
    description !== undefined ? description : existing.description,
    stage || existing.stage,
    location_area !== undefined ? location_area : existing.location_area,
    taken_at || existing.taken_at,
    imageUrl,
    weather_condition || existing.weather_condition,
    photoId
  );

  const updated = db
    .prepare(`
      SELECT ph.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM photos ph
      JOIN projects p ON p.id = ph.project_id
      LEFT JOIN users u ON u.id = ph.user_id
      WHERE ph.id = ?
    `)
    .get(photoId);

  res.json(updated);
});

app.delete('/api/photos/:id', authenticate, (req, res) => {
  const photoId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
  if (!existing) return res.status(404).json({ error: 'Registro fotográfico não encontrado.' });

  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
  res.json({ success: true });
});

// ============================================================================
// 6. REGISTRO DE OCORRÊNCIAS E GERENCIAMENTO DE CAMPOS (MÓDULO 2)
// ============================================================================

app.get('/api/occurrence-params', authenticate, (req, res) => {
  const { group } = req.query;
  let rows;
  if (group) {
    rows = db
      .prepare('SELECT * FROM occurrence_params WHERE group_key = ? ORDER BY sort_order ASC, id ASC')
      .all(group.toUpperCase());
  } else {
    rows = db
      .prepare('SELECT * FROM occurrence_params ORDER BY group_key ASC, sort_order ASC, id ASC')
      .all();
  }
  res.json(rows);
});

app.post('/api/occurrence-params', authenticate, (req, res) => {
  const { group_key, code, label, color, is_resolved, is_critical, sort_order } = req.body;
  if (!group_key || !label || !label.trim()) {
    return res.status(400).json({ error: 'Grupo e nome da opção são obrigatórios.' });
  }

  const validGroups = ['TYPE', 'SEVERITY', 'STATUS', 'SECTOR'];
  const normalizedGroup = String(group_key).toUpperCase();
  if (!validGroups.includes(normalizedGroup)) {
    return res.status(400).json({ error: 'Grupo inválido.' });
  }

  const normalizedCode = (
    code && code.trim()
      ? code.trim()
      : label
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
  ).toUpperCase();

  // Para SECTOR, usamos o próprio label como valor caso o usuário prefira leitura direta, ou code padronizado
  const finalCode = normalizedGroup === 'SECTOR' ? label.trim() : normalizedCode;

  const info = db
    .prepare(`
      INSERT INTO occurrence_params (group_key, code, label, color, is_resolved, is_critical, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      normalizedGroup,
      finalCode,
      label.trim(),
      color || 'slate',
      is_resolved ? 1 : 0,
      is_critical ? 1 : 0,
      Number(sort_order) || 10
    );

  const created = db
    .prepare('SELECT * FROM occurrence_params WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  res.status(201).json(created);
});

app.put('/api/occurrence-params/:id', authenticate, (req, res) => {
  const paramId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM occurrence_params WHERE id = ?').get(paramId);
  if (!existing) {
    return res.status(404).json({ error: 'Item de configuração não encontrado.' });
  }

  const { label, color, is_resolved, is_critical, sort_order } = req.body;
  if (!label || !label.trim()) {
    return res.status(400).json({ error: 'O nome da opção não pode ficar vazio.' });
  }

  const updatedCode = existing.group_key === 'SECTOR' ? label.trim() : existing.code;

  db.prepare(`
    UPDATE occurrence_params
    SET code = ?, label = ?, color = ?, is_resolved = ?, is_critical = ?, sort_order = ?
    WHERE id = ?
  `).run(
    updatedCode,
    label.trim(),
    color || existing.color,
    is_resolved !== undefined ? (is_resolved ? 1 : 0) : existing.is_resolved,
    is_critical !== undefined ? (is_critical ? 1 : 0) : existing.is_critical,
    sort_order !== undefined ? Number(sort_order) : existing.sort_order,
    paramId
  );

  // Se for um setor cujo nome mudou, atualiza também nas ocorrências existentes para manter consistência
  if (existing.group_key === 'SECTOR' && existing.label !== label.trim()) {
    db.prepare('UPDATE occurrences SET location_area = ? WHERE location_area = ?').run(
      label.trim(),
      existing.label
    );
  }

  const updated = db.prepare('SELECT * FROM occurrence_params WHERE id = ?').get(paramId);
  res.json(updated);
});

app.delete('/api/occurrence-params/:id', authenticate, (req, res) => {
  const paramId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM occurrence_params WHERE id = ?').get(paramId);
  if (!existing) {
    return res.status(404).json({ error: 'Item não encontrado.' });
  }

  db.prepare('DELETE FROM occurrence_params WHERE id = ?').run(paramId);
  res.json({ success: true });
});

// Restaurar opções padrão dos campos de ocorrência
app.post('/api/occurrence-params/reset', authenticate, (_req, res) => {
  db.exec('DELETE FROM occurrence_params;');
  seedOccurrenceParamsIfEmpty();
  res.json(db.prepare('SELECT * FROM occurrence_params ORDER BY group_key ASC, sort_order ASC, id ASC').all());
});

// ---------------------------------------------------------------------------
// MÓDULO 3 — OCORRÊNCIAS (com anexos fotográficos, histórico e datas de atendimento)
// ---------------------------------------------------------------------------
const getResolvedStatusCodes = () => {
  const codes = db
    .prepare("SELECT code FROM occurrence_params WHERE group_key = 'STATUS' AND is_resolved = 1")
    .all()
    .map((r) => r.code);
  if (codes.length === 0) codes.push('RESOLVIDA');
  return codes;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const OCC_SELECT = `
  SELECT oc.*, p.name as project_name, p.code as project_code, u.name as author_name
  FROM occurrences oc
  JOIN projects p ON p.id = oc.project_id
  LEFT JOIN users u ON u.id = oc.user_id
`;

const attachOccurrencePhotos = (rows) => {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const photos = db
    .prepare(`SELECT * FROM occurrence_photos WHERE occurrence_id IN (${ph}) ORDER BY id ASC`)
    .all(...ids);
  const map = new Map();
  photos.forEach((p) => {
    if (!map.has(p.occurrence_id)) map.set(p.occurrence_id, []);
    map.get(p.occurrence_id).push(p);
  });
  return rows.map((r) => ({ ...r, photos: map.get(r.id) || [] }));
};

const getOccurrenceFull = (occId) => {
  const row = db.prepare(`${OCC_SELECT} WHERE oc.id = ?`).get(occId);
  if (!row) return null;
  return attachOccurrencePhotos([row])[0];
};

// Imagens recebidas em base64: somente JPG/PNG/WEBP/GIF (sem SVG), conferindo a assinatura do arquivo.
const MAX_BASE64_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_SIGNATURES = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  gif: (b) => b.slice(0, 4).toString('ascii') === 'GIF8',
  webp: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP'
};
const saveBase64Image = (dataUrl, prefix = 'occ') => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!matches) return null;
  let ext = matches[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  if (!IMAGE_SIGNATURES[ext]) return null;
  const buffer = Buffer.from(matches[2], 'base64');
  if (!buffer.length || buffer.length > MAX_BASE64_IMAGE_BYTES || !IMAGE_SIGNATURES[ext](buffer)) return null;
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
};

const logOccurrenceHistory = (occId, user, fromStatus, toStatus, note) => {
  db.prepare(
    `INSERT INTO occurrence_history (occurrence_id, user_id, user_name, from_status, to_status, note)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(occId, user?.id || null, user?.name || '', fromStatus || '', toStatus || '', note || '');
};

app.get('/api/occurrences', authenticate, (req, res) => {
  const { projectId, status, severity } = req.query;
  const accessible = req.accessibleProjectIds;
  if (accessible.length === 0) return res.json([]);

  let targetIds = accessible;
  if (projectId && projectId !== 'ALL') {
    const pid = Number(projectId);
    if (!canUserAccessProject(req.user, pid)) {
      return res.status(403).json({ error: 'Sem acesso a esta obra.' });
    }
    targetIds = [pid];
  }

  const placeholders = targetIds.map(() => '?').join(',');
  let query = `${OCC_SELECT} WHERE oc.project_id IN (${placeholders})`;
  const params = [...targetIds];

  if (status && status !== 'ALL') {
    query += ' AND oc.status = ?';
    params.push(status);
  }
  if (severity && severity !== 'ALL') {
    query += ' AND oc.severity = ?';
    params.push(severity);
  }

  query += ' ORDER BY oc.occurrence_date DESC, oc.id DESC';
  const rows = db.prepare(query).all(...params);
  res.json(attachOccurrencePhotos(rows));
});

app.get('/api/occurrences/:id/history', authenticate, (req, res) => {
  const occId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM occurrences WHERE id = ?').get(occId);
  if (!existing) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  const rows = db
    .prepare('SELECT * FROM occurrence_history WHERE occurrence_id = ? ORDER BY changed_at ASC, id ASC')
    .all(occId);
  res.json(rows);
});

app.post('/api/occurrences', authenticate, (req, res) => {
  const {
    project_id,
    title,
    type,
    severity,
    status,
    occurrence_date,
    location_area,
    description,
    action_taken,
    responsible,
    due_date,
    resolved_at,
    photos
  } = req.body;

  if (!project_id || !title || !type || !severity || !description) {
    return res.status(400).json({ error: 'Obra, título, tipo, severidade e descrição são obrigatórios.' });
  }

  const pid = Number(project_id);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão para registrar ocorrências nesta obra.' });
  }

  const finalStatus = status || 'ABERTA';
  const occDate = occurrence_date || todayISO();
  const isResolved = getResolvedStatusCodes().includes(finalStatus);
  const finalResolvedAt = isResolved ? resolved_at || todayISO() : '';

  const info = db
    .prepare(`
      INSERT INTO occurrences (project_id, user_id, title, type, severity, status, occurrence_date, location_area,
                               description, action_taken, responsible, due_date, resolved_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      pid,
      req.user.id,
      title.trim(),
      type,
      severity,
      finalStatus,
      occDate,
      location_area || '',
      description.trim(),
      action_taken || '',
      responsible || req.user.name,
      due_date || '',
      finalResolvedAt,
      new Date().toISOString()
    );

  const occId = Number(info.lastInsertRowid);
  logOccurrenceHistory(occId, req.user, '', finalStatus, 'Ocorrência registrada');

  if (Array.isArray(photos)) {
    const ins = db.prepare(
      'INSERT INTO occurrence_photos (occurrence_id, user_id, image_url, caption, phase) VALUES (?, ?, ?, ?, ?)'
    );
    photos.slice(0, 20).forEach((ph) => {
      const url = saveBase64Image(ph?.base64);
      if (url) ins.run(occId, req.user.id, url, ph.caption || '', ph.phase || 'REGISTRO');
    });
  }

  res.status(201).json(getOccurrenceFull(occId));
});

app.put('/api/occurrences/:id', authenticate, (req, res) => {
  const occId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM occurrences WHERE id = ?').get(occId);
  if (!existing) return res.status(404).json({ error: 'Ocorrência não encontrada.' });

  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  const {
    title,
    type,
    severity,
    status,
    occurrence_date,
    location_area,
    description,
    action_taken,
    responsible,
    due_date,
    resolved_at,
    status_note
  } = req.body;

  const newStatus = status || existing.status;
  if (newStatus !== existing.status && !can(req, 'OCCURRENCES', 'change_status')) {
    return res.status(403).json({ error: 'Seu perfil não permite alterar o status de ocorrências.' });
  }
  const resolvedCodes = getResolvedStatusCodes();
  const wasResolved = resolvedCodes.includes(existing.status);
  const nowResolved = resolvedCodes.includes(newStatus);

  let finalResolvedAt = existing.resolved_at || '';
  if (nowResolved) {
    if (resolved_at) finalResolvedAt = resolved_at;
    else if (!wasResolved || !finalResolvedAt) finalResolvedAt = todayISO();
  } else {
    finalResolvedAt = '';
  }

  db.prepare(`
    UPDATE occurrences
    SET title = ?, type = ?, severity = ?, status = ?, occurrence_date = ?,
        location_area = ?, description = ?, action_taken = ?, responsible = ?,
        due_date = ?, resolved_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    title || existing.title,
    type || existing.type,
    severity || existing.severity,
    newStatus,
    occurrence_date || existing.occurrence_date,
    location_area !== undefined ? location_area : existing.location_area,
    description || existing.description,
    action_taken !== undefined ? action_taken : existing.action_taken,
    responsible !== undefined ? responsible : existing.responsible,
    due_date !== undefined ? due_date || '' : existing.due_date || '',
    finalResolvedAt,
    new Date().toISOString(),
    occId
  );

  if (newStatus !== existing.status) {
    logOccurrenceHistory(occId, req.user, existing.status, newStatus, status_note || '');
  }

  res.json(getOccurrenceFull(occId));
});

app.delete('/api/occurrences/:id', authenticate, (req, res) => {
  const occId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM occurrences WHERE id = ?').get(occId);
  if (!existing) return res.status(404).json({ error: 'Ocorrência não encontrada.' });

  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  const photos = db.prepare('SELECT image_url FROM occurrence_photos WHERE occurrence_id = ?').all(occId);
  db.prepare('DELETE FROM occurrence_photos WHERE occurrence_id = ?').run(occId);
  db.prepare('DELETE FROM occurrence_history WHERE occurrence_id = ?').run(occId);
  db.prepare('DELETE FROM occurrences WHERE id = ?').run(occId);
  photos.forEach((p) => {
    try {
      const fp = path.join(uploadsDir, path.basename(p.image_url || ''));
      if (p.image_url && p.image_url.startsWith('/uploads/') && fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (_e) {
      /* ignora falha ao remover arquivo */
    }
  });
  res.json({ success: true });
});

// Anexar fotos a uma ocorrência existente (base64 em lote)
app.post('/api/occurrences/:id/photos', authenticate, (req, res) => {
  const occId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM occurrences WHERE id = ?').get(occId);
  if (!existing) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  const { photos } = req.body;
  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  }

  const ins = db.prepare(
    'INSERT INTO occurrence_photos (occurrence_id, user_id, image_url, caption, phase) VALUES (?, ?, ?, ?, ?)'
  );
  let saved = 0;
  photos.slice(0, 20).forEach((ph) => {
    const url = saveBase64Image(ph?.base64);
    if (url) {
      ins.run(occId, req.user.id, url, ph.caption || '', ph.phase || 'REGISTRO');
      saved += 1;
    }
  });
  if (saved === 0) return res.status(400).json({ error: 'Formato de imagem inválido.' });

  res.status(201).json(getOccurrenceFull(occId));
});

app.put('/api/occurrence-photos/:photoId', authenticate, (req, res) => {
  const photoId = Number(req.params.photoId);
  const photo = db.prepare('SELECT * FROM occurrence_photos WHERE id = ?').get(photoId);
  if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });
  const occ = db.prepare('SELECT project_id FROM occurrences WHERE id = ?').get(photo.occurrence_id);
  if (!occ || !canUserAccessProject(req.user, occ.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  const { caption, phase } = req.body;
  db.prepare('UPDATE occurrence_photos SET caption = ?, phase = ? WHERE id = ?').run(
    caption !== undefined ? caption : photo.caption,
    phase || photo.phase,
    photoId
  );
  res.json(db.prepare('SELECT * FROM occurrence_photos WHERE id = ?').get(photoId));
});

app.delete('/api/occurrence-photos/:photoId', authenticate, (req, res) => {
  const photoId = Number(req.params.photoId);
  const photo = db.prepare('SELECT * FROM occurrence_photos WHERE id = ?').get(photoId);
  if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });
  const occ = db.prepare('SELECT project_id FROM occurrences WHERE id = ?').get(photo.occurrence_id);
  if (!occ || !canUserAccessProject(req.user, occ.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  db.prepare('DELETE FROM occurrence_photos WHERE id = ?').run(photoId);
  try {
    const fp = path.join(uploadsDir, path.basename(photo.image_url || ''));
    if (photo.image_url && photo.image_url.startsWith('/uploads/') && fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_e) {
    /* ignora */
  }
  res.json({ success: true });
});

// ============================================================================
// RDO - REGISTRO DIÁRIO DE OBRAS (MÓDULO 2)
// ============================================================================

app.get('/api/rdo', authenticate, (req, res) => {
  const { projectId, month, year, date, fromDate, toDate, order = 'ASC' } = req.query;
  const accessible = req.accessibleProjectIds;
  if (accessible.length === 0) return res.json([]);

  let targetIds = accessible;
  if (projectId && projectId !== 'ALL') {
    const pid = Number(projectId);
    if (!canUserAccessProject(req.user, pid)) {
      return res.status(403).json({ error: 'Sem acesso a esta obra.' });
    }
    targetIds = [pid];
  }

  const placeholders = targetIds.map(() => '?').join(',');
  let query = `
    SELECT r.*, p.name as project_name, p.code as project_code, u.name as author_name
    FROM rdo_records r
    JOIN projects p ON p.id = r.project_id
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.project_id IN (${placeholders})
  `;
  const params = [...targetIds];

  if (date) {
    query += ' AND r.rdo_date = ?';
    params.push(date);
  } else {
    if (fromDate) {
      query += ' AND r.rdo_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      query += ' AND r.rdo_date <= ?';
      params.push(toDate);
    }
    if (year && year !== 'ALL') {
      query += " AND strftime('%Y', r.rdo_date) = ?";
      params.push(String(year));
    }
    if (month && month !== 'ALL') {
      query += " AND strftime('%m', r.rdo_date) = ?";
      params.push(String(month).padStart(2, '0'));
    }
  }

  const sortDirection = String(order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  query += ` ORDER BY r.rdo_date ${sortDirection}, r.folio_number ${sortDirection}`;
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

app.get('/api/rdo/by-date', authenticate, (req, res) => {
  const { projectId, date } = req.query;
  if (!projectId || !date) {
    return res.status(400).json({ error: 'Informe a obra e a data do RDO.' });
  }

  const pid = Number(projectId);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem acesso a esta obra.' });
  }

  const existing = db
    .prepare(`
      SELECT r.*, p.name as project_name, p.code as project_code
      FROM rdo_records r
      JOIN projects p ON p.id = r.project_id
      WHERE r.project_id = ? AND r.rdo_date = ?
    `)
    .get(pid, date);

  const photos = db
    .prepare('SELECT id, title, description, weather_condition FROM photos WHERE project_id = ? AND taken_at = ? ORDER BY id ASC')
    .all(pid, date);

  const pluv = db
    .prepare('SELECT * FROM pluviometry WHERE project_id = ? AND record_date = ?')
    .get(pid, date);

  const settings = db.prepare('SELECT * FROM report_settings WHERE id = 1').get() || {};
  const project = db.prepare('SELECT id, code, name FROM projects WHERE id = ?').get(pid);

  // Extract unique upper-cased services from photos of this day
  const serviceSet = new Set();
  photos.forEach((p) => {
    const t = String(p.title || '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (t) serviceSet.add(t);
  });
  const autoServices = [...serviceSet];

  // Calculate intelligent weather condition from pluviometry
  let autoWeather = 'BOM';
  if (pluv) {
    if (
      pluv.work_impact === 'PARALISACAO_TOTAL' ||
      Number(pluv.rainfall_mm) >= 30 ||
      pluv.afternoon_weather === 'IMPRATICAVEL'
    ) {
      autoWeather = 'IMPRATICAVEL';
    } else if (
      Number(pluv.rainfall_mm) > 0 ||
      String(pluv.morning_weather).includes('CHUVA') ||
      String(pluv.afternoon_weather).includes('CHUVA')
    ) {
      autoWeather = 'CHUVOSO';
    } else if (
      pluv.morning_weather === 'NUBLADO' ||
      pluv.afternoon_weather === 'NUBLADO'
    ) {
      autoWeather = 'INSTAVEL';
    } else {
      autoWeather = 'BOM';
    }
  }

  if (existing) {
    return res.json({
      exists: true,
      ...existing,
      photos_count: photos.length,
      available_photos: photos,
      suggested_services: autoServices,
      pluviometry: pluv || null,
      settings
    });
  }

  const maxFolio = db.prepare('SELECT MAX(folio_number) as maxF FROM rdo_records WHERE project_id = ?').get(pid);
  const nextFolio = (maxFolio?.maxF || 0) + 1;

  res.json({
    exists: false,
    id: null,
    project_id: pid,
    project_code: project?.code || '',
    project_name: project?.name || '',
    folio_number: nextFolio,
    rdo_date: date,
    weather_condition: autoWeather,
    work_code: project?.code || settings.contract_number || '',
    work_force_count: 0,
    work_force_sufficient: 1,
    representative_engineer: settings.contractor_representative || '',
    representative_present: 1,
    contractor_notes: '',
    supervisor_notes: settings.regional_superintendency || 'DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE',
    fiscal_notes: '',
    services_developed: JSON.stringify(autoServices),
    photos_count: photos.length,
    available_photos: photos,
    suggested_services: autoServices,
    pluviometry: pluv || null,
    settings,
    status: 'draft'
  });
});

const logRdoHistory = (rdoId, user, action, note) => {
  db.prepare('INSERT INTO rdo_history (rdo_id, user_id, user_name, action, note) VALUES (?, ?, ?, ?, ?)').run(
    rdoId,
    user?.id || null,
    user?.name || '',
    action,
    note || ''
  );
};
const getRdoFull = (pid, rdoDate) =>
  db
    .prepare(`
      SELECT r.*, p.name as project_name, p.code as project_code
      FROM rdo_records r
      JOIN projects p ON p.id = r.project_id
      WHERE r.project_id = ? AND r.rdo_date = ?
    `)
    .get(pid, rdoDate);

app.post('/api/rdo', authenticate, (req, res) => {
  const {
    project_id,
    folio_number,
    rdo_date,
    weather_condition,
    work_code,
    work_force_count,
    work_force_sufficient,
    representative_engineer,
    representative_present,
    contractor_notes,
    supervisor_notes,
    fiscal_notes,
    services_developed,
    status,
    final_signature,
    finalized_at,
    reopened_reason
  } = req.body;

  if (!project_id || !rdo_date) {
    return res.status(400).json({ error: 'Obra e data do RDO são obrigatórias.' });
  }

  const pid = Number(project_id);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão nesta obra.' });
  }

  const servicesJson = Array.isArray(services_developed)
    ? JSON.stringify(services_developed)
    : typeof services_developed === 'string'
    ? services_developed
    : '[]';

  const existing = db.prepare('SELECT * FROM rdo_records WHERE project_id = ? AND rdo_date = ?').get(pid, rdo_date);
  const requestedStatus = status === 'final' ? 'final' : 'draft';
  // Upsert: folha nova exige "criar"; folha existente exige "editar"
  if (!can(req, 'RDO', existing ? 'edit' : 'create')) {
    return res.status(403).json({ error: `Seu perfil não permite ${existing ? 'alterar' : 'cadastrar'} RDO.` });
  }

  // Folha finalizada: bloqueada. Só é possível reabrir (com motivo) por Engenheiro/Administrador.
  if (existing && existing.status === 'final') {
    if (requestedStatus === 'final') {
      return res.status(409).json({ error: 'Esta folha está FINALIZADA e bloqueada para edição. Reabra a folha para fazer correções.' });
    }
    if (!can(req, 'RDO', 'reopen')) {
      return res.status(403).json({ error: 'Seu perfil não permite reabrir um RDO finalizado.' });
    }
    const reason = String(reopened_reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Informe o motivo da reabertura da folha.' });

    db.prepare(
      "UPDATE rdo_records SET status = 'draft', reopened_reason = ?, finalized_at = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(reason, existing.id);
    logRdoHistory(existing.id, req.user, 'REABERTO', reason);
    return res.json(getRdoFull(pid, rdo_date));
  }

  if (requestedStatus === 'final' && !can(req, 'RDO', 'finalize')) {
    return res.status(403).json({ error: 'Seu perfil não permite finalizar o RDO.' });
  }

  // Número da folha é sempre definido pelo servidor (sequencial por obra).
  const folio = existing
    ? existing.folio_number
    : (db.prepare('SELECT MAX(folio_number) as maxF FROM rdo_records WHERE project_id = ?').get(pid)?.maxF || 0) + 1;
  const finalSignatureValue = requestedStatus === 'final' ? final_signature || req.user.name : '';
  const finalizedAtValue = requestedStatus === 'final' ? new Date().toISOString() : '';
  const reopenedReasonValue = existing ? existing.reopened_reason || '' : '';

  db.prepare(`
    INSERT INTO rdo_records (
      project_id, user_id, folio_number, rdo_date, weather_condition, work_code,
      work_force_count, work_force_sufficient, representative_engineer, representative_present,
      contractor_notes, supervisor_notes, fiscal_notes, services_developed, status,
      final_signature, finalized_at, reopened_reason, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(project_id, rdo_date) DO UPDATE SET
      folio_number = excluded.folio_number,
      weather_condition = excluded.weather_condition,
      work_code = excluded.work_code,
      work_force_count = excluded.work_force_count,
      work_force_sufficient = excluded.work_force_sufficient,
      representative_engineer = excluded.representative_engineer,
      representative_present = excluded.representative_present,
      contractor_notes = excluded.contractor_notes,
      supervisor_notes = excluded.supervisor_notes,
      fiscal_notes = excluded.fiscal_notes,
      services_developed = excluded.services_developed,
      status = excluded.status,
      final_signature = excluded.final_signature,
      finalized_at = excluded.finalized_at,
      reopened_reason = excluded.reopened_reason,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    pid,
    req.user.id,
    folio,
    rdo_date,
    weather_condition || 'BOM',
    work_code || '',
    Number(work_force_count) || 0,
    work_force_sufficient !== undefined ? (work_force_sufficient ? 1 : 0) : 1,
    representative_engineer || '',
    representative_present !== undefined ? (representative_present ? 1 : 0) : 1,
    contractor_notes || '',
    supervisor_notes || '',
    fiscal_notes || '',
    servicesJson,
    requestedStatus,
    finalSignatureValue,
    finalizedAtValue,
    reopenedReasonValue
  );

  const saved = getRdoFull(pid, rdo_date);
  if (!existing) logRdoHistory(saved.id, req.user, 'CRIADO', '');
  if (requestedStatus === 'final') logRdoHistory(saved.id, req.user, 'FINALIZADO', '');

  res.status(200).json(saved);
});

app.get('/api/rdo/:id/history', authenticate, (req, res) => {
  const rdoId = Number(req.params.id);
  const existing = db.prepare('SELECT project_id FROM rdo_records WHERE id = ?').get(rdoId);
  if (!existing) return res.status(404).json({ error: 'RDO não encontrado.' });
  if (!canUserAccessProject(req.user, existing.project_id)) return res.status(403).json({ error: 'Sem permissão.' });
  res.json(db.prepare('SELECT * FROM rdo_history WHERE rdo_id = ? ORDER BY changed_at ASC, id ASC').all(rdoId));
});

// Batch generation matching Relatorio-DER-PR 1.9.1 createRdoBatch behavior
app.post('/api/rdo/batch', authenticate, (req, res) => {
  const { project_id, defaults = {}, include_empty = false, fromDate, toDate } = req.body;
  if (!project_id) return res.status(400).json({ error: 'Informe a obra.' });

  const pid = Number(project_id);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão nesta obra.' });
  }

  const photos = db
    .prepare('SELECT id, taken_at, title FROM photos WHERE project_id = ? ORDER BY taken_at ASC')
    .all(pid);
  const photoDates = [...new Set(photos.map((p) => p.taken_at).filter(Boolean))].sort();

  let targetDates = [];

  if (include_empty) {
    let startStr = fromDate || (photoDates.length > 0 ? photoDates[0] : null);
    let endStr = toDate || (photoDates.length > 0 ? photoDates[photoDates.length - 1] : null);

    if (!startStr || !endStr) {
      return res.status(400).json({ error: 'Informe a data inicial e final do período.' });
    }
    if (startStr > endStr) {
      [startStr, endStr] = [endStr, startStr];
    }
    const start = new Date(startStr + 'T12:00:00Z');
    const end = new Date(endStr + 'T12:00:00Z');
    if ((+end - +start) / 86400000 > 366) {
      return res.status(400).json({ error: 'O intervalo selecionado ultrapassa 366 dias.' });
    }
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      targetDates.push(d.toISOString().slice(0, 10));
    }
  } else {
    if (photoDates.length === 0) {
      return res.status(400).json({ error: 'Esta obra não tem fotos registradas com data válida.' });
    }
    targetDates = photoDates.filter((d) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate));
    if (targetDates.length === 0) {
      return res.status(400).json({ error: 'Nenhuma data com foto encontrada no período selecionado.' });
    }
  }

  const existingRdos = db.prepare('SELECT rdo_date, folio_number FROM rdo_records WHERE project_id = ?').all(pid);
  const existingSet = new Set(existingRdos.map((r) => r.rdo_date));

  const maxFolioRow = db.prepare('SELECT MAX(folio_number) as maxF FROM rdo_records WHERE project_id = ?').get(pid);
  let nextFolio = (maxFolioRow?.maxF || 0) + 1;

  const settings = db.prepare('SELECT * FROM report_settings WHERE id = 1').get() || {};
  const project = db.prepare('SELECT id, code, name FROM projects WHERE id = ?').get(pid);

  const created = [];
  const skipped = [];

  const insertStmt = db.prepare(`
    INSERT INTO rdo_records (
      project_id, user_id, folio_number, rdo_date, weather_condition, work_code,
      work_force_count, work_force_sufficient, representative_engineer, representative_present,
      contractor_notes, supervisor_notes, fiscal_notes, services_developed, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP)
  `);

  // Lote inteiro em uma transação: ou cria todas as folhas, ou nenhuma.
  db.exec('BEGIN');
  try {
    for (const date of targetDates) {
      if (existingSet.has(date)) {
        skipped.push(date);
        continue;
      }

      const dayPhotos = photos.filter((p) => p.taken_at === date);
      const serviceSet = new Set();
      dayPhotos.forEach((p) => {
        const t = String(p.title || '').trim().replace(/\s+/g, ' ').toUpperCase();
        if (t) serviceSet.add(t);
      });
      const servicesList = [...serviceSet];

      const pluv = db.prepare('SELECT * FROM pluviometry WHERE project_id = ? AND record_date = ?').get(pid, date);
      let autoWeather = defaults.weather || 'BOM';
      if (pluv) {
        if (pluv.work_impact === 'PARALISACAO_TOTAL' || Number(pluv.rainfall_mm) >= 30 || pluv.afternoon_weather === 'IMPRATICAVEL') {
          autoWeather = 'IMPRATICAVEL';
        } else if (Number(pluv.rainfall_mm) > 0 || String(pluv.morning_weather).includes('CHUVA') || String(pluv.afternoon_weather).includes('CHUVA')) {
          autoWeather = 'CHUVOSO';
        } else if (pluv.morning_weather === 'NUBLADO' || pluv.afternoon_weather === 'NUBLADO') {
          autoWeather = 'INSTAVEL';
        }
      }

      const workForce = defaults.professionals !== null && defaults.professionals !== undefined && defaults.professionals !== ''
        ? Number(defaults.professionals)
        : null;

      const sufficient = defaults.sufficient === 'SIM' ? 1 : defaults.sufficient === 'NAO' || defaults.sufficient === 'NÃO' ? 0 : 1;
      const present = defaults.present === 'SIM' ? 1 : defaults.present === 'NAO' || defaults.present === 'NÃO' ? 0 : 1;

      insertStmt.run(
        pid,
        req.user.id,
        nextFolio++,
        date,
        autoWeather,
        project?.code || settings.contract_number || '',
        workForce !== null ? workForce : 0,
        sufficient,
        settings.contractor_representative || '',
        present,
        defaults.contractorNotes || '',
        settings.regional_superintendency || 'DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE',
        '',
        JSON.stringify(servicesList)
      );

      created.push(date);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: `Falha ao gerar o lote de RDOs: ${err.message}` });
  }

  res.json({ created, skipped });
});

// Photo dates summary for batch preview
app.get('/api/rdo/photo-dates', authenticate, (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'Informe a obra.' });

  const pid = Number(projectId);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  const photos = db.prepare('SELECT taken_at, COUNT(*) as count FROM photos WHERE project_id = ? GROUP BY taken_at ORDER BY taken_at ASC').all(pid);
  const existingRdos = db.prepare('SELECT rdo_date, folio_number, status FROM rdo_records WHERE project_id = ?').all(pid);
  const rdoMap = new Map(existingRdos.map((r) => [r.rdo_date, r]));

  const summary = photos.map((p) => ({
    date: p.taken_at,
    photo_count: p.count,
    has_rdo: rdoMap.has(p.taken_at),
    rdo: rdoMap.get(p.taken_at) || null
  }));

  res.json({ dates: summary });
});

app.post('/api/rdo/sync-services', authenticate, (req, res) => {
  const { project_id, rdo_date } = req.body;
  if (!project_id || !rdo_date) {
    return res.status(400).json({ error: 'Obra e data são obrigatórias.' });
  }

  const pid = Number(project_id);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão nesta obra.' });
  }
  const photos = db
    .prepare('SELECT title, description FROM photos WHERE project_id = ? AND taken_at = ? ORDER BY id ASC')
    .all(pid, rdo_date);

  const serviceSet = new Set();
  photos.forEach((p) => {
    const t = String(p.title || '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (t) serviceSet.add(t);
  });
  const services = [...serviceSet];
  res.json({ services });
});

app.delete('/api/rdo/:id', authenticate, (req, res) => {
  const rdoId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM rdo_records WHERE id = ?').get(rdoId);
  if (!existing) return res.status(404).json({ error: 'RDO não encontrado.' });

  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  if (existing.status === 'final') {
    return res.status(409).json({ error: 'Folha FINALIZADA não pode ser excluída. Reabra a folha antes de excluir.' });
  }

  db.prepare('DELETE FROM rdo_records WHERE id = ?').run(rdoId);
  res.json({ success: true });
});

// ============================================================================
// 7. REGISTRO DE PLUVIOMETRIA (MÓDULO 6)
// ============================================================================

app.get('/api/pluviometry', authenticate, (req, res) => {
  const { projectId } = req.query;
  const accessible = req.accessibleProjectIds;
  if (accessible.length === 0) return res.json([]);

  let targetIds = accessible;
  if (projectId && projectId !== 'ALL') {
    const pid = Number(projectId);
    if (!canUserAccessProject(req.user, pid)) {
      return res.status(403).json({ error: 'Sem acesso a esta obra.' });
    }
    targetIds = [pid];
  }

  const placeholders = targetIds.map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT pl.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM pluviometry pl
      JOIN projects p ON p.id = pl.project_id
      LEFT JOIN users u ON u.id = pl.user_id
      WHERE pl.project_id IN (${placeholders})
      ORDER BY pl.record_date DESC, pl.id DESC
    `)
    .all(...targetIds);

  res.json(rows);
});

app.post('/api/pluviometry', authenticate, (req, res) => {
  const {
    project_id,
    record_date,
    morning_weather,
    afternoon_weather,
    night_weather,
    rainfall_mm,
    morning_mm,
    afternoon_mm,
    night_mm,
    work_impact,
    hours_lost,
    production_tons,
    station_name,
    temperature_min,
    temperature_max,
    notes
  } = req.body;

  if (!project_id || !record_date || !morning_weather || !afternoon_weather) {
    return res.status(400).json({ error: 'Obra, data e condições de manhã/tarde são obrigatórias.' });
  }

  const pid = Number(project_id);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão para registrar pluviometria nesta obra.' });
  }

  const mMm = Number(morning_mm) || 0;
  const aMm = Number(afternoon_mm) || 0;
  const nMm = Number(night_mm) || 0;
  const shiftSum = Number((mMm + aMm + nMm).toFixed(1));
  const totalMm = Number(rainfall_mm) > 0 ? Number(rainfall_mm) : shiftSum;
  // Se o usuário preencheu apenas o total diário (ou fonte 12 UTC), aloca no turno correspondente caso os turnos estejam zerados
  const finalAfternoonMm = shiftSum === 0 && totalMm > 0 ? totalMm : aMm;

  const info = db
    .prepare(`
      INSERT INTO pluviometry (
        project_id, user_id, record_date, morning_weather, afternoon_weather, night_weather,
        rainfall_mm, morning_mm, afternoon_mm, night_mm, work_impact, hours_lost,
        production_tons, station_name, temperature_min, temperature_max, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      pid,
      req.user.id,
      record_date,
      morning_weather,
      afternoon_weather,
      night_weather || 'SEM_EXPEDIENTE',
      totalMm,
      mMm,
      finalAfternoonMm,
      nMm,
      work_impact || 'SEM_IMPACTO',
      Number(hours_lost) || 0,
      Number(production_tons) || 0,
      station_name || 'INMET / Pluviômetro de Obra',
      temperature_min !== '' && temperature_min !== undefined && temperature_min !== null ? Number(temperature_min) : null,
      temperature_max !== '' && temperature_max !== undefined && temperature_max !== null ? Number(temperature_max) : null,
      notes || ''
    );

  const created = db
    .prepare(`
      SELECT pl.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM pluviometry pl
      JOIN projects p ON p.id = pl.project_id
      LEFT JOIN users u ON u.id = pl.user_id
      WHERE pl.id = ?
    `)
    .get(Number(info.lastInsertRowid));

  res.status(201).json(created);
});

app.put('/api/pluviometry/:id', authenticate, (req, res) => {
  const pluvId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM pluviometry WHERE id = ?').get(pluvId);
  if (!existing) return res.status(404).json({ error: 'Registro pluviométrico não encontrado.' });

  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  const {
    project_id,
    record_date,
    morning_weather,
    afternoon_weather,
    night_weather,
    rainfall_mm,
    morning_mm,
    afternoon_mm,
    night_mm,
    work_impact,
    hours_lost,
    production_tons,
    station_name,
    temperature_min,
    temperature_max,
    notes
  } = req.body;

  const targetPid = project_id ? Number(project_id) : existing.project_id;
  const mMm = morning_mm !== undefined ? Number(morning_mm) || 0 : Number(existing.morning_mm) || 0;
  const aMm = afternoon_mm !== undefined ? Number(afternoon_mm) || 0 : Number(existing.afternoon_mm) || 0;
  const nMm = night_mm !== undefined ? Number(night_mm) || 0 : Number(existing.night_mm) || 0;
  const shiftSum = Number((mMm + aMm + nMm).toFixed(1));
  const totalMm = rainfall_mm !== undefined ? Number(rainfall_mm) || 0 : shiftSum;
  const finalAfternoonMm = shiftSum === 0 && totalMm > 0 ? totalMm : aMm;

  db.prepare(`
    UPDATE pluviometry
    SET project_id = ?, record_date = ?, morning_weather = ?, afternoon_weather = ?, night_weather = ?,
        rainfall_mm = ?, morning_mm = ?, afternoon_mm = ?, night_mm = ?,
        work_impact = ?, hours_lost = ?, production_tons = ?, station_name = ?,
        temperature_min = ?, temperature_max = ?, notes = ?
    WHERE id = ?
  `).run(
    targetPid,
    record_date || existing.record_date,
    morning_weather || existing.morning_weather,
    afternoon_weather || existing.afternoon_weather,
    night_weather || existing.night_weather,
    totalMm,
    mMm,
    finalAfternoonMm,
    nMm,
    work_impact || existing.work_impact,
    hours_lost !== undefined ? Number(hours_lost) || 0 : existing.hours_lost,
    production_tons !== undefined ? Number(production_tons) || 0 : existing.production_tons,
    station_name !== undefined ? station_name : existing.station_name,
    temperature_min !== '' && temperature_min !== undefined ? Number(temperature_min) : null,
    temperature_max !== '' && temperature_max !== undefined ? Number(temperature_max) : null,
    notes !== undefined ? notes : existing.notes,
    pluvId
  );

  const updated = db
    .prepare(`
      SELECT pl.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM pluviometry pl
      JOIN projects p ON p.id = pl.project_id
      LEFT JOIN users u ON u.id = pl.user_id
      WHERE pl.id = ?
    `)
    .get(pluvId);

  res.json(updated);
});

app.post('/api/pluviometry/batch', authenticate, (req, res) => {
  const { project_id, station_name, records, overwrite_existing } = req.body;
  if (!project_id || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Informe a obra e a lista de registros para importação.' });
  }

  const pid = Number(project_id);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão para importar dados nesta obra.' });
  }

  const checkExisting = db.prepare('SELECT id FROM pluviometry WHERE project_id = ? AND record_date = ?');
  const deleteExisting = db.prepare('DELETE FROM pluviometry WHERE project_id = ? AND record_date = ?');
  const insertStmt = db.prepare(`
    INSERT INTO pluviometry (
      project_id, user_id, record_date, morning_weather, afternoon_weather, night_weather,
      rainfall_mm, morning_mm, afternoon_mm, night_mm, work_impact, hours_lost,
      production_tons, station_name, temperature_min, temperature_max, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let importedCount = 0;
  for (const r of records) {
    if (!r.record_date) continue;
    const exists = checkExisting.get(pid, r.record_date);
    if (exists) {
      if (overwrite_existing !== false) {
        deleteExisting.run(pid, r.record_date);
      } else {
        continue;
      }
    }

    const totalMm = Number(r.rainfall_mm) || 0;
    const mMm = Number(r.morning_mm) || 0;
    const aMm = Number(r.afternoon_mm) || (mMm === 0 && Number(r.night_mm || 0) === 0 ? totalMm : 0);
    const nMm = Number(r.night_mm) || 0;

    insertStmt.run(
      pid,
      req.user.id,
      r.record_date,
      r.morning_weather || (mMm >= 10 ? 'CHUVA_FORTE' : mMm > 0 ? 'CHUVA_FRACA' : 'SOL'),
      r.afternoon_weather || (aMm >= 25 ? 'IMPRATICAVEL' : aMm >= 10 ? 'CHUVA_FORTE' : aMm > 0 ? 'CHUVA_FRACA' : 'SOL'),
      r.night_weather || (nMm >= 10 ? 'CHUVA_FORTE' : nMm > 0 ? 'CHUVA_FRACA' : 'SEM_EXPEDIENTE'),
      totalMm,
      mMm,
      aMm,
      nMm,
      r.work_impact || (totalMm >= 30 ? 'PARALISACAO_TOTAL' : totalMm >= 10 ? 'IMPACTO_PARCIAL' : 'SEM_IMPACTO'),
      Number(r.hours_lost) || (totalMm >= 30 ? 8 : totalMm >= 10 ? 3 : 0),
      Number(r.production_tons) || 0,
      r.station_name || station_name || 'INMET CSV',
      r.temperature_min !== null && r.temperature_min !== undefined && r.temperature_min !== '' ? Number(r.temperature_min) : null,
      r.temperature_max !== null && r.temperature_max !== undefined && r.temperature_max !== '' ? Number(r.temperature_max) : null,
      r.notes || `Importado via CSV (${r.station_name || station_name || 'INMET'})`
    );
    importedCount++;
  }

  res.status(201).json({ success: true, importedCount });
});

app.delete('/api/pluviometry/:id', authenticate, (req, res) => {
  const pluvId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM pluviometry WHERE id = ?').get(pluvId);
  if (!existing) return res.status(404).json({ error: 'Registro pluviométrico não encontrado.' });

  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  db.prepare('DELETE FROM pluviometry WHERE id = ?').run(pluvId);
  res.json({ success: true });
});

// Erros de upload (tipo/tamanho de arquivo) e demais erros das rotas da API
app.use('/api', (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máximo 15 MB).' : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Envio muito grande. Reduza a quantidade ou o tamanho das imagens.' });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro interno do servidor.' });
});

// Serve frontend production build if available
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AXIS OBRA Backend rodando na porta principal http://0.0.0.0:${PORT}`);
});

// Em ambiente Docker/Coolify (produção), escutar também nas portas 80 e 3000
// para evitar erro "no available server" caso o Traefik/Coolify esteja apontando para a porta padrão 80 ou 3000
if (process.env.NODE_ENV === 'production') {
  [80, 3000].forEach((extraPort) => {
    if (Number(PORT) !== extraPort) {
      const extraServer = app.listen(extraPort, '0.0.0.0', () => {
        console.log(`AXIS OBRA Backend escutando também na porta http://0.0.0.0:${extraPort}`);
      });
      extraServer.on('error', () => {
        // Ignora caso a porta extra não esteja disponível no host
      });
    }
  });
}
