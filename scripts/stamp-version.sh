#!/bin/sh
# pre-commit: (1) GrimOS last-updated stamp (year-2020).(month) in America/New_York,
#             (2) cache-bust ?v= on grimos.css/js, contact.js, irc.js in the HTML pages.
set -e
cd "$(git rev-parse --show-toplevel)"
Y=$(TZ=America/New_York date +%Y); M=$(TZ=America/New_York date +%-m)
V="$((Y - 2020)).$M"
CUR=$(sed -n "s/^const GRIMOS_VERSION = '\([0-9.]*\)'.*/\1/p" grimos.js)
if [ "$CUR" != "$V" ]; then
  sed -i "s/^const GRIMOS_VERSION = '[0-9.]*'/const GRIMOS_VERSION = '$V'/" grimos.js
  sed -i "s#<span class=\"brand\">GRIM/OS [0-9.]*</span>#<span class=\"brand\">GRIM/OS $V</span>#" index.html
  git add grimos.js index.html
  echo "stamp-version: GrimOS $CUR -> $V"
fi
B=$(TZ=America/New_York date +%Y%m%d%H%M%S)
for f in index.html contact.html irc.html; do
  [ -f "$f" ] || continue
  sed -i -E "s#(grimos\.css|grimos\.js|contact\.js|irc\.js)\?v=[0-9]+#\1?v=$B#g" "$f"
  git add "$f"
done
