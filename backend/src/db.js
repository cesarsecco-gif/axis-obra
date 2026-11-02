const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { SYSTEM_ROLES, normalizePermissions } = require('./permissions');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'axis_obra.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys and WAL mode for performance
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Hash legado (SHA-256 + salt fixo) — mantido apenas para validar senhas antigas e migrá-las no login.
function legacyHashPassword(password) {
  return crypto.createHash('sha256').update(password + '_axis_salt_2026').digest('hex');
}

// Hash atual: scrypt com salt aleatório por usuário. Formato: scrypt$<salt hex>$<hash hex>
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || password === undefined || password === null) return false;
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
  }
  const legacy = Buffer.from(legacyHashPassword(String(password)));
  const expected = Buffer.from(stored);
  return legacy.length === expected.length && crypto.timingSafeEqual(legacy, expected);
}

function isLegacyHash(stored) {
  return !!stored && !stored.startsWith('scrypt$');
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'ENGENHEIRO',
      crea_cft TEXT,
      phone TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      client TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      start_date TEXT,
      expected_end_date TEXT,
      status TEXT DEFAULT 'EM_ANDAMENTO',
      progress INTEGER DEFAULT 0,
      budget REAL DEFAULT 0,
      area_m2 REAL DEFAULT 0,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role_in_project TEXT DEFAULT 'Engenheiro Responsável',
      can_edit INTEGER DEFAULT 1,
      assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      registration_number TEXT,
      role TEXT NOT NULL,
      contract_type TEXT DEFAULT 'CLT',
      company TEXT DEFAULT 'Axis Construtora',
      phone TEXT,
      daily_rate REAL DEFAULT 0,
      aso_expiry TEXT,
      nr_certifications TEXT,
      status TEXT DEFAULT 'ATIVO',
      project_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS equipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      serial_number TEXT,
      ownership TEXT DEFAULT 'PROPRIO',
      supplier TEXT,
      daily_cost REAL DEFAULT 0,
      status TEXT DEFAULT 'OPERACIONAL',
      last_maintenance TEXT,
      next_maintenance TEXT,
      project_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      stage TEXT NOT NULL,
      location_area TEXT,
      taken_at TEXT NOT NULL,
      image_url TEXT NOT NULL,
      weather_condition TEXT DEFAULT 'SOL',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT DEFAULT 'ABERTA',
      occurrence_date TEXT NOT NULL,
      due_date TEXT DEFAULT '',
      resolved_at TEXT DEFAULT '',
      location_area TEXT,
      description TEXT NOT NULL,
      action_taken TEXT,
      responsible TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS occurrence_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurrence_id INTEGER NOT NULL,
      user_id INTEGER,
      image_url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      phase TEXT DEFAULT 'REGISTRO',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS occurrence_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurrence_id INTEGER NOT NULL,
      user_id INTEGER,
      user_name TEXT DEFAULT '',
      from_status TEXT DEFAULT '',
      to_status TEXT NOT NULL,
      note TEXT DEFAULT '',
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS pluviometry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER,
      record_date TEXT NOT NULL,
      morning_weather TEXT NOT NULL,
      afternoon_weather TEXT NOT NULL,
      night_weather TEXT DEFAULT 'SEM_EXPEDIENTE',
      rainfall_mm REAL DEFAULT 0,
      work_impact TEXT DEFAULT 'SEM_IMPACTO',
      hours_lost REAL DEFAULT 0,
      temperature_min REAL,
      temperature_max REAL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS occurrence_params (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_key TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      color TEXT DEFAULT 'slate',
      is_resolved INTEGER DEFAULT 0,
      is_critical INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS report_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      orientation TEXT DEFAULT 'PORTRAIT',
      photos_per_page INTEGER DEFAULT 6,
      banner_mode TEXT DEFAULT 'TEXT',
      banner_image_url TEXT DEFAULT '',
      banner_text TEXT DEFAULT 'AXIS OBRA ENGENHARIA E CONSTRUÇÕES LTDA\nRELATÓRIO FOTOGRÁFICO DE ACOMPANHAMENTO DE OBRA',
      banner_text_align TEXT DEFAULT 'CENTER',
      banner_font_size TEXT DEFAULT 'MEDIUM',
      banner_bold INTEGER DEFAULT 1,
      banner_italic INTEGER DEFAULT 0,
      banner_underline INTEGER DEFAULT 0,
      banner_color TEXT DEFAULT '#0f172a',
      subheader_text TEXT DEFAULT '',
      subheader_align TEXT DEFAULT 'CENTER',
      subheader_bold INTEGER DEFAULT 1,
      footer_text TEXT DEFAULT 'Contrato n. 001/2026 — AXIS OBRA',
      show_empty_placeholders INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rdo_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER,
      folio_number INTEGER NOT NULL,
      rdo_date TEXT NOT NULL,
      weather_condition TEXT DEFAULT 'BOM',
      work_code TEXT DEFAULT '',
      work_force_count INTEGER DEFAULT 0,
      work_force_sufficient INTEGER DEFAULT 1,
      representative_engineer TEXT DEFAULT '',
      representative_present INTEGER DEFAULT 1,
      contractor_notes TEXT DEFAULT '',
      supervisor_notes TEXT DEFAULT 'DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE',
      fiscal_notes TEXT DEFAULT '',
      services_developed TEXT DEFAULT '[]',
      status TEXT DEFAULT 'EM_ANDAMENTO',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (project_id, rdo_date)
    );

    CREATE TABLE IF NOT EXISTS rdo_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rdo_id INTEGER NOT NULL,
      user_id INTEGER,
      user_name TEXT DEFAULT '',
      action TEXT NOT NULL,
      note TEXT DEFAULT '',
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rdo_id) REFERENCES rdo_records(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#475569',
      scope TEXT DEFAULT 'LINKED',
      is_system INTEGER DEFAULT 0,
      permissions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  ensureSamplePhotos();
  ensurePluviometryColumns();
  ensureReportSettingsColumns();
  ensureRdoColumns();
  ensureEmployeeColumns();
  ensureOccurrenceColumns();
  ensureUserColumns();
  ensureProjectUserColumns();
  ensureSystemRoles();
  migrateRdoStatus();
  ensureRdoFolioIndex();
  seedOccurrenceParamsIfEmpty();
  seedReportSettingsIfEmpty();
  const freshDatabase = seedIfEmpty();
  // Dados extras de demonstração só são criados em banco novo — nunca alteram dados reais de produção.
  if (freshDatabase) ensureOccurrenceSeedExtras();
  ensureMainAdmin();
}

// Administrador principal do sistema. Criado se não existir (a senha só é definida na criação).
const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'cesarsecco@gmail.com').trim().toLowerCase();
const MAIN_ADMIN_NAME = process.env.ADMIN_NAME || 'Cesar Augusto Secco';
const MAIN_ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || '123456';

function ensureMainAdmin() {
  const existing = db.prepare('SELECT id, role, active FROM users WHERE LOWER(email) = ?').get(MAIN_ADMIN_EMAIL);
  if (existing) {
    if (existing.role !== 'ADMIN' || !existing.active) {
      db.prepare("UPDATE users SET role = 'ADMIN', active = 1 WHERE id = ?").run(existing.id);
    }
    return;
  }
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role, active) VALUES (?, ?, ?, 'ADMIN', 1)"
  ).run(MAIN_ADMIN_NAME, MAIN_ADMIN_EMAIL, hashPassword(MAIN_ADMIN_INITIAL_PASSWORD));
  console.log(`Administrador principal criado: ${MAIN_ADMIN_EMAIL}`);
}

// Cadastro completo da conta (Módulo 9 — Gestão de Contas)
function ensureUserColumns() {
  const cols = db.prepare("PRAGMA table_info('users')").all().map((c) => c.name);
  const additions = [
    ['display_name', "TEXT DEFAULT ''"],
    ['cpf', "TEXT DEFAULT ''"],
    ['birth_date', "TEXT DEFAULT ''"],
    ['phone_alt', "TEXT DEFAULT ''"],
    ['employment_type', "TEXT DEFAULT 'PROPRIO'"],
    ['company', "TEXT DEFAULT ''"],
    ['job_title', "TEXT DEFAULT ''"],
    ['registration_number', "TEXT DEFAULT ''"],
    ['council', "TEXT DEFAULT ''"],
    ['council_number', "TEXT DEFAULT ''"],
    ['council_uf', "TEXT DEFAULT ''"],
    ['access_expires_at', "TEXT DEFAULT ''"],
    ['avatar_url', "TEXT DEFAULT ''"],
    ['signature_url', "TEXT DEFAULT ''"],
    ['notes', "TEXT DEFAULT ''"],
    ['invite_pending', 'INTEGER DEFAULT 0'],
    ['must_change_password', 'INTEGER DEFAULT 0'],
    ['last_login_at', "TEXT DEFAULT ''"]
  ];
  for (const [colName, colDef] of additions) {
    if (!cols.includes(colName)) db.exec(`ALTER TABLE users ADD COLUMN ${colName} ${colDef};`);
  }
}

function ensureProjectUserColumns() {
  const cols = db.prepare("PRAGMA table_info('project_users')").all().map((c) => c.name);
  if (!cols.includes('since_date')) db.exec("ALTER TABLE project_users ADD COLUMN since_date TEXT DEFAULT '';");
}

// Perfis padrão: criados se não existirem. Ajustes feitos pelo usuário são preservados.
function ensureSystemRoles() {
  const insert = db.prepare(
    'INSERT INTO roles (key, name, description, color, scope, is_system, permissions) VALUES (?, ?, ?, ?, ?, 1, ?)'
  );
  for (const r of SYSTEM_ROLES) {
    const existing = db.prepare('SELECT id, permissions FROM roles WHERE key = ?').get(r.key);
    if (!existing) {
      insert.run(r.key, r.name, r.description, r.color, r.scope, JSON.stringify(r.permissions));
    } else {
      // Completa módulos/ações novos sem apagar o que já foi configurado
      let current = {};
      try {
        current = JSON.parse(existing.permissions || '{}');
      } catch {
        current = {};
      }
      const merged = normalizePermissions({ ...r.permissions, ...current });
      db.prepare('UPDATE roles SET permissions = ? WHERE id = ?').run(JSON.stringify(merged), existing.id);
    }
  }
  // O Administrador é sempre acesso total
  const admin = SYSTEM_ROLES.find((r) => r.key === 'ADMIN');
  db.prepare("UPDATE roles SET permissions = ?, scope = 'ALL' WHERE key = 'ADMIN'").run(JSON.stringify(admin.permissions));
}

// Status antigos do RDO (ex.: EM_ANDAMENTO) passam a ser 'draft'.
function migrateRdoStatus() {
  db.exec("UPDATE rdo_records SET status = 'draft' WHERE status IS NULL OR status NOT IN ('draft', 'final');");
}

// Numeração de folha única por obra. Se houver duplicidades antigas, avisa e não cria o índice.
function ensureRdoFolioIndex() {
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_rdo_project_folio ON rdo_records(project_id, folio_number);');
  } catch (err) {
    console.warn('Aviso: existem RDOs com número de folha duplicado na mesma obra; índice único não criado.', err.message);
  }
}

function ensureOccurrenceColumns() {
  const cols = db.prepare("PRAGMA table_info('occurrences')").all().map((c) => c.name);
  const additions = [
    ['due_date', "TEXT DEFAULT ''"],
    ['resolved_at', "TEXT DEFAULT ''"],
    ['updated_at', "TEXT DEFAULT ''"]
  ];
  for (const [colName, colDef] of additions) {
    if (!cols.includes(colName)) {
      db.exec(`ALTER TABLE occurrences ADD COLUMN ${colName} ${colDef};`);
    }
  }
}

function ensureOccurrenceSeedExtras() {
  try {
    const occs = db.prepare('SELECT * FROM occurrences ORDER BY id ASC').all();
    if (!occs || occs.length === 0) return;

    // Backfill due_date and resolved_at on initial seed occurrences if empty
    for (const o of occs) {
      if (!o.due_date && !o.resolved_at) {
        if (o.status === 'RESOLVIDA') {
          // Resolved 3 days after occurrence_date
          const d = new Date(o.occurrence_date + 'T12:00:00');
          if (!isNaN(d.getTime())) {
            const due = new Date(d);
            due.setDate(due.getDate() + 4);
            const res = new Date(d);
            res.setDate(res.getDate() + 3);
            db.prepare('UPDATE occurrences SET due_date = ?, resolved_at = ? WHERE id = ?').run(
              due.toISOString().split('T')[0],
              res.toISOString().split('T')[0],
              o.id
            );
          }
        } else if (o.occurrence_date) {
          const d = new Date(o.occurrence_date + 'T12:00:00');
          if (!isNaN(d.getTime())) {
            const due = new Date(d);
            due.setDate(due.getDate() + (o.severity === 'ALTA' || o.severity === 'CRITICA' ? 3 : 7));
            db.prepare('UPDATE occurrences SET due_date = ? WHERE id = ?').run(
              due.toISOString().split('T')[0],
              o.id
            );
          }
        }
      }
    }

    // Add 2 more resolved sample occurrences if total is <= 4 so KPIs (average resolution time by type) have rich data
    if (occs.length === 4) {
      const proj1 = occs[0].project_id;
      const proj2 = occs[2] ? occs[2].project_id : proj1;
      const user1 = occs[0].user_id;
      const ins = db.prepare(`
        INSERT INTO occurrences (project_id, user_id, title, type, severity, status, occurrence_date, due_date, resolved_at, location_area, description, action_taken, responsible)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      ins.run(
        proj1,
        user1,
        'Adequação de guarda-corpo provisório na periferia do 7º pavimento',
        'SEGURANCA',
        'ALTA',
        'RESOLVIDA',
        '2026-10-20',
        '2026-10-22',
        '2026-10-21',
        'Torre A - Fachada Leste',
        'Identificado trecho de 4,5m com tela fachadeira destensionada após desforma de viga periférica.',
        'Equipe de carpintaria de segurança refez a fixação dos montantes metálicos e tensionamento imediato da tela.',
        'Luciana (TST) / Mestre Antônio'
      );
      ins.run(
        proj2,
        user1,
        'Revisão de fôrma e escoramento de fundo de viga V-304',
        'QUALIDADE',
        'MEDIA',
        'RESOLVIDA',
        '2026-10-18',
        '2026-10-24',
        '2026-10-23',
        'Torre A - Estrutura e Fôrmas',
        'Conferência topográfica pré-concretagem apontou desvio de 12mm na contraflecha da viga V-304.',
        'Ajustados os forcados metálicos das torres de cimbramento e revalidado nível a laser pela equipe de qualidade.',
        'Eng. Mariana Costa'
      );
    }

    // Seed sample occurrence photos if occurrence_photos is empty
    const photoCount = db.prepare('SELECT COUNT(*) as total FROM occurrence_photos').get();
    if (!photoCount || photoCount.total === 0) {
      const allOccs = db.prepare('SELECT id, type, status, user_id FROM occurrences ORDER BY id ASC').all();
      const insPhoto = db.prepare(`
        INSERT INTO occurrence_photos (occurrence_id, user_id, image_url, caption, phase)
        VALUES (?, ?, ?, ?, ?)
      `);
      if (allOccs[0]) {
        insPhoto.run(allOccs[0].id, allOccs[0].user_id, '/uploads/foto-seguranca-bandeja.svg', 'Bloqueio preventivo e sinalização da Cabine B no 6º pavimento', 'REGISTRO');
      }
      if (allOccs[1]) {
        insPhoto.run(allOccs[1].id, allOccs[1].user_id, '/uploads/foto-armacao-vigas.svg', 'Recebimento e conferência dos lotes de aço CA-50 no pátio térreo', 'CONCLUSAO');
      }
      if (allOccs[2]) {
        insPhoto.run(allOccs[2].id, allOccs[2].user_id, '/uploads/foto-fundacao-estacas.svg', 'Instalação de bombas submersíveis e proteção de talude com lona', 'TRATATIVA');
      }
      if (allOccs[3]) {
        insPhoto.run(allOccs[3].id, allOccs[3].user_id, '/uploads/foto-instalacoes-hidraulica.svg', 'Registro da interferência entre duto HVAC e prumada de sprinklers', 'REGISTRO');
      }
      if (allOccs[4]) {
        insPhoto.run(allOccs[4].id, allOccs[4].user_id, '/uploads/foto-seguranca-bandeja.svg', 'Guarda-corpo e bandeja periférica readequados conforme NR-18', 'CONCLUSAO');
      }
    }
  } catch (err) {
    console.error('Erro ao garantir extras de ocorrências:', err.message);
  }
}

function ensureRdoColumns() {
  const cols = db.prepare("PRAGMA table_info('rdo_records')").all().map((c) => c.name);
  const additions = [
    ['final_signature', "TEXT DEFAULT ''"],
    ['finalized_at', "TEXT DEFAULT ''"],
    ['reopened_reason', "TEXT DEFAULT ''"]
  ];
  for (const [colName, colDef] of additions) {
    if (!cols.includes(colName)) {
      db.exec(`ALTER TABLE rdo_records ADD COLUMN ${colName} ${colDef};`);
    }
  }
}

// Período de atividade do profissional na obra (data de início e fim).
// Usado para calcular automaticamente o efetivo do dia no RDO.
function ensureEmployeeColumns() {
  const cols = db.prepare("PRAGMA table_info('employees')").all().map((c) => c.name);
  const additions = [
    ['start_date', "TEXT DEFAULT ''"],
    ['end_date', "TEXT DEFAULT ''"]
  ];
  for (const [colName, colDef] of additions) {
    if (!cols.includes(colName)) {
      db.exec(`ALTER TABLE employees ADD COLUMN ${colName} ${colDef};`);
    }
  }
}

function ensureReportSettingsColumns() {
  const cols = db.prepare("PRAGMA table_info('report_settings')").all().map((c) => c.name);
  const additions = [
    ['contract_number', "TEXT DEFAULT 'CO141/2025 - DT'"],
    ['contractor_company', "TEXT DEFAULT 'Consórcio Rodovia PR-317 Iguaraçu Maringá'"],
    ['supervisor_company', "TEXT DEFAULT 'Iguatemi Consultoria e Serviços de Engenharia LTDA.'"],
    ['client_name', "TEXT DEFAULT 'DER/PR - Governo do Estado do Paraná'"],
    ['regional_superintendency', "TEXT DEFAULT 'DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE'"],
    ['contractor_manager', "TEXT DEFAULT 'DANIELLE NARDINO'"],
    ['contractor_representative', "TEXT DEFAULT 'DANIELLE NARDINO'"],
    ['supervisor_engineer', "TEXT DEFAULT 'João Carlos Deríssio'"],
    ['fiscal_engineer', "TEXT DEFAULT 'Alisson'"],
    ['banner_logo_left_url', "TEXT DEFAULT ''"],
    ['banner_logo_right_url', "TEXT DEFAULT ''"]
  ];
  for (const [colName, colDef] of additions) {
    if (!cols.includes(colName)) {
      db.exec(`ALTER TABLE report_settings ADD COLUMN ${colName} ${colDef};`);
    }
  }
}

function ensurePluviometryColumns() {
  const cols = db.prepare("PRAGMA table_info('pluviometry')").all().map((c) => c.name);
  const additions = [
    ['morning_mm', 'REAL DEFAULT 0'],
    ['afternoon_mm', 'REAL DEFAULT 0'],
    ['night_mm', 'REAL DEFAULT 0'],
    ['production_tons', 'REAL DEFAULT 0'],
    ['station_name', "TEXT DEFAULT 'Pluviômetro / INMET'"]
  ];
  for (const [colName, colDef] of additions) {
    if (!cols.includes(colName)) {
      db.exec(`ALTER TABLE pluviometry ADD COLUMN ${colName} ${colDef};`);
    }
  }
}

function createSampleSvgPhoto(filename, title, subtitle, stage, date, primaryColor, accentColor) {
  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) return;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${primaryColor}" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="800" height="500" fill="url(#bg)"/>
    <rect width="800" height="500" fill="url(#grid)"/>
    
    <!-- Architectural / Construction Illustration -->
    <g stroke="${accentColor}" stroke-width="2" fill="none" opacity="0.35">
      <rect x="80" y="140" width="220" height="280" />
      <line x1="80" y1="210" x2="300" y2="210" />
      <line x1="80" y1="280" x2="300" y2="280" />
      <line x1="80" y1="350" x2="300" y2="350" />
      <line x1="150" y1="140" x2="150" y2="420" />
      <line x1="230" y1="140" x2="230" y2="420" />
      
      <!-- Crane silhouette -->
      <line x1="520" y1="80" x2="520" y2="420" stroke-width="4" />
      <line x1="360" y1="100" x2="680" y2="100" stroke-width="4" />
      <line x1="520" y1="80" x2="420" y2="100" />
      <line x1="520" y1="80" x2="640" y2="100" />
      <line x1="620" y1="100" x2="620" y2="220" stroke-dasharray="6,4" />
      <rect x="595" y="220" width="50" height="35" fill="rgba(245,158,11,0.2)" />
      
      <!-- Structure Frame -->
      <rect x="350" y="240" width="320" height="180" />
      <line x1="350" y1="300" x2="670" y2="300" />
      <line x1="350" y1="360" x2="670" y2="360" />
      <line x1="450" y1="240" x2="450" y2="420" />
      <line x1="560" y1="240" x2="560" y2="420" />
    </g>

    <!-- Stamp / Metadata Overlay -->
    <rect x="0" y="385" width="800" height="115" fill="rgba(15, 23, 42, 0.88)" />
    <line x1="0" y1="385" x2="800" y2="385" stroke="${accentColor}" stroke-width="3" />
    
    <rect x="28" y="30" width="170" height="34" rx="6" fill="${accentColor}" />
    <text x="113" y="52" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${stage}</text>

    <text x="30" y="425" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="bold" fill="#f8fafc">${title}</text>
    <text x="30" y="455" font-family="Segoe UI, Arial, sans-serif" font-size="15" fill="#94a3b8">${subtitle}</text>
    <text x="30" y="480" font-family="Consolas, monospace" font-size="13" fill="${accentColor}">AXIS OBRA • REGISTRO TÉCNICO VERIFICADO • DATA: ${date}</text>
  </svg>`;

  fs.writeFileSync(filePath, svg, 'utf-8');
}

function ensureSamplePhotos() {
  createSampleSvgPhoto(
    'foto- concretagem-laje.svg',
    'Concretagem da Laje do 8º Pavimento - Torre A',
    'Setor Norte • Fck 35 MPa • Bombeamento contínuo e adensamento vibratório',
    'ESTRUTURA',
    '28/10/2026 10:42',
    '#1e3a8a',
    '#f59e0b'
  );
  createSampleSvgPhoto(
    'foto-armacao-vigas.svg',
    'Conferência de Armação de Vigas V-801 a V-814',
    'Torre A • Aço CA-50 Ø16mm e espaçadores plásticos verificados pela fiscalização',
    'ESTRUTURA',
    '26/10/2026 15:18',
    '#064e3b',
    '#10b981'
  );
  createSampleSvgPhoto(
    'foto-fundacao-estacas.svg',
    'Execução de Estaca Hélice Contínua Ø60cm - Bloco B12',
    'Monitoramento eletrônico de torque, profundidade (18,5m) e pressão de concreto',
    'FUNDACAO',
    '25/10/2026 09:15',
    '#312e81',
    '#38bdf8'
  );
  createSampleSvgPhoto(
    'foto-seguranca-bandeja.svg',
    'Instalação de Bandeja Primária de Proteção Coletiva (NR-18)',
    'Perímetro Fachada Leste • Fixação em ganchos metálicos e tela fachadeira',
    'SEGURANCA',
    '29/10/2026 14:05',
    '#7c2d12',
    '#fb923c'
  );
  createSampleSvgPhoto(
    'foto-instalacoes-hidraulica.svg',
    'Prumadas Hidrossanitárias e Teste de Estanqueidade',
    'Pavimentos Tipo 3º ao 5º • Pressurização da rede de água fria/quente sem vazamentos',
    'INSTALACOES',
    '30/10/2026 11:30',
    '#1e293b',
    '#22d3ee'
  );
}

function seedOccurrenceParamsIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) as total FROM occurrence_params').get();
  if (countRow && countRow.total > 0) return;

  const insertParam = db.prepare(`
    INSERT INTO occurrence_params (group_key, code, label, color, is_resolved, is_critical, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // 1. Categoria / Tipo (TYPE)
  const defaultTypes = [
    ['TYPE', 'SEGURANCA', 'Segurança do Trabalho / Incidente', 'rose', 0, 0, 1],
    ['TYPE', 'ATRASO_MATERIAL', 'Atraso de Entrega / Suprimentos', 'amber', 0, 0, 2],
    ['TYPE', 'FALHA_EQUIPAMENTO', 'Falha / Manutenção de Equipamento', 'orange', 0, 0, 3],
    ['TYPE', 'QUALIDADE', 'Qualidade / Não Conformidade Executiva', 'indigo', 0, 0, 4],
    ['TYPE', 'CLIMA', 'Intercorrência Climática / Drenagem', 'sky', 0, 0, 5],
    ['TYPE', 'PROJETO', 'Interferência / Revisão de Projeto (RFI)', 'purple', 0, 0, 6],
    ['TYPE', 'FISCALIZACAO', 'Vistoria / Notificação de Fiscalização', 'emerald', 0, 0, 7],
    ['TYPE', 'EFETIVO', 'Falta de Efetivo / Empreiteira', 'slate', 0, 0, 8],
    ['TYPE', 'OUTROS', 'Outros', 'slate', 0, 0, 9]
  ];

  // 2. Grau de Severidade (SEVERITY)
  const defaultSeverities = [
    ['SEVERITY', 'BAIXA', 'Baixa', 'slate', 0, 0, 1],
    ['SEVERITY', 'MEDIA', 'Média', 'amber', 0, 0, 2],
    ['SEVERITY', 'ALTA', 'Alta', 'orange', 0, 1, 3],
    ['SEVERITY', 'CRITICA', 'Crítica (Urgente)', 'rose', 0, 1, 4]
  ];

  // 3. Status (STATUS)
  const defaultStatuses = [
    ['STATUS', 'ABERTA', 'Aberta', 'rose', 0, 0, 1],
    ['STATUS', 'EM_ANDAMENTO', 'Em Tratamento', 'amber', 0, 0, 2],
    ['STATUS', 'AGUARDANDO_TERCEIRO', 'Aguardando Fornecedor / Projetista', 'sky', 0, 0, 3],
    ['STATUS', 'RESOLVIDA', 'Resolvida / Concluída', 'emerald', 1, 0, 4]
  ];

  // 4. Setor / Frente de Serviço (SECTOR)
  const defaultSectors = [
    ['SECTOR', 'CANTEIRO_GERAL', 'Canteiro Geral / Administração', 'slate', 0, 0, 1],
    ['SECTOR', 'FUNDACAO_SUBSOLO', 'Fundação e Subsolos', 'sky', 0, 0, 2],
    ['SECTOR', 'TORRE_A_ESTRUTURA', 'Torre A - Estrutura e Fôrmas', 'indigo', 0, 0, 3],
    ['SECTOR', 'TORRE_A_PRUMADA', 'Torre A - Prumada Externa Sul', 'amber', 0, 0, 4],
    ['SECTOR', 'TORRE_B_ALVENARIA', 'Torre B - Alvenaria e Vedação', 'orange', 0, 0, 5],
    ['SECTOR', 'INSTALACOES_PREDIAIS', 'Instalações Elétricas / Hidrossanitárias / HVAC', 'emerald', 0, 0, 6],
    ['SECTOR', 'FACHADA_EXTERNA', 'Fachada Externa / Balancim', 'rose', 0, 0, 7],
    ['SECTOR', 'ALMOXARIFADO_PATIO', 'Pátio de Armação / Almoxarifado', 'purple', 0, 0, 8],
    ['SECTOR', 'DRENAGEM_TERRAPLANAGEM', 'Setor Oeste - Bacia de Contenção / Terraplanagem', 'sky', 0, 0, 9]
  ];

  [...defaultTypes, ...defaultSeverities, ...defaultStatuses, ...defaultSectors].forEach((row) => {
    insertParam.run(...row);
  });
}

function seedReportSettingsIfEmpty() {
  const row = db.prepare('SELECT id FROM report_settings WHERE id = 1').get();
  if (row) return;

  db.prepare(`
    INSERT INTO report_settings (
      id, orientation, photos_per_page, banner_mode, banner_image_url,
      banner_text, banner_text_align, banner_font_size, banner_bold,
      banner_italic, banner_underline, banner_color,
      subheader_text, subheader_align, subheader_bold,
      footer_text, show_empty_placeholders
    )
    VALUES (
      1, 'PORTRAIT', 6, 'TEXT', '',
      'AXIS OBRA ENGENHARIA E CONSTRUÇÕES LTDA\nSUPERINTENDÊNCIA DE ENGENHARIA E CONTROLE DE QUALIDADE',
      'CENTER', 'MEDIUM', 1, 0, 0, '#0f172a',
      '', 'CENTER', 1,
      'Contrato n. CO141/2026 - DT', 1
    )
  `).run();
}

function seedIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) as total FROM users').get();
  if (countRow && countRow.total > 0) {
    return false;
  }

  console.log('Populando banco de dados inicial do AXIS OBRA...');

  // 2. Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, crea_cft, phone, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const adminId = insertUser.run(
    'Carlos Eduardo Mendes (Diretor / Admin)',
    'admin@axisobra.com.br',
    hashPassword('123456'),
    'ADMIN',
    'CREA-SP 5061928341',
    '(11) 99812-4400'
  ).lastInsertRowid;

  const eng1Id = insertUser.run(
    'Eng. Mariana Costa (Residente)',
    'mariana@axisobra.com.br',
    hashPassword('123456'),
    'ENGENHEIRO',
    'CREA-SP 5070384912',
    '(11) 99421-8833'
  ).lastInsertRowid;

  const eng2Id = insertUser.run(
    'Eng. Roberto Almeida (Infraestrutura)',
    'roberto@axisobra.com.br',
    hashPassword('123456'),
    'ENGENHEIRO',
    'CREA-SP 5068112098',
    '(19) 99105-7721'
  ).lastInsertRowid;

  const encId = insertUser.run(
    'João Batista Silva (Mestre / Encarregado)',
    'joao@axisobra.com.br',
    hashPassword('123456'),
    'ENCARREGADO',
    'CFT-BR 18920341',
    '(11) 98765-1122'
  ).lastInsertRowid;

  // 3. Insert Projects (Obras)
  const insertProject = db.prepare(`
    INSERT INTO projects (code, name, client, address, city, state, start_date, expected_end_date, status, progress, budget, area_m2, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const proj1Id = insertProject.run(
    'OBR-2026-001',
    'Residencial Horizon Towers',
    'Incorporadora Vértice S.A.',
    'Av. Engenheiro Luís Carlos Berrini, 1450',
    'São Paulo',
    'SP',
    '2026-01-15',
    '2027-08-30',
    'EM_ANDAMENTO',
    62,
    28500000,
    14200,
    'Empreendimento residencial de alto padrão com 2 torres de 24 pavimentos, 3 subsolos e área de lazer completa.'
  ).lastInsertRowid;

  const proj2Id = insertProject.run(
    'OBR-2026-002',
    'Centro Logístico Axis Campinas',
    'LogBrasil Operações Logísticas',
    'Rodovia Anhanguera, Km 98 - Distrito Industrial',
    'Campinas',
    'SP',
    '2026-03-10',
    '2027-02-15',
    'EM_ANDAMENTO',
    45,
    19400000,
    26500,
    'Galpão logístico modular Triple-A com piso industrial protendido de alta resistência, 28 docas e cobertura metálica zipada.'
  ).lastInsertRowid;

  const proj3Id = insertProject.run(
    'OBR-2026-003',
    'Clínica Médica São Lucas - Ampliação',
    'Rede Saúde Integrada',
    'Rua Dr. Bacelar, 610 - Vila Clementino',
    'São Paulo',
    'SP',
    '2025-11-01',
    '2026-12-20',
    'EM_ANDAMENTO',
    84,
    8900000,
    4800,
    'Retrofit e ampliação do bloco cirúrgico e diagnóstico por imagem, com instalações especiais de gases medicinais e HVAC.'
  ).lastInsertRowid;

  // 4. Link Users to Projects (Gerenciamento de Obras por Usuário)
  const insertProjectUser = db.prepare(`
    INSERT INTO project_users (project_id, user_id, role_in_project, can_edit)
    VALUES (?, ?, ?, ?)
  `);

  // Admin is linked to all, plus has global ADMIN access
  insertProjectUser.run(proj1Id, adminId, 'Diretor de Engenharia', 1);
  insertProjectUser.run(proj2Id, adminId, 'Diretor de Engenharia', 1);
  insertProjectUser.run(proj3Id, adminId, 'Diretor de Engenharia', 1);

  // Eng. Mariana -> Obras 1 and 3
  insertProjectUser.run(proj1Id, eng1Id, 'Engenheira Residente Sênior', 1);
  insertProjectUser.run(proj3Id, eng1Id, 'Coordenadora de Instalações', 1);

  // Eng. Roberto -> Obra 2
  insertProjectUser.run(proj2Id, eng2Id, 'Engenheiro Residente - Galpão Logístico', 1);

  // Mestre João Batista -> Obra 1
  insertProjectUser.run(proj1Id, encId, 'Mestre de Obras Geral', 1);

  // 5. Insert Employees (Cadastro de Funcionários)
  const insertEmployee = db.prepare(`
    INSERT INTO employees (name, cpf, registration_number, role, contract_type, company, phone, daily_rate, aso_expiry, nr_certifications, status, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertEmployee.run('Antônio Marcos Ferreira', '284.910.338-12', 'FUNC-001', 'Mestre de Obras', 'CLT', 'Axis Construtora', '(11) 98211-3401', 380.0, '2027-04-15', 'NR-18, NR-35', 'ATIVO', proj1Id);
  insertEmployee.run('Severino Ramos da Silva', '193.842.774-09', 'FUNC-002', 'Carpinteiro de Formas', 'CLT', 'Axis Construtora', '(11) 97432-8910', 240.0, '2027-06-20', 'NR-18, NR-35', 'ATIVO', proj1Id);
  insertEmployee.run('José Roberto Nascimento', '348.209.118-55', 'FUNC-003', 'Armador de Estrutura', 'CLT', 'Axis Construtora', '(11) 98190-4512', 245.0, '2027-03-10', 'NR-18, NR-35', 'ATIVO', proj1Id);
  insertEmployee.run('Cláudio Henrique Souza', '412.670.982-30', 'FUNC-004', 'Pedreiro de Acabamento', 'CLT', 'Axis Construtora', '(11) 96321-7788', 250.0, '2027-05-02', 'NR-18', 'ATIVO', proj3Id);
  insertEmployee.run('Wellington Dias Moreira', '509.118.432-71', 'FUNC-005', 'Eletricista Predial', 'TERCEIRIZADO', 'EletroTech Instalações', '(11) 99104-6620', 290.0, '2027-08-19', 'NR-10, NR-18, NR-35', 'ATIVO', proj3Id);
  insertEmployee.run('Francisco de Assis Lima', '177.903.421-84', 'FUNC-006', 'Operador de Grua / Guindaste', 'TERCEIRIZADO', 'LocMax Pesados', '(19) 98841-2090', 360.0, '2027-02-28', 'NR-11, NR-12, NR-18, NR-35', 'ATIVO', proj2Id);
  insertEmployee.run('Raimundo Nonato Oliveira', '265.439.810-44', 'FUNC-007', 'Encanador Industrial', 'CLT', 'Axis Construtora', '(19) 99210-3391', 255.0, '2027-07-11', 'NR-18, NR-33', 'ATIVO', proj2Id);
  insertEmployee.run('Luciana Aparecida Gomes', '388.712.509-63', 'FUNC-008', 'Técnica de Segurança do Trabalho', 'CLT', 'Axis Construtora', '(11) 99551-0092', 310.0, '2027-09-30', 'NR-06, NR-18, NR-33, NR-35', 'ATIVO', proj1Id);
  insertEmployee.run('Marcelo Tavares Júnior', '451.890.231-18', 'FUNC-009', 'Servente de Obras', 'CLT', 'Axis Construtora', '(11) 97112-5409', 165.0, '2027-01-25', 'NR-18', 'FERIAS', proj1Id);

  // 6. Insert Equipments (Cadastro de Equipamentos)
  const insertEquipment = db.prepare(`
    INSERT INTO equipments (code, name, category, brand, model, serial_number, ownership, supplier, daily_cost, status, last_maintenance, next_maintenance, project_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertEquipment.run('EQP-001', 'Grua Ascensional Torre 42m', 'ELEVACAO', 'Liebherr', '85 EC-B 5', 'LBH-2024-8891', 'LOCADO', 'LocMax Gruas S.A.', 1450.0, 'OPERACIONAL', '2026-10-05', '2026-11-05', proj1Id, 'Inspeção de cabos de aço e limitador de carga em dia.');
  insertEquipment.run('EQP-002', 'Escavadeira Hidráulica 21T', 'PESADO', 'Caterpillar', '320 GC', 'CAT0320GC99102', 'LOCADO', 'TerraForte Locadora', 1180.0, 'OPERACIONAL', '2026-10-12', '2026-11-12', proj2Id, 'Alocada na escavação de bacia de contenção e drenagem.');
  insertEquipment.run('EQP-003', 'Betoneira Estacionária 400L Trifásica', 'CONCRETAGEM', 'Menegotti', 'Prime 400L', 'MNG-400-77210', 'PROPRIO', 'Patrimônio Axis', 65.0, 'OPERACIONAL', '2026-09-20', '2026-12-20', proj1Id, 'Uso exclusivo para preparo de argamassa de assentamento.');
  insertEquipment.run('EQP-004', 'Estação Total Topográfica Laser', 'MEDICAO', 'Leica Geosystems', 'TS07 5"', 'LCA-TS07-44901', 'PROPRIO', 'Patrimônio Axis', 190.0, 'OPERACIONAL', '2026-08-15', '2027-02-15', proj2Id, 'Certificado de calibração RBC válido.');
  insertEquipment.run('EQP-005', 'Elevador Cremalheira Cabine Dupla', 'ELEVACAO', 'Torgar', 'T2-1500', 'TRG-1500-3109', 'LOCADO', 'VertiLoc Equipamentos', 780.0, 'EM_MANUTENCAO', '2026-10-29', '2026-11-15', proj1Id, 'Substituição preventiva do sensor de porta da cabine B.');
  insertEquipment.run('EQP-006', 'Plataforma Elevatória Tesoura Elétrica 10m', 'ELEVACAO', 'JLG', '2646ES', 'JLG-2646-8812', 'LOCADO', 'Millis Rental', 320.0, 'OPERACIONAL', '2026-10-10', '2026-11-10', proj3Id, 'Utilizada na instalação de dutos de ar-condicionado hospitalar.');
  insertEquipment.run('EQP-007', 'Compactador de Percussão (Sapo)', 'PESADO', 'Wacker Neuson', 'BS 60-2i', 'WKN-BS60-1129', 'PROPRIO', 'Patrimônio Axis', 95.0, 'DISPONIVEL', '2026-10-18', '2026-12-18', proj2Id, 'Disponível no almoxarifado central da obra.');

  // 7. Insert Photos (Registro Fotográfico)
  const insertPhoto = db.prepare(`
    INSERT INTO photos (project_id, user_id, title, description, stage, location_area, taken_at, image_url, weather_condition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPhoto.run(
    proj1Id,
    eng1Id,
    'Concretagem da Laje do 8º Pavimento - Torre A',
    'Lançamento de 145m³ de concreto usinado Fck 35 MPa com acompanhamento tecnológico de slump test (12±2 cm) e moldagem de corpos de prova.',
    'ESTRUTURA',
    'Torre A - 8º Pavimento Tipo',
    '2026-10-28',
    '/uploads/foto- concretagem-laje.svg',
    'SOL'
  );
  insertPhoto.run(
    proj1Id,
    encId,
    'Conferência de Armação de Vigas V-801 a V-814',
    'Inspeção e liberação das taxas de armadura negativa e positiva antes do fechamento lateral de formas.',
    'ESTRUTURA',
    'Torre A - 8º Pavimento',
    '2026-10-26',
    '/uploads/foto-armacao-vigas.svg',
    'SOL'
  );
  insertPhoto.run(
    proj1Id,
    eng1Id,
    'Instalação de Bandeja Primária de Proteção Coletiva (NR-18)',
    'Montagem concluída da bandeja salva-vidas no perímetro leste com tela de proteção contra queda de materiais.',
    'SEGURANCA',
    'Fachada Leste - Perímetro 5º Pavimento',
    '2026-10-29',
    '/uploads/foto-seguranca-bandeja.svg',
    'NUBLADO'
  );
  insertPhoto.run(
    proj2Id,
    eng2Id,
    'Execução de Estaca Hélice Contínua Ø60cm - Bloco B12',
    'Perfuração e concretagem monitorada eletronicamente para fundação dos pilares pré-moldados do galpão logístico.',
    'FUNDACAO',
    'Eixo D / Fila 12 - Galpão Principal',
    '2026-10-25',
    '/uploads/foto-fundacao-estacas.svg',
    'SOL'
  );
  insertPhoto.run(
    proj3Id,
    eng1Id,
    'Prumadas Hidrossanitárias e Teste de Estanqueidade',
    'Tubulação PPR termofusão testada sob pressão de 60 m.c.a. durante 24h sem queda manométrica.',
    'INSTALACOES',
    'Ala Norte - 2º Pavimento Cirúrgico',
    '2026-10-30',
    '/uploads/foto-instalacoes-hidraulica.svg',
    'SOL'
  );

  // 8. Insert Occurrences (Registro de Ocorrências)
  const insertOccurrence = db.prepare(`
    INSERT INTO occurrences (project_id, user_id, title, type, severity, status, occurrence_date, location_area, description, action_taken, responsible)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertOccurrence.run(
    proj1Id,
    eng1Id,
    'Parada preventiva na Cabine B do Elevador Cremalheira',
    'FALHA_EQUIPAMENTO',
    'ALTA',
    'EM_ANDAMENTO',
    '2026-10-29',
    'Torre A - Prumada Externa Sul',
    'Sensor eletromecânico de intertravamento da porta da Cabine B apresentou intermitência no 6º pavimento. Por segurança, a cabine B foi bloqueada imediatamente.',
    'Acionada equipe técnica da locadora VertiLoc. Transporte vertical concentrado temporariamente na Cabine A e na Grua.',
    'Eng. Mariana Costa / Luciana (TST)'
  );
  insertOccurrence.run(
    proj1Id,
    encId,
    'Atraso na entrega de aço cortado e dobrado (Pedido #4920)',
    'ATRASO_MATERIAL',
    'MEDIA',
    'RESOLVIDA',
    '2026-10-24',
    'Pátio de Armação - Térreo',
    'Carreta da fornecedora atrasou 6 horas devido a interdição na rodovia, impactando o início da montagem dos pilares do 9º pavimento.',
    'Remanejada a equipe de armadores para adiantamento das vigas de bordo da Torre B; carga recebida às 16h30.',
    'João Batista Silva'
  );
  insertOccurrence.run(
    proj2Id,
    eng2Id,
    'Alagamento parcial de valas de drenagem após chuva intensa',
    'CLIMA',
    'ALTA',
    'EM_ANDAMENTO',
    '2026-10-27',
    'Setor Oeste - Bacia de Contenção',
    'Precipitação de 48mm no período da tarde provocou acúmulo de água e carreamento de solo nos taludes da rede pluvial.',
    'Instaladas 3 bombas submersíveis mangote 3" para esgotamento e reforçado o envelopamento com lona plástica nos taludes.',
    'Eng. Roberto Almeida'
  );
  insertOccurrence.run(
    proj3Id,
    eng1Id,
    'Divergência de cota entre duto de HVAC e tubulação de incêndio',
    'PROJETO',
    'MEDIA',
    'ABERTA',
    '2026-10-30',
    'Corredor Central - Forro 2º Pavimento',
    'Identificada interferência física (clash) na cota +3,15m entre o duto principal de insuflamento e a rede de sprinklers.',
    'Emitida RFI #018 para o projetista de instalações solicitando desvio com curva 45° na rede de incêndio.',
    'Eng. Mariana Costa'
  );

  // 9. Insert Pluviometry (Registro de Pluviometria)
  const insertPluviometry = db.prepare(`
    INSERT INTO pluviometry (project_id, user_id, record_date, morning_weather, afternoon_weather, night_weather, rainfall_mm, work_impact, hours_lost, temperature_min, temperature_max, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPluviometry.run(proj1Id, eng1Id, '2026-10-26', 'SOL', 'SOL', 'SEM_EXPEDIENTE', 0.0, 'SEM_IMPACTO', 0, 18, 29, 'Tempo firme durante todo o expediente. Produtividade 100%.');
  insertPluviometry.run(proj1Id, eng1Id, '2026-10-27', 'NUBLADO', 'CHUVA_FORTE', 'CHUVA_FRACA', 34.5, 'IMPACTO_PARCIAL', 3.0, 17, 23, 'Chuva forte entre 14h00 e 17h00. Suspensos serviços em fachada e operação de grua por ventos e descarga atmosférica.');
  insertPluviometry.run(proj1Id, encId, '2026-10-28', 'SOL', 'NUBLADO', 'SEM_EXPEDIENTE', 0.0, 'SEM_IMPACTO', 0, 16, 26, 'Condições favoráveis para a concretagem da laje do 8º pavimento.');
  insertPluviometry.run(proj1Id, eng1Id, '2026-10-29', 'NUBLADO', 'CHUVA_FRACA', 'SEM_EXPEDIENTE', 8.2, 'SEM_IMPACTO', 0.5, 17, 24, 'Garoa rápida no final da tarde, equipes transferidas para atividades internas de alvenaria.');
  insertPluviometry.run(proj1Id, eng1Id, '2026-10-30', 'SOL', 'SOL', 'SEM_EXPEDIENTE', 0.0, 'SEM_IMPACTO', 0, 19, 30, 'Céu aberto, sem precipitação.');

  insertPluviometry.run(proj2Id, eng2Id, '2026-10-27', 'NUBLADO', 'IMPRATICAVEL', 'CHUVA_FORTE', 48.0, 'PARALISACAO_TOTAL', 4.5, 16, 22, 'Tempestade severa em Campinas. Terraplanagem e fundação paralisadas no turno da tarde devido a solo saturado.');
  insertPluviometry.run(proj2Id, eng2Id, '2026-10-28', 'NUBLADO', 'SOL', 'SEM_EXPEDIENTE', 2.0, 'IMPACTO_PARCIAL', 2.0, 17, 27, 'Manhã dedicada ao bombeamento de água acumulada e limpeza de pista de rolamento.');
  insertPluviometry.run(proj2Id, eng2Id, '2026-10-30', 'SOL', 'SOL', 'SEM_EXPEDIENTE', 0.0, 'SEM_IMPACTO', 0, 18, 31, 'Solo seco, cravação de estacas e terraplanagem em ritmo normal.');

  insertPluviometry.run(proj3Id, eng1Id, '2026-10-29', 'NUBLADO', 'CHUVA_FRACA', 'SEM_EXPEDIENTE', 6.5, 'SEM_IMPACTO', 0, 17, 24, 'Obra predominantemente interna, sem impacto no cronograma.');

  console.log('Seed inicial do AXIS OBRA concluído com sucesso!');
  return true;
}

module.exports = {
  db,
  initDatabase,
  hashPassword,
  verifyPassword,
  isLegacyHash,
  seedOccurrenceParamsIfEmpty,
  dataDir,
  uploadsDir
};

