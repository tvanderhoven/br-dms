# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Nginx ───────────────────────────────────────────────
FROM nginx:1.30-alpine
COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
