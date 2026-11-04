# Build shell SPA lalu sajikan sebagai berkas statis lewat nginx.
# Konteks build adalah akar repositori (lihat docker-compose.yml).

FROM node:22-alpine AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

# Salin seluruh repositori (node_modules dan dist sudah dibuang oleh
# .dockerignore) agar pnpm dapat menyelesaikan seluruh workspace.
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @low-stress/web build

FROM nginx:1.27-alpine AS runtime
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
