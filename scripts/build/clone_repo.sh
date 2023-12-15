#!/usr/bin/env bash
cp config.sh /home/ec2-user/config.sh
cp repo.sh /home/ec2-user/repo.sh

bash ensure_git_lfs.sh
source /home/ec2-user/repo.sh

cd /usr/local/src
git clone --depth 1 "https://${GITHUB_USERNAME}:${GITHUB_PAT}@github.com/${GITHUB_REPOSITORY}" webapp
cd webapp
git lfs pull