FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

# The proxy never runs a package manager, and the scan gate would otherwise
# fail on npm's bundled dependencies.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg

# CVE-2026-4738 (zlib) and the OpenSSL CVEs fixed in 3.5.9-r1: the pinned base
# still carries the older packages. Drop each once a node:26-alpine digest
# ships it.
RUN apk add --no-cache --upgrade 'zlib>=1.4-r0' 'libssl3>=3.5.9-r1' 'libcrypto3>=3.5.9-r1'

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js generation.js limits.js gemini-response.js et-style-guide.js ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]
