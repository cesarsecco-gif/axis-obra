# 📘 Documentação Oficial do Sistema — AXIS OBRA

**Sistema Integrado de Gerenciamento de Obras e Engenharia Civil**
**Versão:** 1.1.0
**Repositório Oficial:** `https://github.com/cesarsecco-gif/axis-obra`

---

## Sumário

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura e Tecnologias Utilizadas](#2-arquitetura-e-tecnologias-utilizadas)
3. [Estrutura de Diretórios do Projeto](#3-estrutura-de-diretórios-do-projeto)
4. [Acesso, Autenticação e Perfis de Usuário](#4-acesso-autenticação-e-perfis-de-usuário)
5. [Manual dos Módulos do Sistema](#5-manual-dos-módulos-do-sistema)
6. [Modelagem do Banco de Dados (SQLite)](#6-modelagem-do-banco-de-dados-sqlite)
7. [Referência da API REST (Endpoints)](#7-referência-da-api-rest-endpoints)
8. [Infraestrutura, Deploy e Variáveis de Ambiente](#8-infraestrutura-deploy-e-variáveis-de-ambiente)
9. [Testes Automatizados](#9-testes-automatizados)

---

## 1. Visão Geral do Sistema

O **AXIS OBRA** é uma plataforma web *Full-Stack* para construtoras e equipes de engenharia de campo, com foco em obras rodoviárias (padrão DER/PR). Consolida o acompanhamento diário de obras (RDO digital), o registro fotográfico, o controle de efetivo e equipamentos, a pluviometria e a gestão de ocorrências, com **acesso de cada usuário somente às obras em que atua**.

---

## 2. Arquitetura e Tecnologias Utilizadas

| Camada | Tecnologia | Descrição |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite 6 | SPA responsiva (computador, tablet e celular). Módulos carregados sob demanda. |
| **Estilização** | Tailwind CSS 3 + Lucide Icons | Visual de alto contraste para leitura em campo. |
| **Backend** | Node.js 22.5+ + Express 4 | API REST: autenticação, regras de negócio, permissões e entrega do frontend compilado. |
| **Banco de Dados** | SQLite nativo (`node:sqlite`) | Modo WAL, chaves estrangeiras ativas, migrações aditivas na inicialização. |
| **Arquivos** | Multer + disco (`backend/uploads`) | Somente imagens; servidas com `nosniff` e `Content-Security-Policy: sandbox`. |
| **Autenticação** | Token HMAC-SHA256 (7 dias) | Cabeçalho `Authorization: Bearer <token>`. Senhas com `scrypt` e salt por usuário. |
| **E-mail** | Nodemailer (SMTP) | Código de acesso e recuperação de senha. |
| **Containerização** | Docker (`node:22-alpine`) + Coolify | Imagem única que compila o frontend e executa o backend na porta `3001`. |

---

## 3. Estrutura de Diretórios do Projeto

```text
axis-obra/
├── backend/
│   ├── data/                       # axis_obra.db e .token_secret (volume persistente; fora do git)
│   ├── uploads/                    # Fotos enviadas (volume persistente; fora do git)
│   ├── src/
│   │   ├── db.js                   # Tabelas, migrações, administrador principal e dados de demonstração
│   │   ├── mailer.js               # Envio de e-mails (SMTP)
│   │   └── server.js               # Rotas da API, autenticação, permissões e regras de negócio
│   ├── test/api.test.js            # Testes automatizados da API (node:test)
│   └── package.json
├── frontend/
│   └── src/
│       ├── App.jsx                 # Layout, menu, filtro global de obra, sessão
│       ├── api.js                  # Cliente HTTP, sessão e formatadores
│       └── components/
│           ├── LoginView.jsx           # Login por senha, por código e recuperação de senha
│           ├── ChangePasswordModal.jsx # Alterar a própria senha
│           ├── EditUserModal.jsx       # Edição/desativação de usuário e nova senha (ADMIN)
│           ├── DashboardView.jsx       # Painel consolidado
│           ├── PhotosView.jsx          # Módulo 1
│           ├── PhotoReportModal.jsx    # Relatório fotográfico (PDF/Excel)
│           ├── RdoView.jsx             # Módulo 2
│           ├── OccurrencesView.jsx     # Módulo 3
│           ├── EmployeesView.jsx       # Módulo 4
│           ├── EquipmentsView.jsx      # Módulo 5
│           ├── ProjectsUsersView.jsx   # Módulo 6
│           ├── PluviometryView.jsx     # Módulo 7
│           └── SettingsView.jsx        # Módulo 8
├── deploy/github-actions-deploy.yml    # Modelo de CI/CD (copiar para .github/workflows/)
├── docs/RELATORIO_ANALISE.md           # Relatório técnico e próximos passos
├── .env.example                        # Variáveis de ambiente
├── Dockerfile / docker-compose.yml     # Imagem e orquestração com volumes
├── deploy.sh / ecosystem.config.cjs    # Deploy manual com PM2
└── README.md
```

---

## 4. Acesso, Autenticação e Perfis de Usuário

### 4.1 Formas de login
1. **E-mail e senha.**
2. **Código por e-mail:** o usuário informa o e-mail e recebe um código de 6 dígitos (válido por 10 minutos, uso único, até 5 tentativas).
3. **Esqueci minha senha:** código por e-mail + nova senha.

Proteções: limite de tentativas de login sem sucesso (por e-mail e por IP), limite de pedidos de código, resposta idêntica para e-mails cadastrados ou não, senhas com `scrypt`.

### 4.2 Administrador principal
Na inicialização o sistema garante a existência do administrador `cesarsecco@gmail.com` (configurável por `ADMIN_EMAIL`). A senha inicial (`123456`, ou `ADMIN_INITIAL_PASSWORD`) só é definida na criação — **troque-a no primeiro acesso** em *Alterar Senha*.

### 4.3 Perfis

| Perfil | Permissões |
| :--- | :--- |
| `ADMIN` | Acesso a todas as obras. Cadastra/edita/desativa usuários, define senhas, vincula obras, simula o acesso de outro usuário, baixa backup. |
| `ENGENHEIRO` | Obras vinculadas. Finaliza, reabre (com motivo) e exclui RDO. Altera configurações de relatórios e campos de ocorrência. |
| `ENCARREGADO` | Obras vinculadas. Registra fotos, ocorrências, pluviometria, efetivo, equipamentos e RDO em rascunho. |
| `FISCAL` | Obras vinculadas, **somente consulta**. |

**Simular acesso:** em *Obras por Usuário*, o Administrador pode ver o sistema exatamente como outro usuário vê. Uma faixa amarela indica a simulação e permite voltar ao Administrador.

---

## 5. Manual dos Módulos do Sistema

### 5.1 Módulo 1 — Registro Fotográfico
Upload múltiplo de fotos (JPG, PNG, WEBP, GIF até 15 MB) por etapa construtiva, local e data; edição individual; agrupamento por ano/mês/data/etapa; relatório fotográfico A4 em PDF e Excel com cabeçalho configurável.

### 5.2 Módulo 2 — Diário de Obras (RDO, padrão DER/PR)
- Calendário com marcação dos dias que têm fotos e/ou RDO; filtro rápido por mês/ano.
- Serviços do dia sugeridos a partir dos títulos das fotos; clima sugerido a partir da pluviometria.
- **Geração em lote:** dias com foto, período completo ou intervalo escolhido (transação única).
- **Número da folha** sequencial por obra, definido pelo servidor.
- **Finalização:** bloqueia a folha (não pode ser editada nem excluída). Reabertura somente por Engenheiro/Administrador, com motivo obrigatório. Histórico de criação, finalização e reabertura.
- Impressão/PDF em uma folha A4.

### 5.3 Módulo 3 — Registro de Ocorrências
Categoria, severidade, status e setor configuráveis (Módulo 8); prazo e data de resolução; fotos por fase (registro, tratativa, conclusão) reduzidas automaticamente antes do envio; histórico de mudanças de status; indicadores de SLA/lead time; relatórios por status (PDF/Excel).

### 5.4 Módulo 4 — Cadastro de Funcionários
Nome, CPF, matrícula, função, regime (CLT/terceirizado/PJ), empresa, diária, validade do ASO, certificações NR e status.

### 5.5 Módulo 5 — Cadastro de Equipamentos
TAG, nome, categoria, marca/modelo/série, próprio ou locado, locadora, custo diário, status e datas de manutenção.

### 5.6 Módulo 6 — Obras por Usuário
Cadastro de obras e matriz de acesso usuário × obra. Administrador cria usuários (senha inicial opcional), edita dados e perfil, desativa/reativa e define nova senha.

### 5.7 Módulo 7 — Registro de Pluviometria
Clima por turno, chuva em mm (total e por turno), temperaturas, impacto e horas paradas; importação de CSV do INMET; gráficos diário/mensal; quadros analíticos em PDF/Excel.

### 5.8 Módulo 8 — Configurações do Sistema
Opções dos campos de ocorrência (com restauração do padrão), dados do contrato e cabeçalhos dos relatórios, e **backup do banco de dados** (Administrador).

---

## 6. Modelagem do Banco de Dados (SQLite)

Arquivo `backend/data/axis_obra.db` — 15 tabelas, `FOREIGN KEYS = ON`. Migrações são **aditivas** (`ensure*Columns`) e rodam a cada inicialização.

| Tabela | Conteúdo |
| :--- | :--- |
| `users` | Usuários (`role`, `active`, `password_hash` no formato `scrypt$salt$hash`). |
| `projects` | Obras. |
| `project_users` | Vínculo N:N usuário × obra. |
| `employees` | Funcionários. |
| `equipments` | Equipamentos. |
| `photos` | Registro fotográfico. |
| `occurrences` | Ocorrências (+ `due_date`, `resolved_at`, `updated_at`). |
| `occurrence_photos` | Fotos das ocorrências por fase. |
| `occurrence_history` | Histórico de status das ocorrências. |
| `occurrence_params` | Opções configuráveis (TYPE, SEVERITY, STATUS, SECTOR). |
| `pluviometry` | Boletins pluviométricos diários. |
| `report_settings` | Linha única com cabeçalhos/dados do contrato para relatórios. |
| `rdo_records` | RDOs (único por obra+data e por obra+folha; `status` = `draft`/`final`). |
| `rdo_history` | Histórico do RDO (CRIADO, FINALIZADO, REABERTO). |
| `auth_codes` | Códigos de acesso/recuperação (somente o hash, com validade e tentativas). |

---

## 7. Referência da API REST (Endpoints)

Todas as rotas, exceto as marcadas como públicas, exigem `Authorization: Bearer <token>` e aplicam o filtro de obras do usuário.

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Público. Healthcheck. |
| `GET` | `/api/auth/options` | Público. Informa se o login por código está disponível. |
| `POST` | `/api/auth/login` | Público. Login com `email` e `password`. |
| `POST` | `/api/auth/request-code` | Público. Envia código por e-mail (`purpose`: `LOGIN` ou `RESET`). |
| `POST` | `/api/auth/login-code` | Público. Login com `email` e `code`. |
| `POST` | `/api/auth/reset-password` | Público. Nova senha com `email`, `code` e `newPassword`. |
| `GET` | `/api/auth/me` | Usuário logado e obras permitidas. |
| `PUT` | `/api/auth/password` | Alterar a própria senha (`currentPassword`, `newPassword`). |
| `POST` | `/api/auth/impersonate` | ADMIN. Simular acesso de outro usuário (`userId`). |
| `POST` | `/api/auth/stop-impersonation` | Encerrar simulação e voltar ao ADMIN. |
| `GET` | `/api/admin/backup` | ADMIN. Download do banco de dados. |
| `GET` | `/api/dashboard` | Indicadores consolidados (`?projectId=`). |
| `GET / POST` | `/api/projects` | Listar obras permitidas / cadastrar (ADMIN). |
| `PUT / DELETE` | `/api/projects/:id` | Atualizar / remover obra (ADMIN). |
| `POST` | `/api/projects/:id/users` | Vincular usuário à obra (ADMIN). |
| `DELETE` | `/api/projects/:id/users/:userId` | Desvincular (ADMIN). |
| `GET / POST` | `/api/users` | ADMIN. Listar / cadastrar usuários. |
| `PUT` | `/api/users/:id` | ADMIN. Editar dados, perfil e ativo/inativo. |
| `PUT` | `/api/users/:id/password` | ADMIN. Definir nova senha. |
| `PUT` | `/api/users/:id/projects` | ADMIN. Redefinir obras do usuário. |
| `GET / POST` | `/api/employees` | Funcionários. |
| `PUT / DELETE` | `/api/employees/:id` | Funcionário. |
| `GET / POST` | `/api/equipments` | Equipamentos. |
| `PUT / DELETE` | `/api/equipments/:id` | Equipamento. |
| `GET / PUT` | `/api/report-settings` | Configurações de relatório (alteração: ADMIN/ENGENHEIRO). |
| `GET / POST` | `/api/photos` | Fotos (multipart, campo `image`). |
| `PUT / DELETE` | `/api/photos/:id` | Foto. |
| `GET / POST` | `/api/occurrence-params` | Opções dos campos (alteração: ADMIN/ENGENHEIRO). |
| `PUT / DELETE` | `/api/occurrence-params/:id` | Opção (ADMIN/ENGENHEIRO). |
| `POST` | `/api/occurrence-params/reset` | Restaurar opções padrão (ADMIN/ENGENHEIRO). |
| `GET / POST` | `/api/occurrences` | Ocorrências (fotos em base64 no campo `photos`). |
| `PUT / DELETE` | `/api/occurrences/:id` | Ocorrência. |
| `GET` | `/api/occurrences/:id/history` | Histórico de status. |
| `POST` | `/api/occurrences/:id/photos` | Anexar fotos (base64 JPG/PNG/WEBP/GIF, até 10 MB cada). |
| `PUT / DELETE` | `/api/occurrence-photos/:photoId` | Legenda/fase ou remoção da foto. |
| `GET` | `/api/rdo` | RDOs (`projectId`, `month`, `year`, `date`, `fromDate`, `toDate`, `order`). |
| `GET` | `/api/rdo/by-date` | RDO do dia ou rascunho sugerido. |
| `POST` | `/api/rdo` | Criar/atualizar RDO; finalizar (`status: final`) ou reabrir (`status: draft` + `reopened_reason`). |
| `GET` | `/api/rdo/:id/history` | Histórico do RDO. |
| `POST` | `/api/rdo/batch` | Geração em lote. |
| `GET` | `/api/rdo/photo-dates` | Datas com fotos e RDOs existentes. |
| `POST` | `/api/rdo/sync-services` | Serviços sugeridos pelas fotos do dia. |
| `DELETE` | `/api/rdo/:id` | Excluir RDO em rascunho (ADMIN/ENGENHEIRO). |
| `GET / POST` | `/api/pluviometry` | Pluviometria. |
| `PUT / DELETE` | `/api/pluviometry/:id` | Registro pluviométrico. |
| `POST` | `/api/pluviometry/batch` | Importação em lote (INMET). |

Códigos de erro usuais: `400` dados inválidos, `401` sessão inválida/expirada, `403` sem permissão, `404` não encontrado, `409` RDO finalizado, `429` excesso de tentativas.

---

## 8. Infraestrutura, Deploy e Variáveis de Ambiente

### Coolify
- **Build:** `Dockerfile` na raiz. **Porta:** `3001`. **Healthcheck:** `/api/health`.
- **Volumes persistentes obrigatórios:** `/app/backend/data` (banco e segredo das sessões) e `/app/backend/uploads` (fotos).
- **Variáveis de ambiente:** cadastre em *Environment Variables* (veja `.env.example`).

### Variáveis

| Variável | Obrigatória | Descrição |
| :--- | :--- | :--- |
| `PORT` | não | Porta HTTP (padrão `3001`). |
| `NODE_ENV` | sim em produção | `production`. |
| `TOKEN_SECRET` | recomendada | Segredo das sessões. Sem ela, é gerado e salvo em `backend/data/.token_secret`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | para login por código e recuperação | Servidor de e-mail. Sem `SMTP_HOST` em produção, essas opções ficam ocultas. |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_INITIAL_PASSWORD` | não | Administrador principal. |
| `CORS_ORIGIN` | não | Domínios autorizados se o frontend estiver em outro domínio. |
| `DATA_DIR`, `UPLOADS_DIR`, `DB_PATH` | não | Caminhos alternativos de dados. |

### Atualização
Cada commit na `main` pode ser publicado pelo Coolify (*Redeploy*) preservando os volumes. Em VPS com PM2, use `./deploy.sh`.

### Backup
Em *Configurações*, o Administrador baixa o banco completo (`.db`). As fotos ficam no volume `/app/backend/uploads` e devem ser copiadas pelo servidor.

---

## 9. Testes Automatizados

```bash
npm test     # na raiz (executa backend/test/api.test.js)
```

Os testes sobem o servidor com um banco temporário e verificam: login por senha e por código, recuperação e troca de senha, bloqueio dos acessos antigos sem senha, permissões por perfil e por obra, simulação de acesso, bloqueio e histórico do RDO finalizado, numeração de folha, recusa de uploads inválidos, restauração dos campos de ocorrência e backup.
