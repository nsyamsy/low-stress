# Server Fastify + Socket.IO. Runtime memakai tsx karena registry game
# memuat `games/*/manifest.ts` saat boot.

FROM node:22-alpine
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 3001

# Migrasi inti dijalankan sebelum server; aman diulang karena Drizzle
# mencatat migrasi yang sudah diterapkan.
CMD ["sh", "-c", "pnpm db:migrate && pnpm --filter @low-stress/server start"]
