// social-snapshot: scrapes PUBLIC counts (YouTube channel tabs, TikTok profile, Spotify page) and stores a snapshot.
// Runs server-side on a pg_cron schedule; uses the auto-injected service role env (no secrets in the repo).
import { createClient } from "npm:@supabase/supabase-js@2";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const get = async (u: string) => { const r = await fetch(u, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", cookie: "CONSENT=YES+1; SOCS=CAI" } }); return { ok: r.ok, status: r.status, text: await r.text() }; };
const num = (s?: string | null) => { if (!s) return null; const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i); if (!m) return null; return Math.round(parseFloat(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 } as any)[(m[2] || "").toUpperCase()] || parseFloat(m[1])); };
const unesc = (s: string) => { try { return JSON.parse('"' + s + '"'); } catch { return s; } };

async function youtube() {
  const out: any = { handle: "@ig3.productions", subscribers: null, items: [] as any[] };
  const sh = await get("https://www.youtube.com/@ig3.productions/shorts");
  out.status = sh.status;
  const sub = sh.text.match(/([\d.,]+[KMB]?) subscribers/); out.subscribers = num(sub && sub[1]);
  const seen = new Set<string>();
  for (const m of sh.text.matchAll(/"videoId":"([\w-]{11})"[\s\S]{0,4000}?"accessibilityText":"((?:[^"\\]|\\.)*?), ([\d.,KMB]+|No) views? - play Short"/g)) {
    if (seen.has(m[1])) continue; seen.add(m[1]); out.items.push({ id: m[1], kind: "short", title: unesc(m[2]), views: m[3] === "No" ? 0 : num(m[3]) }); }
  const vd = await get("https://www.youtube.com/@ig3.productions/videos");
  for (const p of vd.text.split('"lockupViewModel"').slice(1)) {
    const id = (p.match(/"contentId":"([\w-]{11})"/) || [])[1], t = (p.match(/"title":\{"content":"((?:[^"\\]|\\.)*)"/) || [])[1], v = (p.match(/"(?:content|accessibilityLabel)":"([\d.,KMB]+|No) views?"/) || [])[1];
    if (!id || !t || seen.has(id)) continue; seen.add(id); out.items.push({ id, kind: "video", title: unesc(t), views: v === "No" ? 0 : num(v) }); }
  out.note = "per-video likes/comments need a YouTube Data API key";
  return out;
}
async function tiktok() {
  const r = await get("https://www.tiktok.com/@t0mgrim");
  const g = (k: string) => { const m = r.text.match(new RegExp('"' + k + '":(\\d+)')); return m ? +m[1] : null; };
  return { handle: "@t0mgrim", status: r.status, followers: g("followerCount"), hearts: g("heartCount"), videos: g("videoCount"), items: [], note: "per-video stats are not in the public profile HTML" };
}
async function spotify() {
  const r = await get("https://open.spotify.com/artist/1tBp2oza76uuM5bC3fx8Vg");
  const ml = r.text.match(/([\d.,KM]+) monthly listeners/i); const fo = r.text.match(/([\d.,KM]+) followers/i);
  return { status: r.status, monthly_listeners: num(ml && ml[1]), followers: num(fo && fo[1]), note: ml ? "" : "not in public HTML; needs Spotify API credentials (monthly listeners/playcounts are not in the official API)" };
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "public" } });
  // throttle only on this collector's own rows (weekly Spotify for Artists rows use source "spotify_artists")
  const { data: last } = await sb.from("social_stats").select("at").in("source", ["youtube", "tiktok"]).order("at", { ascending: false }).limit(1);
  if (last && last[0] && Date.now() - new Date(last[0].at).getTime() < 50 * 60 * 1000) return new Response(JSON.stringify({ skipped: "recent snapshot" }), { headers: { "content-type": "application/json" } });
  const res: any = {};
  for (const [k, f] of [["youtube", youtube], ["tiktok", tiktok], ["spotify", spotify]] as const) { try { res[k] = await f(); } catch (e) { res[k] = { error: String(e) }; } }
  // never write blank Spotify rows: the public page has no numbers, so only store it if it returned real data
  const sp = res.spotify; if (!sp || sp.error || !(sp.monthly_listeners > 0 || sp.followers > 0)) delete res.spotify;
  const rows = Object.entries(res).map(([source, data]) => ({ source, data }));
  const { error } = await sb.from("social_stats").insert(rows);
  return new Response(JSON.stringify({ ok: !error, error: error?.message, summary: { yt: res.youtube?.subscribers, yt_items: res.youtube?.items?.length, tt: res.tiktok?.followers, sp: res.spotify?.monthly_listeners } }), { headers: { "content-type": "application/json" } });
});
