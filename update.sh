#!/bin/bash
# ===== Z-Route Planner: обновление с GitHub одной командой =====
set -e

PROJECT_DIR=$(echo ~/denisgogoleff2015-sudo-z-route-planner-*)
BACKUP_DIR=~/map_backups
REPO_URL="https://github.com/denisgogoleff2015-sudo/z-route-planner/tarball/main"

echo "=== 1/5: Backup map ==="
mkdir -p "$BACKUP_DIR"
if [ -f "$PROJECT_DIR/map_state.json" ]; then
  cp "$PROJECT_DIR/map_state.json" "$BACKUP_DIR/map_state_$(date +%Y%m%d_%H%M%S).json"
  ls -t "$BACKUP_DIR"/map_state_*.json | tail -n +21 | xargs -r rm
  echo "Map backed up to $BACKUP_DIR"
fi

echo "=== 2/5: Download latest code from GitHub ==="
cd "$PROJECT_DIR"
curl -sL "$REPO_URL" | tar -xz --strip-components=1

echo "=== 3/5: Restore live map (git version is empty) ==="
LATEST=$(ls -t "$BACKUP_DIR"/map_state_*.json 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
  cp "$LATEST" "$PROJECT_DIR/map_state.json"
  echo "Map restored from $LATEST"
fi

echo "=== 4/5: npm install ==="
npm install --silent

echo "=== 5/5: Restart server ==="
pm2 restart zroute

echo ""
echo "DONE — сайт обновлён, карта на месте."
pm2 status zroute
