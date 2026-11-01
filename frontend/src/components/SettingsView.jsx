import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building2,
  FileText,
  Sliders,
  Save,
  CheckCircle2,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  Shield,
  Upload,
  Sparkles,
  Info,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type
} from 'lucide-react';
import { apiRequest } from '../api';

const PARAM_GROUPS = [
  { key: 'TYPE', label: '1. Categoria / Tipo de Ocorrência' },
  { key: 'SEVERITY', label: '2. Grau de Severidade' },
  { key: 'STATUS', label: '3. Status da Ocorrência' },
  { key: 'SECTOR', label: '4. Setor / Frente de Serviço' }
];

export default function SettingsView({ projects, selectedProjectId, currentUser }) {
  const [activeTab, setActiveTab] = useState('CONTRACT'); // 'CONTRACT' | 'REPORT_BANNER' | 'OCCURRENCE_FIELDS'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  // Tab 1 & 2: Report Settings & Contract Participants
  const [settingsForm, setSettingsForm] = useState({
    contract_number: 'CO141/2025 - DT',
    contractor_company: 'Consórcio Rodovia PR-317 Iguaraçu Maringá',
    supervisor_company: 'Iguatemi Consultoria e Serviços de Engenharia LTDA.',
    client_name: 'DER/PR - Governo do Estado do Paraná',
    regional_superintendency: 'DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE',
    contractor_manager: 'DANIELLE NARDINO',
    contractor_representative: 'DANIELLE NARDINO',
    supervisor_engineer: 'João Carlos Deríssio',
    fiscal_engineer: 'Alisson',
    orientation: 'PORTRAIT',
    photos_per_page: 6,
    banner_mode: 'TEXT',
    banner_image_url: '',
    banner_text: 'AXIS OBRA ENGENHARIA E CONSTRUÇÕES LTDA\nRELATÓRIO FOTOGRÁFICO DE ACOMPANHAMENTO DE OBRA',
    banner_text_align: 'CENTER',
    banner_font_size: 'MEDIUM',
    banner_bold: 1,
    banner_italic: 0,
    banner_underline: 0,
    banner_color: '#0f172a',
    subheader_text: '',
    subheader_align: 'CENTER',
    subheader_bold: 1,
    footer_text: 'Contrato n. CO141/2025 - DT',
    show_empty_placeholders: 1,
    banner_logo_left_url: '',
    banner_logo_right_url: ''
  });

  // Tab 3: Occurrence Params
  const [paramsList, setParamsList] = useState([]);
  const [activeParamGroup, setActiveParamGroup] = useState('TYPE');
  const [editingParam, setEditingParam] = useState(null);
  const [paramLabelInput, setParamLabelInput] = useState('');
  const [paramColorInput, setParamColorInput] = useState('blue');
  const [paramCriticalInput, setParamCriticalInput] = useState(false);

  useEffect(() => {
    loadAllSettings();
  }, []);

  const loadAllSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const [settingsRes, paramsRes] = await Promise.all([
        apiRequest('/api/report-settings'),
        apiRequest('/api/occurrence-params')
      ]);

      if (settingsRes && typeof settingsRes === 'object') {
        setSettingsForm((prev) => ({
          ...prev,
          ...settingsRes
        }));
      }
      setParamsList(paramsRes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveContractSettings = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSuccessMessage('');
    setError('');
    try {
      const updated = await apiRequest('/api/report-settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm)
      });
      setSettingsForm((prev) => ({ ...prev, ...updated }));
      setSuccessMessage('Configurações salvas com sucesso! Refletidas no RDO e Relatórios.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Occurrence params handlers
  const handleCreateOrUpdateParam = async (e) => {
    e.preventDefault();
    if (!paramLabelInput.trim()) return;
    try {
      if (editingParam) {
        await apiRequest(`/api/occurrence-params/${editingParam.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            label: paramLabelInput.trim(),
            color: paramColorInput,
            is_critical: paramCriticalInput ? 1 : 0
          })
        });
      } else {
        await apiRequest('/api/occurrence-params', {
          method: 'POST',
          body: JSON.stringify({
            group_key: activeParamGroup,
            label: paramLabelInput.trim(),
            color: paramColorInput,
            is_critical: paramCriticalInput ? 1 : 0
          })
        });
      }
      setParamLabelInput('');
      setEditingParam(null);
      setParamCriticalInput(false);
      const updatedList = await apiRequest('/api/occurrence-params');
      setParamsList(updatedList);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteParam = async (id) => {
    if (!window.confirm('Deseja excluir esta opção de campo?')) return;
    try {
      await apiRequest(`/api/occurrence-params/${id}`, { method: 'DELETE' });
      const updatedList = await apiRequest('/api/occurrence-params');
      setParamsList(updatedList);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResetOccurrenceDefaults = async () => {
    if (!window.confirm('Deseja restaurar os campos padrão de ocorrências do sistema?')) return;
    try {
      await apiRequest('/api/occurrence-params/reset', { method: 'POST' });
      const updatedList = await apiRequest('/api/occurrence-params');
      setParamsList(updatedList);
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredParams = paramsList.filter((p) => p.group_key === activeParamGroup);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Configurações Gerais do Sistema</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Central de gerenciamento de participantes do contrato, RDO, cabeçalhos de relatórios e campos customizáveis.
              </p>
            </div>
          </div>
        </div>

        {activeTab !== 'OCCURRENCE_FIELDS' && (
          <button
            type="button"
            onClick={handleSaveContractSettings}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-sm transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        )}
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
          <Info className="w-4 h-4 text-rose-600 shrink-0" />
          {error}
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('CONTRACT')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
            activeTab === 'CONTRACT'
              ? 'border-amber-500 text-amber-700 bg-amber-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          1. Contrato e Participantes (RDO & Relatórios)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REPORT_BANNER')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
            activeTab === 'REPORT_BANNER'
              ? 'border-amber-500 text-amber-700 bg-amber-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          2. Banner e Layout de Relatórios
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('OCCURRENCE_FIELDS')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
            activeTab === 'OCCURRENCE_FIELDS'
              ? 'border-amber-500 text-amber-700 bg-amber-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          3. Campos Personalizáveis de Ocorrências
        </button>
      </div>

      {/* =========================================================================
          TAB 1: CONTRATO E PARTICIPANTES (RDO & RELATÓRIOS)
         ========================================================================= */}
      {activeTab === 'CONTRACT' && (
        <form onSubmit={handleSaveContractSettings} className="bg-white p-6 rounded-b-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 text-sky-900 text-xs flex items-start gap-3">
            <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="block text-sky-950 font-bold mb-0.5">
                Alimentação Automática do RDO e Relatórios Técnicos
              </strong>
              Estas informações preenchem os cabeçalhos, empresas, contratos e blocos de assinatura do <strong>Diário de Obras (RDO)</strong> e dos relatórios fotográficos. Caso a construtora executora, a supervisora ou os engenheiros fiscais sejam substituídos em aditivos ou medições futuras, basta atualizar os campos abaixo para que as novas folhas reflitam os novos participantes imediatamente.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Bloco 1: Dados do Contrato e Empresas */}
            <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-2">
                <Building2 className="w-4 h-4 text-amber-500" />
                Dados do Contrato e Entidades
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número do Contrato *
                </label>
                <input
                  type="text"
                  value={settingsForm.contract_number || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, contract_number: e.target.value })}
                  placeholder="Ex: CO141/2025 - DT"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Empresa Executora / Consórcio Construtor *
                </label>
                <input
                  type="text"
                  value={settingsForm.contractor_company || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, contractor_company: e.target.value })}
                  placeholder="Ex: Consórcio Rodovia PR-317 Iguaraçu Maringá"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Empresa Supervisora de Engenharia *
                </label>
                <input
                  type="text"
                  value={settingsForm.supervisor_company || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, supervisor_company: e.target.value })}
                  placeholder="Ex: Iguatemi Consultoria e Serviços de Engenharia LTDA."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Órgão Contratante / Cliente
                </label>
                <input
                  type="text"
                  value={settingsForm.client_name || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, client_name: e.target.value })}
                  placeholder="Ex: DER/PR - Governo do Estado do Paraná"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Superintendência Regional / Diretoria
                </label>
                <input
                  type="text"
                  value={settingsForm.regional_superintendency || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, regional_superintendency: e.target.value })}
                  placeholder="Ex: DER/PR SUPERINTENDÊNCIA REGIONAL NOROESTE"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                />
              </div>
            </div>

            {/* Bloco 2: Responsáveis Técnicos e Assinaturas */}
            <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-2">
                <Shield className="w-4 h-4 text-sky-600" />
                Responsáveis Técnicos e Fiscais de Obra
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Gerente de Contrato da Executora (Assinatura 1) *
                </label>
                <input
                  type="text"
                  value={settingsForm.contractor_manager || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, contractor_manager: e.target.value })}
                  placeholder="Ex: DANIELLE NARDINO"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Engenheiro Preposto da Executora (Campo Preposto do RDO)
                </label>
                <input
                  type="text"
                  value={settingsForm.contractor_representative || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, contractor_representative: e.target.value })}
                  placeholder="Ex: DANIELLE NARDINO"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Engenheiro da Supervisora (Assinatura 2) *
                </label>
                <input
                  type="text"
                  value={settingsForm.supervisor_engineer || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, supervisor_engineer: e.target.value })}
                  placeholder="Ex: João Carlos Deríssio"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Engenheiro Fiscal do DER / Contratante (Assinatura 3) *
                </label>
                <input
                  type="text"
                  value={settingsForm.fiscal_engineer || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, fiscal_engineer: e.target.value })}
                  placeholder="Ex: Alisson"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Texto Padrão do Rodapé dos Documentos
                </label>
                <input
                  type="text"
                  value={settingsForm.footer_text || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, footer_text: e.target.value })}
                  placeholder="Ex: Contrato n. CO141/2025 - DT"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-sm transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Alterações de Contrato'}
            </button>
          </div>
        </form>
      )}

      {/* =========================================================================
          TAB 2: BANNER E LAYOUT DE RELATÓRIOS
         ========================================================================= */}
      {activeTab === 'REPORT_BANNER' && (
        <form onSubmit={handleSaveContractSettings} className="bg-white p-6 rounded-b-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
                Formato do Relatório Fotográfico
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Orientação da Página
                  </label>
                  <select
                    value={settingsForm.orientation || 'PORTRAIT'}
                    onChange={(e) => setSettingsForm({ ...settingsForm, orientation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-medium"
                  >
                    <option value="PORTRAIT">Retrato (Vertical A4)</option>
                    <option value="LANDSCAPE">Paisagem (Horizontal A4)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fotos por Página
                  </label>
                  <select
                    value={settingsForm.photos_per_page || 6}
                    onChange={(e) => setSettingsForm({ ...settingsForm, photos_per_page: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-medium"
                  >
                    <option value={2}>2 Fotos (Grandes)</option>
                    <option value={4}>4 Fotos (2 x 2)</option>
                    <option value={6}>6 Fotos (2 x 3 — Padrão Modelo)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Modo do Banner Superior (Aplicado no RDO e no Relatório Fotográfico)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'TEXT', label: 'Caixa de Texto Formatado' },
                    { id: 'IMAGE', label: 'Imagem / Logo Banner' },
                    { id: 'BOTH', label: 'Imagem + Texto' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSettingsForm({ ...settingsForm, banner_mode: m.id })}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                        settingsForm.banner_mode === m.id
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {(settingsForm.banner_mode === 'IMAGE' || settingsForm.banner_mode === 'BOTH') && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Importar Imagem do Banner Customizado (RDO & Relatórios):
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition">
                      <Upload className="w-4 h-4 text-amber-400" />
                      Selecionar Imagem (PNG, JPG, SVG)
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            setSettingsForm((prev) => ({
                              ...prev,
                              banner_image_base64: reader.result
                            }));
                          };
                          reader.readAsDataURL(file);
                        }}
                        className="hidden"
                      />
                    </label>
                    {(settingsForm.banner_image_base64 || settingsForm.banner_image_url) && (
                      <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200">
                        <img
                          src={settingsForm.banner_image_base64 || settingsForm.banner_image_url}
                          alt="Banner"
                          className="h-10 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSettingsForm({
                              ...settingsForm,
                              banner_image_url: '',
                              banner_image_base64: ''
                            })
                          }
                          className="text-xs text-rose-600 hover:underline font-semibold px-1"
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Ou informe a URL / Caminho da Imagem:
                    </label>
                    <input
                      type="text"
                      value={settingsForm.banner_image_url || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, banner_image_url: e.target.value })}
                      placeholder="Ex: /uploads/meu-banner.png ou https://..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              {(settingsForm.banner_mode === 'TEXT' || settingsForm.banner_mode === 'BOTH') && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Texto do Banner
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2 rounded-t-xl border border-b-0 border-slate-300">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-slate-600 px-1.5 flex items-center gap-1">
                        <Type className="w-3.5 h-3.5" /> Formatação:
                      </span>
                      <button
                        type="button"
                        onClick={() => setSettingsForm({ ...settingsForm, banner_bold: settingsForm.banner_bold ? 0 : 1 })}
                        className={`p-1.5 rounded ${
                          settingsForm.banner_bold ? 'bg-slate-900 text-amber-400' : 'hover:bg-slate-200 text-slate-700'
                        }`}
                        title="Negrito"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettingsForm({ ...settingsForm, banner_italic: settingsForm.banner_italic ? 0 : 1 })}
                        className={`p-1.5 rounded ${
                          settingsForm.banner_italic ? 'bg-slate-900 text-amber-400' : 'hover:bg-slate-200 text-slate-700'
                        }`}
                        title="Itálico"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettingsForm({ ...settingsForm, banner_underline: settingsForm.banner_underline ? 0 : 1 })}
                        className={`p-1.5 rounded ${
                          settingsForm.banner_underline ? 'bg-slate-900 text-amber-400' : 'hover:bg-slate-200 text-slate-700'
                        }`}
                        title="Sublinhado"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <div className="h-4 w-px bg-slate-300 mx-1" />
                      {['LEFT', 'CENTER', 'RIGHT'].map((al) => {
                        const Icon = al === 'LEFT' ? AlignLeft : al === 'RIGHT' ? AlignRight : AlignCenter;
                        return (
                          <button
                            key={al}
                            type="button"
                            onClick={() => setSettingsForm({ ...settingsForm, banner_text_align: al })}
                            className={`p-1.5 rounded ${
                              (settingsForm.banner_text_align || 'CENTER') === al
                                ? 'bg-slate-900 text-amber-400'
                                : 'hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={settingsForm.banner_font_size || 'MEDIUM'}
                        onChange={(e) => setSettingsForm({ ...settingsForm, banner_font_size: e.target.value })}
                        className="px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-bold text-slate-700"
                      >
                        <option value="SMALL">Fonte Pequena</option>
                        <option value="MEDIUM">Fonte Média</option>
                        <option value="LARGE">Fonte Grande</option>
                      </select>
                      <input
                        type="color"
                        value={settingsForm.banner_color || '#0f172a'}
                        onChange={(e) => setSettingsForm({ ...settingsForm, banner_color: e.target.value })}
                        className="w-6 h-6 rounded border border-slate-300 cursor-pointer"
                        title="Cor do texto"
                      />
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={settingsForm.banner_text || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, banner_text: e.target.value })}
                    style={{
                      textAlign:
                        settingsForm.banner_text_align === 'LEFT'
                          ? 'left'
                          : settingsForm.banner_text_align === 'RIGHT'
                          ? 'right'
                          : 'center',
                      fontWeight: settingsForm.banner_bold ? '700' : '400',
                      fontStyle: settingsForm.banner_italic ? 'italic' : 'normal',
                      textDecoration: settingsForm.banner_underline ? 'underline' : 'none',
                      color: settingsForm.banner_color || '#0f172a'
                    }}
                    className="w-full px-3 py-2 rounded-b-xl border border-slate-300 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
                Linha de Cabeçalho da Obra (Logo Abaixo da Linha Divisória)
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Texto da Linha Subheader (Deixe em branco para automático)
                </label>
                <input
                  type="text"
                  value={settingsForm.subheader_text || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, subheader_text: e.target.value })}
                  placeholder="Ex: OBRA: PR-317 LOTE 01 | LOCAL: MARINGÁ-PR | PERÍODO: OUTUBRO/2026"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Quando deixado em branco, o sistema preenche dinamicamente com o nome da obra, cidade/UF e período filtrado.
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-800 block">Prévia da Linha:</span>
                <div className="bg-white p-3 rounded-lg border border-slate-300 text-center font-bold text-xs text-slate-800 shadow-xs">
                  {settingsForm.subheader_text ||
                    'OBRA: PR-317 DUPLICAÇÃO | LOCAL: MARINGÁ/PR | PERÍODO: SETEMBRO/2026'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-sm transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Layout de Relatórios'}
            </button>
          </div>
        </form>
      )}

      {/* =========================================================================
          TAB 3: CAMPOS PERSONALIZÁVEIS DE OCORRÊNCIAS
         ========================================================================= */}
      {activeTab === 'OCCURRENCE_FIELDS' && (
        <div className="bg-white p-6 rounded-b-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {PARAM_GROUPS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => {
                    setActiveParamGroup(g.key);
                    setEditingParam(null);
                    setParamLabelInput('');
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    activeParamGroup === g.key
                      ? 'bg-[#1e3a5f] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleResetOccurrenceDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restaurar Padrões
            </button>
          </div>

          {/* Add / Edit Option Form */}
          <form onSubmit={handleCreateOrUpdateParam} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {editingParam ? 'Editar Opção' : 'Nova Opção para ' + PARAM_GROUPS.find((g) => g.key === activeParamGroup)?.label}
              </label>
              <input
                type="text"
                value={paramLabelInput}
                onChange={(e) => setParamLabelInput(e.target.value)}
                placeholder="Ex: Instalações Elétricas, Crítica, etc..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cor / Badge</label>
              <select
                value={paramColorInput}
                onChange={(e) => setParamColorInput(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white font-medium"
              >
                <option value="blue">Azul</option>
                <option value="emerald">Verde</option>
                <option value="amber">Amarelo / Laranja</option>
                <option value="rose">Vermelho / Rosa</option>
                <option value="purple">Roxo</option>
                <option value="slate">Cinza</option>
              </select>
            </div>

            {activeParamGroup === 'SEVERITY' && (
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={paramCriticalInput}
                  onChange={(e) => setParamCriticalInput(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500"
                />
                Marcar como Severidade Crítica
              </label>
            )}

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs transition"
            >
              {editingParam ? 'Atualizar Opção' : 'Adicionar Opção'}
            </button>

            {editingParam && (
              <button
                type="button"
                onClick={() => {
                  setEditingParam(null);
                  setParamLabelInput('');
                }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-100"
              >
                Cancelar
              </button>
            )}
          </form>

          {/* List of current options */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-left">Nome da Opção</th>
                  <th className="py-2.5 px-3 text-center">Código Interno</th>
                  <th className="py-2.5 px-3 text-center">Amostra Visual</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredParams.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      Nenhuma opção personalizada cadastrada neste grupo.
                    </td>
                  </tr>
                ) : (
                  filteredParams.map((param) => (
                    <tr key={param.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{param.label}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500">{param.code}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border bg-${param.color}-100 text-${param.color}-800 border-${param.color}-300`}>
                          {param.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingParam(param);
                              setParamLabelInput(param.label);
                              setParamColorInput(param.color || 'blue');
                              setParamCriticalInput(Boolean(param.is_critical));
                            }}
                            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteParam(param.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

