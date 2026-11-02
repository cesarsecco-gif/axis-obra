# Relatório de Análise Técnica — AXIS OBRA

**Data da análise:** 01/11/2026 (3ª revisão — após implementação das correções)
**Base analisada:** `origin/main` em `4c1cfdd` — *feat(occurrences): add photo attachments, SLA/lead-time KPIs and status reports*
**Objetivo:** documentar o estado atual do sistema e orientar a continuidade do desenvolvimento (handoff para outro agente/desenvolvedor).

> **O que mudou desde a 1ª análise (`deaf4b7`)** — 8 commits na `main`:
> - **RDO:** comportamento de referência sem seed artificial, geração em lote (3 opções), filtro rápido mês/ano, calendário interativo com marcação de dias com foto/RDO, finalização/reabertura da folha, banner configurável do Módulo 8 no cabeçalho, impressão ajustada para 1 folha A4 (12 linhas de serviço, fonte 11).
> - **UI:** layout responsivo para celular/tablet, menu lateral em gaveta (slide-over) e barra de navegação inferior.
> - **Ocorrências:** anexos fotográficos por fase (registro/tratativa/conclusão), histórico de mudança de status, prazo (`due_date`), data de resolução (`resolved_at`), indicadores de SLA/lead time e relatórios por status (PDF/Excel).
>
> **Status dos problemas da 1ª análise:** nenhum dos itens de segurança, o bug B1 ou as pendências de documentação foram corrigidos. Os itens continuam abaixo, com **novos achados** marcados como 🆕.

---

## 0. Status da implementação (3ª revisão)

Implementado na branch `claude/finish-repository-l1vcze`. Os itens das seções 4–5 abaixo foram mantidos como registro da análise; esta tabela indica o que já foi resolvido.

| Item | Status | O que foi feito |
|---|---|---|
| S1 login sem senha | ✅ | Removido. Login só por senha ou código enviado por e-mail |
| S2 `x-user-id` | ✅ | Removido do backend e do frontend; só token Bearer |
| S3 `demo-users` público | ✅ | Rota removida; tela de login sem "Acesso Rápido" e sem nomes de usuários |
| S4 `GET /api/users` | ✅ | Somente ADMIN |
| S5 `TOKEN_SECRET` fixo | ✅ | Variável de ambiente ou segredo aleatório salvo em `backend/data/.token_secret` |
| S6 hash de senha | ✅ | `scrypt` com salt por usuário; hashes antigos migram no primeiro login |
| S7 login pré-preenchido | ✅ | Campos vazios |
| S8 configurações sem perfil | ✅ | `report-settings` e `occurrence-params` só ADMIN/ENGENHEIRO |
| S9 `sync-services` | ✅ | Checa acesso à obra |
| S10 XSS por SVG | ✅ | Base64 só JPG/PNG/WEBP/GIF com checagem de assinatura e 10 MB; Multer com filtro de tipo; `/uploads` com `nosniff` + CSP `sandbox` |
| S11 CORS aberto | ✅ | Desligado por padrão; `CORS_ORIGIN` opcional |
| S12 força bruta | ✅ | Limite de falhas por e-mail e IP; limite de pedidos de código |
| R1 folha final editável | ✅ | 409 ao editar/excluir folha finalizada |
| R2 reabertura | ✅ | Só ADMIN/ENGENHEIRO, motivo obrigatório (perguntado na tela), tabela `rdo_history` |
| R3 nº da folha | ✅ | Calculado no servidor + índice único `(project_id, folio_number)` |
| R4 colunas inexistentes no lote | ✅ | Corrigido |
| R5 status antigo | ✅ | Migração para `draft`/`final` |
| R6 lote sem transação | ✅ | `BEGIN/COMMIT/ROLLBACK` |
| B1 rota `reset` | ✅ | `POST /api/occurrence-params/reset` |
| B2 / D1 login com 6 módulos | ✅ | Nova tela com os 8 módulos; formulário primeiro no celular |
| F1 gestão de usuários | ✅ | Editar, perfil, desativar/reativar, definir senha (ADMIN), alterar a própria senha |
| F2 sessão/401 | ✅ | `/api/auth/me` ao abrir; 401 global volta ao login |
| F3 backup | ✅ (banco) | `GET /api/admin/backup` + botão em Configurações. Fotos: copiar o volume `uploads` |
| F4 permissões por perfil | ✅ (backend) | FISCAL somente leitura; ENCARREGADO não finaliza/reabre/exclui RDO. Os botões ainda aparecem na tela (o servidor recusa com mensagem) |
| O1 fotos de ocorrência | ✅ | Redução no navegador (1600 px, JPEG 82%) |
| O2 bundle | ✅ | `React.lazy` por módulo: carregamento inicial de ~580 KB para ~197 KB |
| D2 README | ✅ | Atualizado; modelo de workflow corrigido (uso inválido de `secrets` no `if`) e com etapa de testes |
| D3 documentação | ✅ | `DOCUMENTACAO_SISTEMA.md` reescrito |
| D4 `.env.example` | ✅ | Criado |
| D5 `database.sqlite` | ✅ | Removido do git; `backend/data/*` ignorado |
| D6 código morto | ✅ | Removido |
| D7 seeds em produção | ✅ | Extras de demonstração só em banco novo |
| Q1 testes | ✅ | `backend/test/api.test.js` (20 testes, `npm test`) |
| **Novo:** login por código | ✅ | `request-code` / `login-code` (6 dígitos, 10 min, uso único, 5 tentativas) |
| **Novo:** recuperação de senha | ✅ | `request-code` (RESET) / `reset-password` |
| **Novo:** administrador principal | ✅ | `cesarsecco@gmail.com`, senha inicial `123456` (configurável por `ADMIN_*`) |
| **Novo:** simular acesso seguro | ✅ | `impersonate` / `stop-impersonation` (só ADMIN; faixa de aviso e botão de voltar) |

### Implementado depois (aprovado em 02/11/2026)

| Item | O que foi feito |
|---|---|
| Perfis de acesso configuráveis | Tabela `roles`; aba Configurações › Perfis de Acesso (criar, duplicar, editar, excluir; cor; abrangência; Ver/Criar/Editar/Excluir por módulo; ações especiais; modelos prontos). Servidor confere em todas as rotas (`backend/src/permissions.js`). |
| Módulo 9 — Gestão de Contas | Lista com indicadores e filtros; cadastro completo (dados pessoais, contato, profissionais, acesso, obras com função, foto, assinatura); convite por e-mail com link (7 dias) ou senha inicial com troca obrigatória; validade do acesso; reenviar convite; simular acesso; redefinir senha. |
| Módulo 6 | Renomeado para "Gestão de Obras": obras + equipe por obra. Cadastro de usuários saiu dele. |
| Custos | Sem "ver custos", diárias e custos de equipamentos não são enviados ao navegador e não podem ser alterados. |
| Testes | 26 testes de API (`npm test`). |
| Redução de fotos | Registro Fotográfico e Ocorrências reduzem as fotos no navegador para 2048 px / JPEG 85% (padrão de impressão), em `frontend/src/imageUtils.js`. Teste: foto de 10,8 MB (4032×3024) chegou com 0,94 MB (2048×1536). |

### Pendências após esta revisão
1. **Contas de demonstração com senha `123456`** (`admin@axisobra.com.br`, `mariana@`, `roberto@`, `joao@`) continuam existindo em bancos já criados e em instalações novas. `admin@axisobra.com.br` é ADMIN. **Desativar em produção** (Obras por Usuário → Editar → Desativar) ou trocar as senhas.
2. Configurar **SMTP** em produção (sem ele, login por código e "Esqueci minha senha" ficam ocultos).
3. Trocar a senha inicial do administrador principal.
4. Ocultar na tela os botões que o perfil não pode usar: já feito no RDO, Ocorrências, Gestão de Obras, Configurações e Gestão de Contas; falta em Fotos, Funcionários, Equipamentos e Pluviometria (o servidor já recusa com mensagem).
5. O Módulo 1 ainda aceita SVG no upload multipart (usado pelo gerador de carimbo de demonstração); está neutralizado pelo CSP `sandbox`, mas pode ser restrito quando o gerador for removido.
6. Q2–Q6: ESLint/Prettier, separar `server.js` em rotas, dividir componentes grandes, fixar versão do Node na imagem Docker, revisar dados de seed.
7. Ativar o workflow (copiar `deploy/github-actions-deploy.yml` para `.github/workflows/`).

---

## 1. Resumo executivo

O AXIS OBRA é um sistema web de gestão de obras (foco em obras rodoviárias / padrão DER/PR) com **8 módulos funcionais**. Na revisão atual o projeto **instala, compila e executa sem erros**:

- `npm run build` → OK (Vite 6, **~580 KB JS** / 49 KB CSS — cresceu ~86 KB desde a análise anterior).
- `node backend/src/server.js` → banco criado e populado, `/api/health` OK, login OK, rotas novas de RDO em lote e anexos de ocorrência OK.

O sistema está **funcional para demonstração**, mas **não está pronto para produção**:
- a autenticação continua burlável (login sem senha e cabeçalho `x-user-id`) — **confirmado por teste**;
- 🆕 o "bloqueio" de RDO finalizado existe **só na tela**: pelo backend qualquer usuário da obra edita ou exclui uma folha finalizada — **confirmado por teste**;
- 🆕 o upload de fotos de ocorrência aceita **SVG**, permitindo XSS armazenado — **confirmado por teste**.

---

## 2. Stack e execução

| Camada | Tecnologia |
|---|---|
| Backend | Node.js **≥ 22.5** (usa `node:sqlite` nativo, experimental), Express 4, Multer, CORS |
| Banco | SQLite em modo WAL — arquivo `backend/data/axis_obra.db` (ignorado no git) |
| Frontend | React 18, Vite 6, Tailwind CSS 3, lucide-react (SPA sem roteador; navegação por estado em `App.jsx`) |
| Uploads | Disco local em `backend/uploads/` (servido em `/uploads`). Fotos de ocorrência chegam em **base64 no JSON** e são gravadas por `saveBase64Image()` |
| Auth | Token próprio `base64url(payload).HMAC-SHA256` em `Authorization: Bearer` (+ cabeçalho `x-user-id`, ver S2) |
| Deploy | `Dockerfile` (node:22-alpine) + `docker-compose.yml` (volumes `data` e `uploads`), Coolify, PM2 (`ecosystem.config.cjs` + `deploy.sh`), template GitHub Actions em `deploy/github-actions-deploy.yml` |

**Comandos:**
```bash
npm run install:all        # instala backend + frontend
npm run start:backend      # API em :3001
npm run start:frontend     # Vite dev em :5173 (proxy /api e /uploads -> :3001)
npm run build              # build de produção; o backend serve frontend/dist
```

Em produção (`NODE_ENV=production`) o servidor escuta também nas portas 80 e 3000 (compatibilidade Traefik/Coolify), no final de `backend/src/server.js`.

**Contas de demonstração (senha `123456`):** `admin@axisobra.com.br` (ADMIN), `mariana@axisobra.com.br`, `roberto@axisobra.com.br` (ENGENHEIRO), `joao@axisobra.com.br` (ENCARREGADO).

---

## 3. Estrutura do código

```
backend/src/db.js        (~1.180 linhas) schema, migrations "ensure*Columns", seeds de demonstração
backend/src/server.js    (~2.440 linhas, 53 rotas) TODAS as rotas da API em um único arquivo
frontend/src/App.jsx     (~690) login, sidebar/gaveta mobile, barra inferior, filtro global de obra
frontend/src/api.js      apiRequest(), sessão em localStorage, formatadores (BRL, data BR)
frontend/src/components/
  DashboardView.jsx      (~380)  Painel consolidado
  PhotosView.jsx         (~1.460) Módulo 1 - Registro Fotográfico
  PhotoReportModal.jsx   (~1.240) Relatório fotográfico (PDF via window.print / Excel via HTML-xls)
  RdoView.jsx            (~2.700) Módulo 2 - RDO DER/PR: calendário, lote, finalização, impressão
  OccurrencesView.jsx    (~3.010) Módulo 3 - Ocorrências: anexos, histórico, SLA, relatórios
  EmployeesView.jsx      (~580)  Módulo 4 - Funcionários
  EquipmentsView.jsx     (~600)  Módulo 5 - Equipamentos
  ProjectsUsersView.jsx  (~870)  Módulo 6 - Obras e matriz de acesso por usuário
  PluviometryView.jsx    (~2.700) Módulo 7 - Pluviometria (CSV INMET, gráficos, 4 quadros, PDF/Excel)
  SettingsView.jsx       (~890)  Módulo 8 - Configurações (parâmetros de ocorrência, cabeçalhos de relatório)
```

### 3.1 Tabelas do banco (13)
`users`, `projects`, `project_users` (N:N obra×usuário), `employees`, `equipments`, `photos`, `occurrences` (+ `due_date`, `resolved_at`, `updated_at`), 🆕 `occurrence_photos` (anexos com `phase` REGISTRO/TRATATIVA/CONCLUSAO), 🆕 `occurrence_history` (trilha de mudanças de status), `pluviometry`, `occurrence_params` (opções configuráveis TYPE/SEVERITY/STATUS/SECTOR, com flags `is_resolved`/`is_critical`), `report_settings` (linha única `id=1`), `rdo_records` (único por `project_id + rdo_date`; + `final_signature`, `finalized_at`, `reopened_reason`; status agora `draft`/`final`).

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
- Ocorrências: `GET/POST /api/occurrence-params`, `PUT/DELETE /api/occurrence-params/:id`, `GET/POST /api/occurrences`, `PUT/DELETE /api/occurrences/:id`, 🆕 `GET /api/occurrences/:id/history`, 🆕 `POST /api/occurrences/:id/photos`, 🆕 `PUT/DELETE /api/occurrence-photos/:photoId`
- RDO: `GET /api/rdo` (🆕 `fromDate`, `toDate`, `order`), `GET /api/rdo/by-date` (🆕 `exists`, `suggested_services`), `POST /api/rdo` (upsert), 🆕 `POST /api/rdo/batch`, 🆕 `GET /api/rdo/photo-dates`, `POST /api/rdo/sync-services`, `DELETE /api/rdo/:id`
- Pluviometria: `GET/POST /api/pluviometry`, `PUT/DELETE /api/pluviometry/:id`, `POST /api/pluviometry/batch`

### 3.3 Controle de acesso (RBAC)
- Perfis: `ADMIN`, `ENGENHEIRO`, `ENCARREGADO`, `FISCAL`.
- `ADMIN` acessa todas as obras; demais perfis só as vinculadas em `project_users`.
- Helpers `getUserAccessibleProjectIds()` e `canUserAccessProject()` e middleware `authenticate` no topo de `server.js`.
- **Não existe distinção de permissão por perfil dentro da obra** (ex.: ENCARREGADO pode finalizar, reabrir e excluir RDO, alterar configurações globais etc.).

---

## 4. Estado funcional por módulo

| Módulo | Situação | Observações |
|---|---|---|
| Painel Consolidado | ✅ Implementado | Indicadores filtrados pela obra selecionada / permissões |
| 1. Registro Fotográfico | ✅ Implementado | Upload múltiplo, edição, agrupamento ano/mês/data/etapa, ordenação, relatório A4 PDF/Excel |
| 2. RDO (DER/PR) | ⚠️ Implementado, regras só no frontend | Calendário, lote (dias com foto / período completo), finalização. **Bloqueio de folha final e numeração não validados no backend** (R1–R3) |
| 3. Ocorrências | ⚠️ Implementado, upload inseguro | Anexos por fase, histórico, SLA/lead time, relatórios. **SVG aceito, base64 sem compressão** (S10, O1) |
| 4. Funcionários | ✅ Implementado | CLT/terceiro/PJ, ASO, NRs, diária |
| 5. Equipamentos | ✅ Implementado | Próprio/locado, manutenção preventiva |
| 6. Obras por Usuário | ⚠️ Parcial | Cria obra/usuário e vínculos; **não edita/desativa usuário nem troca senha** |
| 7. Pluviometria | ✅ Implementado | CSV INMET, lote, gráfico diário/mensal, 4 quadros analíticos PDF/Excel |
| 8. Configurações | ⚠️ Com bug | Botão "restaurar padrão" chama rota inexistente (B1) |
| UI responsiva | ✅ Novo | Gaveta lateral + barra inferior no mobile |

---

## 5. Problemas encontrados (priorizados)

Legenda: ✔ = confirmado por teste executado nesta análise.

### 5.1 🔴 CRÍTICO — Segurança (bloqueia produção)

| # | Problema | Local | Correção sugerida |
|---|---|---|---|
| S1 ✔ | Login aceita apenas `{"userId":1}` **sem senha** e devolve token de ADMIN | `POST /api/auth/login` | Permitir só com `DEMO_MODE=true` (variável de ambiente), desligado por padrão |
| S2 ✔ | Middleware aceita cabeçalho `x-user-id` como autenticação **sem token** (o frontend envia em toda requisição) | `authenticate` em `server.js` e `frontend/src/api.js:35-37` | Remover dos dois lados; aceitar apenas Bearer token |
| S3 | `GET /api/auth/demo-users` é público e expõe nomes/e-mails/perfis | `server.js` (rota pública) | Só responder com `DEMO_MODE=true`; frontend oculta "Acesso Rápido" quando vier vazio/404 |
| S4 ✔ | `GET /api/users` não exige ADMIN (ENCARREGADO listou todos os usuários) | `GET /api/users` | Restringir a ADMIN |
| S5 | `TOKEN_SECRET` com valor padrão fixo no código | topo de `server.js` | Exigir via env em produção ou gerar e persistir em `backend/data/` |
| S6 | Senha com SHA-256 + salt fixo global | `hashPassword()` em `db.js` | `crypto.scrypt` com salt por usuário (`scrypt$salt$hash`), migrando hashes antigos no login |
| S7 | Login pré-preenchido com `admin@...` / `123456` e rótulo "Senha (padrão: 123456)" | `App.jsx` (estado inicial do formulário) | Campos vazios fora do modo demo |
| S8 | `PUT /api/report-settings` e CRUD de `occurrence-params` sem verificação de perfil | `server.js` | Restringir a ADMIN (ou ADMIN+ENGENHEIRO) |
| S9 ✔ | `POST /api/rdo/sync-services` não chama `canUserAccessProject` (ENCARREGADO consultou obra 2 sem vínculo → 200) | `server.js` (~linha 2111) | Adicionar a checagem |
| S10 ✔ 🆕 | **XSS armazenado via SVG**: `saveBase64Image()` aceita `data:image/svg+xml` e grava `.svg` servido no mesmo domínio (SVG com `onload` foi aceito). O upload via Multer (`/api/photos`) também não tem `fileFilter` | `saveBase64Image()` e config do Multer em `server.js` | Lista branca `jpg/png/webp`, validar assinatura do arquivo (magic bytes), limite de tamanho por imagem; servir `/uploads` com `X-Content-Type-Options: nosniff` e `Content-Security-Policy: sandbox` |
| S11 | `cors()` aberto para qualquer origem | topo de `server.js` | Restringir por env (`CORS_ORIGIN`) ou desabilitar (front e API no mesmo host) |
| S12 | Sem limite de tentativas de login | `POST /api/auth/login` | Rate limit simples em memória por IP/e-mail |

### 5.2 🟠 Regras de negócio do RDO só no frontend 🆕

| # | Problema | Correção sugerida |
|---|---|---|
| R1 ✔ | **Folha finalizada não é bloqueada no backend.** Com o RDO em `status: final`, um ENCARREGADO alterou `contractor_notes` via `POST /api/rdo` e depois **excluiu** a folha via `DELETE /api/rdo/:id`, ambos com sucesso | No upsert: se o registro existente estiver `final`, recusar alterações (409), exceto reabertura explícita com `reopened_reason` obrigatório; `DELETE` recusado para folha final |
| R2 | Qualquer perfil pode finalizar e reabrir; a reabertura grava motivo fixo "Reaberto para correções manuais." (`RdoView.jsx:541`) | Definir quem pode finalizar/reabrir (ex.: ENGENHEIRO/ADMIN), pedir motivo ao usuário e registrar histórico (tabela `rdo_history`, no mesmo padrão de `occurrence_history`) |
| R3 ✔ | **Numeração de folha (`folio_number`) vem do cliente e não é validada:** foi possível criar outra data com o mesmo nº de folha 1 | Calcular a folha no servidor (`MAX+1`) em novos registros; índice `UNIQUE(project_id, folio_number)` |
| R4 | `POST /api/rdo/batch` lê `settings.supervisorNotes` e `settings.inspectorNotes`, **colunas inexistentes** em `report_settings` (as colunas são snake_case) — sempre cai no valor padrão | Usar as colunas reais ou removê-las |
| R5 | Status mudou de `EM_ANDAMENTO` para `draft`/`final`, sem migração de registros antigos em bancos de produção | Migração `UPDATE rdo_records SET status='draft' WHERE status NOT IN ('draft','final')` |
| R6 | Geração em lote não roda em transação (falha no meio deixa lote parcial) | Envolver em `BEGIN`/`COMMIT` |

### 5.3 🟠 Bugs funcionais

- **B1 ✔** — `SettingsView.jsx:169` chama `POST /api/occurrence-params/reset`, **rota que não existe** (teste: 404 com HTML). Implementar a rota (ADMIN) reaproveitando `seedOccurrenceParamsIfEmpty()` de `db.js`, ou remover o botão.
- **B2 🆕** — Tela de login continua listando **6 módulos** com numeração diferente do menu (`App.jsx:181-186`).

### 5.4 🟡 Funcionalidades faltantes
- **F1** — Gestão de usuários: `PUT /api/users/:id` (nome, e-mail, perfil, CREA/CFT, telefone, ativo), desativar/reativar, redefinir senha (ADMIN) e "alterar minha senha" (`PUT /api/auth/password`). Telas em `ProjectsUsersView.jsx` e no menu do usuário.
- **F2** — Validar a sessão salva com `GET /api/auth/me` ao abrir o app e tratar **401 globalmente** em `apiRequest` (limpar sessão e voltar ao login).
- **F3** — Backup: exportar o `.db` + `uploads/` (dados de obra críticos em SQLite local).
- **F4 🆕** — Permissões por perfil dentro da obra (ver 3.3): FISCAL deveria ser somente leitura; ENCARREGADO sem excluir/finalizar.

### 5.5 🔵 Performance e armazenamento 🆕
- **O1** — Fotos de ocorrência são lidas com `FileReader.readAsDataURL` (`OccurrencesView.jsx:143`) e enviadas em base64 **sem redimensionar**. Até 20 fotos por requisição dentro do limite de JSON de 25 MB → fotos de celular (4–8 MB cada) estouram o limite e pesam no banco/disco. Redimensionar no cliente (canvas, lado maior ~1600 px, JPEG ~0,8) ou trocar para `multipart` com Multer, como já é feito em `/api/photos`.
- **O2** — Bundle único de ~580 KB: usar `React.lazy` por módulo (RDO, Ocorrências e Pluviometria juntos têm ~8.400 linhas).

### 5.6 🔵 Documentação e consistência
- **D1** — Tela de login desatualizada (ver B2).
- **D2** — `README.md` lista 6 módulos e cita `.github/workflows/deploy.yml`, mas o arquivo está em `deploy/github-actions-deploy.yml` (precisa ser copiado para `.github/workflows/` para funcionar).
- **D3** — `DOCUMENTACAO_SISTEMA.md` desatualizado: numeração de módulos inconsistente, "8 tabelas" (são 13), faltam rotas de RDO (incluindo lote, calendário e finalização), anexos/histórico de ocorrências, report-settings, occurrence-params, pluviometry batch/PUT e photos PUT.
- **D4** — Documentar variáveis de ambiente (`PORT`, `NODE_ENV`, `TOKEN_SECRET`; propostas: `DEMO_MODE`, `CORS_ORIGIN`) em um `.env.example`.
- **D5 🆕** — Arquivo vazio `backend/data/database.sqlite` foi versionado (o banco real é `axis_obra.db`). Remover do git.
- **D6 🆕** — Código morto em `db.js`: `seedRdoIfEmpty()` agora só faz `return` e `_unusedSeedRdo()` (referencia variável `countRow` inexistente) nunca é chamada. Remover.
- **D7 🆕** — Seeds de demonstração ainda criam ocorrências e anexos de exemplo (`ensureOccurrenceSeedExtras()`, que roda **em todo boot**) — em um banco de produção que tenha exatamente 4 ocorrências, insere 2 ocorrências fictícias. Restringir seeds a `DEMO_MODE`/banco novo.

### 5.7 ⚪ Qualidade / dívida técnica (não bloqueante)
- **Q1** — Sem testes automatizados. Sugestão mínima: `node:test` + `fetch` contra servidor com banco temporário (caminho do banco via env, ex. `DB_PATH`), cobrindo login, RBAC (sem vínculo → 403), bloqueio de RDO final, upload de imagem inválida e CRUD principal.
- **Q2** — Sem ESLint/Prettier.
- **Q3** — `server.js` monolítico (~2.440 linhas, 53 rotas). Separar em `routes/*.js` depois que houver testes.
- **Q4** — Componentes muito grandes (`OccurrencesView.jsx` ~3.000, `RdoView.jsx` ~2.700, `PluviometryView.jsx` ~2.700 linhas). Extrair geradores de PDF/Excel para `frontend/src/reports/` e subcomponentes.
- **Q5** — `node:sqlite` é experimental (aviso no log). Fixar versão do Node no Docker (`node:22.x-alpine`).
- **Q6** — Dados de seed específicos (contrato CO141/2025, PR-317, nomes de pessoas em `ensureReportSettingsColumns`). Avaliar se devem ser padrão em instalações novas.

---

## 6. Plano de continuação sugerido (ordem de execução)

1. **Segurança (S1–S12)** + `DEMO_MODE` + `.env.example`.
   *Aceite:* `POST /api/auth/login {"userId":1}` → 400/401 sem `DEMO_MODE`; requisição só com `x-user-id` → 401; ENCARREGADO em `GET /api/users` → 403; upload de SVG ou arquivo não-imagem → 400; login com senha correta continua funcionando para usuários existentes (migração de hash).
2. **Regras do RDO no backend (R1–R6).**
   *Aceite:* `POST /api/rdo` sobre folha `final` sem reabertura → 409; `DELETE` de folha final → 409; duas datas não podem ter o mesmo `folio_number` na mesma obra; reabertura exige motivo e fica registrada.
3. **Bugs B1/B2.**
4. **F1 + F2 + F4** (gestão de usuários, troca de senha, sessão/401 global, permissões por perfil).
5. **O1** (compressão/multipart das fotos de ocorrência).
6. **D1–D7** (login com 8 módulos, README, documentação, workflow no lugar certo, limpeza de arquivo/código morto, seeds só em demo).
7. **Q1** (testes mínimos de API) → depois Q2–Q6 e O2.

### Regras para quem continuar
- Interface e mensagens em **português do Brasil**; manter o padrão visual (Tailwind, paleta slate/amber) e o layout responsivo novo.
- Não versionar `backend/data/*` nem `backend/uploads/*`.
- Migrations sempre **aditivas** (padrão `ensure*Columns`) — o banco de produção não pode ser recriado; mudanças de valores (ex.: status) exigem migração explícita.
- Toda regra de negócio aplicada na tela (bloqueios, numeração, permissões) deve ser **repetida no backend**.
- Sempre validar `canUserAccessProject()` em qualquer rota que receba `project_id` ou id de registro ligado a obra.
- Antes de cada commit: `npm run build` e subir o backend (`PORT=3999 node backend/src/server.js`) testando `/api/health` e login.
