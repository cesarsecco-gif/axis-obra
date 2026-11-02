import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Check, Copy, Trash2, Save, Lock, Info } from 'lucide-react';
import { apiRequest } from '../api';

const SWATCHES = [
  ['Âmbar', '#f59e0b'],
  ['Índigo', '#4f46e5'],
  ['Verde', '#059669'],
  ['Roxo', '#7c3aed'],
  ['Rosa', '#db2777'],
  ['Ciano', '#0891b2'],
  ['Laranja', '#ea580c'],
  ['Cinza', '#475569']
];

const inputClass =
  'w-full h-11 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none';

function emptyPermissions(modules) {
  const out = {};
  modules.forEach((m) => {
    out[m.key] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      special: Object.fromEntries(m.specials.map((s) => [s.key, false]))
    };
  });
  return out;
}

function clonePermissions(perms, modules) {
  const base = emptyPermissions(modules);
  modules.forEach((m) => {
    const src = (perms && perms[m.key]) || {};
    base[m.key] = {
      view: Boolean(src.view),
      create: Boolean(src.create),
      edit: Boolean(src.edit),
      delete: Boolean(src.delete),
      special: Object.fromEntries(m.specials.map((s) => [s.key, Boolean(src.special && src.special[s.key])]))
    };
  });
  return base;
}

function draftFromRole(role, modules) {
  return {
    key: role.key,
    name: role.name,
    description: role.description || '',
    color: role.color || '#475569',
    scope: role.scope || 'LINKED',
    permissions: clonePermissions(role.permissions, modules)
  };
}

export default function RolesSettings({ currentUser }) {
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const load = async (keepKey) => {
    const res = await apiRequest('/api/roles');
    setRoles(res.roles);
    setModules(res.modules);
    const target = res.roles.find((r) => r.key === keepKey) || res.roles.find((r) => !r.is_system) || res.roles[1] || res.roles[0];
    if (target) {
      setSelectedKey(target.key);
      setDraft(draftFromRole(target, res.modules));
      setDirty(false);
    }
  };

  useEffect(() => {
    load().catch((err) => setMessage({ type: 'error', text: err.message }));
  }, []);

  const selectedRole = roles.find((r) => r.key === selectedKey) || null;
  const isAdminRole = draft?.key === 'ADMIN';
  const isOwnRole = draft?.key && draft.key === currentUser?.role && currentUser?.permissions !== 'ALL';
  const readOnly = isAdminRole || isOwnRole;

  const confirmDiscard = () => !dirty || window.confirm('Descartar as alterações não salvas deste perfil?');

  const selectRole = (role) => {
    if (role.key === selectedKey || !confirmDiscard()) return;
    setSelectedKey(role.key);
    setDraft(draftFromRole(role, modules));
    setDirty(false);
    setMessage({ type: '', text: '' });
  };

  const startNew = (base) => {
    if (!confirmDiscard()) return;
    setSelectedKey(null);
    setDraft({
      key: null,
      name: base ? `${base.name} (cópia)` : '',
      description: base ? base.description : '',
      color: base ? base.color : '#475569',
      scope: base ? base.scope : 'LINKED',
      permissions: base ? clonePermissions(base.permissions, modules) : emptyPermissions(modules)
    });
    setDirty(true);
    setMessage({ type: '', text: '' });
  };

  const update = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const togglePerm = (moduleKey, field) => {
    if (readOnly) return;
    setDraft((d) => {
      const perms = clonePermissions(d.permissions, modules);
      const mod = perms[moduleKey];
      const next = !mod[field];
      mod[field] = next;
      if (field === 'view' && !next) {
        // Sem "ver", nenhuma outra permissão do módulo vale
        mod.create = mod.edit = mod.delete = false;
        Object.keys(mod.special).forEach((k) => (mod.special[k] = false));
      }
      if (field !== 'view' && next) mod.view = true;
      return { ...d, permissions: perms };
    });
    setDirty(true);
  };

  const toggleSpecial = (moduleKey, specialKey) => {
    if (readOnly) return;
    setDraft((d) => {
      const perms = clonePermissions(d.permissions, modules);
      const mod = perms[moduleKey];
      mod.special[specialKey] = !mod.special[specialKey];
      if (mod.special[specialKey]) mod.view = true;
      return { ...d, permissions: perms };
    });
    setDirty(true);
  };

  const templates = useMemo(() => {
    const byKey = (k) => roles.find((r) => r.key === k);
    return [
      { label: 'Somente consulta', role: byKey('FISCAL') },
      { label: 'Operacional de campo', role: byKey('ENCARREGADO') },
      { label: 'Gestor da obra', role: byKey('ENGENHEIRO') }
    ].filter((t) => t.role);
  }, [roles]);

  const applyTemplate = (role) => {
    if (readOnly) return;
    update({ permissions: role ? clonePermissions(role.permissions, modules) : emptyPermissions(modules) });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const body = {
        name: draft.name,
        description: draft.description,
        color: draft.color,
        scope: draft.scope,
        permissions: draft.permissions
      };
      const saved = draft.key
        ? await apiRequest(`/api/roles/${draft.key}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiRequest('/api/roles', { method: 'POST', body: JSON.stringify(body) });
      await load(saved.key);
      setMessage({ type: 'success', text: 'Perfil salvo. As permissões já valem para as contas com este perfil.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!draft?.key || !window.confirm(`Excluir o perfil "${draft.name}"?`)) return;
    try {
      await apiRequest(`/api/roles/${draft.key}`, { method: 'DELETE' });
      await load();
      setMessage({ type: 'success', text: 'Perfil excluído.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (!draft) {
    return <div className="p-8 text-center text-sm text-slate-500">{message.text || 'Carregando perfis...'}</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      {/* Lista de perfis */}
      <section className="w-full lg:w-80 shrink-0 bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <h3 className="text-sm font-extrabold text-slate-900">Perfis</h3>
          <button
            type="button"
            onClick={() => startNew(null)}
            className="h-10 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Novo perfil
          </button>
        </div>
        {roles.map((r) => {
          const active = r.key === selectedKey;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => selectRole(r)}
              className={`w-full text-left rounded-xl px-3.5 py-3 border transition ${
                active ? 'border-2 border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: r.color }} />
                  {r.name}
                  {r.is_system && (
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">PADRÃO</span>
                  )}
                </span>
                <span className="text-xs text-slate-600 shrink-0">
                  {r.users_count} conta{r.users_count === 1 ? '' : 's'}
                </span>
              </span>
              {r.description && <span className="block text-xs text-slate-600 mt-1">{r.description}</span>}
            </button>
          );
        })}
        {!draft.key && (
          <div className="rounded-xl px-3.5 py-3 border-2 border-dashed border-amber-500 bg-amber-50 text-sm font-bold text-slate-900">
            {draft.name || 'Novo perfil'} <span className="text-xs font-semibold text-amber-800">(não salvo)</span>
          </div>
        )}
        <p className="text-xs text-slate-600 px-1 pt-1">
          Perfis padrão podem ser ajustados, mas não excluídos. O Administrador tem sempre acesso total.
        </p>
      </section>

      {/* Editor */}
      <section className="flex-1 min-w-0 w-full bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              {draft.key ? `Editar perfil: ${selectedRole?.name || draft.name}` : 'Novo perfil de acesso'}
            </h3>
            {selectedRole && (
              <p className="text-sm text-slate-600">
                Usado por {selectedRole.users_count} conta{selectedRole.users_count === 1 ? '' : 's'} ativa
                {selectedRole.users_count === 1 ? '' : 's'}
              </p>
            )}
          </div>
          {draft.key && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startNew(selectedRole)}
                className="h-10 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4" /> Duplicar
              </button>
              {!selectedRole?.is_system && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="h-10 px-3.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-sm font-semibold text-rose-700 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" /> Excluir perfil
                </button>
              )}
            </div>
          )}
        </div>

        {message.text && (
          <p
            className={`text-sm rounded-lg p-3 border ${
              message.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {message.text}
          </p>
        )}

        {readOnly && (
          <p className="flex items-start gap-2 text-sm rounded-lg p-3 bg-slate-100 border border-slate-200 text-slate-700">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
            {isAdminRole
              ? 'O perfil Administrador tem sempre acesso total a todas as obras e módulos e não pode ser alterado.'
              : 'Este é o seu próprio perfil. Por segurança, peça a um Administrador para alterá-lo.'}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            Nome do perfil *
            <input
              type="text"
              value={draft.name}
              disabled={readOnly}
              maxLength={60}
              onChange={(e) => update({ name: e.target.value })}
              className={`${inputClass} disabled:bg-slate-100`}
            />
          </label>
          <fieldset className="flex flex-col gap-1.5" disabled={readOnly}>
            <legend className="text-xs font-semibold text-slate-700 mb-1.5">Cor da etiqueta</legend>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map(([label, hex]) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Cor ${label}`}
                  aria-pressed={draft.color === hex}
                  onClick={() => update({ color: hex })}
                  className={`w-9 h-9 rounded-lg ${draft.color === hex ? 'ring-[3px] ring-slate-900 ring-offset-1' : 'border border-slate-200'}`}
                  style={{ background: hex }}
                />
              ))}
            </div>
          </fieldset>
          <label className="md:col-span-2 flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            Descrição
            <input
              type="text"
              value={draft.description}
              disabled={readOnly}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Ex.: Segurança do trabalho — ocorrências, fotos, ASO e NRs da equipe"
              className={`${inputClass} disabled:bg-slate-100`}
            />
          </label>
        </div>

        <fieldset className="border border-slate-200 rounded-xl px-4 py-3.5" disabled={readOnly}>
          <legend className="text-xs font-bold text-slate-700 px-1.5">Abrangência das obras</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <label className="flex items-start gap-2.5">
              <input
                type="radio"
                name="scope"
                checked={draft.scope === 'LINKED'}
                onChange={() => update({ scope: 'LINKED' })}
                className="w-[18px] h-[18px] mt-0.5 accent-amber-600"
              />
              <span>
                <b>Somente obras vinculadas</b>
                <span className="block text-slate-600">Vê apenas as obras marcadas na conta da pessoa.</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5">
              <input
                type="radio"
                name="scope"
                checked={draft.scope === 'ALL'}
                onChange={() => update({ scope: 'ALL' })}
                className="w-[18px] h-[18px] mt-0.5 accent-amber-600"
              />
              <span>
                <b>Todas as obras</b>
                <span className="block text-slate-600">Ex.: diretoria ou coordenação geral.</span>
              </span>
            </label>
          </div>
        </fieldset>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 mr-1">Aplicar modelo:</span>
            {templates.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => applyTemplate(t.role)}
                className="h-9 px-3 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyTemplate(null)}
              className="h-9 px-3 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
            >
              Limpar tudo
            </button>
          </div>
        )}

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full min-w-[820px] text-sm border-collapse">
            <caption className="text-left px-4 py-3 text-sm font-extrabold text-slate-900 bg-slate-50 border-b border-slate-200">
              Permissões por módulo
            </caption>
            <thead>
              <tr className="text-left text-[11px] tracking-wider text-slate-600 bg-slate-50">
                <th scope="col" className="px-4 py-2.5 font-bold">MÓDULO</th>
                {['VER', 'CRIAR', 'EDITAR', 'EXCLUIR'].map((h) => (
                  <th key={h} scope="col" className="px-2 py-2.5 font-bold text-center">
                    {h}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2.5 font-bold">AÇÕES ESPECIAIS</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => {
                const p = draft.permissions[m.key];
                const box = (field, label) => (
                  <td className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${label} — ${m.label}`}
                      checked={isAdminRole || Boolean(p[field])}
                      disabled={readOnly}
                      onChange={() => togglePerm(m.key, field)}
                      className="w-5 h-5 accent-amber-600"
                    />
                  </td>
                );
                return (
                  <tr key={m.key} className="border-t border-slate-200">
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-900">
                      {m.label}
                    </th>
                    {box('view', 'Ver')}
                    {m.crud ? (
                      <>
                        {box('create', 'Criar')}
                        {box('edit', 'Editar')}
                        {box('delete', 'Excluir')}
                      </>
                    ) : (
                      <td colSpan={3} className="px-2 py-3 text-center text-xs text-slate-600">
                        Somente visualização
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {m.specials.map((sp) => {
                          const on = isAdminRole || Boolean(p.special[sp.key]);
                          return (
                            <button
                              key={sp.key}
                              type="button"
                              aria-pressed={on}
                              disabled={readOnly}
                              onClick={() => toggleSpecial(m.key, sp.key)}
                              className={`h-[30px] px-2.5 rounded-full text-xs inline-flex items-center gap-1 border ${
                                on
                                  ? 'border-amber-500 bg-amber-100 text-amber-900 font-bold'
                                  : 'border-slate-300 bg-white text-slate-600 font-semibold hover:bg-slate-50'
                              }`}
                            >
                              {on && <Check className="w-3 h-3" />}
                              {sp.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-sm text-slate-700 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-slate-500" />
              As alterações valem imediatamente para as contas com este perfil.
            </span>
            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={!dirty}
                onClick={() => {
                  if (selectedRole) {
                    setDraft(draftFromRole(selectedRole, modules));
                    setDirty(false);
                  } else load();
                }}
                className="h-11 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-sm font-semibold text-slate-800"
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={handleSave}
                className="h-11 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-bold inline-flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar perfil'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
