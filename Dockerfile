FROM node:22-alpine

WORKDIR /app

# 1. Instalar dependências do Backend
COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev

# 2. Instalar dependências e compilar o Frontend (React + Vite)
COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend install
COPY frontend/ ./frontend/
RUN npm --prefix frontend run build

# 3. Copiar código do Backend e criar diretórios persistentes
COPY backend/src ./backend/src
RUN mkdir -p /app/backend/data /app/backend/uploads

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "backend/src/server.js"]
