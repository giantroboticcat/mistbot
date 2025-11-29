#!/bin/bash
# Quick script to load nvm and verify Node.js/npm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

echo "NVM loaded. Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"

