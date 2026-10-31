import React, { useState, useEffect, useMemo } from 'react';
import {
  Camera,
  Plus,
  Edit3,
  Trash2,
  MapPin,
  Calendar,
  User,
  Filter,
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
  Layers
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';

const STAGES = [
  { value: 'TERRAPLANAGEM', label: 'Terraplanagem', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'FUNDACAO', label: 'Fundação', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  { value: 'ESTRUTURA', label: 'Estrutura / Concreto', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { value: 'ALVENARIA', label: 'Alvenaria / Vedação', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'INSTALACOES', label: 'Instalações (Elét/Hidr)', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { value: 'COBERTURA', label: 'Cobertura', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'ACABAMENTO', label: 'Acabamento / Revestimento', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'SEGURANCA', label: 'Segurança do Trabalho (NR-18)', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  { value: 'VISTORIA', label: 'Vistoria Geral', color: 'bg-slate-100 text-slate-800 border-slate-300' }
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

export default function PhotosView({ projects, selectedProjectId, onRefreshDashboard }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Grouping
  const [stageFilter, setStageFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [groupBy, setGroupBy] = useState('MONTH_YEAR'); // 'MONTH_YEAR' | 'YEAR' | 'DATE' | 'STAGE' | 'NONE'
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Modal & Edit States
  const [showModal, setShowModal] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const initialForm = {
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
    title: '',
    description: '',
    stage: 'ESTRUTURA',
    location_area: '',
    taken_at: new Date().toISOString().slice(0, 10),
    weather_condition: 'SOL'
  };

  const [form, setForm] = useState(initialForm);
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
    setForm({
      ...initialForm,
      project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
    });
    setSelectedFile(null);
    setGeneratedBase64('');
    setPreviewUrl('');
    setShowModal(true);
  };

  const openEditModal = (photo) => {
    setEditingPhoto(photo);
    setError('');
    setForm({
      project_id: photo.project_id,
      title: photo.title || '',
      description: photo.description || '',
      stage: photo.stage || 'ESTRUTURA',
      location_area: photo.location_area || '',
      taken_at: String(photo.taken_at || '').slice(0, 10),
      weather_condition: photo.weather_condition || 'SOL'
    });
    setSelectedFile(null);
    setGeneratedBase64('');
    setPreviewUrl(photo.image_url || '');
    setShowModal(true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setGeneratedBase64('');
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const generateStampedTechnicalImage = () => {
    const proj = projects.find((p) => Number(p.id) === Number(form.project_id)) || projects[0];
    const titleText = form.title || 'Inspeção de Execução de Serviço em Campo';
    const areaText = form.location_area || 'Setor Principal • Canteiro de Obras';
    const stageText = form.stage || 'ESTRUTURA';
    const dateText = formatDateBR(form.taken_at);

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

    const base64 = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    setSelectedFile(null);
    setGeneratedBase64(base64);
    setPreviewUrl(base64);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.project_id || !form.title) {
      setError('Informe a obra e o título do registro fotográfico.');
      return;
    }

    if (!editingPhoto && !selectedFile && !generatedBase64) {
      setError('Anexe uma imagem do seu dispositivo ou clique em "Gerar Carimbo Técnico de Demonstração".');
      return;
    }

    setSubmitting(true);
    try {
      const url = editingPhoto ? `/api/photos/${editingPhoto.id}` : '/api/photos';
      const method = editingPhoto ? 'PUT' : 'POST';

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

        await apiRequest(url, {
          method,
          body: fd
        });
      } else {
        await apiRequest(url, {
          method,
          body: JSON.stringify({
            ...form,
            ...(generatedBase64 ? { image_base64: generatedBase64 } : {})
          })
        });
      }

      setShowModal(false);
      setEditingPhoto(null);
      setSelectedFile(null);
      setPreviewUrl('');
      setGeneratedBase64('');
      await loadPhotos();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
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

  // Filter photos by search, year, and month
  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
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
  }, [photos, yearFilter, monthFilter, searchQuery]);

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
            Acompanhamento visual de evolução física com agrupamento por Ano, Mês, Data ou Etapa Construtiva.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Novo Registro Fotográfico
        </button>
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

        {/* Grouping Selector Row */}
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

          <div className="text-xs text-slate-500 font-medium">
            Exibindo <strong>{filteredPhotos.length}</strong> registro(s) em{' '}
            <strong>{groupedPhotos.length}</strong> período(s)/grupo(s)
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

      {/* Modal: Create or Edit Photo Record */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <Camera className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  {editingPhoto ? 'Editar Registro Fotográfico de Obra' : 'Novo Registro Fotográfico de Obra'}
                </h3>
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
                  placeholder="Ex: Concretagem dos pilares P12 a P18 do 10º Pavimento"
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
                    placeholder="Ex: Bloco A - 10º Pavimento"
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
                  placeholder="Descreva detalhes técnicos verificados, Fck do concreto, armaduras, equipamentos utilizados..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              {/* Image Upload or Technical Stamp Generator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    {editingPhoto ? 'Substituir Fotografia (Opcional)' : 'Fotografia da Obra *'}
                  </label>
                  <button
                    type="button"
                    onClick={generateStampedTechnicalImage}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md border border-amber-200 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Atualizar Carimbo Técnico
                  </button>
                </div>

                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-amber-500 transition">
                  <input
                    id="photo-upload-input"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="photo-upload-input"
                    className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                  >
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">
                      {editingPhoto
                        ? 'Clique caso queira enviar uma nova foto para substituir a atual'
                        : 'Clique para selecionar uma foto do computador ou câmera'}
                    </span>
                    <span className="text-[11px] text-slate-400">Formatos suportados: JPG, PNG, WEBP, SVG (Máx. 15MB)</span>
                  </label>
                </div>

                {previewUrl && (
                  <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200 h-44 bg-slate-900">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                    {!editingPhoto && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setGeneratedBase64('');
                          setPreviewUrl('');
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 text-white hover:bg-rose-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
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
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm disabled:opacity-50"
                >
                  {submitting
                    ? 'Salvando...'
                    : editingPhoto
                    ? 'Salvar Alterações'
                    : 'Salvar Registro Fotográfico'}
                </button>
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
    </div>
  );
}
