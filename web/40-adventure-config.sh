#!/bin/sh
# Runs from the nginx image's /docker-entrypoint.d/ before nginx starts. Writes
# the runtime config the frontend reads as window.__ADVENTURE_CONFIG__, served
# at /adventure/config.js (web/nginx.conf).
set -eu

out=/tmp/adventure-config.js
secret=${API_SECRET:-}

case $secret in
  *[[:cntrl:]]*)
    echo "$0: API_SECRET contains a control character, refusing to write $out" >&2
    exit 1
    ;;
esac

if [ -z "$secret" ]; then
  echo "$0: API_SECRET is empty, requests to the proxy will be unsigned" >&2
fi

escaped=$(printf '%s' "$secret" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
printf 'window.__ADVENTURE_CONFIG__ = { "apiSecret": "%s" };\n' "$escaped" > "$out"
