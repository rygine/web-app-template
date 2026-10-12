#!/bin/bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &>/dev/null && pwd)"
cd "$repo_root"

name="${CONTAINER_NAME:-untitled}"

if [[ $# -gt 0 ]]; then
  echo "usage: ${BASH_SOURCE[0]##*/}" >&2
  exit 2
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not running" >&2
  exit 1
fi

if [[ -n "$(docker ps -aq --filter "name=^${name}$")" ]]; then
  CONTAINER_NAME="$name" docker compose down >/dev/null
  removed="removed container '$name'"
else
  removed="no container named '$name'"
fi

echo
echo "stopped: $removed"
echo "data:    untouched"
echo "start:   ./dev/run.sh [volume]"
