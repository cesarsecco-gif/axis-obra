import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FileText,
  Calendar,
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
  HardHat,
  Shield,
  Layers,
  List,
  Clock,
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  AlertCircle,
  Lock,
  Unlock,
  Download,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle,
  Info
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';

const WEEKDAYS = [
  { key: 0, label: 'DOM' },
  { key: 1, label: 'SEG' },
  { key: 2, label: 'TER' },
  { key: 3, label: 'QUA' },
  { key: 4, label: 'QUI' },
  { key: 5, label: 'SEX' },
  { key: 6, label: 'SÁB' }
];

const WEATHER_CHOICES = [
  { key: 'BOM', label: 'BOM', icon: Sun },
  { key: 'INSTAVEL', label: 'INSTÁVEL', icon: Cloud },
  { key: 'CHUVOSO', label: 'CHUVOSO', icon: CloudRain },
  { key: 'IMPRATICAVEL', label: 'IMPRATICÁVEL', icon: CloudLightning }
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
  const [viewMode, setViewMode] = useState('SHEET'); // 'SHEET' | 'LIST'
  const [targetProjectId, setTargetProjectId] = useState(
    selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
  );

  // Interval filter for RDO pills and exports
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return d.toISOString().slice(0, 10);
  });

  // Current active date
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Loading & Action states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationIssues, setValidationIssues] = useState([]);

  // Existing RDOs list in current project & date range
  const [existingRdos, setExistingRdos] = useState([]);

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

  // 20 lines slots per page
  const [servicesLines, setServicesLines] = useState(Array(20).fill(''));

  // Modals
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
  const [photoDatesSummary, setPhotoDatesSummary] = useState([]);

  // Export Modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState('period'); // 'month' | 'period' | 'current'

  // Update targetProjectId if prop changes
  useEffect(() => {
    if (selectedProjectId !== 'ALL' && selectedProjectId) {
      setTargetProjectId(selectedProjectId);
    } else if (!targetProjectId && projects.length > 0) {
      setTargetProjectId(projects[0].id);
    }
  }, [selectedProjectId, projects, targetProjectId]);

  // Load existing RDO records for the project
  const loadExistingRdos = useCallback(async (pid) => {
    if (!pid) return;
    try {
      const list = await apiRequest(`/api/rdo?projectId=${pid}&order=ASC`);
      setExistingRdos(list || []);

      if (list && list.length > 0) {
        const dates = list.map((r) => r.rdo_date).sort();
        setFromDate((prev) => (prev > dates[0] ? dates[0] : prev));
        setToDate((prev) => (prev < dates[dates.length - 1] ? dates[dates.length - 1] : prev));
      }
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

      // Ensure at least 20 slots
      const initialSlots = Array(Math.max(20, Math.ceil(parsedServices.length / 20) * 20)).fill('');
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

  // Day navigation handlers
  const handleShiftDate = (days) => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    setCurrentDate(dt.toISOString().slice(0, 10));
  };

  const handleSetToday = () => {
    setCurrentDate(new Date().toISOString().slice(0, 10));
  };

  // Filtered RDO pills within interval
  const filteredRdos = useMemo(() => {
    return existingRdos.filter((r) => {
      if (fromDate && r.rdo_date < fromDate) return false;
      if (toDate && r.rdo_date > toDate) return false;
      return true;
    });
  }, [existingRdos, fromDate, toDate]);

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

  // Create RDO for current date
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

      const newSlots = Array(Math.max(20, Math.ceil(cleanServices.length / 20) * 20)).fill('');
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

  // Save RDO as Draft or Final
  const handleSaveRdo = async (newStatus = 'draft') => {
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
        reopened_reason: newStatus === 'draft' && rdoData.status === 'final' ? 'Reaberto para correções manuais.' : ''
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
        status: newStatus
      }));

      if (newStatus === 'final') {
        setSuccessMessage(`RDO Folha Nº ${rdoData.folio_number} FINALIZADO com sucesso! Folha bloqueada para edições.`);
      } else {
        setSuccessMessage(`RDO Folha Nº ${rdoData.folio_number} salvo em Rascunho com sucesso!`);
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
    handleSaveRdo('draft');
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
        const newSlots = Array(Math.max(20, Math.ceil(incoming.length / 20) * 20)).fill('');
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

  // Open Batch Generation Modal
  const handleOpenBatchModal = async () => {
    setBatchModalOpen(true);
    setBatchLoading(true);
    try {
      const res = await apiRequest(`/api/rdo/photo-dates?projectId=${targetProjectId}`);
      setPhotoDatesSummary(res.dates || []);
    } catch (err) {
      console.error(err);
    } finally {
      setBatchLoading(false);
    }
  };

  // Execute Batch Creation
  const handleExecuteBatch = async () => {
    setBatchLoading(true);
    setErrorMessage('');
    try {
      const res = await apiRequest('/api/rdo/batch', {
        method: 'POST',
        body: JSON.stringify({
          project_id: targetProjectId,
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
    setServicesLines((prev) => [...prev, ...Array(20).fill('')]);
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

  const totalPages = Math.max(1, Math.ceil(servicesLines.length / 20));
  const isLocked = rdoData.status === 'final';

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

      const activeLines = lines.length > 0 ? lines : Array(20).fill('');
      const pCount = Math.max(1, Math.ceil(activeLines.length / 20));

      for (let pIdx = 0; pIdx < pCount; pIdx++) {
        const pageLines = activeLines.slice(pIdx * 20, (pIdx + 1) * 20);
        while (pageLines.length < 20) {
          pageLines.push('');
        }

        const linesRowsHtml = pageLines
          .map((text, idx) => {
            const num = pIdx * 20 + idx + 1;
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

        fullHtmlPages += `
          <div class="sheet">
            <!-- Header Logos & Title -->
            <div class="rdo-top-bar">
              <div class="top-logo-left">
                <div class="logo-badge-der">DER<br/><span>PARANÁ</span></div>
                <div class="state-gov">
                  <strong>PARANÁ</strong>
                  <span>GOVERNO DO ESTADO</span>
                </div>
              </div>
              <div class="top-title">
                <h1>DIÁRIO DE OBRAS</h1>
              </div>
              <div class="top-logo-right">
                <div class="consortium-logo">
                  <span class="c-bold">TRIPOLONI</span>
                  <span class="c-sub">Consol • WEILLER</span>
                </div>
              </div>
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

            <!-- 20 Service Lines -->
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
              margin: 7mm;
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
              font-size: 10px;
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
              max-width: 195mm;
              height: 278mm;
              margin: 0 auto;
              padding: 2mm 0;
              page-break-after: always;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
            .sheet:last-child {
              page-break-after: auto;
            }

            .rdo-top-bar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border: 1px solid #000;
              padding: 4px 8px;
              margin-bottom: 2px;
            }
            .top-logo-left {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .logo-badge-der {
              border: 1.5px solid #064e3b;
              color: #064e3b;
              font-weight: 900;
              font-size: 13px;
              line-height: 1;
              padding: 2px 4px;
              text-align: center;
            }
            .logo-badge-der span {
              font-size: 7px;
              letter-spacing: 1px;
            }
            .state-gov strong {
              display: block;
              font-size: 11px;
              line-height: 1.1;
            }
            .state-gov span {
              font-size: 7px;
              color: #444;
            }
            .top-title h1 {
              margin: 0;
              font-size: 15px;
              letter-spacing: 1px;
              font-weight: 900;
            }
            .top-logo-right .c-bold {
              display: block;
              font-weight: 900;
              font-size: 11px;
              color: #1e3a8a;
            }
            .top-logo-right .c-sub {
              font-size: 7.5px;
              color: #444;
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
              padding: 2px 6px;
              min-height: 25px;
            }
            .sub-cell:last-child {
              border-bottom: none;
            }
            .label {
              display: block;
              font-size: 7.5px;
              color: #444;
              font-weight: bold;
              text-transform: uppercase;
            }
            .val-text {
              font-size: 9px;
              font-weight: bold;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
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
              font-size: 7px;
              padding: 2px 0;
              font-weight: bold;
            }

            .row-flex-sub {
              display: flex;
              border-bottom: 1px solid #000;
            }
            .box-folio {
              flex: 1;
              border-right: 1px solid #000;
              padding: 2px 6px;
              text-align: center;
            }
            .box-folio .box-num {
              font-size: 12px;
              font-weight: 900;
            }
            .box-date {
              flex: 1.2;
              padding: 2px 6px;
              text-align: center;
            }
            .date-digits {
              display: flex;
              justify-content: center;
              gap: 4px;
              font-weight: bold;
              font-size: 9px;
              margin-top: 2px;
            }
            .date-digits span {
              border: 1px solid #666;
              padding: 1px 4px;
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
              font-size: 7px;
              padding: 2px 0;
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
              font-size: 8.5px;
              padding: 3px 6px;
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
              min-height: 12.8px;
              line-height: 12.8px;
            }
            .service-row:last-child {
              border-bottom: none;
            }
            .service-num {
              width: 24px;
              text-align: center;
              font-size: 7.5px;
              font-weight: bold;
              border-right: 1px solid #ccc;
              color: #444;
            }
            .service-text {
              flex: 1;
              padding-left: 6px;
              font-size: 8px;
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
              padding: 3px 6px;
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
              padding: 1px 6px;
              font-weight: bold;
              font-size: 8.5px;
              min-width: 70px;
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
              padding: 1px 6px;
              font-size: 7px;
              font-weight: bold;
            }

            .notes-block {
              border: 1px solid #000;
              border-top: none;
              padding: 3px 6px;
              min-height: 38px;
            }
            .notes-header {
              font-size: 7.5px;
              font-weight: 900;
              margin-bottom: 2px;
            }
            .notes-content {
              font-size: 8px;
              line-height: 1.2;
              white-space: pre-wrap;
            }

            .signatures-grid {
              border: 1px solid #000;
              border-top: none;
              display: flex;
              text-align: center;
            }
            .sig-col {
              flex: 1;
              padding: 8px 4px 4px 4px;
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
              margin-bottom: 12px;
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
              font-size: 7.5px;
              color: #444;
              margin-top: 2px;
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
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">2. RDO — Registro Diário de Obras</h2>
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenBatchModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            Gerar RDOs em Lote
          </button>

          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shadow-xs transition"
          >
            <Download className="w-4 h-4 text-sky-200" />
            Exportar PDF / Excel
          </button>

          <button
            type="button"
            onClick={() => handlePrintA4Rdo()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold shadow-xs transition"
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
          FILTER INTERVAL & RDO PILL SELECTOR (MATCHING REFERENCE BEHAVIOR)
         ========================================================================= */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-700">Obra:</span>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date interval controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-bold">Período de:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
              />
              <span className="font-bold">até:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Existing RDO Pills */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              RDOs cadastrados no intervalo ({filteredRdos.length}):
            </span>
            <span className="text-[11px] text-slate-400">
              Clique em um dia para abrir e editar
            </span>
          </div>

          {filteredRdos.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
              Nenhum RDO cadastrado neste intervalo de datas. Use o botão <strong>"Gerar RDOs em Lote"</strong> acima ou selecione uma data abaixo para criar individualmente.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
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
          CURRENT DATE SELECTOR BAR & RDO STATUS
         ========================================================================= */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Date Selector with quick previous/next day buttons */}
        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => handleShiftDate(-1)}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition"
            title="Dia Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 px-2 font-bold text-xs text-slate-800">
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className="bg-transparent border-none text-xs font-bold outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => handleShiftDate(1)}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition"
            title="Dia Seguinte"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSetToday}
            className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs ml-1"
          >
            Hoje
          </button>
        </div>

        {/* Status of this day's RDO */}
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

          <span className="text-xs text-slate-500">
            Fotos no dia: <strong className="text-slate-800">{rdoData.photos_count || 0}</strong>
          </span>

          {dayExists && (
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

        {/* Action Buttons for current day */}
        <div className="flex flex-wrap items-center gap-2">
          {dayExists && !isLocked && (
            <>
              <button
                type="button"
                onClick={handleSyncWithPhotos}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold shadow-xs transition"
                title="Sincroniza os serviços a partir das fotos deste dia"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${syncing ? 'animate-spin' : ''}`} />
                Sincronizar com Fotos
              </button>

              <button
                type="button"
                onClick={() => handleSaveRdo('draft')}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold shadow-xs transition"
              >
                <Save className="w-3.5 h-3.5 text-slate-600" />
                Salvar Rascunho
              </button>

              <button
                type="button"
                onClick={handleFinalizeRdo}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition"
              >
                <Check className="w-4 h-4 text-emerald-200" />
                Finalizar RDO
              </button>
            </>
          )}

          {dayExists && isLocked && (
            <button
              type="button"
              onClick={handleReopenRdo}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold shadow-xs transition"
            >
              <Unlock className="w-3.5 h-3.5 text-amber-700" />
              Reabrir para Correções
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          IF NO RDO EXISTS FOR THIS DAY: INFORMATIVE PROMPT TO CREATE
         ========================================================================= */}
      {!dayExists && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <FileText className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              Nenhum Diário de Obras criado para {brDate(currentDate)}
            </h3>
            <p className="text-xs text-slate-500">
              O sistema não cria RDOs fictícios automaticamente para dias vazios. Você pode criar a folha oficial para este dia com um clique:
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl max-w-sm mx-auto text-xs text-slate-700 space-y-1">
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
          </div>

          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={handleCreateRdoForCurrentDate}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              {saving ? 'Criando...' : `Criar RDO para ${brDate(currentDate)} (Folha Nº ${rdoData.folio_number || 1})`}
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          OFFICIAL DER/PR TEMPLATE VIEW (APPROVED LAYOUT)
         ========================================================================= */}
      {dayExists && (
        <div className="bg-slate-100 p-4 sm:p-6 rounded-2xl border border-slate-300 flex justify-center">
          <div className="bg-white w-full max-w-[850px] p-6 sm:p-8 rounded-xl shadow-md border border-slate-300 space-y-3 font-sans text-xs">
            
            {/* Header: Logos & Title */}
            <div className="border border-slate-900 p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="border-2 border-emerald-900 text-emerald-900 font-black text-sm px-2 py-0.5 text-center leading-tight">
                  DER<br />
                  <span className="text-[8px] font-normal tracking-widest">PARANÁ</span>
                </div>
                <div>
                  <div className="font-extrabold text-xs tracking-wider">PARANÁ</div>
                  <div className="text-[9px] text-slate-600">GOVERNO DO ESTADO</div>
                </div>
              </div>

              <div className="text-center">
                <h1 className="text-lg font-black tracking-wide text-slate-900">DIÁRIO DE OBRAS</h1>
              </div>

              <div className="text-right">
                <div className="font-extrabold text-xs text-blue-900">TRIPOLONI</div>
                <div className="text-[9px] text-slate-500 font-medium">Consol • WEILLER</div>
              </div>
            </div>

            {/* Top Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 border border-slate-900 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              {/* Left Column */}
              <div className="divide-y divide-slate-900">
                <div className="p-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">EMPRESA</span>
                  <div className="font-bold text-xs text-slate-900">{contractorCompany}</div>
                </div>

                <div className="p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">TEMPO (CLIMA)</span>
                    {rdoData.pluviometry && (
                      <span className="text-[10px] font-medium text-sky-700 bg-sky-50 px-1.5 rounded">
                        Pluviometria: {rdoData.pluviometry.rainfall_mm} mm
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {WEATHER_CHOICES.map((w) => {
                      const isActive = rdoData.weather_condition === w.key;
                      return (
                        <button
                          key={w.key}
                          type="button"
                          disabled={isLocked}
                          onClick={() => setRdoData({ ...rdoData, weather_condition: w.key })}
                          className={`py-1 text-center font-bold text-[10px] rounded border transition ${
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
                    <div className="flex items-center justify-center gap-2 mt-0.5 font-bold text-xs">
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
                  <div className="font-bold text-xs text-slate-900">{contractNumber}</div>
                </div>

                <div className="p-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">SUPERVISORA</span>
                  <div className="font-bold text-xs text-slate-900">{supervisorCompany}</div>
                </div>

                <div className="p-2">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">DIA DA SEMANA</span>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((wd) => {
                      const isActive = wd.key === dateParts.weekdayKey;
                      return (
                        <div
                          key={wd.key}
                          className={`py-0.5 text-center font-bold text-[10px] rounded border ${
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
            <div className="border border-slate-900 bg-slate-50 p-2 flex items-center justify-between">
              <span className="font-extrabold text-xs text-slate-900 tracking-wide uppercase">
                SERVIÇOS DESENVOLVIDOS NO DIA:
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-semibold">
                  Exibindo {servicesLines.length} linhas ({totalPages} folha/página{totalPages > 1 ? 's' : ''})
                </span>
                {!isLocked && (
                  <>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-300 text-[11px] font-bold text-slate-700"
                    >
                      + 1 Linha
                    </button>
                    <button
                      type="button"
                      onClick={handleAddNextPage}
                      className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[11px] font-bold text-emerald-800"
                    >
                      + Abrir Nova Folha (20 linhas)
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* The 20 Lines Table */}
            <div className="border border-slate-900 divide-y divide-slate-200">
              {servicesLines.map((lineText, idx) => {
                const isNewPageBoundary = idx > 0 && idx % 20 === 0;
                return (
                  <React.Fragment key={idx}>
                    {isNewPageBoundary && (
                      <div className="bg-amber-100/70 p-1.5 text-center font-bold text-[10px] text-amber-900 border-y border-amber-300">
                        --- Quebra de Página: Folha {rdoData.folio_number} • Página {Math.floor(idx / 20) + 1} de {totalPages} ---
                      </div>
                    )}
                    <div className="flex items-center hover:bg-slate-50 transition">
                      <span className="w-8 text-center font-bold text-[11px] text-slate-500 border-r border-slate-200 py-1 select-none">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        disabled={isLocked}
                        value={lineText}
                        onChange={(e) => handleLineTextChange(idx, e.target.value)}
                        placeholder={idx === 0 && !isLocked ? 'Ex: EXECUÇÃO DE BSTC Ø0,60' : ''}
                        className="flex-1 px-3 py-1 text-xs font-semibold text-slate-900 bg-transparent outline-none focus:bg-amber-50/40 uppercase disabled:text-slate-900"
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Workforce & Representative */}
            <div className="grid grid-cols-1 md:grid-cols-2 border border-slate-900 divide-y md:divide-y-0 md:divide-x divide-slate-900 p-2 gap-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[11px] text-slate-700">PROFISSIONAIS EM ATIVIDADE:</span>
                  <input
                    type="number"
                    disabled={isLocked}
                    value={rdoData.work_force_count ?? ''}
                    onChange={(e) => setRdoData({ ...rdoData, work_force_count: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="Ex: 320"
                    className="w-24 px-2 py-0.5 border border-slate-900 font-bold text-center text-xs disabled:text-slate-900"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[11px] text-slate-700">ENGENHEIRO PREPOSTO:</span>
                  <input
                    type="text"
                    disabled={isLocked}
                    value={rdoData.representative_engineer || ''}
                    onChange={(e) => setRdoData({ ...rdoData, representative_engineer: e.target.value })}
                    placeholder="Nome do preposto"
                    className="flex-1 px-2 py-0.5 border border-slate-900 font-bold text-xs disabled:text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-2 pl-0 md:pl-2 pt-2 md:pt-0">
                <div className="flex items-center justify-end gap-3">
                  <span className="font-bold text-[11px] text-slate-700">SUFICIENTE?</span>
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setRdoData({ ...rdoData, work_force_sufficient: 1 })}
                      className={`px-3 py-0.5 text-[10px] font-bold border rounded ${
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
                      className={`px-3 py-0.5 text-[10px] font-bold border rounded ${
                        !rdoData.work_force_sufficient
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <span className="font-bold text-[11px] text-slate-700">PRESENTE?</span>
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setRdoData({ ...rdoData, representative_present: 1 })}
                      className={`px-3 py-0.5 text-[10px] font-bold border rounded ${
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
                      className={`px-3 py-0.5 text-[10px] font-bold border rounded ${
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
            <div className="border border-slate-900 p-2 space-y-1">
              <span className="block font-bold text-[10px] text-slate-800 uppercase">
                OBSERVAÇÕES DA CONTRATADA:
              </span>
              <textarea
                rows={2}
                disabled={isLocked}
                value={rdoData.contractor_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, contractor_notes: e.target.value })}
                placeholder="Ex: Serviços complementares, paralisações por chuva ou motivo do dia sem fotos..."
                className="w-full text-xs font-medium outline-none bg-transparent resize-y disabled:text-slate-900"
              />
            </div>

            {/* Observações da Supervisora */}
            <div className="border border-slate-900 p-2 space-y-1">
              <span className="block font-bold text-[10px] text-slate-800 uppercase">
                OBSERVAÇÕES DA SUPERVISORA:
              </span>
              <textarea
                rows={2}
                disabled={isLocked}
                value={rdoData.supervisor_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, supervisor_notes: e.target.value })}
                placeholder="Ex: DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE"
                className="w-full text-xs font-medium outline-none bg-transparent resize-y disabled:text-slate-900"
              />
            </div>

            {/* Observações do Fiscal do DER/PR */}
            <div className="border border-slate-900 p-2 space-y-1">
              <span className="block font-bold text-[10px] text-slate-800 uppercase">
                OBSERVAÇÕES DO FISCAL DO DER/PR:
              </span>
              <textarea
                rows={2}
                disabled={isLocked}
                value={rdoData.fiscal_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, fiscal_notes: e.target.value })}
                placeholder="Registros e determinações da fiscalização..."
                className="w-full text-xs font-medium outline-none bg-transparent resize-y disabled:text-slate-900"
              />
            </div>

            {/* Signatures Footer */}
            <div className="border border-slate-900 grid grid-cols-3 divide-x divide-slate-900 text-center p-3">
              <div className="space-y-3">
                <span className="block text-[9px] font-bold text-slate-600 uppercase">
                  GERENTE DE CONTRATO DA EXECUTORA
                </span>
                <span className="block font-bold text-xs text-slate-900 border-t border-slate-400 pt-1 mx-2">
                  {contractorManager}
                </span>
              </div>

              <div className="space-y-3">
                <span className="block text-[9px] font-bold text-slate-600 uppercase">
                  ENGENHEIRO DA SUPERVISORA
                </span>
                <span className="block font-bold text-xs text-slate-900 border-t border-slate-400 pt-1 mx-2">
                  {supervisorEngineer}
                </span>
              </div>

              <div className="space-y-3">
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
              Cria automaticamente rascunhos de RDO para cada data com fotos cadastradas nesta obra. RDOs já existentes são preservados integralmente para manter suas edições.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">
                Datas com fotografias encontradas ({photoDatesSummary.length}):
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {photoDatesSummary.map((item) => (
                  <span
                    key={item.date}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                      item.has_rdo
                        ? 'bg-slate-200 text-slate-700 border-slate-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                    title={item.has_rdo ? 'Já possui RDO (será mantido)' : 'Novo RDO será criado'}
                  >
                    {brDate(item.date)} ({item.photo_count} fotos) {item.has_rdo ? '✓' : '+'}
                  </span>
                ))}
              </div>
            </div>

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
              Incluir também dias sem fotos no intervalo entre a primeira e a última data da obra
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
                onClick={handleExecuteBatch}
                disabled={batchLoading}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
              >
                {batchLoading ? 'Gerando Lote...' : 'Criar Rascunhos da Obra'}
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
