#!/usr/bin/env sh
set -eu

usage() {
  echo "Usage: sh writing/utils.read_only/sync_bibs_from_papers.sh <writing-project> [references|ai|both]"
}

PROJECT="${1:-}"
MODE="${2:-both}"
ROOT="${RB_WORKSPACE_ROOT:-$(pwd)}"

if [ -z "$PROJECT" ]; then
  usage
  exit 2
fi

case "$MODE" in
  references|ai|both) ;;
  *) usage; exit 2 ;;
esac

DEST="$ROOT/writing/Project/$PROJECT/bibs"
if [ ! -d "$DEST" ]; then
  echo "Writing project not found: writing/Project/$PROJECT"
  echo "Available projects:"
  sh "$ROOT/writing/utils.read_only/list_writing_projects.sh" || true
  exit 1
fi

copy_one() {
  SRC="$1"
  OUT="$2"
  if [ ! -f "$SRC" ]; then
    echo "Missing source: $SRC"
    return 1
  fi
  mkdir -p "$DEST"
  cp "$SRC" "$DEST/$OUT"
  echo "Synced $SRC -> writing/Project/$PROJECT/bibs/$OUT"
}

if [ "$MODE" = "references" ] || [ "$MODE" = "both" ]; then
  copy_one "$ROOT/papers/bib/references.read_only.bib" "references.read_only.bib"
fi

if [ "$MODE" = "ai" ] || [ "$MODE" = "both" ]; then
  copy_one "$ROOT/papers/bib/ai-generated.bib" "ai_generated.bib"
fi
