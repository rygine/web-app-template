#!/bin/bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &>/dev/null && pwd)"
cd "$repo_root"

image="${IMAGE:-untitled:local}"
name="${CONTAINER_NAME:-untitled}"
volume="${1:-./data}"
logs="${2:-./logs}"

if [[ $# -gt 2 ]]; then
  echo "usage: ${BASH_SOURCE[0]##*/} [volume] [logs]" >&2
  exit 2
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not running" >&2
  exit 1
fi

if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "image '$image' not found — run ./dev/build.sh first" >&2
  exit 1
fi

# Docker would otherwise create a missing bind source owned by root.
for dir in "$volume" "$logs"; do
  if [[ ! -d "$dir" ]]; then
    echo "volume '$dir' does not exist — create it first" >&2
    exit 1
  fi
done
volume="$(cd -- "$volume" &>/dev/null && pwd)"
logs="$(cd -- "$logs" &>/dev/null && pwd)"

export IMAGE="$image" CONTAINER_NAME="$name"
export DATA_PATH="$volume" LOGS_PATH="$logs"

# --wait polls the HEALTHCHECK and exits non-zero if it never passes.
if ! docker compose up --detach --wait --wait-timeout 60 --force-recreate; then
  echo >&2
  docker compose logs --tail 20 >&2 || true
  # Stop rather than remove: a crash loop would otherwise outlive this script.
  docker compose stop >/dev/null 2>&1 || true
  echo >&2
  echo "container stopped; full logs: docker compose logs" >&2
  exit 1
fi

published="$(docker port "$name" 2>/dev/null | head -n1 | sed 's/.*-> //' || true)"

echo
echo "running:  http://${published:-127.0.0.1:3000}"
echo "data:     $volume"
echo "logs:     $logs"
echo "output:   docker compose logs -f"
echo "stop:     ./dev/down.sh"
