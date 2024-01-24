local key = KEYS[1]
local value = ARGV[1]

local current_value = redis.call("GET", key)
if (current_value ~= false) and (tonumber(current_value) <= tonumber(value)) then
    return 0
end

redis.call("SET", key, value)
return 1
