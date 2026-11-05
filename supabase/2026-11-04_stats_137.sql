update public.social_stats set source='spotify_artists' where source='spotify' and data->>'origin'='spotify_for_artists_weekly';
insert into public.social_stats(source, data) values ('spotify_artists', '{"note":"Spotify for Artists, last 28 days (Oct 7 - Nov 3, 2026); catalog lists only MENACE","range":"2026-10-07/2026-11-03","origin":"spotify_for_artists_weekly","status":200,"followers":6,"saves_28d":1,"top_songs":[{"title":"MENACE","canvas_views":1,"saves":1,"streams":null,"listeners":null}],"streams_28d":0,"listeners_28d":0,"monthly_listeners":0,"monthly_active":0,"playlist_adds_28d":0,"streams_per_listener":0,"catalog":["MENACE"]}'::jsonb);
alter table public.visits add column if not exists fp text, add column if not exists region text, add column if not exists city text;

create or replace function private.stats_auth(p_pass text) returns boolean language plpgsql security definer set search_path to '' as $$
declare hsh text := (select v from private.config where k='stats_hash'); ih text := private.ip_hash();
begin
  if not private.hit('statsfail', ih, interval '1 hour', 10) then return false; end if;
  if p_pass is null or extensions.crypt(p_pass, hsh) <> hsh then insert into private.events(kind, actor) values ('statsfail', ih); return false; end if;
  return true;
end $$;
revoke all on function private.stats_auth(text) from public, anon, authenticated;

create or replace function public.mark_reviewed(p_pass text, p_snap jsonb) returns json language plpgsql security definer set search_path to '' as $$
begin
  if not private.stats_auth(p_pass) then return json_build_object('error','denied'); end if;
  if pg_column_size(p_snap) > 8000 then return json_build_object('error','too big'); end if;
  update private.config set v = jsonb_build_object('at', now(), 'snap', p_snap)::text where k = 'stats_review';
  if not found then insert into private.config(k, v) values ('stats_review', jsonb_build_object('at', now(), 'snap', p_snap)::text); end if;
  return json_build_object('ok', true, 'at', now());
end $$;
revoke all on function public.mark_reviewed(text, jsonb) from public, authenticated;
grant execute on function public.mark_reviewed(text, jsonb) to anon;

create or replace function public.log_visit(p jsonb) returns json language plpgsql security definer set search_path to '' as $$
declare ip text := private.req_ip(); ih text; fp text; h json; ua text; bot boolean; reason text := null; r record; ctry text; reg text; cty text; salt text := (select v from private.config where k='ip_salt');
begin
  ih := encode(extensions.digest(ip || salt || current_date::text, 'sha256'), 'hex');
  if not private.hit('visit', ih, interval '1 hour', 60) then raise exception 'rate limited'; end if;
  insert into private.events(kind, actor) values ('visit', ih);
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  ua := left(coalesce(h->>'user-agent', p->>'ua', ''), 400);
  ctry := nullif(left(coalesce(h->>'cf-ipcountry', ''), 2), '');
  reg := left(coalesce(nullif(h->>'cf-region',''), nullif(regexp_replace(coalesce(p->>'region',''), '[^[:alnum:] .''-]', '', 'g'),'')), 60);
  cty := left(coalesce(nullif(h->>'cf-ipcity',''), nullif(regexp_replace(coalesce(p->>'city',''), '[^[:alnum:] .''-]', '', 'g'),'')), 60);
  -- stable pseudonymous device/connection id: salted hash of ip+ua+screen+tz (raw IP never stored)
  fp := left(encode(extensions.digest(salt || '|fp|' || ip || '|' || ua || '|' || coalesce(p->>'scr','') || '|' || coalesce(p->>'tz',''), 'sha256'), 'hex'), 24);
  bot := ua ~* '(bot|crawl|spider|slurp|scrape|fetch|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|curl|wget|python|httpclient|axios|node-fetch|go-http|java/|okhttp|facebookexternalhit|embedly|whatsapp|telegram|discord|monitor|uptime|pingdom|semrush|ahrefs|mj12|dotbot|petal|yandex|baidu|bingpreview|gptbot|claude|perplexity|ccbot|bytespider|amazonbot|applebot|duckduck|google-inspectiontool|googleother|google-extended)' or ua = '';
  if bot then reason := 'ua'; elsif coalesce((p->>'wd')::boolean,false) then reason := 'webdriver';
  elsif coalesce(p->>'scr','') in ('','0x0') or coalesce(p->>'tz','') in ('','UTC','Etc/UTC') and coalesce(p->>'lang','')='' then reason := 'datacenter-hints'; end if;
  insert into public.visits(vid, ip_hash, ua, ref, path, screen, tz, lang, country, region, city, fp, webdriver, ua_bot, bot_reason)
  values (left(encode(extensions.digest(coalesce(p->>'vid',''),'sha256'),'hex'),32), ih, ua, left(p->>'ref',300), left(p->>'path',200), left(p->>'scr',20), left(p->>'tz',60), left(p->>'lang',20), ctry, reg, cty, fp,
          coalesce((p->>'wd')::boolean,false), bot, reason)
  returning id, token into r;
  return json_build_object('id', r.id, 'token', r.token);
end $$;

create or replace function public.get_stats(p_pass text) returns json language plpgsql security definer set search_path to '' as $$
declare hsh text := (select v from private.config where k='stats_hash'); ih text := private.ip_hash(); res json;
begin
  if not private.hit('statsfail', ih, interval '1 hour', 10) then return json_build_object('error','locked'); end if;
  if coalesce((select v from private.config where k='stats_claim_until')::timestamptz > now(), false) and length(coalesce(p_pass,'')) >= 12 then
    update private.config set v = extensions.crypt(p_pass, extensions.gen_salt('bf', 12)) where k = 'stats_hash';
    delete from private.config where k = 'stats_claim_until';
    hsh := (select v from private.config where k='stats_hash');
  end if;
  if p_pass is null or extensions.crypt(p_pass, hsh) <> hsh then
    insert into private.events(kind, actor) values ('statsfail', ih); return json_build_object('error','denied'); end if;
  select json_build_object(
   'now', now(),
   'visits', (select coalesce(json_agg(r order by r.id desc), '[]') from (select x.id, x.created_at t, private.klass(x) k, left(x.vid, 8) vid, left(coalesce(x.fp, 'v' || x.vid), 16) fp, x.path, x.ref, x.country, x.region, x.city, x.tz, x.lang, x.screen, x.dwell_ms, x.interacted, x.tracks, left(x.ua, 300) ua
       from public.visits x where x.created_at > now() - interval '90 days' order by x.id desc limit 5000) r),
   'daily', (select coalesce(json_agg(json_build_object('d', q.dd, 'h', q.nh, 'b', q.nb) order by q.dd), '[]') from (select (x.created_at at time zone 'America/New_York')::date as dd, count(*) filter (where private.klass(x) = 'human') as nh, count(*) filter (where private.klass(x) <> 'human') as nb from public.visits x group by 1) q),
   'social', (select coalesce(json_agg(json_build_object('at', at, 'source', source, 'data', data) order by at), '[]') from public.social_stats where at > now() - interval '120 days' and not (source = 'spotify' and coalesce((data->>'monthly_listeners')::numeric, 0) = 0 and data->>'followers' is null)),
   'likes', (select coalesce(json_agg(json_build_object('file', file, 't', created_at)), '[]') from public.likes),
   'bbs', json_build_object('total', (select count(*) from public.messages), 'hidden', (select count(*) from public.messages where hidden),
       'posts', (select coalesce(json_agg(created_at), '[]') from public.messages)),
   'review', (select v::json from private.config where k = 'stats_review')
  ) into res;
  return res;
end $$;
