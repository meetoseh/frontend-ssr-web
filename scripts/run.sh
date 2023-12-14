#!/usr/bin/env bash
source /root/.bashrc
source /root/.nvm/nvm.sh
source /home/ec2-user/config.sh
npx ts-node --experimental-specifier-resolution=node --esm build/server/server.bundle.js --host 0.0.0.0 --port 80 --reuse-artifacts | tee >(split --additional-suffix=.log -d -b 1000000 - debug.0)
