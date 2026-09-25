# ================================================================
#  BR-DMS Backend – Multi-Stage Dockerfile
# ================================================================

# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src            ./src
COPY prisma         ./prisma

RUN npx prisma generate && npm run build

# ── Stage 2: Production ──────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache dumb-init su-exec poppler-utils openssl font-dejavu

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /build/node_modules/.prisma  ./node_modules/.prisma
COPY --from=builder /build/node_modules/@prisma  ./node_modules/@prisma
COPY --from=builder /build/dist                  ./dist
COPY prisma                                       ./prisma

RUN mkdir -p /data/storage /data/logs

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/entrypoint.sh"]
