import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FileText,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Save,
  Printer,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  Building2,
  Lock,
  Unlock,
  Download,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  CalendarDays,
  FileStack
} from 'lucide-react';
import { apiRequest, formatDateBR, can } from '../api';

const WEEKDAYS = [
  { key: 0, label: 'DOM' },
  { key: 1, label: 'SEG' },
  { key: 2, label: 'TER' },
  { key: 3, label: 'QUA' },
  { key: 4, label: 'QUI' },
  { key: 5, label: 'SEX' },
  { key: 6, label: 'SÁB' }
];

const MONTHS_LIST = [
  { key: 'ALL', label: 'Todos os Meses' },
  { key: '01', label: '01 — Janeiro' },
  { key: '02', label: '02 — Fevereiro' },
  { key: '03', label: '03 — Março' },
  { key: '04', label: '04 — Abril' },
  { key: '05', label: '05 — Maio' },
  { key: '06', label: '06 — Junho' },
  { key: '07', label: '07 — Julho' },
  { key: '08', label: '08 — Agosto' },
  { key: '09', label: '09 — Setembro' },
  { key: '10', label: '10 — Outubro' },
  { key: '11', label: '11 — Novembro' },
  { key: '12', label: '12 — Dezembro' }
];

const WEATHER_CHOICES = [
  { key: 'BOM', label: 'BOM' },
  { key: 'INSTAVEL', label: 'INSTÁVEL' },
  { key: 'CHUVOSO', label: 'CHUVOSO' },
  { key: 'IMPRATICAVEL', label: 'IMPRATICÁVEL' }
];

function brDate(iso) {
  if (!iso || typeof iso !== 'string') return '';
  return iso.split('-').reverse().join('/');
}

function parseServices(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.split('\n').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export default function RdoView({ projects, selectedProjectId, currentUser }) {
  // Permissões do perfil de acesso (o servidor também confere)
  const canCreateRdo = can(currentUser, 'RDO', 'create');
  const canEditRdo = can(currentUser, 'RDO', 'edit');
  const canDeleteRdo = can(currentUser, 'RDO', 'delete');
  const canFinalizeRdo = can(currentUser, 'RDO', 'finalize');
  const canReopenRdo = can(currentUser, 'RDO', 'reopen');
  const canBatchRdo = can(currentUser, 'RDO', 'batch');
  const [targetProjectId, setTargetProjectId] = useState(
    selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
  );

  // Quick Year and Month filters
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('ALL');

  // Interval filter for RDO pills and exports
  const [fromDate, setFromDate] = useState('2026-10-01');
  const [toDate, setToDate] = useState('2026-11-30');

  // Current active date being viewed / edited
  const [currentDate, setCurrentDate] = useState('2026-11-01');

  // Custom Calendar Dropdown State
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(10); // 0-based: 10 = Nov
  const [calYear, setCalYear] = useState(2026);
  const calendarRef = useRef(null);

  // Loading & Action states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationIssues, setValidationIssues] = useState([]);

  // Existing RDOs list in current project
  const [existingRdos, setExistingRdos] = useState([]);

  // Summary of photos per date for this project
  const [photoDatesSummary, setPhotoDatesSummary] = useState([]);

  // State of the selected day's RDO
  const [dayExists, setDayExists] = useState(false);
  const [rdoData, setRdoData] = useState({
    id: null,
    project_id: '',
    project_code: '',
    project_name: '',
    folio_number: 1,
    rdo_date: '',
    weather_condition: 'BOM',
    work_code: '',
    work_force_count: 0,
    work_force_sufficient: 1,
    representative_engineer: '',
    representative_present: 1,
    contractor_notes: '',
    supervisor_notes: '',
    fiscal_notes: '',
    services_developed: [],
    status: 'draft',
    final_signature: '',
    finalized_at: '',
    reopened_reason: '',
    photos_count: 0,
    available_photos: [],
    suggested_services: [],
    settings: {}
  });

  // 12 lines slots per page (reduzido de 20 para 12 conforme solicitado)
  const [servicesLines, setServicesLines] = useState(Array(12).fill(''));

  // Batch Generation Modal State
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchDefaults, setBatchDefaults] = useState({
    professionals: '',
    sufficient: 'SIM',
    present: 'SIM',
    contractorNotes: '',
    weather: 'BOM'
  });
  const [includeEmptyBatch, setIncludeEmptyBatch] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  // Export Modal State
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState('period'); // 'month' | 'period' | 'current'

  // Sync calMonth/calYear when currentDate changes
  useEffect(() => {
    if (currentDate) {
      const [y, m] = currentDate.split('-').map(Number);
      if (y && m) {
        setCalYear(y);
        setCalMonth(m - 1);
      }
    }
  }, [currentDate]);

  // Close calendar popover on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (calendarRef.current && !calendarRef.current.contains(e.target)) {
        setCalendarOpen(false);
      }
    }
    if (calendarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [calendarOpen]);

  // Update targetProjectId if prop changes
  useEffect(() => {
    if (selectedProjectId !== 'ALL' && selectedProjectId) {
      setTargetProjectId(selectedProjectId);
    } else if (!targetProjectId && projects.length > 0) {
      setTargetProjectId(projects[0].id);
    }
  }, [selectedProjectId, projects, targetProjectId]);

  // Maps for fast O(1) calendar indicators
  const rdosMap = useMemo(() => {
    const map = new Map();
    existingRdos.forEach((r) => map.set(r.rdo_date, r));
    return map;
  }, [existingRdos]);

  const photoDatesMap = useMemo(() => {
    const map = new Map();
    photoDatesSummary.forEach((p) => map.set(p.date, p.photo_count));
    return map;
  }, [photoDatesSummary]);

  // Load existing RDO records and photo dates summary for the project
  const loadExistingRdos = useCallback(async (pid) => {
    if (!pid) return;
    try {
      const list = await apiRequest(`/api/rdo?projectId=${pid}&order=ASC`);
      setExistingRdos(list || []);

      const pDates = await apiRequest(`/api/rdo/photo-dates?projectId=${pid}`);
      setPhotoDatesSummary(pDates.dates || []);
    } catch (err) {
      console.error('Falha ao carregar lista de RDOs:', err);
    }
  }, []);

  // Load RDO detail for current date
  const loadRdoForDate = useCallback(async (date, pid) => {
    if (!pid || !date) return;
    setLoading(true);
    setErrorMessage('');
    setValidationIssues([]);
    try {
      const data = await apiRequest(`/api/rdo/by-date?projectId=${pid}&date=${date}`);
      setDayExists(Boolean(data.exists));

      const parsedServices = parseServices(data.services_developed);

      // Ensure at least 12 slots (multiple of 12 for pages)
      const initialSlots = Array(Math.max(12, Math.ceil(parsedServices.length / 12) * 12)).fill('');
      parsedServices.forEach((s, idx) => {
        initialSlots[idx] = s;
      });

      setRdoData({
        ...data,
        services_developed: parsedServices,
        weather_condition: data.weather_condition || 'BOM',
        status: data.status || 'draft'
      });
      setServicesLines(initialSlots);
    } catch (err) {
      setErrorMessage(err.message || 'Erro ao carregar RDO desta data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // When project or current date changes, fetch data
  useEffect(() => {
    if (targetProjectId) {
      loadExistingRdos(targetProjectId);
    }
  }, [targetProjectId, loadExistingRdos]);

  useEffect(() => {
    if (targetProjectId && currentDate) {
      loadRdoForDate(currentDate, targetProjectId);
    }
  }, [targetProjectId, currentDate, loadRdoForDate]);

  // Handle Quick Year / Month Filter Changes
  const handleYearFilterChange = (yr) => {
    setSelectedYear(yr);
    if (yr === 'ALL') {
      setFromDate('2024-01-01');
      setToDate('2030-12-31');
    } else {
      if (selectedMonth === 'ALL') {
        setFromDate(`${yr}-01-01`);
        setToDate(`${yr}-12-31`);
      } else {
        const lastDay = new Date(Number(yr), Number(selectedMonth), 0).getDate();
        setFromDate(`${yr}-${selectedMonth}-01`);
        setToDate(`${yr}-${selectedMonth}-${String(lastDay).padStart(2, '0')}`);
      }
    }
  };

  const handleMonthFilterChange = (mo) => {
    setSelectedMonth(mo);
    const yr = selectedYear === 'ALL' ? '2026' : selectedYear;
    if (mo === 'ALL') {
      setFromDate(`${yr}-01-01`);
      setToDate(`${yr}-12-31`);
    } else {
      const lastDay = new Date(Number(yr), Number(mo), 0).getDate();
      setFromDate(`${yr}-${mo}-01`);
      setToDate(`${yr}-${mo}-${String(lastDay).padStart(2, '0')}`);
    }
  };

  // Day navigation handlers
  const handleShiftDate = (days) => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    setCurrentDate(dt.toISOString().slice(0, 10));
  };

  const handleSetToday = () => {
    const now = new Date().toISOString().slice(0, 10);
    setCurrentDate(now);
  };

  // Filtered RDO pills within interval
  const filteredRdos = useMemo(() => {
    return existingRdos.filter((r) => {
      if (fromDate && r.rdo_date < fromDate) return false;
      if (toDate && r.rdo_date > toDate) return false;
      return true;
    });
  }, [existingRdos, fromDate, toDate]);

  // Count how many photo dates exist in current selected period
  const photoDatesInPeriod = useMemo(() => {
    return photoDatesSummary.filter((p) => {
      if (fromDate && p.date < fromDate) return false;
      if (toDate && p.date > toDate) return false;
      return true;
    });
  }, [photoDatesSummary, fromDate, toDate]);

  // Total days in selected period
  const totalDaysInPeriod = useMemo(() => {
    if (!fromDate || !toDate || fromDate > toDate) return 0;
    const start = new Date(fromDate + 'T12:00:00Z');
    const end = new Date(toDate + 'T12:00:00Z');
    return Math.round((+end - +start) / 86400000) + 1;
  }, [fromDate, toDate]);

  // Check validation issues for finalizing RDO
  const checkRdoIssues = () => {
    const issues = [];
    if (!rdoData.weather_condition) {
      issues.push('Selecione a condição climática do dia (BOM, INSTÁVEL, CHUVOSO ou IMPRATICÁVEL).');
    }
    if (rdoData.work_force_count === null || rdoData.work_force_count === undefined || rdoData.work_force_count === '') {
      issues.push('Informe a quantidade de profissionais em atividade (ou 0 caso não tenha havido expediente).');
    }
    if (rdoData.work_force_sufficient === undefined || rdoData.work_force_sufficient === null) {
      issues.push('Informe se a equipe de trabalho foi suficiente (SIM / NÃO).');
    }
    if (rdoData.representative_present === undefined || rdoData.representative_present === null) {
      issues.push('Informe se o engenheiro preposto esteve presente na obra (SIM / NÃO).');
    }

    const cleanLines = servicesLines.map((s) => String(s || '').trim()).filter(Boolean);
    const photoCount = rdoData.photos_count || 0;

    if (photoCount === 0 && cleanLines.length === 0 && !String(rdoData.contractor_notes || '').trim()) {
      issues.push('Dia sem fotos e sem serviços: informe nas Observações da Contratada o motivo (chuva, domingo, feriado, etc.).');
    }

    return issues;
  };

  // ============================================================================
  // ACTION A: CREATE SINGLE RDO FOR CURRENT DAY
  // ============================================================================
  const handleCreateRdoForCurrentDate = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const suggested = rdoData.suggested_services || [];
      const cleanServices = suggested.length > 0 ? suggested : [];

      const payload = {
        project_id: targetProjectId,
        folio_number: rdoData.folio_number || 1,
        rdo_date: currentDate,
        weather_condition: rdoData.weather_condition || 'BOM',
        work_code: rdoData.work_code || '',
        work_force_count: Number(rdoData.work_force_count) || 0,
        work_force_sufficient: rdoData.work_force_sufficient ? 1 : 0,
        representative_engineer: rdoData.representative_engineer || rdoData.settings?.contractor_representative || '',
        representative_present: rdoData.representative_present ? 1 : 0,
        contractor_notes: rdoData.contractor_notes || '',
        supervisor_notes: rdoData.supervisor_notes || rdoData.settings?.regional_superintendency || 'DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE',
        fiscal_notes: rdoData.fiscal_notes || '',
        services_developed: cleanServices,
        status: 'draft'
      };

      const res = await apiRequest('/api/rdo', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setDayExists(true);
      setRdoData((prev) => ({
        ...prev,
        ...res,
        services_developed: cleanServices,
        status: 'draft'
      }));

      const newSlots = Array(Math.max(12, Math.ceil(cleanServices.length / 12) * 12)).fill('');
      cleanServices.forEach((s, idx) => {
        newSlots[idx] = s;
      });
      setServicesLines(newSlots);

      setSuccessMessage(`RDO Folha Nº ${res.folio_number} criado com sucesso em modo Rascunho!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      loadExistingRdos(targetProjectId);
    } catch (err) {
      setErrorMessage(err.message || 'Erro ao criar RDO.');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // ACTION B: GENERATE RDOS FOR ALL DAYS WITH PHOTOS IN SELECTED PERIOD
  // ============================================================================
  const handleGenerateRdoForPhotoDaysInPeriod = async () => {
    setBatchActionLoading(true);
    setErrorMessage('');
    try {
      const res = await apiRequest('/api/rdo/batch', {
        method: 'POST',
        body: JSON.stringify({
          project_id: targetProjectId,
          fromDate,
          toDate,
          include_empty: false,
          defaults: {
            weather: 'BOM',
            sufficient: 'SIM',
            present: 'SIM',
            contractorNotes: ''
          }
        })
      });

      const { created, skipped } = res;
      setSuccessMessage(
        `${created.length} RDO(s) gerado(s) para os dias com registro fotográfico do período! ${skipped.length} já existente(s) preservado(s).`
      );
      setTimeout(() => setSuccessMessage(''), 5000);
      await loadExistingRdos(targetProjectId);

      if (created.length > 0) {
        setCurrentDate(created[0]);
      } else {
        await loadRdoForDate(currentDate, targetProjectId);
      }
    } catch (err) {
      alert(err.message || 'Erro ao gerar RDOs para os dias com fotos.');
    } finally {
      setBatchActionLoading(false);
    }
  };

  // ============================================================================
  // ACTION C: GENERATE RDOS FOR ALL DAYS IN PERIOD (COMPLETE MONTH SUBMISSION)
  // ============================================================================
  const handleGenerateCompleteRdoForEveryDayInPeriod = async () => {
    if (
      !confirm(
        `Deseja gerar as folhas de RDO para TODOS os ${totalDaysInPeriod} dias do período selecionado (${brDate(fromDate)} até ${brDate(toDate)})?\n\nDias com fotos receberão as atividades automaticamente; dias sem fotos (finais de semana, chuva, etc.) serão gerados em branco como rascunho para envio mensal completo.`
      )
    ) {
      return;
    }

    setBatchActionLoading(true);
    setErrorMessage('');
    try {
      const res = await apiRequest('/api/rdo/batch', {
        method: 'POST',
        body: JSON.stringify({
          project_id: targetProjectId,
          fromDate,
          toDate,
          include_empty: true,
          defaults: {
            weather: 'BOM',
            sufficient: 'SIM',
            present: 'SIM',
            contractorNotes: ''
          }
        })
      });

      const { created, skipped } = res;
      setSuccessMessage(
        `${created.length} RDO(s) gerado(s) cobrindo todos os dias do período! ${skipped.length} já existente(s) preservado(s).`
      );
      setTimeout(() => setSuccessMessage(''), 5000);
      await loadExistingRdos(targetProjectId);

      if (created.length > 0) {
        setCurrentDate(created[0]);
      } else {
        await loadRdoForDate(currentDate, targetProjectId);
      }
    } catch (err) {
      alert(err.message || 'Erro ao gerar lote completo.');
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Save RDO as Draft or Final
  const handleSaveRdo = async (newStatus = 'draft', reopenReason = '') => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    setValidationIssues([]);
    try {
      const cleanServices = servicesLines.map((s) => String(s || '').trim()).filter(Boolean);

      const payload = {
        project_id: targetProjectId,
        folio_number: rdoData.folio_number || 1,
        rdo_date: currentDate,
        weather_condition: rdoData.weather_condition || 'BOM',
        work_code: rdoData.work_code || '',
        work_force_count: Number(rdoData.work_force_count) || 0,
        work_force_sufficient: rdoData.work_force_sufficient ? 1 : 0,
        representative_engineer: rdoData.representative_engineer || '',
        representative_present: rdoData.representative_present ? 1 : 0,
        contractor_notes: rdoData.contractor_notes || '',
        supervisor_notes: rdoData.supervisor_notes || '',
        fiscal_notes: rdoData.fiscal_notes || '',
        services_developed: cleanServices,
        status: newStatus,
        reopened_reason: reopenReason
      };

      const res = await apiRequest('/api/rdo', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setDayExists(true);
      setRdoData((prev) => ({
        ...prev,
        ...res,
        services_developed: cleanServices,
        status: res.status || newStatus
      }));

      if (newStatus === 'final') {
        setSuccessMessage(`RDO Folha Nº ${res.folio_number} FINALIZADO com sucesso! Folha bloqueada para edições.`);
      } else {
        setSuccessMessage(
          reopenReason
            ? `RDO Folha Nº ${res.folio_number} reaberto para correções.`
            : `RDO Folha Nº ${res.folio_number} salvo em Rascunho com sucesso!`
        );
      }
      setTimeout(() => setSuccessMessage(''), 4000);
      loadExistingRdos(targetProjectId);
    } catch (err) {
      setErrorMessage(err.message || 'Erro ao salvar RDO.');
    } finally {
      setSaving(false);
    }
  };

  // Finalize RDO (with issue verification)
  const handleFinalizeRdo = () => {
    const issues = checkRdoIssues();
    if (issues.length > 0) {
      setValidationIssues(issues);
      return;
    }
    handleSaveRdo('final');
  };

  // Reopen RDO for editing
  const handleReopenRdo = () => {
    const reason = window.prompt('Informe o motivo da reabertura desta folha (fica registrado no histórico):', '');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('O motivo da reabertura é obrigatório.');
      return;
    }
    handleSaveRdo('draft', reason.trim());
  };

  // Sync services from photo catalog for current day
  const handleSyncWithPhotos = async () => {
    setSyncing(true);
    setErrorMessage('');
    try {
      const res = await apiRequest('/api/rdo/sync-services', {
        method: 'POST',
        body: JSON.stringify({ project_id: targetProjectId, rdo_date: currentDate })
      });
      const incoming = res.services || [];
      if (incoming.length === 0) {
        alert('Nenhuma fotografia registrada nesta data para esta obra.');
      } else {
        const newSlots = Array(Math.max(12, Math.ceil(incoming.length / 12) * 12)).fill('');
        incoming.forEach((s, idx) => {
          newSlots[idx] = s;
        });
        setServicesLines(newSlots);
        setSuccessMessage(`${incoming.length} serviço(s) sincronizado(s) das fotografias do dia!`);
        setTimeout(() => setSuccessMessage(''), 4000);
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Delete current RDO
  const handleDeleteRdo = async () => {
    if (!rdoData.id) return;
    if (!confirm(`Deseja realmente excluir a Folha Nº ${rdoData.folio_number} (${brDate(currentDate)})?`)) {
      return;
    }
    try {
      setLoading(true);
      await apiRequest(`/api/rdo/${rdoData.id}`, { method: 'DELETE' });
      setSuccessMessage(`RDO da data ${brDate(currentDate)} excluído com sucesso.`);
      setTimeout(() => setSuccessMessage(''), 4000);
      await loadExistingRdos(targetProjectId);
      await loadRdoForDate(currentDate, targetProjectId);
    } catch (err) {
      setErrorMessage(err.message || 'Erro ao excluir RDO.');
    } finally {
      setLoading(false);
    }
  };

  // Open Batch Generation Modal (Header Button)
  const handleOpenBatchModal = () => {
    setBatchModalOpen(true);
  };

  // Execute Batch Creation from Modal
  const handleExecuteBatchModal = async () => {
    setBatchLoading(true);
    setErrorMessage('');
    try {
      const res = await apiRequest('/api/rdo/batch', {
        method: 'POST',
        body: JSON.stringify({
          project_id: targetProjectId,
          fromDate,
          toDate,
          defaults: batchDefaults,
          include_empty: includeEmptyBatch
        })
      });

      const { created, skipped } = res;
      setSuccessMessage(
        `${created.length} RDO(s) criado(s) em lote com sucesso! ${skipped.length} já existente(s) preservado(s).`
      );
      setTimeout(() => setSuccessMessage(''), 5000);
      setBatchModalOpen(false);
      await loadExistingRdos(targetProjectId);

      if (created.length > 0) {
        setCurrentDate(created[0]);
      }
    } catch (err) {
      alert(err.message || 'Erro na geração de lote.');
    } finally {
      setBatchLoading(false);
    }
  };

  // Line changes
  const handleLineTextChange = (index, value) => {
    if (rdoData.status === 'final') return;
    const updated = [...servicesLines];
    updated[index] = value;
    setServicesLines(updated);
  };

  const handleAddLine = () => {
    if (rdoData.status === 'final') return;
    setServicesLines((prev) => [...prev, '']);
  };

  const handleAddNextPage = () => {
    if (rdoData.status === 'final') return;
    setServicesLines((prev) => [...prev, ...Array(12).fill('')]);
  };

  // Project metadata
  const currentProject = useMemo(() => {
    return projects.find((p) => String(p.id) === String(targetProjectId)) || projects[0] || {};
  }, [projects, targetProjectId]);

  const contractSettings = rdoData.settings || {};
  const contractorCompany = contractSettings.contractor_company || 'Consórcio Rodovia PR-317 Iguaraçu Maringá';
  const supervisorCompany = contractSettings.supervisor_company || 'Iguatemi Consultoria e Serviços de Engenharia LTDA.';
  const contractNumber = rdoData.work_code || contractSettings.contract_number || 'CO141/2025 - DT';
  const contractorManager = contractSettings.contractor_manager || 'DANIELLE NARDINO';
  const supervisorEngineer = contractSettings.supervisor_engineer || 'João Carlos Deríssio';
  const fiscalEngineer = contractSettings.fiscal_engineer || 'Alisson';

  // Banner settings from Module 8 (same criterion as Photo Report)
  const bannerMode = contractSettings.banner_mode || 'TEXT';
  const bannerImageUrl = contractSettings.banner_image_url || '';
  const bannerText =
    contractSettings.banner_text ||
    'AXIS OBRA ENGENHARIA E CONSTRUÇÕES LTDA\nSUPERINTENDÊNCIA DE ENGENHARIA E CONTROLE DE QUALIDADE';
  const bannerTextAlign = contractSettings.banner_text_align || 'CENTER';
  const bannerFontSize = contractSettings.banner_font_size || 'MEDIUM';
  const bannerBold = contractSettings.banner_bold !== undefined ? Boolean(contractSettings.banner_bold) : true;
  const bannerItalic = Boolean(contractSettings.banner_italic);
  const bannerUnderline = Boolean(contractSettings.banner_underline);
  const bannerColor = contractSettings.banner_color || '#0f172a';

  const bannerAlignCss =
    bannerTextAlign === 'LEFT' ? 'left' : bannerTextAlign === 'RIGHT' ? 'right' : 'center';
  const showBannerImg = (bannerMode === 'IMAGE' || bannerMode === 'BOTH') && Boolean(bannerImageUrl);
  const showBannerTxt = bannerMode === 'TEXT' || bannerMode === 'BOTH' || !bannerImageUrl;

  const dateParts = useMemo(() => {
    if (!currentDate) return { day: '01', month: '01', year: '2026', weekdayKey: 1 };
    const [y, m, d] = currentDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return {
      day: String(d).padStart(2, '0'),
      month: String(m).padStart(2, '0'),
      year: String(y),
      weekdayKey: dt.getUTCDay()
    };
  }, [currentDate]);

  const totalPages = Math.max(1, Math.ceil(servicesLines.length / 12));
  const isLocked = rdoData.status === 'final';

  // ============================================================================
  // CUSTOM CALENDAR GRID GENERATION (MONTH VIEW WITH PHOTO DOTS & RDO HIGHLIGHT)
  // ============================================================================
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay(); // 0 = Sun, 1 = Mon...

    const cells = [];

    // Leading days from previous month
    const prevMonthLastDay = new Date(calYear, calMonth, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const dNum = prevMonthLastDay - i;
      const prevDate = new Date(calYear, calMonth - 1, dNum);
      const iso = prevDate.toISOString().slice(0, 10);
      cells.push({
        dayNumber: dNum,
        dateKey: iso,
        isCurrentMonth: false
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateKey: iso,
        isCurrentMonth: true
      });
    }

    // Trailing days from next month to complete grid rows of 7
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const nextDate = new Date(calYear, calMonth + 1, d);
        const iso = nextDate.toISOString().slice(0, 10);
        cells.push({
          dayNumber: d,
          dateKey: iso,
          isCurrentMonth: false
        });
      }
    }

    return cells;
  }, [calYear, calMonth]);

  const calMonthName = useMemo(() => {
    const names = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    return names[calMonth] || '';
  }, [calMonth]);

  const handlePrevCalMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const handleNextCalMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  // ============================================================================
  // PRINT / EXPORT A4 SHEET (FAITHFUL OFFICIAL DER/PR APPROVED LAYOUT)
  // ============================================================================
  const handlePrintA4Rdo = (customRecords = null) => {
    const printWin = window.open('', '_blank', 'width=1120,height=880');
    if (!printWin) {
      alert('Habilite pop-ups para gerar a impressão do Diário de Obras.');
      return;
    }

    const recordsToPrint = customRecords || [
      {
        rdo: rdoData,
        date: currentDate,
        lines: servicesLines.map((s) => String(s || '').trim())
      }
    ];

    let fullHtmlPages = '';

    recordsToPrint.forEach(({ rdo, date, lines }) => {
      const [y, m, d] = date.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const dayStr = String(d).padStart(2, '0');
      const monthStr = String(m).padStart(2, '0');
      const yearStr = String(y);
      const weekdayIdx = dt.getUTCDay();

      const activeLines = lines.length > 0 ? lines : Array(12).fill('');
      const pCount = Math.max(1, Math.ceil(activeLines.length / 12));

      for (let pIdx = 0; pIdx < pCount; pIdx++) {
        const pageLines = activeLines.slice(pIdx * 12, (pIdx + 1) * 12);
        while (pageLines.length < 12) {
          pageLines.push('');
        }

        const linesRowsHtml = pageLines
          .map((text, idx) => {
            const num = pIdx * 12 + idx + 1;
            return `
              <div class="service-row">
                <span class="service-num">${num}</span>
                <span class="service-text">${text || ''}</span>
              </div>
            `;
          })
          .join('');

        const weatherBom = rdo.weather_condition === 'BOM' ? 'bg-active' : '';
        const weatherInstavel = rdo.weather_condition === 'INSTAVEL' ? 'bg-active' : '';
        const weatherChuvoso = rdo.weather_condition === 'CHUVOSO' ? 'bg-active' : '';
        const weatherImpraticavel = rdo.weather_condition === 'IMPRATICAVEL' ? 'bg-active' : '';

        const weekdayCells = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
          .map((wName, idx) => {
            const active = idx === weekdayIdx ? 'bg-active' : '';
            return `<div class="day-box ${active}">${wName}</div>`;
          })
          .join('');

        const sufficSim = rdo.work_force_sufficient ? 'bg-active' : '';
        const sufficNao = !rdo.work_force_sufficient ? 'bg-active' : '';
        const presSim = rdo.representative_present ? 'bg-active' : '';
        const presNao = !rdo.representative_present ? 'bg-active' : '';

        const isFinal = rdo.status === 'final';
        const pageTitle = pIdx === 0 ? 'SERVIÇOS DESENVOLVIDOS NO DIA:' : 'SERVIÇOS DESENVOLVIDOS NO DIA: (CONTINUAÇÃO)';

        const originUrl = window.location.origin;
        const resolveImgUrl = (url) => {
          if (!url) return '';
          if (url.startsWith('data:') || url.startsWith('http')) return url;
          return `${originUrl}${url.startsWith('/') ? '' : '/'}${url}`;
        };

        const printFontSize =
          bannerFontSize === 'SMALL' ? '11px' : bannerFontSize === 'LARGE' ? '16px' : '13px';

        const bannerContentHtml = `
          ${
            showBannerImg
              ? `<img src="${resolveImgUrl(bannerImageUrl)}" class="rdo-banner-img" alt="Banner" />`
              : ''
          }
          ${
            showBannerTxt && bannerText
              ? `<div class="rdo-banner-text" style="
                  font-size: ${printFontSize};
                  font-weight: ${bannerBold ? '700' : '400'};
                  font-style: ${bannerItalic ? 'italic' : 'normal'};
                  text-decoration: ${bannerUnderline ? 'underline' : 'none'};
                  color: ${bannerColor};
                  text-align: ${bannerAlignCss};
                ">${String(bannerText)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/\n/g, '<br/>')}</div>`
              : ''
          }
        `;

        fullHtmlPages += `
          <div class="sheet">
            <!-- Header Banner (Same criterion as Photo Report / Module 8) -->
            <div class="rdo-top-bar" style="text-align: ${bannerAlignCss};">
              ${bannerContentHtml}
            </div>

            <!-- Top Identification Grid -->
            <div class="grid-ident">
              <div class="cell-half">
                <div class="sub-cell">
                  <span class="label">EMPRESA</span>
                  <div class="val-text">${contractorCompany}</div>
                </div>
                <div class="sub-cell">
                  <span class="label">TEMPO (CLIMA)</span>
                  <div class="weather-row">
                    <span class="w-item ${weatherBom}">BOM</span>
                    <span class="w-item ${weatherInstavel}">INSTÁVEL</span>
                    <span class="w-item ${weatherChuvoso}">CHUVOSO</span>
                    <span class="w-item ${weatherImpraticavel}">IMPRATICÁVEL</span>
                  </div>
                </div>
                <div class="sub-cell">
                  <span class="label">CÓDIGO</span>
                  <div class="val-text">${rdo.work_code || currentProject.code || ''}</div>
                </div>
              </div>

              <div class="cell-half">
                <div class="row-flex-sub">
                  <div class="box-folio">
                    <span class="label">Nº DA FOLHA:</span>
                    <div class="box-num">${rdo.folio_number || 1}</div>
                  </div>
                  <div class="box-date">
                    <span class="label">DATA (dd/mm/aaaa)</span>
                    <div class="date-digits">
                      <span>${dayStr}</span>
                      <span>${monthStr}</span>
                      <span>${yearStr}</span>
                    </div>
                  </div>
                </div>

                <div class="sub-cell">
                  <span class="label">CONTRATO Nº</span>
                  <div class="val-text">${contractNumber}</div>
                </div>

                <div class="sub-cell">
                  <span class="label">SUPERVISORA</span>
                  <div class="val-text">${supervisorCompany}</div>
                </div>

                <div class="sub-cell">
                  <span class="label">DIA DA SEMANA</span>
                  <div class="week-days-row">
                    ${weekdayCells}
                  </div>
                </div>
              </div>
            </div>

            <!-- Services Section Header -->
            <div class="section-banner">
              ${pageTitle}
            </div>

            <!-- 12 Service Lines -->
            <div class="services-block">
              ${linesRowsHtml}
            </div>

            <!-- Workforce & Representative -->
            <div class="workforce-grid">
              <div class="wf-left">
                <div class="wf-row">
                  <span class="label">PROFISSIONAIS EM ATIVIDADE:</span>
                  <div class="val-box">${rdo.work_force_count ?? ''}</div>
                </div>
                <div class="wf-row" style="margin-top: 4px;">
                  <span class="label">ENGENHEIRO PREPOSTO</span>
                  <div class="val-box">${rdo.representative_engineer || contractorManager}</div>
                </div>
              </div>

              <div class="wf-right">
                <div class="check-group">
                  <span class="check-label">SUFICIENTE?</span>
                  <span class="check-box ${sufficSim}">SIM</span>
                  <span class="check-box ${sufficNao}">NÃO</span>
                </div>
                <div class="check-group" style="margin-top: 4px;">
                  <span class="check-label">PRESENTE?</span>
                  <span class="check-box ${presSim}">SIM</span>
                  <span class="check-box ${presNao}">NÃO</span>
                </div>
              </div>
            </div>

            <!-- Notes 1: Contratada -->
            <div class="notes-block">
              <div class="notes-header">OBSERVAÇÕES DA CONTRATADA:</div>
              <div class="notes-content">${rdo.contractor_notes || ''}</div>
            </div>

            <!-- Notes 2: Supervisora -->
            <div class="notes-block">
              <div class="notes-header">OBSERVAÇÕES DA SUPERVISORA:</div>
              <div class="notes-content">${rdo.supervisor_notes || ''}</div>
            </div>

            <!-- Notes 3: Fiscal -->
            <div class="notes-block">
              <div class="notes-header">OBSERVAÇÕES DO FISCAL DO DER/PR:</div>
              <div class="notes-content">${rdo.fiscal_notes || ''}</div>
            </div>

            <!-- Signatures Footer -->
            <div class="signatures-grid">
              <div class="sig-col">
                <span class="sig-title">GERENTE DE CONTRATO DA EXECUTORA</span>
                <span class="sig-name">${contractorManager}</span>
              </div>
              <div class="sig-col">
                <span class="sig-title">ENGENHEIRO DA SUPERVISORA</span>
                <span class="sig-name">${supervisorEngineer}</span>
              </div>
              <div class="sig-col">
                <span class="sig-title">ENGENHEIRO FISCAL DO DER</span>
                <span class="sig-name">${fiscalEngineer}</span>
              </div>
            </div>

            <div class="page-footer-note">
              ${isFinal ? '' : 'RASCUNHO - '}FOLHA ${rdo.folio_number || 1} - PÁGINA ${pIdx + 1} DE ${pCount}
            </div>
          </div>
        `;
      }
    });

    printWin.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Diário de Obras — Folha Nº ${rdoData.folio_number || 1}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 6mm 8mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
              margin: 0;
              padding: 0;
              font-size: 9px;
              background: #f8fafc;
            }
            @media print {
              .no-print {
                display: none !important;
              }
              body {
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
              }
              .sheet {
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                margin: 0 auto !important;
                height: 282mm !important;
                max-height: 282mm !important;
                box-shadow: none !important;
              }
              .sheet:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }
            }
            .toolbar {
              background: #0f172a;
              color: #fff;
              padding: 10px 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .toolbar button {
              background: #f59e0b;
              color: #0f172a;
              border: none;
              padding: 7px 18px;
              border-radius: 6px;
              font-weight: bold;
              font-size: 13px;
              cursor: pointer;
            }
            .sheet {
              width: 194mm;
              max-width: 194mm;
              height: 282mm;
              max-height: 282mm;
              margin: 10px auto;
              background: #fff;
              padding: 0;
              page-break-after: always;
              page-break-inside: avoid;
              break-after: page;
              break-inside: avoid;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
            }
            .sheet:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .rdo-top-bar {
              display: flex;
              flex-direction: column;
              justify-content: center;
              border: 1px solid #000;
              padding: 4px 8px;
              margin-bottom: 2px;
              min-height: 12mm;
              max-height: 22mm;
              overflow: hidden;
            }
            .rdo-banner-img {
              max-height: 16mm;
              max-width: 100%;
              object-fit: contain;
              margin: 0 auto;
              display: block;
            }
            .rdo-banner-text {
              line-height: 1.25;
              white-space: pre-line;
              width: 100%;
            }

            .grid-ident {
              display: flex;
              border: 1px solid #000;
              border-top: none;
            }
            .cell-half {
              flex: 1;
              display: flex;
              flex-direction: column;
            }
            .cell-half:first-child {
              border-right: 1px solid #000;
            }
            .sub-cell {
              border-bottom: 1px solid #000;
              padding: 1.5px 5px;
              min-height: 22px;
            }
            .sub-cell:last-child {
              border-bottom: none;
            }
            .label {
              display: block;
              font-size: 7px;
              color: #444;
              font-weight: bold;
              text-transform: uppercase;
              line-height: 1;
            }
            .val-text {
              font-size: 8.5px;
              font-weight: bold;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              line-height: 1.2;
            }

            .weather-row {
              display: flex;
              gap: 2px;
              margin-top: 1px;
            }
            .w-item {
              flex: 1;
              border: 1px solid #000;
              text-align: center;
              font-size: 6.5px;
              padding: 1.5px 0;
              font-weight: bold;
            }

            .row-flex-sub {
              display: flex;
              border-bottom: 1px solid #000;
            }
            .box-folio {
              flex: 1;
              border-right: 1px solid #000;
              padding: 1.5px 5px;
              text-align: center;
            }
            .box-folio .box-num {
              font-size: 11px;
              font-weight: 900;
              line-height: 1.1;
            }
            .box-date {
              flex: 1.2;
              padding: 1.5px 5px;
              text-align: center;
            }
            .date-digits {
              display: flex;
              justify-content: center;
              gap: 3px;
              font-weight: bold;
              font-size: 8.5px;
              margin-top: 1px;
            }
            .date-digits span {
              border: 1px solid #666;
              padding: 0.5px 3px;
            }

            .week-days-row {
              display: flex;
              gap: 2px;
              margin-top: 1px;
            }
            .day-box {
              flex: 1;
              border: 1px solid #000;
              text-align: center;
              font-size: 6.5px;
              padding: 1.5px 0;
              font-weight: bold;
            }

            .bg-active {
              background: #047857 !important;
              color: #fff !important;
            }

            .section-banner {
              border: 1px solid #000;
              border-top: none;
              background: #f1f5f9;
              font-weight: 900;
              font-size: 8px;
              padding: 2.5px 5px;
              letter-spacing: 0.5px;
            }

            .services-block {
              border: 1px solid #000;
              border-top: none;
              display: flex;
              flex-direction: column;
            }
            .service-row {
              display: flex;
              border-bottom: 1px solid #ccc;
              height: 7.0mm;
              max-height: 7.0mm;
              line-height: 7.0mm;
              overflow: hidden;
            }
            .service-row:last-child {
              border-bottom: none;
            }
            .service-num {
              width: 24px;
              text-align: center;
              font-size: 9px;
              font-weight: bold;
              border-right: 1px solid #ccc;
              color: #444;
              flex-shrink: 0;
            }
            .service-text {
              flex: 1;
              padding-left: 6px;
              font-size: 11px;
              font-weight: bold;
              text-transform: uppercase;
              overflow: hidden;
              white-space: nowrap;
              text-overflow: ellipsis;
            }

            .workforce-grid {
              display: flex;
              border: 1px solid #000;
              border-top: none;
              padding: 4px 6px;
            }
            .wf-left {
              flex: 1.2;
              border-right: 1px solid #000;
              padding-right: 6px;
            }
            .wf-right {
              flex: 0.8;
              padding-left: 6px;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }
            .wf-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
            }
            .val-box {
              border: 1px solid #000;
              padding: 2px 6px;
              font-weight: bold;
              font-size: 9px;
              min-width: 65px;
              text-align: center;
            }
            .check-group {
              display: flex;
              align-items: center;
              justify-content: flex-end;
              gap: 4px;
            }
            .check-label {
              font-size: 7.5px;
              font-weight: bold;
            }
            .check-box {
              border: 1px solid #000;
              padding: 2px 7px;
              font-size: 7px;
              font-weight: bold;
            }

            .notes-block {
              border: 1px solid #000;
              border-top: none;
              padding: 4px 6px;
              min-height: 38px;
            }
            .notes-header {
              font-size: 7.5px;
              font-weight: 900;
              margin-bottom: 2px;
            }
            .notes-content {
              font-size: 8.5px;
              line-height: 1.25;
              white-space: pre-wrap;
              max-height: 32px;
              overflow: hidden;
            }

            .signatures-grid {
              border: 1px solid #000;
              border-top: none;
              display: flex;
              text-align: center;
            }
            .sig-col {
              flex: 1;
              padding: 6px 4px 3px 4px;
              border-right: 1px solid #000;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
            .sig-col:last-child {
              border-right: none;
            }
            .sig-title {
              display: block;
              font-size: 7px;
              font-weight: bold;
              margin-bottom: 14px;
              text-transform: uppercase;
            }
            .sig-name {
              display: block;
              font-size: 8px;
              font-weight: bold;
              border-top: 1px solid #000;
              padding-top: 2px;
            }

            .page-footer-note {
              text-align: right;
              font-size: 7px;
              color: #444;
              margin-top: 1px;
              font-style: italic;
            }
          </style>
        </head>
        <body>
          <div class="toolbar no-print">
            <div>
              <strong>AXIS OBRA • Diário de Obras Oficial (Padrão DER/PR)</strong>
              <span style="margin-left: 12px; font-size: 11px; opacity: 0.8;">${recordsToPrint.length} folha(s) gerada(s)</span>
            </div>
            <button onclick="window.print()">Imprimir / Salvar em PDF</button>
          </div>
          ${fullHtmlPages}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 400);
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  // Export scope execution
  const handleExportScope = async (fmt) => {
    let records = [];

    if (exportScope === 'current') {
      records = [
        {
          rdo: rdoData,
          date: currentDate,
          lines: servicesLines.map((s) => String(s || '').trim()).filter(Boolean)
        }
      ];
    } else {
      let filtered = [...existingRdos];
      if (exportScope === 'month') {
        const ym = fromDate.slice(0, 7);
        filtered = filtered.filter((r) => r.rdo_date.startsWith(ym));
      } else {
        filtered = filtered.filter((r) => r.rdo_date >= fromDate && r.rdo_date <= toDate);
      }

      if (filtered.length === 0) {
        alert('Nenhum RDO encontrado para a seleção de exportação.');
        return;
      }

      setLoading(true);
      try {
        records = await Promise.all(
          filtered.map(async (rec) => {
            const detail = await apiRequest(`/api/rdo/by-date?projectId=${rec.project_id}&date=${rec.rdo_date}`);
            const lines = parseServices(detail.services_developed);
            return {
              rdo: detail,
              date: rec.rdo_date,
              lines
            };
          })
        );
      } catch (err) {
        alert('Erro ao carregar dados para exportação: ' + err.message);
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (fmt === 'pdf') {
      handlePrintA4Rdo(records);
      setExportModalOpen(false);
    } else if (fmt === 'xlsx') {
      let csv = '\uFEFF';
      csv += 'Nº RDO;Data;Dia da Semana;Status;Clima;Profissionais;Equipe Suficiente;Preposto Presente;Serviços do Dia;Observações Contratada;Observações Supervisora;Observações Fiscal\n';
      records.forEach(({ rdo, date, lines }) => {
        const [y, m, d] = date.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        const wName = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][dt.getUTCDay()];
        const lineStr = lines.join(' | ').replace(/;/g, ',');
        const row = [
          rdo.folio_number || 1,
          brDate(date),
          wName,
          rdo.status === 'final' ? 'Finalizado' : 'Rascunho',
          rdo.weather_condition || 'BOM',
          rdo.work_force_count ?? 0,
          rdo.work_force_sufficient ? 'SIM' : 'NÃO',
          rdo.representative_present ? 'SIM' : 'NÃO',
          `"${lineStr}"`,
          `"${String(rdo.contractor_notes || '').replace(/"/g, '""')}"`,
          `"${String(rdo.supervisor_notes || '').replace(/"/g, '""')}"`,
          `"${String(rdo.fiscal_notes || '').replace(/"/g, '""')}"`
        ];
        csv += row.join(';') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `RDOs-${targetProjectId}-${exportScope}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExportModalOpen(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* =========================================================================
          TOP ACTIONS & CONTROLS BAR
         ========================================================================= */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">2. RDO — Registro Diário de Obras</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Padrão DER/PR
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhamento diário oficial de serviços, clima, efetivo e ocorrências vinculadas às fotografias da obra.
              </p>
            </div>
          </div>
        </div>

        {/* Global Batch & Export buttons */}
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
          {canBatchRdo && (
          <button
            type="button"
            onClick={handleOpenBatchModal}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            Gerar RDOs em Lote
          </button>
          )}

          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shadow-xs transition"
          >
            <Download className="w-4 h-4 text-sky-200" />
            Exportar PDF / Excel
          </button>

          <button
            type="button"
            onClick={() => handlePrintA4Rdo()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold shadow-xs transition"
          >
            <Printer className="w-4 h-4" />
            Visualizar Folha Oficial
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Validation Issues Alert */}
      {validationIssues.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2 shadow-xs">
          <div className="font-bold flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            Itens pendentes para finalização da folha:
          </div>
          <ul className="list-disc pl-5 space-y-1 font-medium">
            {validationIssues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* =========================================================================
          ITEM 1: FILTER INTERVAL WITH RAPID YEAR & MONTH SELECTORS
         ========================================================================= */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Obra selector */}
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-xs font-bold text-slate-700 shrink-0">Obra:</span>
            <select
              value={targetProjectId}
              onChange={(e) => setTargetProjectId(e.target.value)}
              className="w-full sm:w-auto max-w-full truncate px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Year & Month Selectors + Date Range */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
            <div className="grid grid-cols-2 sm:flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold">
                <span className="shrink-0">Ano:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => handleYearFilterChange(e.target.value)}
                  className="w-full sm:w-auto border border-slate-300 rounded-lg px-2 py-1.5 sm:py-1 text-xs font-semibold bg-white"
                >
                  <option value="ALL">Todos os Anos</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold">
                <span className="shrink-0">Mês:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => handleMonthFilterChange(e.target.value)}
                  className="w-full sm:w-auto border border-slate-300 rounded-lg px-2 py-1.5 sm:py-1 text-xs font-semibold bg-white"
                >
                  {MONTHS_LIST.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 text-xs text-slate-600 sm:border-l sm:border-slate-200 sm:pl-2">
              <div className="flex items-center gap-1">
                <span className="font-bold shrink-0">De:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full sm:w-auto border border-slate-300 rounded-lg px-2 py-1.5 sm:py-1 text-xs font-semibold"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="font-bold shrink-0">até:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full sm:w-auto border border-slate-300 rounded-lg px-2 py-1.5 sm:py-1 text-xs font-semibold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Existing RDO Pills Bar */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
              RDOs cadastrados no intervalo ({filteredRdos.length}):
            </span>
            <span className="text-[11px] text-slate-400">
              Toque em um dia para abrir e editar
            </span>
          </div>

          {filteredRdos.length === 0 ? (
            <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
              Nenhum RDO cadastrado neste período. Utilize as opções de criação abaixo.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
              {filteredRdos.map((rec) => {
                const isActive = rec.rdo_date === currentDate;
                const isFinal = rec.status === 'final';
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setCurrentDate(rec.rdo_date)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                      isActive
                        ? 'bg-amber-100 border-amber-500 text-slate-900 shadow-2xs ring-2 ring-amber-400/40'
                        : isFinal
                        ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900'
                        : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                    }`}
                  >
                    <span>{brDate(rec.rdo_date)}</span>
                    <span className="text-[10px] opacity-75">• RDO nº {rec.folio_number}</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-black ${
                        isFinal ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
                      }`}
                    >
                      {isFinal ? 'Finalizado' : 'Rascunho'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          ITEM 2: INTERACTIVE CUSTOM CALENDAR POPOVER & NAVIGATION
          - Ponto colorido para dias com registro fotográfico (🟠)
          - Destaque em verde para dias em que já foi gerado RDO (🟢)
         ========================================================================= */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 relative">
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 relative" ref={calendarRef}>
            <button
              type="button"
              onClick={() => handleShiftDate(-1)}
              className="p-2 sm:p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition"
              title="Dia Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Date button that triggers the custom calendar */}
            <button
              type="button"
              onClick={() => setCalendarOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-lg hover:bg-white text-xs font-bold text-slate-800 transition"
              title="Abrir calendário interativo com marcações de fotos e RDOs"
            >
              <CalendarIcon className="w-4 h-4 text-amber-500" />
              <span>{brDate(currentDate)}</span>
            </button>

            <button
              type="button"
              onClick={() => handleShiftDate(1)}
              className="p-2 sm:p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition"
              title="Dia Seguinte"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleSetToday}
              className="px-2.5 py-1.5 sm:py-1 text-[11px] font-bold rounded-md bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs ml-1"
            >
              Hoje
            </button>

            {/* =====================================================================
                CUSTOM CALENDAR POPOVER (POPUP COM MARCAÇÕES)
               ===================================================================== */}
            {calendarOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 space-y-2 animate-in fade-in zoom-in-95">
                {/* Calendar Header with Month/Year Navigation */}
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="text-xs font-black text-slate-900 capitalize">
                    {calMonthName} de {calYear}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePrevCalMonth}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
                      title="Mês Anterior"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextCalMonth}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
                      title="Próximo Mês"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Weekday column headers */}
                <div className="grid grid-cols-7 text-center font-bold text-[10px] text-slate-400">
                  <span>D</span>
                  <span>S</span>
                  <span>T</span>
                  <span>Q</span>
                  <span>Q</span>
                  <span>S</span>
                  <span>S</span>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((cell, idx) => {
                    const hasRdo = rdosMap.has(cell.dateKey);
                    const photoCount = photoDatesMap.get(cell.dateKey) || 0;
                    const hasPhotos = photoCount > 0;
                    const isSelected = cell.dateKey === currentDate;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCurrentDate(cell.dateKey);
                          setCalendarOpen(false);
                        }}
                        title={`${brDate(cell.dateKey)}${hasRdo ? ' • RDO Gerado' : ''}${hasPhotos ? ` • ${photoCount} foto(s)` : ''}`}
                        className={`h-8 rounded-lg flex flex-col items-center justify-center relative text-xs font-bold transition ${
                          !cell.isCurrentMonth
                            ? 'text-slate-300 hover:text-slate-500'
                            : isSelected
                            ? 'ring-2 ring-blue-500 font-black'
                            : 'text-slate-700 hover:bg-slate-100'
                        } ${
                          hasRdo
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-400 hover:bg-emerald-200'
                            : ''
                        }`}
                      >
                        <span className="leading-tight">{cell.dayNumber}</span>
                        {/* Ponto indicador de Registro Fotográfico */}
                        {hasPhotos && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${
                              hasRdo ? 'bg-amber-600' : 'bg-amber-500'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend Footer */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-400 inline-block" />
                      <span>RDO gerado</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                      <span>Com fotos</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleSetToday();
                      setCalendarOpen(false);
                    }}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    Hoje
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* =====================================================================
              ITEM 3: APROVADO — STATUS BADGE & PHOTO COUNT (EXATAMENTE COMO NA FOTO 3)
             ===================================================================== */}
          <div className="flex flex-wrap items-center gap-2">
            {dayExists ? (
              isLocked ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-700" />
                  Folha Nº {rdoData.folio_number} — FINALIZADO
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                  <Unlock className="w-3 h-3 text-amber-700" />
                  Folha Nº {rdoData.folio_number} — RASCUNHO
                </span>
              )
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300">
                Sem RDO criado para esta data
              </span>
            )}

            <span className="text-xs text-slate-600">
              Fotos no dia: <strong className="text-slate-900">{rdoData.photos_count || 0}</strong>
            </span>

            {dayExists && canDeleteRdo && !isLocked && (
              <button
                type="button"
                onClick={handleDeleteRdo}
                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition"
                title="Excluir este RDO"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons for current day */}
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full md:w-auto">
          {dayExists && !isLocked && canEditRdo && (
            <>
              <button
                type="button"
                onClick={handleSyncWithPhotos}
                disabled={syncing}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold shadow-xs transition"
                title="Sincroniza os serviços a partir das fotos deste dia"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${syncing ? 'animate-spin' : ''}`} />
                Sincronizar com Fotos
              </button>

              <button
                type="button"
                onClick={() => handleSaveRdo('draft')}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold shadow-xs transition"
              >
                <Save className="w-3.5 h-3.5 text-slate-600" />
                Salvar Rascunho
              </button>

              {canFinalizeRdo && (
              <button
                type="button"
                onClick={handleFinalizeRdo}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition"
              >
                <Check className="w-4 h-4 text-emerald-200" />
                Finalizar RDO
              </button>
              )}
            </>
          )}

          {dayExists && isLocked && canReopenRdo && (
            <button
              type="button"
              onClick={handleReopenRdo}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold shadow-xs transition"
            >
              <Unlock className="w-3.5 h-3.5 text-amber-700" />
              Reabrir para Correções
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          ITEM 4: THREE CLEAR CREATION OPTIONS WHEN NO RDO EXISTS (FOTO 4)
          a) Criar RDO para a data atual
          b) Gerar RDO para todos os dias do período selecionado com fotos
          c) Gerar RDO de todos os dias do período (para envio mensal completo)
         ========================================================================= */}
      {!dayExists && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <FileText className="w-7 h-7" />
          </div>

          <div className="max-w-xl mx-auto space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              Nenhum Diário de Obras criado para {brDate(currentDate)}
            </h3>
            <p className="text-xs text-slate-500">
              O sistema não cria RDOs fictícios automaticamente para dias vazios. Escolha abaixo como deseja gerar:
            </p>
          </div>

          {/* Details Card */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl max-w-lg mx-auto text-xs text-slate-700 space-y-1 text-left">
            <div>
              Fotos registradas nesta data: <strong>{rdoData.photos_count || 0} foto(s)</strong>
            </div>
            {rdoData.suggested_services?.length > 0 && (
              <div className="text-[11px] text-emerald-700 font-semibold truncate">
                Serviços detectados: {rdoData.suggested_services.join(', ')}
              </div>
            )}
            <div>
              Próxima folha sequencial disponível: <strong>Folha Nº {rdoData.folio_number || 1}</strong>
            </div>
            <div className="text-slate-500 pt-1 border-t border-slate-200 text-[11px]">
              Período selecionado no filtro: <strong>{brDate(fromDate)}</strong> até <strong>{brDate(toDate)}</strong> ({totalDaysInPeriod} dias • {photoDatesInPeriod.length} com fotos)
            </div>
          </div>

          {/* Three Explicit Creation Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto pt-2">
            {/* Opção A: Apenas a data selecionada */}
            <button
              type="button"
              onClick={handleCreateRdoForCurrentDate}
              disabled={saving || batchActionLoading || !canCreateRdo}
              className="disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold text-xs flex flex-col items-center justify-between gap-2 shadow-xs transition group text-center"
            >
              <div className="flex items-center gap-1.5 text-emerald-700 font-black">
                <Plus className="w-4 h-4" />
                <span>Opção A: Criar Este Dia</span>
              </div>
              <p className="text-[11px] font-normal text-emerald-800">
                Gera o RDO da Folha Nº {rdoData.folio_number || 1} apenas para {brDate(currentDate)}.
              </p>
              <span className="mt-1 px-3 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-bold group-hover:bg-emerald-800">
                Criar RDO do Dia
              </span>
            </button>

            {/* Opção B: Dias com fotos do período */}
            <button
              type="button"
              onClick={handleGenerateRdoForPhotoDaysInPeriod}
              disabled={saving || batchActionLoading || !canBatchRdo}
              className="disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-950 font-bold text-xs flex flex-col items-center justify-between gap-2 shadow-xs transition group text-center"
            >
              <div className="flex items-center gap-1.5 text-sky-700 font-black">
                <Sparkles className="w-4 h-4" />
                <span>Opção B: Dias com Fotos</span>
              </div>
              <p className="text-[11px] font-normal text-sky-800">
                Gera RDOs para todos os {photoDatesInPeriod.length} dias do período que possuem fotos registradas.
              </p>
              <span className="mt-1 px-3 py-1 rounded-lg bg-sky-700 text-white text-[11px] font-bold group-hover:bg-sky-800">
                Gerar RDOs com Fotos
              </span>
            </button>

            {/* Opção C: Todos os dias do período (completo com dias sem fotos) */}
            <button
              type="button"
              onClick={handleGenerateCompleteRdoForEveryDayInPeriod}
              disabled={saving || batchActionLoading || !canBatchRdo}
              className="disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-xs flex flex-col items-center justify-between gap-2 shadow-xs transition group text-center"
            >
              <div className="flex items-center gap-1.5 text-amber-800 font-black">
                <FileStack className="w-4 h-4 text-amber-600" />
                <span>Opção C: Período Completo</span>
              </div>
              <p className="text-[11px] font-normal text-amber-900">
                Gera todas as folhas ({totalDaysInPeriod} dias), incluindo domingos e chuvas, para envio mensal completo.
              </p>
              <span className="mt-1 px-3 py-1 rounded-lg bg-amber-600 text-slate-950 text-[11px] font-bold group-hover:bg-amber-700 group-hover:text-white">
                Gerar Período Completo
              </span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          OFFICIAL DER/PR TEMPLATE VIEW (APPROVED LAYOUT)
         ========================================================================= */}
      {dayExists && (
        <div className="bg-slate-100 p-2 sm:p-6 rounded-2xl border border-slate-300 flex justify-center">
          <div className="bg-white w-full max-w-[850px] p-3 sm:p-8 rounded-xl shadow-md border border-slate-300 space-y-3 font-sans text-xs">
            
            {/* Header: Banner Customizável (Configurado no Módulo 8 - mesmo critério do Relatório Fotográfico) */}
            <div
              className="border border-slate-900 p-2.5 sm:p-3 flex flex-col justify-center gap-1.5 min-h-[56px]"
              style={{ textAlign: bannerAlignCss }}
            >
              {showBannerImg && (
                <img
                  src={bannerImageUrl}
                  alt="Banner do Relatório"
                  className="max-h-16 max-w-full object-contain mx-auto"
                />
              )}
              {showBannerTxt && bannerText && (
                <div
                  style={{
                    fontSize:
                      bannerFontSize === 'SMALL'
                        ? '12px'
                        : bannerFontSize === 'LARGE'
                        ? '18px'
                        : '14px',
                    fontWeight: bannerBold ? '700' : '400',
                    fontStyle: bannerItalic ? 'italic' : 'normal',
                    textDecoration: bannerUnderline ? 'underline' : 'none',
                    color: bannerColor,
                    whiteSpace: 'pre-line',
                    textAlign: bannerAlignCss
                  }}
                >
                  {bannerText}
                </div>
              )}
            </div>

            {/* Top Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 border border-slate-900 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              {/* Left Column */}
              <div className="divide-y divide-slate-900">
                <div className="p-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">EMPRESA</span>
                  <div className="font-bold text-xs text-slate-900 break-words">{contractorCompany}</div>
                </div>

                <div className="p-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">TEMPO (CLIMA)</span>
                    {rdoData.pluviometry && (
                      <span className="text-[10px] font-medium text-sky-700 bg-sky-50 px-1.5 rounded">
                        Pluviometria: {rdoData.pluviometry.rainfall_mm} mm
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {WEATHER_CHOICES.map((w) => {
                      const isActive = rdoData.weather_condition === w.key;
                      return (
                        <button
                          key={w.key}
                          type="button"
                          disabled={isLocked}
                          onClick={() => setRdoData({ ...rdoData, weather_condition: w.key })}
                          className={`py-1.5 sm:py-1 text-center font-bold text-[10px] rounded border transition ${
                            isActive
                              ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          } ${isLocked ? 'cursor-default' : ''}`}
                        >
                          {w.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">CÓDIGO</span>
                  <input
                    type="text"
                    disabled={isLocked}
                    value={rdoData.work_code || ''}
                    onChange={(e) => setRdoData({ ...rdoData, work_code: e.target.value })}
                    placeholder="Código do lote / trecho"
                    className="w-full bg-transparent font-semibold text-xs outline-none disabled:text-slate-800"
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="divide-y divide-slate-900">
                <div className="grid grid-cols-2 divide-x divide-slate-900">
                  <div className="p-2 text-center">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">Nº DA FOLHA:</span>
                    <input
                      type="number"
                      disabled={isLocked}
                      value={rdoData.folio_number || 1}
                      onChange={(e) => setRdoData({ ...rdoData, folio_number: Number(e.target.value) })}
                      className="w-full text-center font-black text-sm outline-none bg-transparent disabled:text-slate-900"
                    />
                  </div>
                  <div className="p-2 text-center">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">DATA (dd/mm/aaaa)</span>
                    <div className="flex items-center justify-center gap-1 sm:gap-2 mt-0.5 font-bold text-xs">
                      <span className="border border-slate-300 px-1.5 py-0.5 rounded bg-slate-50">{dateParts.day}</span>
                      <span>/</span>
                      <span className="border border-slate-300 px-1.5 py-0.5 rounded bg-slate-50">{dateParts.month}</span>
                      <span>/</span>
                      <span className="border border-slate-300 px-1.5 py-0.5 rounded bg-slate-50">{dateParts.year}</span>
                    </div>
                  </div>
                </div>

                <div className="p-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">CONTRATO Nº</span>
                  <div className="font-bold text-xs text-slate-900 break-words">{contractNumber}</div>
                </div>

                <div className="p-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">SUPERVISORA</span>
                  <div className="font-bold text-xs text-slate-900 break-words">{supervisorCompany}</div>
                </div>

                <div className="p-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">DIA DA SEMANA</span>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((wd) => {
                      const isActive = wd.key === dateParts.weekdayKey;
                      return (
                        <div
                          key={wd.key}
                          className={`py-1 sm:py-0.5 text-center font-bold text-[9px] sm:text-[10px] rounded border ${
                            isActive
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          {wd.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Section Header: SERVIÇOS DESENVOLVIDOS NO DIA */}
            <div className="border border-slate-900 bg-slate-50 p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-extrabold text-xs text-slate-900 tracking-wide uppercase">
                SERVIÇOS DESENVOLVIDOS NO DIA:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] text-slate-500 font-semibold">
                  {servicesLines.length} linhas ({totalPages} pág.)
                </span>
                {!isLocked && (
                  <>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="px-2.5 py-1 sm:py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-300 text-[11px] font-bold text-slate-700"
                    >
                      + 1 Linha
                    </button>
                    <button
                      type="button"
                      onClick={handleAddNextPage}
                      className="px-2.5 py-1 sm:py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[11px] font-bold text-emerald-800"
                    >
                      + Abrir Nova Folha (12 linhas)
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* The 12 Lines Table */}
            <div className="border border-slate-900 divide-y divide-slate-200">
              {servicesLines.map((lineText, idx) => {
                const isNewPageBoundary = idx > 0 && idx % 12 === 0;
                return (
                  <React.Fragment key={idx}>
                    {isNewPageBoundary && (
                      <div className="bg-amber-100/70 p-1.5 text-center font-bold text-[10px] text-amber-900 border-y border-amber-300">
                        --- Quebra de Página: Folha {rdoData.folio_number} • Página {Math.floor(idx / 12) + 1} de {totalPages} ---
                      </div>
                    )}
                    <div className="flex items-center hover:bg-slate-50 transition">
                      <span className="w-8 text-center font-bold text-[11px] text-slate-500 border-r border-slate-200 py-2 sm:py-1.5 select-none">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        disabled={isLocked}
                        value={lineText}
                        onChange={(e) => handleLineTextChange(idx, e.target.value)}
                        placeholder={idx === 0 && !isLocked ? 'Ex: EXECUÇÃO DE BSTC Ø0,60' : ''}
                        className="flex-1 min-w-0 px-2.5 sm:px-3 py-2 sm:py-1.5 text-[11px] font-semibold text-slate-900 bg-transparent outline-none focus:bg-amber-50/40 uppercase disabled:text-slate-900"
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Workforce & Representative */}
            <div className="grid grid-cols-1 md:grid-cols-2 border border-slate-900 divide-y md:divide-y-0 md:divide-x divide-slate-900 p-2.5 sm:p-2 gap-2.5 sm:gap-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[11px] text-slate-700">PROFISSIONAIS EM ATIVIDADE:</span>
                  <input
                    type="number"
                    disabled={isLocked}
                    value={rdoData.work_force_count ?? ''}
                    onChange={(e) => setRdoData({ ...rdoData, work_force_count: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="Ex: 320"
                    className="w-24 px-2 py-1 sm:py-0.5 border border-slate-900 font-bold text-center text-xs disabled:text-slate-900"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                  <span className="font-bold text-[11px] text-slate-700">ENGENHEIRO PREPOSTO:</span>
                  <input
                    type="text"
                    disabled={isLocked}
                    value={rdoData.representative_engineer || ''}
                    onChange={(e) => setRdoData({ ...rdoData, representative_engineer: e.target.value })}
                    placeholder="Nome do preposto"
                    className="flex-1 px-2 py-1 sm:py-0.5 border border-slate-900 font-bold text-xs disabled:text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-2 pl-0 md:pl-2 pt-2.5 md:pt-0">
                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <span className="font-bold text-[11px] text-slate-700">SUFICIENTE?</span>
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setRdoData({ ...rdoData, work_force_sufficient: 1 })}
                      className={`px-3 py-1 sm:py-0.5 text-[10px] font-bold border rounded ${
                        rdoData.work_force_sufficient
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setRdoData({ ...rdoData, work_force_sufficient: 0 })}
                      className={`px-3 py-1 sm:py-0.5 text-[10px] font-bold border rounded ${
                        !rdoData.work_force_sufficient
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <span className="font-bold text-[11px] text-slate-700">PRESENTE?</span>
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setRdoData({ ...rdoData, representative_present: 1 })}
                      className={`px-3 py-1 sm:py-0.5 text-[10px] font-bold border rounded ${
                        rdoData.representative_present
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setRdoData({ ...rdoData, representative_present: 0 })}
                      className={`px-3 py-1 sm:py-0.5 text-[10px] font-bold border rounded ${
                        !rdoData.representative_present
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Observações da Contratada */}
            <div className="border border-slate-900 p-2.5 space-y-1.5">
              <span className="block font-bold text-[10px] text-slate-800 uppercase">
                OBSERVAÇÕES DA CONTRATADA:
              </span>
              <textarea
                rows={3}
                disabled={isLocked}
                value={rdoData.contractor_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, contractor_notes: e.target.value })}
                placeholder="Ex: Serviços complementares, paralisações por chuva ou motivo do dia sem fotos..."
                className="w-full text-xs font-medium outline-none bg-transparent resize-y disabled:text-slate-900"
              />
            </div>

            {/* Observações da Supervisora */}
            <div className="border border-slate-900 p-2.5 space-y-1.5">
              <span className="block font-bold text-[10px] text-slate-800 uppercase">
                OBSERVAÇÕES DA SUPERVISORA:
              </span>
              <textarea
                rows={3}
                disabled={isLocked}
                value={rdoData.supervisor_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, supervisor_notes: e.target.value })}
                placeholder="Ex: DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE"
                className="w-full text-xs font-medium outline-none bg-transparent resize-y disabled:text-slate-900"
              />
            </div>

            {/* Observações do Fiscal do DER/PR */}
            <div className="border border-slate-900 p-2.5 space-y-1.5">
              <span className="block font-bold text-[10px] text-slate-800 uppercase">
                OBSERVAÇÕES DO FISCAL DO DER/PR:
              </span>
              <textarea
                rows={3}
                disabled={isLocked}
                value={rdoData.fiscal_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, fiscal_notes: e.target.value })}
                placeholder="Registros e determinações da fiscalização..."
                className="w-full text-xs font-medium outline-none bg-transparent resize-y disabled:text-slate-900"
              />
            </div>

            {/* Signatures Footer */}
            <div className="border border-slate-900 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-900 text-center p-3 gap-3 sm:gap-0">
              <div className="space-y-3 py-1 sm:py-0">
                <span className="block text-[9px] font-bold text-slate-600 uppercase">
                  GERENTE DE CONTRATO DA EXECUTORA
                </span>
                <span className="block font-bold text-xs text-slate-900 border-t border-slate-400 pt-1 mx-2">
                  {contractorManager}
                </span>
              </div>

              <div className="space-y-3 py-1 sm:py-0">
                <span className="block text-[9px] font-bold text-slate-600 uppercase">
                  ENGENHEIRO DA SUPERVISORA
                </span>
                <span className="block font-bold text-xs text-slate-900 border-t border-slate-400 pt-1 mx-2">
                  {supervisorEngineer}
                </span>
              </div>

              <div className="space-y-3 py-1 sm:py-0">
                <span className="block text-[9px] font-bold text-slate-600 uppercase">
                  ENGENHEIRO FISCAL DO DER
                </span>
                <span className="block font-bold text-xs text-slate-900 border-t border-slate-400 pt-1 mx-2">
                  {fiscalEngineer}
                </span>
              </div>
            </div>

            {/* Page Footer */}
            <div className="text-right text-[10px] text-slate-500 italic pt-1">
              {isLocked ? '' : 'RASCUNHO - '}FOLHA {rdoData.folio_number || 1} - PÁGINA 1 DE {totalPages}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          BATCH GENERATION MODAL (GERAR RDOS EM LOTE)
         ========================================================================= */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Gerar RDOs em Lote — {currentProject.code || currentProject.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Cria automaticamente rascunhos de RDO para o período filtrado ({brDate(fromDate)} até {brDate(toDate)}). RDOs já existentes são preservados integralmente.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Profissionais iniciais:
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={batchDefaults.professionals}
                  onChange={(e) => setBatchDefaults({ ...batchDefaults, professionals: e.target.value })}
                  placeholder="Ex: 320 (ou em branco)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Clima padrão caso não haja chuva:
                </label>
                <select
                  value={batchDefaults.weather}
                  onChange={(e) => setBatchDefaults({ ...batchDefaults, weather: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white font-medium"
                >
                  <option value="BOM">BOM</option>
                  <option value="INSTAVEL">INSTÁVEL</option>
                  <option value="CHUVOSO">CHUVOSO</option>
                  <option value="IMPRATICAVEL">IMPRATICÁVEL</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Equipe suficiente?
                </label>
                <select
                  value={batchDefaults.sufficient}
                  onChange={(e) => setBatchDefaults({ ...batchDefaults, sufficient: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white font-medium"
                >
                  <option value="SIM">SIM</option>
                  <option value="NAO">NÃO</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Preposto presente?
                </label>
                <select
                  value={batchDefaults.present}
                  onChange={(e) => setBatchDefaults({ ...batchDefaults, present: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white font-medium"
                >
                  <option value="SIM">SIM</option>
                  <option value="NAO">NÃO</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 text-xs mb-1">
                Observações iniciais da contratada (opcional):
              </label>
              <textarea
                rows={2}
                value={batchDefaults.contractorNotes}
                onChange={(e) => setBatchDefaults({ ...batchDefaults, contractorNotes: e.target.value })}
                placeholder="Texto inicial para todos os dias do lote..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeEmptyBatch}
                onChange={(e) => setIncludeEmptyBatch(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Incluir também dias sem fotos no intervalo do período (geração completa de todos os dias)
            </label>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteBatchModal}
                disabled={batchLoading}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
              >
                {batchLoading ? 'Gerando Lote...' : 'Criar Rascunhos do Período'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          EXPORT MODAL (PDF / EXCEL)
         ========================================================================= */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-slate-900 text-base">Exportar Diário de Obras (RDO)</h3>
              </div>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Escopo de Exportação:
                </label>
                <select
                  value={exportScope}
                  onChange={(e) => setExportScope(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white font-medium"
                >
                  <option value="period">Período selecionado ({brDate(fromDate)} até {brDate(toDate)})</option>
                  <option value="month">Mês inteiro ({fromDate.slice(0, 7)})</option>
                  <option value="current">Apenas a folha atual ({brDate(currentDate)})</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800">
                  {exportScope === 'current'
                    ? `Será exportada a Folha Nº ${rdoData.folio_number || 1} de ${brDate(currentDate)}.`
                    : exportScope === 'month'
                    ? `Serão exportadas todas as folhas cadastradas para o mês ${fromDate.slice(0, 7)}.`
                    : `Serão exportadas todas as folhas cadastradas entre ${brDate(fromDate)} e ${brDate(toDate)}.`}
                </div>
                <div className="text-slate-500">
                  No formato PDF, cada folha segue o modelo oficial padrão DER/PR em formato A4.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleExportScope('xlsx')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-amber-400 text-xs font-bold shadow-xs transition flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Exportar Excel (.csv)
              </button>
              <button
                type="button"
                onClick={() => handleExportScope('pdf')}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4 text-amber-300" />
                Gerar PDF Oficial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
