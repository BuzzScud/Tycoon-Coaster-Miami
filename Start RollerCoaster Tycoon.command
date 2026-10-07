#!/bin/bash
# Opens the built game. Finds itself, so the folder can be moved.
cd "$(dirname "$0")"
if [ ! -f dist/index.html ]; then
  echo "Building the game first (needs node)..."; npm run build || { echo "Build failed"; read -r; exit 1; }
fi
open dist/index.html
