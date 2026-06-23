# Build context is the repo root: docker build -f services/api/Dockerfile .
FROM node:20-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Install workspace deps (lockfile needs every package manifest present).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY services/judge/package.json services/judge/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Build shared lib, generate Prisma client, compile the API.
COPY packages/shared packages/shared
COPY services/api services/api
RUN pnpm --filter @arena/shared build \
  && pnpm --filter @arena/api prisma generate \
  && pnpm --filter @arena/api build

WORKDIR /app/services/api
EXPOSE 8080
# Apply pending migrations on boot, then serve. Idempotent; single replica.
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/server.js"]
