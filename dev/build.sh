#!/bin/bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &>/dev/null && pwd)"
cd "$repo_root"

image="${IMAGE:-untitled:local}"

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not running" >&2
  exit 1
fi

IMAGE="$image" docker compose build "$@"

echo
echo "built: $image"
echo "run:   ./dev/run.sh [volume]"
