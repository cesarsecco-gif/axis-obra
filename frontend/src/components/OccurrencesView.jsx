import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Plus,
  CheckCircle2,
  Clock,
  AlertOctagon,
  MapPin,
  Calendar,
  User,
  Edit3,
  Trash2,
  X,
  Building2,
  ShieldAlert
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';

const OCCURRENCE_TYPES = [
  { value: 'SEGURANCA', label: 'Segurança do Trabalho / Incidente' },
  { value: 'ATRASO_MATERIAL', label: 'Atraso de Entrega / Suprimentos' },
  { value: 'FALHA_EQUIPAMENTO', label: 'Falha / Manutenção de Equipamento' },
  { value: 'QUALIDADE', label: 'Qualidade / Não Conformidade Executiva' },
  { value: 'CLIMA', label: 'Intercorrência Climática / Drenagem' },
  { value: 'PROJETO', label: 'Interferência / Revisão de Projeto (RFI)' },
  { value: 'FISCALIZACAO', label: 'Vistoria / Notificação de Fiscalização' },
  { value: 'EFETIVO', label: 'Falta de Efetivo / Empreiteira' },
  { value: 'OUTROS', label: 'Outros' }
];

const SEVERITIES = {
  BAIXA: { label: 'Baixa', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  MEDIA: { label: 'Média', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  ALTA: { label: 'Alta', badge: 'bg-orange-100 text-orange-800 border-orange-300' },
  CRITICA: { label: 'Crítica', badge: 'bg-rose-100 text-rose-800 border-rose-300' }
};

const STATUSES = {
  ABERTA: { label: 'Aberta', badge: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertOctagon },
  EM_ANDAMENTO: { label: 'Em Tratamento', badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  RESOLVIDA: { label: 'Resolvida', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 }
};

export default function OccurrencesView({ projects, selectedProjectId, currentUser, onRefreshDashboard }) {
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [error, setError] = useState('');

  const initialForm = {
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
    title: '',
    type: 'SEGURANCA',
    severity: 'MEDIA',
    status: 'ABERTA',
    occurrence_date: new Date().toISOString().slice(0, 10),
    location_area: '',
    description: '',
    action_taken: '',
    responsible: currentUser?.name || ''
  };

  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (selectedProjectId !== 'ALL') {
      setForm((prev) => ({ ...prev, project_id: selectedProjectId }));
    } else if (!form.project_id && projects.length > 0) {
      setForm((prev) => ({ ...prev, project_id: projects[0].id }));
    }
  }, [selectedProjectId, projects]);

  const loadOccurrences = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'ALL') params.set('projectId', selectedProjectId);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (severityFilter !== 'ALL') params.set('severity', severityFilter);
      const data = await apiRequest(`/api/occurrences?${params.toString()}`);
      setOccurrences(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOccurrences();
  }, [selectedProjectId, statusFilter, severityFilter]);

  const openCreateModal = () => {
    setEditingItem(null);
    setError('');
    setForm({
      ...initialForm,
      project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
      responsible: currentUser?.name || ''
    });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setError('');
    setForm({
      project_id: item.project_id,
      title: item.title,
      type: item.type,
      severity: item.severity,
      status: item.status,
      occurrence_date: item.occurrence_date,
      location_area: item.location_area || '',
      description: item.description || '',
      action_taken: item.action_taken || '',
      responsible: item.responsible || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingItem) {
        await apiRequest(`/api/occurrences/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });
      } else {
        await apiRequest('/api/occurrences', {
          method: 'POST',
          body: JSON.stringify(form)
        });
      }
      setShowModal(false);
      await loadOccurrences();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleQuickStatus = async (item, newStatus) => {
    try {
      await apiRequest(`/api/occurrences/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...item, status: newStatus })
      });
      await loadOccurrences();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este registro de ocorrência?')) return;
    try {
      await apiRequest(`/api/occurrences/${id}`, { method: 'DELETE' });
      await loadOccurrences();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = occurrences.filter((oc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      oc.title?.toLowerCase().includes(q) ||
      oc.description?.toLowerCase().includes(q) ||
      oc.action_taken?.toLowerCase().includes(q) ||
      oc.project_name?.toLowerCase().includes(q) ||
      oc.responsible?.toLowerCase().includes(q)
    );
  });

  const getTypeLabel = (val) => OCCURRENCE_TYPES.find((t) => t.value === val)?.label || val;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">2. Registro de Ocorrências e Não Conformidades</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Controle diário de intercorrências de campo, segurança, suprimentos, falhas de equipamentos e ações corretivas.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Registrar Ocorrência
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <input
          type="text"
          placeholder="Pesquisar título, descrição, responsável ou providência..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">Todos os Status (Aberta / Em Tratamento / Resolvida)</option>
          <option value="ABERTA">Apenas Abertas</option>
          <option value="EM_ANDAMENTO">Em Tratamento</option>
          <option value="RESOLVIDA">Resolvidas</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">Todas as Severidades</option>
          <option value="CRITICA">Crítica</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>
      </div>

      {/* Occurrences List */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500">
          Carregando livro de ocorrências...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-xl border border-slate-200 p-6">
          <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">Nenhuma ocorrência encontrada</h3>
          <p className="text-sm text-slate-500 mt-1">
            Não há registros com os filtros atuais ou a obra está sem pendências abertas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const sev = SEVERITIES[item.severity] || SEVERITIES.MEDIA;
            const st = STATUSES[item.status] || STATUSES.ABERTA;
            const StatusIcon = st.icon;

            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${sev.badge}`}>
                        Severidade {sev.label}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${st.badge}`}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        {st.label}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                        {getTypeLabel(item.type)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                        <Building2 className="w-3.5 h-3.5" />
                        {item.project_code} — {item.project_name}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{item.description}</p>

                    {item.action_taken && (
                      <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                        <span className="font-bold text-slate-900 block mb-0.5">
                          Providências Adotadas / Plano de Ação:
                        </span>
                        {item.action_taken}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Data: <strong className="text-slate-700">{formatDateBR(item.occurrence_date)}</strong>
                      </span>
                      {item.location_area && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          Local: <strong className="text-slate-700">{item.location_area}</strong>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        Responsável: <strong className="text-slate-700">{item.responsible || item.author_name}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                    <div className="flex items-center gap-1.5">
                      {item.status !== 'RESOLVIDA' && (
                        <button
                          onClick={() => handleQuickStatus(item, 'RESOLVIDA')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Marcar Resolvida
                        </button>
                      )}
                      {item.status === 'ABERTA' && (
                        <button
                          onClick={() => handleQuickStatus(item, 'EM_ANDAMENTO')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold transition"
                        >
                          Em Tratamento
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                        title="Editar ocorrência / providências"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Excluir ocorrência"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editingItem ? 'Editar Ocorrência / Providências' : 'Registrar Nova Ocorrência de Obra'}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Obra *</label>
                  <select
                    required
                    disabled={!!editingItem}
                    value={form.project_id}
                    onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:bg-slate-100"
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria / Tipo *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {OCCURRENCE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Título Resumido da Ocorrência *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Atraso na entrega de concreto usinado ou Parada de equipamento"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Grau de Severidade *</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                    <option value="CRITICA">Crítica (Urgente)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status Atual *</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="ABERTA">Aberta</option>
                    <option value="EM_ANDAMENTO">Em Tratamento</option>
                    <option value="RESOLVIDA">Resolvida</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data da Ocorrência *</label>
                  <input
                    type="date"
                    required
                    value={form.occurrence_date}
                    onChange={(e) => setForm({ ...form, occurrence_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Setor / Frente de Serviço</label>
                  <input
                    type="text"
                    placeholder="Ex: Torre B - Subsolo 2"
                    value={form.location_area}
                    onChange={(e) => setForm({ ...form, location_area: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Responsável pela Tratativa</label>
                  <input
                    type="text"
                    placeholder="Nome do engenheiro ou encarregado"
                    value={form.responsible}
                    onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição Detalhada do Fato *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Relate o ocorrido, causas identificadas e impacto nas frentes de serviço..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Providências Adotadas / Ação Corretiva
                </label>
                <textarea
                  rows={2}
                  placeholder="Informe as medidas corretivas ou preventivas executadas pela equipe..."
                  value={form.action_taken}
                  onChange={(e) => setForm({ ...form, action_taken: e.target.value })}
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
                  {editingItem ? 'Salvar Alterações' : 'Registrar Ocorrência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

