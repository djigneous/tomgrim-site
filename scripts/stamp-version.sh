#!/bin/sh
# pre-commit: (1) copy SITE_VERSION (grimos.js) into the titlebar and /stats login,
#             (2) cache-bust ?v= on grimos.css/js, contact.js, irc.js in the HTML pages.
set -e
cd "$(git rev-parse --show-toplevel)"
# version: SITE_VERSION in grimos.js is the single source (semver, see CHANGELOG.md); copy it into the titlebar + /stats tty
V=$(sed -n "s/^const SITE_VERSION = '\([0-9.]*\)'.*/\1/p" grimos.js)
if [ -n "$V" ]; then
  sed -i "s#<span class=\"brand\">GRIM/OS [v0-9.]*</span>#<span class=\"brand\">GRIM/OS v$V</span>#" index.html
  [ -f stats/stats.js ] && sed -i "s#GRIM/OS [0-9.]* (Downtempo) tty1#GRIM/OS $V (Downtempo) tty1#" stats/stats.js && git add stats/stats.js
  git add index.html
fi
B=$(TZ=America/New_York date +%Y%m%d%H%M%S)
for f in index.html contact.html irc.html; do
  [ -f "$f" ] || continue
  sed -i -E "s#(grimos\.css|grimos\.js|contact\.js|irc\.js)\?v=[0-9]+#\1?v=$B#g" "$f"
  git add "$f"
done
