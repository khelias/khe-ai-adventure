# Build context is the repo root: docker build -f web/Dockerfile .
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b9241c6e7b8e9a862f129d8d4199ab64b10390949a78bdd5603379b32c844083

# CVE-2026-85091, CVE-2026-103111 and CVE-2026-4775: the pinned base still
# carries zlib 1.3.2-r0, pcre2 10.48-r0 and tiff 4.7.1-r0. Drop each package
# once an nginx-unprivileged digest ships zlib 1.3.2-r1, pcre2 10.49-r0 and
# tiff 4.7.2-r0.
USER root
RUN apk upgrade --no-cache zlib pcre2 tiff
USER 101

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 web/40-adventure-config.sh /docker-entrypoint.d/40-adventure-config.sh
COPY --from=build /app/dist /usr/share/nginx/html/adventure

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8080/healthz || exit 1
