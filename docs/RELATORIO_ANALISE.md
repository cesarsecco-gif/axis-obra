# Relatório de Análise Técnica — AXIS OBRA

**Data da análise:** 01/11/2026
**Branch analisada:** `claude/finish-repository-l1vcze` (último commit `deaf4b7` — módulo RDO + Configurações)
**Objetivo:** documentar o estado atual do sistema e orientar a continuidade do desenvolvimento (handoff para outro agente/desenvolvedor).

---

## 1. Resumo executivo

O AXIS OBRA é um sistema web de gestão de obras (foco em obras rodoviárias / padrão DER/PR) com **8 módulos funcionais** já implementados. O projeto **instala, compila e executa sem erros**:

- `npm run build` → build do frontend OK (Vite 6, ~494 KB JS / 40 KB CSS).
- `node backend/src/server.js` → banco SQLite criado e populado (seed), `/api/health` OK, login OK, rotas autenticadas OK.

O sistema está **funcional para demonstração**, mas **não está pronto para produção** por questões de **segurança de autenticação** (seção 5.1). Além disso há **1 bug funcional confirmado** (rota inexistente), lacunas de gestão de usuários e documentação desatualizada.

---

## 2. Stack e execução

| Camada | Tecnologia |
|---|---|
| Backend | Node.js **≥ 22.5** (usa `node:sqlite` nativo, experimental), Express 4, Multer, CORS |
| Banco | SQLite em modo WAL — arquivo `backend/data/axis_obra.db` (ignorado no git) |
| Frontend | React 18, Vite 6, Tailwind CSS 3, lucide-react (SPA sem roteador; navegação por estado em `App.jsx`) |
| Uploads | Disco local em `backend/uploads/` (servido em `/uploads`) |
| Auth | Token próprio `base64url(payload).HMAC-SHA256` em `Authorization: Bearer` |
| Deploy | `Dockerfile` (node:22-alpine) + `docker-compose.yml` (volumes `data` e `uploads`), Coolify, PM2 (`ecosystem.config.cjs` + `deploy.sh`), template GitHub Actions em `deploy/github-actions-deploy.yml` |

**Comandos:**
```bash
npm run install:all        # instala backend + frontend
npm run start:backend      # API em :3001
npm run start:frontend     # Vite dev em :5173 (proxy /api e /uploads -> :3001)
npm run build              # build de produção; o backend serve frontend/dist
```

Em produção (`NODE_ENV=production`) o servidor escuta também nas portas 80 e 3000 (compatibilidade Traefik/Coolify) — `backend/src/server.js:2072`.

**Contas de demonstração (senha `123456`):** `admin@axisobra.com.br` (ADMIN), `mariana@axisobra.com.br`, `roberto@axisobra.com.br` (ENGENHEIRO), `joao@axisobra.com.br` (ENCARREGADO).

---

## 3. Estrutura do código

```
backend/src/db.js        (~1.000 linhas) schema, migrations "ensure*Columns", seeds de demonstração
backend/src/server.js    (~2.100 linhas) TODAS as rotas da API em um único arquivo
frontend/src/App.jsx     login, sidebar, filtro global de obra, troca de módulos
frontend/src/api.js      apiRequest(), sessão em localStorage, formatadores (BRL, data BR)
frontend/src/components/
  DashboardView.jsx      Painel consolidado
  PhotosView.jsx         Módulo 1 - Registro Fotográfico
  PhotoReportModal.jsx   Relatório fotográfico (PDF via window.print / Excel via HTML-xls)
  RdoView.jsx            Módulo 2 - Diário de Obras (RDO DER/PR), impressão/PDF
  OccurrencesView.jsx    Módulo 3 - Ocorrências (+ gerenciador de campos)
  EmployeesView.jsx      Módulo 4 - Funcionários
  EquipmentsView.jsx     Módulo 5 - Equipamentos
  ProjectsUsersView.jsx  Módulo 6 - Obras e matriz de acesso por usuário
  PluviometryView.jsx    Módulo 7 - Pluviometria (CSV INMET, gráficos, 4 quadros, PDF/Excel)
  SettingsView.jsx       Módulo 8 - Configurações (parâmetros de ocorrência, cabeçalhos de relatório)
```

### 3.1 Tabelas do banco (11)
`users`, `projects`, `project_users` (N:N obra×usuário), `employees`, `equipments`, `photos`, `occurrences`, `pluviometry`, `occurrence_params` (opções configuráveis TYPE/SEVERITY/STATUS/SECTOR), `report_settings` (linha única `id=1`: cabeçalho/rodapé/contrato dos relatórios), `rdo_records` (único por `project_id + rdo_date`, `folio_number` sequencial por obra, `services_developed` em JSON).

Migrations são feitas por funções `ensure*Columns()` que rodam `ALTER TABLE ADD COLUMN` se a coluna não existir. Não há ferramenta de migration versionada.

### 3.2 Rotas da API (todas em `backend/src/server.js`)
- Auth: `GET /api/health`, `GET /api/auth/demo-users`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/dashboard`
- Obras: `GET/POST /api/projects`, `PUT/DELETE /api/projects/:id`, `POST /api/projects/:id/users`, `DELETE /api/projects/:id/users/:userId`
- Usuários: `GET/POST /api/users`, `PUT /api/users/:id/projects`
- Funcionários: `GET/POST /api/employees`, `PUT/DELETE /api/employees/:id`
- Equipamentos: `GET/POST /api/equipments`, `PUT/DELETE /api/equipments/:id`
- Relatórios: `GET/PUT /api/report-settings`
- Fotos: `GET/POST /api/photos`, `PUT/DELETE /api/photos/:id`
- Ocorrências: `GET/POST /api/occurrence-params`, `PUT/DELETE /api/occurrence-params/:id`, `GET/POST /api/occurrences`, `PUT/DELETE /api/occurrences/:id`
- RDO: `GET /api/rdo`, `GET /api/rdo/by-date`, `POST /api/rdo` (upsert), `POST /api/rdo/sync-services`, `DELETE /api/rdo/:id`
- Pluviometria: `GET/POST /api/pluviometry`, `PUT/DELETE /api/pluviometry/:id`, `POST /api/pluviometry/batch`

### 3.3 Controle de acesso (RBAC)
- Perfis: `ADMIN`, `ENGENHEIRO`, `ENCARREGADO`, `FISCAL`.
- `ADMIN` acessa todas as obras; demais perfis só as vinculadas em `project_users`.
- Helpers: `getUserAccessibleProjectIds()` e `canUserAccessProject()` (`server.js:55-71`), middleware `authenticate` (`server.js:74`).

---

## 4. Estado funcional por módulo

| Módulo | Situação | Observações |
|---|---|---|
| Painel Consolidado | ✅ Implementado | Indicadores filtrados pela obra selecionada / permissões |
| 1. Registro Fotográfico | ✅ Implementado | Upload múltiplo, edição, agrupamento ano/mês/data/etapa, ordenação, relatório A4 PDF/Excel |
| 2. RDO (DER/PR) | ✅ Implementado (recente) | Upsert por data, folha sequencial, importa serviços dos títulos das fotos do dia, impressão/PDF |
| 3. Ocorrências | ✅ Implementado | Campos configuráveis, avanço rápido de status |
| 4. Funcionários | ✅ Implementado | CLT/terceiro/PJ, ASO, NRs, diária |
| 5. Equipamentos | ✅ Implementado | Próprio/locado, manutenção preventiva |
| 6. Obras por Usuário | ⚠️ Parcial | Cria obra/usuário e vínculos; **não edita/desativa usuário nem troca senha** |
| 7. Pluviometria | ✅ Implementado | CSV INMET, lote, gráfico diário/mensal, 4 quadros analíticos PDF/Excel |
| 8. Configurações | ⚠️ Com bug | Botão "restaurar padrão" chama rota inexistente (ver 5.2) |

---

## 5. Problemas encontrados (priorizados)

### 5.1 🔴 CRÍTICO — Segurança de autenticação (bloqueia produção)

| # | Problema | Local | Correção sugerida |
|---|---|---|---|
| S1 | Login aceita apenas `userId` **sem senha** ("troca rápida de perfil"). Qualquer pessoa vira ADMIN com `{"userId":1}` | `server.js:138-145` | Permitir só quando `DEMO_MODE=true` (variável de ambiente); desligado por padrão |
| S2 | Middleware aceita cabeçalho `x-user-id` como autenticação **sem token** | `server.js:83-85` e `frontend/src/api.js:35-37` | Remover do backend e do frontend; aceitar apenas Bearer token |
| S3 | `GET /api/auth/demo-users` é público e expõe nomes/e-mails/perfis de todos os usuários | `server.js:114` | Só responder com `DEMO_MODE=true`; frontend esconde o bloco "Acesso Rápido" quando a lista vier vazia/404 |
| S4 | `GET /api/users` não exige ADMIN (qualquer logado lista todos os usuários) | `server.js:537` | Restringir a ADMIN |
| S5 | `TOKEN_SECRET` com valor padrão fixo no código | `server.js:31` | Exigir via env em produção (falhar na inicialização se ausente) ou gerar e persistir em `backend/data/` |
| S6 | Senha com SHA-256 + salt fixo global | `db.js:23-25` | `crypto.scrypt` com salt aleatório por usuário (formato `scrypt$salt$hash`), mantendo compatibilidade/migração com hashes antigos no login |
| S7 | Tela de login vem pré-preenchida com `admin@...` / `123456` e rótulo "Senha (padrão: 123456)" | `App.jsx:60-61` e rótulo do campo | Campos vazios fora do modo demo |
| S8 | `PUT /api/report-settings` e CRUD de `occurrence-params` sem verificação de perfil (qualquer usuário altera configurações globais) | `server.js:953`, `1279-1376` | Restringir a ADMIN (ou ADMIN+ENGENHEIRO, decidir regra) |
| S9 | `POST /api/rdo/sync-services` não chama `canUserAccessProject` (lê títulos de fotos de obra alheia) | `server.js:1765` | Adicionar a checagem |
| S10 | Upload sem `fileFilter` (aceita qualquer tipo de arquivo; extensão vem do nome original) | `server.js:20-28` | Validar mimetype `image/*` (jpg, png, webp); considerar bloquear SVG (risco XSS) |
| S11 | `cors()` aberto para qualquer origem | `server.js:14` | Restringir por env (`CORS_ORIGIN`) ou desabilitar (frontend é servido pelo mesmo host) |
| S12 | Sem limite de tentativas de login | `server.js:138` | Rate limit simples em memória por IP/e-mail |

### 5.2 🟠 Bug funcional confirmado
- **B1** — `SettingsView.jsx:169` chama `POST /api/occurrence-params/reset`, **rota que não existe** no backend → retorna o HTML da SPA / erro. Implementar a rota (ADMIN) reaproveitando `seedOccurrenceParamsIfEmpty()` de `db.js:372` (apagar e repopular), ou remover o botão.

### 5.3 🟡 Funcionalidades faltantes
- **F1** — Gestão de usuários: `PUT /api/users/:id` (nome, e-mail, perfil, CREA/CFT, telefone, ativo), desativar/reativar, redefinir senha (ADMIN) e "alterar minha senha" (`PUT /api/auth/password`, usuário logado com senha atual). Telas em `ProjectsUsersView.jsx` + item no menu do usuário em `App.jsx`.
- **F2** — `GET /api/auth/me` deveria ser usado na inicialização para validar o token salvo (hoje o usuário vem só do `localStorage`; token expirado só aparece como erro 401 nas telas). Tratar 401 global em `apiRequest` → limpar sessão e voltar ao login.
- **F3** — Backup: endpoint/rotina para exportar o `.db` + uploads (dados críticos de obra em SQLite local).

### 5.4 🔵 Documentação e consistência
- **D1** — Tela de login (`App.jsx`, bloco "6 Modules Checklist") lista 6 módulos; o sistema tem 8 (faltam RDO e Configurações, e a numeração diverge do menu).
- **D2** — `README.md` lista 6 módulos e cita `.github/workflows/deploy.yml`, mas o arquivo está em `deploy/github-actions-deploy.yml` (precisa ser copiado para `.github/workflows/` para funcionar).
- **D3** — `DOCUMENTACAO_SISTEMA.md` desatualizado: numeração de módulos inconsistente (sumário diz RDO = Módulo 2, corpo diz Ocorrências = Módulo 2), "8 tabelas" (são 11), faltam rotas de RDO, report-settings, occurrence-params, pluviometry batch/PUT e photos PUT.
- **D4** — Documentar variáveis de ambiente (hoje só `PORT`, `NODE_ENV`, `TOKEN_SECRET`; propostas: `DEMO_MODE`, `CORS_ORIGIN`). Criar `.env.example`.

### 5.5 ⚪ Qualidade / dívida técnica (não bloqueante)
- **Q1** — Sem testes automatizados. Sugestão mínima: `node:test` + `fetch` contra servidor com banco temporário (definir caminho do banco via env, ex. `DB_PATH`), cobrindo login, RBAC (usuário sem vínculo recebe 403) e CRUD principal.
- **Q2** — Sem ESLint/Prettier.
- **Q3** — `server.js` monolítico (~2.100 linhas). Refatorar em `routes/*.js` quando houver testes.
- **Q4** — Componentes muito grandes (`PluviometryView.jsx` ~2.700 linhas, `RdoView.jsx` ~1.600). Extrair geradores de PDF/Excel para `frontend/src/reports/`.
- **Q5** — Bundle único de ~494 KB: usar `React.lazy` por módulo.
- **Q6** — `node:sqlite` é experimental (aviso no log). Fixar versão do Node no Docker (`node:22.x-alpine`) para evitar quebra.
- **Q7** — Dados de seed são específicos (contrato CO141/2025, PR-317, nomes reais em `ensureReportSettingsColumns`, `db.js:234+`). Avaliar se devem continuar como padrão em instalações novas.

---

## 6. Plano de continuação sugerido (ordem de execução)

1. **Segurança (S1–S12)** + variável `DEMO_MODE` + `.env.example`.
   *Aceite:* `POST /api/auth/login {"userId":1}` → 400/401 com `DEMO_MODE` desligado; requisição só com `x-user-id` → 401; ENGENHEIRO em `GET /api/users` → 403; login com senha correta continua funcionando para os usuários já existentes (migração de hash).
2. **Bug B1** (rota de reset dos parâmetros).
3. **F1 + F2** (gestão de usuários, troca de senha, validação de sessão / 401 global).
4. **D1–D4** (login com 8 módulos, README, documentação, workflow do GitHub Actions no lugar certo).
5. **Q1** (testes mínimos de API) → depois Q2–Q6.

### Regras para quem continuar
- Interface e mensagens em **português do Brasil**; manter o padrão visual (Tailwind, paleta slate/amber).
- Não versionar `backend/data/*.db` nem `backend/uploads/*` (já no `.gitignore`).
- Migrations sempre **aditivas** (padrão `ensure*Columns`) — o banco de produção não pode ser recriado.
- Sempre validar `canUserAccessProject()` em qualquer rota que receba `project_id` ou id de registro vinculado a obra.
- Validar com `npm run build` e subir o backend (`PORT=3999 node backend/src/server.js`) testando `/api/health` e login antes de cada commit.
