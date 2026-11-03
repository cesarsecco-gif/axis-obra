import React, { useState, useEffect, useMemo } from 'react';
import {
  Camera,
  Plus,
  Edit3,
  Trash2,
  MapPin,
  Calendar,
  User,
  Upload,
  Eye,
  X,
  Sun,
  Cloud,
  CloudRain,
  Sparkles,
  Building2,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Layers,
  CopyCheck,
  Images,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';
import PhotoReportModal from './PhotoReportModal';

// Classes completas (literais) para o Tailwind gerar o CSS das cores configuráveis.
const STAGE_COLOR_CLASSES = {
  slate: 'bg-slate-100 text-slate-800 border-slate-300',
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  orange: 'bg-orange-100 text-orange-800 border-orange-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  sky: 'bg-sky-100 text-sky-800 border-sky-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  purple: 'bg-purple-100 text-purple-800 border-purple-300',
  cyan: 'bg-cyan-100 text-cyan-800 border-cyan-300'
};

// Opções padrão, usadas apenas enquanto a configuração (Configurações Gerais > Etapa Construtiva)
// não carrega ou se ela estiver vazia.
const DEFAULT_STAGES = [
  { value: 'TERRAPLANAGEM', label: 'Terraplanagem', color: STAGE_COLOR_CLASSES.amber },
  { value: 'FUNDACAO', label: 'Fundação', color: STAGE_COLOR_CLASSES.sky },
  { value: 'ESTRUTURA', label: 'Estrutura / Concreto', color: STAGE_COLOR_CLASSES.indigo },
  { value: 'ALVENARIA', label: 'Alvenaria / Vedação', color: STAGE_COLOR_CLASSES.orange },
  { value: 'INSTALACOES', label: 'Instalações (Elét/Hidr)', color: STAGE_COLOR_CLASSES.sky },
  { value: 'COBERTURA', label: 'Cobertura', color: STAGE_COLOR_CLASSES.purple },
  { value: 'ACABAMENTO', label: 'Acabamento / Revestimento', color: STAGE_COLOR_CLASSES.emerald },
  { value: 'SEGURANCA', label: 'Segurança do Trabalho (NR-18)', color: STAGE_COLOR_CLASSES.rose },
  { value: 'VISTORIA', label: 'Vistoria Geral', color: STAGE_COLOR_CLASSES.slate }
];

const WEATHER_LABELS = {
  SOL: { label: 'Ensolarado', icon: Sun, color: 'text-amber-500' },
  NUBLADO: { label: 'Nublado', icon: Cloud, color: 'text-slate-500' },
  CHUVA_FRACA: { label: 'Chuva Fraca', icon: CloudRain, color: 'text-blue-500' },
  CHUVA_FORTE: { label: 'Chuva Forte', icon: CloudRain, color: 'text-indigo-600' }
};

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

function cleanFileNameToTitle(filename) {
  if (!filename) return '';
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt.replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export default function PhotosView({ projects, selectedProjectId, onRefreshDashboard }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Grouping
  const [stageFilter, setStageFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [groupBy, setGroupBy] = useState('MONTH_YEAR'); // 'MONTH_YEAR' | 'YEAR' | 'DATE' | 'STAGE' | 'NONE'
  const [sortOrder, setSortOrder] = useState('DESC'); // 'DESC' (Mais recentes) | 'ASC' (Mais antigas / Cronológica)
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Modal & Edit States
  const [showModal, setShowModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState('');
  const [error, setError] = useState('');

  // Etapas Construtivas configuráveis (Configurações Gerais > Campos Personalizáveis)
  const [STAGES, setStages] = useState(DEFAULT_STAGES);
  const defaultStageCode = STAGES.some((st) => st.value === 'ESTRUTURA')
    ? 'ESTRUTURA'
    : STAGES[0]?.value || 'ESTRUTURA';

  // Common batch defaults (for New Photo Batch) & single Edit form
  const initialCommonForm = {
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
    taken_at: new Date().toISOString().slice(0, 10),
    weather_condition: 'SOL',
    default_stage: defaultStageCode,
    default_location_area: '',
    // Used when editing a single existing photo:
    title: '',
    description: '',
    stage: defaultStageCode,
    location_area: ''
  };

  const [form, setForm] = useState(initialCommonForm);


  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/occurrence-params?group=PHOTO_STAGE')
      .then((rows) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        const loaded = rows.map((r) => ({
          value: r.code,
          label: r.label,
          color: STAGE_COLOR_CLASSES[r.color] || STAGE_COLOR_CLASSES.slate
        }));
        setStages(loaded);
        // Se a etapa padrão do formulário foi removida da configuração, usa a primeira disponível.
        setForm((prev) => {
          const codes = loaded.map((st) => st.value);
          const next = { ...prev };
          if (!codes.includes(prev.default_stage)) next.default_stage = codes[0];
          if (!codes.includes(prev.stage)) next.stage = codes[0];
          return next;
        });
      })
      .catch((err) => console.error('Erro ao carregar etapas construtivas:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Queue of photos when creating (supports 1 or many photos in the same batch)
  // Each item: { id, file, base64, previewUrl, title, stage, location_area, description }
  const [batchItems, setBatchItems] = useState([]);

  // Single file replacement when editing an existing photo
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [generatedBase64, setGeneratedBase64] = useState('');

  useEffect(() => {
    if (!editingPhoto) {
      if (selectedProjectId !== 'ALL') {
        setForm((prev) => ({ ...prev, project_id: selectedProjectId }));
      } else if (!form.project_id && projects.length > 0) {
        setForm((prev) => ({ ...prev, project_id: projects[0].id }));
      }
    }
  }, [selectedProjectId, projects, editingPhoto]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'ALL') params.set('projectId', selectedProjectId);
      if (stageFilter && stageFilter !== 'ALL') params.set('stage', stageFilter);
      const data = await apiRequest(`/api/photos?${params.toString()}`);
      setPhotos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, [selectedProjectId, stageFilter]);

  const openCreateModal = () => {
    setEditingPhoto(null);
    setError('');
    setSubmitProgress('');
    setForm({
      ...initialCommonForm,
      project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
    });
    setBatchItems([]);
    setSelectedFile(null);
    setGeneratedBase64('');
    setPreviewUrl('');
    setShowModal(true);
  };

  const openEditModal = (photo) => {
    setEditingPhoto(photo);
    setError('');
    setSubmitProgress('');
    setForm({
      ...initialCommonForm,
      project_id: photo.project_id,
      title: photo.title || '',
      description: photo.description || '',
      stage: photo.stage || defaultStageCode,
      location_area: photo.location_area || '',
      taken_at: String(photo.taken_at || '').slice(0, 10),
      weather_condition: photo.weather_condition || 'SOL'
    });
    setSelectedFile(null);
    setGeneratedBase64('');
    setPreviewUrl(photo.image_url || '');
    setShowModal(true);
  };

  // Handle selecting multiple files in Create Mode
  const handleBatchFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        const autoTitle =
          cleanFileNameToTitle(file.name) ||
          `Registro Fotográfico #${batchItems.length + index + 1}`;
        setBatchItems((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
            file,
            base64: '',
            previewUrl: reader.result,
            title: autoTitle,
            stage: form.default_stage || defaultStageCode,
            location_area: form.default_location_area || '',
            description: ''
          }
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input so selecting the same file again works if needed
    e.target.value = '';
  };

  const updateBatchItem = (itemId, field, value) => {
    setBatchItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    );
  };

  const removeBatchItem = (itemId) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const applyDefaultsToAllBatchItems = () => {
    setBatchItems((prev) =>
      prev.map((item) => ({
        ...item,
        stage: form.default_stage,
        location_area: form.default_location_area || item.location_area
      }))
    );
  };

  // Handle single file replacement in Edit Mode
  const handleEditFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setGeneratedBase64('');
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const buildStampedSvgBase64 = ({ projectId, title, locationArea, stage, takenAt }) => {
    const proj = projects.find((p) => Number(p.id) === Number(projectId)) || projects[0];
    const titleText = title || 'Inspeção de Execução de Serviço em Campo';
    const areaText = locationArea || 'Setor Principal • Canteiro de Obras';
    const stageText = stage || 'ESTRUTURA';
    const dateText = formatDateBR(takenAt);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#1e3a8a"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#g)"/>
      <g stroke="#f59e0b" stroke-width="2" fill="none" opacity="0.35">
        <rect x="60" y="90" width="680" height="270" stroke-dasharray="8,6"/>
        <line x1="60" y1="180" x2="740" y2="180"/>
        <line x1="60" y1="270" x2="740" y2="270"/>
        <line x1="280" y1="90" x2="280" y2="360"/>
        <line x1="520" y1="90" x2="520" y2="360"/>
      </g>
      <rect x="30" y="25" width="210" height="36" rx="6" fill="#f59e0b"/>
      <text x="135" y="49" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a" text-anchor="middle">${stageText}</text>
      <rect x="0" y="380" width="800" height="120" fill="rgba(15,23,42,0.92)"/>
      <line x1="0" y1="380" x2="800" y2="380" stroke="#f59e0b" stroke-width="3"/>
      <text x="30" y="418" font-family="Arial, sans-serif" font-size="21" font-weight="bold" fill="#ffffff">${titleText.replace(/[<>&"]/g, '')}</text>
      <text x="30" y="448" font-family="Arial, sans-serif" font-size="15" fill="#cbd5e1">${(proj?.name || 'Obra Axis').replace(/[<>&"]/g, '')} • ${areaText.replace(/[<>&"]/g, '')}</text>
      <text x="30" y="478" font-family="Consolas, monospace" font-size="13" fill="#f59e0b">AXIS OBRA RDO • DATA: ${dateText} • REGISTRO DE CAMPO</text>
    </svg>`;

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  };

  const addDemoStampedPhotoToBatch = () => {
    const nextNum = batchItems.length + 1;
    const defaultTitle = `Vistoria Técnica de Execução #${nextNum}`;
    const b64 = buildStampedSvgBase64({
      projectId: form.project_id,
      title: defaultTitle,
      locationArea: form.default_location_area,
      stage: form.default_stage,
      takenAt: form.taken_at
    });

    setBatchItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file: null,
        base64: b64,
        previewUrl: b64,
        title: defaultTitle,
        stage: form.default_stage || defaultStageCode,
        location_area: form.default_location_area || '',
        description: ''
      }
    ]);
  };

  const generateEditStampedImage = () => {
    const b64 = buildStampedSvgBase64({
      projectId: form.project_id,
      title: form.title,
      locationArea: form.location_area,
      stage: form.stage,
      takenAt: form.taken_at
    });
    setSelectedFile(null);
    setGeneratedBase64(b64);
    setPreviewUrl(b64);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.project_id) {
      setError('Selecione a obra vinculada.');
      return;
    }

    // MODE A: EDITING SINGLE PHOTO
    if (editingPhoto) {
      if (!form.title.trim()) {
        setError('Informe o título do registro fotográfico.');
        return;
      }

      setSubmitting(true);
      try {
        const url = `/api/photos/${editingPhoto.id}`;
        if (selectedFile) {
          const fd = new FormData();
          fd.append('project_id', form.project_id);
          fd.append('title', form.title);
          fd.append('description', form.description);
          fd.append('stage', form.stage);
          fd.append('location_area', form.location_area);
          fd.append('taken_at', form.taken_at);
          fd.append('weather_condition', form.weather_condition);
          fd.append('image', selectedFile);

          await apiRequest(url, { method: 'PUT', body: fd });
        } else {
          await apiRequest(url, {
            method: 'PUT',
            body: JSON.stringify({
              project_id: form.project_id,
              title: form.title,
              description: form.description,
              stage: form.stage,
              location_area: form.location_area,
              taken_at: form.taken_at,
              weather_condition: form.weather_condition,
              ...(generatedBase64 ? { image_base64: generatedBase64 } : {})
            })
          });
        }

        setShowModal(false);
        setEditingPhoto(null);
        await loadPhotos();
        if (onRefreshDashboard) onRefreshDashboard();
      } catch (err) {
        setError(err.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // MODE B: CREATING 1 OR MULTIPLE PHOTOS OF THE SAME DAY
    if (batchItems.length === 0) {
      setError('Selecione pelo menos uma foto do dispositivo ou clique em "+ Gerar Foto com Carimbo".');
      return;
    }

    const emptyTitleItem = batchItems.find((item) => !item.title || !item.title.trim());
    if (emptyTitleItem) {
      setError('Todas as fotos da lista precisam ter um título preenchido.');
      return;
    }

    setSubmitting(true);
    try {
      for (let i = 0; i < batchItems.length; i++) {
        const item = batchItems[i];
        setSubmitProgress(`Salvando foto ${i + 1} de ${batchItems.length}...`);

        if (item.file) {
          const fd = new FormData();
          fd.append('project_id', form.project_id);
          fd.append('title', item.title.trim());
          fd.append('description', item.description || '');
          fd.append('stage', item.stage || form.default_stage || defaultStageCode);
          fd.append('location_area', item.location_area || '');
          fd.append('taken_at', form.taken_at);
          fd.append('weather_condition', form.weather_condition);
          fd.append('image', item.file);

          await apiRequest('/api/photos', {
            method: 'POST',
            body: fd
          });
        } else {
          const finalBase64 = buildStampedSvgBase64({
            projectId: form.project_id,
            title: item.title.trim(),
            locationArea: item.location_area,
            stage: item.stage,
            takenAt: form.taken_at
          });

          await apiRequest('/api/photos', {
            method: 'POST',
            body: JSON.stringify({
              project_id: form.project_id,
              title: item.title.trim(),
              description: item.description || '',
              stage: item.stage || form.default_stage || defaultStageCode,
              location_area: item.location_area || '',
              taken_at: form.taken_at,
              weather_condition: form.weather_condition,
              image_base64: finalBase64
            })
          });
        }
      }

      setShowModal(false);
      setBatchItems([]);
      setSubmitProgress('');
      await loadPhotos();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
      setSubmitProgress('');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja realmente excluir este registro fotográfico?')) return;
    try {
      await apiRequest(`/api/photos/${id}`, { method: 'DELETE' });
      await loadPhotos();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  };

  const getStageBadge = (stageValue) => {
    const found = STAGES.find((s) => s.value === stageValue);
    return found || { label: stageValue, color: 'bg-slate-100 text-slate-700 border-slate-300' };
  };

  // Extract distinct years available in photos
  const availableYears = useMemo(() => {
    const yearsSet = new Set([String(new Date().getFullYear())]);
    photos.forEach((p) => {
      const y = String(p.taken_at || '').slice(0, 4);
      if (y && y.length === 4) yearsSet.add(y);
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [photos]);

  // Filter and sort photos by search, year, month, and sortOrder
  const filteredPhotos = useMemo(() => {
    const filtered = photos.filter((p) => {
      const dateStr = String(p.taken_at || '').slice(0, 10);
      const [year, month] = dateStr.split('-');

      if (yearFilter !== 'ALL' && year !== yearFilter) return false;
      if (monthFilter !== 'ALL' && month !== monthFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.title?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.location_area?.toLowerCase().includes(q) ||
        p.project_name?.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const dateA = String(a.taken_at || '');
      const dateB = String(b.taken_at || '');
      if (dateA !== dateB) {
        return sortOrder === 'ASC'
          ? dateA.localeCompare(dateB)
          : dateB.localeCompare(dateA);
      }
      return sortOrder === 'ASC'
        ? Number(a.id) - Number(b.id)
        : Number(b.id) - Number(a.id);
    });
  }, [photos, yearFilter, monthFilter, searchQuery, sortOrder]);

  // Group filtered photos according to groupBy mode
  const groupedPhotos = useMemo(() => {
    if (groupBy === 'NONE') {
      return [
        {
          key: 'ALL',
          title: 'Todos os Registros Fotográficos',
          subtitle: `${filteredPhotos.length} foto(s) exibida(s)`,
          items: filteredPhotos
        }
      ];
    }

    const map = new Map();

    filteredPhotos.forEach((photo) => {
      const dateStr = String(photo.taken_at || '').slice(0, 10);
      const [year = 'Sem Data', month = '01'] = dateStr.split('-');
      const monthIdx = Math.max(0, Math.min(11, Number(month) - 1));
      const monthName = MONTH_NAMES[monthIdx] || month;

      let groupKey = 'ALL';
      let groupTitle = 'Registros';
      let groupSubtitle = '';

      if (groupBy === 'MONTH_YEAR') {
        groupKey = `${year}-${month}`;
        groupTitle = `${monthName} de ${year}`;
        groupSubtitle = `Competência ${month}/${year}`;
      } else if (groupBy === 'YEAR') {
        groupKey = year;
        groupTitle = `Ano ${year}`;
        groupSubtitle = `Registros acumulados em ${year}`;
      } else if (groupBy === 'DATE') {
        groupKey = dateStr;
        groupTitle = `Data: ${formatDateBR(dateStr)}`;
        groupSubtitle = `${monthName} de ${year}`;
      } else if (groupBy === 'STAGE') {
        const stInfo = getStageBadge(photo.stage);
        groupKey = photo.stage || 'OUTROS';
        groupTitle = `Etapa: ${stInfo.label}`;
        groupSubtitle = 'Agrupamento por disciplina construtiva';
      }

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          title: groupTitle,
          subtitle: groupSubtitle,
          items: []
        });
      }
      map.get(groupKey).items.push(photo);
    });

    return Array.from(map.values());
  }, [filteredPhotos, groupBy]);

  const toggleGroupCollapse = (key) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const renderPhotoCard = (photo) => {
    const badge = getStageBadge(photo.stage);
    const weatherInfo = WEATHER_LABELS[photo.weather_condition] || WEATHER_LABELS.SOL;
    const WeatherIcon = weatherInfo.icon;

    return (
      <div
        key={photo.id}
        className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col"
      >
        <div
          className="relative h-52 bg-slate-900 cursor-pointer group overflow-hidden"
          onClick={() => setLightboxPhoto(photo)}
        >
          <img
            src={photo.image_url}
            alt={photo.title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/30 opacity-80 group-hover:opacity-100 transition" />
          <span
            className={`absolute top-3 left-3 px-2.5 py-1 rounded-md text-xs font-bold border ${badge.color}`}
          >
            {badge.label}
          </span>
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(photo);
              }}
              className="p-2 rounded-lg bg-slate-900/75 text-white hover:bg-amber-500 hover:text-slate-950 transition"
              title="Editar registro fotográfico"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-lg bg-slate-900/75 text-white hover:bg-amber-500 hover:text-slate-950 transition"
              title="Ampliar imagem"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white font-medium">
            <span className="inline-flex items-center gap-1 bg-slate-900/75 px-2 py-1 rounded">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              {photo.project_code}
            </span>
            <span className="inline-flex items-center gap-1 bg-slate-900/75 px-2 py-1 rounded">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              {formatDateBR(photo.taken_at)}
            </span>
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base line-clamp-1">{photo.title}</h3>
            <p className="text-xs font-medium text-amber-700 mt-0.5">{photo.project_name}</p>
            {photo.description && (
              <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                {photo.description}
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
            {photo.location_area && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{photo.location_area}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 truncate">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {photo.author_name || 'Equipe Técnica'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-slate-600 mr-1" title={weatherInfo.label}>
                  <WeatherIcon className={`w-3.5 h-3.5 ${weatherInfo.color}`} />
                </span>
                <button
                  onClick={() => openEditModal(photo)}
                  className="p-1 text-slate-400 hover:text-slate-900 rounded transition"
                  title="Editar registro"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                  title="Excluir foto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <Camera className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">1. Registro Fotográfico de Obras</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Acompanhamento visual com upload múltiplo de fotos do dia e agrupamento por Ano, Mês, Data ou Etapa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 font-semibold text-sm shadow-sm transition border border-slate-800"
          >
            <FileText className="w-4 h-4" />
            Relatório Fotográfico (PDF / Excel)
          </button>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Novo Registro Fotográfico (Individual ou Lote)
          </button>
        </div>
      </div>

      {/* Filters & Period Grouping Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Pesquisa Rápida
            </label>
            <input
              type="text"
              placeholder="Buscar por título, pavimento, descrição ou obra..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          {/* Year Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Filtrar por Ano
            </label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
            >
              <option value="ALL">Todos os Anos</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Ano {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Filtrar por Mês
            </label>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
            >
              <option value="ALL">Todos os Meses</option>
              {MONTH_NAMES.map((mName, idx) => {
                const mCode = String(idx + 1).padStart(2, '0');
                return (
                  <option key={mCode} value={mCode}>
                    {mCode} — {mName}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Stage Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Etapa Construtiva
            </label>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
            >
              <option value="ALL">Todas as Etapas</option>
              {STAGES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grouping & Sorting Selector Row */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <Layers className="w-4 h-4 text-amber-600" />
              Agrupar registros por:
            </span>
            {[
              { id: 'MONTH_YEAR', label: 'Mês / Ano' },
              { id: 'YEAR', label: 'Ano' },
              { id: 'DATE', label: 'Dia / Data' },
              { id: 'STAGE', label: 'Etapa da Obra' },
              { id: 'NONE', label: 'Sem Agrupamento' }
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setGroupBy(mode.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${
                  groupBy === mode.id
                    ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Sort Order Toggle */}
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => setSortOrder('DESC')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition ${
                  sortOrder === 'DESC'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Exibir fotos mais recentes primeiro (Ordem Decrescente)"
              >
                <ArrowDown className="w-3.5 h-3.5 text-amber-600" />
                Mais Recentes
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('ASC')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition ${
                  sortOrder === 'ASC'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Exibir fotos mais antigas primeiro (Ordem Cronológica / Crescente)"
              >
                <ArrowUp className="w-3.5 h-3.5 text-amber-600" />
                Mais Antigas (Cronológica)
              </button>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Exibindo <strong>{filteredPhotos.length}</strong> registro(s) em{' '}
              <strong>{groupedPhotos.length}</strong> período(s)/grupo(s)
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Photo Sections */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500">
          Carregando galeria técnica da obra...
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-xl border border-slate-200 p-6">
          <Camera className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">Nenhum registro fotográfico encontrado</h3>
          <p className="text-sm text-slate-500 mt-1">
            Ajuste os filtros de Ano/Mês/Etapa ou clique em &ldquo;Novo Registro Fotográfico&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedPhotos.map((group) => {
            const isCollapsed = !!collapsedGroups[group.key];
            return (
              <div key={group.key} className="space-y-3">
                {groupBy !== 'NONE' && (
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(group.key)}
                    className="w-full flex items-center justify-between bg-white hover:bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 shadow-2xs transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-900 text-amber-400">
                        <FolderOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{group.title}</h3>
                        {group.subtitle && (
                          <p className="text-xs text-slate-500">{group.subtitle}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        {group.items.length} foto(s)
                      </span>
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>
                )}

                {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {group.items.map((photo) => renderPhotoCard(photo))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          MODAL: CREATE (MULTI-PHOTO BATCH OF THE DAY) OR EDIT (SINGLE PHOTO)
         ===================================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-slate-200 my-8 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                  {editingPhoto ? <Edit3 className="w-5 h-5" /> : <Images className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingPhoto
                      ? 'Editar Registro Fotográfico de Obra'
                      : 'Novo Registro Fotográfico (Envio Rápido de 1 ou Várias Fotos do Dia)'}
                  </h3>
                  {!editingPhoto && (
                    <p className="text-xs text-slate-500">
                      Defina a Obra e a Data do dia, selecione quantas fotos quiser de uma vez e personalize as opções de cada foto abaixo.
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium shrink-0">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-5 overflow-y-auto pr-1 flex-1">
              {editingPhoto ? (
                /* -------------------------------------------------------------
                   MODO EDIÇÃO INDIVIDUAL DE REGISTRO EXISTENTE
                   ------------------------------------------------------------- */
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Obra Vinculada *</label>
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
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Etapa Construtiva *</label>
                      <select
                        value={form.stage}
                        onChange={(e) => setForm({ ...form, stage: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                      >
                        {form.stage && !STAGES.some((st) => st.value === form.stage) && (
                          <option value={form.stage}>{form.stage} (etapa removida)</option>
                        )}
                        {STAGES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Título do Registro Fotográfico *</label>
                    <input
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Localização / Setor / Bloco</label>
                      <input
                        type="text"
                        value={form.location_area}
                        onChange={(e) => setForm({ ...form, location_area: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Data do Registro *</label>
                      <input
                        type="date"
                        required
                        value={form.taken_at}
                        onChange={(e) => setForm({ ...form, taken_at: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Condição Climática</label>
                      <select
                        value={form.weather_condition}
                        onChange={(e) => setForm({ ...form, weather_condition: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                      >
                        <option value="SOL">Ensolarado</option>
                        <option value="NUBLADO">Nublado</option>
                        <option value="CHUVA_FRACA">Chuva Fraca</option>
                        <option value="CHUVA_FORTE">Chuva Forte</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Laudo / Observações Técnicas</label>
                    <textarea
                      rows={2}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">
                        Substituir Fotografia (Opcional)
                      </label>
                      <button
                        type="button"
                        onClick={generateEditStampedImage}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md border border-amber-200 transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Atualizar Carimbo Técnico
                      </button>
                    </div>

                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-amber-500 transition">
                      <input
                        id="photo-edit-upload-input"
                        type="file"
                        accept="image/*"
                        onChange={handleEditFileChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="photo-edit-upload-input"
                        className="cursor-pointer flex flex-col items-center justify-center gap-1"
                      >
                        <Upload className="w-6 h-6 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-700">
                          Clique caso queira enviar uma nova foto para substituir a atual
                        </span>
                      </label>
                    </div>

                    {previewUrl && (
                      <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200 h-44 bg-slate-900">
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* -------------------------------------------------------------
                   MODO CRIAÇÃO EM LOTE (VÁRIAS FOTOS DO MESMO DIA)
                   ------------------------------------------------------------- */
                <>
                  {/* 1. Dados Comuns do Dia */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        1. Dados Comuns do Lote (Mesma Obra e Mesmo Dia)
                      </span>
                      {batchItems.length > 1 && (
                        <button
                          type="button"
                          onClick={applyDefaultsToAllBatchItems}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-100/80 hover:bg-amber-100 px-2.5 py-1 rounded-md border border-amber-300 transition"
                        >
                          <CopyCheck className="w-3.5 h-3.5" />
                          Aplicar Etapa e Setor Padrão a Todas as {batchItems.length} Fotos
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div className="lg:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Obra Vinculada *</label>
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
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Data das Fotos *</label>
                        <input
                          type="date"
                          required
                          value={form.taken_at}
                          onChange={(e) => setForm({ ...form, taken_at: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Clima do Dia</label>
                        <select
                          value={form.weather_condition}
                          onChange={(e) => setForm({ ...form, weather_condition: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                          <option value="SOL">Ensolarado</option>
                          <option value="NUBLADO">Nublado</option>
                          <option value="CHUVA_FRACA">Chuva Fraca</option>
                          <option value="CHUVA_FORTE">Chuva Forte</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Etapa Padrão</label>
                        <select
                          value={form.default_stage}
                          onChange={(e) => setForm({ ...form, default_stage: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                          {STAGES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Localização / Setor / Bloco Padrão (pré-preenche novas fotos adicionadas)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Torre A - 10º Pavimento (você poderá alterar individualmente em cada foto abaixo)"
                        value={form.default_location_area}
                        onChange={(e) => setForm({ ...form, default_location_area: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                      />
                    </div>
                  </div>

                  {/* 2. Dropzone de Seleção Múltipla */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        2. Selecionar Fotografias ({batchItems.length} adicionada{batchItems.length === 1 ? '' : 's'})
                      </label>
                      <button
                        type="button"
                        onClick={addDemoStampedPhotoToBatch}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md border border-amber-200 transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        + Adicionar Foto com Carimbo Técnico
                      </button>
                    </div>

                    <div className="border-2 border-dashed border-amber-400 bg-amber-50/30 rounded-xl p-5 text-center hover:bg-amber-50/60 transition">
                      <input
                        id="photo-batch-upload-input"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleBatchFilesChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="photo-batch-upload-input"
                        className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                      >
                        <Upload className="w-7 h-7 text-amber-600" />
                        <span className="text-sm font-bold text-slate-800">
                          Clique aqui para selecionar UMA ou VÁRIAS fotos de uma só vez
                        </span>
                        <span className="text-xs text-slate-500">
                          Você pode selecionar múltiplos arquivos (Ctrl/Shift ou galeria do celular) e editar os dados de cada foto abaixo.
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* 3. Lista de Fotos Selecionadas com Edição Individual */}
                  {batchItems.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          3. Personalizar Opções de Cada Foto ({batchItems.length})
                        </h4>
                        <button
                          type="button"
                          onClick={() => setBatchItems([])}
                          className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                        >
                          Limpar fila de fotos
                        </button>
                      </div>

                      <div className="space-y-3">
                        {batchItems.map((item, idx) => (
                          <div
                            key={item.id}
                            className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-4 items-start"
                          >
                            {/* Thumbnail */}
                            <div className="w-full md:w-44 h-36 rounded-lg overflow-hidden bg-slate-900 shrink-0 relative border border-slate-200">
                              <img
                                src={item.previewUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-900/80 text-amber-400 font-mono text-[11px] font-bold">
                                Foto #{idx + 1}
                              </span>
                            </div>

                            {/* Individual Fields */}
                            <div className="flex-1 w-full space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Título da Foto #{idx + 1} *
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Ex: Armação da viga V-12 ou Concretagem P-04"
                                    value={item.title}
                                    onChange={(e) => updateBatchItem(item.id, 'title', e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Etapa Construtiva *
                                  </label>
                                  <select
                                    value={item.stage}
                                    onChange={(e) => updateBatchItem(item.id, 'stage', e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                                  >
                                    {STAGES.map((s) => (
                                      <option key={s.value} value={s.value}>
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Localização / Setor / Pavimento desta Foto
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="Ex: Bloco A - 8º Pavimento"
                                    value={item.location_area}
                                    onChange={(e) => updateBatchItem(item.id, 'location_area', e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Laudo / Observação Individual
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="Observações específicas desta imagem..."
                                    value={item.description}
                                    onChange={(e) => updateBatchItem(item.id, 'description', e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Remove Photo from Batch */}
                            <button
                              type="button"
                              onClick={() => removeBatchItem(item.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition self-end md:self-start"
                              title="Remover esta foto do lote"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 shrink-0">
                <div className="text-xs text-slate-500 font-medium">
                  {submitProgress ? (
                    <span className="text-amber-700 font-bold">{submitProgress}</span>
                  ) : !editingPhoto ? (
                    `${batchItems.length} foto(s) pronta(s) para registro na data ${formatDateBR(form.taken_at)}`
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
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
                    className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-sm disabled:opacity-50"
                  >
                    {submitting
                      ? submitProgress || 'Salvando...'
                      : editingPhoto
                      ? 'Salvar Alterações'
                      : batchItems.length > 1
                      ? `Salvar ${batchItems.length} Registros Fotográficos`
                      : 'Salvar Registro Fotográfico'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="bg-slate-900 rounded-2xl max-w-4xl w-full overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-black flex items-center justify-center max-h-[65vh]">
              <img
                src={lightboxPhoto.image_url}
                alt={lightboxPhoto.title}
                className="max-h-[65vh] w-auto object-contain"
              />
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <button
                  onClick={() => {
                    const target = lightboxPhoto;
                    setLightboxPhoto(null);
                    openEditModal(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/85 text-white hover:bg-amber-500 hover:text-slate-950 text-xs font-bold transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar Registro
                </button>
                <button
                  onClick={() => setLightboxPhoto(null)}
                  className="p-2 rounded-full bg-slate-900/85 text-white hover:bg-amber-500 hover:text-slate-950 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-5 text-white space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-amber-500 text-slate-950">
                  {getStageBadge(lightboxPhoto.stage).label}
                </span>
                <span className="text-xs text-slate-300">
                  Data: {formatDateBR(lightboxPhoto.taken_at)} • Registrado por: {lightboxPhoto.author_name || 'Engenharia'}
                </span>
              </div>
              <h3 className="text-lg font-bold">{lightboxPhoto.title}</h3>
              <p className="text-sm text-amber-400 font-medium">
                {lightboxPhoto.project_code} — {lightboxPhoto.project_name}{' '}
                {lightboxPhoto.location_area ? `• ${lightboxPhoto.location_area}` : ''}
              </p>
              {lightboxPhoto.description && (
                <p className="text-sm text-slate-300 pt-1 leading-relaxed">{lightboxPhoto.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Configuration & Export Modal (PDF / Excel) */}
      <PhotoReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        photos={filteredPhotos}
        projects={projects}
        selectedProjectId={selectedProjectId}
        yearFilter={yearFilter}
        monthFilter={monthFilter}
      />
    </div>
  );
}
