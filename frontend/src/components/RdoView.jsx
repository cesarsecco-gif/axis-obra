import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  AlertCircle
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

export default function RdoView({ projects, selectedProjectId, currentUser }) {
  const [viewMode, setViewMode] = useState('SHEET'); // 'SHEET' (Folha Oficial A4) | 'LIST' (Tabela de Folhas)
  const [targetProjectId, setTargetProjectId] = useState(
    selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
  );

  // Date selection (default today or reference September 2026 if sample project)
  const [currentDate, setCurrentDate] = useState(() => {
    // If today is after 2026, use today, otherwise use reference date
    const now = new Date().toISOString().slice(0, 10);
    return now.startsWith('2026') ? '2026-09-01' : now;
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  // RDO Sheet State
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
    representative_engineer: 'DANIELLE NARDINO',
    representative_present: 1,
    contractor_notes: '',
    supervisor_notes: 'DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE',
    fiscal_notes: '',
    services_developed: [],
    photos_count: 0,
    settings: {}
  });

  // Services lines (each page has 20 lines)
  const [servicesLines, setServicesLines] = useState(Array(20).fill(''));

  // Period List State (when in 'LIST' mode)
  const [periodRecords, setPeriodRecords] = useState([]);
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterYear, setFilterYear] = useState('2026');

  // Keep targetProjectId in sync if parent changes
  useEffect(() => {
    if (selectedProjectId !== 'ALL' && selectedProjectId) {
      setTargetProjectId(selectedProjectId);
    } else if (!targetProjectId && projects.length > 0) {
      setTargetProjectId(projects[0].id);
    }
  }, [selectedProjectId, projects, targetProjectId]);

  // Load RDO data whenever date or project changes
  const loadRdoForDate = useCallback(async (date, pid) => {
    if (!pid || !date) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest(`/api/rdo/by-date?projectId=${pid}&date=${date}`);
      
      let parsedServices = [];
      try {
        if (typeof data.services_developed === 'string') {
          parsedServices = JSON.parse(data.services_developed || '[]');
        } else if (Array.isArray(data.services_developed)) {
          parsedServices = data.services_developed;
        }
      } catch {
        parsedServices = [];
      }

      // Ensure at least 20 slots
      const initialSlots = Array(Math.max(20, Math.ceil(parsedServices.length / 20) * 20)).fill('');
      parsedServices.forEach((s, idx) => {
        initialSlots[idx] = s;
      });

      setRdoData({
        ...data,
        services_developed: parsedServices
      });
      setServicesLines(initialSlots);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPeriodRecords = useCallback(async (pid, m, y) => {
    if (!pid) return;
    try {
      let url = `/api/rdo?projectId=${pid}`;
      if (m && m !== 'ALL') url += `&month=${m}`;
      if (y && y !== 'ALL') url += `&year=${y}`;
      const list = await apiRequest(url);
      setPeriodRecords(list || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (targetProjectId && currentDate) {
      loadRdoForDate(currentDate, targetProjectId);
      loadPeriodRecords(targetProjectId, filterMonth, filterYear);
    }
  }, [targetProjectId, currentDate, loadRdoForDate, loadPeriodRecords, filterMonth, filterYear]);

  // Day navigation
  const handleShiftDate = (days) => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    setCurrentDate(dt.toISOString().slice(0, 10));
  };

  const handleSetToday = () => {
    setCurrentDate(new Date().toISOString().slice(0, 10));
  };

  // Sync services with Photos registered on that date
  const handleSyncWithPhotos = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest('/api/rdo/sync-services', {
        method: 'POST',
        body: JSON.stringify({ project_id: targetProjectId, rdo_date: currentDate })
      });
      const incoming = res.services || [];
      if (incoming.length === 0) {
        alert('Nenhuma fotografia com título foi encontrada nesta data para esta obra.');
      } else {
        const newSlots = Array(Math.max(20, Math.ceil(incoming.length / 20) * 20)).fill('');
        incoming.forEach((s, idx) => {
          newSlots[idx] = s;
        });
        setServicesLines(newSlots);
        setSuccessMessage(`${incoming.length} atividade(s) sincronizada(s) a partir do Registro Fotográfico!`);
        setTimeout(() => setSuccessMessage(''), 4000);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Save RDO
  const handleSaveRdo = async () => {
    setSaving(true);
    setError('');
    setSuccessMessage('');
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
        services_developed: cleanServices
      };

      const res = await apiRequest('/api/rdo', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setRdoData((prev) => ({
        ...prev,
        ...res,
        services_developed: cleanServices,
        is_draft: false
      }));

      setSuccessMessage(`Folha Nº ${rdoData.folio_number} do Diário de Obras salva com sucesso!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      loadPeriodRecords(targetProjectId, filterMonth, filterYear);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Line change
  const handleLineTextChange = (index, value) => {
    const updated = [...servicesLines];
    updated[index] = value;
    setServicesLines(updated);
  };

  const handleAddLine = () => {
    setServicesLines((prev) => [...prev, '']);
  };

  const handleAddNextPage = () => {
    // Add another 20 lines for next sheet page
    setServicesLines((prev) => [...prev, ...Array(20).fill('')]);
  };

  const handleClearEmptyLines = () => {
    const activeOnly = servicesLines.map((s) => s.trim()).filter(Boolean);
    const newSlots = Array(Math.max(20, Math.ceil(activeOnly.length / 20) * 20)).fill('');
    activeOnly.forEach((s, idx) => {
      newSlots[idx] = s;
    });
    setServicesLines(newSlots);
  };

  // Date parsing details
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

  // Total pages needed for 20 lines per page
  const totalPages = Math.max(1, Math.ceil(servicesLines.length / 20));

  // Current project metadata
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

  // ============================================================================
  // PRINT A4 SHEET (FAITHFUL DER/PR OFFICIAL LAYOUT)
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

    recordsToPrint.forEach(({ rdo, date, lines }, rdoIdx) => {
      const [y, m, d] = date.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const dayStr = String(d).padStart(2, '0');
      const monthStr = String(m).padStart(2, '0');
      const yearStr = String(y);
      const weekdayIdx = dt.getUTCDay();

      // Chunk lines into blocks of 20
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
                    <div class="box-num">${rdo.folio_number}</div>
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
              SERVIÇOS DESENVOLVIDOS NO DIA:
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
                  <div class="val-box">${rdo.work_force_count || ''}</div>
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
              RASCUNHO - FOLHA ${rdo.folio_number} - PÁGINA ${pIdx + 1} DE ${pCount}
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
          <title>Diário de Obras — Folha Nº ${rdoData.folio_number}</title>
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

            /* Top Bar */
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
              letter-spacing: 0.5px;
            }
            .state-gov strong {
              display: block;
              font-size: 10px;
              letter-spacing: 0.5px;
            }
            .state-gov span {
              display: block;
              font-size: 7.5px;
              color: #333;
            }
            .top-title h1 {
              font-size: 16px;
              font-weight: bold;
              margin: 0;
              letter-spacing: 0.5px;
            }
            .top-logo-right .c-bold {
              display: block;
              font-weight: 900;
              color: #1e3a8a;
              font-size: 11px;
            }
            .top-logo-right .c-sub {
              display: block;
              font-size: 8px;
              color: #475569;
            }

            /* Identification Grid */
            .grid-ident {
              display: grid;
              grid-template-columns: 1fr 1fr;
              border: 1px solid #000;
              margin-bottom: 2px;
            }
            .cell-half {
              padding: 0;
            }
            .cell-half:first-child {
              border-right: 1px solid #000;
            }
            .sub-cell {
              border-bottom: 1px solid #000;
              padding: 2px 5px;
              min-height: 24px;
            }
            .sub-cell:last-child {
              border-bottom: none;
            }
            .label {
              display: block;
              font-size: 8px;
              font-weight: bold;
              color: #111;
              text-transform: uppercase;
            }
            .val-text {
              font-size: 9.5px;
              font-weight: 600;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .row-flex-sub {
              display: grid;
              grid-template-columns: 1fr 1fr;
              border-bottom: 1px solid #000;
            }
            .box-folio {
              border-right: 1px solid #000;
              padding: 2px 5px;
              text-align: center;
            }
            .box-folio .box-num {
              font-size: 12px;
              font-weight: 900;
            }
            .box-date {
              padding: 2px 5px;
              text-align: center;
            }
            .date-digits {
              display: flex;
              justify-content: center;
              gap: 8px;
              font-size: 11px;
              font-weight: bold;
            }
            .weather-row {
              display: flex;
              gap: 2px;
              margin-top: 1px;
            }
            .w-item {
              flex: 1;
              text-align: center;
              font-size: 7.5px;
              font-weight: bold;
              border: 1px solid #888;
              padding: 1.5px 1px;
            }
            .week-days-row {
              display: flex;
              gap: 2px;
              margin-top: 1px;
            }
            .day-box {
              flex: 1;
              text-align: center;
              font-size: 7.5px;
              font-weight: bold;
              border: 1px solid #888;
              padding: 1.5px 1px;
            }
            .bg-active {
              background: #15803d !important;
              color: #ffffff !important;
              border-color: #15803d !important;
            }

            /* Section Banner */
            .section-banner {
              background: #fff;
              border: 1px solid #000;
              font-weight: bold;
              font-size: 9px;
              padding: 2px 6px;
              margin-bottom: 1px;
            }

            /* 20 Services Rows */
            .services-block {
              border: 1px solid #000;
              margin-bottom: 2px;
              flex: 1;
              display: flex;
              flex-direction: column;
            }
            .service-row {
              display: flex;
              border-bottom: 1px solid #e2e8f0;
              min-height: 16px;
              align-items: center;
              font-size: 9px;
              flex: 1;
            }
            .service-row:last-child {
              border-bottom: none;
            }
            .service-num {
              width: 26px;
              text-align: center;
              font-weight: bold;
              border-right: 1px solid #e2e8f0;
              padding: 0 3px;
              font-size: 8.5px;
              color: #333;
            }
            .service-text {
              padding: 0 6px;
              font-weight: 500;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            /* Workforce Grid */
            .workforce-grid {
              display: grid;
              grid-template-columns: 1.6fr 1.4fr;
              border: 1px solid #000;
              margin-bottom: 2px;
              padding: 3px 5px;
            }
            .wf-row {
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .wf-row .label {
              width: 140px;
            }
            .wf-row .val-box {
              border: 1px solid #000;
              padding: 1px 6px;
              min-width: 60px;
              font-weight: bold;
              font-size: 9.5px;
            }
            .check-group {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .check-label {
              font-size: 8px;
              font-weight: bold;
              width: 70px;
            }
            .check-box {
              border: 1px solid #000;
              padding: 1px 8px;
              font-size: 8px;
              font-weight: bold;
              min-width: 38px;
              text-align: center;
            }

            /* Notes Blocks */
            .notes-block {
              border: 1px solid #000;
              margin-bottom: 2px;
              min-height: 28px;
              padding: 2px 6px;
            }
            .notes-header {
              font-size: 8px;
              font-weight: bold;
              margin-bottom: 1px;
            }
            .notes-content {
              font-size: 8.5px;
              color: #222;
              white-space: pre-wrap;
              min-height: 14px;
            }

            /* Signatures Grid */
            .signatures-grid {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              border: 1px solid #000;
              text-align: center;
              padding: 3px;
              margin-top: 2px;
            }
            .sig-col {
              border-right: 1px solid #ccc;
              padding: 2px 4px;
            }
            .sig-col:last-child {
              border-right: none;
            }
            .sig-title {
              display: block;
              font-size: 7.5px;
              font-weight: bold;
              margin-bottom: 12px;
              text-transform: uppercase;
            }
            .sig-name {
              display: block;
              font-size: 8.5px;
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
              <span style="margin-left: 12px; font-size: 11px; opacity: 0.8;">Folha Nº ${rdoData.folio_number} — ${formatDateBR(currentDate)}</span>
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

  // Print all period records for the month
  const handlePrintAllMonth = async () => {
    if (periodRecords.length === 0) {
      alert('Nenhum RDO encontrado no período filtrado para impressão em lote.');
      return;
    }

    try {
      setLoading(true);
      // Fetch full details of each RDO in period
      const fullList = await Promise.all(
        periodRecords.map(async (rec) => {
          const detail = await apiRequest(`/api/rdo/by-date?projectId=${rec.project_id}&date=${rec.rdo_date}`);
          let lines = [];
          try {
            lines = typeof detail.services_developed === 'string'
              ? JSON.parse(detail.services_developed || '[]')
              : detail.services_developed || [];
          } catch {
            lines = [];
          }
          return {
            rdo: detail,
            date: rec.rdo_date,
            lines
          };
        })
      );
      handlePrintA4Rdo(fullList);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">2. Diário de Obras (RDO)</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Modelo DER/PR
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Preenchimento diário, integração automática com Pluviometria e Registro Fotográfico, controle de efetivo e exportação A4 oficial.
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher and Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('SHEET')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'SHEET'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              Folha do Diário (A4)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'LIST'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5 text-sky-600" />
              Todas as Folhas ({periodRecords.length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleSyncWithPhotos}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold shadow-xs transition"
            title="Puxa os títulos das fotos do dia diretamente para as linhas de serviços"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar com Fotos
          </button>

          <button
            type="button"
            onClick={() => handlePrintA4Rdo()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold shadow-xs transition"
          >
            <Printer className="w-4 h-4" />
            Imprimir Folha A4
          </button>

          <button
            type="button"
            onClick={handleSaveRdo}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-xs transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar RDO'}
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

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {error}
        </div>
      )}

      {/* Date Navigation & Project Selector Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-2">
          {rdoData.is_draft ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              Rascunho Automático (Não Salvo)
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Folha Nº {rdoData.folio_number} (Salvo)
            </span>
          )}
          <span className="text-xs text-slate-500">
            Fotos vinculadas hoje: <strong className="text-slate-800">{rdoData.photos_count || 0}</strong>
          </span>
        </div>
      </div>

      {/* =========================================================================
          VIEW MODE 1: SHEET (A4 OFFICIAL FORM PREVIEW & EDIT)
         ========================================================================= */}
      {viewMode === 'SHEET' && (
        <div className="bg-slate-100 p-4 sm:p-6 rounded-2xl border border-slate-300 flex justify-center">
          {/* A4 Container Simulation */}
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
                    <span className="text-[10px] font-medium text-sky-700 bg-sky-50 px-1.5 rounded">
                      Sincronizado da Pluviometria
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {WEATHER_CHOICES.map((w) => {
                      const isActive = rdoData.weather_condition === w.key;
                      return (
                        <button
                          key={w.key}
                          type="button"
                          onClick={() => setRdoData({ ...rdoData, weather_condition: w.key })}
                          className={`py-1 text-center font-bold text-[10px] rounded border transition ${
                            isActive
                              ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
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
                    value={rdoData.work_code || ''}
                    onChange={(e) => setRdoData({ ...rdoData, work_code: e.target.value })}
                    placeholder="Código do lote / trecho"
                    className="w-full bg-transparent font-semibold text-xs outline-none"
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
                      value={rdoData.folio_number || 1}
                      onChange={(e) => setRdoData({ ...rdoData, folio_number: Number(e.target.value) })}
                      className="w-full text-center font-black text-sm outline-none bg-transparent"
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
                        value={lineText}
                        onChange={(e) => handleLineTextChange(idx, e.target.value)}
                        placeholder={idx === 0 ? 'Ex: EXECUÇÃO DE BSTC Ø0,60' : ''}
                        className="flex-1 px-3 py-1 text-xs font-semibold text-slate-900 bg-transparent outline-none focus:bg-amber-50/40 uppercase"
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
                    value={rdoData.work_force_count || ''}
                    onChange={(e) => setRdoData({ ...rdoData, work_force_count: Number(e.target.value) })}
                    placeholder="Ex: 320"
                    className="w-24 px-2 py-0.5 border border-slate-900 font-bold text-center text-xs"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[11px] text-slate-700">ENGENHEIRO PREPOSTO:</span>
                  <input
                    type="text"
                    value={rdoData.representative_engineer || ''}
                    onChange={(e) => setRdoData({ ...rdoData, representative_engineer: e.target.value })}
                    placeholder="Nome do preposto"
                    className="flex-1 px-2 py-0.5 border border-slate-900 font-bold text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2 pl-0 md:pl-2 pt-2 md:pt-0">
                <div className="flex items-center justify-end gap-3">
                  <span className="font-bold text-[11px] text-slate-700">SUFICIENTE?</span>
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
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
                value={rdoData.contractor_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, contractor_notes: e.target.value })}
                placeholder="Ex: Trecho com paralisação parcial pelas chuvas do dia anterior..."
                className="w-full text-xs font-medium outline-none bg-transparent resize-y"
              />
            </div>

            {/* Observações da Supervisora */}
            <div className="border border-slate-900 p-2 space-y-1">
              <span className="block font-bold text-[10px] text-slate-800 uppercase">
                OBSERVAÇÕES DA SUPERVISORA:
              </span>
              <textarea
                rows={2}
                value={rdoData.supervisor_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, supervisor_notes: e.target.value })}
                placeholder="Ex: DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE"
                className="w-full text-xs font-medium outline-none bg-transparent resize-y"
              />
            </div>

            {/* Observações do Fiscal do DER/PR */}
            <div className="border border-slate-900 p-2 space-y-1">
              <span className="block font-bold text-[10px] text-slate-800 uppercase">
                OBSERVAÇÕES DO FISCAL DO DER/PR:
              </span>
              <textarea
                rows={2}
                value={rdoData.fiscal_notes || ''}
                onChange={(e) => setRdoData({ ...rdoData, fiscal_notes: e.target.value })}
                placeholder="Registros e determinações da fiscalização..."
                className="w-full text-xs font-medium outline-none bg-transparent resize-y"
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
              RASCUNHO - FOLHA {rdoData.folio_number} - PÁGINA 1 DE {totalPages}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 2: LIST (ALL FOLIOS OF THE PERIOD / MONTH)
         ========================================================================= */}
      {viewMode === 'LIST' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Ano</label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                >
                  <option value="ALL">Todos os Anos</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Mês</label>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                >
                  <option value="ALL">Todos os Meses</option>
                  <option value="09">09 — Setembro</option>
                  <option value="10">10 — Outubro</option>
                  <option value="11">11 — Novembro</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePrintAllMonth}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold shadow-xs transition"
            >
              <Printer className="w-4 h-4" />
              Imprimir Todas as Folhas do Período ({periodRecords.length})
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-center">Folha #</th>
                  <th className="py-2.5 px-3 text-left">Data</th>
                  <th className="py-2.5 px-3 text-center">Clima</th>
                  <th className="py-2.5 px-3 text-center">Efetivo</th>
                  <th className="py-2.5 px-3 text-left">Serviços Principais Registrados</th>
                  <th className="py-2.5 px-3 text-center">Preposto</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {periodRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhuma folha de diário de obras encontrada para o filtro selecionado.
                    </td>
                  </tr>
                ) : (
                  periodRecords.map((item) => {
                    let services = [];
                    try {
                      services = typeof item.services_developed === 'string'
                        ? JSON.parse(item.services_developed || '[]')
                        : item.services_developed || [];
                    } catch {
                      services = [];
                    }

                    const weatherBadge =
                      item.weather_condition === 'IMPRATICAVEL'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : item.weather_condition === 'CHUVOSO'
                        ? 'bg-sky-100 text-sky-800 border-sky-300'
                        : item.weather_condition === 'INSTAVEL'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 text-center font-black text-slate-900">
                          {item.folio_number}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {formatDateBR(item.rdo_date)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${weatherBadge}`}>
                            {item.weather_condition}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">
                          {item.work_force_count || 0} trab.
                        </td>
                        <td className="py-2.5 px-3 max-w-sm">
                          {services.length > 0 ? (
                            <div className="truncate text-slate-700">
                              <span className="font-semibold text-slate-900 mr-1">
                                ({services.length} itens):
                              </span>
                              {services.slice(0, 2).join(' • ')}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Sem serviços cadastrados</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                          {item.representative_engineer || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentDate(item.rdo_date);
                              setViewMode('SHEET');
                            }}
                            className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-2xs transition"
                          >
                            Abrir Folha
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
