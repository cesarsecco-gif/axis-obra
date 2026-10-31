import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Plus,
  Edit3,
  Trash2,
  Building2,
  X,
  CheckCircle2,
  AlertCircle,
  Settings,
  Truck
} from 'lucide-react';
import { apiRequest, formatCurrency, formatDateBR } from '../api';

const CATEGORIES = [
  { value: 'PESADO', label: 'Linha Amarela / Pesado (Escavadeira, Compactador)' },
  { value: 'ELEVACAO', label: 'Transporte Vertical (Grua, Cremalheira, Plataforma)' },
  { value: 'CONCRETAGEM', label: 'Concretagem (Betoneira, Vibrador, Bomba)' },
  { value: 'ELETRICO', label: 'Ferramental Elétrico / Gerador / Solda' },
  { value: 'ANDAIME_ESCORAMENTO', label: 'Andaimes / Escoramento Metálico' },
  { value: 'MEDICAO', label: 'Topografia e Medição (Estação Total, Nível Laser)' },
  { value: 'SEGURANCA', label: 'Proteção Coletiva (EPC / Linha de Vida)' },
  { value: 'OUTROS', label: 'Outros Equipamentos' }
];

const STATUS_CONFIG = {
  OPERACIONAL: { label: 'Em Operação', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  DISPONIVEL: { label: 'Disponível (Almoxarifado)', badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  EM_MANUTENCAO: { label: 'Em Manutenção', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  INDISPONIVEL: { label: 'Indisponível / Bloqueado', badge: 'bg-rose-100 text-rose-800 border-rose-300' }
};

export default function EquipmentsView({ projects, selectedProjectId, onRefreshDashboard }) {
  const [equipments, setEquipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [error, setError] = useState('');

  const initialForm = {
    code: '',
    name: '',
    category: 'PESADO',
    brand: '',
    model: '',
    serial_number: '',
    ownership: 'PROPRIO',
    supplier: 'Patrimônio Axis',
    daily_cost: 150,
    status: 'OPERACIONAL',
    last_maintenance: new Date().toISOString().slice(0, 10),
    next_maintenance: '2026-12-15',
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
    notes: ''
  };

  const [form, setForm] = useState(initialForm);

  const loadEquipments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'ALL') params.set('projectId', selectedProjectId);
      const data = await apiRequest(`/api/equipments?${params.toString()}`);
      setEquipments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEquipments();
  }, [selectedProjectId]);

  const openCreateModal = () => {
    setEditingItem(null);
    setError('');
    setForm({
      ...initialForm,
      code: `EQP-00${equipments.length + 8}`,
      project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
    });
    setShowModal(true);
  };

  const openEditModal = (eq) => {
    setEditingItem(eq);
    setError('');
    setForm({
      code: eq.code,
      name: eq.name,
      category: eq.category,
      brand: eq.brand || '',
      model: eq.model || '',
      serial_number: eq.serial_number || '',
      ownership: eq.ownership || 'PROPRIO',
      supplier: eq.supplier || '',
      daily_cost: eq.daily_cost || 0,
      status: eq.status || 'OPERACIONAL',
      last_maintenance: eq.last_maintenance || '',
      next_maintenance: eq.next_maintenance || '',
      project_id: eq.project_id || '',
      notes: eq.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingItem) {
        await apiRequest(`/api/equipments/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });
      } else {
        await apiRequest('/api/equipments', {
          method: 'POST',
          body: JSON.stringify(form)
        });
      }
      setShowModal(false);
      await loadEquipments();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este equipamento do sistema?')) return;
    try {
      await apiRequest(`/api/equipments/${id}`, { method: 'DELETE' });
      await loadEquipments();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = equipments.filter((eq) => {
    if (categoryFilter !== 'ALL' && eq.category !== categoryFilter) return false;
    if (statusFilter !== 'ALL' && eq.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      eq.code?.toLowerCase().includes(q) ||
      eq.name?.toLowerCase().includes(q) ||
      eq.brand?.toLowerCase().includes(q) ||
      eq.model?.toLowerCase().includes(q) ||
      eq.supplier?.toLowerCase().includes(q)
    );
  });

  const operationalCount = filtered.filter((e) => e.status === 'OPERACIONAL').length;
  const maintenanceCount = filtered.filter((e) => e.status === 'EM_MANUTENCAO').length;
  const rentedCount = filtered.filter((e) => e.ownership === 'LOCADO').length;
  const totalDailyCost = filtered
    .filter((e) => e.status === 'OPERACIONAL' || e.ownership === 'LOCADO')
    .reduce((acc, cur) => acc + (Number(cur.daily_cost) || 0), 0);

  const getCategoryLabel = (val) => CATEGORIES.find((c) => c.value === val)?.label.split(' (')[0] || val;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600">
              <Wrench className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">4. Cadastro de Equipamentos e Maquinário</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Controle patrimonial e de locação de máquinas pesadas, gruas, betoneiras, manutenção preventiva e alocação em obras.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Equipamento
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total de Equipamentos</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{filtered.length}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
            <Truck className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Em Operação</p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">{operationalCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Em Manutenção / Locados</p>
            <p className="text-2xl font-bold text-amber-600 mt-0.5">
              {maintenanceCount} <span className="text-sm font-normal text-slate-400">/</span> {rentedCount} locados
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
            <Settings className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Custo Diário do Parque</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{formatCurrency(totalDailyCost)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-50 text-cyan-600">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <input
          type="text"
          placeholder="Buscar por TAG/Código, nome, marca, modelo ou locadora..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-500"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">Todas as Categorias</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">Todos os Status Operacionais</option>
          <option value="OPERACIONAL">Em Operação</option>
          <option value="DISPONIVEL">Disponível</option>
          <option value="EM_MANUTENCAO">Em Manutenção</option>
          <option value="INDISPONIVEL">Indisponível</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-500">Carregando parque de equipamentos...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 p-6">
            <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Nenhum equipamento encontrado</h3>
            <p className="text-sm text-slate-500 mt-1">
              Cadastre novos equipamentos ou ajuste os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">TAG / Equipamento</th>
                  <th className="py-3.5 px-4">Marca / Modelo / Série</th>
                  <th className="py-3.5 px-4">Propriedade / Locadora</th>
                  <th className="py-3.5 px-4">Obra Alocada</th>
                  <th className="py-3.5 px-4">Manutenção Preventiva</th>
                  <th className="py-3.5 px-4">Custo/Dia</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((eq) => {
                  const st = STATUS_CONFIG[eq.status] || STATUS_CONFIG.OPERACIONAL;
                  return (
                    <tr key={eq.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-400 font-mono text-xs font-bold">
                            {eq.code}
                          </span>
                          <span className="font-bold text-slate-900">{eq.name}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{getCategoryLabel(eq.category)}</div>
                        {eq.notes && <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{eq.notes}</div>}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">
                          {eq.brand || '—'} {eq.model ? `• ${eq.model}` : ''}
                        </div>
                        {eq.serial_number && (
                          <div className="text-xs text-slate-400 font-mono">S/N: {eq.serial_number}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            eq.ownership === 'LOCADO'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {eq.ownership === 'LOCADO' ? 'LOCADO' : 'PRÓPRIO'}
                        </span>
                        <div className="text-xs text-slate-500 mt-0.5">{eq.supplier || 'Patrimônio Axis'}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        {eq.project_name ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Building2 className="w-3.5 h-3.5" />
                            {eq.project_code} — {eq.project_name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Pátio Central</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="text-slate-600">Última: {formatDateBR(eq.last_maintenance)}</div>
                        <div className="font-semibold text-slate-800 mt-0.5">
                          Próxima: {formatDateBR(eq.next_maintenance)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800">{formatCurrency(eq.daily_cost)}</td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${st.badge}`}>
                          {st.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(eq)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                            title="Editar equipamento"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(eq.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Excluir equipamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                {editingItem ? 'Editar Equipamento' : 'Cadastrar Novo Equipamento'}
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
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código / TAG *</label>
                  <input
                    type="text"
                    required
                    placeholder="EQP-008"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome / Descrição do Equipamento *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Retroescavadeira 4x4 ou Gerador Diesel 150 kVA"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fabricante / Marca</label>
                  <input
                    type="text"
                    placeholder="Ex: Caterpillar, Bosch..."
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Modelo</label>
                  <input
                    type="text"
                    placeholder="Ex: 416F2"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nº de Série</label>
                  <input
                    type="text"
                    placeholder="S/N"
                    value={form.serial_number}
                    onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Propriedade</label>
                  <select
                    value={form.ownership}
                    onChange={(e) => setForm({ ...form, ownership: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="PROPRIO">Patrimônio Próprio</option>
                    <option value="LOCADO">Equipamento Locado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fornecedor / Locadora</label>
                  <input
                    type="text"
                    placeholder="Nome da locadora"
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custo Diário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.daily_cost}
                    onChange={(e) => setForm({ ...form, daily_cost: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status Atual</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="OPERACIONAL">Em Operação</option>
                    <option value="DISPONIVEL">Disponível</option>
                    <option value="EM_MANUTENCAO">Em Manutenção</option>
                    <option value="INDISPONIVEL">Indisponível / Bloqueado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Última Manutenção</label>
                  <input
                    type="date"
                    value={form.last_maintenance}
                    onChange={(e) => setForm({ ...form, last_maintenance: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Próxima Preventiva</label>
                  <input
                    type="date"
                    value={form.next_maintenance}
                    onChange={(e) => setForm({ ...form, next_maintenance: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observações Técnicas / Laudo NR-12</label>
                <input
                  type="text"
                  placeholder="Observações sobre estado de conservação, horímetro ou manutenção..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
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
                  {editingItem ? 'Salvar Alterações' : 'Cadastrar Equipamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

