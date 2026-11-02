import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Save, ArrowLeft, Mail, Eye, KeyRound, Upload, X } from 'lucide-react';
import { apiRequest, can, formatDateBR } from '../api';

const EMPLOYMENT_TYPES = [
  ['PROPRIO', 'Equipe própria'],
  ['TERCEIRIZADO', 'Terceirizado'],
  ['FISCALIZACAO', 'Fiscalização / Supervisora'],
  ['CLIENTE', 'Cliente / Contratante']
];
const COUNCILS = [
  ['', 'Não possui'],
  ['CREA', 'CREA'],
  ['CAU', 'CAU'],
  ['CFT', 'CFT'],
  ['CRT', 'CRT'],
  ['MTE', 'MTE (Técnico de Segurança)']
];
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

const inputClass =
  'w-full h-11 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100';
const labelClass = 'flex flex-col gap-1.5 text-xs font-semibold text-slate-700';

const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter((p) => p && !/^(eng\.?|de|da|do|dos|das)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

function lastAccessText(iso) {
  if (!iso) return 'Nunca acessou';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const today = new Date();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return `Hoje, ${time}`;
  if (days === 1) return `Ontem, ${time}`;
  if (days < 7) return `Há ${days} dias`;
  return d.toLocaleDateString('pt-BR');
}

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59`);
  return Math.ceil((d - new Date()) / 86400000);
};

function accountStatus(u) {
  if (!u.active) return { key: 'INACTIVE', label: 'Inativa', className: 'text-rose-700' };
  if (u.access_expires_at && daysUntil(u.access_expires_at) < 0) {
    return { key: 'INACTIVE', label: 'Acesso expirado', className: 'text-rose-700' };
  }
  if (u.invite_pending) return { key: 'PENDING', label: 'Convite pendente', className: 'text-amber-700' };
  return { key: 'ACTIVE', label: 'Ativa', className: 'text-emerald-700' };
}

// Lê uma imagem e reduz no navegador antes do envio
function readImage(file, { maxSide, type }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(type, 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function permissionSummary(role, modules) {
  if (!role || !modules.length) return [];
  if (role.key === 'ADMIN') return [{ label: 'Todos os módulos', level: 'Acesso total', tone: 'text-amber-300' }];
  return modules.map((m) => {
    const p = role.permissions?.[m.key] || {};
    let level = 'Sem acesso';
    let tone = 'text-slate-400';
    if (p.view) {
      level = 'Consulta';
      tone = 'text-slate-200';
    }
    if (p.create || p.edit) {
      level = p.delete ? 'Total' : 'Edição';
      tone = 'text-amber-300';
    }
    return { label: m.label, level, tone };
  });
}

const emptyForm = {
  id: null,
  name: '',
  display_name: '',
  cpf: '',
  birth_date: '',
  email: '',
  phone: '',
  phone_alt: '',
  employment_type: 'PROPRIO',
  company: '',
  job_title: '',
  registration_number: '',
  council: '',
  council_number: '',
  council_uf: 'PR',
  role: 'ENGENHEIRO',
  access_expires_at: '',
  first_access: 'INVITE',
  password: '',
  notes: '',
  active: true,
  avatar_url: '',
  signature_url: '',
  avatar_base64: '',
  signature_base64: '',
  assignments: {}
};

function formFromAccount(u) {
  const assignments = {};
  (u.projects || []).forEach((p) => {
    assignments[p.id] = { checked: true, role_in_project: p.role_in_project || '', since_date: p.since_date || '' };
  });
  return {
    ...emptyForm,
    ...Object.fromEntries(Object.keys(emptyForm).map((k) => [k, u[k] ?? emptyForm[k]])),
    active: Boolean(u.active),
    first_access: 'INVITE',
    password: '',
    avatar_base64: '',
    signature_base64: '',
    assignments,
    invite_pending: u.invite_pending,
    last_login_at: u.last_login_at
  };
}

export default function AccountsView({ currentUser, projects, onImpersonate, onAccountsChanged }) {
  const [accounts, setAccounts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('LIST'); // LIST | FORM
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ACTIVE_PENDING');
  const [projectFilter, setProjectFilter] = useState('ALL');

  const canCreate = can(currentUser, 'ACCOUNTS', 'create');
  const canEdit = can(currentUser, 'ACCOUNTS', 'edit');
  const canResetPassword = can(currentUser, 'ACCOUNTS', 'reset_password');
  const canImpersonate = can(currentUser, 'ACCOUNTS', 'impersonate');
  const isAdmin = currentUser?.permissions === 'ALL';

  const load = async () => {
    setLoading(true);
    try {
      const [list, roleRes] = await Promise.all([apiRequest('/api/users'), apiRequest('/api/roles')]);
      setAccounts(list);
      setRoles(roleRes.roles);
      setModules(roleRes.modules);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const roleByKey = useMemo(() => new Map(roles.map((r) => [r.key, r])), [roles]);
  const assignableRoles = roles.filter((r) => isAdmin || r.key !== 'ADMIN');

  const kpis = useMemo(() => {
    const st = accounts.map(accountStatus);
    return {
      active: st.filter((s) => s.key === 'ACTIVE').length,
      pending: st.filter((s) => s.key === 'PENDING').length,
      inactive: st.filter((s) => s.key === 'INACTIVE').length,
      expiring: accounts.filter((u) => u.active && u.access_expires_at && daysUntil(u.access_expires_at) >= 0 && daysUntil(u.access_expires_at) <= 30).length,
      recent: accounts.filter((u) => u.last_login_at && (new Date() - new Date(u.last_login_at)) / 86400000 <= 30).length
    };
  }, [accounts]);

  const filtered = accounts.filter((u) => {
    const st = accountStatus(u).key;
    if (statusFilter === 'ACTIVE_PENDING' && st === 'INACTIVE') return false;
    if (['ACTIVE', 'PENDING', 'INACTIVE'].includes(statusFilter) && st !== statusFilter) return false;
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (projectFilter !== 'ALL' && !(u.role === 'ADMIN' || (u.projects || []).some((p) => String(p.id) === projectFilter))) {
      return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [u.name, u.display_name, u.email, u.cpf, u.job_title, u.company].some((v) =>
      String(v || '').toLowerCase().includes(q)
    );
  });

  const openNew = () => {
    setForm({ ...emptyForm, role: assignableRoles.find((r) => r.key === 'ENGENHEIRO') ? 'ENGENHEIRO' : assignableRoles[0]?.key || '' });
    setNewPassword('');
    setError('');
    setNotice('');
    setMode('FORM');
  };

  const openEdit = (u) => {
    setForm(formFromAccount(u));
    setNewPassword('');
    setError('');
    setNotice('');
    setMode('FORM');
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setAssignment = (pid, patch) =>
    setForm((f) => ({
      ...f,
      assignments: { ...f.assignments, [pid]: { checked: false, role_in_project: '', since_date: '', ...f.assignments[pid], ...patch } }
    }));

  const handleImage = async (e, field) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readImage(file, field === 'avatar' ? { maxSide: 400, type: 'image/jpeg' } : { maxSide: 900, type: 'image/png' });
      set(field === 'avatar' ? { avatar_base64: dataUrl } : { signature_base64: dataUrl });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const assignments = Object.entries(form.assignments)
      .filter(([, a]) => a.checked)
      .map(([pid, a]) => ({ project_id: Number(pid), role_in_project: a.role_in_project, since_date: a.since_date }));
    const body = {
      name: form.name,
      display_name: form.display_name,
      cpf: form.cpf,
      birth_date: form.birth_date,
      email: form.email,
      phone: form.phone,
      phone_alt: form.phone_alt,
      employment_type: form.employment_type,
      company: form.company,
      job_title: form.job_title,
      registration_number: form.registration_number,
      council: form.council,
      council_number: form.council_number,
      council_uf: form.council ? form.council_uf : '',
      crea_cft: form.council && form.council_number ? `${form.council}-${form.council_uf} ${form.council_number}` : '',
      role: form.role,
      access_expires_at: form.access_expires_at,
      notes: form.notes,
      active: form.active,
      assignments
    };
    if (form.avatar_base64) body.avatar_base64 = form.avatar_base64;
    if (form.signature_base64) body.signature_base64 = form.signature_base64;
    if (form.id && !form.avatar_url && !form.avatar_base64) body.avatar_url = '';
    if (form.id && !form.signature_url && !form.signature_base64) body.signature_url = '';
    if (!form.id) {
      body.first_access = form.first_access;
      if (form.first_access === 'PASSWORD') body.password = form.password;
    }

    try {
      const saved = form.id
        ? await apiRequest(`/api/users/${form.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(body) });
      await load();
      if (onAccountsChanged) onAccountsChanged();
      setMode('LIST');
      setNotice(
        saved.inviteWarning ||
          (form.id
            ? `Conta de ${saved.name} atualizada.`
            : form.first_access === 'INVITE'
            ? `Conta criada. Convite enviado para ${saved.email}.`
            : `Conta criada. ${saved.name} deverá trocar a senha no primeiro acesso.`)
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvite = async () => {
    try {
      const res = await apiRequest(`/api/users/${form.id}/invite`, { method: 'POST' });
      setNotice(res.message);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    try {
      await apiRequest(`/api/users/${form.id}/password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
      setNewPassword('');
      setNotice('Nova senha definida. A pessoa deverá trocá-la no próximo acesso.');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const messages = (
    <>
      {error && <p className="text-sm rounded-xl p-3 bg-rose-50 border border-rose-200 text-rose-800">{error}</p>}
      {notice && <p className="text-sm rounded-xl p-3 bg-emerald-50 border border-emerald-200 text-emerald-800">{notice}</p>}
    </>
  );

  // ==========================================================================
  // FORMULÁRIO COMPLETO
  // ==========================================================================
  if (mode === 'FORM') {
    const selectedRole = roleByKey.get(form.role);
    const summary = permissionSummary(selectedRole, modules);
    const isSelf = form.id === currentUser?.id;
    const readOnly = form.id ? !canEdit : !canCreate;
    const editingAdminAsNonAdmin = form.id && form.role === 'ADMIN' && !isAdmin;
    const disabled = readOnly || editingAdminAsNonAdmin;
    const avatarSrc = form.avatar_base64 || form.avatar_url;
    const signatureSrc = form.signature_base64 || form.signature_url;
    const section = (num, title, children, extra) => (
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-slate-900 text-amber-400 text-xs font-extrabold flex items-center justify-center">{num}</span>
            <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          </div>
          {extra}
        </div>
        {children}
      </section>
    );

    return (
      <form onSubmit={handleSave} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => setMode('LIST')} className="text-sm font-semibold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Gestão de Contas
            </button>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-1">{form.id ? `Editar conta: ${form.name}` : 'Cadastrar nova conta'}</h2>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setMode('LIST')} className="h-11 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800">
              Cancelar
            </button>
            {!disabled && (
              <button type="submit" disabled={saving} className="h-11 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-sm font-bold inline-flex items-center gap-1.5">
                <Save className="w-4 h-4" />
                {saving ? 'Salvando...' : form.id ? 'Salvar alterações' : form.first_access === 'INVITE' ? 'Salvar e enviar convite' : 'Salvar conta'}
              </button>
            )}
          </div>
        </div>

        {messages}
        {editingAdminAsNonAdmin && (
          <p className="text-sm rounded-xl p-3 bg-slate-100 border border-slate-200 text-slate-700">
            Contas de Administrador só podem ser alteradas por um Administrador.
          </p>
        )}

        <div className="flex flex-col xl:flex-row gap-5 items-start min-w-0">
          <fieldset disabled={disabled} className="flex-1 min-w-0 w-full space-y-5 border-0 p-0 m-0">
            {section(
              1,
              'Dados pessoais',
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className={`${labelClass} md:col-span-3`}>
                  Nome completo *
                  <input required value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} placeholder="Ex.: Rafael Tonin" />
                </label>
                <label className={labelClass}>
                  Nome de exibição
                  <input value={form.display_name} onChange={(e) => set({ display_name: e.target.value })} className={inputClass} placeholder="Como aparece no RDO e relatórios" />
                </label>
                <label className={labelClass}>
                  CPF
                  <input inputMode="numeric" value={form.cpf} onChange={(e) => set({ cpf: e.target.value })} className={inputClass} placeholder="000.000.000-00" />
                </label>
                <label className={labelClass}>
                  Data de nascimento
                  <input type="date" value={form.birth_date} onChange={(e) => set({ birth_date: e.target.value })} className={inputClass} />
                </label>
              </div>
            )}

            {section(
              2,
              'Contato',
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className={labelClass}>
                  E-mail de acesso *
                  <input type="email" required value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputClass} placeholder="nome@empresa.com.br" />
                  <span className="font-normal text-slate-600">Usado no login e no envio de códigos.</span>
                </label>
                <label className={labelClass}>
                  Celular / WhatsApp
                  <input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={inputClass} placeholder="(44) 99999-0000" />
                </label>
                <label className={labelClass}>
                  Telefone alternativo
                  <input type="tel" value={form.phone_alt} onChange={(e) => set({ phone_alt: e.target.value })} className={inputClass} placeholder="(44) 3000-0000" />
                </label>
              </div>
            )}

            {section(
              3,
              'Dados profissionais',
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className={labelClass}>
                    Vínculo
                    <select value={form.employment_type} onChange={(e) => set({ employment_type: e.target.value })} className={inputClass}>
                      {EMPLOYMENT_TYPES.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Empresa
                    <input value={form.company} onChange={(e) => set({ company: e.target.value })} className={inputClass} placeholder="Razão social ou nome da empresa" />
                  </label>
                  <label className={labelClass}>
                    Cargo / Função
                    <input value={form.job_title} onChange={(e) => set({ job_title: e.target.value })} className={inputClass} placeholder="Ex.: Técnico de Segurança do Trabalho" />
                  </label>
                  <label className={labelClass}>
                    Matrícula interna
                    <input value={form.registration_number} onChange={(e) => set({ registration_number: e.target.value })} className={inputClass} placeholder="Opcional" />
                  </label>
                </div>
                <fieldset className="border border-slate-200 rounded-xl px-4 pb-4 pt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <legend className="text-xs font-bold text-slate-700 px-1.5">Registro profissional</legend>
                  <label className={labelClass}>
                    Conselho
                    <select value={form.council} onChange={(e) => set({ council: e.target.value })} className={inputClass}>
                      {COUNCILS.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Número
                    <input value={form.council_number} disabled={!form.council} onChange={(e) => set({ council_number: e.target.value })} className={inputClass} placeholder="Nº do registro" />
                  </label>
                  <label className={labelClass}>
                    UF
                    <select value={form.council_uf} disabled={!form.council} onChange={(e) => set({ council_uf: e.target.value })} className={inputClass}>
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              </>
            )}

            {section(
              4,
              'Acesso ao sistema',
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className={labelClass}>
                    Perfil de acesso *
                    <select
                      required
                      value={form.role}
                      disabled={isSelf}
                      onChange={(e) => set({ role: e.target.value })}
                      className={`${inputClass} border-2 border-amber-500 bg-amber-50 font-semibold`}
                    >
                      {(editingAdminAsNonAdmin ? roles : assignableRoles).map((r) => (
                        <option key={r.key} value={r.key}>{r.name}</option>
                      ))}
                    </select>
                    <span className="font-normal text-slate-600">
                      {isSelf ? 'Você não pode alterar o próprio perfil.' : 'Os perfis são configurados em Configurações › Perfis de Acesso.'}
                    </span>
                  </label>
                  <label className={labelClass}>
                    Acesso válido até
                    <input type="date" value={form.access_expires_at} onChange={(e) => set({ access_expires_at: e.target.value })} className={inputClass} />
                    <span className="font-normal text-slate-600">Opcional. Útil para terceirizados: o acesso termina nessa data.</span>
                  </label>
                </div>

                {!form.id && (
                  <fieldset className="space-y-2.5">
                    <legend className="text-xs font-bold text-slate-700 mb-2">Primeiro acesso</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        ['INVITE', 'Enviar convite por e-mail (recomendado)', 'A pessoa recebe um link e cria a própria senha. Ninguém mais conhece a senha.'],
                        ['PASSWORD', 'Definir senha agora', 'Para quem não tem e-mail no canteiro. Será pedida a troca no primeiro login.']
                      ].map(([v, t, d]) => (
                        <label
                          key={v}
                          className={`flex gap-3 items-start rounded-xl p-3.5 text-sm text-slate-900 cursor-pointer ${
                            form.first_access === v ? 'border-2 border-amber-500 bg-amber-50' : 'border border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="first_access"
                            checked={form.first_access === v}
                            onChange={() => set({ first_access: v })}
                            className="w-[18px] h-[18px] mt-0.5 accent-amber-600"
                          />
                          <span>
                            <b>{t}</b>
                            <span className="block text-slate-600 mt-0.5">{d}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {form.first_access === 'PASSWORD' && (
                      <label className={`${labelClass} md:w-1/2`}>
                        Senha inicial (mínimo 6 caracteres) *
                        <input type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={(e) => set({ password: e.target.value })} className={inputClass} />
                      </label>
                    )}
                  </fieldset>
                )}
              </>
            )}

            {section(
              5,
              'Obras vinculadas',
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                {form.role === 'ADMIN' || selectedRole?.scope === 'ALL' ? (
                  <p className="p-4 text-sm text-slate-700">Este perfil tem acesso a <b>todas as obras</b>; não é preciso vincular.</p>
                ) : (
                  <table className="w-full min-w-[640px] text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-[11px] tracking-wider text-slate-600 bg-slate-50">
                        <th scope="col" className="px-3.5 py-2.5 font-bold w-20">VINCULAR</th>
                        <th scope="col" className="px-3.5 py-2.5 font-bold">OBRA</th>
                        <th scope="col" className="px-3.5 py-2.5 font-bold">FUNÇÃO NA OBRA</th>
                        <th scope="col" className="px-3.5 py-2.5 font-bold">DESDE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => {
                        const a = form.assignments[p.id] || {};
                        return (
                          <tr key={p.id} className={`border-t border-slate-200 ${a.checked ? 'bg-amber-50' : ''}`}>
                            <td className="px-3.5 py-2.5">
                              <input
                                type="checkbox"
                                aria-label={`Vincular ${p.code}`}
                                checked={Boolean(a.checked)}
                                onChange={(e) => setAssignment(p.id, { checked: e.target.checked })}
                                className="w-5 h-5 accent-amber-600"
                              />
                            </td>
                            <td className="px-3.5 py-2.5">
                              <b>{p.code}</b> — {p.name}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <input
                                aria-label={`Função na obra ${p.code}`}
                                disabled={!a.checked}
                                value={a.role_in_project || ''}
                                onChange={(e) => setAssignment(p.id, { role_in_project: e.target.value })}
                                placeholder={a.checked ? 'Ex.: Encarregado da frente norte' : '—'}
                                className="w-full h-9 px-2.5 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50"
                              />
                            </td>
                            <td className="px-3.5 py-2.5">
                              <input
                                type="date"
                                aria-label={`Vinculado à obra ${p.code} desde`}
                                disabled={!a.checked}
                                value={a.since_date || ''}
                                onChange={(e) => setAssignment(p.id, { since_date: e.target.value })}
                                className="h-9 px-2.5 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>,
              <span className="text-xs text-slate-600">O perfil define o que a pessoa pode fazer; as obras definem onde.</span>
            )}

            {section(
              6,
              'Documentos e assinatura',
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-slate-700">Assinatura para RDO e relatórios</span>
                  {signatureSrc ? (
                    <div className="relative h-24 rounded-xl border border-slate-200 bg-white flex items-center justify-center">
                      <img src={signatureSrc} alt="Assinatura" className="max-h-20 max-w-full object-contain" />
                      <button type="button" onClick={() => set({ signature_base64: '', signature_url: '' })} aria-label="Remover assinatura" className="absolute top-1.5 right-1.5 p-1 rounded bg-white border border-slate-200 text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="h-24 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-100">
                      <Upload className="w-4 h-4" /> Enviar imagem da assinatura (PNG)
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => handleImage(e, 'signature')} />
                    </label>
                  )}
                </div>
                <label className={labelClass}>
                  Observações internas
                  <textarea rows={4} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="px-3 py-2.5 rounded-lg border border-slate-300 text-sm resize-y" placeholder="Ex.: substituto do técnico titular durante as férias" />
                </label>
              </div>
            )}
          </fieldset>

          <aside className="w-full xl:w-80 shrink-0 space-y-4">
            <fieldset disabled={disabled} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col items-center gap-3 text-center m-0">
              {avatarSrc ? (
                <img src={avatarSrc} alt={`Foto de ${form.name || 'usuário'}`} className="w-[88px] h-[88px] rounded-full object-cover" />
              ) : (
                <div className="w-[88px] h-[88px] rounded-full bg-slate-900 text-amber-400 text-3xl font-extrabold flex items-center justify-center">
                  {initials(form.name) || '?'}
                </div>
              )}
              <div className="flex gap-2">
                <label className="h-10 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 inline-flex items-center cursor-pointer">
                  {avatarSrc ? 'Trocar foto' : 'Enviar foto'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => handleImage(e, 'avatar')} />
                </label>
                {avatarSrc && (
                  <button type="button" onClick={() => set({ avatar_base64: '', avatar_url: '' })} className="h-10 px-3 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">
                    Remover
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
                <input type="checkbox" checked={form.active} disabled={isSelf} onChange={(e) => set({ active: e.target.checked })} className="w-5 h-5 accent-emerald-700" />
                Conta ativa
              </label>
              {form.id && (
                <p className="text-xs text-slate-600">
                  Último acesso: {lastAccessText(form.last_login_at)}
                  {form.invite_pending ? ' · Convite pendente' : ''}
                </p>
              )}
            </fieldset>

            <section className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold tracking-wide text-slate-300">PERFIL SELECIONADO</span>
                {selectedRole && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg text-white" style={{ background: selectedRole.color }}>
                    {selectedRole.name}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300">
                {selectedRole?.scope === 'ALL' || selectedRole?.key === 'ADMIN' ? 'Todas as obras.' : 'Somente nas obras vinculadas.'} O que este perfil permite:
              </p>
              <ul className="space-y-1.5 text-sm">
                {summary.map((s) => (
                  <li key={s.label} className="flex justify-between gap-2">
                    <span className="text-slate-200">{s.label}</span>
                    <b className={s.tone}>{s.level}</b>
                  </li>
                ))}
              </ul>
            </section>

            {form.id && !isSelf && (canEdit || canResetPassword || canImpersonate) && (
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <span className="text-xs font-bold tracking-wide text-slate-600">AÇÕES DA CONTA</span>
                {canEdit && form.invite_pending && form.active ? (
                  <button type="button" onClick={handleResendInvite} className="w-full h-10 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-2">
                    <Mail className="w-4 h-4" /> Reenviar convite
                  </button>
                ) : null}
                {canImpersonate && form.active && (isAdmin || form.role !== 'ADMIN') && onImpersonate && (
                  <button type="button" onClick={() => onImpersonate(form.id)} className="w-full h-10 rounded-lg bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
                    <Eye className="w-4 h-4" /> Simular acesso
                  </button>
                )}
                {canResetPassword && (isAdmin || form.role !== 'ADMIN') && (
                  <div className="space-y-1.5">
                    <label htmlFor="nova-senha-conta" className="text-xs font-semibold text-slate-700">Definir nova senha</label>
                    <div className="flex gap-2">
                      <input id="nova-senha-conta" type="password" minLength={6} autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
                      <button type="button" onClick={handleSetPassword} aria-label="Definir nova senha" className="shrink-0 h-11 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white">
                        <KeyRound className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600">A pessoa deverá trocá-la no próximo acesso.</p>
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      </form>
    );
  }

  // ==========================================================================
  // LISTA DE CONTAS
  // ==========================================================================
  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-amber-700">MÓDULO 9</span>
          <h2 className="text-2xl font-extrabold text-slate-900">Gestão de Contas</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Cadastro completo das pessoas que acessam o sistema, perfil de acesso, obras vinculadas e situação da conta.
          </p>
        </div>
        {canCreate && (
          <button type="button" onClick={openNew} className="h-11 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nova conta
          </button>
        )}
      </section>

      {messages}

      <section aria-label="Indicadores" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          ['Contas ativas', kpis.active, `Acessaram nos últimos 30 dias: ${kpis.recent}`, 'text-emerald-700'],
          ['Convites pendentes', kpis.pending, 'Aguardando primeiro acesso', 'text-amber-700'],
          ['Contas inativas', kpis.inactive, 'Histórico preservado', 'text-slate-600'],
          ['Acessos expirando', kpis.expiring, 'Nos próximos 30 dias', 'text-rose-700']
        ].map(([label, value, hint, tone]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <span className="text-xs font-semibold text-slate-600">{label}</span>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">{value}</p>
            <span className={`text-xs font-semibold ${tone}`}>{hint}</span>
          </div>
        ))}
      </section>

      <section aria-label="Filtros" className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1.3fr] gap-3">
        <label className={labelClass}>
          Buscar
          <span className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, e-mail, CPF, cargo ou empresa" className={`${inputClass} pl-9`} />
          </span>
        </label>
        <label className={labelClass}>
          Perfil de acesso
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={inputClass}>
            <option value="ALL">Todos os perfis</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Situação
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
            <option value="ACTIVE_PENDING">Ativas e pendentes</option>
            <option value="ACTIVE">Ativas</option>
            <option value="PENDING">Convite pendente</option>
            <option value="INACTIVE">Inativas</option>
            <option value="ALL">Todas</option>
          </select>
        </label>
        <label className={labelClass}>
          Obra
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={inputClass}>
            <option value="ALL">Todas as obras</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.code} — {p.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] tracking-wider text-slate-600">
                {['USUÁRIO', 'CARGO / EMPRESA', 'PERFIL DE ACESSO', 'OBRAS', 'ÚLTIMO ACESSO', 'SITUAÇÃO'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-bold">{h}</th>
                ))}
                <th scope="col" className="px-4 py-3 font-bold text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Carregando contas...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nenhuma conta encontrada com estes filtros.</td>
                </tr>
              )}
              {filtered.map((u) => {
                const st = accountStatus(u);
                const role = roleByKey.get(u.role) || u.role_info;
                const isSelf = u.id === currentUser?.id;
                const expDays = daysUntil(u.access_expires_at);
                return (
                  <tr key={u.id} className={`border-t border-slate-200 ${isSelf ? 'bg-amber-50' : st.key === 'INACTIVE' ? 'bg-slate-50' : ''}`}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <span className="w-9 h-9 rounded-full text-xs font-extrabold flex items-center justify-center text-white shrink-0" style={{ background: st.key === 'INACTIVE' ? '#94a3b8' : role?.color || '#475569' }}>
                            {initials(u.name)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <span className={`font-bold ${st.key === 'INACTIVE' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                            {u.display_name || u.name}
                          </span>
                          {isSelf && <span className="ml-1.5 text-[10px] font-extrabold bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-full">VOCÊ</span>}
                          <span className="block text-xs text-slate-600 truncate">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-slate-800">{u.job_title || '—'}</span>
                      <span className="block text-xs text-slate-600">{u.company || EMPLOYMENT_TYPES.find(([v]) => v === u.employment_type)?.[1] || ''}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg text-white whitespace-nowrap" style={{ background: st.key === 'INACTIVE' ? '#94a3b8' : role?.color || '#475569' }}>
                        {role?.name || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      {u.role === 'ADMIN' || role?.scope === 'ALL' ? 'Todas' : (u.projects || []).length}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{lastAccessText(u.last_login_at)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-bold ${st.className}`}>● {st.label}</span>
                      {u.active && expDays !== null && expDays >= 0 && expDays <= 30 && (
                        <span className="block text-[11px] font-semibold text-rose-700">Acesso até {formatDateBR(u.access_expires_at)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button type="button" onClick={() => openEdit(u)} className="h-9 px-3 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-800 text-sm font-semibold">
                        {canEdit ? 'Editar' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-between gap-3 px-4 py-3.5 border-t border-slate-200 text-xs text-slate-600">
          <span>Mostrando {filtered.length} de {accounts.length} contas</span>
          <span>Ao desativar uma conta, os registros feitos por ela (fotos, RDOs, ocorrências) continuam no sistema.</span>
        </div>
      </section>
    </div>
  );
}
