
## Likes + feedback BBS (Supabase)

Backend: Supabase project `grimos` (`hlbllxgiexjqkqfmoxow`). The site only holds the **publishable** key and only calls
SECURITY DEFINER RPCs (`toggle_like`, `like_counts`, `post_message`, `get_messages`); tables have RLS on and no anon grants.
Rate limits: likes 30/h per client and per IP hash; posts 1/min and 10/day per IP hash. IPs are stored only as salted SHA-256 hashes.

**Moderating the BBS:** Supabase dashboard → project *grimos* → Table Editor → `messages` → set `hidden` to `true` on a row
(it disappears from the site on the next poll) or delete the row. Messages hitting the blocklist arrive already `hidden=true`; flip to `false` to approve.

## /stats (private traffic dashboard)

`thomasgrim.com/stats` (noindex, not linked, not in robots.txt/sitemap). Login is a passphrase checked by the `get_stats` RPC against a bcrypt hash in `private.config` (`stats_hash`); the passphrase itself is not in the repo.
- Collection: `grimos.js` calls `log_visit` once per page load and `update_visit` (interaction, time on page, tracks played) via keepalive fetch. Stored: hashed visitor id, day-salted IP hash (never the raw IP), UA, referrer, path, screen, timezone, language, Cloudflare country if present.
- Human = no bot UA, no `navigator.webdriver`, no datacenter hints (empty screen, or UTC + no language) **and** (an interaction, ≥8 s on page, or a track played). Everything else is shown as a bot with its reason.
- Owner exclusion: logging in on /stats sets `localStorage.grimOwner=1`; that browser's visits are not logged. Undo with "stop excluding this browser" at the bottom of /stats.
- Socials: Edge Function `social-snapshot` (source in `supabase/functions/`) runs every 6 h via pg_cron + pg_net and stores public YouTube/TikTok/Spotify counts in `social_stats`.
