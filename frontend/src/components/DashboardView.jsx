import React from 'react';
import {
  Building2,
  Camera,
  AlertTriangle,
  HardHat,
  Wrench,
  CloudRain,
  ArrowRight,
  Users,
  Calendar,
  MapPin,
  ShieldCheck
} from 'lucide-react';
import { formatCurrency, formatDateBR } from '../api';

export default function DashboardView({
  dashboard,
  currentUser,
  onNavigate,
  onSelectProject
}) {
  if (!dashboard) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
        Carregando indicadores gerenciais da obra...
      </div>
    );
  }

  const kpis = [
    {
      title: '5. Obras do Usuário',
      value: dashboard.projectsCount,
      subtitle: currentUser?.role === 'ADMIN' ? 'Acesso Total (Admin)' : 'Obras Vinculadas ao Perfil',
      icon: Building2,
      color: 'bg-amber-500/10 text-amber-600',
      nav: 'PROJECTS'
    },
    {
      title: '1. Registros Fotográficos',
      value: dashboard.photosCount,
      subtitle: 'Fotos técnicas de evolução',
      icon: Camera,
      color: 'bg-emerald-500/10 text-emerald-600',
      nav: 'PHOTOS'
    },
    {
      title: '2. Ocorrências Abertas',
      value: dashboard.openOccurrencesCount,
      subtitle: `${dashboard.criticalOccurrencesCount} de severidade alta/crítica`,
      icon: AlertTriangle,
      color: 'bg-rose-500/10 text-rose-600',
      nav: 'OCCURRENCES'
    },
    {
      title: '3. Efetivo de Funcionários',
      value: `${dashboard.activeEmployeesCount} / ${dashboard.employeesCount}`,
      subtitle: 'Colaboradores ativos em campo',
      icon: HardHat,
      color: 'bg-indigo-500/10 text-indigo-600',
      nav: 'EMPLOYEES'
    },
    {
      title: '4. Parque de Equipamentos',
      value: `${dashboard.operationalEquipmentsCount} / ${dashboard.equipmentsCount}`,
      subtitle: 'Máquinas em operação',
      icon: Wrench,
      color: 'bg-cyan-500/10 text-cyan-600',
      nav: 'EQUIPMENTS'
    },
    {
      title: '6. Índice Pluviométrico',
      value: `${dashboard.totalRainfallMm} mm`,
      subtitle: `${dashboard.totalHoursLostRain}h paralisadas por chuva`,
      icon: CloudRain,
      color: 'bg-sky-500/10 text-sky-600',
      nav: 'PLUVIOMETRY'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Role Access Context Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-md border border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            Perfil Ativo: {currentUser?.role} • {currentUser?.crea_cft || 'Credencial Verificada'}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            Painel de Controle — {currentUser?.name}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
            {currentUser?.role === 'ADMIN'
              ? 'Você possui privilégios de Administrador Geral e visualiza os indicadores consolidados de todas as obras cadastradas.'
              : `Seu usuário possui acesso vinculado a ${dashboard.projectsCount} obra(s). Todos os módulos abaixo exibem exclusivamente os registros das suas obras.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={() => onNavigate('PHOTOS')}
            className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
          >
            + Nova Foto de Obra
          </button>
          <button
            onClick={() => onNavigate('OCCURRENCES')}
            className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/15 transition"
          >
            + Registrar Ocorrência
          </button>
          <button
            onClick={() => onNavigate('PLUVIOMETRY')}
            className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/15 transition"
          >
            + Lançar Pluviometria
          </button>
        </div>
      </div>

      {/* 6 Core Modules KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.title}
              onClick={() => onNavigate(kpi.nav)}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-400 transition cursor-pointer group flex items-start justify-between"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-amber-600 transition">
                  {kpi.title}
                </p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpi.value}</p>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  {kpi.subtitle}
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-1 transition text-amber-600" />
                </p>
              </div>
              <div className={`p-3 rounded-xl ${kpi.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Accessible Obras Overview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Obras sob Gerenciamento do Usuário</h3>
            <p className="text-xs text-slate-500">
              Clique em uma obra para filtrar todo o sistema ou gerencie os vínculos de usuários
            </p>
          </div>
          <button
            onClick={() => onNavigate('PROJECTS')}
            className="text-xs font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
          >
            Gerenciar Obras por Usuário
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(dashboard.projectsSummary || []).map((proj) => (
            <div
              key={proj.id}
              className="rounded-xl border border-slate-200 p-4 hover:border-amber-400 transition flex flex-col justify-between bg-slate-50/50"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-400 font-mono text-xs font-bold">
                    {proj.code}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {proj.progress}% concluído
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-base">{proj.name}</h4>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {proj.city}/{proj.state} • {proj.client}
                </p>

                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${proj.progress || 0}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Efetivo Ativo</span>
                    <strong className="text-slate-800">{proj.activeEmployees} colaboradores</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Equipamentos</span>
                    <strong className="text-slate-800">{proj.equipmentsCount} alocados</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Ocorrências Abertas</span>
                    <strong className={proj.openOccurrences > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {proj.openOccurrences} pendências
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Chuva Acumulada</span>
                    <strong className="text-sky-700">{proj.totalRainfallMm} mm</strong>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {(proj.assignedUsers || []).length} usuários vinculados
                </div>
                <button
                  onClick={() => onSelectProject(String(proj.id))}
                  className="text-xs font-bold text-amber-600 hover:text-amber-800"
                >
                  Focar nesta Obra →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Split: Recent Photos + Recent Occurrences & Pluviometry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Photos */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-600" />
              Últimos Registros Fotográficos
            </h3>
            <button
              onClick={() => onNavigate('PHOTOS')}
              className="text-xs font-bold text-amber-600 hover:text-amber-700"
            >
              Ver Galeria Completa →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(dashboard.recentPhotos || []).map((photo) => (
              <div
                key={photo.id}
                onClick={() => onNavigate('PHOTOS')}
                className="group rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:border-amber-400 transition"
              >
                <div className="h-32 bg-slate-900 relative overflow-hidden">
                  <img
                    src={photo.image_url}
                    alt={photo.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-slate-950">
                    {photo.stage}
                  </span>
                </div>
                <div className="p-2.5">
                  <div className="text-xs font-bold text-slate-900 line-clamp-1">{photo.title}</div>
                  <div className="text-[11px] text-slate-500 flex items-center justify-between mt-1">
                    <span>{photo.project_code}</span>
                    <span>{formatDateBR(photo.taken_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Occurrences & Pluviometry */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Últimas Ocorrências de Campo
              </h3>
              <button
                onClick={() => onNavigate('OCCURRENCES')}
                className="text-xs font-bold text-amber-600 hover:text-amber-700"
              >
                Ver Todas →
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {(dashboard.recentOccurrences || []).slice(0, 3).map((occ) => (
                <div key={occ.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          occ.severity === 'ALTA' || occ.severity === 'CRITICA'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {occ.severity}
                      </span>
                      <span className="text-xs font-bold text-slate-900 line-clamp-1">{occ.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {occ.project_code} • {formatDateBR(occ.occurrence_date)} • Resp: {occ.responsible}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                      occ.status === 'RESOLVIDA'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {occ.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-sky-600" />
                Boletim Pluviométrico Recente
              </h3>
              <button
                onClick={() => onNavigate('PLUVIOMETRY')}
                className="text-xs font-bold text-amber-600 hover:text-amber-700"
              >
                Ver Histórico →
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {(dashboard.recentPluviometry || []).slice(0, 3).map((pl) => (
                <div key={pl.id} className="py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-slate-800">{formatDateBR(pl.record_date)}</span>
                    <span className="text-slate-500">({pl.project_code})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600">
                      M: <strong>{pl.morning_weather}</strong> / T: <strong>{pl.afternoon_weather}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold border border-sky-200">
                      {Number(pl.rainfall_mm || 0).toFixed(1)} mm
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

