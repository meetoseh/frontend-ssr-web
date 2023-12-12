#!/usr/bin/env bash
screen -dmS webapp ./scripts/run.sh

wait_for_updater_lock() {
  local ctr=0
  while [ ! -f updater.lock ]
  do
    echo "Waiting for updater.lock"

    ctr=$((ctr+1))
    if [ $ctr -gt 30 ]
    then
      echo "Timeout waiting for updater.lock"
      return 1
    fi
    sleep 1
  done
}

wait_for_updater_lock