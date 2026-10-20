# Build context is the repo root: docker build -f web/Dockerfile .
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

# CVE-2026-85091: the pinned base still carries zlib 1.3.2-r0. Drop this once
# an nginx-unprivileged digest ships zlib 1.3.2-r1.
USER root
RUN apk upgrade --no-cache zlib
USER 101

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 web/40-adventure-config.sh /docker-entrypoint.d/40-adventure-config.sh
COPY --from=build /app/dist /usr/share/nginx/html/adventure

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8080/healthz || exit 1
