# Build context is the repo root: docker build -f services/judge/Dockerfile .
#
# The judge shells out to `docker run` to execute submissions in hardened
# sandbox containers. In production it talks to the *host* Docker daemon via a
# mounted /var/run/docker.sock, so the sandbox containers are siblings on the
# host — not nested. Because `docker run -v <dir>:/work` resolves <dir> on the
# host, the judge writes its scratch files under a path that is bind-mounted
# identically on host and container (TMPDIR=/var/arena/work, see compose).
FROM node:20-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Static Docker CLI only (no daemon) — used to drive the mounted host socket.
ARG DOCKER_VERSION=27.3.1
RUN curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz" \
  | tar xz --strip-components=1 -C /usr/local/bin docker/docker

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY services/judge/package.json services/judge/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY services/judge services/judge
# The judge uses @prisma/client; generate against the API's schema.
COPY services/api/prisma services/api/prisma
COPY services/api/package.json services/api/package.json
RUN pnpm --filter @arena/shared build \
  && pnpm --filter @arena/api prisma generate \
  && pnpm --filter @arena/judge build

WORKDIR /app/services/judge
ENV TMPDIR=/var/arena/work
CMD ["node", "dist/worker.js"]
