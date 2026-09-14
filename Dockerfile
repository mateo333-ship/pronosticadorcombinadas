FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Aqui se guarda la cache en disco y las notas de lesiones: conviene
# montarlo como volumen (ver docker-compose.yml) para que no se pierda
# al reconstruir el contenedor.
RUN mkdir -p /app/.cache

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
