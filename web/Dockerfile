# Build context is the repo root: docker build -f web/Dockerfile .
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:26b0bf6fbf07297983cb341998d79c831508787de26627dd2a112321b9c3a4af

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 web/40-adventure-config.sh /docker-entrypoint.d/40-adventure-config.sh
COPY --from=build /app/dist /usr/share/nginx/html/adventure

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8080/healthz || exit 1
