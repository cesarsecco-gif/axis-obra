const STORAGE_TOKEN_KEY = 'axis_obra_token';
const STORAGE_USER_KEY = 'axis_obra_user';
const STORAGE_IMPERSONATOR_KEY = 'axis_obra_impersonator';

// Evento disparado quando a sessão expira (HTTP 401) — o App volta para a tela de login.
export const UNAUTHORIZED_EVENT = 'axis:unauthorized';

export function getStoredToken() {
  return localStorage.getItem(STORAGE_TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredImpersonator() {
  try {
    const raw = localStorage.getItem(STORAGE_IMPERSONATOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuthSession(token, user, impersonator) {
  if (token) localStorage.setItem(STORAGE_TOKEN_KEY, token);
  if (user) localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
  if (impersonator) localStorage.setItem(STORAGE_IMPERSONATOR_KEY, JSON.stringify(impersonator));
  else localStorage.removeItem(STORAGE_IMPERSONATOR_KEY);
}

export function clearAuthSession() {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_IMPERSONATOR_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();

  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && token && !path.startsWith('/api/auth/login')) {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
  if (!response.ok) {
    throw new Error(data.error || `Erro HTTP ${response.status}`);
  }
  return data;
}

// Permissões do perfil de acesso do usuário logado.
// action: 'view' | 'create' | 'edit' | 'delete' | nome da ação especial (ex.: 'finalize')
export function can(user, moduleKey, action = 'view') {
  if (!user) return false;
  if (user.permissions === 'ALL') return true;
  const mod = user.permissions && user.permissions[moduleKey];
  if (!mod || !mod.view) return false;
  if (['view', 'create', 'edit', 'delete'].includes(action)) return Boolean(mod[action]);
  return Boolean(mod.special && mod.special[action]);
}

export function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value) || 0);
}

export function formatDateBR(dateStr) {
  if (!dateStr) return '—';
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

