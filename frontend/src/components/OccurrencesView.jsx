import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Compass,
  Camera,
  Image as ImageIcon,
  FileText,
  Printer,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Timer,
  Flame,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  CheckSquare
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';

const COLOR_PALETTE = {
  slate: {
    label: 'Cinza (Neutro)',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    dot: 'bg-slate-500',
    bar: 'bg-slate-500'
  },
  amber: {
    label: 'Amarelo / Âmbar (Atenção)',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500'
  },
  orange: {
    label: 'Laranja (Alerta Alto)',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
    dot: 'bg-orange-500',
    bar: 'bg-orange-500'
  },
  rose: {
    label: 'Vermelho (Crítico / Urgente)',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500'
  },
  emerald: {
    label: 'Verde (Concluído / Seguro)',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500'
  },
  sky: {
    label: 'Azul Claro (Informativo)',
    badge: 'bg-sky-100 text-sky-800 border-sky-300',
    dot: 'bg-sky-500',
    bar: 'bg-sky-500'
  },
  indigo: {
    label: 'Azul Índigo (Técnico)',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    dot: 'bg-indigo-500',
    bar: 'bg-indigo-500'
  },
  purple: {
    label: 'Roxo (Especial / Projeto)',
    badge: 'bg-purple-100 text-purple-800 border-purple-300',
    dot: 'bg-purple-500',
    bar: 'bg-purple-500'
  }
};

const PHOTO_PHASES = [
  { code: 'REGISTRO', label: 'Registro Inicial (Constatado)', badge: 'bg-rose-100 text-rose-800 border-rose-300' },
  { code: 'TRATATIVA', label: 'Em Tratativa / Execução', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  { code: 'CONCLUSAO', label: 'Conclusão / Resolvido', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
];

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

function diffDaysBetween(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const s = new Date(String(startStr).slice(0, 10) + 'T12:00:00');
  const e = new Date(String(endStr).slice(0, 10) + 'T12:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function readRawDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Reduz a foto antes do envio (lado maior até 1600 px, JPEG 82%) — fotos de celular
// de vários MB passam a ter poucas centenas de KB.
const MAX_PHOTO_SIDE = 1600;
async function readFileAsDataURL(file) {
  const raw = await readRawDataURL(file);
  if (!/^image\/(jpeg|png|webp|heic|heif)/i.test(file.type || '')) return raw;
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = raw;
    });
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', 0.82);
    return compressed.length < raw.length ? compressed : raw;
  } catch {
    return raw;
  }
}

export default function OccurrencesView({ projects, selectedProjectId, currentUser, onRefreshDashboard }) {
  const [activeView, setActiveView] = useState('LIST'); // 'LIST' | 'REPORT' | 'PARAMS'
  const [occurrences, setOccurrences] = useState([]);
  const [paramsList, setParamsList] = useState([]);
  const [reportSettings, setReportSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);

  // Filters (List view)
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Report Filters & Configuration
  const [reportStatusGroup, setReportStatusGroup] = useState('ALL'); // 'ALL' | 'OPEN_ONLY' | 'RESOLVED_ONLY' | specific status code
  const [reportTypeFilter, setReportTypeFilter] = useState('ALL');
  const [reportSeverityFilter, setReportSeverityFilter] = useState('ALL');
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [reportIncludeKpis, setReportIncludeKpis] = useState(true);
  const [reportGroupByStatus, setReportGroupByStatus] = useState(true);
  const [reportIncludePhotos, setReportIncludePhotos] = useState(true);

  // Occurrence Create/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState([]); // [{ base64, caption, phase, name }]
  const [existingPhotos, setExistingPhotos] = useState([]); // [{ id, image_url, caption, phase }]
  const fileInputRef = useRef(null);

  // Quick Photo Upload Modal for a single card
  const [quickPhotoTarget, setQuickPhotoTarget] = useState(null);
  const [quickPhotoItems, setQuickPhotoItems] = useState([]);
  const [quickPhotoUploading, setQuickPhotoUploading] = useState(false);
  const quickFileInputRef = useRef(null);

  // Lightbox Modal
  const [lightboxState, setLightboxState] = useState(null); // { occurrence, photos, index }

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

  const resolvedStatusCodes = useMemo(() => {
    const set = new Set(['RESOLVIDA', 'CONCLUIDA', 'ATENDIDA', 'FECHADA']);
    for (const st of groupedParams.STATUS) {
      if (st.is_resolved) set.add(st.code);
    }
    return set;
  }, [groupedParams.STATUS]);

  const isOccurrenceResolved = (item) => {
    if (!item) return false;
    return resolvedStatusCodes.has(String(item.status || '').toUpperCase());
  };

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const initialForm = {
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
    title: '',
    type: groupedParams.TYPE[0]?.code || 'SEGURANCA',
    severity: groupedParams.SEVERITY[1]?.code || groupedParams.SEVERITY[0]?.code || 'MEDIA',
    status: groupedParams.STATUS[0]?.code || 'ABERTA',
    occurrence_date: todayISO,
    due_date: '',
    resolved_at: '',
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

  const loadReportSettings = async () => {
    try {
      const data = await apiRequest('/api/report-settings');
      setReportSettings(data);
    } catch (err) {
      console.error('Erro ao carregar configurações de banner:', err);
    }
  };

  const loadOccurrences = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'ALL') params.set('projectId', selectedProjectId);
      const data = await apiRequest(`/api/occurrences?${params.toString()}`);
      setOccurrences(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParams();
    loadReportSettings();
  }, []);

  useEffect(() => {
    loadOccurrences();
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId !== 'ALL') {
      setForm((prev) => ({ ...prev, project_id: selectedProjectId }));
    } else if (!form.project_id && projects.length > 0) {
      setForm((prev) => ({ ...prev, project_id: projects[0].id }));
    }
  }, [selectedProjectId, projects]);

  // Helpers to resolve dynamic labels & colors
  const resolveParamInfo = (groupKey, codeOrLabel) => {
    const list = groupedParams[groupKey] || [];
    const found = list.find(
      (item) => item.code === codeOrLabel || item.label === codeOrLabel
    );
    if (found) {
      const palette = COLOR_PALETTE[found.color] || COLOR_PALETTE.slate;
      return { label: found.label, badge: palette.badge, color: found.color, bar: palette.bar, dot: palette.dot };
    }
    return {
      label: codeOrLabel || '—',
      badge: COLOR_PALETTE.slate.badge,
      color: 'slate',
      bar: COLOR_PALETTE.slate.bar,
      dot: COLOR_PALETTE.slate.dot
    };
  };

  const resolvePhaseInfo = (phaseCode) => {
    return PHOTO_PHASES.find((p) => p.code === phaseCode) || PHOTO_PHASES[0];
  };

  // Compute resolution time or open time for an occurrence
  const getOccurrenceLeadTime = (item) => {
    const resolved = isOccurrenceResolved(item);
    if (resolved) {
      const endDate = item.resolved_at || item.updated_at?.slice(0, 10) || item.occurrence_date;
      const days = diffDaysBetween(item.occurrence_date, endDate);
      return { days: days !== null ? days : 0, isResolved: true };
    } else {
      const days = diffDaysBetween(item.occurrence_date, todayISO);
      return { days: days !== null ? days : 0, isResolved: false };
    }
  };

  // Filtered occurrences for main list
  const filtered = useMemo(() => {
    return occurrences.filter((oc) => {
      if (statusFilter === 'OPEN_ONLY' && isOccurrenceResolved(oc)) return false;
      if (statusFilter === 'RESOLVED_ONLY' && !isOccurrenceResolved(oc)) return false;
      if (
        statusFilter !== 'ALL' &&
        statusFilter !== 'OPEN_ONLY' &&
        statusFilter !== 'RESOLVED_ONLY' &&
        oc.status !== statusFilter
      ) {
        return false;
      }
      if (typeFilter !== 'ALL' && oc.type !== typeFilter) return false;
      if (severityFilter !== 'ALL' && oc.severity !== severityFilter) return false;
      if (sectorFilter !== 'ALL' && oc.location_area !== sectorFilter) return false;
      if (dateFromFilter && String(oc.occurrence_date).slice(0, 10) < dateFromFilter) return false;
      if (dateToFilter && String(oc.occurrence_date).slice(0, 10) > dateToFilter) return false;

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
  }, [
    occurrences,
    statusFilter,
    typeFilter,
    severityFilter,
    sectorFilter,
    dateFromFilter,
    dateToFilter,
    searchQuery,
    resolvedStatusCodes
  ]);

  // ============================================================================
  // KPIs & ANALYTICS COMPUTATION
  // ============================================================================
  const kpiMetrics = useMemo(() => {
    const dataset = occurrences;
    const total = dataset.length;
    let resolvedCount = 0;
    let openCount = 0;
    let inProgressCount = 0;
    let overdueCount = 0;
    let criticalOpenCount = 0;
    let withPhotosCount = 0;
    let totalPhotosCount = 0;

    let resolvedDaysSum = 0;
    let resolvedWithDatesCount = 0;
    let openDaysSum = 0;

    const byTypeMap = {};
    const byStatusMap = {};

    for (const item of dataset) {
      const resolved = isOccurrenceResolved(item);
      const photosLen = Array.isArray(item.photos) ? item.photos.length : 0;
      if (photosLen > 0) {
        withPhotosCount += 1;
        totalPhotosCount += photosLen;
      }

      const lead = getOccurrenceLeadTime(item);

      if (resolved) {
        resolvedCount += 1;
        resolvedDaysSum += lead.days;
        resolvedWithDatesCount += 1;
      } else {
        openCount += 1;
        openDaysSum += lead.days;
        if (item.status !== 'ABERTA') {
          inProgressCount += 1;
        }
        if (item.due_date && String(item.due_date).slice(0, 10) < todayISO) {
          overdueCount += 1;
        }
        if (item.severity === 'ALTA' || item.severity === 'CRITICA') {
          criticalOpenCount += 1;
        }
      }

      // Status aggregation
      const stCode = item.status || 'ABERTA';
      if (!byStatusMap[stCode]) {
        byStatusMap[stCode] = { code: stCode, count: 0 };
      }
      byStatusMap[stCode].count += 1;

      // Type aggregation (for "qual tipo demora mais tempo para ser atendida")
      const tpCode = item.type || 'OUTROS';
      if (!byTypeMap[tpCode]) {
        byTypeMap[tpCode] = {
          code: tpCode,
          totalCount: 0,
          resolvedCount: 0,
          openCount: 0,
          resolvedDaysSum: 0,
          allDaysSum: 0
        };
      }
      byTypeMap[tpCode].totalCount += 1;
      byTypeMap[tpCode].allDaysSum += lead.days;
      if (resolved) {
        byTypeMap[tpCode].resolvedCount += 1;
        byTypeMap[tpCode].resolvedDaysSum += lead.days;
      } else {
        byTypeMap[tpCode].openCount += 1;
      }
    }

    const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
    const avgResolutionDays =
      resolvedWithDatesCount > 0 ? Number((resolvedDaysSum / resolvedWithDatesCount).toFixed(1)) : null;
    const avgOpenDays = openCount > 0 ? Number((openDaysSum / openCount).toFixed(1)) : 0;

    // Build ranking of types by average resolution time (fallback to total cycle time if a type only has open items)
    const typeRanking = Object.values(byTypeMap)
      .map((entry) => {
        const info = resolveParamInfo('TYPE', entry.code);
        const avgRes =
          entry.resolvedCount > 0 ? Number((entry.resolvedDaysSum / entry.resolvedCount).toFixed(1)) : null;
        const avgAll = entry.totalCount > 0 ? Number((entry.allDaysSum / entry.totalCount).toFixed(1)) : 0;
        // Effective metric for bottleneck sorting: prioritize resolved average days, or open days if still unresolved
        const metricDays = avgRes !== null ? avgRes : avgAll;
        return {
          ...entry,
          label: info.label,
          badge: info.badge,
          bar: info.bar,
          avgResolutionDays: avgRes,
          avgTotalDays: avgAll,
          metricDays
        };
      })
      .sort((a, b) => b.metricDays - a.metricDays);

    // Slowest type ("qual tipo de ocorrência demora mais tempo para ser atendida")
    const slowestResolvedType =
      typeRanking.find((t) => t.avgResolutionDays !== null) || typeRanking[0] || null;

    const statusBreakdown = Object.values(byStatusMap)
      .map((st) => {
        const info = resolveParamInfo('STATUS', st.code);
        return {
          ...st,
          label: info.label,
          badge: info.badge,
          bar: info.bar,
          pct: total > 0 ? Math.round((st.count / total) * 100) : 0
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      total,
      resolvedCount,
      openCount,
      inProgressCount,
      overdueCount,
      criticalOpenCount,
      withPhotosCount,
      totalPhotosCount,
      resolutionRate,
      avgResolutionDays,
      avgOpenDays,
      typeRanking,
      slowestResolvedType,
      statusBreakdown
    };
  }, [occurrences, groupedParams, todayISO]);

  // ============================================================================
  // REPORT DATASET & GROUPING BY STATUS
  // ============================================================================
  const reportOccurrences = useMemo(() => {
    return occurrences.filter((oc) => {
      if (reportStatusGroup === 'OPEN_ONLY' && isOccurrenceResolved(oc)) return false;
      if (reportStatusGroup === 'RESOLVED_ONLY' && !isOccurrenceResolved(oc)) return false;
      if (
        reportStatusGroup !== 'ALL' &&
        reportStatusGroup !== 'OPEN_ONLY' &&
        reportStatusGroup !== 'RESOLVED_ONLY' &&
        oc.status !== reportStatusGroup
      ) {
        return false;
      }
      if (reportTypeFilter !== 'ALL' && oc.type !== reportTypeFilter) return false;
      if (reportSeverityFilter !== 'ALL' && oc.severity !== reportSeverityFilter) return false;
      if (reportDateFrom && String(oc.occurrence_date).slice(0, 10) < reportDateFrom) return false;
      if (reportDateTo && String(oc.occurrence_date).slice(0, 10) > reportDateTo) return false;
      return true;
    });
  }, [
    occurrences,
    reportStatusGroup,
    reportTypeFilter,
    reportSeverityFilter,
    reportDateFrom,
    reportDateTo,
    resolvedStatusCodes
  ]);

  const reportGroupedByStatus = useMemo(() => {
    if (!reportGroupByStatus) {
      return [
        {
          statusCode: 'ALL',
          statusLabel: 'Listagem Geral de Ocorrências',
          badge: COLOR_PALETTE.slate.badge,
          items: reportOccurrences
        }
      ];
    }
    const groupsMap = new Map();
    for (const st of groupedParams.STATUS) {
      groupsMap.set(st.code, []);
    }
    for (const oc of reportOccurrences) {
      const code = oc.status || 'OUTROS';
      if (!groupsMap.has(code)) groupsMap.set(code, []);
      groupsMap.get(code).push(oc);
    }
    const result = [];
    for (const [code, items] of groupsMap.entries()) {
      if (items.length === 0) continue;
      const info = resolveParamInfo('STATUS', code);
      result.push({
        statusCode: code,
        statusLabel: info.label,
        badge: info.badge,
        items
      });
    }
    return result;
  }, [reportOccurrences, reportGroupByStatus, groupedParams.STATUS]);

  // ============================================================================
  // MODAL & PHOTO HANDLERS
  // ============================================================================
  const openCreateModal = () => {
    setEditingItem(null);
    setError('');
    setPendingPhotos([]);
    setExistingPhotos([]);
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 5);
    setForm({
      project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
      title: '',
      type: groupedParams.TYPE[0]?.code || 'SEGURANCA',
      severity: groupedParams.SEVERITY[1]?.code || groupedParams.SEVERITY[0]?.code || 'MEDIA',
      status: groupedParams.STATUS[0]?.code || 'ABERTA',
      occurrence_date: todayISO,
      due_date: defaultDue.toISOString().slice(0, 10),
      resolved_at: '',
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
    setPendingPhotos([]);
    setExistingPhotos(Array.isArray(item.photos) ? [...item.photos] : []);
    setForm({
      project_id: item.project_id,
      title: item.title,
      type: item.type,
      severity: item.severity,
      status: item.status,
      occurrence_date: item.occurrence_date || todayISO,
      due_date: item.due_date || '',
      resolved_at: item.resolved_at || '',
      location_area: item.location_area || '',
      description: item.description || '',
      action_taken: item.action_taken || '',
      responsible: item.responsible || ''
    });
    setShowModal(true);
  };

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const defaultPhase = resolvedStatusCodes.has(form.status)
      ? 'CONCLUSAO'
      : form.status === 'EM_ANDAMENTO'
      ? 'TRATATIVA'
      : 'REGISTRO';

    const loaded = [];
    for (const file of files) {
      try {
        const base64 = await readFileAsDataURL(file);
        loaded.push({
          base64,
          caption: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
          phase: defaultPhase,
          name: file.name
        });
      } catch (err) {
        console.error('Erro ao ler imagem:', err);
      }
    }
    setPendingPhotos((prev) => [...prev, ...loaded]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteExistingPhoto = async (photoId) => {
    if (!window.confirm('Remover esta foto da ocorrência?')) return;
    try {
      await apiRequest(`/api/occurrence-photos/${photoId}`, { method: 'DELETE' });
      setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
      await loadOccurrences();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateExistingPhotoMeta = async (photoId, caption, phase) => {
    try {
      await apiRequest(`/api/occurrence-photos/${photoId}`, {
        method: 'PUT',
        body: JSON.stringify({ caption, phase })
      });
      setExistingPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, caption, phase } : p))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const isRes = resolvedStatusCodes.has(form.status);
      const payload = {
        ...form,
        resolved_at: isRes ? (form.resolved_at || todayISO) : form.resolved_at,
        photos: pendingPhotos.map((p) => ({
          base64: p.base64,
          caption: p.caption,
          phase: p.phase
        }))
      };

      if (editingItem) {
        await apiRequest(`/api/occurrences/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiRequest('/api/occurrences', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      setShowModal(false);
      await loadOccurrences();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Photo Upload directly from Occurrence Card
  const openQuickPhotoModal = (item) => {
    setQuickPhotoTarget(item);
    setQuickPhotoItems([]);
  };

  const handleQuickFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !quickPhotoTarget) return;
    const defaultPhase = isOccurrenceResolved(quickPhotoTarget)
      ? 'CONCLUSAO'
      : quickPhotoTarget.status === 'EM_ANDAMENTO'
      ? 'TRATATIVA'
      : 'REGISTRO';

    const loaded = [];
    for (const file of files) {
      try {
        const base64 = await readFileAsDataURL(file);
        loaded.push({
          base64,
          caption: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
          phase: defaultPhase
        });
      } catch (err) {
        console.error(err);
      }
    }
    setQuickPhotoItems((prev) => [...prev, ...loaded]);
    if (quickFileInputRef.current) quickFileInputRef.current.value = '';
  };

  const handleSaveQuickPhotos = async (e) => {
    e.preventDefault();
    if (!quickPhotoTarget || quickPhotoItems.length === 0) return;
    setQuickPhotoUploading(true);
    try {
      await apiRequest(`/api/occurrences/${quickPhotoTarget.id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ photos: quickPhotoItems })
      });
      setQuickPhotoTarget(null);
      setQuickPhotoItems([]);
      await loadOccurrences();
    } catch (err) {
      alert(err.message);
    } finally {
      setQuickPhotoUploading(false);
    }
  };

  const handleQuickStatus = async (item, newStatus) => {
    try {
      const isRes = resolvedStatusCodes.has(newStatus);
      await apiRequest(`/api/occurrences/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...item,
          status: newStatus,
          resolved_at: isRes ? (item.resolved_at || todayISO) : ''
        })
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
  // EXPORT TO EXCEL (.XLS) & PRINT A4 PDF
  // ============================================================================
  const handleExportExcel = () => {
    const rows = reportOccurrences;
    const htmlRows = rows
      .map((oc) => {
        const tp = resolveParamInfo('TYPE', oc.type).label;
        const sev = resolveParamInfo('SEVERITY', oc.severity).label;
        const st = resolveParamInfo('STATUS', oc.status).label;
        const lead = getOccurrenceLeadTime(oc);
        const photosCount = Array.isArray(oc.photos) ? oc.photos.length : 0;
        return `
          <tr>
            <td>#${oc.id}</td>
            <td>${oc.project_code || ''} - ${oc.project_name || ''}</td>
            <td>${formatDateBR(oc.occurrence_date)}</td>
            <td>${oc.due_date ? formatDateBR(oc.due_date) : '—'}</td>
            <td>${oc.resolved_at ? formatDateBR(oc.resolved_at) : '—'}</td>
            <td>${lead.days} dia(s) (${lead.isResolved ? 'Atendida' : 'Em Aberto'})</td>
            <td>${st}</td>
            <td>${tp}</td>
            <td>${sev}</td>
            <td>${oc.location_area || '—'}</td>
            <td>${oc.title || ''}</td>
            <td>${oc.description || ''}</td>
            <td>${oc.action_taken || '—'}</td>
            <td>${oc.responsible || oc.author_name || '—'}</td>
            <td>${photosCount} foto(s)</td>
          </tr>
        `;
      })
      .join('');

    const excelTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
          th { background-color: #0f172a; color: #ffffff; font-weight: bold; padding: 8px; border: 1px solid #cbd5e1; }
          td { padding: 6px 8px; border: 1px solid #cbd5e1; vertical-align: top; }
        </style>
      </head>
      <body>
        <h3>RELATÓRIO DE OCORRÊNCIAS POR STATUS — AXIS OBRA</h3>
        <p>Total exportado: ${rows.length} ocorrência(s) | Taxa de Atendimento Geral: ${kpiMetrics.resolutionRate}% | Prazo Médio de Atendimento: ${
      kpiMetrics.avgResolutionDays !== null ? `${kpiMetrics.avgResolutionDays} dias` : '—'
    }</p>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Obra</th>
              <th>Data Ocorrência</th>
              <th>Prazo Limite</th>
              <th>Data Atendimento</th>
              <th>Tempo / Lead Time</th>
              <th>Status</th>
              <th>Categoria / Tipo</th>
              <th>Severidade</th>
              <th>Setor / Frente</th>
              <th>Título</th>
              <th>Descrição</th>
              <th>Providências / Ação</th>
              <th>Responsável</th>
              <th>Fotos Anexadas</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', excelTemplate], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-ocorrencias-status-${todayISO}.xls`;
    a.click();
    URL.revokeObjectURL(url);
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

  // Current selected project object for report header
  const activeProjectObj = useMemo(() => {
    if (selectedProjectId && selectedProjectId !== 'ALL') {
      return projects.find((p) => String(p.id) === String(selectedProjectId)) || null;
    }
    return null;
  }, [projects, selectedProjectId]);

  // Render Configurable Module 8 Banner for the Status Report
  const renderReportBanner = () => {
    const cfg = reportSettings || {};
    const mode = cfg.banner_mode || 'TEXT';
    const bannerText =
      cfg.banner_text ||
      'AXIS OBRA ENGENHARIA E CONSTRUÇÕES LTDA\nRELATÓRIO DE OCORRÊNCIAS E NÃO CONFORMIDADES POR STATUS';
    const textAlign =
      cfg.banner_text_align === 'LEFT'
        ? 'left'
        : cfg.banner_text_align === 'RIGHT'
        ? 'right'
        : 'center';
    const fontSize =
      cfg.banner_font_size === 'SMALL'
        ? '12px'
        : cfg.banner_font_size === 'LARGE'
        ? '17px'
        : '14px';

    return (
      <div className="border-2 border-slate-900 mb-3 bg-white">
        <div className="p-3 flex items-center justify-between gap-4 border-b border-slate-900">
          {cfg.banner_logo_left_url ? (
            <img
              src={cfg.banner_logo_left_url}
              alt="Logo Esquerdo"
              className="max-h-14 max-w-[150px] object-contain shrink-0"
            />
          ) : null}

          <div className="flex-1 min-w-0">
            {(mode === 'IMAGE' || mode === 'BOTH') && cfg.banner_image_url && (
              <div className="flex justify-center mb-1.5">
                <img
                  src={cfg.banner_image_url}
                  alt="Banner"
                  className="max-h-16 w-auto object-contain"
                />
              </div>
            )}
            {(mode === 'TEXT' || mode === 'BOTH' || !cfg.banner_image_url) && (
              <div
                style={{
                  textAlign,
                  fontSize,
                  fontWeight: cfg.banner_bold !== 0 ? 800 : 500,
                  fontStyle: cfg.banner_italic ? 'italic' : 'normal',
                  textDecoration: cfg.banner_underline ? 'underline' : 'none',
                  color: cfg.banner_color || '#0f172a',
                  whiteSpace: 'pre-line',
                  lineHeight: 1.35
                }}
              >
                {bannerText}
              </div>
            )}
          </div>

          {cfg.banner_logo_right_url ? (
            <img
              src={cfg.banner_logo_right_url}
              alt="Logo Direito"
              className="max-h-14 max-w-[150px] object-contain shrink-0"
            />
          ) : null}
        </div>

        <div className="px-3 py-1.5 bg-slate-100 text-[11px] font-bold text-slate-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            OBRA:{' '}
            {activeProjectObj
              ? `${activeProjectObj.code} — ${activeProjectObj.name} (${activeProjectObj.location})`
              : 'CONSOLIDADO GERAL DE EMPREENDIMENTOS'}
          </span>
          <span>
            CONTRATO: {cfg.contract_number || 'CO141/2025 - DT'} • EMISSÃO: {formatDateBR(todayISO)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Print-only stylesheet for Report View */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #occurrences-printable-report,
          #occurrences-printable-report * {
            visibility: visible;
          }
          #occurrences-printable-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Header */}
      <div className="no-print flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              3. Registro de Ocorrências e Não Conformidades
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Controle de ocorrências com evidências fotográficas, KPIs de prazo médio de atendimento e relatórios gerenciais por status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Toggle: List vs Status Report vs Manage Fields */}
          <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 border border-slate-200">
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
              onClick={() => setActiveView('REPORT')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition ${
                activeView === 'REPORT'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Relatórios por Status
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
              Gerenciar Campos
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
          PAINEL EXECUTIVO DE KPIs E ÍNDICES DE OCORRÊNCIAS (SEMPRE VISÍVEL EM LIST)
         ===================================================================== */}
      {activeView === 'LIST' && (
        <div className="no-print space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* KPI 1: Total Registradas */}
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`text-left bg-white p-4 rounded-xl border transition shadow-xs hover:shadow-md ${
                statusFilter === 'ALL' ? 'border-slate-900 ring-1 ring-slate-900/10' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total de Ocorrências
                </span>
                <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                  <BarChart3 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">{kpiMetrics.total}</span>
                <span className="text-xs text-slate-500 font-medium">registradas</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold">
                  <Camera className="w-3.5 h-3.5" />
                  {kpiMetrics.totalPhotosCount} foto(s) em {kpiMetrics.withPhotosCount} reg.
                </span>
              </div>
            </button>

            {/* KPI 2: Ocorrências Atendidas / Resolvidas */}
            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === 'RESOLVED_ONLY' ? 'ALL' : 'RESOLVED_ONLY')
              }
              className={`text-left bg-white p-4 rounded-xl border transition shadow-xs hover:shadow-md ${
                statusFilter === 'RESOLVED_ONLY'
                  ? 'border-emerald-600 ring-2 ring-emerald-500/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Já Atendidas / Resolvidas
                </span>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-emerald-600">
                    {kpiMetrics.resolvedCount}
                  </span>
                  <span className="text-xs text-slate-500">de {kpiMetrics.total}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                  {kpiMetrics.resolutionRate}%
                </span>
              </div>
              <div className="mt-2.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${kpiMetrics.resolutionRate}%` }}
                />
              </div>
            </button>

            {/* KPI 3: Em Aberto / Pendentes */}
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'OPEN_ONLY' ? 'ALL' : 'OPEN_ONLY')}
              className={`text-left bg-white p-4 rounded-xl border transition shadow-xs hover:shadow-md ${
                statusFilter === 'OPEN_ONLY'
                  ? 'border-rose-600 ring-2 ring-rose-500/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                  Ainda em Aberto
                </span>
                <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                  <AlertOctagon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-rose-600">
                    {kpiMetrics.openCount}
                  </span>
                  <span className="text-xs text-slate-500">
                    ({kpiMetrics.inProgressCount} em tratativa)
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                {kpiMetrics.overdueCount > 0 ? (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    <Clock className="w-3 h-3" />
                    {kpiMetrics.overdueCount} com prazo vencido
                  </span>
                ) : (
                  <span className="text-slate-500">
                    {kpiMetrics.criticalOpenCount} de severidade alta/crítica
                  </span>
                )}
              </div>
            </button>

            {/* KPI 4: Prazo Médio de Atendimento */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  Prazo Médio Atendimento
                </span>
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <Timer className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-slate-900">
                  {kpiMetrics.avgResolutionDays !== null
                    ? String(kpiMetrics.avgResolutionDays).replace('.', ',')
                    : '—'}
                </span>
                <span className="text-xs font-bold text-slate-600">dias p/ resolver</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
                <span>
                  Abertas há média de{' '}
                  <strong className="text-slate-800">
                    {String(kpiMetrics.avgOpenDays).replace('.', ',')}d
                  </strong>
                </span>
              </div>
            </div>

            {/* KPI 5: Tipo que Demora Mais Tempo (Gargalo) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                    Tipo Mais Demorado
                  </span>
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                    <Flame className="w-4 h-4" />
                  </div>
                </div>
                {kpiMetrics.slowestResolvedType ? (
                  <>
                    <div
                      className="mt-1.5 text-sm font-extrabold text-slate-900 truncate"
                      title={kpiMetrics.slowestResolvedType.label}
                    >
                      {kpiMetrics.slowestResolvedType.label}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="font-bold text-purple-700">
                        Média:{' '}
                        {String(kpiMetrics.slowestResolvedType.metricDays).replace('.', ',')}{' '}
                        dia(s)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ({kpiMetrics.slowestResolvedType.totalCount} reg.)
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 mt-2">Sem dados suficientes</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowDetailedAnalytics((v) => !v)}
                className="mt-2 pt-1.5 border-t border-slate-100 inline-flex items-center justify-between text-[11px] font-bold text-indigo-600 hover:text-indigo-800 w-full"
              >
                <span>
                  {showDetailedAnalytics ? 'Ocultar Ranking por Tipo' : 'Ver Ranking por Tipo e Status'}
                </span>
                {showDetailedAnalytics ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Painel Expandido: Ranking de Tempo Médio por Tipo e Distribuição por Status */}
          {showDetailedAnalytics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              {/* Coluna 1: Qual tipo de ocorrência demora mais tempo para ser atendida */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-purple-600" />
                      Prazo Médio de Atendimento por Categoria / Tipo
                    </h4>
                    <p className="text-xs text-slate-500">
                      Identifica quais naturezas de ocorrência exigem maior tempo de resposta em campo
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {kpiMetrics.typeRanking.map((tp, idx) => {
                    const maxDays = Math.max(
                      ...kpiMetrics.typeRanking.map((t) => t.metricDays),
                      1
                    );
                    const widthPct = Math.max(8, Math.round((tp.metricDays / maxDays) * 100));
                    return (
                      <div
                        key={tp.code}
                        onClick={() =>
                          setTypeFilter(typeFilter === tp.code ? 'ALL' : tp.code)
                        }
                        className={`p-2.5 rounded-lg border transition cursor-pointer ${
                          typeFilter === tp.code
                            ? 'bg-indigo-50/60 border-indigo-400'
                            : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}º
                            </span>
                            <span className="font-bold text-slate-800 truncate">{tp.label}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-slate-500">
                              {tp.resolvedCount}/{tp.totalCount} atendidas
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-extrabold text-slate-900">
                              {String(tp.metricDays).replace('.', ',')} dia(s)
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${tp.bar || 'bg-indigo-600'} rounded-full`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Coluna 2: Índices por Status e Ações Rápidas de Relatório */}
              <div className="flex flex-col justify-between space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4 text-amber-600" />
                    Distribuição por Status Atual
                  </h4>
                  <p className="text-xs text-slate-500 mb-3">
                    Clique em qualquer status abaixo para filtrar a listagem ou gerar relatório específico
                  </p>

                  <div className="space-y-2.5">
                    {kpiMetrics.statusBreakdown.map((st) => (
                      <div
                        key={st.code}
                        onClick={() =>
                          setStatusFilter(statusFilter === st.code ? 'ALL' : st.code)
                        }
                        className={`p-3 rounded-lg border transition cursor-pointer flex items-center justify-between ${
                          statusFilter === st.code
                            ? 'bg-amber-50/70 border-amber-400'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${st.badge}`}>
                            {st.label}
                          </span>
                          <span className="text-xs text-slate-600 font-medium">
                            {st.count} ocorrência(s)
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${st.bar || 'bg-slate-600'}`}
                              style={{ width: `${st.pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-extrabold text-slate-800 w-9 text-right">
                            {st.pct}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-amber-400">
                      Precisa emitir um relatório oficial por status?
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Gere PDF A4 com o Banner da obra, quadro de KPIs e fotos anexadas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReportStatusGroup(statusFilter);
                      setActiveView('REPORT');
                    }}
                    className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 transition"
                  >
                    Abrir Gerador de Relatório →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          VIEW 3: GERADOR DE RELATÓRIOS POR STATUS (PDF A4 + EXCEL)
         ===================================================================== */}
      {activeView === 'REPORT' && (
        <div className="space-y-5">
          {/* Barra de Configuração do Relatório (Não sai na impressão) */}
          <div className="no-print bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Relatório Gerencial de Ocorrências por Status (PDF A4 / Excel)
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Selecione o status desejado, personalize a exibição de fotos e KPIs e imprima em folha A4 com o cabeçalho configurado no Módulo 8.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Exportar Excel (.xls)
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-xs transition"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir / Salvar em PDF
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('LIST')}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                >
                  Voltar
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Seleção Rápida de Status (Pills) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  1. Filtrar Relatório por Status:
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { code: 'ALL', label: `Todos os Status (${occurrences.length})` },
                    { code: 'OPEN_ONLY', label: `Apenas Em Aberto / Pendentes (${kpiMetrics.openCount})` },
                    { code: 'RESOLVED_ONLY', label: `Apenas Atendidas / Resolvidas (${kpiMetrics.resolvedCount})` },
                    ...groupedParams.STATUS.map((st) => ({
                      code: st.code,
                      label: st.label
                    }))
                  ].map((opt) => (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => setReportStatusGroup(opt.code)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        reportStatusGroup === opt.code
                          ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtros Complementares e Opções de Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Categoria / Tipo
                  </label>
                  <select
                    value={reportTypeFilter}
                    onChange={(e) => setReportTypeFilter(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="ALL">Todas as Categorias</option>
                    {groupedParams.TYPE.map((t) => (
                      <option key={t.id} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Grau de Severidade
                  </label>
                  <select
                    value={reportSeverityFilter}
                    onChange={(e) => setReportSeverityFilter(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="ALL">Todas as Severidades</option>
                    {groupedParams.SEVERITY.map((s) => (
                      <option key={s.id} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Data Inicial
                  </label>
                  <input
                    type="date"
                    value={reportDateFrom}
                    onChange={(e) => setReportDateFrom(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Data Final
                  </label>
                  <input
                    type="date"
                    value={reportDateTo}
                    onChange={(e) => setReportDateTo(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-2 border-t border-slate-100 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={reportIncludeKpis}
                    onChange={(e) => setReportIncludeKpis(e.target.checked)}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  Incluir Resumo de KPIs e Prazos Médios
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={reportGroupByStatus}
                    onChange={(e) => setReportGroupByStatus(e.target.checked)}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  Agrupar Seções por Status
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={reportIncludePhotos}
                    onChange={(e) => setReportIncludePhotos(e.target.checked)}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  Incluir Evidências Fotográficas Anexadas
                </label>
              </div>
            </div>
          </div>

          {/* FOLHA A4 DE PRÉ-VISUALIZAÇÃO E IMPRESSÃO DO RELATÓRIO */}
          <div
            id="occurrences-printable-report"
            className="bg-white max-w-[210mm] mx-auto p-6 sm:p-8 rounded-xl border border-slate-300 shadow-md text-slate-900"
          >
            {/* Cabeçalho Oficial (Módulo 8 Banner) */}
            {renderReportBanner()}

            {/* Título do Relatório de Status */}
            <div className="border border-slate-900 bg-slate-900 text-white px-3 py-1.5 mb-3 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider">
                RELATÓRIO DE OCORRÊNCIAS POR STATUS —{' '}
                {reportStatusGroup === 'ALL'
                  ? 'TODOS OS STATUS'
                  : reportStatusGroup === 'OPEN_ONLY'
                  ? 'OCORRÊNCIAS EM ABERTO / PENDENTES'
                  : reportStatusGroup === 'RESOLVED_ONLY'
                  ? 'OCORRÊNCIAS ATENDIDAS / CONCLUÍDAS'
                  : resolveParamInfo('STATUS', reportStatusGroup).label.toUpperCase()}
              </span>
              <span className="text-[11px] font-semibold text-amber-400">
                {reportOccurrences.length} registro(s) selecionado(s)
              </span>
            </div>

            {/* Bloco Resumo de Indicadores (KPIs) no Relatório */}
            {reportIncludeKpis && (
              <div className="mb-4 print-break-inside-avoid">
                <div className="grid grid-cols-5 border border-slate-900 divide-x divide-slate-900 text-center bg-slate-50">
                  <div className="p-2">
                    <div className="text-[9px] font-bold uppercase text-slate-500">
                      Total Geral
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      {kpiMetrics.total}
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-[9px] font-bold uppercase text-emerald-700">
                      Atendidas
                    </div>
                    <div className="text-base font-extrabold text-emerald-700">
                      {kpiMetrics.resolvedCount} ({kpiMetrics.resolutionRate}%)
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-[9px] font-bold uppercase text-rose-700">
                      Em Aberto
                    </div>
                    <div className="text-base font-extrabold text-rose-700">
                      {kpiMetrics.openCount}
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-[9px] font-bold uppercase text-amber-800">
                      Prazo Médio Atend.
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      {kpiMetrics.avgResolutionDays !== null
                        ? `${String(kpiMetrics.avgResolutionDays).replace('.', ',')} dias`
                        : '—'}
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-[9px] font-bold uppercase text-purple-800">
                      Maior Tempo Médio
                    </div>
                    <div className="text-[11px] font-extrabold text-slate-900 truncate">
                      {kpiMetrics.slowestResolvedType
                        ? `${kpiMetrics.slowestResolvedType.label} (${String(
                            kpiMetrics.slowestResolvedType.metricDays
                          ).replace('.', ',')}d)`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Listagem de Ocorrências Agrupadas por Status */}
            {reportGroupedByStatus.length === 0 ? (
              <div className="p-8 text-center border border-slate-300 text-xs text-slate-500">
                Nenhuma ocorrência encontrada para os filtros selecionados neste relatório.
              </div>
            ) : (
              <div className="space-y-4">
                {reportGroupedByStatus.map((group) => (
                  <div key={group.statusCode} className="space-y-2">
                    <div className="bg-slate-200 border border-slate-900 px-3 py-1 flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase text-slate-900">
                        STATUS: {group.statusLabel}
                      </span>
                      <span className="text-[11px] font-bold text-slate-700">
                        {group.items.length} ocorrência(s)
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {group.items.map((oc, idx) => {
                        const tp = resolveParamInfo('TYPE', oc.type);
                        const sev = resolveParamInfo('SEVERITY', oc.severity);
                        const st = resolveParamInfo('STATUS', oc.status);
                        const lead = getOccurrenceLeadTime(oc);
                        const photos = Array.isArray(oc.photos) ? oc.photos : [];

                        return (
                          <div
                            key={oc.id}
                            className="border border-slate-900 p-3 text-xs print-break-inside-avoid bg-white"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-300">
                              <div className="font-extrabold text-slate-900 text-xs">
                                #{oc.id} — {oc.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                <span className="px-1.5 py-0.5 border border-slate-400 font-bold">
                                  Tipo: {tp.label}
                                </span>
                                <span className="px-1.5 py-0.5 border border-slate-400 font-bold">
                                  Severidade: {sev.label}
                                </span>
                                <span className="px-1.5 py-0.5 border border-slate-900 bg-slate-100 font-extrabold">
                                  Status: {st.label}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-700 mb-2 bg-slate-50 p-1.5 border border-slate-200">
                              <div>
                                <strong>Data Registro:</strong> {formatDateBR(oc.occurrence_date)}
                              </div>
                              <div>
                                <strong>Prazo / Atendimento:</strong>{' '}
                                {lead.isResolved
                                  ? `Resolvida em ${formatDateBR(oc.resolved_at || oc.occurrence_date)} (${lead.days}d)`
                                  : `Em aberto há ${lead.days} dia(s)`}
                              </div>
                              <div>
                                <strong>Setor / Local:</strong> {oc.location_area || '—'}
                              </div>
                              <div>
                                <strong>Responsável:</strong> {oc.responsible || oc.author_name || '—'}
                              </div>
                            </div>

                            <div className="text-[11px] text-slate-800 mb-1">
                              <strong>Descrição do Fato:</strong> {oc.description}
                            </div>

                            {oc.action_taken && (
                              <div className="text-[11px] text-slate-800 bg-slate-50 p-1.5 border-l-2 border-slate-800">
                                <strong>Providências / Tratativa:</strong> {oc.action_taken}
                              </div>
                            )}

                            {/* Fotos no Relatório */}
                            {reportIncludePhotos && photos.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-200">
                                <div className="text-[10px] font-bold uppercase text-slate-600 mb-1.5">
                                  Evidências Fotográficas ({photos.length}):
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {photos.map((ph) => {
                                    const phInfo = resolvePhaseInfo(ph.phase);
                                    return (
                                      <div
                                        key={ph.id}
                                        className="border border-slate-300 p-1 bg-slate-50 flex flex-col"
                                      >
                                        <img
                                          src={ph.image_url}
                                          alt={ph.caption || 'Evidência'}
                                          className="w-full h-28 object-cover border border-slate-200 bg-white"
                                        />
                                        <div className="mt-1 flex items-center justify-between text-[9px]">
                                          <span className="font-bold uppercase text-slate-700">
                                            [{phInfo.code}]
                                          </span>
                                        </div>
                                        {ph.caption && (
                                          <div className="text-[10px] text-slate-700 leading-tight mt-0.5">
                                            {ph.caption}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rodapé de Assinaturas do Relatório */}
            <div className="mt-8 pt-4 border-t border-slate-400 grid grid-cols-3 gap-6 text-center text-[10px] text-slate-700 print-break-inside-avoid">
              <div className="pt-6 border-t border-slate-800">
                <strong>{reportSettings?.contractor_representative || 'Engenheiro Residente'}</strong>
                <div>Responsável Técnico / Contratada</div>
              </div>
              <div className="pt-6 border-t border-slate-800">
                <strong>{reportSettings?.supervisor_engineer || 'Engenheiro Supervisor'}</strong>
                <div>Supervisora de Obras</div>
              </div>
              <div className="pt-6 border-t border-slate-800">
                <strong>{reportSettings?.fiscal_engineer || 'Fiscalização'}</strong>
                <div>Fiscal do Contrato</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 2: GERENCIAMENTO DE CAMPOS (CATEGORIA, SEVERIDADE, STATUS, SETOR)
         ===================================================================== */}
      {activeView === 'PARAMS' && (
        <div className="no-print bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
      )}

      {/* =====================================================================
          VIEW 1: LIVRO DE OCORRÊNCIAS (FILTROS, FOTOS E LISTAGEM)
         ===================================================================== */}
      {activeView === 'LIST' && (
        <>
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                <option value="OPEN_ONLY">⚡ Apenas Em Aberto / Pendentes</option>
                <option value="RESOLVED_ONLY">✅ Apenas Atendidas / Resolvidas</option>
                {groupedParams.STATUS.map((st) => (
                  <option key={st.id} value={st.code}>
                    {st.label}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">Todas as Categorias / Tipos</option>
                {groupedParams.TYPE.map((tp) => (
                  <option key={tp.id} value={tp.code}>
                    {tp.label}
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

            {(statusFilter !== 'ALL' ||
              typeFilter !== 'ALL' ||
              severityFilter !== 'ALL' ||
              sectorFilter !== 'ALL' ||
              searchQuery) && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <span className="text-slate-500">
                  Exibindo <strong>{filtered.length}</strong> de <strong>{occurrences.length}</strong> ocorrências
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setTypeFilter('ALL');
                    setSeverityFilter('ALL');
                    setSectorFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="text-rose-600 hover:text-rose-700 font-bold"
                >
                  Limpar filtros ativos
                </button>
              </div>
            )}
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
                const resolved = isOccurrenceResolved(item);
                const lead = getOccurrenceLeadTime(item);
                const isOverdue =
                  !resolved && item.due_date && String(item.due_date).slice(0, 10) < todayISO;
                const photos = Array.isArray(item.photos) ? item.photos : [];

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition ${
                      isOverdue ? 'border-rose-300' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="space-y-2.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${sev.badge}`}>
                            Severidade: {sev.label}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${st.badge}`}
                          >
                            {resolved ? (
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

                          {/* Lead Time / SLA Badge */}
                          {resolved ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                              <Timer className="w-3.5 h-3.5" />
                              Atendida em {lead.days} dia(s)
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-md border border-rose-300">
                              <Clock className="w-3.5 h-3.5" />
                              Prazo vencido ({formatDateBR(item.due_date)}) • {lead.days}d em aberto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                              <Timer className="w-3.5 h-3.5" />
                              Em aberto há {lead.days} dia(s)
                            </span>
                          )}
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

                        {/* Galeria de Fotos Anexadas à Ocorrência */}
                        {photos.length > 0 && (
                          <div className="pt-2">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <Camera className="w-3.5 h-3.5 text-indigo-600" />
                                Fotos Anexadas ({photos.length})
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                              {photos.map((ph, pIdx) => {
                                const phaseInfo = resolvePhaseInfo(ph.phase);
                                return (
                                  <div
                                    key={ph.id}
                                    onClick={() =>
                                      setLightboxState({
                                        occurrence: item,
                                        photos,
                                        index: pIdx
                                      })
                                    }
                                    className="group relative w-28 sm:w-32 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer shadow-2xs hover:shadow-md transition"
                                  >
                                    <div className="h-20 w-full overflow-hidden bg-slate-900/5 relative">
                                      <img
                                        src={ph.image_url}
                                        alt={ph.caption || 'Foto da ocorrência'}
                                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                                      />
                                      <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/30 transition flex items-center justify-center">
                                        <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition" />
                                      </div>
                                    </div>
                                    <div className="p-1.5">
                                      <span
                                        className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold border ${phaseInfo.badge}`}
                                      >
                                        {phaseInfo.code}
                                      </span>
                                      {ph.caption && (
                                        <p className="text-[10px] text-slate-600 truncate mt-0.5" title={ph.caption}>
                                          {ph.caption}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            Data: <strong className="text-slate-700">{formatDateBR(item.occurrence_date)}</strong>
                          </span>
                          {item.due_date && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              Prazo Limite: <strong className="text-slate-700">{formatDateBR(item.due_date)}</strong>
                            </span>
                          )}
                          {resolved && item.resolved_at && (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Atendida em: <strong>{formatDateBR(item.resolved_at)}</strong>
                            </span>
                          )}
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openQuickPhotoModal(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition"
                            title="Anexar fotos a esta ocorrência"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            + Fotos ({photos.length})
                          </button>

                          {!resolved && (
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
                            title="Editar ocorrência / providências / fotos"
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

      {/* =====================================================================
          MODAL 1: CRIAR / EDITAR OCORRÊNCIA COM ANEXO DE FOTOS E PRAZOS
         ===================================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingItem ? 'Editar Ocorrência, Providências e Fotos' : 'Registrar Nova Ocorrência de Obra'}
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Título Resumido da Ocorrência *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Atraso na entrega de concreto usinado ou Parada de equipamento"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">2. Severidade *</label>
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
                    onChange={(e) => {
                      const nextSt = e.target.value;
                      const isRes = resolvedStatusCodes.has(nextSt);
                      setForm({
                        ...form,
                        status: nextSt,
                        resolved_at: isRes ? (form.resolved_at || todayISO) : form.resolved_at
                      });
                    }}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data Ocorrência *</label>
                  <input
                    type="date"
                    required
                    value={form.occurrence_date}
                    onChange={(e) => setForm({ ...form, occurrence_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {resolvedStatusCodes.has(form.status) ? 'Data Atendimento' : 'Prazo Limite (SLA)'}
                  </label>
                  {resolvedStatusCodes.has(form.status) ? (
                    <input
                      type="date"
                      value={form.resolved_at || todayISO}
                      onChange={(e) => setForm({ ...form, resolved_at: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-emerald-400 bg-emerald-50/40 text-sm"
                    />
                  ) : (
                    <input
                      type="date"
                      value={form.due_date || ''}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  )}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Responsável pela Tratativa
                  </label>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição Detalhada do Fato *
                </label>
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

              {/* ===============================================================
                  SEÇÃO DE FOTOS ANEXADAS À OCORRÊNCIA
                 =============================================================== */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-indigo-600" />
                      Evidências Fotográficas da Ocorrência
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Anexe fotos do registro inicial, da tratativa em andamento ou da conclusão do serviço.
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFilesSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition shrink-0"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Selecionar Fotos
                  </button>
                </div>

                {/* Fotos já salvas (em modo edição) */}
                {existingPhotos.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase text-slate-500">
                      Fotos já anexadas ({existingPhotos.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {existingPhotos.map((ph) => (
                        <div
                          key={ph.id}
                          className="p-2 rounded-lg bg-white border border-slate-200 flex items-start gap-2.5"
                        >
                          <img
                            src={ph.image_url}
                            alt={ph.caption}
                            className="w-16 h-16 rounded object-cover border border-slate-200 shrink-0"
                          />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <select
                              value={ph.phase || 'REGISTRO'}
                              onChange={(e) =>
                                handleUpdateExistingPhotoMeta(ph.id, ph.caption, e.target.value)
                              }
                              className="w-full px-2 py-1 rounded border border-slate-300 text-[11px] font-semibold bg-slate-50"
                            >
                              {PHOTO_PHASES.map((p) => (
                                <option key={p.code} value={p.code}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Legenda da foto..."
                              value={ph.caption || ''}
                              onChange={(e) =>
                                handleUpdateExistingPhotoMeta(ph.id, e.target.value, ph.phase)
                              }
                              className="w-full px-2 py-1 rounded border border-slate-200 text-xs"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteExistingPhoto(ph.id)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="Remover foto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Novas fotos selecionadas para envio */}
                {pendingPhotos.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase text-indigo-600">
                      Novas fotos prontas para anexar ({pendingPhotos.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {pendingPhotos.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-white border border-indigo-200 flex items-start gap-2.5"
                        >
                          <img
                            src={item.base64}
                            alt={item.caption}
                            className="w-16 h-16 rounded object-cover border border-slate-200 shrink-0"
                          />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <select
                              value={item.phase}
                              onChange={(e) =>
                                setPendingPhotos((prev) =>
                                  prev.map((p, i) => (i === idx ? { ...p, phase: e.target.value } : p))
                                )
                              }
                              className="w-full px-2 py-1 rounded border border-slate-300 text-[11px] font-semibold bg-slate-50"
                            >
                              {PHOTO_PHASES.map((p) => (
                                <option key={p.code} value={p.code}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Legenda da foto..."
                              value={item.caption}
                              onChange={(e) =>
                                setPendingPhotos((prev) =>
                                  prev.map((p, i) => (i === idx ? { ...p, caption: e.target.value } : p))
                                )
                              }
                              className="w-full px-2 py-1 rounded border border-slate-200 text-xs"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingPhotos((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold text-sm shadow-sm"
                >
                  {submitting
                    ? 'Salvando...'
                    : editingItem
                    ? 'Salvar Alterações'
                    : 'Registrar Ocorrência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: ANEXAR FOTOS RÁPIDO DIRETO DO CARD DA OCORRÊNCIA
         ===================================================================== */}
      {quickPhotoTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-indigo-600" />
                  Anexar Fotos à Ocorrência #{quickPhotoTarget.id}
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-md">
                  {quickPhotoTarget.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickPhotoTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickPhotos} className="space-y-4">
              <div>
                <input
                  ref={quickFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleQuickFilesSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => quickFileInputRef.current?.click()}
                  className="w-full py-6 border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl bg-indigo-50/40 hover:bg-indigo-50 transition flex flex-col items-center justify-center gap-1.5 text-indigo-700"
                >
                  <Camera className="w-7 h-7" />
                  <span className="text-xs font-bold">
                    Clique para selecionar uma ou mais fotos do dispositivo
                  </span>
                  <span className="text-[11px] text-slate-500">
                    JPG, PNG, WEBP ou SVG • Registro Inicial, Tratativa ou Conclusão
                  </span>
                </button>
              </div>

              {quickPhotoItems.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {quickPhotoItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-3"
                    >
                      <img
                        src={item.base64}
                        alt={item.caption}
                        className="w-16 h-16 rounded object-cover border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 space-y-1.5">
                        <select
                          value={item.phase}
                          onChange={(e) =>
                            setQuickPhotoItems((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, phase: e.target.value } : p))
                            )
                          }
                          className="w-full px-2.5 py-1 rounded border border-slate-300 text-xs font-semibold bg-white"
                        >
                          {PHOTO_PHASES.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Legenda descritiva da foto..."
                          value={item.caption}
                          onChange={(e) =>
                            setQuickPhotoItems((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, caption: e.target.value } : p
                              )
                            )
                          }
                          className="w-full px-2.5 py-1 rounded border border-slate-300 text-xs bg-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setQuickPhotoItems((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuickPhotoTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={quickPhotoItems.length === 0 || quickPhotoUploading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs"
                >
                  {quickPhotoUploading
                    ? 'Anexando...'
                    : `Salvar ${quickPhotoItems.length} Foto(s)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: LIGHTBOX DE VISUALIZAÇÃO DE FOTOS DA OCORRÊNCIA
         ===================================================================== */}
      {lightboxState && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxState(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const currentPhoto = lightboxState.photos[lightboxState.index];
              const phaseInfo = resolvePhaseInfo(currentPhoto?.phase);
              const total = lightboxState.photos.length;
              return (
                <>
                  <div className="p-4 bg-slate-950 text-white flex items-center justify-between gap-4 border-b border-slate-800">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${phaseInfo.badge}`}>
                          {phaseInfo.label}
                        </span>
                        <span className="text-xs text-slate-400">
                          Foto {lightboxState.index + 1} de {total}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white truncate mt-1">
                        {lightboxState.occurrence.title}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLightboxState(null)}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="relative bg-slate-950 flex items-center justify-center min-h-[320px] max-h-[68vh]">
                    <img
                      src={currentPhoto?.image_url}
                      alt={currentPhoto?.caption || 'Evidência'}
                      className="max-h-[65vh] w-auto object-contain"
                    />
                    {total > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxState((prev) => ({
                              ...prev,
                              index: (prev.index - 1 + total) % total
                            }))
                          }
                          className="absolute left-3 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxState((prev) => ({
                              ...prev,
                              index: (prev.index + 1) % total
                            }))
                          }
                          className="absolute right-3 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="p-4 bg-slate-900 text-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800">
                    <div>
                      <strong className="text-amber-400">Legenda:</strong>{' '}
                      {currentPhoto?.caption || 'Sem legenda descritiva'}
                    </div>
                    <div className="text-slate-400">
                      Data da Ocorrência: {formatDateBR(lightboxState.occurrence.occurrence_date)}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
