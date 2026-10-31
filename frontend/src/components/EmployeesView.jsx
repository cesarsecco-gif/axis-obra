import React, { useState, useEffect } from 'react';
import {
  HardHat,
  Plus,
  Edit3,
  Trash2,
  Phone,
  ShieldCheck,
  Building2,
  X,
  UserCheck,
  Users,
  Briefcase
} from 'lucide-react';
import { apiRequest, formatCurrency, formatDateBR } from '../api';

const COMMON_ROLES = [
  'Mestre de Obras',
  'Pedreiro',
  'Pedreiro de Acabamento',
  'Carpinteiro de Formas',
  'Armador de Estrutura',
  'Eletricista Predial / Industrial',
  'Encanador / Bombeiro Hidráulico',
  'Operador de Grua / Guindaste',
  'Operador de Escavadeira / Máquinas',
  'Técnico de Segurança do Trabalho (TST)',
  'Apontador / Almoxarife',
  'Servente / Ajudante Geral',
  'Engenheiro Residente'
];

const STATUS_BADGES = {
  ATIVO: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  FERIAS: 'bg-amber-100 text-amber-800 border-amber-300',
  AFASTADO: 'bg-rose-100 text-rose-800 border-rose-300',
  INATIVO: 'bg-slate-100 text-slate-600 border-slate-300'
};

export default function EmployeesView({ projects, selectedProjectId, onRefreshDashboard }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [contractFilter, setContractFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [error, setError] = useState('');

  const initialForm = {
    name: '',
    cpf: '',
    registration_number: '',
    role: 'Pedreiro',
    contract_type: 'CLT',
    company: 'Axis Construtora',
    phone: '',
    daily_rate: 240,
    aso_expiry: '2027-06-30',
    nr_certifications: 'NR-18, NR-35',
    status: 'ATIVO',
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
  };

  const [form, setForm] = useState(initialForm);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'ALL') params.set('projectId', selectedProjectId);
      const data = await apiRequest(`/api/employees?${params.toString()}`);
      setEmployees(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [selectedProjectId]);

  const openCreateModal = () => {
    setEditingItem(null);
    setError('');
    setForm({
      ...initialForm,
      registration_number: `FUNC-0${employees.length + 10}`,
      project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
    });
    setShowModal(true);
  };

  const openEditModal = (emp) => {
    setEditingItem(emp);
    setError('');
    setForm({
      name: emp.name,
      cpf: emp.cpf,
      registration_number: emp.registration_number || '',
      role: emp.role,
      contract_type: emp.contract_type || 'CLT',
      company: emp.company || 'Axis Construtora',
      phone: emp.phone || '',
      daily_rate: emp.daily_rate || 0,
      aso_expiry: emp.aso_expiry || '',
      nr_certifications: emp.nr_certifications || '',
      status: emp.status || 'ATIVO',
      project_id: emp.project_id || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingItem) {
        await apiRequest(`/api/employees/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });
      } else {
        await apiRequest('/api/employees', {
          method: 'POST',
          body: JSON.stringify(form)
        });
      }
      setShowModal(false);
      await loadEmployees();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este funcionário do cadastro?')) return;
    try {
      await apiRequest(`/api/employees/${id}`, { method: 'DELETE' });
      await loadEmployees();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = employees.filter((e) => {
    if (contractFilter !== 'ALL' && e.contract_type !== contractFilter) return false;
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.name?.toLowerCase().includes(q) ||
      e.cpf?.toLowerCase().includes(q) ||
      e.role?.toLowerCase().includes(q) ||
      e.company?.toLowerCase().includes(q) ||
      e.registration_number?.toLowerCase().includes(q)
    );
  });

  const activeCount = filtered.filter((e) => e.status === 'ATIVO').length;
  const cltCount = filtered.filter((e) => e.contract_type === 'CLT').length;
  const thirdPartyCount = filtered.filter((e) => e.contract_type !== 'CLT').length;
  const dailyPayroll = filtered
    .filter((e) => e.status === 'ATIVO')
    .reduce((acc, cur) => acc + (Number(cur.daily_rate) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
              <HardHat className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">3. Cadastro de Funcionários e Efetivo de Obra</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gestão de colaboradores próprios (CLT) e empreiteiras terceirizadas, funções, ASO, NRs e alocação por obra.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Funcionário
        </button>
      </div>

      {/* Quick KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Cadastrados</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{filtered.length}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
            <Users className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Ativos em Campo</p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">{activeCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Próprios (CLT) / Terceiros</p>
            <p className="text-2xl font-bold text-indigo-600 mt-0.5">
              {cltCount} <span className="text-sm font-normal text-slate-400">/</span> {thirdPartyCount}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Custo Diário do Efetivo Ativo</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{formatCurrency(dailyPayroll)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
            <HardHat className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <input
          type="text"
          placeholder="Buscar por nome, CPF, matrícula, função ou empresa..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-500"
        />
        <select
          value={contractFilter}
          onChange={(e) => setContractFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">Todos os Regimes (CLT / Terceirizado / PJ)</option>
          <option value="CLT">Próprio (CLT)</option>
          <option value="TERCEIRIZADO">Terceirizado / Empreiteira</option>
          <option value="PJ">Prestador PJ</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">Todos os Status</option>
          <option value="ATIVO">Ativo</option>
          <option value="FERIAS">Em Férias</option>
          <option value="AFASTADO">Afastado</option>
          <option value="INATIVO">Inativo</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-500">Carregando quadro de funcionários...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 p-6">
            <HardHat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Nenhum funcionário encontrado</h3>
            <p className="text-sm text-slate-500 mt-1">
              Cadastre colaboradores ou altere os filtros de pesquisa.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Colaborador / CPF</th>
                  <th className="py-3.5 px-4">Função / Empresa</th>
                  <th className="py-3.5 px-4">Obra Alocada</th>
                  <th className="py-3.5 px-4">Segurança (ASO / NRs)</th>
                  <th className="py-3.5 px-4">Diária</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{emp.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>CPF: {emp.cpf}</span>
                        {emp.registration_number && (
                          <span className="px-1.5 py-0.2 bg-slate-100 rounded text-[11px] font-mono">
                            {emp.registration_number}
                          </span>
                        )}
                      </div>
                      {emp.phone && (
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {emp.phone}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{emp.role}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        <span className="font-medium text-indigo-700">{emp.contract_type}</span> • {emp.company}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {emp.project_name ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <Building2 className="w-3.5 h-3.5" />
                          {emp.project_code} — {emp.project_name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Não alocado</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {emp.nr_certifications || 'NR-18'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Validade ASO: {formatDateBR(emp.aso_expiry)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {formatCurrency(emp.daily_rate)}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          STATUS_BADGES[emp.status] || STATUS_BADGES.ATIVO
                        }`}
                      >
                        {emp.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                          title="Editar funcionário"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Excluir funcionário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editingItem ? 'Editar Cadastro de Funcionário' : 'Novo Cadastro de Funcionário'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João Carlos dos Santos"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">CPF *</label>
                  <input
                    type="text"
                    required
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Matrícula Interna</label>
                  <input
                    type="text"
                    placeholder="FUNC-010"
                    value={form.registration_number}
                    onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Função / Cargo na Obra *</label>
                  <input
                    type="text"
                    required
                    list="roles-list"
                    placeholder="Selecione ou digite a função..."
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                  <datalist id="roles-list">
                    {COMMON_ROLES.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vínculo Contratual</label>
                  <select
                    value={form.contract_type}
                    onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="CLT">Próprio (CLT)</option>
                    <option value="TERCEIRIZADO">Terceirizado / Empreiteira</option>
                    <option value="PJ">Prestador PJ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Empresa / Empreiteira</label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-0000"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valor da Diária (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.daily_rate}
                    onChange={(e) => setForm({ ...form, daily_rate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vencimento do ASO</label>
                  <input
                    type="date"
                    value={form.aso_expiry}
                    onChange={(e) => setForm({ ...form, aso_expiry: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Certificações NR</label>
                  <input
                    type="text"
                    placeholder="NR-10, NR-18, NR-35"
                    value={form.nr_certifications}
                    onChange={(e) => setForm({ ...form, nr_certifications: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Obra Alocada *</label>
                  <select
                    required
                    value={form.project_id}
                    onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="">Selecione a obra...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status Operacional</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="ATIVO">Ativo em Campo</option>
                    <option value="FERIAS">Em Férias</option>
                    <option value="AFASTADO">Afastado</option>
                    <option value="INATIVO">Inativo / Desligado</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm"
                >
                  {editingItem ? 'Salvar Alterações' : 'Cadastrar Funcionário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

