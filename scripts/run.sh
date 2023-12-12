#!/usr/bin/env bash
source /root/.bashrc
source /root/.nvm/nvm.sh
source /home/ec2-user/config.sh
npx ts-node --experimental-specifier-resolution=node --esm src/index.ts --host 0.0.0.0 --port 80
