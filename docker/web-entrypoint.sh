#!/bin/sh
set -e

if [ -n "$NEXT_PUBLIC_API_URL" ] && [ "$NEXT_PUBLIC_API_URL" != "__RUNTIME_NEXT_PUBLIC_API_URL__" ]; then
  find /app/apps/web/.next -type f \( -name '*.js' -o -name '*.html' \) -print0 \
    | xargs -0 sed -i "s|__RUNTIME_NEXT_PUBLIC_API_URL__|$NEXT_PUBLIC_API_URL|g"
fi

exec node apps/web/server.js
