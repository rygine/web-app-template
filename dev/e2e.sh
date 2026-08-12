#!/bin/bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &>/dev/null && pwd)"
cd "$repo_root"

# $$ keeps concurrent runs from colliding; the project name scopes every
# compose call below to this run alone.
export COMPOSE_PROJECT_NAME="untitled-e2e-$$"
export IMAGE="untitled:e2e-$$"
export CONTAINER_NAME="untitled-e2e-$$"
export PORT="${PORT:-3002}"
# The container gets the same key the suite sends, so nothing has to read it
# out of a database the suite never opens.
export API_KEY="${API_KEY:-e2e00000000000000000000000000000}"
volume="$repo_root/.tmp/$CONTAINER_NAME"
logs="$volume-logs"

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not running" >&2
  exit 1
fi

# Registered before anything is created, so a failure at any step still tears
# down. INT/TERM only exit: bash runs no EXIT trap for an untrapped signal, and
# routing them through it keeps cleanup to one path that cannot run twice.
cleanup() {
  # The suite is a background job, so a signal to this script never reaches it.
  if [[ -n "${child:-}" ]]; then
    kill "$child" >/dev/null 2>&1 || true
  fi

  echo
  echo "cleaning up:"

  docker compose down --volumes --rmi local >/dev/null 2>&1 || true
  echo "  compose:   removed project $COMPOSE_PROJECT_NAME"

  for dir in "$volume" "$logs"; do
    if [[ -d "$dir" ]]; then
      rm -rf "$dir"
      echo "  removed:   $dir"
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

./dev/build.sh >/dev/null

yarn prisma:generate >/dev/null

mkdir -p "$volume" "$logs"

TEST=1 ./dev/run.sh "$volume" "$logs" >/dev/null

echo "running e2e against container '$CONTAINER_NAME' at http://127.0.0.1:${PORT}"
echo

# Backgrounded, not foreground: bash defers traps until the foreground child
# exits, and `wait` is interruptible.
E2E_TARGET=docker E2E_BASE_URL="http://127.0.0.1:${PORT}" \
  yarn playwright test "$@" &
child=$!

wait "$child"
