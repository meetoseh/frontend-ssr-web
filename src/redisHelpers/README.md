# Lua Scripts

This repository is intended to contain lua scripts; I don't use
`defineScript`/`scripts` from `node-redis` since it does work we don't need
(e.g., we don't need to eagerly initialize scripts) and skips work we do need
(we assume scripts can be cleared at any time). See e.g.
https://github.com/redis/node-redis/issues/2676
