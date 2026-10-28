
## Likes + feedback BBS (Supabase)

Backend: Supabase project `grimos` (`hlbllxgiexjqkqfmoxow`). The site only holds the **publishable** key and only calls
SECURITY DEFINER RPCs (`toggle_like`, `like_counts`, `post_message`, `get_messages`); tables have RLS on and no anon grants.
Rate limits: likes 30/h per client and per IP hash; posts 1/min and 10/day per IP hash. IPs are stored only as salted SHA-256 hashes.

**Moderating the BBS:** Supabase dashboard → project *grimos* → Table Editor → `messages` → set `hidden` to `true` on a row
(it disappears from the site on the next poll) or delete the row. Messages hitting the blocklist arrive already `hidden=true`; flip to `false` to approve.
