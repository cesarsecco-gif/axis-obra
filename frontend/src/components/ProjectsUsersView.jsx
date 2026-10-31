import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  Plus,
  Edit3,
  Shield,
  MapPin,
  Calendar,
  Check,
  X,
  UserPlus,
  LogIn,
  Lock,
  Briefcase
} from 'lucide-react';
import { apiRequest, formatCurrency, formatDateBR } from '../api';

const PROJECT_STATUSES = {
  PLANEJAMENTO: { label: 'Em Planejamento', badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  EM_ANDAMENTO: { label: 'Em Execução', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  PAUSADA: { label: 'Paralisada / Pausada', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  CONCLUIDA: { label: 'Concluída / Entregue', badge: 'bg-slate-200 text-slate-800 border-slate-300' }
};

const ROLE_LABELS = {
  ADMIN: { label: 'Administrador Geral (Acesso Total)', badge: 'bg-amber-500 text-slate-950 font-bold' },
  ENGENHEIRO: { label: 'Engenheiro Civil / Residente', badge: 'bg-indigo-100 text-indigo-800 font-semibold' },
  ENCARREGADO: { label: 'Mestre de Obras / Encarregado', badge: 'bg-emerald-100 text-emerald-800 font-semibold' },
  FISCAL: { label: 'Fiscal de Obra / Cliente', badge: 'bg-purple-100 text-purple-800 font-semibold' }
};

export default function ProjectsUsersView({
  currentUser,
  onProjectsUpdated,
  onSwitchUser
}) {
  const [activeTab, setActiveTab] = useState('PROJECTS'); // 'PROJECTS' | 'USERS_MATRIX'
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser?.role === 'ADMIN';

  const initialProjectForm = {
    code: '',
    name: '',
    client: '',
    address: '',
    city: 'São Paulo',
    state: 'SP',
    start_date: '2026-02-01',
    expected_end_date: '2027-06-30',
    status: 'EM_ANDAMENTO',
    progress: 15,
    budget: 12000000,
    area_m2: 6500,
    description: '',
    assignedUserIds: []
  };

  const [projectForm, setProjectForm] = useState(initialProjectForm);

  const initialUserForm = {
    name: '',
    email: '',
    password: '123456',
    role: 'ENGENHEIRO',
    crea_cft: '',
    phone: '',
    role_in_project: 'Engenheiro Residente',
    projectIds: []
  };

  const [userForm, setUserForm] = useState(initialUserForm);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projData, usersData] = await Promise.all([
        apiRequest('/api/projects'),
        apiRequest('/api/users')
      ]);
      setProjects(projData);
      setUsers(usersData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.id]);

  const openCreateProject = () => {
    setEditingProject(null);
    setError('');
    setProjectForm({
      ...initialProjectForm,
      code: `OBR-2026-00${projects.length + 1}`
    });
    setShowProjectModal(true);
  };

  const openEditProject = (proj) => {
    setEditingProject(proj);
    setError('');
    setProjectForm({
      code: proj.code,
      name: proj.name,
      client: proj.client,
      address: proj.address,
      city: proj.city,
      state: proj.state,
      start_date: proj.start_date || '',
      expected_end_date: proj.expected_end_date || '',
      status: proj.status || 'EM_ANDAMENTO',
      progress: proj.progress || 0,
      budget: proj.budget || 0,
      area_m2: proj.area_m2 || 0,
      description: proj.description || '',
      assignedUserIds: (proj.assignedUsers || []).map((u) => u.id)
    });
    setShowProjectModal(true);
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingProject) {
        await apiRequest(`/api/projects/${editingProject.id}`, {
          method: 'PUT',
          body: JSON.stringify(projectForm)
        });
      } else {
        await apiRequest('/api/projects', {
          method: 'POST',
          body: JSON.stringify(projectForm)
        });
      }
      setShowProjectModal(false);
      await loadData();
      if (onProjectsUpdated) onProjectsUpdated();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify(userForm)
      });
      setShowUserModal(false);
      setUserForm(initialUserForm);
      await loadData();
      if (onProjectsUpdated) onProjectsUpdated();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleUserProject = async (projectId, user, isCurrentlyAssigned) => {
    if (!isAdmin) {
      alert('Apenas usuários com perfil ADMIN podem alterar vínculos de acesso às obras.');
      return;
    }
    try {
      if (isCurrentlyAssigned) {
        await apiRequest(`/api/projects/${projectId}/users/${user.id}`, {
          method: 'DELETE'
        });
      } else {
        await apiRequest(`/api/projects/${projectId}/users`, {
          method: 'POST',
          body: JSON.stringify({
            user_id: user.id,
            role_in_project: user.role === 'ENCARREGADO' ? 'Mestre / Encarregado' : 'Engenheiro Responsável',
            can_edit: 1
          })
        });
      }
      await loadData();
      if (onProjectsUpdated) onProjectsUpdated();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <Building2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">5. Gerenciamento de Obras por Usuário e Permissões</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Controle de obras ativas, progresso físico e matriz de vínculo de acesso por usuário (Admin vs Engenheiros/Encarregados).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setActiveTab('PROJECTS')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition ${
                activeTab === 'PROJECTS'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Obras Vinculadas ({projects.length})
            </button>
            <button
              onClick={() => setActiveTab('USERS_MATRIX')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition ${
                activeTab === 'USERS_MATRIX'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matriz de Acesso por Usuário ({users.length})
            </button>
          </div>

          {isAdmin && (
            <>
              <button
                onClick={openCreateProject}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                Nova Obra
              </button>
              <button
                onClick={() => {
                  setError('');
                  setShowUserModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition"
              >
                <UserPlus className="w-4 h-4" />
                Novo Usuário
              </button>
            </>
          )}
        </div>
      </div>

      {/* Permission Banner for Non-Admin */}
      {!isAdmin && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-900 leading-relaxed">
            <strong>Modo de Acesso Restrito por Obra Ativo:</strong> Você está autenticado como{' '}
            <strong>{currentUser.name}</strong> ({currentUser.role}). Você visualiza e opera exclusivamente nas{' '}
            <strong>{projects.length} obra(s)</strong> às quais foi vinculado pela Administração. Para gerenciar todas as
            obras ou alterar permissões, alterne para o perfil <strong>Administrador</strong> no topo da página.
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500">
          Carregando obras e vínculos de usuários...
        </div>
      ) : activeTab === 'PROJECTS' ? (
        /* TAB 1: PROJECTS CARDS + LINKED USERS */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {projects.map((proj) => {
            const st = PROJECT_STATUSES[proj.status] || PROJECT_STATUSES.EM_ANDAMENTO;
            return (
              <div
                key={proj.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded bg-slate-900 text-amber-400 font-mono text-xs font-bold">
                          {proj.code}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${st.badge}`}>
                          {st.label}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mt-1.5">{proj.name}</h3>
                      <p className="text-xs font-medium text-slate-500">Cliente: {proj.client}</p>
                    </div>

                    <button
                      onClick={() => openEditProject(proj)}
                      className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                      title="Editar dados e avanço físico da obra"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>

                  {proj.description && (
                    <p className="text-xs text-slate-600 leading-relaxed">{proj.description}</p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block">Orçamento Previsto</span>
                      <strong className="text-slate-800">{formatCurrency(proj.budget)}</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block">Área Construída</span>
                      <strong className="text-slate-800">{proj.area_m2 || 0} m²</strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 col-span-2 sm:col-span-1">
                      <span className="text-slate-400 block">Efetivo / Equip.</span>
                      <strong className="text-slate-800">
                        {proj.employeesCount || 0} func • {proj.equipmentsCount || 0} eqp
                      </strong>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Avanço Físico Acumulado</span>
                      <span className="font-bold text-amber-600">{proj.progress}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, proj.progress || 0))}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {proj.address} — {proj.city}/{proj.state}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Prazo: {formatDateBR(proj.start_date)} até {formatDateBR(proj.expected_end_date)}
                    </span>
                  </div>
                </div>

                {/* Linked Users Section */}
                <div className="pt-4 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-600" />
                      Usuários com Acesso a esta Obra ({(proj.assignedUsers || []).length})
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => setActiveTab('USERS_MATRIX')}
                        className="text-xs font-semibold text-amber-600 hover:text-amber-700 underline"
                      >
                        Gerenciar Permissões
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(proj.assignedUsers || []).map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-slate-100 text-slate-800 border border-slate-200"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-semibold">{u.name}</span>
                        <span className="text-[11px] text-slate-500">({u.role_in_project || u.role})</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TAB 2: USER-PROJECT ACCESS MATRIX */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                Matriz de Permissões: Obras Vinculadas por Usuário
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdmin
                  ? 'Clique nos botões das obras abaixo para vincular ou desvincular o acesso de cada Engenheiro/Encarregado instantaneamente.'
                  : 'Visualização dos usuários e suas respectivas obras vinculadas.'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Usuário / Credencial</th>
                  <th className="py-3.5 px-4">Perfil de Acesso</th>
                  <th className="py-3.5 px-4">Obras Vinculadas (Clique para Ativar/Desativar Vínculo)</th>
                  <th className="py-3.5 px-4 text-right">Testar Perfil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {users.map((u) => {
                  const roleInfo = ROLE_LABELS[u.role] || ROLE_LABELS.ENGENHEIRO;
                  const userProjIds = (u.projects || []).map((p) => Number(p.id));
                  const isCurrent = Number(u.id) === Number(currentUser?.id);

                  return (
                    <tr key={u.id} className={isCurrent ? 'bg-amber-50/40' : 'hover:bg-slate-50'}>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{u.name}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                              VOCÊ
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {u.email} {u.crea_cft ? `• ${u.crea_cft}` : ''}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-xs ${roleInfo.badge}`}>
                          {roleInfo.label}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        {u.role === 'ADMIN' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                            <Check className="w-4 h-4 text-amber-600" />
                            Acesso Irrestrito a Todas as Obras do Sistema
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {projects.map((proj) => {
                              const assigned = userProjIds.includes(Number(proj.id));
                              return (
                                <button
                                  key={proj.id}
                                  type="button"
                                  disabled={!isAdmin}
                                  onClick={() => handleToggleUserProject(proj.id, u, assigned)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                    assigned
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                                  } ${!isAdmin ? 'cursor-default' : 'cursor-pointer'}`}
                                  title={
                                    isAdmin
                                      ? assigned
                                        ? 'Clique para remover acesso a esta obra'
                                        : 'Clique para conceder acesso a esta obra'
                                      : ''
                                  }
                                >
                                  {assigned ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <X className="w-3.5 h-3.5 text-slate-300" />
                                  )}
                                  <span>
                                    {proj.code} — {proj.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-4 text-right">
                        {!isCurrent && onSwitchUser && (
                          <button
                            onClick={() => onSwitchUser(u.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-amber-500 text-white hover:text-slate-950 text-xs font-semibold transition"
                            title="Alternar sessão para visualizar o sistema com as permissões deste usuário"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            Simular Acesso
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Project */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editingProject ? 'Editar Dados da Obra' : 'Cadastrar Nova Obra'}
              </h3>
              <button onClick={() => setShowProjectModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveProject} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código da Obra *</label>
                  <input
                    type="text"
                    required
                    value={projectForm.code}
                    onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Empreendimento / Obra *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Edifício Comercial Paulista Corporate"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cliente / Contratante *</label>
                  <input
                    type="text"
                    required
                    value={projectForm.client}
                    onChange={(e) => setProjectForm({ ...projectForm, client: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status da Obra</label>
                  <select
                    value={projectForm.status}
                    onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="PLANEJAMENTO">Em Planejamento</option>
                    <option value="EM_ANDAMENTO">Em Execução</option>
                    <option value="PAUSADA">Paralisada / Pausada</option>
                    <option value="CONCLUIDA">Concluída</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço do Canteiro *</label>
                  <input
                    type="text"
                    required
                    value={projectForm.address}
                    onChange={(e) => setProjectForm({ ...projectForm, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cidade *</label>
                  <input
                    type="text"
                    required
                    value={projectForm.city}
                    onChange={(e) => setProjectForm({ ...projectForm, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">UF *</label>
                  <input
                    type="text"
                    maxLength={2}
                    required
                    value={projectForm.state}
                    onChange={(e) => setProjectForm({ ...projectForm, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={projectForm.start_date}
                    onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Previsão Término</label>
                  <input
                    type="date"
                    value={projectForm.expected_end_date}
                    onChange={(e) => setProjectForm({ ...projectForm, expected_end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Avanço Físico (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={projectForm.progress}
                    onChange={(e) => setProjectForm({ ...projectForm, progress: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Área (m²)</label>
                  <input
                    type="number"
                    value={projectForm.area_m2}
                    onChange={(e) => setProjectForm({ ...projectForm, area_m2: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Orçamento Total Previsto (R$)</label>
                <input
                  type="number"
                  step="1000"
                  value={projectForm.budget}
                  onChange={(e) => setProjectForm({ ...projectForm, budget: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Escopo / Memorial Resumido</label>
                <textarea
                  rows={2}
                  value={projectForm.description}
                  onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              {!editingProject && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Vincular Usuários Responsáveis a esta Obra:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {users
                      .filter((u) => u.role !== 'ADMIN')
                      .map((u) => {
                        const checked = projectForm.assignedUserIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              const next = checked
                                ? projectForm.assignedUserIds.filter((id) => id !== u.id)
                                : [...projectForm.assignedUserIds, u.id];
                              setProjectForm({ ...projectForm, assignedUserIds: next });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              checked
                                ? 'bg-amber-500 text-slate-950 border-amber-500'
                                : 'bg-slate-50 text-slate-700 border-slate-300'
                            }`}
                          >
                            {u.name} ({u.role})
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm"
                >
                  {editingProject ? 'Salvar Alterações' : 'Cadastrar Obra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create User */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Cadastrar Novo Usuário e Vincular Obras</h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Eng. Fernanda Martins"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail de Acesso *</label>
                  <input
                    type="email"
                    required
                    placeholder="fernanda@axisobra.com.br"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Perfil de Acesso *</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="ENGENHEIRO">Engenheiro (Vê Obras Vinculadas)</option>
                    <option value="ENCARREGADO">Mestre / Encarregado (Vê Obras Vinculadas)</option>
                    <option value="FISCAL">Fiscal / Cliente (Vê Obras Vinculadas)</option>
                    <option value="ADMIN">Administrador Geral (Vê Todas as Obras)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Registro CREA / CFT</label>
                  <input
                    type="text"
                    placeholder="CREA-SP 506000000"
                    value={userForm.crea_cft}
                    onChange={(e) => setUserForm({ ...userForm, crea_cft: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-0000"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              {userForm.role !== 'ADMIN' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Selecione as Obras que este Usuário poderá gerenciar:
                  </label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 rounded-lg border border-slate-200 bg-slate-50">
                    {projects.map((p) => {
                      const checked = userForm.projectIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2.5 p-1.5 rounded hover:bg-white cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? userForm.projectIds.filter((id) => id !== p.id)
                                : [...userForm.projectIds, p.id];
                              setUserForm({ ...userForm, projectIds: next });
                            }}
                            className="rounded text-amber-500 focus:ring-amber-500"
                          />
                          <span className="font-mono font-bold text-slate-700">{p.code}</span>
                          <span className="font-medium text-slate-900">{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm"
                >
                  Criar Usuário e Vincular
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

