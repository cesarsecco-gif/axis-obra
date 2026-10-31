import React, { useState, useEffect } from 'react';
import {
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  Droplets,
  Clock,
  Calendar,
  Plus,
  Trash2,
  Building2,
  Thermometer,
  X
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';

const WEATHER_OPTIONS = [
  { value: 'SOL', label: 'Sol / Tempo Bom', icon: Sun, badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'NUBLADO', label: 'Nublado', icon: Cloud, badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  { value: 'CHUVA_FRACA', label: 'Chuva Fraca / Garoa', icon: CloudRain, badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  { value: 'CHUVA_FORTE', label: 'Chuva Forte', icon: CloudRain, badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'IMPRATICAVEL', label: 'Impraticável / Tempestade', icon: CloudLightning, badge: 'bg-rose-100 text-rose-800 border-rose-300' },
  { value: 'SEM_EXPEDIENTE', label: 'Sem Expediente Noturno', icon: Clock, badge: 'bg-slate-50 text-slate-400 border-slate-200' }
];

const IMPACT_CONFIG = {
  SEM_IMPACTO: { label: 'Sem Impacto no Cronograma', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  IMPACTO_PARCIAL: { label: 'Impacto Parcial / Remanejamento', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  PARALISACAO_TOTAL: { label: 'Paralisação de Frentes Externas', badge: 'bg-rose-100 text-rose-800 border-rose-300' }
};

export default function PluviometryView({ projects, selectedProjectId, onRefreshDashboard }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  const initialForm = {
    project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || ''),
    record_date: new Date().toISOString().slice(0, 10),
    morning_weather: 'SOL',
    afternoon_weather: 'NUBLADO',
    night_weather: 'SEM_EXPEDIENTE',
    rainfall_mm: 0,
    work_impact: 'SEM_IMPACTO',
    hours_lost: 0,
    temperature_min: 18,
    temperature_max: 28,
    notes: ''
  };

  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (selectedProjectId !== 'ALL') {
      setForm((prev) => ({ ...prev, project_id: selectedProjectId }));
    } else if (!form.project_id && projects.length > 0) {
      setForm((prev) => ({ ...prev, project_id: projects[0].id }));
    }
  }, [selectedProjectId, projects]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId && selectedProjectId !== 'ALL') params.set('projectId', selectedProjectId);
      const data = await apiRequest(`/api/pluviometry?${params.toString()}`);
      setRecords(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [selectedProjectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/pluviometry', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setShowModal(false);
      setForm({
        ...initialForm,
        project_id: selectedProjectId !== 'ALL' ? selectedProjectId : (projects[0]?.id || '')
      });
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

  const totalRainMm = records.reduce((acc, r) => acc + (Number(r.rainfall_mm) || 0), 0);
  const rainyDaysCount = records.filter((r) => Number(r.rainfall_mm) > 0).length;
  const totalHoursLost = records.reduce((acc, r) => acc + (Number(r.hours_lost) || 0), 0);
  const impactedDays = records.filter((r) => r.work_impact !== 'SEM_IMPACTO').length;

  const getWeatherBadge = (val) => {
    const item = WEATHER_OPTIONS.find((w) => w.value === val) || WEATHER_OPTIONS[0];
    const Icon = item.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${item.badge}`}>
        <Icon className="w-3.5 h-3.5" />
        {item.label}
      </span>
    );
  };

  const chartData = [...records].slice(0, 10).reverse();
  const maxRain = Math.max(50, ...chartData.map((d) => Number(d.rainfall_mm) || 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600">
              <CloudRain className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">6. Registro de Pluviometria e Controle Climático</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Monitoramento diário de precipitação (mm), condições por turno (Manhã/Tarde/Noite) e justificativa técnica de paralisações por chuva.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Novo Registro Pluviométrico
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Precipitação Acumulada</p>
            <p className="text-2xl font-bold text-sky-600 mt-0.5">{totalRainMm.toFixed(1)} mm</p>
          </div>
          <div className="p-2.5 rounded-lg bg-sky-50 text-sky-600">
            <Droplets className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Dias com Precipitação</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {rainyDaysCount} <span className="text-xs font-normal text-slate-400">de {records.length} reg.</span>
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
            <CloudRain className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Horas Paralisadas por Chuva</p>
            <p className="text-2xl font-bold text-amber-600 mt-0.5">{totalHoursLost.toFixed(1)} h</p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Dias com Impacto na Obra</p>
            <p className="text-2xl font-bold text-rose-600 mt-0.5">{impactedDays}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600">
            <CloudLightning className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Visual Pluviometric Chart */}
      {chartData.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Gráfico de Índice Pluviométrico Diário (mm)</h3>
              <p className="text-xs text-slate-500">Últimos registros lançados no pluviômetro de canteiro</p>
            </div>
            <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded border border-sky-200">
              1 mm = 1 Litro / m²
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3 items-end pt-4 pb-2">
            {chartData.map((d) => {
              const mm = Number(d.rainfall_mm) || 0;
              const heightPct = Math.max(8, Math.round((mm / maxRain) * 100));
              return (
                <div key={d.id} className="flex flex-col items-center gap-1.5">
                  <span className="text-xs font-bold text-sky-700">{mm} mm</span>
                  <div className="w-full h-28 bg-slate-100 rounded-lg flex items-end p-1 overflow-hidden">
                    <div
                      className={`w-full rounded transition-all duration-500 ${
                        mm >= 30
                          ? 'bg-rose-500'
                          : mm > 0
                          ? 'bg-sky-500'
                          : 'bg-emerald-400/50'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">{formatDateBR(d.record_date).slice(0, 5)}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{d.project_code}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pluviometry Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-500">Carregando boletim pluviométrico...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-14 p-6">
            <CloudRain className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Nenhum registro pluviométrico encontrado</h3>
            <p className="text-sm text-slate-500 mt-1">
              Clique em &ldquo;Novo Registro Pluviométrico&rdquo; para lançar o boletim diário de chuvas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Data / Obra</th>
                  <th className="py-3.5 px-4">Manhã</th>
                  <th className="py-3.5 px-4">Tarde</th>
                  <th className="py-3.5 px-4">Noite</th>
                  <th className="py-3.5 px-4">Volume (mm) / Temp.</th>
                  <th className="py-3.5 px-4">Impacto / Horas Paradas</th>
                  <th className="py-3.5 px-4">Observações RDO</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {records.map((rec) => {
                  const imp = IMPACT_CONFIG[rec.work_impact] || IMPACT_CONFIG.SEM_IMPACTO;
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-500" />
                          {formatDateBR(rec.record_date)}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" />
                          {rec.project_code} — {rec.project_name}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">{getWeatherBadge(rec.morning_weather)}</td>
                      <td className="py-3.5 px-4">{getWeatherBadge(rec.afternoon_weather)}</td>
                      <td className="py-3.5 px-4">{getWeatherBadge(rec.night_weather)}</td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-sky-700 text-base">{Number(rec.rainfall_mm || 0).toFixed(1)} mm</div>
                        {(rec.temperature_min !== null || rec.temperature_max !== null) && (
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Thermometer className="w-3 h-3" />
                            {rec.temperature_min ?? '—'}°C a {rec.temperature_max ?? '—'}°C
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold border ${imp.badge}`}>
                          {imp.label}
                        </span>
                        {Number(rec.hours_lost) > 0 && (
                          <div className="text-xs font-semibold text-rose-600 mt-1">
                            {rec.hours_lost}h de paralisação
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-xs text-slate-600 line-clamp-2">{rec.notes || '—'}</p>
                        <span className="text-[11px] text-slate-400">Por: {rec.author_name || 'Engenharia'}</span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleDelete(rec.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Excluir medição"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
              <div className="flex items-center gap-2">
                <CloudRain className="w-5 h-5 text-sky-600" />
                <h3 className="text-lg font-bold text-slate-900">Lançar Boletim Diário de Pluviometria</h3>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Período da Manhã *</label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Período da Tarde *</label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Período da Noite</label>
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

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Volume de Chuva (mm) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.rainfall_mm}
                    onChange={(e) => setForm({ ...form, rainfall_mm: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold text-sky-700"
                  />
                </div>
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Impacto na Produção da Obra *</label>
                <select
                  value={form.work_impact}
                  onChange={(e) => setForm({ ...form, work_impact: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="SEM_IMPACTO">Sem Impacto no Cronograma</option>
                  <option value="IMPACTO_PARCIAL">Impacto Parcial / Remanejamento de Equipes</option>
                  <option value="PARALISACAO_TOTAL">Paralisação Total das Frentes Externas</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações Técnicas para o Diário de Obra (RDO)
                </label>
                <textarea
                  rows={2}
                  placeholder="Descreva condições do solo, serviços externos suspensos (ex: grua, fachada, terraplanagem)..."
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
                  Salvar Medição Pluviométrica
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

