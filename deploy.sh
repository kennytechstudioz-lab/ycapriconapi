#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "Deploying Youngcap API..."
npm install
npm run build
pm2 restart ycapricon-api || pm2 start dist/index.js --name "ycapricon-api"
echo "Youngcap API deployed successfully!"
