import React, { useState } from 'react';
import { X, Save, KeyRound, UserX, UserCheck } from 'lucide-react';
import { apiRequest } from '../api';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm';

// Edição de usuário pelo Administrador: dados, perfil, ativar/desativar e definição de nova senha.
export default function EditUserModal({ user, isSelf, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email || '',
    role: user.role || 'ENGENHEIRO',
    crea_cft: user.crea_cft || '',
    phone: user.phone || '',
    active: Boolean(user.active)
  });
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (data) => {
    setError('');
    setInfo('');
    setSaving(true);
    try {
      await apiRequest(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify(data) });
      onSaved();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (await save(form)) onClose();
  };

  const handleToggleActive = async () => {
    const next = !form.active;
    const msg = next
      ? `Reativar o acesso de ${user.name}?`
      : `Desativar ${user.name}? O usuário não conseguirá mais entrar no sistema (os registros dele são mantidos).`;
    if (!window.confirm(msg)) return;
    if (await save({ active: next })) {
      setForm((f) => ({ ...f, active: next }));
      setInfo(next ? 'Usuário reativado.' : 'Usuário desativado.');
    }
  };

  const handleSetPassword = async () => {
    setError('');
    setInfo('');
    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/users/${user.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword })
      });
      setNewPassword('');
      setInfo('Nova senha definida. Informe-a ao usuário.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 my-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-900">Editar Usuário</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <p className="mb-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>}
        {info && (
          <p className="mb-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">{info}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome completo *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Perfil de acesso</label>
              <select
                value={form.role}
                disabled={isSelf}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className={`${inputClass} bg-white disabled:bg-slate-100`}
              >
                <option value="ADMIN">Administrador Geral</option>
                <option value="ENGENHEIRO">Engenheiro Civil / Residente</option>
                <option value="ENCARREGADO">Mestre de Obras / Encarregado</option>
                <option value="FISCAL">Fiscal de Obra / Cliente (somente leitura)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CREA / CFT</label>
              <input value={form.crea_cft} onChange={(e) => setForm({ ...form, crea_cft: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-semibold text-sm inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> Salvar Alterações
            </button>
          </div>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-200 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Definir nova senha para o usuário</label>
            <div className="flex gap-2">
              <input
                type="password"
                minLength={6}
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                disabled={saving}
                onClick={handleSetPassword}
                className="shrink-0 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <KeyRound className="w-4 h-4" /> Definir
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              O usuário também pode criar a própria senha pela opção "Esqueci minha senha" na tela de login.
            </p>
          </div>

          {!isSelf && (
            <button
              type="button"
              disabled={saving}
              onClick={handleToggleActive}
              className={`w-full px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 border ${
                form.active
                  ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                  : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {form.active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
              {form.active ? 'Desativar usuário' : 'Reativar usuário'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
