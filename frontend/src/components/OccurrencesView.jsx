import React, { useState, useEffect, useMemo } from 'react';
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
  ShieldAlert,
  Settings,
  Save,
  Tag,
  Layers,
  Activity,
  Compass
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';

const COLOR_PALETTE = {
  slate: {
    label: 'Cinza (Neutro)',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    dot: 'bg-slate-500'
  },
  amber: {
    label: 'Amarelo / Âmbar (Atenção)',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    dot: 'bg-amber-500'
  },
  orange: {
    label: 'Laranja (Alerta Alto)',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
    dot: 'bg-orange-500'
  },
  rose: {
    label: 'Vermelho (Crítico / Urgente)',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    dot: 'bg-rose-500'
  },
  emerald: {
    label: 'Verde (Concluído / Seguro)',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-500'
  },
  sky: {
    label: 'Azul Claro (Informativo)',
    badge: 'bg-sky-100 text-sky-800 border-sky-300',
    dot: 'bg-sky-500'
  },
  indigo: {
    label: 'Azul Índigo (Técnico)',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    dot: 'bg-indigo-500'
  },
  purple: {
    label: 'Roxo (Especial / Projeto)',
    badge: 'bg-purple-100 text-purple-800 border-purple-300',
    dot: 'bg-purple-500'
  }
};

const PARAM_GROUPS = [
  {
    key: 'TYPE',
    title: '1. Categoria / Tipo',
    subtitle: 'Tipos de ocorrências e não conformidades de obra',
    placeholder: 'Ex: Atraso de Concretagem, Acidente Ambiental...',
    icon: Tag
  },
  {
    key: 'SEVERITY',
    title: '2. Grau de Severidade',
    subtitle: 'Níveis de impacto e urgência da ocorrência',
    placeholder: 'Ex: Baixa, Média, Alta, Crítica, Emergencial...',
    icon: Activity
  },
  {
    key: 'STATUS',
    title: '3. Status',
    subtitle: 'Etapas do fluxo de resolução da ocorrência',
    placeholder: 'Ex: Aberta, Em Análise, Aguardando Peça, Resolvida...',
    icon: Layers
  },
  {
    key: 'SECTOR',
    title: '4. Setor / Frente de Serviço',
    subtitle: 'Locais, blocos, pavimentos ou frentes de trabalho padronizadas',
    placeholder: 'Ex: Bloco A - Cobertura, Subsolo 02, Central de Concreto...',
    icon: Compass
  }
];

export default function OccurrencesView({ projects, selectedProjectId, currentUser, onRefreshDashboard }) {
  const [activeView, setActiveView] = useState('LIST'); // 'LIST' | 'PARAMS'
  const [occurrences, setOccurrences] = useState([]);
  const [paramsList, setParamsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Occurrence Create/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [error, setError] = useState('');

  // Param Management State
  const [activeParamGroup, setActiveParamGroup] = useState('TYPE');
  const [newParamLabel, setNewParamLabel] = useState('');
  const [newParamColor, setNewParamColor] = useState('amber');
  const [editingParamId, setEditingParamId] = useState(null);
  const [editingParamLabel, setEditingParamLabel] = useState('');
  const [editingParamColor, setEditingParamColor] = useState('slate');
  const [paramError, setParamError] = useState('');

  const groupedParams = useMemo(() => {
    const groups = {
      TYPE: [],
      SEVERITY: [],
      STATUS: [],
      SECTOR: []
    };
    for (const item of paramsList) {
      if (groups[item.group_key]) {
        groups[item.group_key].push(item);
      }
    }
    return groups;
  }, [paramsList]);

  const initialForm = {
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
    title: '',
    type: groupedParams.TYPE[0]?.code || 'SEGURANCA',
    severity: groupedParams.SEVERITY[1]?.code || groupedParams.SEVERITY[0]?.code || 'MEDIA',
    status: groupedParams.STATUS[0]?.code || 'ABERTA',
    occurrence_date: new Date().toISOString().slice(0, 10),
    location_area: groupedParams.SECTOR[0]?.label || '',
    description: '',
    action_taken: '',
    responsible: currentUser?.name || ''
  };

  const [form, setForm] = useState(initialForm);

  const loadParams = async () => {
    try {
      const data = await apiRequest('/api/occurrence-params');
      setParamsList(data);
    } catch (err) {
      console.error('Erro ao carregar parâmetros de ocorrências:', err);
    }
  };

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
    loadParams();
  }, []);

  useEffect(() => {
    loadOccurrences();
  }, [selectedProjectId, statusFilter, severityFilter]);

  useEffect(() => {
    if (selectedProjectId !== 'ALL') {
      setForm((prev) => ({ ...prev, project_id: selectedProjectId }));
    } else if (!form.project_id && projects.length > 0) {
      setForm((prev) => ({ ...prev, project_id: projects[0].id }));
    }
  }, [selectedProjectId, projects]);

  const openCreateModal = () => {
    setEditingItem(null);
    setError('');
    setForm({
      project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
      title: '',
      type: groupedParams.TYPE[0]?.code || 'SEGURANCA',
      severity: groupedParams.SEVERITY[1]?.code || groupedParams.SEVERITY[0]?.code || 'MEDIA',
      status: groupedParams.STATUS[0]?.code || 'ABERTA',
      occurrence_date: new Date().toISOString().slice(0, 10),
      location_area: groupedParams.SECTOR[0]?.label || '',
      description: '',
      action_taken: '',
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

  // ============================================================================
  // PARAMETER CRUD HANDLERS (CATEGORIA, SEVERIDADE, STATUS, SETOR)
  // ============================================================================
  const handleAddParam = async (e) => {
    e.preventDefault();
    setParamError('');
    if (!newParamLabel.trim()) return;

    try {
      await apiRequest('/api/occurrence-params', {
        method: 'POST',
        body: JSON.stringify({
          group_key: activeParamGroup,
          label: newParamLabel.trim(),
          color: newParamColor,
          sort_order: (groupedParams[activeParamGroup]?.length || 0) + 1
        })
      });
      setNewParamLabel('');
      await loadParams();
    } catch (err) {
      setParamError(err.message);
    }
  };

  const startEditParam = (param) => {
    setEditingParamId(param.id);
    setEditingParamLabel(param.label);
    setEditingParamColor(param.color || 'slate');
  };

  const handleSaveParamEdit = async (paramId) => {
    setParamError('');
    try {
      await apiRequest(`/api/occurrence-params/${paramId}`, {
        method: 'PUT',
        body: JSON.stringify({
          label: editingParamLabel,
          color: editingParamColor
        })
      });
      setEditingParamId(null);
      await loadParams();
      await loadOccurrences();
    } catch (err) {
      setParamError(err.message);
    }
  };

  const handleDeleteParam = async (param) => {
    if (!window.confirm(`Deseja remover a opção "${param.label}"?`)) return;
    try {
      await apiRequest(`/api/occurrence-params/${param.id}`, {
        method: 'DELETE'
      });
      await loadParams();
    } catch (err) {
      alert(err.message);
    }
  };

  // Helpers to resolve dynamic labels & colors
  const resolveParamInfo = (groupKey, codeOrLabel) => {
    const list = groupedParams[groupKey] || [];
    const found = list.find(
      (item) => item.code === codeOrLabel || item.label === codeOrLabel
    );
    if (found) {
      const palette = COLOR_PALETTE[found.color] || COLOR_PALETTE.slate;
      return { label: found.label, badge: palette.badge, color: found.color };
    }
    return {
      label: codeOrLabel || '—',
      badge: COLOR_PALETTE.slate.badge,
      color: 'slate'
    };
  };

  const filtered = occurrences.filter((oc) => {
    if (sectorFilter !== 'ALL' && oc.location_area !== sectorFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      oc.title?.toLowerCase().includes(q) ||
      oc.description?.toLowerCase().includes(q) ||
      oc.action_taken?.toLowerCase().includes(q) ||
      oc.project_name?.toLowerCase().includes(q) ||
      oc.location_area?.toLowerCase().includes(q) ||
      oc.responsible?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">2. Registro de Ocorrências e Não Conformidades</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Controle de intercorrências de campo com gerenciamento personalizado de Categorias, Severidades, Status e Setores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Toggle: List vs Manage Fields */}
          <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveView('LIST')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition ${
                activeView === 'LIST'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Livro de Ocorrências ({occurrences.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveView('PARAMS')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition ${
                activeView === 'PARAMS'
                  ? 'bg-slate-900 text-amber-400 shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Gerenciar Campos (4)
            </button>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Registrar Ocorrência
          </button>
        </div>
      </div>

      {/* =====================================================================
          VIEW 2: GERENCIAMENTO DE CAMPOS (CATEGORIA, SEVERIDADE, STATUS, SETOR)
         ===================================================================== */}
      {activeView === 'PARAMS' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2 text-amber-400">
                <Settings className="w-5 h-5" />
                Central de Configuração dos Campos de Ocorrências
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Adicione, edite ou remova as opções disponíveis nos formulários de Categoria/Tipo, Grau de Severidade, Status e Setor/Frente de Serviço.
              </p>
            </div>
            <button
              onClick={() => setActiveView('LIST')}
              className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition self-start md:self-auto"
            >
              ← Voltar para Lista de Ocorrências
            </button>
          </div>

          {/* 4 Group Selector Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-slate-200 bg-slate-50">
            {PARAM_GROUPS.map((grp) => {
              const Icon = grp.icon;
              const isSelected = activeParamGroup === grp.key;
              const count = (groupedParams[grp.key] || []).length;
              return (
                <button
                  key={grp.key}
                  type="button"
                  onClick={() => {
                    setActiveParamGroup(grp.key);
                    setEditingParamId(null);
                    setParamError('');
                  }}
                  className={`p-4 text-left border-b-2 transition flex items-start justify-between ${
                    isSelected
                      ? 'bg-white border-amber-500 text-slate-900'
                      : 'border-transparent text-slate-600 hover:bg-slate-100/80'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-amber-600' : 'text-slate-400'}`} />
                      <span className="font-bold text-sm">{grp.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{grp.subtitle}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      isSelected ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="p-6 space-y-6">
            {paramError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {paramError}
              </div>
            )}

            {/* Add New Option Form */}
            <form
              onSubmit={handleAddParam}
              className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-end gap-3"
            >
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Adicionar novo item em: {PARAM_GROUPS.find((g) => g.key === activeParamGroup)?.title}
                </label>
                <input
                  type="text"
                  required
                  placeholder={PARAM_GROUPS.find((g) => g.key === activeParamGroup)?.placeholder}
                  value={newParamLabel}
                  onChange={(e) => setNewParamLabel(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="w-full md:w-64">
                <label className="block text-xs font-bold text-slate-700 mb-1">Cor da Etiqueta (Badge)</label>
                <select
                  value={newParamColor}
                  onChange={(e) => setNewParamColor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {Object.entries(COLOR_PALETTE).map(([colorKey, info]) => (
                    <option key={colorKey} value={colorKey}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-xs transition shrink-0"
              >
                <Plus className="w-4 h-4" />
                Adicionar Opção
              </button>
            </form>

            {/* Current Options List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Opções Cadastradas ({(groupedParams[activeParamGroup] || []).length})
              </h4>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {(groupedParams[activeParamGroup] || []).map((param) => {
                  const isEditing = editingParamId === param.id;
                  const palette = COLOR_PALETTE[param.color] || COLOR_PALETTE.slate;

                  return (
                    <div
                      key={param.id}
                      className="p-3.5 bg-white hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      {isEditing ? (
                        <div className="flex-1 flex flex-col sm:flex-row items-center gap-2">
                          <input
                            type="text"
                            value={editingParamLabel}
                            onChange={(e) => setEditingParamLabel(e.target.value)}
                            className="flex-1 w-full px-3 py-1.5 rounded-lg border border-amber-400 text-sm font-medium outline-none"
                          />
                          <select
                            value={editingParamColor}
                            onChange={(e) => setEditingParamColor(e.target.value)}
                            className="w-full sm:w-52 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                          >
                            {Object.entries(COLOR_PALETTE).map(([cKey, cInfo]) => (
                              <option key={cKey} value={cKey}>
                                {cInfo.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-md text-xs font-bold border ${palette.badge}`}>
                            {param.label}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            Código: {param.code}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSaveParamEdit(param.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                            >
                              <Save className="w-3.5 h-3.5" />
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingParamId(null)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-100"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditParam(param)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                              title="Editar nome ou cor"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteParam(param)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Remover opção"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* =====================================================================
           VIEW 1: LIVRO DE OCORRÊNCIAS (FILTROS E LISTAGEM)
           ===================================================================== */
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <input
              type="text"
              placeholder="Pesquisar título, descrição, responsável..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todos os Status</option>
              {groupedParams.STATUS.map((st) => (
                <option key={st.id} value={st.code}>
                  {st.label}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todas as Severidades</option>
              {groupedParams.SEVERITY.map((sev) => (
                <option key={sev.id} value={sev.code}>
                  {sev.label}
                </option>
              ))}
            </select>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todos os Setores / Frentes</option>
              {groupedParams.SECTOR.map((sec) => (
                <option key={sec.id} value={sec.label}>
                  {sec.label}
                </option>
              ))}
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
                const sev = resolveParamInfo('SEVERITY', item.severity);
                const st = resolveParamInfo('STATUS', item.status);
                const tp = resolveParamInfo('TYPE', item.type);

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${sev.badge}`}>
                            Severidade: {sev.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${st.badge}`}>
                            {item.status === 'RESOLVIDA' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : item.status === 'ABERTA' ? (
                              <AlertOctagon className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            {st.label}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${tp.badge}`}>
                            {tp.label}
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
                              <MapPin className="w-3.5 h-3.5 text-amber-500" />
                              Setor / Frente: <strong className="text-slate-800">{item.location_area}</strong>
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
        </>
      )}

      {/* Modal: Create / Edit Occurrence */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingItem ? 'Editar Ocorrência / Providências' : 'Registrar Nova Ocorrência de Obra'}
                </h3>
                <p className="text-xs text-slate-500">
                  Precisa personalizar as opções?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setActiveView('PARAMS');
                    }}
                    className="text-amber-600 hover:text-amber-700 font-semibold underline"
                  >
                    Abrir Gerenciador de Campos
                  </button>
                </p>
              </div>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">1. Categoria / Tipo *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {groupedParams.TYPE.map((t) => (
                      <option key={t.id} value={t.code}>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">2. Grau de Severidade *</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {groupedParams.SEVERITY.map((sev) => (
                      <option key={sev.id} value={sev.code}>
                        {sev.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">3. Status Atual *</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {groupedParams.STATUS.map((st) => (
                      <option key={st.id} value={st.code}>
                        {st.label}
                      </option>
                    ))}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    4. Setor / Frente de Serviço *
                  </label>
                  <select
                    value={form.location_area}
                    onChange={(e) => setForm({ ...form, location_area: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="">Selecione o setor / frente de serviço...</option>
                    {groupedParams.SECTOR.map((sec) => (
                      <option key={sec.id} value={sec.label}>
                        {sec.label}
                      </option>
                    ))}
                    {form.location_area &&
                      !groupedParams.SECTOR.some((s) => s.label === form.location_area) && (
                        <option value={form.location_area}>{form.location_area}</option>
                      )}
                  </select>
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
