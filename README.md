# AXIS OBRA — Sistema de Gerenciamento de Obras e Engenharia

Sistema Full-Stack (Node.js/Express + SQLite nativo + React/Vite/Tailwind CSS) para gerenciamento completo de canteiros de obras com controle de acesso por usuário (RBAC).

---

## 🏗️ Módulos

1. **Registro Fotográfico** — fotos por etapa construtiva, local e data; relatório fotográfico A4 (PDF/Excel).
2. **Diário de Obras (RDO, padrão DER/PR)** — calendário, geração em lote a partir das fotos, finalização com bloqueio da folha, reabertura com motivo e histórico.
3. **Registro de Ocorrências** — não conformidades com fotos por fase, prazos, histórico de status, indicadores de SLA e relatórios.
4. **Cadastro de Funcionários** — efetivo CLT/terceirizado/PJ, ASO, NRs e diárias.
5. **Cadastro de Equipamentos** — próprios e locados, custos e manutenção preventiva.
6. **Obras por Usuário** — cadastro de obras e usuários; cada usuário acessa apenas as obras vinculadas.
7. **Registro de Pluviometria** — chuva em mm por turno, importação de CSV do INMET, gráficos e quadros analíticos.
8. **Configurações** — campos de ocorrência, cabeçalhos dos relatórios e backup do banco de dados.

### Perfis de acesso

| Perfil | O que pode fazer |
| :--- | :--- |
| `ADMIN` | Tudo, em todas as obras: usuários, permissões, configurações, backup. |
| `ENGENHEIRO` | Opera as obras vinculadas; finaliza, reabre e exclui RDO; altera configurações de relatórios. |
| `ENCARREGADO` | Registra fotos, RDO (rascunho), ocorrências e pluviometria nas obras vinculadas. Não finaliza nem exclui RDO. |
| `FISCAL` | Somente consulta das obras vinculadas. |

### Acesso

- **Administrador principal:** `cesarsecco@gmail.com` — senha inicial `123456` (**troque no primeiro acesso** em *Alterar Senha*).
- Login por **e-mail e senha** ou por **código de 6 dígitos enviado por e-mail**.
- **Esqueci minha senha:** o usuário recebe um código por e-mail e cria uma nova senha.
- As opções por e-mail exigem SMTP configurado (veja *Variáveis de ambiente*).

---

## 💻 Como Rodar Localmente (No PC)

Requer **Node.js 22.5+** (usa o módulo nativo `node:sqlite`).

```bash
# 1. Instalar dependências do backend e frontend
npm run install:all

# 2. Iniciar o Backend (porta 3001)
npm run start:backend

# 3. Em outro terminal, iniciar o Frontend em modo dev (porta 5173)
npm run start:frontend

# Testes automáticos da API
npm test
```

Sem SMTP configurado, fora de produção, os códigos enviados "por e-mail" aparecem no **terminal do backend**.

---

## ⚙️ Variáveis de ambiente

Veja o arquivo [`.env.example`](.env.example). As principais:

| Variável | Para que serve |
| :--- | :--- |
| `TOKEN_SECRET` | Assinatura das sessões. Se ausente, é gerado e salvo em `backend/data/.token_secret`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio dos códigos de acesso e de recuperação de senha. |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_INITIAL_PASSWORD` | Administrador principal criado na inicialização, se ainda não existir. |
| `CORS_ORIGIN` | Só se o frontend for hospedado em outro domínio. |

**Gmail como SMTP:** ative a verificação em duas etapas na conta, gere uma *Senha de app* em <https://myaccount.google.com/apppasswords> e use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=<seu e-mail>` e `SMTP_PASS=<senha de app>`.

---

## 🚀 Como Hospedar na VPS (Ubuntu / Debian)

### 1. Preparação Inicial na VPS (executado apenas 1 vez)

Conecte-se à sua VPS via SSH e instale o Node.js (v22+) e o PM2:

```bash
# Instalar Node.js 22.x e Git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Instalar o gerenciador de processos PM2 globalmente
sudo npm install -g pm2

# Criar pasta da aplicação e clonar o repositório do GitHub
sudo mkdir -p /var/www/axis-obra
sudo chown -R $USER:$USER /var/www/axis-obra
git clone git@github.com:cesarsecco-gif/axis-obra.git /var/www/axis-obra
cd /var/www/axis-obra

# Executar o script de deploy
chmod +x deploy.sh
./deploy.sh

# Configurar PM2 para iniciar automaticamente caso a VPS reinicie
pm2 startup
pm2 save
```

A aplicação ficará disponível na porta `3001` (servindo tanto a API quanto o Frontend React compilado).

### 2. Atualização Manual na VPS (se desejar atualizar via comando)

Sempre que quiser atualizar a VPS manualmente:

```bash
cd /var/www/axis-obra
./deploy.sh
```

> **Nota de Segurança dos Dados**: O banco de dados SQLite (`backend/data/axis_obra.db`) e as fotos enviadas (`backend/uploads/`) estão protegidos no `.gitignore` e **não são sobrescritos** ao executar `git pull` ou `./deploy.sh`.

### 3. Deploy Automático pelo GitHub (GitHub Actions)

O repositório traz um modelo de workflow em `deploy/github-actions-deploy.yml`. Copie-o para `.github/workflows/deploy.yml` para ativá-lo. Para que a sua VPS seja atualizada **automaticamente** sempre que você alterar qualquer arquivo pelo GitHub (mesmo pelo celular ou outro computador), adicione os seguintes **Secrets** no seu repositório GitHub (*Settings > Secrets and variables > Actions > New repository secret*):

- `VPS_HOST`: IP ou domínio da sua VPS
- `VPS_USER`: Usuário SSH da VPS (ex: `root` ou `ubuntu`)
- `VPS_SSH_KEY`: Chave privada SSH para conexão na VPS
- `VPS_PORT`: Porta SSH (padrão `22`)
- `VPS_APP_DIR`: Caminho da pasta na VPS (ex: `/var/www/axis-obra`)

