# AXIS OBRA — Sistema de Gerenciamento de Obras e Engenharia

Sistema Full-Stack (Node.js/Express + SQLite nativo + React/Vite/Tailwind CSS) para gerenciamento completo de canteiros de obras com controle de acesso por usuário (RBAC).

---

## 🏗️ Módulos Inclusos

1. **Registro Fotográfico**: Upload de fotos de campo por etapa construtiva, localização, condição climática, autor e carimbo técnico.
2. **Registro de Ocorrências**: Controle de não conformidades, incidentes, atrasos, grau de severidade, status e plano de ação.
3. **Cadastro de Funcionários**: Gestão de efetivo próprio (`CLT`) e terceirizado (`TERCEIRIZADO`/`PJ`), funções, diárias, validade de ASO, certificações NR e obra alocada.
4. **Cadastro de Equipamentos**: Controle patrimonial (`PRÓPRIO`) e de locação (`LOCADO`), TAG, custo diário, status operacional e manutenção preventiva.
5. **Gerenciamento de Obras por Usuário (RBAC)**:
   - **Administrador (`ADMIN`)**: Acesso irrestrito a todas as obras e matriz de permissões para vincular/desvincular obras por usuário.
   - **Engenheiro / Encarregado / Fiscal**: Visualiza e opera exclusivamente nas obras às quais está vinculado.
6. **Registro de Pluviometria**: Boletim climático diário por turno (Manhã/Tarde/Noite), precipitação em milímetros (`mm`), horas paradas e gráfico pluviométrico.

---

## 💻 Como Rodar Localmente (No PC)

Requer **Node.js 22.5+** (ou superior, pois utiliza o módulo nativo `node:sqlite`).

```bash
# 1. Instalar dependências do backend e frontend
npm run install:all

# 2. Iniciar o Backend (porta 3001)
npm run start:backend

# 3. Em outro terminal, iniciar o Frontend em modo dev (porta 5173)
npm run start:frontend
```

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

O repositório já possui o workflow `.github/workflows/deploy.yml`. Para que a sua VPS seja atualizada **automaticamente** sempre que você alterar qualquer arquivo pelo GitHub (mesmo pelo celular ou outro computador), adicione os seguintes **Secrets** no seu repositório GitHub (*Settings > Secrets and variables > Actions > New repository secret*):

- `VPS_HOST`: IP ou domínio da sua VPS
- `VPS_USER`: Usuário SSH da VPS (ex: `root` ou `ubuntu`)
- `VPS_SSH_KEY`: Chave privada SSH para conexão na VPS
- `VPS_PORT`: Porta SSH (padrão `22`)
- `VPS_APP_DIR`: Caminho da pasta na VPS (ex: `/var/www/axis-obra`)

