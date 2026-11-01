#!/usr/bin/env bash
set -e

echo "=========================================="
echo " Iniciando Deploy do AXIS OBRA na VPS..."
echo "=========================================="

# Garante que as pastas de dados e uploads existam e não sejam apagadas
mkdir -p backend/data backend/uploads

echo "-> Baixando atualizações do GitHub..."
git pull origin main

echo "-> Instalando dependências do Backend..."
npm --prefix backend install --omit=dev

echo "-> Instalando dependências e gerando build do Frontend..."
npm --prefix frontend install
npm --prefix frontend run build

echo "-> Reiniciando aplicação no PM2..."
if pm2 describe axis-obra > /dev/null 2>&1; then
  pm2 restart axis-obra
else
  pm2 start ecosystem.config.cjs
  pm2 save
fi

echo "=========================================="
echo " Deploy concluído com sucesso!"
echo "=========================================="

