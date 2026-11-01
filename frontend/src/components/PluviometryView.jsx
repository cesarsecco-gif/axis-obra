import React, { useState, useEffect, useMemo } from 'react';
import {
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  Droplets,
  Clock,
  Calendar,
  Plus,
  Edit3,
  Trash2,
  Building2,
  Thermometer,
  X,
  Upload,
  FileSpreadsheet,
  Printer,
  ArrowDown,
  ArrowUp,
  Sparkles,
  BarChart3,
  Table2
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';

const WEATHER_OPTIONS = [
  { value: 'SOL', label: 'Sol / Tempo Bom', icon: Sun, badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'NUBLADO', label: 'Nublado', icon: Cloud, badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  { value: 'CHUVA_FRACA', label: 'Chuva Fraca', icon: CloudRain, badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  { value: 'CHUVA_FORTE', label: 'Chuva Forte', icon: CloudRain, badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'IMPRATICAVEL', label: 'Impraticável', icon: CloudLightning, badge: 'bg-rose-100 text-rose-800 border-rose-300' },
  { value: 'SEM_EXPEDIENTE', label: 'Sem Expediente', icon: Clock, badge: 'bg-slate-50 text-slate-400 border-slate-200' }
];

const IMPACT_CONFIG = {
  SEM_IMPACTO: { label: 'Sem Impacto', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  IMPACTO_PARCIAL: { label: 'Impacto Parcial', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  PARALISACAO_TOTAL: { label: 'Impraticável / Paralisação', badge: 'bg-rose-100 text-rose-800 border-rose-300' }
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

const WEEKDAYS_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

function formatNumBR(num, decimals = 1) {
  return (Number(num) || 0).toFixed(decimals).replace('.', ',');
}

function getRainClassLabel(mm) {
  const val = Number(mm) || 0;
  if (val <= 0) return 'Sem chuva';
  if (val < 10) return 'Chuva fraca';
  if (val < 30) return 'Chuva moderada';
  return 'Chuva forte';
}

function getWeekdayShort(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  const dt = new Date(y, m - 1, d);
  return WEEKDAYS_PT[dt.getDay()] || '—';
}

// Smart INMET CSV Parser (supports both hourly & daily INMET CSVs with `;` or `,`)
function parseInmetCsvText(rawText) {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let stationName = 'INMET';
  let headerIndex = -1;
  let delimiter = ';';

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i];
    if (/^(estac[aã]o|nome)\s*[:;]/i.test(line)) {
      const parts = line.split(/[:;]/);
      if (parts[1]) stationName = `INMET - ${parts[1].trim()}`;
    }
    const lower = line.toLowerCase();
    if (
      lower.includes('data') &&
      (lower.includes('precipit') || lower.includes('chuva') || lower.includes('mm'))
    ) {
      headerIndex = i;
      delimiter = line.includes(';') ? ';' : ',';
      break;
    }
  }

  if (headerIndex === -1) {
    // Fallback: assume first line is header
    headerIndex = 0;
    delimiter = lines[0]?.includes(';') ? ';' : ',';
  }

  const headers = lines[headerIndex].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const dateCol = headers.findIndex((h) => h.includes('data'));
  const hourCol = headers.findIndex((h) => h.includes('hora'));
  const rainCol = headers.findIndex(
    (h) => h.includes('precipit') || h.includes('chuva') || h === 'mm'
  );
  const morningCol = headers.findIndex((h) => h.includes('manh'));
  const afternoonCol = headers.findIndex((h) => h.includes('tarde'));
  const nightCol = headers.findIndex((h) => h.includes('noite'));
  const tempMaxCol = headers.findIndex((h) => h.includes('max') && h.includes('temp'));
  const tempMinCol = headers.findIndex((h) => h.includes('min') && h.includes('temp'));
  const prodCol = headers.findIndex((h) => h.includes('prod'));

  if (dateCol === -1 || rainCol === -1) {
    throw new Error(
      'Não foi possível identificar as colunas de "Data" e "Precipitação/Chuva (mm)" no arquivo CSV.'
    );
  }

  const parseNum = (str) => {
    if (str === undefined || str === null) return 0;
    const cleaned = String(str).replace(/^"|"$/g, '').trim().replace(',', '.');
    if (!cleaned || cleaned === '-9999' || cleaned.toLowerCase() === 'null') return 0;
    const val = parseFloat(cleaned);
    return Number.isFinite(val) && val >= 0 ? val : 0;
  };

  const normalizeDate = (rawDate) => {
    const clean = String(rawDate || '').replace(/^"|"$/g, '').trim();
    // YYYY-MM-DD or YYYY/MM/DD
    if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(clean)) {
      return clean.replace(/\//g, '-');
    }
    // DD/MM/YYYY or DD-MM-YYYY
    const m = clean.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (m) {
      return `${m[3]}-${m[2]}-${m[1]}`;
    }
    return null;
  };

  const byDate = new Map();

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    if (cols.length <= Math.max(dateCol, rainCol)) continue;

    const isoDate = normalizeDate(cols[dateCol]);
    if (!isoDate) continue;

    const rainVal = parseNum(cols[rainCol]);
    const tMax = tempMaxCol !== -1 ? parseNum(cols[tempMaxCol]) : null;
    const tMin = tempMinCol !== -1 ? parseNum(cols[tempMinCol]) : null;
    const prodVal = prodCol !== -1 ? parseNum(cols[prodCol]) : 0;

    if (!byDate.has(isoDate)) {
      byDate.set(isoDate, {
        record_date: isoDate,
        rainfall_mm: 0,
        morning_mm: 0,
        afternoon_mm: 0,
        night_mm: 0,
        temperature_min: tMin || null,
        temperature_max: tMax || null,
        production_tons: prodVal,
        station_name: stationName
      });
    }

    const entry = byDate.get(isoDate);
    entry.rainfall_mm = Number((entry.rainfall_mm + rainVal).toFixed(1));

    if (morningCol !== -1 || afternoonCol !== -1 || nightCol !== -1) {
      if (morningCol !== -1) entry.morning_mm = Number((entry.morning_mm + parseNum(cols[morningCol])).toFixed(1));
      if (afternoonCol !== -1) entry.afternoon_mm = Number((entry.afternoon_mm + parseNum(cols[afternoonCol])).toFixed(1));
      if (nightCol !== -1) entry.night_mm = Number((entry.night_mm + parseNum(cols[nightCol])).toFixed(1));
    } else if (hourCol !== -1 && cols[hourCol]) {
      // Parse hour e.g. "1200 UTC", "14:00", "0800"
      const hDigits = String(cols[hourCol]).replace(/\D/g, '');
      const hourNum = hDigits.length >= 2 ? parseInt(hDigits.slice(0, 2), 10) : 12;
      if (hourNum >= 6 && hourNum < 12) {
        entry.morning_mm = Number((entry.morning_mm + rainVal).toFixed(1));
      } else if (hourNum >= 12 && hourNum < 18) {
        entry.afternoon_mm = Number((entry.afternoon_mm + rainVal).toFixed(1));
      } else {
        entry.night_mm = Number((entry.night_mm + rainVal).toFixed(1));
      }
    } else {
      // Daily CSV (e.g. 12 UTC accumulator): allocate to afternoon_mm as in the INMET table 3 convention
      entry.afternoon_mm = Number((entry.afternoon_mm + rainVal).toFixed(1));
    }

    if (tMin && (!entry.temperature_min || tMin < entry.temperature_min)) {
      entry.temperature_min = tMin;
    }
    if (tMax && (!entry.temperature_max || tMax > entry.temperature_max)) {
      entry.temperature_max = tMax;
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.record_date.localeCompare(b.record_date));
}

export default function PluviometryView({ projects, selectedProjectId, onRefreshDashboard }) {
  const [records, setRecords] = useState([]);
  const [reportSettings, setReportSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters & Sorting
  const [yearFilter, setYearFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState('ASC'); // 'ASC' (Cronológico 01 -> 31) | 'DESC'

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [csvStationName, setCsvStationName] = useState('INMET - Estação Automática');
  const [csvTargetProject, setCsvTargetProject] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const [error, setError] = useState('');

  const initialForm = {
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
    record_date: new Date().toISOString().slice(0, 10),
    morning_weather: 'SOL',
    afternoon_weather: 'NUBLADO',
    night_weather: 'SEM_EXPEDIENTE',
    rainfall_mm: 0,
    morning_mm: 0,
    afternoon_mm: 0,
    night_mm: 0,
    work_impact: 'SEM_IMPACTO',
    hours_lost: 0,
    production_tons: 0,
    station_name: 'INMET / Pluviômetro de Obra',
    temperature_min: 18,
    temperature_max: 28,
    notes: ''
  };

  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    const defaultProj = selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '');
    if (!editingItem) {
      setForm((prev) => ({ ...prev, project_id: defaultProj }));
    }
    setCsvTargetProject(defaultProj);
  }, [selectedProjectId, projects, editingItem]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'ALL') params.set('projectId', selectedProjectId);
      const [data, repSet] = await Promise.all([
        apiRequest(`/api/pluviometry?${params.toString()}`),
        apiRequest('/api/report-settings').catch(() => null)
      ]);
      setRecords(data);
      if (repSet) setReportSettings(repSet);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [selectedProjectId]);

  const openCreateModal = () => {
    setEditingItem(null);
    setError('');
    setForm({
      ...initialForm,
      project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
    });
    setShowModal(true);
  };

  const openEditModal = (rec) => {
    setEditingItem(rec);
    setError('');
    setForm({
      project_id: rec.project_id,
      record_date: rec.record_date,
      morning_weather: rec.morning_weather || 'SOL',
      afternoon_weather: rec.afternoon_weather || 'SOL',
      night_weather: rec.night_weather || 'SEM_EXPEDIENTE',
      rainfall_mm: rec.rainfall_mm ?? 0,
      morning_mm: rec.morning_mm ?? 0,
      afternoon_mm: rec.afternoon_mm ?? (rec.rainfall_mm || 0),
      night_mm: rec.night_mm ?? 0,
      work_impact: rec.work_impact || 'SEM_IMPACTO',
      hours_lost: rec.hours_lost ?? 0,
      production_tons: rec.production_tons ?? 0,
      station_name: rec.station_name || 'INMET / Pluviômetro de Obra',
      temperature_min: rec.temperature_min ?? '',
      temperature_max: rec.temperature_max ?? '',
      notes: rec.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingItem) {
        await apiRequest(`/api/pluviometry/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });
      } else {
        await apiRequest('/api/pluviometry', {
          method: 'POST',
          body: JSON.stringify(form)
        });
      }
      setShowModal(false);
      setEditingItem(null);
      await loadRecords();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este registro pluviométrico?')) return;
    try {
      await apiRequest(`/api/pluviometry/${id}`, { method: 'DELETE' });
      await loadRecords();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  };

  // ============================================================================
  // INMET CSV IMPORT HANDLERS
  // ============================================================================
  const handleCsvFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseInmetCsvText(String(reader.result || ''));
        if (parsed.length === 0) {
          setError('Nenhuma linha de data válida foi encontrada no arquivo CSV.');
          return;
        }
        setCsvPreviewRows(parsed);
        if (parsed[0]?.station_name) {
          setCsvStationName(parsed[0].station_name);
        }
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file, 'ISO-8859-1');
    e.target.value = '';
  };

  // Generate sample INMET October/2026 dataset matching the user's screenshot!
  const handleLoadSampleInmetMonth = () => {
    setError('');
    const sampleOctMm = [
      ['2026-10-01', 11.2, 0.4, 10.8, 0],
      ['2026-10-02', 2.4, 0, 2.4, 0],
      ['2026-10-03', 2.5, 0, 2.5, 0],
      ['2026-10-04', 32.7, 0, 32.7, 0],
      ['2026-10-05', 8.7, 0, 8.7, 0],
      ['2026-10-06', 4.2, 0, 4.2, 0],
      ['2026-10-07', 1.4, 0, 1.4, 0],
      ['2026-10-08', 31.2, 0, 31.2, 0],
      ['2026-10-09', 37.7, 0, 37.7, 0],
      ['2026-10-10', 36.0, 0, 36.0, 0],
      ['2026-10-11', 13.0, 0, 13.0, 0],
      ['2026-10-12', 14.4, 0, 14.4, 0],
      ['2026-10-13', 52.0, 0, 52.0, 0],
      ['2026-10-14', 50.4, 0, 50.4, 0],
      ['2026-10-15', 18.0, 0, 18.0, 0],
      ['2026-10-16', 0.4, 0, 0.4, 0],
      ['2026-10-17', 0.0, 0, 0, 0],
      ['2026-10-18', 0.0, 0, 0, 0],
      ['2026-10-19', 0.0, 0, 0, 0],
      ['2026-10-20', 0.0, 0, 0, 0],
      ['2026-10-21', 0.0, 0, 0, 0],
      ['2026-10-22', 12.4, 0, 12.4, 0],
      ['2026-10-23', 11.0, 0, 11.0, 0],
      ['2026-10-24', 2.0, 0, 2.0, 0],
      ['2026-10-25', 7.0, 0, 7.0, 0],
      ['2026-10-26', 2.0, 0, 2.0, 0],
      ['2026-10-27', 0.0, 0, 0, 0],
      ['2026-10-28', 2.0, 0, 2.0, 0],
      ['2026-10-29', 2.0, 0, 2.0, 0],
      ['2026-10-30', 0.0, 0, 0, 1],
      ['2026-10-31', 0.0, 0, 0, 0]
    ];

    const rows = sampleOctMm.map(([dt, tot, mMm, aMm, prod]) => ({
      record_date: dt,
      rainfall_mm: tot,
      morning_mm: mMm,
      afternoon_mm: aMm,
      night_mm: 0,
      temperature_min: 18,
      temperature_max: tot >= 30 ? 22 : 29,
      production_tons: prod,
      station_name: 'INMET - Estação Automática (12 UTC)'
    }));

    setCsvStationName('INMET - Estação Automática (12 UTC)');
    setCsvPreviewRows(rows);
  };

  const handleConfirmCsvImport = async () => {
    if (!csvTargetProject) {
      setError('Selecione a obra de destino.');
      return;
    }
    setImportingCsv(true);
    setError('');
    try {
      await apiRequest('/api/pluviometry/batch', {
        method: 'POST',
        body: JSON.stringify({
          project_id: csvTargetProject,
          station_name: csvStationName,
          overwrite_existing: true,
          records: csvPreviewRows
        })
      });
      setShowCsvModal(false);
      setCsvPreviewRows([]);
      await loadRecords();
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setImportingCsv(false);
    }
  };

  // ============================================================================
  // FILTERING & ANALYTICAL CALCULATIONS (EXACT MATCH TO USER'S SCREENSHOTS)
  // ============================================================================
  const availableYears = useMemo(() => {
    const yearsSet = new Set([String(new Date().getFullYear())]);
    records.forEach((r) => {
      const y = String(r.record_date || '').slice(0, 4);
      if (y && y.length === 4) yearsSet.add(y);
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const list = records.filter((r) => {
      const dStr = String(r.record_date || '').slice(0, 10);
      const [y, m] = dStr.split('-');
      if (yearFilter !== 'ALL' && y !== yearFilter) return false;
      if (monthFilter !== 'ALL' && m !== monthFilter) return false;
      if (dateFrom && dStr < dateFrom) return false;
      if (dateTo && dStr > dateTo) return false;
      return true;
    });

    return [...list].sort((a, b) =>
      sortOrder === 'ASC'
        ? String(a.record_date).localeCompare(String(b.record_date))
        : String(b.record_date).localeCompare(String(a.record_date))
    );
  }, [records, yearFilter, monthFilter, dateFrom, dateTo, sortOrder]);

  // Chronological list (always ASC) for daily + cumulative chart and weekly breakdown
  const chronologicalRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) =>
      String(a.record_date).localeCompare(String(b.record_date))
    );
  }, [filteredRecords]);

  const analytics = useMemo(() => {
    const totalDays = chronologicalRecords.length;
    let cumulative = 0;

    const chartPoints = chronologicalRecords.map((r) => {
      const daily = Number(r.rainfall_mm) || 0;
      cumulative = Number((cumulative + daily).toFixed(1));
      return {
        ...r,
        dailyMm: daily,
        cumulativeMm: cumulative,
        shortDate: formatDateBR(r.record_date).slice(0, 5)
      };
    });

    const totalMm = cumulative;

    // 1. DISTRIBUIÇÃO DOS DIAS POR CLASSE DE CHUVA
    const classes = [
      { key: 'NONE', label: 'Sem chuva', range: '0 mm', days: 0, mm: 0 },
      { key: 'LIGHT', label: 'Chuva fraca', range: '> 0 e < 10 mm', days: 0, mm: 0 },
      { key: 'MOD', label: 'Chuva moderada', range: '10 a < 30 mm', days: 0, mm: 0 },
      { key: 'HEAVY', label: 'Chuva forte', range: '≥ 30 mm', days: 0, mm: 0 }
    ];

    chronologicalRecords.forEach((r) => {
      const val = Number(r.rainfall_mm) || 0;
      if (val <= 0) {
        classes[0].days += 1;
      } else if (val < 10) {
        classes[1].days += 1;
        classes[1].mm = Number((classes[1].mm + val).toFixed(1));
      } else if (val < 30) {
        classes[2].days += 1;
        classes[2].mm = Number((classes[2].mm + val).toFixed(1));
      } else {
        classes[3].days += 1;
        classes[3].mm = Number((classes[3].mm + val).toFixed(1));
      }
    });

    const classDistribution = classes.map((c) => ({
      ...c,
      pctDays: totalDays > 0 ? Math.round((c.days / totalDays) * 100) : 0,
      pctMm: totalMm > 0 ? Math.round((c.mm / totalMm) * 100) : 0
    }));

    // 2. TOP 5 DIAS MAIS CHUVOSOS
    const top5RainyDays = [...chronologicalRecords]
      .filter((r) => Number(r.rainfall_mm) > 0)
      .sort((a, b) => Number(b.rainfall_mm) - Number(a.rainfall_mm))
      .slice(0, 5)
      .map((r, idx) => ({
        rank: idx + 1,
        dateFormatted: formatDateBR(r.record_date),
        weekday: getWeekdayShort(r.record_date),
        mm: Number(r.rainfall_mm) || 0,
        rainClass: getRainClassLabel(r.rainfall_mm),
        production: Number(r.production_tons) || 0,
        hoursLost: Number(r.hours_lost) || 0
      }));

    // 3. PRECIPITAÇÃO POR SEMANA DO MÊS (Semana 1 a Semana 6)
    const weeks = [1, 2, 3, 4, 5, 6].map((wNum) => ({
      label: `Semana ${wNum}`,
      mm: 0,
      rainyDays: 0,
      impracticableDays: 0,
      production: 0,
      firstDate: null,
      lastDate: null
    }));

    chronologicalRecords.forEach((r) => {
      const dStr = String(r.record_date || '').slice(0, 10);
      const [y, m, d] = dStr.split('-').map(Number);
      if (!y || !m || !d) return;
      const firstOfMonth = new Date(y, m - 1, 1);
      const offset = firstOfMonth.getDay(); // 0 (Dom) .. 6 (Sáb)
      const weekIndex = Math.min(5, Math.floor((d + offset - 1) / 7));
      const wk = weeks[weekIndex];

      const val = Number(r.rainfall_mm) || 0;
      wk.mm = Number((wk.mm + val).toFixed(1));
      if (val > 0) wk.rainyDays += 1;
      if (
        val >= 10 ||
        r.work_impact === 'PARALISACAO_TOTAL' ||
        r.work_impact === 'IMPACTO_PARCIAL' ||
        r.afternoon_weather === 'IMPRATICAVEL'
      ) {
        wk.impracticableDays += 1;
      }
      wk.production = Number((wk.production + (Number(r.production_tons) || 0)).toFixed(1));
      const shortD = formatDateBR(dStr).slice(0, 5);
      if (!wk.firstDate) wk.firstDate = shortD;
      wk.lastDate = shortD;
    });

    const maxWeekMm = Math.max(1, ...weeks.map((w) => w.mm));

    // 4. PRECIPITAÇÃO POR TURNO (Manhã, Tarde, Noite)
    let morningTotal = 0;
    let afternoonTotal = 0;
    let nightTotal = 0;

    chronologicalRecords.forEach((r) => {
      const mVal = Number(r.morning_mm) || 0;
      const nVal = Number(r.night_mm) || 0;
      const aVal =
        Number(r.afternoon_mm) > 0
          ? Number(r.afternoon_mm)
          : mVal === 0 && nVal === 0
          ? Number(r.rainfall_mm) || 0
          : 0;
      morningTotal = Number((morningTotal + mVal).toFixed(1));
      afternoonTotal = Number((afternoonTotal + aVal).toFixed(1));
      nightTotal = Number((nightTotal + nVal).toFixed(1));
    });

    const shiftSum = Math.max(0.0001, morningTotal + afternoonTotal + nightTotal);
    const shifts = [
      {
        label: 'Manhã',
        mm: morningTotal,
        pct: morningTotal + afternoonTotal + nightTotal > 0 ? Math.round((morningTotal / shiftSum) * 100) : 0
      },
      {
        label: 'Tarde',
        mm: afternoonTotal,
        pct: morningTotal + afternoonTotal + nightTotal > 0 ? Math.round((afternoonTotal / shiftSum) * 100) : 0
      },
      {
        label: 'Noite',
        mm: nightTotal,
        pct: morningTotal + afternoonTotal + nightTotal > 0 ? Math.round((nightTotal / shiftSum) * 100) : 0
      }
    ];

    const totalRainyDays = classes[1].days + classes[2].days + classes[3].days;
    const totalImpracticableDays = weeks.reduce((acc, w) => acc + w.impracticableDays, 0);
    const totalProduction = weeks.reduce((acc, w) => acc + w.production, 0);
    const totalHoursLost = chronologicalRecords.reduce((acc, r) => acc + (Number(r.hours_lost) || 0), 0);

    return {
      totalDays,
      totalMm,
      totalRainyDays,
      totalImpracticableDays,
      totalProduction,
      totalHoursLost,
      chartPoints,
      classDistribution,
      top5RainyDays,
      weeks,
      maxWeekMm,
      shifts
    };
  }, [chronologicalRecords]);

  // ============================================================================
  // SVG DUAL-AXIS CHART GENERATOR ("Precipitação diária e acumulada (mm)")
  // ============================================================================
  const renderDualAxisSvgChart = (width = 960, height = 310) => {
    const pts = analytics.chartPoints;
    if (pts.length === 0) return null;

    const padLeft = 52;
    const padRight = 56;
    const padTop = 48;
    const padBottom = 42;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const maxDailyRaw = Math.max(10, ...pts.map((p) => p.dailyMm));
    const maxDailyAxis = Math.ceil(maxDailyRaw / 10) * 10 + 10; // e.g. 60.0

    const maxCumRaw = Math.max(50, analytics.totalMm);
    const maxCumAxis = Math.ceil(maxCumRaw / 50) * 50; // e.g. 400.0

    const n = pts.length;
    const stepX = plotW / Math.max(1, n);
    const barWidth = Math.max(8, Math.min(26, stepX * 0.62));

    const polylinePoints = pts
      .map((p, idx) => {
        const cx = padLeft + idx * stepX + stepX / 2;
        const cy = padTop + plotH - (p.cumulativeMm / maxCumAxis) * plotH;
        return `${cx.toFixed(1)},${cy.toFixed(1)}`;
      })
      .join(' ');

    const leftTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => ({
      val: (maxDailyAxis * t).toFixed(1).replace('.', ','),
      y: padTop + plotH - t * plotH
    }));

    const rightTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      val: (maxCumAxis * t).toFixed(1).replace('.', ','),
      y: padTop + plotH - t * plotH
    }));

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width={width} height={height} fill="#ffffff" rx="8" />

        {/* Chart Title & Legend */}
        <text
          x={width / 2}
          y={20}
          textAnchor="middle"
          fontSize="14"
          fontWeight="bold"
          fill="#334155"
        >
          Precipitação diária e acumulada (mm)
        </text>

        {/* Legend */}
        <g transform={`translate(${width / 2 - 125}, 29)`}>
          <rect x="0" y="2" width="22" height="8" fill="#2563eb" rx="1" />
          <text x="27" y="10" fontSize="11" fill="#475569">
            Chuva diária (mm)
          </text>
          <line x1="135" y1="6" x2="160" y2="6" stroke="#dc2626" strokeWidth="2.5" />
          <text x="165" y="10" fontSize="11" fill="#475569">
            Acumulado (mm)
          </text>
        </g>

        {/* Horizontal Gridlines & Left Y Axis (mm/dia) */}
        {leftTicks.map((tk, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              y1={tk.y}
              x2={width - padRight}
              y2={tk.y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text
              x={padLeft - 6}
              y={tk.y + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="#64748b"
            >
              {tk.val}
            </text>
          </g>
        ))}

        {/* Right Y Axis Labels (mm acumulado) */}
        {rightTicks.map((tk, i) => (
          <text
            key={i}
            x={width - padRight + 6}
            y={tk.y + 3.5}
            textAnchor="start"
            fontSize="10"
            fill="#64748b"
          >
            {tk.val}
          </text>
        ))}

        {/* Axis Titles */}
        <text
          x={14}
          y={padTop + plotH / 2}
          transform={`rotate(-90, 14, ${padTop + plotH / 2})`}
          textAnchor="middle"
          fontSize="11"
          fill="#475569"
        >
          mm/dia
        </text>
        <text
          x={width - 10}
          y={padTop + plotH / 2}
          transform={`rotate(-90, ${width - 10}, ${padTop + plotH / 2})`}
          textAnchor="middle"
          fontSize="11"
          fill="#475569"
        >
          mm acumulado
        </text>

        {/* Daily Bars (Blue) */}
        {pts.map((p, idx) => {
          const cx = padLeft + idx * stepX + stepX / 2;
          const barH = (p.dailyMm / maxDailyAxis) * plotH;
          const by = padTop + plotH - barH;
          const showXLabel = n <= 16 || idx % 2 === 0 || idx === n - 1;

          return (
            <g key={p.id || idx}>
              {p.dailyMm > 0 && (
                <>
                  <rect
                    x={cx - barWidth / 2}
                    y={by}
                    width={barWidth}
                    height={Math.max(2, barH)}
                    fill="#2563eb"
                    rx="1"
                  />
                  <text
                    x={cx}
                    y={Math.max(padTop + 8, by - 5)}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="600"
                    fill="#1e293b"
                  >
                    {formatNumBR(p.dailyMm)}
                  </text>
                </>
              )}
              {showXLabel && (
                <text
                  x={cx}
                  y={padTop + plotH + 16}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#475569"
                >
                  {p.shortDate}
                </text>
              )}
            </g>
          );
        })}

        {/* Cumulative Line (Red) */}
        {pts.length > 1 && (
          <polyline
            fill="none"
            stroke="#dc2626"
            strokeWidth="2.5"
            points={polylinePoints}
          />
        )}
      </svg>
    );
  };

  // ============================================================================
  // EXPORT TO PDF (ANALYTICAL REPORT WITH CHART + 4 TABLES + DAILY LOG)
  // ============================================================================
  const handleExportPDF = () => {
    const printWin = window.open('', '_blank', 'width=1120,height=860');
    if (!printWin) {
      alert('Permita pop-ups no navegador para gerar o PDF Pluviométrico.');
      return;
    }

    const activeProj =
      selectedProjectId && selectedProjectId !== 'ALL'
        ? projects.find((p) => String(p.id) === String(selectedProjectId))
        : projects[0];

    const bannerTitle =
      reportSettings?.banner_text ||
      'AXIS OBRA ENGENHARIA E CONSTRUÇÕES LTDA\nBOLETIM TÉCNICO DE CONTROLE PLUVIOMÉTRICO E CLIMÁTICO';
    const subheaderLine =
      reportSettings?.subheader_text ||
      `OBRA: ${(activeProj?.name || 'CONSOLIDADO').toUpperCase()} | LOCAL: ${(activeProj?.city || 'OBRA').toUpperCase()}/${activeProj?.state || 'SP'} | TOTAL ACUMULADO: ${formatNumBR(analytics.totalMm)} mm`;
    const footerText = reportSettings?.footer_text || 'Contrato n. CO141/2026 - DT';

    // Capture the rendered SVG chart string
    const svgContainer = document.getElementById('pluv-dual-chart-container');
    const svgMarkup = svgContainer ? svgContainer.innerHTML : '';

    const classRowsHtml = analytics.classDistribution
      .map(
        (c) => `
        <tr>
          <td style="text-align:left;">${c.label}</td>
          <td>${c.days}</td>
          <td>${c.pctDays}%</td>
          <td>${formatNumBR(c.mm)}</td>
          <td>${c.pctMm}%</td>
          <td>${c.range}</td>
        </tr>
      `
      )
      .join('');

    const top5RowsHtml = analytics.top5RainyDays
      .map(
        (t) => `
        <tr>
          <td>${t.rank}</td>
          <td>${t.dateFormatted}</td>
          <td>${t.weekday}</td>
          <td><strong>${formatNumBR(t.mm)}</strong></td>
          <td>${t.rainClass}</td>
          <td>${t.production}</td>
        </tr>
      `
      )
      .join('');

    const weekRowsHtml = analytics.weeks
      .map(
        (w) => `
        <tr>
          <td style="text-align:left;">${w.label}</td>
          <td><strong>${formatNumBR(w.mm)}</strong></td>
          <td>${w.rainyDays}</td>
          <td>${w.impracticableDays}</td>
          <td>${w.production}</td>
          <td>${w.firstDate && w.lastDate ? `${w.firstDate} – ${w.lastDate}` : '—'}</td>
        </tr>
      `
      )
      .join('');

    const shiftRowsHtml = analytics.shifts
      .map(
        (s) => `
        <tr>
          <td style="text-align:left;">${s.label}</td>
          <td>${formatNumBR(s.mm)}</td>
          <td>${s.pct}%</td>
        </tr>
      `
      )
      .join('');

    const dailyLogRowsHtml = chronologicalRecords
      .map(
        (r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${formatDateBR(r.record_date)} (${getWeekdayShort(r.record_date)})</td>
          <td>${r.morning_weather} (${formatNumBR(r.morning_mm)} mm)</td>
          <td>${r.afternoon_weather} (${formatNumBR(r.afternoon_mm || r.rainfall_mm)} mm)</td>
          <td>${r.night_weather} (${formatNumBR(r.night_mm)} mm)</td>
          <td><strong>${formatNumBR(r.rainfall_mm)} mm</strong></td>
          <td>${getRainClassLabel(r.rainfall_mm)}</td>
          <td>${r.hours_lost || 0}h</td>
          <td style="text-align:left;">${r.notes || r.station_name || ''}</td>
        </tr>
      `
      )
      .join('');

    printWin.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Relatório Pluviométrico — AXIS OBRA</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 10.5px; }
            .toolbar { background: #0f172a; color: #fff; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; }
            .toolbar button { background: #f59e0b; color: #0f172a; border: none; padding: 7px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
            .sheet { max-width: 190mm; margin: 0 auto; padding: 4mm 0; }
            .banner { text-align: center; font-weight: bold; font-size: 13px; white-space: pre-line; padding-bottom: 6px; border-bottom: 2px solid #0f172a; }
            .subheader { text-align: center; font-weight: bold; font-size: 11px; margin: 6px 0 10px 0; }
            .chart-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; margin-bottom: 10px; }
            .tables-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
            th.section-title { background: #1e3a5f; color: #ffffff; text-align: left; padding: 5px 8px; font-size: 10px; text-transform: uppercase; }
            th.col-hdr { background: #dbeafe; color: #0f172a; padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: bold; text-align: center; }
            td { padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; }
            tr.total-row td { font-weight: bold; background: #f1f5f9; }
            .footer { margin-top: 8px; padding-top: 4px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 10px; }
            @media print { .toolbar { display: none !important; } }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <span><strong>AXIS OBRA — Relatório Analítico de Pluviometria</strong></span>
            <button onclick="window.print()">🖨️ Salvar em PDF / Imprimir</button>
          </div>
          <div class="sheet">
            <div class="banner">${bannerTitle.replace(/</g, '&lt;')}</div>
            <div class="subheader">${subheaderLine.replace(/</g, '&lt;')}</div>

            <div class="chart-box">
              ${svgMarkup}
            </div>

            <div class="tables-grid">
              <div>
                <table>
                  <thead>
                    <tr><th colspan="6" class="section-title">DISTRIBUIÇÃO DOS DIAS POR CLASSE DE CHUVA</th></tr>
                    <tr>
                      <th class="col-hdr">Classe</th>
                      <th class="col-hdr">Dias</th>
                      <th class="col-hdr">% dias</th>
                      <th class="col-hdr">mm</th>
                      <th class="col-hdr">% mm</th>
                      <th class="col-hdr">Faixa</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${classRowsHtml}
                    <tr class="total-row">
                      <td style="text-align:left;">Total</td>
                      <td>${analytics.totalDays}</td>
                      <td>100%</td>
                      <td>${formatNumBR(analytics.totalMm)}</td>
                      <td>100%</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <table>
                  <thead>
                    <tr><th colspan="6" class="section-title">TOP 5 DIAS MAIS CHUVOSOS (filtro)</th></tr>
                    <tr>
                      <th class="col-hdr">#</th>
                      <th class="col-hdr">Data</th>
                      <th class="col-hdr">Dia</th>
                      <th class="col-hdr">mm</th>
                      <th class="col-hdr">Classe</th>
                      <th class="col-hdr">Prod. (t)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${top5RowsHtml || '<tr><td colspan="6">Sem dias chuvosos no filtro</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="tables-grid">
              <div>
                <table>
                  <thead>
                    <tr><th colspan="6" class="section-title">PRECIPITAÇÃO POR SEMANA DO MÊS</th></tr>
                    <tr>
                      <th class="col-hdr">Semana</th>
                      <th class="col-hdr">mm</th>
                      <th class="col-hdr">Dias chuva</th>
                      <th class="col-hdr">Dias impr.</th>
                      <th class="col-hdr">Produção (t)</th>
                      <th class="col-hdr">Período</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${weekRowsHtml}
                    <tr class="total-row">
                      <td style="text-align:left;">Total</td>
                      <td>${formatNumBR(analytics.totalMm)}</td>
                      <td>${analytics.totalRainyDays}</td>
                      <td>${analytics.totalImpracticableDays}</td>
                      <td>${analytics.totalProduction}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <table>
                  <thead>
                    <tr><th colspan="3" class="section-title">PRECIPITAÇÃO POR TURNO (filtro de datas)</th></tr>
                    <tr>
                      <th class="col-hdr">Turno</th>
                      <th class="col-hdr">mm</th>
                      <th class="col-hdr">% total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${shiftRowsHtml}
                  </tbody>
                </table>
                <p style="font-size:9px; color:#64748b; margin-top:6px;">
                  Obs.: quando importado de estação diária (12 UTC), o acumulado diário é registrado no turno 'Tarde'.
                </p>
              </div>
            </div>

            <table style="margin-top:8px;">
              <thead>
                <tr><th colspan="9" class="section-title">REGISTROS DIÁRIOS DETALHADOS DO PERÍODO (${chronologicalRecords.length} DIAS)</th></tr>
                <tr>
                  <th class="col-hdr">#</th>
                  <th class="col-hdr">Data</th>
                  <th class="col-hdr">Manhã</th>
                  <th class="col-hdr">Tarde</th>
                  <th class="col-hdr">Noite</th>
                  <th class="col-hdr">Total (mm)</th>
                  <th class="col-hdr">Classe</th>
                  <th class="col-hdr">Paralisação</th>
                  <th class="col-hdr">Observações / Fonte</th>
                </tr>
              </thead>
              <tbody>
                ${dailyLogRowsHtml}
              </tbody>
            </table>

            <div class="footer">
              <span>AXIS OBRA • Controle Meteorológico</span>
              <span>${footerText}</span>
              <span>Página 1</span>
            </div>
          </div>
          <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 400); };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  // ============================================================================
  // EXPORT TO EXCEL (.XLS WITH THE 4 ANALYTICAL TABLES + FULL DAILY LOG)
  // ============================================================================
  const handleExportExcel = () => {
    const classRows = analytics.classDistribution
      .map(
        (c) => `
        <tr>
          <td>${c.label}</td>
          <td style="text-align:center;">${c.days}</td>
          <td style="text-align:center;">${c.pctDays}%</td>
          <td style="text-align:right;">${formatNumBR(c.mm)}</td>
          <td style="text-align:center;">${c.pctMm}%</td>
          <td style="text-align:center;">${c.range}</td>
        </tr>`
      )
      .join('');

    const top5Rows = analytics.top5RainyDays
      .map(
        (t) => `
        <tr>
          <td style="text-align:center;">${t.rank}</td>
          <td style="text-align:center;">${t.dateFormatted}</td>
          <td style="text-align:center;">${t.weekday}</td>
          <td style="text-align:right; font-weight:bold;">${formatNumBR(t.mm)}</td>
          <td style="text-align:center;">${t.rainClass}</td>
          <td style="text-align:center;">${t.production}</td>
        </tr>`
      )
      .join('');

    const weekRows = analytics.weeks
      .map(
        (w) => `
        <tr>
          <td>${w.label}</td>
          <td style="text-align:right; font-weight:bold;">${formatNumBR(w.mm)}</td>
          <td style="text-align:center;">${w.rainyDays}</td>
          <td style="text-align:center;">${w.impracticableDays}</td>
          <td style="text-align:center;">${w.production}</td>
          <td style="text-align:center;">${w.firstDate && w.lastDate ? `${w.firstDate} - ${w.lastDate}` : ''}</td>
        </tr>`
      )
      .join('');

    const shiftRows = analytics.shifts
      .map(
        (s) => `
        <tr>
          <td>${s.label}</td>
          <td style="text-align:right;">${formatNumBR(s.mm)}</td>
          <td style="text-align:center;">${s.pct}%</td>
        </tr>`
      )
      .join('');

    const dailyRows = chronologicalRecords
      .map(
        (r) => `
        <tr>
          <td style="text-align:center;">${formatDateBR(r.record_date)}</td>
          <td style="text-align:center;">${getWeekdayShort(r.record_date)}</td>
          <td style="text-align:center;">${r.project_code || ''} — ${r.project_name || ''}</td>
          <td style="text-align:right;">${formatNumBR(r.morning_mm)}</td>
          <td style="text-align:right;">${formatNumBR(r.afternoon_mm || r.rainfall_mm)}</td>
          <td style="text-align:right;">${formatNumBR(r.night_mm)}</td>
          <td style="text-align:right; font-weight:bold;">${formatNumBR(r.rainfall_mm)}</td>
          <td style="text-align:center;">${getRainClassLabel(r.rainfall_mm)}</td>
          <td style="text-align:center;">${r.hours_lost || 0}</td>
          <td style="text-align:center;">${r.production_tons || 0}</td>
          <td>${r.station_name || 'INMET'}</td>
          <td>${r.notes || ''}</td>
        </tr>`
      )
      .join('');

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8" /></head>
        <body style="font-family:Arial, sans-serif; font-size:12px;">
          <h3>RELATÓRIO ANALÍTICO DE PLUVIOMETRIA — AXIS OBRA</h3>

          <table border="1" style="border-collapse:collapse; margin-bottom:16px;">
            <tr style="background:#1e3a5f; color:#fff; font-weight:bold;"><td colspan="6">DISTRIBUIÇÃO DOS DIAS POR CLASSE DE CHUVA</td></tr>
            <tr style="background:#dbeafe; font-weight:bold;">
              <th>Classe</th><th>Dias</th><th>% dias</th><th>mm</th><th>% mm</th><th>Faixa</th>
            </tr>
            ${classRows}
            <tr style="font-weight:bold; background:#f1f5f9;">
              <td>Total</td><td style="text-align:center;">${analytics.totalDays}</td><td style="text-align:center;">100%</td><td style="text-align:right;">${formatNumBR(analytics.totalMm)}</td><td style="text-align:center;">100%</td><td></td>
            </tr>
          </table>

          <table border="1" style="border-collapse:collapse; margin-bottom:16px;">
            <tr style="background:#1e3a5f; color:#fff; font-weight:bold;"><td colspan="6">TOP 5 DIAS MAIS CHUVOSOS (filtro)</td></tr>
            <tr style="background:#dbeafe; font-weight:bold;">
              <th>#</th><th>Data</th><th>Dia</th><th>mm</th><th>Classe</th><th>Prod. (t)</th>
            </tr>
            ${top5Rows}
          </table>

          <table border="1" style="border-collapse:collapse; margin-bottom:16px;">
            <tr style="background:#1e3a5f; color:#fff; font-weight:bold;"><td colspan="6">PRECIPITAÇÃO POR SEMANA DO MÊS</td></tr>
            <tr style="background:#dbeafe; font-weight:bold;">
              <th>Semana</th><th>mm</th><th>Dias chuva</th><th>Dias impr.</th><th>Produção (t)</th><th>Período</th>
            </tr>
            ${weekRows}
            <tr style="font-weight:bold; background:#f1f5f9;">
              <td>Total</td><td style="text-align:right;">${formatNumBR(analytics.totalMm)}</td><td style="text-align:center;">${analytics.totalRainyDays}</td><td style="text-align:center;">${analytics.totalImpracticableDays}</td><td style="text-align:center;">${analytics.totalProduction}</td><td></td>
            </tr>
          </table>

          <table border="1" style="border-collapse:collapse; margin-bottom:16px;">
            <tr style="background:#1e3a5f; color:#fff; font-weight:bold;"><td colspan="3">PRECIPITAÇÃO POR TURNO (filtro de datas)</td></tr>
            <tr style="background:#dbeafe; font-weight:bold;">
              <th>Turno</th><th>mm</th><th>% total</th>
            </tr>
            ${shiftRows}
          </table>

          <table border="1" style="border-collapse:collapse;">
            <tr style="background:#0f172a; color:#fff; font-weight:bold;"><td colspan="12">HISTÓRICO DIÁRIO DE PLUVIOMETRIA</td></tr>
            <tr style="background:#dbeafe; font-weight:bold;">
              <th>Data</th><th>Dia</th><th>Obra</th><th>Manhã (mm)</th><th>Tarde (mm)</th><th>Noite (mm)</th><th>Total (mm)</th><th>Classe</th><th>Horas Paradas</th><th>Prod. (t)</th><th>Estação / Fonte</th><th>Observações</th>
            </tr>
            ${dailyRows}
          </table>
        </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', excelHtml], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Pluviometrico_Axis_Obra_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getWeatherBadge = (val) => {
    const item = WEATHER_OPTIONS.find((w) => w.value === val) || WEATHER_OPTIONS[0];
    const Icon = item.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${item.badge}`}>
        <Icon className="w-3.5 h-3.5" />
        {item.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600">
              <CloudRain className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">6. Registro de Pluviometria e Análise INMET</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Importação direta de CSV do INMET, gráfico de precipitação diária e acumulada, distribuição por classe, Top 5 e exportação PDF/Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setError('');
              setShowCsvModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs shadow-sm transition"
          >
            <Upload className="w-4 h-4" />
            Importar CSV (INMET)
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel (.xls)
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 font-semibold text-xs shadow-sm transition"
          >
            <Printer className="w-4 h-4" />
            Relatório PDF
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Novo Registro Manual
          </button>
        </div>
      </div>

      {/* Period Filters Bar (Year, Month, Date Range, Sort Order) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Filtrar por Ano
            </label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todos os Anos</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Ano {yr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Filtrar por Mês
            </label>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
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

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Data Inicial (De)
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Data Final (Até)
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {(yearFilter !== 'ALL' || monthFilter !== 'ALL' || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setYearFilter('ALL');
                  setMonthFilter('ALL');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 w-full"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          1. DUAL-AXIS CHART ("Precipitação diária e acumulada (mm)")
         ===================================================================== */}
      <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-sm">
        {chronologicalRecords.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            Sem dados pluviométricos no período selecionado para exibir o gráfico.
          </div>
        ) : (
          <div id="pluv-dual-chart-container" className="w-full overflow-x-auto">
            {renderDualAxisSvgChart(960, 310)}
          </div>
        )}
      </div>

      {/* =====================================================================
          2. OS 4 QUADROS ANALÍTICOS DE ENGENHARIA (IGUAL AO MODELO ENVIADO)
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QUADRO 1: DISTRIBUIÇÃO DOS DIAS POR CLASSE DE CHUVA */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
          <div className="bg-[#1b365d] text-white px-4 py-2 font-bold text-xs uppercase tracking-wider">
            DISTRIBUIÇÃO DOS DIAS POR CLASSE DE CHUVA
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#d9e8f5] text-slate-900 font-bold border-b border-slate-300">
                  <th className="py-2 px-3 text-left border-r border-slate-300">Classe</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">Dias</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">% dias</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">mm</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">% mm</th>
                  <th className="py-2 px-3 text-center">Faixa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {analytics.classDistribution.map((c) => (
                  <tr key={c.key} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800 border-r border-slate-200">{c.label}</td>
                    <td className="py-2 px-3 text-center border-r border-slate-200">{c.days}</td>
                    <td className="py-2 px-3 text-center border-r border-slate-200">{c.pctDays}%</td>
                    <td className="py-2 px-3 text-center border-r border-slate-200">{formatNumBR(c.mm)}</td>
                    <td className="py-2 px-3 text-center border-r border-slate-200">{c.pctMm}%</td>
                    <td className="py-2 px-3 text-center text-slate-600">{c.range}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td className="py-2 px-3 border-r border-slate-300">Total</td>
                  <td className="py-2 px-3 text-center border-r border-slate-300">{analytics.totalDays}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-300">100%</td>
                  <td className="py-2 px-3 text-center border-r border-slate-300">{formatNumBR(analytics.totalMm)}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-300">100%</td>
                  <td className="py-2 px-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* QUADRO 2: TOP 5 DIAS MAIS CHUVOSOS (filtro) */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
          <div className="bg-[#1b365d] text-white px-4 py-2 font-bold text-xs uppercase tracking-wider">
            TOP 5 DIAS MAIS CHUVOSOS (filtro)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#d9e8f5] text-slate-900 font-bold border-b border-slate-300">
                  <th className="py-2 px-3 text-center border-r border-slate-300">#</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">Data</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">Dia</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">mm</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">Classe</th>
                  <th className="py-2 px-3 text-center">Prod. (t)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {analytics.top5RainyDays.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Nenhum dia com precipitação no período filtrado.
                    </td>
                  </tr>
                ) : (
                  analytics.top5RainyDays.map((item) => (
                    <tr key={item.rank} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-semibold border-r border-slate-200">{item.rank}</td>
                      <td className="py-2 px-3 text-center border-r border-slate-200">{item.dateFormatted}</td>
                      <td className="py-2 px-3 text-center border-r border-slate-200">{item.weekday}</td>
                      <td className="py-2 px-3 text-center font-bold text-slate-900 border-r border-slate-200">
                        {formatNumBR(item.mm)}
                      </td>
                      <td className="py-2 px-3 text-center border-r border-slate-200">{item.rainClass}</td>
                      <td className="py-2 px-3 text-center">{item.production}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* QUADRO 3: PRECIPITAÇÃO POR SEMANA DO MÊS */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
          <div className="bg-[#1b365d] text-white px-4 py-2 font-bold text-xs uppercase tracking-wider">
            PRECIPITAÇÃO POR SEMANA DO MÊS
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#d9e8f5] text-slate-900 font-bold border-b border-slate-300">
                  <th className="py-2 px-3 text-right border-r border-slate-300">Semana</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300 w-36">mm</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">Dias chuva</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">Dias impr.</th>
                  <th className="py-2 px-3 text-center border-r border-slate-300">Produção (t)</th>
                  <th className="py-2 px-3 text-center">Período</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {analytics.weeks.map((wk) => {
                  const pctBar = wk.mm > 0 ? Math.max(6, Math.round((wk.mm / analytics.maxWeekMm) * 100)) : 0;
                  return (
                    <tr key={wk.label} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-right font-medium border-r border-slate-200">{wk.label}</td>
                      <td className="py-1.5 px-2 border-r border-slate-200 relative">
                        <div className="relative h-5 flex items-center justify-center">
                          {pctBar > 0 && (
                            <div
                              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[#6b9bd2] to-[#c5d9f1] rounded-xs"
                              style={{ width: `${pctBar}%` }}
                            />
                          )}
                          <span className="relative z-10 font-semibold text-slate-900">
                            {formatNumBR(wk.mm)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center border-r border-slate-200">{wk.rainyDays}</td>
                      <td className="py-2 px-3 text-center border-r border-slate-200">{wk.impracticableDays}</td>
                      <td className="py-2 px-3 text-center border-r border-slate-200">{wk.production}</td>
                      <td className="py-2 px-3 text-center text-slate-600">
                        {wk.firstDate && wk.lastDate ? `${wk.firstDate} – ${wk.lastDate}` : ''}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td className="py-2 px-3 text-left border-r border-slate-300">Total</td>
                  <td className="py-2 px-3 text-center border-r border-slate-300">{formatNumBR(analytics.totalMm)}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-300">{analytics.totalRainyDays}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-300">{analytics.totalImpracticableDays}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-300">{analytics.totalProduction}</td>
                  <td className="py-2 px-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* QUADRO 4: PRECIPITAÇÃO POR TURNO (filtro de datas) */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-[#1b365d] text-white px-4 py-2 font-bold text-xs uppercase tracking-wider">
              PRECIPITAÇÃO POR TURNO (filtro de datas)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#d9e8f5] text-slate-900 font-bold border-b border-slate-300">
                    <th className="py-2 px-3 text-left border-r border-slate-300">Turno</th>
                    <th className="py-2 px-3 text-center border-r border-slate-300">mm</th>
                    <th className="py-2 px-3 text-center">% total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {analytics.shifts.map((s) => (
                    <tr key={s.label} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-800 border-r border-slate-200">
                        {s.label}
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold border-r border-slate-200">
                        {formatNumBR(s.mm)}
                      </td>
                      <td className="py-2.5 px-3 text-center">{s.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
            <strong>Obs.:</strong> Quando importado de estação diária do INMET (leitura padrão 12 UTC) sem abertura horária, a chuva diária acumulada é atribuída automaticamente ao turno &lsquo;Tarde&rsquo; (ou dividida por turno quando o CSV do INMET for horário).
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. TABELA DE MEDIÇÕES DIÁRIAS DETALHADAS
         ===================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Boletins Diários Registrados ({filteredRecords.length} dias no filtro)
            </h3>
          </div>

          <div className="inline-flex items-center rounded-lg bg-white p-0.5 border border-slate-200">
            <button
              type="button"
              onClick={() => setSortOrder('ASC')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition ${
                sortOrder === 'ASC'
                  ? 'bg-slate-900 text-amber-400'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ArrowUp className="w-3.5 h-3.5" />
              Cronológica (01 → 31)
            </button>
            <button
              type="button"
              onClick={() => setSortOrder('DESC')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition ${
                sortOrder === 'DESC'
                  ? 'bg-slate-900 text-amber-400'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              Mais Recentes
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Carregando boletim pluviométrico...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-14 p-6">
            <CloudRain className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Nenhum registro pluviométrico encontrado</h3>
            <p className="text-sm text-slate-500 mt-1">
              Importe um arquivo CSV do INMET ou clique em &ldquo;Novo Registro Manual&rdquo;.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Data / Obra</th>
                  <th className="py-3 px-4">Manhã</th>
                  <th className="py-3 px-4">Tarde</th>
                  <th className="py-3 px-4">Noite</th>
                  <th className="py-3 px-4">Total (mm) / Classe</th>
                  <th className="py-3 px-4">Impacto / Prod. (t)</th>
                  <th className="py-3 px-4">Fonte / Observações</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredRecords.map((rec) => {
                  const imp = IMPACT_CONFIG[rec.work_impact] || IMPACT_CONFIG.SEM_IMPACTO;
                  const mm = Number(rec.rainfall_mm) || 0;
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-500" />
                          {formatDateBR(rec.record_date)}{' '}
                          <span className="text-xs font-mono text-slate-400">
                            ({getWeekdayShort(rec.record_date)})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" />
                          {rec.project_code} — {rec.project_name}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {getWeatherBadge(rec.morning_weather)}
                        {Number(rec.morning_mm) > 0 && (
                          <div className="text-[11px] font-semibold text-sky-700 mt-0.5">
                            {formatNumBR(rec.morning_mm)} mm
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {getWeatherBadge(rec.afternoon_weather)}
                        {Number(rec.afternoon_mm) > 0 && (
                          <div className="text-[11px] font-semibold text-sky-700 mt-0.5">
                            {formatNumBR(rec.afternoon_mm)} mm
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {getWeatherBadge(rec.night_weather)}
                        {Number(rec.night_mm) > 0 && (
                          <div className="text-[11px] font-semibold text-sky-700 mt-0.5">
                            {formatNumBR(rec.night_mm)} mm
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-extrabold text-sky-700 text-base">
                          {formatNumBR(mm)} mm
                        </div>
                        <div className="text-xs text-slate-500">{getRainClassLabel(mm)}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold border ${imp.badge}`}>
                          {imp.label}
                        </span>
                        <div className="text-xs text-slate-500 mt-1">
                          {Number(rec.hours_lost) > 0 ? `${rec.hours_lost}h paradas • ` : ''}
                          Prod: <strong>{rec.production_tons || 0} t</strong>
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-xs text-slate-600 line-clamp-2">{rec.notes || '—'}</p>
                        <span className="text-[11px] text-slate-400">
                          {rec.station_name || 'Pluviômetro'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(rec)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                            title="Editar medição"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rec.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Excluir medição"
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

      {/* =====================================================================
          MODAL 1: IMPORTAR CSV DO INMET
         ===================================================================== */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-100 text-sky-700">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Importar Dados Pluviométricos via CSV (Padrão INMET)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Suporta planilhas CSV horárias ou diárias exportadas das estações meteorológicas do INMET.
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCsvModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium shrink-0">
                {error}
              </div>
            )}

            <div className="mt-4 space-y-4 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Obra de Destino para os Dados *
                  </label>
                  <select
                    value={csvTargetProject}
                    onChange={(e) => setCsvTargetProject(e.target.value)}
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Identificação da Estação Meteorológica
                  </label>
                  <input
                    type="text"
                    value={csvStationName}
                    onChange={(e) => setCsvStationName(e.target.value)}
                    placeholder="Ex: INMET - Estação A835 Maringá"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="border-2 border-dashed border-sky-400 bg-sky-50/40 rounded-xl p-5 text-center space-y-2">
                <input
                  id="inmet-csv-input"
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="inmet-csv-input"
                  className="cursor-pointer flex flex-col items-center justify-center gap-1"
                >
                  <Upload className="w-7 h-7 text-sky-600" />
                  <span className="text-sm font-bold text-slate-800">
                    Clique para selecionar o arquivo .CSV exportado do INMET
                  </span>
                  <span className="text-xs text-slate-500">
                    Reconhece automaticamente colunas de Data, Hora (UTC), Precipitação Total (mm) e Temperatura.
                  </span>
                </label>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleLoadSampleInmetMonth}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold border border-amber-300 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Carregar Mês Completo de Exemplo (Outubro/2026 — 31 dias / 354,6 mm igual ao seu modelo)
                  </button>
                </div>
              </div>

              {csvPreviewRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Pré-visualização: {csvPreviewRows.length} dias processados • Acumulado:{' '}
                      <strong className="text-sky-700">
                        {formatNumBR(csvPreviewRows.reduce((a, b) => a + (Number(b.rainfall_mm) || 0), 0))} mm
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCsvPreviewRows([])}
                      className="text-xs text-rose-600 hover:underline font-semibold"
                    >
                      Limpar lista
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="py-2 px-3 text-left">Data</th>
                          <th className="py-2 px-3 text-center">Manhã (mm)</th>
                          <th className="py-2 px-3 text-center">Tarde (mm)</th>
                          <th className="py-2 px-3 text-center">Noite (mm)</th>
                          <th className="py-2 px-3 text-center">Total (mm)</th>
                          <th className="py-2 px-3 text-center">Classe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {csvPreviewRows.map((r) => (
                          <tr key={r.record_date}>
                            <td className="py-1.5 px-3 font-medium">
                              {formatDateBR(r.record_date)} ({getWeekdayShort(r.record_date)})
                            </td>
                            <td className="py-1.5 px-3 text-center">{formatNumBR(r.morning_mm)}</td>
                            <td className="py-1.5 px-3 text-center">{formatNumBR(r.afternoon_mm)}</td>
                            <td className="py-1.5 px-3 text-center">{formatNumBR(r.night_mm)}</td>
                            <td className="py-1.5 px-3 text-center font-bold text-sky-700">
                              {formatNumBR(r.rainfall_mm)}
                            </td>
                            <td className="py-1.5 px-3 text-center">{getRainClassLabel(r.rainfall_mm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={importingCsv || csvPreviewRows.length === 0}
                onClick={handleConfirmCsvImport}
                className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow-sm disabled:opacity-50"
              >
                {importingCsv
                  ? 'Importando...'
                  : `Importar ${csvPreviewRows.length} Dias para a Obra`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: LANÇAR / EDITAR BOLETIM DIÁRIO MANUAL
         ===================================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <CloudRain className="w-5 h-5 text-sky-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  {editingItem ? 'Editar Medição Pluviométrica' : 'Lançar Boletim Diário de Pluviometria'}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Obra *</label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data da Medição *</label>
                  <input
                    type="date"
                    required
                    value={form.record_date}
                    onChange={(e) => setForm({ ...form, record_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clima Manhã *</label>
                  <select
                    value={form.morning_weather}
                    onChange={(e) => setForm({ ...form, morning_weather: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {WEATHER_OPTIONS.filter((w) => w.value !== 'SEM_EXPEDIENTE').map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clima Tarde *</label>
                  <select
                    value={form.afternoon_weather}
                    onChange={(e) => setForm({ ...form, afternoon_weather: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {WEATHER_OPTIONS.filter((w) => w.value !== 'SEM_EXPEDIENTE').map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clima Noite</label>
                  <select
                    value={form.night_weather}
                    onChange={(e) => setForm({ ...form, night_weather: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {WEATHER_OPTIONS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Precipitation per Shift + Total */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-sky-50/60 p-3.5 rounded-xl border border-sky-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Chuva Manhã (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.morning_mm}
                    onChange={(e) => {
                      const m = Number(e.target.value) || 0;
                      const a = Number(form.afternoon_mm) || 0;
                      const n = Number(form.night_mm) || 0;
                      setForm({
                        ...form,
                        morning_mm: e.target.value,
                        rainfall_mm: Number((m + a + n).toFixed(1))
                      });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Chuva Tarde (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.afternoon_mm}
                    onChange={(e) => {
                      const m = Number(form.morning_mm) || 0;
                      const a = Number(e.target.value) || 0;
                      const n = Number(form.night_mm) || 0;
                      setForm({
                        ...form,
                        afternoon_mm: e.target.value,
                        rainfall_mm: Number((m + a + n).toFixed(1))
                      });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Chuva Noite (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.night_mm}
                    onChange={(e) => {
                      const m = Number(form.morning_mm) || 0;
                      const a = Number(form.afternoon_mm) || 0;
                      const n = Number(e.target.value) || 0;
                      setForm({
                        ...form,
                        night_mm: e.target.value,
                        rainfall_mm: Number((m + a + n).toFixed(1))
                      });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-sky-800 mb-1">Total do Dia (mm) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.rainfall_mm}
                    onChange={(e) => setForm({ ...form, rainfall_mm: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-sky-400 text-sm font-bold text-sky-700 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Horas Paralisadas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={form.hours_lost}
                    onChange={(e) => setForm({ ...form, hours_lost: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Produção (t)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.production_tons}
                    onChange={(e) => setForm({ ...form, production_tons: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Temp. Mín (°C)</label>
                  <input
                    type="number"
                    value={form.temperature_min}
                    onChange={(e) => setForm({ ...form, temperature_min: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Temp. Máx (°C)</label>
                  <input
                    type="number"
                    value={form.temperature_max}
                    onChange={(e) => setForm({ ...form, temperature_max: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Impacto na Obra *</label>
                  <select
                    value={form.work_impact}
                    onChange={(e) => setForm({ ...form, work_impact: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="SEM_IMPACTO">Sem Impacto no Cronograma</option>
                    <option value="IMPACTO_PARCIAL">Impacto Parcial / Remanejamento</option>
                    <option value="PARALISACAO_TOTAL">Impraticável / Paralisação Total</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estação / Fonte</label>
                  <input
                    type="text"
                    value={form.station_name}
                    onChange={(e) => setForm({ ...form, station_name: e.target.value })}
                    placeholder="Ex: INMET - Estação A835"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações Técnicas para o Diário de Obra (RDO)
                </label>
                <textarea
                  rows={2}
                  placeholder="Descreva condições do solo, serviços externos suspensos (ex: terraplanagem, CBUQ, grua)..."
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
                  {editingItem ? 'Salvar Alterações' : 'Salvar Medição Pluviométrica'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
