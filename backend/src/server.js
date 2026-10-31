const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const { db, initDatabase, hashPassword, uploadsDir } = require('./db');

initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use('/uploads', express.static(uploadsDir));

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const safeName = `foto-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// Token signing & verification (HMAC SHA-256)
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'axis_obra_secret_key_2026';

function createToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 7 * 24 * 3600 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// Helper: get accessible project IDs for a user
function getUserAccessibleProjectIds(user) {
  if (!user) return [];
  if (user.role === 'ADMIN') {
    return db.prepare('SELECT id FROM projects').all().map((r) => Number(r.id));
  }
  return db
    .prepare('SELECT project_id FROM project_users WHERE user_id = ?')
    .all(user.id)
    .map((r) => Number(r.project_id));
}

function canUserAccessProject(user, projectId) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const ids = getUserAccessibleProjectIds(user);
  return ids.includes(Number(projectId));
}

// Auth middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let userId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.slice(7));
    if (decoded) userId = decoded.id;
  }

  if (!userId && req.headers['x-user-id']) {
    userId = Number(req.headers['x-user-id']);
  }

  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado. Faça login novamente.' });
  }

  const user = db
    .prepare('SELECT id, name, email, role, crea_cft, phone, active, created_at FROM users WHERE id = ?')
    .get(userId);

  if (!user || !user.active) {
    return res.status(401).json({ error: 'Usuário inválido ou inativo.' });
  }

  req.user = user;
  req.accessibleProjectIds = getUserAccessibleProjectIds(user);
  next();
}

// ============================================================================
// 0. AUTHENTICATION & DEMO ACCOUNTS
// ============================================================================

// Healthcheck endpoint for Coolify / Docker
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'axis-obra', timestamp: new Date().toISOString() });
});

app.get('/api/auth/demo-users', (_req, res) => {
  const users = db
    .prepare('SELECT id, name, email, role, crea_cft, phone FROM users WHERE active = 1 ORDER BY id ASC')
    .all();

  const enriched = users.map((u) => {
    const projects =
      u.role === 'ADMIN'
        ? db.prepare('SELECT id, code, name FROM projects ORDER BY id ASC').all()
        : db
            .prepare(`
              SELECT p.id, p.code, p.name, pu.role_in_project
              FROM projects p
              JOIN project_users pu ON pu.project_id = p.id
              WHERE pu.user_id = ?
              ORDER BY p.id ASC
            `)
            .all(u.id);
    return { ...u, projects };
  });

  res.json(enriched);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, userId } = req.body;

  let user;
  if (userId) {
    // Quick profile switch for demo convenience
    user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(Number(userId));
  } else {
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }
    const hashed = hashPassword(password);
    user = db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND password_hash = ? AND active = 1')
      .get(email.trim(), hashed);
  }

  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas ou usuário inativo.' });
  }

  const token = createToken(user);
  const { password_hash, ...safeUser } = user;
  const accessibleProjectIds = getUserAccessibleProjectIds(safeUser);

  res.json({
    token,
    user: {
      ...safeUser,
      accessibleProjectIds
    }
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({
    user: {
      ...req.user,
      accessibleProjectIds: req.accessibleProjectIds
    }
  });
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
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas Administradores podem cadastrar novas obras.' });
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
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas Administradores podem excluir obras.' });
  }
  const projectId = Number(req.params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  res.json({ success: true });
});

// Manage users linked to a project
app.post('/api/projects/:id/users', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas Administradores podem gerenciar vínculos de usuários nas obras.' });
  }
  const projectId = Number(req.params.id);
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
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas Administradores podem remover vínculos de usuários.' });
  }
  const projectId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);

  db.prepare('DELETE FROM project_users WHERE project_id = ? AND user_id = ?').run(projectId, targetUserId);
  res.json({ success: true });
});

// Users CRUD (for managing users & assigning projects)
app.get('/api/users', authenticate, (_req, res) => {
  const users = db
    .prepare('SELECT id, name, email, role, crea_cft, phone, active, created_at FROM users ORDER BY id ASC')
    .all();

  const result = users.map((u) => {
    const projects = db
      .prepare(`
        SELECT p.id, p.code, p.name, pu.role_in_project, pu.can_edit
        FROM project_users pu
        JOIN projects p ON p.id = pu.project_id
        WHERE pu.user_id = ?
        ORDER BY p.id ASC
      `)
      .all(u.id);
    return { ...u, projects };
  });

  res.json(result);
});

app.post('/api/users', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas Administradores podem cadastrar novos usuários.' });
  }

  const { name, email, password, role, crea_cft, phone, projectIds, role_in_project } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
  }

  try {
    const info = db
      .prepare(`
        INSERT INTO users (name, email, password_hash, role, crea_cft, phone, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `)
      .run(
        name.trim(),
        email.trim().toLowerCase(),
        hashPassword(password || '123456'),
        role || 'ENGENHEIRO',
        crea_cft || '',
        phone || ''
      );

    const newUserId = Number(info.lastInsertRowid);

    if (Array.isArray(projectIds) && projectIds.length > 0) {
      const insertLink = db.prepare(`
        INSERT OR IGNORE INTO project_users (project_id, user_id, role_in_project, can_edit)
        VALUES (?, ?, ?, 1)
      `);
      for (const pid of projectIds) {
        insertLink.run(Number(pid), newUserId, role_in_project || 'Engenheiro / Equipe Técnica');
      }
    }

    const user = db.prepare('SELECT id, name, email, role, crea_cft, phone, active FROM users WHERE id = ?').get(newUserId);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'E-mail já cadastrado.' : err.message });
  }
});

app.put('/api/users/:id/projects', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas Administradores podem alterar permissões de obras por usuário.' });
  }
  const targetUserId = Number(req.params.id);
  const { assignments } = req.body; // Array of { project_id, role_in_project }

  db.prepare('DELETE FROM project_users WHERE user_id = ?').run(targetUserId);

  if (Array.isArray(assignments)) {
    const stmt = db.prepare(`
      INSERT INTO project_users (project_id, user_id, role_in_project, can_edit)
      VALUES (?, ?, ?, 1)
    `);
    for (const item of assignments) {
      stmt.run(Number(item.project_id), targetUserId, item.role_in_project || 'Responsável Técnico');
    }
  }

  res.json({ success: true });
});

// ============================================================================
// 3. CADASTRO DE FUNCIONÁRIOS (MÓDULO 3)
// ============================================================================

app.get('/api/employees', authenticate, (req, res) => {
  const { projectId } = req.query;
  const accessible = req.accessibleProjectIds;

  if (accessible.length === 0 && req.user.role !== 'ADMIN') {
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
  } else if (req.user.role !== 'ADMIN') {
    const placeholders = accessible.map(() => '?').join(',');
    query += ` WHERE e.project_id IN (${placeholders})`;
    params.push(...accessible);
  }

  query += ' ORDER BY e.name ASC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
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
        Number(daily_rate) || 0,
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
      Number(daily_rate) || 0,
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

  if (accessible.length === 0 && req.user.role !== 'ADMIN') {
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
  } else if (req.user.role !== 'ADMIN') {
    const placeholders = accessible.map(() => '?').join(',');
    query += ` WHERE eq.project_id IN (${placeholders})`;
    params.push(...accessible);
  }

  query += ' ORDER BY eq.code ASC';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
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
        Number(daily_cost) || 0,
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
      Number(daily_cost) || 0,
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
// 5. REGISTRO FOTOGRÁFICO (MÓDULO 1)
// ============================================================================

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
  let query = `
    SELECT oc.*, p.name as project_name, p.code as project_code, u.name as author_name
    FROM occurrences oc
    JOIN projects p ON p.id = oc.project_id
    LEFT JOIN users u ON u.id = oc.user_id
    WHERE oc.project_id IN (${placeholders})
  `;
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
    responsible
  } = req.body;

  if (!project_id || !title || !type || !severity || !description) {
    return res.status(400).json({ error: 'Obra, título, tipo, severidade e descrição são obrigatórios.' });
  }

  const pid = Number(project_id);
  if (!canUserAccessProject(req.user, pid)) {
    return res.status(403).json({ error: 'Sem permissão para registrar ocorrências nesta obra.' });
  }

  const info = db
    .prepare(`
      INSERT INTO occurrences (project_id, user_id, title, type, severity, status, occurrence_date, location_area, description, action_taken, responsible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      pid,
      req.user.id,
      title.trim(),
      type,
      severity,
      status || 'ABERTA',
      occurrence_date || new Date().toISOString().slice(0, 10),
      location_area || '',
      description.trim(),
      action_taken || '',
      responsible || req.user.name
    );

  const created = db
    .prepare(`
      SELECT oc.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM occurrences oc
      JOIN projects p ON p.id = oc.project_id
      LEFT JOIN users u ON u.id = oc.user_id
      WHERE oc.id = ?
    `)
    .get(Number(info.lastInsertRowid));

  res.status(201).json(created);
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
    responsible
  } = req.body;

  db.prepare(`
    UPDATE occurrences
    SET title = ?, type = ?, severity = ?, status = ?, occurrence_date = ?,
        location_area = ?, description = ?, action_taken = ?, responsible = ?
    WHERE id = ?
  `).run(
    title || existing.title,
    type || existing.type,
    severity || existing.severity,
    status || existing.status,
    occurrence_date || existing.occurrence_date,
    location_area !== undefined ? location_area : existing.location_area,
    description || existing.description,
    action_taken !== undefined ? action_taken : existing.action_taken,
    responsible !== undefined ? responsible : existing.responsible,
    occId
  );

  const updated = db
    .prepare(`
      SELECT oc.*, p.name as project_name, p.code as project_code, u.name as author_name
      FROM occurrences oc
      JOIN projects p ON p.id = oc.project_id
      LEFT JOIN users u ON u.id = oc.user_id
      WHERE oc.id = ?
    `)
    .get(occId);

  res.json(updated);
});

app.delete('/api/occurrences/:id', authenticate, (req, res) => {
  const occId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM occurrences WHERE id = ?').get(occId);
  if (!existing) return res.status(404).json({ error: 'Ocorrência não encontrada.' });

  if (!canUserAccessProject(req.user, existing.project_id)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  db.prepare('DELETE FROM occurrences WHERE id = ?').run(occId);
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
    work_impact,
    hours_lost,
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

  const info = db
    .prepare(`
      INSERT INTO pluviometry (
        project_id, user_id, record_date, morning_weather, afternoon_weather, night_weather,
        rainfall_mm, work_impact, hours_lost, temperature_min, temperature_max, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      pid,
      req.user.id,
      record_date,
      morning_weather,
      afternoon_weather,
      night_weather || 'SEM_EXPEDIENTE',
      Number(rainfall_mm) || 0,
      work_impact || 'SEM_IMPACTO',
      Number(hours_lost) || 0,
      temperature_min !== '' && temperature_min !== undefined ? Number(temperature_min) : null,
      temperature_max !== '' && temperature_max !== undefined ? Number(temperature_max) : null,
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
