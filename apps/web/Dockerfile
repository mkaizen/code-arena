# Build context is the repo root: docker build -f apps/web/Dockerfile .
#
# Produces the public edge: a Caddy image serving the built SPA and reverse-
# proxying /api/* (and the /api/ws WebSocket) to the API container. Caddy also
# terminates TLS via automatic Let's Encrypt certificates for $DOMAIN.
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY services/api/package.json services/api/
COPY services/judge/package.json services/judge/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web
# The prerender step (below) reads the canonical problem data from the seed to
# bake SEO content into static per-problem HTML.
COPY services/api/prisma/seed.ts services/api/prisma/seed.ts

# Baked at build time. The compose file passes https://$DOMAIN/api so REST hits
# /api/* and the WS client derives wss://$DOMAIN/api/ws — both stripped to root
# by Caddy's handle_path before reaching the API.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
# Public OAuth client IDs (optional — blank disables that provider's button).
ARG VITE_GITHUB_CLIENT_ID=
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GITHUB_CLIENT_ID=$VITE_GITHUB_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
# Build the SPA, then prerender per-problem HTML (SSG) for SEO.
RUN pnpm --filter @arena/shared build \
  && pnpm --filter @arena/web build \
  && node apps/web/prerender.mjs

FROM caddy:2-alpine
COPY --from=build /app/apps/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
