#!/usr/bin/env sh
set -eu

ROOT="${RB_WORKSPACE_ROOT:-$(pwd)}"
PROJECT_ROOT="$ROOT/writing/Project"

if [ ! -d "$PROJECT_ROOT" ]; then
  echo "No writing/Project directory found under $ROOT"
  exit 0
fi

find "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
