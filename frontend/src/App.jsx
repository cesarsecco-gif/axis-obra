import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
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
  Menu,
  X,
  KeyRound,
  Eye,
  CheckCircle2
} from 'lucide-react';
import {
  apiRequest,
  getStoredUser,
  getStoredToken,
  getStoredImpersonator,
  setAuthSession,
  clearAuthSession,
  UNAUTHORIZED_EVENT
} from './api';
import LoginView from './components/LoginView';
import ChangePasswordModal from './components/ChangePasswordModal';
import DashboardView from './components/DashboardView';

// Módulos carregados sob demanda (reduz o tamanho do carregamento inicial)
const PhotosView = lazy(() => import('./components/PhotosView'));
const RdoView = lazy(() => import('./components/RdoView'));
const OccurrencesView = lazy(() => import('./components/OccurrencesView'));
const EmployeesView = lazy(() => import('./components/EmployeesView'));
const EquipmentsView = lazy(() => import('./components/EquipmentsView'));
const ProjectsUsersView = lazy(() => import('./components/ProjectsUsersView'));
const PluviometryView = lazy(() => import('./components/PluviometryView'));
const SettingsView = lazy(() => import('./components/SettingsView'));

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
  const [currentUser, setCurrentUser] = useState(() => (getStoredToken() ? getStoredUser() : null));
  const [impersonator, setImpersonator] = useState(() => getStoredImpersonator());
  const [activeNav, setActiveNav] = useState('DASHBOARD');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('ALL');
  const [dashboardData, setDashboardData] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

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

  const resetSessionState = useCallback(() => {
    setCurrentUser(null);
    setImpersonator(null);
    setDashboardData(null);
    setProjects([]);
    setSelectedProjectId('ALL');
    setActiveNav('DASHBOARD');
  }, []);

  // Sessão expirada em qualquer requisição -> volta para o login
  useEffect(() => {
    const onUnauthorized = () => resetSessionState();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [resetSessionState]);

  // Valida a sessão salva ao abrir o sistema e atualiza os dados do usuário
  useEffect(() => {
    if (!getStoredToken()) return;
    apiRequest('/api/auth/me')
      .then((res) => {
        setAuthSession(null, res.user, getStoredImpersonator());
        setCurrentUser(res.user);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadWorkspaceData();
    }
  }, [currentUser, selectedProjectId, loadWorkspaceData]);

  const applySession = (res, impersonatorInfo = null) => {
    setAuthSession(res.token, res.user, impersonatorInfo);
    setImpersonator(impersonatorInfo);
    setSelectedProjectId('ALL');
    setActiveNav('DASHBOARD');
    setCurrentUser(res.user);
  };

  // Administrador simula o acesso de outro usuário (somente leitura do ponto de vista de permissões)
  const handleImpersonate = async (userId) => {
    try {
      const res = await apiRequest('/api/auth/impersonate', {
        method: 'POST',
        body: JSON.stringify({ userId: Number(userId) })
      });
      applySession(res, { id: currentUser.id, name: currentUser.name });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStopImpersonation = async () => {
    try {
      const res = await apiRequest('/api/auth/stop-impersonation', { method: 'POST' });
      applySession(res, null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    resetSessionState();
  };

  if (!currentUser) {
    return <LoginView onLoggedIn={(res) => applySession(res, null)} />;
  }

  const moduleFallback = (
    <div className="p-10 text-center text-sm text-slate-500 font-semibold">Carregando módulo...</div>
  );

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

        <div className="p-4 border-t border-slate-800 space-y-2">
          {!impersonator && (
            <button
              onClick={() => setShowPasswordModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition border border-slate-800"
            >
              <KeyRound className="w-4 h-4" />
              Alterar Senha
            </button>
          )}
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

              <button
                onClick={() => setShowPasswordModal(true)}
                className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600"
                aria-label="Alterar senha"
                title="Alterar senha"
              >
                <KeyRound className="w-4 h-4" />
              </button>
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

            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <UserCheck className="w-4 h-4 text-slate-600 shrink-0" />
                <span className="text-xs font-bold text-slate-900">{currentUser.name}</span>
              </div>
            </div>
          </div>
        </header>

        {impersonator && (
          <div className="bg-amber-100 border-b border-amber-300 px-3 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <span className="flex items-center gap-2 font-semibold">
              <Eye className="w-4 h-4" />
              Simulando o acesso de {currentUser.name} ({currentUser.role}). Você vê exatamente o que este usuário vê.
            </span>
            <button
              onClick={handleStopImpersonation}
              className="px-3 py-1 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800"
            >
              Voltar para {impersonator.name}
            </button>
          </div>
        )}

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

              <div className="p-4 border-t border-slate-800 space-y-2">
                {!impersonator && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowPasswordModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition border border-slate-800"
                  >
                    <KeyRound className="w-4 h-4" />
                    Alterar Senha
                  </button>
                )}
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
          <Suspense fallback={moduleFallback}>
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
              onProjectsUpdated={() => loadWorkspaceData()}
              onSwitchUser={impersonator ? null : (uid) => handleImpersonate(uid)}
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
          </Suspense>
        </main>

        {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

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

