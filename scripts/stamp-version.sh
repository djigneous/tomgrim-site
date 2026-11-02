#!/bin/sh
# pre-commit: cache-bust ?v= on grimos.css/js, contact.js, irc.js in the HTML pages.
# No version stamping: the site version is SITE_VERSION in grimos.js (semver, bumped by hand per release; the titlebar reads it).
set -e
cd "$(git rev-parse --show-toplevel)"
B=$(TZ=America/New_York date +%Y%m%d%H%M%S)
for f in index.html contact.html irc.html; do
  [ -f "$f" ] || continue
  sed -i -E "s#(grimos\.css|grimos\.js|contact\.js|irc\.js)\?v=[0-9]+#\1?v=$B#g" "$f"
  git add "$f"
done
