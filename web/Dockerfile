# Build context is the repo root: docker build -f web/Dockerfile .
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

# The newest nginx-unprivileged digest lags Alpine's security fixes (zlib,
# curl, brotli, expat, libxslt, musl), and the scan gate fails on them. Drop
# this once a digest that passes the scan on its own ships.
USER root
RUN apk upgrade --no-cache
USER 101

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 web/40-adventure-config.sh /docker-entrypoint.d/40-adventure-config.sh
COPY --from=build /app/dist /usr/share/nginx/html/adventure

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8080/healthz || exit 1
