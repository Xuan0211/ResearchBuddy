#!/usr/bin/env sh
# writing/utils.read_only/github_sync.sh
# Sync a writing project to/from its configured GitHub repository.
#
# Usage:
#   sh writing/utils.read_only/github_sync.sh <writing-id> push [--token TOKEN]
#   sh writing/utils.read_only/github_sync.sh <writing-id> pull [--token TOKEN]
#
# Environment:
#   GITHUB_TOKEN  — GitHub Personal Access Token (alternative to --token)
#   RB_WORKSPACE_ROOT — project root (defaults to current directory)
#
# For push: force-pushes writing project files to GitHub main branch.
# For pull: clones GitHub repo and copies files into the writing project.
# The manifest (manifest.read_only.json) and skills/ directory are never touched.
#
# Prerequisites for HTTPS repos: set GITHUB_TOKEN or pass --token.
# Prerequisites for SSH repos: ensure your SSH key is configured for GitHub.

set -eu

usage() {
  echo "Usage: sh writing/utils.read_only/github_sync.sh <writing-id> push|pull [--token TOKEN]"
  echo ""
  echo "  push  — push local writing project files to GitHub (force)"
  echo "  pull  — pull files from GitHub into local writing project"
  echo ""
  echo "Set GITHUB_TOKEN env var or pass --token for HTTPS authentication."
}

WRITING_ID="${1:-}"
DIRECTION="${2:-}"
TOKEN="${GITHUB_TOKEN:-}"
ROOT="${RB_WORKSPACE_ROOT:-$(pwd)}"

shift 2 2>/dev/null || true
while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1"; usage; exit 2 ;;
  esac
done

if [ -z "$WRITING_ID" ] || [ -z "$DIRECTION" ]; then
  usage; exit 2
fi

case "$DIRECTION" in
  push|pull) ;;
  *) echo "Unknown direction: $DIRECTION"; usage; exit 2 ;;
esac

MANIFEST="$ROOT/writing/Project/$WRITING_ID/manifest.read_only.json"
if [ ! -f "$MANIFEST" ]; then
  echo "Writing project not found: writing/Project/$WRITING_ID"
  exit 1
fi

GITHUB_URL=$(python3 -c "import json,sys; d=json.load(open('$MANIFEST')); u=d.get('github_url',''); print(u) if u else sys.exit(1)" 2>/dev/null) || {
  echo "No GitHub URL configured in manifest.read_only.json"
  exit 1
}

# Embed token into HTTPS URL if provided
if [ -n "$TOKEN" ]; then
  GITHUB_URL=$(echo "$GITHUB_URL" | sed "s|^https://|https://$TOKEN@|")
fi

WRITING_DIR="$ROOT/writing/Project/$WRITING_ID"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

case "$DIRECTION" in
  push)
    echo "Pushing writing project '$WRITING_ID' to GitHub..."
    PUSH_DIR="$TMPDIR/push"
    mkdir -p "$PUSH_DIR"

    # Copy project files (exclude skills/, manifest, .gitkeep)
    find "$WRITING_DIR" -mindepth 1 -not -path "*/skills/*" -not -name "manifest.read_only.json" -not -name ".gitkeep" | while read -r f; do
      REL="${f#$WRITING_DIR/}"
      DEST="$PUSH_DIR/$REL"
      if [ -d "$f" ]; then
        mkdir -p "$DEST"
      else
        mkdir -p "$(dirname "$DEST")"
        cp "$f" "$DEST"
      fi
    done

    cd "$PUSH_DIR"
    git init -b main
    git config user.name "ResearchBuddy"
    git config user.email "bot@researchbuddy"
    git add .
    git diff --cached --quiet || git commit -m "Sync from ResearchBuddy $(date '+%Y-%m-%d %H:%M')"
    git push --force "$GITHUB_URL" HEAD:main
    echo "Done. Pushed to GitHub."
    ;;

  pull)
    echo "Pulling from GitHub into writing project '$WRITING_ID'..."
    CLONE_DIR="$TMPDIR/github"
    git clone --depth 1 "$GITHUB_URL" "$CLONE_DIR"

    # Copy files back (exclude .git, skills/, manifest)
    find "$CLONE_DIR" -mindepth 1 -not -path "*/.git/*" -not -path "$CLONE_DIR/.git" \
        -not -path "*/skills/*" -not -name "manifest.read_only.json" | while read -r f; do
      REL="${f#$CLONE_DIR/}"
      DEST="$WRITING_DIR/$REL"
      if [ -d "$f" ]; then
        mkdir -p "$DEST"
      else
        mkdir -p "$(dirname "$DEST")"
        cp "$f" "$DEST"
      fi
    done

    echo "Done. Files pulled from GitHub."
    echo "Remember to commit the changes to the ResearchBuddy workspace."
    ;;
esac
