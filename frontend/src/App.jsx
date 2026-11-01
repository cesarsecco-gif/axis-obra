import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Camera,
  ClipboardList,
  AlertTriangle,
  HardHat,
  Wrench,
  Building2,
  CloudRain,
  Settings,
  LogOut,
  UserCheck,
  Shield,
  ChevronRight,
  Menu,
  X,
  Lock,
  CheckCircle2
} from 'lucide-react';
import {
  apiRequest,
  getStoredUser,
  setAuthSession,
  clearAuthSession
} from './api';
import DashboardView from './components/DashboardView';
import PhotosView from './components/PhotosView';
import RdoView from './components/RdoView';
import OccurrencesView from './components/OccurrencesView';
import EmployeesView from './components/EmployeesView';
import EquipmentsView from './components/EquipmentsView';
import ProjectsUsersView from './components/ProjectsUsersView';
import PluviometryView from './components/PluviometryView';
import SettingsView from './components/SettingsView';

const NAV_ITEMS = [
  { id: 'DASHBOARD', label: 'Painel Consolidado', icon: LayoutDashboard, badge: null },
  { id: 'PHOTOS', label: '1. Registro Fotográfico', icon: Camera, badge: 'Módulo 1' },
  { id: 'RDO', label: '2. Diário de Obras (RDO)', icon: ClipboardList, badge: 'Módulo 2' },
  { id: 'OCCURRENCES', label: '3. Registro de Ocorrências', icon: AlertTriangle, badge: 'Módulo 3' },
  { id: 'EMPLOYEES', label: '4. Cadastro de Funcionários', icon: HardHat, badge: 'Módulo 4' },
  { id: 'EQUIPMENTS', label: '5. Cadastro de Equipamentos', icon: Wrench, badge: 'Módulo 5' },
  { id: 'PROJECTS', label: '6. Obras por Usuário', icon: Building2, badge: 'Módulo 6' },
  { id: 'PLUVIOMETRY', label: '7. Registro de Pluviometria', icon: CloudRain, badge: 'Módulo 7' },
  { id: 'SETTINGS', label: '8. Configurações do Sistema', icon: Settings, badge: 'Ajustes' }
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [demoUsers, setDemoUsers] = useState([]);
  const [activeNav, setActiveNav] = useState('DASHBOARD');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [dashboardData, setDashboardData] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('admin@axisobra.com.br');
  const [loginPassword, setLoginPassword] = useState('123456');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const loadDemoUsers = useCallback(async () => {
    try {
      const list = await apiRequest('/api/auth/demo-users');
      setDemoUsers(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadWorkspaceData = useCallback(
    async (projectIdOverride) => {
      if (!currentUser) return;
      try {
        const targetProj = projectIdOverride !== undefined ? projectIdOverride : selectedProjectId;
        const [projList, dash] = await Promise.all([
          apiRequest('/api/projects'),
          apiRequest(`/api/dashboard?projectId=${targetProj}`)
        ]);
        setProjects(projList);
        setDashboardData(dash);

        // If selectedProjectId is no longer accessible after switching user, reset to ALL
        if (
          targetProj !== 'ALL' &&
          !projList.some((p) => String(p.id) === String(targetProj))
        ) {
          setSelectedProjectId('ALL');
        }
      } catch (err) {
        console.error(err);
      }
    },
    [currentUser, selectedProjectId]
  );

  useEffect(() => {
    loadDemoUsers();
  }, [loadDemoUsers]);

  useEffect(() => {
    if (currentUser) {
      loadWorkspaceData();
    }
  }, [currentUser, selectedProjectId, loadWorkspaceData]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      setAuthSession(res.token, res.user);
      setCurrentUser(res.user);
      setSelectedProjectId('ALL');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleQuickSwitchUser = async (userId) => {
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId: Number(userId) })
      });
      setAuthSession(res.token, res.user);
      setSelectedProjectId('ALL');
      setCurrentUser(res.user);
      await loadDemoUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    setCurrentUser(null);
    setDashboardData(null);
    setProjects([]);
  };

  // ==========================================================================
  // LOGIN SCREEN (WITH 1-CLICK PROFILE DEMO & RBAC PREVIEW)
  // ==========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col lg:flex-row">
        {/* Left Branding & Features Column */}
        <div className="lg:w-7/12 p-8 lg:p-14 flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800">
          <div>
            <div className="inline-flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-amber-500/20">
                AX
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white">AXIS OBRA</h1>
                <p className="text-xs font-medium text-amber-400 uppercase tracking-widest">
                  Sistema Integrado de Engenharia e Gestão de Obras
                </p>
              </div>
            </div>

            <h2 className="text-3xl lg:text-4xl font-extrabold mt-10 leading-tight text-white">
              Controle completo do canteiro de obras em uma única plataforma.
            </h2>
            <p className="text-slate-400 mt-3 text-sm lg:text-base max-w-2xl">
              Gerencie múltiplas obras com permissões individualizadas por usuário, diário fotográfico técnico, livro de ocorrências, controle de efetivo, maquinário e boletim pluviométrico.
            </p>

            {/* 6 Modules Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-8">
              {[
                { num: '01', title: 'Registro Fotográfico', desc: 'Galeria por etapa construtiva com carimbo técnico' },
                { num: '02', title: 'Registro de Ocorrências', desc: 'Não conformidades, severidade e plano de ação' },
                { num: '03', title: 'Cadastro de Funcionários', desc: 'Efetivo CLT e terceiros, funções, ASO e NRs' },
                { num: '04', title: 'Cadastro de Equipamentos', desc: 'Patrimônio, locação, custos e manutenção preventiva' },
                { num: '05', title: 'Obras por Usuário (RBAC)', desc: 'Vínculo seletivo de obras por Engenheiro/Encarregado' },
                { num: '06', title: 'Registro de Pluviometria', desc: 'Medição em mm, turnos Manhã/Tarde/Noite e paralisações' }
              ].map((m) => (
                <div
                  key={m.num}
                  className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-3"
                >
                  <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-400 font-mono text-xs font-bold border border-amber-500/30">
                    {m.num}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{m.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>AXIS OBRA v1.0 • Arquitetura Full-Stack (Node.js/Express + SQLite + React)</span>
            <span>Conformidade ABNT NBR / NR-18 / RDO Digital</span>
          </div>
        </div>

        {/* Right Login & Quick Role Selector Column */}
        <div className="lg:w-5/12 p-8 lg:p-12 flex flex-col justify-center bg-slate-950">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Acessar o Sistema</h2>
              <p className="text-xs text-slate-400 mt-1">
                Entre com suas credenciais ou escolha um perfil abaixo para testar o controle de acesso por obra:
              </p>
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-medium">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail Corporativo</label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Senha (padrão: 123456)</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:border-amber-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loggingIn}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/10 transition"
              >
                {loggingIn ? 'Autenticando...' : 'Entrar no AXIS OBRA'}
              </button>
            </form>

            {/* Quick 1-Click Profile Access */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Shield className="w-4 h-4" />
                Acesso Rápido por Perfil (Demonstração de Vínculo de Obras)
              </div>
              <div className="space-y-2">
                {demoUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickSwitchUser(u.id)}
                    className="w-full text-left p-3 rounded-xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/60 transition flex items-center justify-between group"
                  >
                    <div className="pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white group-hover:text-amber-400 transition">
                          {u.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'ADMIN'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {u.role === 'ADMIN'
                          ? 'Acesso a todas as 3 obras cadastradas'
                          : `Obras vinculadas: ${(u.projects || []).map((p) => p.code).join(', ') || 'Nenhuma'}`}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // MAIN AUTHENTICATED WORKSPACE
  // ==========================================================================
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:w-72 lg:flex-col bg-slate-950 text-white shrink-0 border-r border-slate-800">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black text-lg">
            AX
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tight leading-none">AXIS OBRA</h1>
            <span className="text-[11px] text-amber-400 font-semibold">Gestão de Engenharia</span>
          </div>
        </div>

        {/* User Badge */}
        <div className="p-4 mx-3 mt-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {currentUser.role}
            </span>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Online
            </span>
          </div>
          <p className="font-bold text-sm text-white mt-2 truncate">{currentUser.name}</p>
          <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
          <p className="text-[11px] text-amber-400/90 mt-1.5 font-medium">
            {currentUser.role === 'ADMIN'
              ? `Acesso Global (${projects.length} obras)`
              : `${projects.length} obra(s) vinculada(s) ao usuário`}
          </p>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      active ? 'bg-slate-950/15 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-rose-600 text-slate-300 hover:text-white text-xs font-semibold transition border border-slate-800"
          >
            <LogOut className="w-4 h-4" />
            Encerrar Sessão
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar with Active Project Filter & Quick Profile Switcher */}
        <header className="bg-white border-b border-slate-200 px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 sticky top-0 z-30 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
            {/* Top Row on Mobile: Menu Button + Brand + User Switcher */}
            <div className="flex items-center justify-between gap-2 lg:hidden">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="p-2 rounded-xl bg-slate-900 text-amber-400 hover:bg-slate-800 shadow-2xs transition"
                  aria-label="Abrir Menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black text-sm">
                    AX
                  </div>
                  <div>
                    <h1 className="font-black text-sm tracking-tight text-slate-900 leading-none">
                      AXIS OBRA
                    </h1>
                    <span className="text-[10px] text-amber-600 font-bold block mt-0.5">
                      {NAV_ITEMS.find((i) => i.id === activeNav)?.label || 'Painel'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile User Switcher */}
              <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 max-w-[170px] sm:max-w-xs">
                <UserCheck className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <select
                  value={currentUser.id}
                  onChange={(e) => handleQuickSwitchUser(e.target.value)}
                  className="text-[11px] font-bold text-slate-900 bg-transparent outline-none truncate w-full"
                >
                  {demoUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} [{u.role}]
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Project Filter Selector (Full width on mobile, auto on desktop) */}
            <div className="flex-1 min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 hidden sm:block">
                Filtro Global de Obra (Baseado nas Permissões do Usuário)
              </span>
              <div className="flex items-center gap-2 sm:mt-0.5">
                <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full md:w-auto max-w-full truncate font-bold text-xs sm:text-sm text-slate-900 bg-amber-50/70 border border-amber-300 rounded-lg px-2.5 sm:px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="ALL">
                    Todas as Minhas Obras Vinculadas ({projects.length})
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.code} — {p.name} ({p.city}/{p.state})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Desktop Quick User Switcher */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <UserCheck className="w-4 h-4 text-slate-600 shrink-0" />
                <span className="text-xs font-semibold text-slate-600">Alternar Usuário:</span>
                <select
                  value={currentUser.id}
                  onChange={(e) => handleQuickSwitchUser(e.target.value)}
                  className="text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 outline-none"
                >
                  {demoUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} [{u.role}]
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>

        {/* Slide-Over Mobile & Tablet Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Drawer Panel */}
            <div className="relative w-80 max-w-[85vw] bg-slate-950 text-white h-full flex flex-col justify-between z-10 shadow-2xl overflow-y-auto">
              <div>
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black text-base">
                      AX
                    </div>
                    <div>
                      <h2 className="font-black text-base tracking-tight leading-none">AXIS OBRA</h2>
                      <span className="text-[11px] text-amber-400 font-semibold">Gestão de Engenharia</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* User Card in Mobile Drawer */}
                <div className="p-3.5 mx-3 mt-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {currentUser.role}
                    </span>
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Online
                    </span>
                  </div>
                  <p className="font-bold text-sm text-white mt-1.5 truncate">{currentUser.name}</p>
                  <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
                  <p className="text-[11px] text-amber-400/90 mt-1 font-medium">
                    {currentUser.role === 'ADMIN'
                      ? `Acesso Global (${projects.length} obras)`
                      : `${projects.length} obra(s) vinculada(s)`}
                  </p>
                </div>

                {/* Navigation Links */}
                <nav className="px-3 py-3 space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activeNav === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveNav(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
                          active
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-3 truncate">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ml-1 ${
                              active ? 'bg-slate-950/15 text-slate-950' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="p-4 border-t border-slate-800">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-rose-600 text-slate-300 hover:text-white text-xs font-bold transition border border-slate-800"
                >
                  <LogOut className="w-4 h-4" />
                  Encerrar Sessão
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Body */}
        <main className="flex-1 p-3 sm:p-5 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto min-w-0">
          {activeNav === 'DASHBOARD' && (
            <DashboardView
              dashboard={dashboardData}
              currentUser={currentUser}
              onNavigate={(nav) => setActiveNav(nav)}
              onSelectProject={(pid) => setSelectedProjectId(pid)}
            />
          )}

          {activeNav === 'PHOTOS' && (
            <PhotosView
              projects={projects}
              selectedProjectId={selectedProjectId}
              onRefreshDashboard={() => loadWorkspaceData()}
            />
          )}

          {activeNav === 'RDO' && (
            <RdoView
              projects={projects}
              selectedProjectId={selectedProjectId}
              currentUser={currentUser}
            />
          )}

          {activeNav === 'OCCURRENCES' && (
            <OccurrencesView
              projects={projects}
              selectedProjectId={selectedProjectId}
              currentUser={currentUser}
              onRefreshDashboard={() => loadWorkspaceData()}
            />
          )}

          {activeNav === 'EMPLOYEES' && (
            <EmployeesView
              projects={projects}
              selectedProjectId={selectedProjectId}
              onRefreshDashboard={() => loadWorkspaceData()}
            />
          )}

          {activeNav === 'EQUIPMENTS' && (
            <EquipmentsView
              projects={projects}
              selectedProjectId={selectedProjectId}
              onRefreshDashboard={() => loadWorkspaceData()}
            />
          )}

          {activeNav === 'PROJECTS' && (
            <ProjectsUsersView
              currentUser={currentUser}
              onProjectsUpdated={() => {
                loadWorkspaceData();
                loadDemoUsers();
              }}
              onSwitchUser={(uid) => handleQuickSwitchUser(uid)}
            />
          )}

          {activeNav === 'PLUVIOMETRY' && (
            <PluviometryView
              projects={projects}
              selectedProjectId={selectedProjectId}
              onRefreshDashboard={() => loadWorkspaceData()}
            />
          )}

          {activeNav === 'SETTINGS' && (
            <SettingsView
              projects={projects}
              selectedProjectId={selectedProjectId}
              currentUser={currentUser}
            />
          )}
        </main>

        {/* Mobile & Tablet Fixed Bottom Quick-Access Bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl">
          {[
            { id: 'DASHBOARD', label: 'Painel', icon: LayoutDashboard },
            { id: 'PHOTOS', label: 'Fotos', icon: Camera },
            { id: 'RDO', label: 'RDO', icon: ClipboardList },
            { id: 'PLUVIOMETRY', label: 'Chuvas', icon: CloudRain }
          ].map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition ${
                  active ? 'text-amber-400 font-extrabold' : 'text-slate-400 hover:text-white font-medium'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] mt-0.5">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-slate-300 hover:text-amber-400 font-medium transition"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Módulos</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

