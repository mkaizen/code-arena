#!/usr/bin/env bash
# Build the per-language sandbox images on the HOST Docker daemon. The judge
# launches these via the mounted docker.sock, so they must exist on the host
# (`docker images | grep arena-sandbox`) before submissions can be judged.
set -euo pipefail

cd "$(dirname "$0")/.."

DOCKERFILE=services/judge/Dockerfile.sandbox

# target name -> image tag
build() {
  local target="$1" tag="$2"
  echo ">> building arena-sandbox:${tag} (target ${target})"
  docker build -f "$DOCKERFILE" --target "$target" -t "arena-sandbox:${tag}" services/judge
}

build cpp  cpp
build py   py
build java java
build node node
build go   go
build rust rust

echo ">> done. sandbox images:"
docker images --filter=reference='arena-sandbox:*'
