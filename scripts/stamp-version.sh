#!/bin/sh
# Recompute the GrimOS last-updated stamp: (year - 2020).(month), America/New_York.
# Called by the git pre-commit hook; only rewrites files when the stamp changes.
set -e
cd "$(git rev-parse --show-toplevel)"
Y=$(TZ=America/New_York date +%Y); M=$(TZ=America/New_York date +%-m)
V="$((Y - 2020)).$M"
CUR=$(sed -n "s/^const GRIMOS_VERSION = '\([0-9.]*\)'.*/\1/p" grimos.js)
[ "$CUR" = "$V" ] && exit 0
sed -i "s/^const GRIMOS_VERSION = '[0-9.]*'/const GRIMOS_VERSION = '$V'/" grimos.js
sed -i "s#<span class=\"brand\">GRIM/OS [0-9.]*</span>#<span class=\"brand\">GRIM/OS $V</span>#" index.html
git add grimos.js index.html
echo "stamp-version: GrimOS $CUR -> $V"
