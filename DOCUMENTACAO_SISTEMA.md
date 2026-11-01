# 📘 Documentação Oficial do Sistema — AXIS OBRA

**Sistema Integrado de Gerenciamento de Obras e Engenharia Civil**  
**Versão:** 1.0.0  
**Repositório Oficial:** `https://github.com/cesarsecco-gif/axis-obra`

---

## Sumário

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura e Tecnologias Utilizadas](#2-arquitetura-e-tecnologias-utilizadas)
3. [Estrutura de Diretórios do Projeto](#3-estrutura-de-diretórios-do-projeto)
4. [Controle de Acesso e Perfis de Usuário (RBAC)](#4-controle-de-acesso-e-perfis-de-usuário-rbac)
5. [Manual dos Módulos do Sistema](#5-manual-dos-módulos-do-sistema)
   - [5.1. Módulo 1 — Registro Fotográfico](#51-módulo-1--registro-fotográfico)
   - [5.2. Módulo 2 — Diário de Obras (RDO Padrão DER/PR)](#52-módulo-2--diário-de-obras-rdo-padrão-derpr)
   - [5.3. Módulo 3 — Registro de Ocorrências](#53-módulo-3--registro-de-ocorrências)
   - [5.4. Módulo 4 — Cadastro de Funcionários](#54-módulo-4--cadastro-de-funcionários)
   - [5.5. Módulo 5 — Cadastro de Equipamentos](#55-módulo-5--cadastro-de-equipamentos)
   - [5.6. Módulo 6 — Gerenciamento de Obras por Usuário](#56-módulo-6--gerenciamento-de-obras-por-usuário)
   - [5.7. Módulo 7 — Registro de Pluviometria e Análise INMET](#57-módulo-7--registro-de-pluviometria-e-análise-inmet)
   - [5.8. Módulo 8 — Configurações Gerais do Sistema](#58-módulo-8--configurações-gerais-do-sistema)
6. [Modelagem do Banco de Dados (SQLite)](#6-modelagem-do-banco-de-dados-sqlite)
7. [Referência da API REST (Endpoints)](#7-referência-da-api-rest-endpoints)
8. [Infraestrutura, Deploy no Coolify e Persistência de Dados](#8-infraestrutura-deploy-no-coolify-e-persistência-de-dados)
9. [Credenciais Padrão e Contas de Demonstração](#9-credenciais-padrão-e-contas-de-demonstração)

---

## 1. Visão Geral do Sistema

O **AXIS OBRA** é uma plataforma web *Full-Stack* desenvolvida para construtoras, incorporadoras e equipes de engenharia de campo. O objetivo central do sistema é consolidar o acompanhamento diário de obras (RDO Digital), garantindo rastreabilidade técnica, controle de efetivo e equipamentos, registro climático/pluviométrico, documentação fotográfica e gestão de não conformidades, com **isolamento de acesso às obras por usuário**.

---

## 2. Arquitetura e Tecnologias Utilizadas

| Camada | Tecnologia | Descrição |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite 6 | Interface SPA (Single Page Application) rápida e responsiva para uso em desktop, tablet ou smartphone em obra. |
| **Estilização** | Tailwind CSS 3 + Lucide Icons | Design system industrial de alto contraste adaptado para leitura rápida em campo. |
| **Backend** | Node.js (v22+) + Express 4 | API RESTful responsável pela autenticação, regras de negócio, RBAC e entrega dos arquivos estáticos. |
| **Banco de Dados** | SQLite Nativo (`node:sqlite`) | Banco relacional transacional em modo `WAL` (*Write-Ahead Logging*) para alta performance e zero dependência de compilação externa. |
| **Armazenamento de Mídia** | Multer + File System (`/uploads`) | Suporte a upload de imagens via `multipart/form-data` e geração de carimbo técnico em SVG/Base64. |
| **Autenticação** | Token Assinado HMAC-SHA256 | Autenticação stateless via cabeçalho `Authorization: Bearer <token>`. |
| **Containerização** | Docker (`node:22-alpine`) + Coolify | Imagem Docker unificada que compila o frontend e executa o backend na porta `3001`. |

---

## 3. Estrutura de Diretórios do Projeto

```text
AXIS OBRA/
├── backend/
│   ├── data/
│   │   └── axis_obra.db              # Banco de dados SQLite (persistido via volume na VPS)
│   ├── uploads/                      # Fotos de obra enviadas pelos usuários (persistido via volume)
│   ├── src/
│   │   ├── db.js                     # Criação de tabelas, migrations e seed inicial
│   │   └── server.js                 # Servidor Express, rotas da API REST, RBAC e healthcheck
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DashboardView.jsx     # Painel gerencial consolidado
│   │   │   ├── PhotosView.jsx        # Módulo 1: Registro Fotográfico
│   │   │   ├── OccurrencesView.jsx   # Módulo 2: Registro de Ocorrências
│   │   │   ├── EmployeesView.jsx     # Módulo 3: Cadastro de Funcionários
│   │   │   ├── EquipmentsView.jsx    # Módulo 4: Cadastro de Equipamentos
│   │   │   ├── ProjectsUsersView.jsx # Módulo 5: Gerenciamento de Obras por Usuário
│   │   │   └── PluviometryView.jsx   # Módulo 6: Registro de Pluviometria
│   │   ├── api.js                    # Cliente HTTP, controle de sessão JWT e formatadores
│   │   ├── App.jsx                   # Layout principal, barra lateral, login e filtro global de obra
│   │   ├── main.jsx                  # Ponto de entrada do React
│   │   └── index.css                 # Estilos globais Tailwind CSS
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── deploy/
│   └── github-actions-deploy.yml     # Template opcional para CI/CD via GitHub Actions
├── Dockerfile                        # Configuração de imagem de produção para o Coolify
├── docker-compose.yml                # Orquestração Docker com volumes nomeados
├── deploy.sh                         # Script auxiliar para deploy manual em servidor Linux
├── ecosystem.config.cjs              # Configuração para PM2
├── DOCUMENTACAO_SISTEMA.md           # Este documento
└── README.md                         # Guia rápido do repositório
```

---

## 4. Controle de Acesso e Perfis de Usuário (RBAC)

O sistema implementa controle de acesso baseado em função (*Role-Based Access Control*) combinado com vínculo explícito por obra (`project_users`):

1. **`ADMIN` (Administrador Geral / Diretoria)**:
   - Visualiza e edita **todas as obras** cadastradas no sistema automaticamente.
   - Pode cadastrar novas obras e excluir obras existentes.
   - Pode cadastrar novos usuários e definir na **Matriz de Permissões** quais obras cada usuário pode acessar.
2. **`ENGENHEIRO` (Engenheiro Civil / Residente)**:
   - Visualiza no painel, no seletor global e nos módulos operacionais **apenas as obras às quais foi vinculado** pelo Administrador.
   - Pode registrar fotos, ocorrências, pluviometria, funcionários e equipamentos dentro de suas obras vinculadas.
3. **`ENCARREGADO` (Mestre de Obras / Encarregado de Campo)**:
   - Visualiza e alimenta registros diários (fotos, ocorrências, pluviometria, efetivo) **exclusivamente nas obras em que está alocado**.
4. **`FISCAL` (Fiscalização / Cliente)**:
   - Acesso restrito às obras vinculadas ao seu perfil para acompanhamento técnico e auditoria.

---

## 5. Manual dos 6 Módulos do Sistema

### 5.1. Módulo 1 — Registro Fotográfico
- **Finalidade**: Documentar visualmente o avanço físico e a qualidade executiva da obra.
- **Funcionalidades**:
  - Upload de fotos direto do computador ou câmera do celular (`JPG`, `PNG`, `WEBP`, `SVG` até 15 MB).
  - Gerador integrado de **Carimbo Técnico de Demonstração** com dados da obra, etapa e data.
  - Classificação por **Etapa Construtiva**: *Terraplanagem, Fundação, Estrutura, Alvenaria, Instalações, Cobertura, Acabamento, Segurança (NR-18)* e *Vistoria*.
  - Registro de localização/pavimento, data da captura, condição climática no momento da foto e responsável técnico.
  - Galeria com busca textual, filtro por etapa e visualização ampliada (*Lightbox*).

### 5.2. Módulo 2 — Registro de Ocorrências
- **Finalidade**: Registrar fatos relevantes, acidentes/incidentes, atrasos de fornecedores, falhas de equipamentos e não conformidades.
- **Gerenciador de Campos Personalizáveis**:
  - Possui uma aba dedicada (**⚙️ Gerenciar Campos**) onde o usuário pode cadastrar, editar (nome e cor da etiqueta) ou excluir opções para os 4 parâmetros estruturais:
    1. **Categoria / Tipo** (`TYPE`)
    2. **Grau de Severidade** (`SEVERITY`)
    3. **Status** (`STATUS`)
    4. **Setor / Frente de Serviço** (`SECTOR`)
- **Funcionalidades**:
  - Categorização dinâmica por tipo, grau de severidade, status e setor/frente de serviço.
  - Registro obrigatório da descrição do fato e campo específico para **Providências Adotadas / Plano de Ação**.
  - Botões rápidos na listagem para avançar o status da ocorrência em 1 clique.

### 5.3. Módulo 3 — Cadastro de Funcionários
- **Finalidade**: Controlar o efetivo próprio e terceirizado alocado em cada canteiro.
- **Funcionalidades**:
  - Dados cadastrais: Nome completo, CPF (único), Matrícula interna (`FUNC-XXX`), Telefone e Função/Cargo.
  - Regime de contratação: `CLT` (Próprio), `TERCEIRIZADO` (Empreiteira) ou `PJ`, com identificação da empresa.
  - Controle de Segurança do Trabalho: Data de vencimento do **ASO** (Atestado de Saúde Ocupacional) e **Certificações NR** (`NR-10`, `NR-18`, `NR-33`, `NR-35`).
  - Gestão financeira de campo: Valor da diária (`R$`) e cálculo automático do custo diário do efetivo ativo.
  - Status do colaborador: `ATIVO`, `FERIAS`, `AFASTADO` ou `INATIVO`.

### 5.4. Módulo 4 — Cadastro de Equipamentos
- **Finalidade**: Controlar o parque de máquinas, ferramentas e equipamentos próprios ou alugados.
- **Funcionalidades**:
  - Identificação por **Código / TAG patrimonial** único (ex: `EQP-001`), nome, marca, modelo e número de série.
  - Categorias: *Linha Amarela/Pesado, Transporte Vertical (Grua/Cremalheira), Concretagem, Ferramental Elétrico, Andaimes/Escoramento, Topografia/Medição, Proteção Coletiva* e *Outros*.
  - Controle de propriedade (`PROPRIO` vs `LOCADO`), nome da locadora/fornecedor e custo diário (`R$`).
  - Monitoramento de manutenção: Datas da **Última Manutenção** e **Próxima Preventiva**, além de status (`OPERACIONAL`, `DISPONIVEL`, `EM_MANUTENCAO`, `INDISPONIVEL`).

### 5.5. Módulo 5 — Gerenciamento de Obras por Usuário
- **Finalidade**: Administrar o portfólio de obras e gerenciar quais profissionais têm acesso a cada canteiro.
- **Submódulo A — Obras Vinculadas**:
  - Cadastro de obras com código (`OBR-AAAA-NNN`), nome, cliente, endereço completo, datas de início e término previsto, orçamento (`R$`), área construída ($m^2$), status e percentual de avanço físico (`0%` a `100%`).
- **Submódulo B — Matriz de Acesso por Usuário**:
  - Tabela interativa onde o Administrador visualiza todos os usuários e ativa/desativa o vínculo com cada obra com 1 clique.
  - Cadastro de novos usuários já definindo suas obras iniciais.
  - Recurso **Simular Acesso** para testar imediatamente a visão restrita de qualquer Engenheiro ou Encarregado.

### 5.6. Módulo 6 — Registro de Pluviometria
- **Finalidade**: Registrar o boletim meteorológico diário da obra para fins de RDO e justificativa contratual de prazos.
- **Funcionalidades**:
  - Condição climática detalhada nos 3 turnos (**Manhã**, **Tarde** e **Noite**): *Sol, Nublado, Chuva Fraca, Chuva Forte, Impraticável* ou *Sem Expediente*.
  - Medição do índice pluviométrico diário em **milímetros (`mm`)** ($1\text{ mm} = 1\text{ L/m}^2$).
  - Registro de temperaturas mínima e máxima (°C), impacto na obra (`SEM_IMPACTO`, `IMPACTO_PARCIAL`, `PARALISACAO_TOTAL`) e **horas paralisadas**.
  - Gráfico de barras integrado exibindo a evolução das chuvas nos últimos dias registrados.

---

## 6. Modelagem do Banco de Dados (SQLite)

O banco de dados `axis_obra.db` é composto por **8 tabelas relacionais** com integridade referencial (`FOREIGN KEYS = ON`):

1. **`users`**: Armazena os usuários do sistema (`id`, `name`, `email`, `password_hash`, `role`, `crea_cft`, `phone`, `active`, `created_at`).
2. **`projects`**: Cadastro das obras (`id`, `code`, `name`, `client`, `address`, `city`, `state`, `start_date`, `expected_end_date`, `status`, `progress`, `budget`, `area_m2`, `description`, `created_at`).
3. **`project_users`**: Tabela associativa N:N que define o **Gerenciamento de Obras por Usuário** (`id`, `project_id`, `user_id`, `role_in_project`, `can_edit`, `assigned_at`).
4. **`employees`**: Cadastro de funcionários alocados (`id`, `name`, `cpf`, `registration_number`, `role`, `contract_type`, `company`, `phone`, `daily_rate`, `aso_expiry`, `nr_certifications`, `status`, `project_id`, `created_at`).
5. **`equipments`**: Cadastro de equipamentos e maquinário (`id`, `code`, `name`, `category`, `brand`, `model`, `serial_number`, `ownership`, `supplier`, `daily_cost`, `status`, `last_maintenance`, `next_maintenance`, `project_id`, `notes`, `created_at`).
6. **`photos`**: Registros fotográficos de evolução (`id`, `project_id`, `user_id`, `title`, `description`, `stage`, `location_area`, `taken_at`, `image_url`, `weather_condition`, `created_at`).
7. **`occurrences`**: Livro de ocorrências e não conformidades (`id`, `project_id`, `user_id`, `title`, `type`, `severity`, `status`, `occurrence_date`, `location_area`, `description`, `action_taken`, `responsible`, `created_at`).
8. **`pluviometry`**: Boletins diários de pluviometria (`id`, `project_id`, `user_id`, `record_date`, `morning_weather`, `afternoon_weather`, `night_weather`, `rainfall_mm`, `work_impact`, `hours_lost`, `temperature_min`, `temperature_max`, `notes`, `created_at`).

---

## 7. Referência da API REST (Endpoints)

Todas as rotas (exceto `/api/health`, `/api/auth/login` e `/api/auth/demo-users`) exigem autenticação e aplicam automaticamente o filtro de permissão de obras do usuário autenticado:

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Healthcheck de monitoramento para Docker / Coolify. |
| `POST` | `/api/auth/login` | Autentica usuário por `email`/`password` e retorna token assinado. |
| `GET` | `/api/auth/me` | Retorna os dados do usuário logado e IDs das obras permitidas. |
| `GET` | `/api/dashboard` | Indicadores consolidados filtrados pelas obras do usuário (ou `?projectId=`). |
| `GET / POST` | `/api/projects` | Lista obras permitidas ao usuário / Cadastra nova obra (`ADMIN`). |
| `PUT / DELETE` | `/api/projects/:id` | Atualiza dados e avanço físico da obra / Remove obra (`ADMIN`). |
| `POST / DELETE` | `/api/projects/:id/users` | Vincula ou desvincula acesso de um usuário a uma obra (`ADMIN`). |
| `GET / POST` | `/api/users` | Lista usuários e suas obras vinculadas / Cria novo usuário (`ADMIN`). |
| `GET / POST` | `/api/employees` | Lista e cadastra funcionários nas obras permitidas. |
| `PUT / DELETE` | `/api/employees/:id` | Atualiza ou remove cadastro de funcionário. |
| `GET / POST` | `/api/equipments` | Lista e cadastra equipamentos nas obras permitidas. |
| `PUT / DELETE` | `/api/equipments/:id` | Atualiza ou remove equipamento. |
| `GET / POST` | `/api/photos` | Lista fotos (filtro por `projectId` e `stage`) / Faz upload de nova foto. |
| `DELETE` | `/api/photos/:id` | Exclui um registro fotográfico. |
| `GET / POST` | `/api/occurrences` | Lista e registra ocorrências (filtro por `projectId`, `status`, `severity`). |
| `PUT / DELETE` | `/api/occurrences/:id` | Atualiza status/providências ou remove ocorrência. |
| `GET / POST` | `/api/pluviometry` | Lista e registra boletim pluviométrico diário. |
| `DELETE` | `/api/pluviometry/:id` | Exclui registro pluviométrico. |

---

## 8. Infraestrutura, Deploy no Coolify e Persistência de Dados

### Configuração no Coolify
- **Build Strategy**: `Dockerfile` (na raiz `/Dockerfile`)
- **Porta Exposta**: `3001`
- **Healthcheck**: `http://127.0.0.1:3001/api/health`

### Volumes Persistentes Obrigatórios
Para garantir que novos deploys não apaguem os dados cadastrados em produção, o container no Coolify utiliza dois mapeamentos em **Persistent Storage**:
1. `/app/backend/data` → Armazena o arquivo `axis_obra.db` (SQLite).
2. `/app/backend/uploads` → Armazena todas as fotografias enviadas pelos usuários.

### Como Atualizar o Sistema no Futuro
Sempre que qualquer alteração de código for enviada para a branch `main` do repositório `cesarsecco-gif/axis-obra` no GitHub:
1. O Coolify detecta o novo commit (ou você pode clicar em **Redeploy** no painel do Coolify).
2. O Coolify reconstrói a imagem com o novo código, preservando intactos os volumes `/app/backend/data` e `/app/backend/uploads`.

---

## 9. Credenciais Padrão e Contas de Demonstração

Na primeira inicialização do banco de dados, o sistema cria automaticamente 4 usuários de demonstração (todos com a senha padrão **`123456`**):

| Nome | E-mail | Perfil | Obras Vinculadas |
| :--- | :--- | :--- | :--- |
| **Carlos Eduardo Mendes** | `admin@axisobra.com.br` | `ADMIN` | Todas as Obras (`OBR-2026-001`, `002` e `003`) |
| **Eng. Mariana Costa** | `mariana@axisobra.com.br` | `ENGENHEIRO` | `OBR-2026-001` (Horizon) e `OBR-2026-003` (Clínica) |
| **Eng. Roberto Almeida** | `roberto@axisobra.com.br` | `ENGENHEIRO` | `OBR-2026-002` (Centro Logístico Campinas) |
| **João Batista Silva** | `joao@axisobra.com.br` | `ENCARREGADO` | `OBR-2026-001` (Residencial Horizon Towers) |

