// Perfis de acesso configuráveis: módulos do sistema, perfis padrão e verificação de permissões.
//
// Cada perfil (tabela `roles`) guarda em `permissions` um JSON no formato:
//   { "RDO": { "view": true, "create": true, "edit": true, "delete": false, "special": { "finalize": true } }, ... }
// e em `scope` a abrangência das obras: 'LINKED' (somente obras vinculadas) ou 'ALL' (todas as obras).
// O perfil ADMIN é fixo: sempre acesso total.

const MODULES = [
  { key: 'DASHBOARD', label: 'Painel Consolidado', crud: false, specials: [] },
  { key: 'PHOTOS', label: '1. Registro Fotográfico', crud: true, specials: [{ key: 'export', label: 'Exportar relatório' }] },
  {
    key: 'RDO',
    label: '2. Diário de Obras (RDO)',
    crud: true,
    specials: [
      { key: 'finalize', label: 'Finalizar folha' },
      { key: 'reopen', label: 'Reabrir folha' },
      { key: 'batch', label: 'Gerar em lote' }
    ]
  },
  {
    key: 'OCCURRENCES',
    label: '3. Registro de Ocorrências',
    crud: true,
    specials: [
      { key: 'change_status', label: 'Alterar status' },
      { key: 'export', label: 'Exportar relatório' }
    ]
  },
  { key: 'EMPLOYEES', label: '4. Cadastro de Funcionários', crud: true, specials: [{ key: 'view_costs', label: 'Ver valores de diária' }] },
  { key: 'EQUIPMENTS', label: '5. Cadastro de Equipamentos', crud: true, specials: [{ key: 'view_costs', label: 'Ver custos' }] },
  { key: 'PROJECTS', label: '6. Gestão de Obras', crud: true, specials: [{ key: 'link_team', label: 'Vincular equipe' }] },
  { key: 'PLUVIOMETRY', label: '7. Registro de Pluviometria', crud: true, specials: [{ key: 'import_inmet', label: 'Importar INMET' }] },
  {
    key: 'SETTINGS',
    label: '8. Configurações do Sistema',
    crud: true,
    specials: [
      { key: 'manage_roles', label: 'Perfis de acesso' },
      { key: 'backup', label: 'Backup' }
    ]
  },
  {
    key: 'ACCOUNTS',
    label: '9. Gestão de Contas',
    crud: true,
    specials: [
      { key: 'reset_password', label: 'Redefinir senhas' },
      { key: 'impersonate', label: 'Simular acesso' }
    ]
  }
];

const MODULE_KEYS = MODULES.map((m) => m.key);

// Monta permissões a partir de um mapa compacto: { MODULO: 'vced' + especiais }
function buildPermissions(spec) {
  const perms = {};
  for (const mod of MODULES) {
    const s = spec[mod.key] || {};
    const flags = s.crud || '';
    perms[mod.key] = {
      view: flags.includes('v'),
      create: mod.crud && flags.includes('c'),
      edit: mod.crud && flags.includes('e'),
      delete: mod.crud && flags.includes('d'),
      special: Object.fromEntries(mod.specials.map((sp) => [sp.key, (s.special || []).includes(sp.key)]))
    };
  }
  return perms;
}

const ALL_SPECIALS = (key) => MODULES.find((m) => m.key === key).specials.map((s) => s.key);

// Perfis padrão — reproduzem as regras que o sistema já tinha antes dos perfis configuráveis.
const SYSTEM_ROLES = [
  {
    key: 'ADMIN',
    name: 'Administrador',
    description: 'Acesso total ao sistema, em todas as obras.',
    color: '#f59e0b',
    scope: 'ALL',
    permissions: buildPermissions(
      Object.fromEntries(MODULE_KEYS.map((k) => [k, { crud: 'vced', special: ALL_SPECIALS(k) }]))
    )
  },
  {
    key: 'ENGENHEIRO',
    name: 'Engenheiro',
    description: 'Opera as obras vinculadas; finaliza e reabre RDO.',
    color: '#4f46e5',
    scope: 'LINKED',
    permissions: buildPermissions({
      DASHBOARD: { crud: 'v' },
      PHOTOS: { crud: 'vced', special: ['export'] },
      RDO: { crud: 'vced', special: ['finalize', 'reopen', 'batch'] },
      OCCURRENCES: { crud: 'vced', special: ['change_status', 'export'] },
      EMPLOYEES: { crud: 'vced', special: ['view_costs'] },
      EQUIPMENTS: { crud: 'vced', special: ['view_costs'] },
      PROJECTS: { crud: 've' },
      PLUVIOMETRY: { crud: 'vced', special: ['import_inmet'] },
      SETTINGS: { crud: 'vced' }
    })
  },
  {
    key: 'ENCARREGADO',
    name: 'Encarregado',
    description: 'Lançamentos diários de campo nas obras vinculadas.',
    color: '#059669',
    scope: 'LINKED',
    permissions: buildPermissions({
      DASHBOARD: { crud: 'v' },
      PHOTOS: { crud: 'vced', special: ['export'] },
      RDO: { crud: 'vce', special: ['batch'] },
      OCCURRENCES: { crud: 'vced', special: ['change_status', 'export'] },
      EMPLOYEES: { crud: 'vced', special: ['view_costs'] },
      EQUIPMENTS: { crud: 'vced', special: ['view_costs'] },
      PROJECTS: { crud: 'v' },
      PLUVIOMETRY: { crud: 'vced', special: ['import_inmet'] }
    })
  },
  {
    key: 'FISCAL',
    name: 'Fiscal',
    description: 'Somente consulta das obras vinculadas.',
    color: '#7c3aed',
    scope: 'LINKED',
    permissions: buildPermissions({
      DASHBOARD: { crud: 'v' },
      PHOTOS: { crud: 'v', special: ['export'] },
      RDO: { crud: 'v' },
      OCCURRENCES: { crud: 'v', special: ['export'] },
      EMPLOYEES: { crud: 'v' },
      EQUIPMENTS: { crud: 'v' },
      PROJECTS: { crud: 'v' },
      PLUVIOMETRY: { crud: 'v' }
    })
  }
];

// Normaliza permissões recebidas (garante todas as chaves, só booleanos, nada além dos módulos conhecidos).
function normalizePermissions(input) {
  const out = {};
  for (const mod of MODULES) {
    const src = (input && input[mod.key]) || {};
    const special = {};
    for (const sp of mod.specials) special[sp.key] = Boolean(src.special && src.special[sp.key]);
    const view = Boolean(src.view);
    out[mod.key] = {
      view,
      // Sem "ver" não há como criar/editar/excluir
      create: view && mod.crud && Boolean(src.create),
      edit: view && mod.crud && Boolean(src.edit),
      delete: view && mod.crud && Boolean(src.delete),
      special: view ? special : Object.fromEntries(mod.specials.map((sp) => [sp.key, false]))
    };
  }
  return out;
}

function isAdminRole(role) {
  return role && role.key === 'ADMIN';
}

function hasAllProjects(role) {
  return isAdminRole(role) || (role && role.scope === 'ALL');
}

// action: 'view' | 'create' | 'edit' | 'delete' | nome de ação especial
function can(role, moduleKey, action) {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const mod = role.permissions && role.permissions[moduleKey];
  if (!mod) return false;
  if (['view', 'create', 'edit', 'delete'].includes(action)) return Boolean(mod[action]);
  return Boolean(mod.view && mod.special && mod.special[action]);
}

// Mapa de rotas da API -> módulo e ação exigida. A primeira regra que casar vale.
// action null = a própria rota faz a verificação (ex.: upsert do RDO).
const METHOD_ACTION = { GET: 'view', POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' };
const ROUTE_RULES = [
  // Leitura aberta a qualquer usuário autenticado (usadas por vários módulos)
  { method: 'GET', re: /^\/api\/(report-settings|occurrence-params|roles)$/, open: true },
  { method: 'GET', re: /^\/api\/auth\//, open: true },
  // Lista das obras do usuário (já filtrada pela abrangência) — usada pelo filtro global de obra
  { method: 'GET', re: /^\/api\/projects$/, open: true },
  { re: /^\/api\/auth\//, open: true },

  { re: /^\/api\/admin\/backup$/, module: 'SETTINGS', action: 'backup' },
  { re: /^\/api\/roles/, module: 'SETTINGS', action: 'manage_roles' },
  { method: 'POST', re: /^\/api\/occurrence-params\/reset$/, module: 'SETTINGS', action: 'edit' },
  { re: /^\/api\/(report-settings|occurrence-params)/, module: 'SETTINGS' },

  // A lista de pessoas também é usada para montar a equipe das obras
  { method: 'GET', re: /^\/api\/users$/, anyOf: [['ACCOUNTS', 'view'], ['PROJECTS', 'link_team']] },
  { method: 'PUT', re: /^\/api\/users\/\d+\/password$/, module: 'ACCOUNTS', action: 'reset_password' },
  { method: 'POST', re: /^\/api\/users\/\d+\/invite$/, module: 'ACCOUNTS', action: 'edit' },
  { method: 'PUT', re: /^\/api\/users\/\d+\/projects$/, module: 'PROJECTS', action: 'link_team' },
  { re: /^\/api\/users/, module: 'ACCOUNTS' },

  { re: /^\/api\/projects\/\d+\/users/, module: 'PROJECTS', action: 'link_team' },
  { re: /^\/api\/projects/, module: 'PROJECTS' },
  { re: /^\/api\/dashboard/, module: 'DASHBOARD' },
  { re: /^\/api\/photos/, module: 'PHOTOS' },

  { method: 'POST', re: /^\/api\/rdo\/batch$/, module: 'RDO', action: 'batch' },
  { method: 'POST', re: /^\/api\/rdo\/sync-services$/, module: 'RDO', action: 'view' },
  { method: 'POST', re: /^\/api\/rdo$/, module: 'RDO', action: null },
  { re: /^\/api\/rdo/, module: 'RDO' },

  { method: 'POST', re: /^\/api\/occurrences\/\d+\/photos$/, module: 'OCCURRENCES', action: 'edit' },
  { re: /^\/api\/(occurrences|occurrence-photos)/, module: 'OCCURRENCES' },
  { re: /^\/api\/employees/, module: 'EMPLOYEES' },
  { re: /^\/api\/equipments/, module: 'EQUIPMENTS' },
  { method: 'POST', re: /^\/api\/pluviometry\/batch$/, module: 'PLUVIOMETRY', action: 'import_inmet' },
  { re: /^\/api\/pluviometry/, module: 'PLUVIOMETRY' }
];

function moduleLabel(key) {
  return (MODULES.find((m) => m.key === key) || {}).label || key;
}

const ACTION_TEXT = { view: 'acessar', create: 'cadastrar em', edit: 'alterar', delete: 'excluir em' };

// Retorna null quando permitido, ou a mensagem de erro.
function checkRoutePermission(role, method, path) {
  const rule = ROUTE_RULES.find((r) => (!r.method || r.method === method) && r.re.test(path));
  if (!rule) return isAdminRole(role) ? null : 'Seu perfil não tem permissão para esta ação.';
  if (rule.open) return null;
  if (rule.anyOf) {
    return rule.anyOf.some(([m, a]) => can(role, m, 'view') && can(role, m, a))
      ? null
      : 'Seu perfil não tem permissão para esta ação.';
  }
  // Toda rota de um módulo exige pelo menos "ver" o módulo
  if (!can(role, rule.module, 'view')) return `Seu perfil não tem acesso ao módulo ${moduleLabel(rule.module)}.`;
  const action = rule.action === undefined ? METHOD_ACTION[method] || 'view' : rule.action;
  if (action && !can(role, rule.module, action)) {
    const special = MODULES.find((m) => m.key === rule.module)?.specials.find((s) => s.key === action);
    return special
      ? `Seu perfil não permite: ${special.label} (${moduleLabel(rule.module)}).`
      : `Seu perfil não permite ${ACTION_TEXT[action] || action} ${moduleLabel(rule.module)}.`;
  }
  return null;
}

module.exports = {
  MODULES,
  SYSTEM_ROLES,
  normalizePermissions,
  isAdminRole,
  hasAllProjects,
  can,
  checkRoutePermission
};
