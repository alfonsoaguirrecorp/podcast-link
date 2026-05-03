const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

const PODCAST_ID          = '1493350313';
const SPOTIFY_SHOW_ID     = '2YNRodcHc7nTjqVUzMRDB4';
const YOUTUBE_PLAYLIST_ID = 'PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';
const RSS_URL             = 'https://feeds.libsyn.com/237647/rss';
const SHOW_ARTWORK        = 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts116/v4/bf/ec/58/bfec583a-abc7-e2ce-98e7-ddad6b2827cc/mza_16516226109485693154.png/600x600bb.jpg';
const REDIS_URL           = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN         = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY           = 'episode-links';
const OP3_TOKEN           = process.env.OP3_TOKEN;
const OP3_SHOW_UUID       = process.env.OP3_SHOW_UUID;
const STATS_USER          = process.env.STATS_USER  || 'admin';
const STATS_PASS          = process.env.STATS_PASS  || 'podcast2024';
const STATS_SECRET        = process.env.STATS_SECRET || 'changeme';

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  next();
});
app.get('/embed', (req, res) => res.sendFile(path.join(__dirname, 'public', 'embed.html')));
app.get('/stats', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'stats.html')));

// ── Upstash Redis helpers ─────────────────────────────────────────────────────
async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res  = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    if (!data.result) return null;
    const parsed = JSON.parse(data.result);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch (e) {
    console.error('Redis GET error:', e.message);
    return null;
  }
}

async function redisSet(key, value) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    await fetch(`${REDIS_URL}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(value))
    });
  } catch (e) {
    console.error('Redis SET error:', e.message);
  }
}

// ── Links de Spotify guardados en Redis (persisten entre reinicios) ────────────
let knownSpotifyLinks = {};

async function loadSpotifyLinks() {
  const saved = await redisGet(REDIS_KEY);
  if (saved && typeof saved === 'object') {
    knownSpotifyLinks = saved;
    console.log(`✅ Cargados ${Object.keys(saved).length} Spotify links desde Redis`);
  } else {
    console.log('ℹ️  Redis vacío — se poblarán los links al primer request');
  }
}

async function saveSpotifyLinks() {
  await redisSet(REDIS_KEY, knownSpotifyLinks);
  console.log(`💾 Guardados ${Object.keys(knownSpotifyLinks).length} links en Redis`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function decodeHtml(str = '') {
  return str
    .replace(/&#(\d+);/g,           (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

function epNum(title = '') {
  const m = title.match(/#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function normalizeTitle(title = '') {
  return title
    .replace(/#\d+\s*[:·\-]?\s*/g, '')
    .replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ\s]/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function titlesMatch(a, b) {
  const na = normalizeTitle(a), nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = na.split(' ').filter(w => w.length > 3);
  const setB   = new Set(nb.split(' ').filter(w => w.length > 3));
  if (!wordsA.length) return false;
  return wordsA.filter(w => setB.has(w)).length / wordsA.length >= 0.7;
}

// ── Spotify ───────────────────────────────────────────────────────────────────
const SPOTIFY_RETRY = 30 * 60 * 1000;
let   spotifyBlocked = 0;

async function getSpotifyToken() {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  return (await res.json()).access_token || null;
}

// Obtiene TODOS los episodios del show (para poblar Redis la primera vez)
async function fetchAllSpotifyEpisodes(token) {
  if (!token) return [];
  if (spotifyBlocked && Date.now() - spotifyBlocked < SPOTIFY_RETRY) return [];
  const all = [];
  let url = `https://api.spotify.com/v1/shows/${SPOTIFY_SHOW_ID}/episodes?limit=50&market=US`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) { spotifyBlocked = Date.now(); break; }
    const data = await res.json();
    if (!data.items) break;
    all.push(...data.items);
    url = data.next || null;
  }
  return all;
}

// Busca un episodio nuevo específico en Spotify (1 llamada, no el show completo)
async function findNewSpotifyEpisode(token, episodeName) {
  if (!token) return null;
  if (spotifyBlocked && Date.now() - spotifyBlocked < SPOTIFY_RETRY) return null;
  try {
    const q   = encodeURIComponent(episodeName.slice(0, 100));
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=episode&market=US&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 429) { spotifyBlocked = Date.now(); return null; }
    const data = await res.json();
    const eps  = data.episodes?.items || [];
    const match = eps.find(ep =>
      ep.show?.id === SPOTIFY_SHOW_ID || titlesMatch(ep.name, episodeName)
    );
    return match ? `https://open.spotify.com/episode/${match.id}` : null;
  } catch (e) {
    console.error('Spotify search error:', e.message);
    return null;
  }
}

// ── YouTube ───────────────────────────────────────────────────────────────────
async function fetchYouTubeViaAPI() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const all = [];
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems`
      + `?part=snippet&playlistId=${YOUTUBE_PLAYLIST_ID}&maxResults=50&key=${key}`
      + (pageToken ? `&pageToken=${pageToken}` : '');
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.items) break;
    for (const item of data.items) {
      const videoId = item.snippet?.resourceId?.videoId;
      const title   = decodeHtml(item.snippet?.title || '');
      if (videoId) all.push({ videoId, title });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}

async function fetchYouTubeViaRSS() {
  const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${YOUTUBE_PLAYLIST_ID}`;
  const xml  = await (await fetch(url)).text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, block]) => ({
    videoId: (block.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || '',
    title:   decodeHtml((block.match(/<title>(.*?)<\/title>/) || [])[1] || '')
  })).filter(v => v.videoId);
}

async function fetchYouTubeVideos() {
  try {
    const r = await fetchYouTubeViaAPI();
    return r !== null ? r : await fetchYouTubeViaRSS();
  } catch (e) {
    console.error('YouTube error:', e.message);
    return [];
  }
}

// ── RSS feed (fuente principal — siempre al día) ──────────────────────────────
async function fetchRSSEpisodes() {
  try {
    const res = await fetch(RSS_URL, { redirect: 'follow' });
    if (!res.ok) return [];
    const xml = await res.text();

    const episodes = [];
    for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const getTag = tag => {
        const m = new RegExp(
          `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`
        ).exec(block);
        return m ? decodeHtml((m[1] || m[2] || '').trim()) : '';
      };
      const getAttr = (tag, attr) => {
        const m = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i').exec(block);
        return m ? m[1] : '';
      };

      const title   = getTag('title');
      const pubDate = getTag('pubDate');
      if (!title || !pubDate) continue;

      // Duración: HH:MM:SS, MM:SS o segundos
      const dur   = getTag('itunes:duration');
      let trackTimeMillis = 0;
      if (dur) {
        const parts = dur.split(':').map(Number);
        if (parts.length === 3)      trackTimeMillis = (parts[0]*3600 + parts[1]*60 + parts[2]) * 1000;
        else if (parts.length === 2) trackTimeMillis = (parts[0]*60  + parts[1]) * 1000;
        else if (!isNaN(+dur))       trackTimeMillis = +dur * 1000;
      }

      const artwork = getAttr('itunes:image', 'href') || SHOW_ARTWORK;
      episodes.push({
        trackName:       title,
        releaseDate:     new Date(pubDate).toISOString(),
        trackTimeMillis,
        artworkUrl600:   artwork,
        artworkUrl160:   artwork,
        wrapperType:     'podcastEpisode',
        kind:            'podcast-episode'
      });
    }
    return episodes;
  } catch (e) {
    console.error('RSS fetch error:', e.message);
    return [];
  }
}

// ── Construye lista de episodios ──────────────────────────────────────────────
async function buildAllEpisodes() {
  // RSS (instantáneo) + iTunes (para enriquecer artwork y link de Apple) + YouTube — en paralelo
  const [itunesRes, rssEps, youtubeVideos] = await Promise.all([
    fetch(`https://itunes.apple.com/lookup?id=${PODCAST_ID}&entity=podcastEpisode&limit=200&country=mx`).catch(() => null),
    fetchRSSEpisodes(),
    fetchYouTubeVideos()
  ]);

  // iTunes: opcional, solo para artworkUrl600 y trackViewUrl
  let show = null;
  const itunesMap = new Map();
  if (itunesRes && itunesRes.ok) {
    try {
      const results = (await itunesRes.json()).results || [];
      show = results.find(r => r.wrapperType === 'track' && r.kind === 'podcast') || results[0];
      for (const ep of results.filter(r => r.wrapperType === 'podcastEpisode' || r.kind === 'podcast-episode')) {
        itunesMap.set(ep.trackName, ep);
      }
    } catch (e) { console.error('iTunes parse error:', e.message); }
  }

  // Fallback de show si iTunes está lento
  if (!show) {
    show = { collectionName: 'Algo Más Que Contarte con Alfonso Aguirre', artworkUrl600: SHOW_ARTWORK, artworkUrl100: SHOW_ARTWORK };
  }

  // Lista principal: RSS (siempre fresco). Fallback: iTunes
  const primaryEps = rssEps.length > 0
    ? rssEps
    : [...itunesMap.values()].sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

  // Enriquecer con datos de iTunes donde ya estén disponibles
  const enrichedEps = primaryEps.map(ep => {
    const nEp = epNum(ep.trackName);
    const ie = itunesMap.get(ep.trackName)
      || [...itunesMap.values()].find(i => {
          const ni = epNum(i.trackName);
          if (nEp && ni && nEp !== ni) return false; // números distintos → no match
          return titlesMatch(i.trackName, ep.trackName);
        });
    return ie ? {
      ...ep,
      artworkUrl600:   ie.artworkUrl600   || ep.artworkUrl600,
      artworkUrl160:   ie.artworkUrl160   || ep.artworkUrl160,
      trackViewUrl:    ie.trackViewUrl,
      trackTimeMillis: ie.trackTimeMillis || ep.trackTimeMillis,
    } : ep;
  });

  // YouTube maps
  const youtubeByNum = {}, youtubeByTitle = [];
  for (const v of youtubeVideos) {
    const n = epNum(v.title);
    const url = `https://music.youtube.com/watch?v=${v.videoId}`;
    if (n) youtubeByNum[n] = url;
    youtubeByTitle.push({ title: v.title, url });
  }

  // Si Redis está vacío, poblar con TODOS los episodios de Spotify de una vez
  const redisEmpty = Object.keys(knownSpotifyLinks).length === 0;
  let needsSave    = false;

  if (redisEmpty) {
    console.log('🔄 Redis vacío — cargando todos los episodios de Spotify por primera vez...');
    const token = await getSpotifyToken();
    const eps   = await fetchAllSpotifyEpisodes(token);
    if (eps.length > 0) {
      for (const ep of eps) {
        knownSpotifyLinks[ep.name] = `https://open.spotify.com/episode/${ep.id}`;
      }
      needsSave = true;
      console.log(`✅ ${eps.length} episodios de Spotify cargados`);
    }
  }

  // Construir episodios con sus links de Spotify y YouTube
  const allEpisodes = [];

  for (const ep of enrichedEps) {
    const n = epNum(ep.trackName || '');

    // Spotify: buscar en links conocidos primero
    let spotifyUrl = knownSpotifyLinks[ep.trackName] || null;
    if (!spotifyUrl) {
      const match = Object.entries(knownSpotifyLinks).find(([name]) => titlesMatch(ep.trackName, name));
      if (match) spotifyUrl = match[1];
    }

    // Si no está guardado → es episodio nuevo → buscar en Spotify
    if (!spotifyUrl) {
      console.log(`🆕 Nuevo episodio detectado: "${ep.trackName}"`);
      const token = await getSpotifyToken();
      spotifyUrl  = await findNewSpotifyEpisode(token, ep.trackName);
      if (spotifyUrl) {
        knownSpotifyLinks[ep.trackName] = spotifyUrl;
        needsSave = true;
        console.log(`✅ Link de Spotify guardado para "${ep.trackName}"`);
      }
    }

    // YouTube
    let youtubeUrl = (n && youtubeByNum[n]) || null;
    if (!youtubeUrl) {
      const m = youtubeByTitle.find(v => titlesMatch(ep.trackName, v.title));
      if (m) youtubeUrl = m.url;
    }

    allEpisodes.push({ ...ep, spotifyUrl, youtubeUrl });
  }

  // Guardar en Redis si hubo cambios
  if (needsSave) await saveSpotifyLinks();

  return { show, allEpisodes };
}

// ── API endpoint ──────────────────────────────────────────────────────────────
app.get('/api/episodes', async (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 6));

    const { show, allEpisodes } = await buildAllEpisodes();
    const total   = allEpisodes.length;
    const page    = allEpisodes.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    res.json({ show: offset === 0 ? show : undefined, episodes: page, total, hasMore, offset, limit });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Error fetching episodes' });
  }
});

// ── Auth helpers ──────────────────────────────────────────────────────────
function makeToken() {
  return crypto.createHmac('sha256', STATS_SECRET)
    .update(STATS_USER + ':' + STATS_PASS)
    .digest('hex');
}

function getCookie(req, name) {
  const str = req.headers.cookie || '';
  const match = str.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function requireAuth(req, res, next) {
  if (getCookie(req, 'stats_auth') === makeToken()) return next();
  res.redirect('/stats/login');
}

app.use(express.urlencoded({ extended: false }));

app.get('/stats/login', (req, res) => {
  const err = req.query.error ? '<p style="color:#f87171;margin:0 0 16px">Usuario o contraseña incorrectos.</p>' : '';
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Acceso — Estadísticas</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0f0f0f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#1a1a1a;border-radius:16px;padding:36px 32px;width:100%;max-width:360px}
    h1{font-size:1.2rem;margin-bottom:24px;color:#fff}
    label{display:block;font-size:.78rem;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
    input{width:100%;background:#111;border:1px solid #333;border-radius:8px;padding:10px 14px;
          color:#fff;font-size:.95rem;margin-bottom:16px;outline:none}
    input:focus{border-color:#555}
    button{width:100%;background:#fff;color:#000;border:none;border-radius:8px;
           padding:12px;font-size:.95rem;font-weight:600;cursor:pointer;margin-top:4px}
    button:hover{background:#ddd}
  </style>
</head>
<body>
  <div class="card">
    <h1>Estadísticas del podcast</h1>
    ${err}
    <form method="POST" action="/stats/login">
      <label>Usuario</label>
      <input type="text" name="user" autocomplete="username" required/>
      <label>Contraseña</label>
      <input type="password" name="pass" autocomplete="current-password" required/>
      <button type="submit">Entrar</button>
    </form>
  </div>
</body>
</html>`);
});

app.post('/stats/login', (req, res) => {
  const { user, pass } = req.body;
  if (user === STATS_USER && pass === STATS_PASS) {
    const token   = makeToken();
    const maxAge  = 30 * 24 * 60 * 60; // 30 días en segundos
    res.setHeader('Set-Cookie', `stats_auth=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`);
    return res.redirect('/stats');
  }
  res.redirect('/stats/login?error=1');
});

app.get('/stats/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'stats_auth=; Max-Age=0; Path=/; HttpOnly');
  res.redirect('/stats/login');
});

// ── CSV historical data ────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let inQuote = false, current = '';
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function loadHistoricalCSV() {
  const csvPath = path.join(__dirname, 'data', 'episodes-history.csv');
  if (!fs.existsSync(csvPath)) return [];
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1);
  return lines.map(line => {
    const [, title, release, first7, first30, , total] = parseCSVLine(line);
    const n = v => (v && v !== 'N/A' && !isNaN(parseInt(v))) ? parseInt(v) : null;
    return {
      title,
      pubdate:     release ? new Date(release).toISOString() : null,
      downloads7:  n(first7),
      downloads30: n(first30),
      downloadsAll: n(total),
      source: 'libsyn'
    };
  }).filter(e => e.title && e.pubdate);
}

// ── Stats computation (shared by /api/stats and /api/campaigns/:id/stats) ────
async function computeEpisodeStats() {
  const csvEpisodes = loadHistoricalCSV();

  let op3Episodes = [];
  if (OP3_TOKEN && OP3_SHOW_UUID) {
    try {
      const r = await fetch(`https://op3.dev/api/1/queries/episode-download-counts?showUuid=${OP3_SHOW_UUID}&token=${OP3_TOKEN}`);
      if (r.ok) op3Episodes = (await r.json()).episodes || [];
    } catch (err) { console.error('OP3 fetch error:', err); }
  }

  const merged = csvEpisodes.map(ep => {
    const match = op3Episodes.find(o => {
      const diffDays = Math.abs(new Date(o.pubdate) - new Date(ep.pubdate)) / 86400000;
      return diffDays < 2 || o.title === ep.title;
    });
    if (match) {
      const higher = (a, b) => {
        const va = (a != null && a > 0) ? a : null;
        const vb = (b != null && b > 0) ? b : null;
        if (va != null && vb != null) return Math.max(va, vb);
        return va ?? vb;
      };
      const epDays  = ep.pubdate ? (Date.now() - new Date(ep.pubdate).getTime()) / 86400000 : 999;
      const csvTotal = ep.downloadsAll   || 0;
      const op3Total = match.downloadsAll || 0;
      return {
        ...ep,
        downloads1:   epDays <= 14 ? (match.downloads1 || null) : null,
        downloads3:   epDays <= 14 ? (match.downloads3 || null) : null,
        downloads7:   higher(match.downloads7,  ep.downloads7),
        downloads30:  higher(match.downloads30, ep.downloads30),
        downloadsAll: csvTotal + op3Total > 0 ? csvTotal + op3Total : null,
        source: epDays <= 14 ? 'op3' : 'libsyn'
      };
    }
    return ep;
  });

  for (const o of op3Episodes) {
    const already = merged.find(ep => {
      const diffDays = Math.abs(new Date(o.pubdate) - new Date(ep.pubdate)) / 86400000;
      return diffDays < 2 || o.title === ep.title;
    });
    if (!already) {
      merged.unshift({
        title: o.title, pubdate: o.pubdate,
        downloads1: o.downloads1 ?? null, downloads3: o.downloads3 ?? null,
        downloads7: o.downloads7 ?? null, downloads30: o.downloads30 ?? null,
        downloadsAll: o.downloadsAll ?? null, source: 'op3'
      });
    }
  }

  merged.sort((a, b) => new Date(b.pubdate) - new Date(a.pubdate));
  const now = Date.now();
  for (const ep of merged) {
    ep.daysOld = ep.pubdate ? Math.floor((now - new Date(ep.pubdate).getTime()) / 86400000) : null;
  }

  // Override manual: ep #84 inflado por bots al poner prefijo OP3
  const ep84 = merged.find(ep => /\#84[\s:,\-]|#84$/.test(ep.title));
  if (ep84) ep84.downloads7 = 906;

  return merged;
}

// ── OP3 Stats endpoint ────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    res.json({ episodes: await computeEpisodeStats() });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

// ── OP3 Trend endpoint ────────────────────────────────────────────────────
app.get('/api/trend', requireAuth, async (req, res) => {
  try {
    if (!OP3_TOKEN || !OP3_SHOW_UUID) {
      return res.json({ error: 'Faltan variables OP3.' });
    }
    const OP3_START_DATE = process.env.OP3_START_DATE;
    if (!OP3_START_DATE) {
      return res.json({ pending: true });
    }
    const now   = new Date();
    const start = OP3_START_DATE;
    const url   = `https://op3.dev/api/1/downloads/show/${OP3_SHOW_UUID}?token=${OP3_TOKEN}&format=json&start=${start}&bots=exclude&limit=20000`;
    const r     = await fetch(url);
    if (!r.ok) return res.json({ error: `OP3 error ${r.status}` });

    const data = await r.json();
    const rows = data.rows || [];

    // Agrupar por día
    const byDay = {};
    for (const row of rows) {
      const day = (row.time || '').slice(0, 10);
      if (day) byDay[day] = (byDay[day] || 0) + 1;
    }

    // Construir array de últimos 14 días
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d   = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().split('T')[0];
      days.push({ date: key, downloads: byDay[key] || 0 });
    }

    const last7 = days.slice(7).reduce((s, d) => s + d.downloads, 0);
    const prev7 = days.slice(0, 7).reduce((s, d) => s + d.downloads, 0);

    res.json({ days, last7, prev7 });
  } catch (err) {
    console.error('Trend error:', err);
    res.status(500).json({ error: 'Error al obtener tendencia.' });
  }
});

// ── Kajabi ────────────────────────────────────────────────────────────────────
const KAJABI_BASE    = 'https://api.kajabi.com/v1';
const KAJABI_SITE_ID = process.env.KAJABI_SITE_ID || '2147836598';
let kajabiToken = null, kajabiTokenExpiry = 0, kajabiSiteId = null;

async function getKajabiToken() {
  if (kajabiToken && Date.now() < kajabiTokenExpiry) return kajabiToken;
  const k = process.env.KAJABI_API_KEY, s = process.env.KAJABI_API_SECRET;
  if (!k || !s) return null;
  try {
    const res  = await fetch(`${KAJABI_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: k, client_secret: s })
    });
    const data = await res.json();
    if (!data.access_token) throw new Error(JSON.stringify(data));
    kajabiToken       = data.access_token;
    kajabiTokenExpiry = Date.now() + ((data.expires_in || 7200) - 120) * 1000;
    return kajabiToken;
  } catch (e) { console.error('Kajabi token error:', e.message); return null; }
}

async function kajabiGet(path) {
  const token = await getKajabiToken();
  if (!token) throw new Error('Sin credenciales de Kajabi (verifica KAJABI_API_KEY y KAJABI_API_SECRET en Render)');
  const res = await fetch(`${KAJABI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' }
  });
  if (!res.ok) throw new Error(`Kajabi ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Kajabi debug: form submissions ───────────────────────────────────────────
// Uso: /api/kajabi/debug-forms?formId=XXX
app.get('/api/kajabi/debug-forms', requireAuth, async (req, res) => {
  const formId = req.query.formId;
  async function hit(label, path) {
    try {
      const data = await kajabiGet(path);
      return { label, status: 'ok', count: data.data?.length, meta: data.meta, sample: data.data?.[0] };
    } catch (e) { return { label, error: e.message }; }
  }
  const results = await Promise.all([
    hit('forms_list',          `/forms?filter[site_id]=${KAJABI_SITE_ID}&page[size]=5`),
    ...(formId ? [
      hit('subs_with_site+form',   `/form_submissions?filter[site_id]=${KAJABI_SITE_ID}&filter[form_id]=${formId}&page[size]=3`),
      hit('subs_form_only',        `/form_submissions?filter[form_id]=${formId}&page[size]=3`),
      hit('subs_no_filter',        `/form_submissions?filter[site_id]=${KAJABI_SITE_ID}&page[size]=3`),
    ] : [
      hit('subs_no_filter',        `/form_submissions?filter[site_id]=${KAJABI_SITE_ID}&page[size]=3`),
    ])
  ]);
  res.json({ formId, results });
});

// ── Kajabi debug ─────────────────────────────────────────────────────────────
app.get('/api/kajabi/debug', requireAuth, async (req, res) => {
  const k = process.env.KAJABI_API_KEY, s = process.env.KAJABI_API_SECRET;
  const oauthToken = await getKajabiToken();
  const hdrs = { Authorization: `Bearer ${oauthToken}`, Accept: 'application/vnd.api+json' };

  async function hit(label, url) {
    try {
      const r = await fetch(url, { headers: hdrs });
      return { label, status: r.status, body: await r.json() };
    } catch (e) { return { label, error: e.message }; }
  }

  const results = await Promise.all([
    hit('me',               `https://api.kajabi.com/v1/me`),
    hit('tags_with_site',   `https://api.kajabi.com/v1/contact_tags?filter[site_id]=${KAJABI_SITE_ID}&page[size]=3`),
    hit('tags_no_filter',   `https://api.kajabi.com/v1/contact_tags?page[size]=3`),
    hit('contacts_no_filter', `https://api.kajabi.com/v1/contacts?page[size]=1`),
  ]);

  res.json({ token_ok: !!oauthToken, results });
});

// ── Campaigns (stored in Redis) ───────────────────────────────────────────────
const CAMPAIGNS_KEY = 'amqc-campaigns';
async function loadCampaigns()          { return (await redisGet(CAMPAIGNS_KEY)) || []; }
async function saveCampaigns(campaigns) { await redisSet(CAMPAIGNS_KEY, campaigns); }

// ── Campaign routes ───────────────────────────────────────────────────────────
app.get('/campaigns', requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'campaigns.html'))
);

app.get('/api/kajabi/tags', requireAuth, async (req, res) => {
  try {
    const data = await kajabiGet(`/contact_tags?filter[site_id]=${KAJABI_SITE_ID}&page[size]=200`);
    res.json({ tags: (data.data || []).map(t => ({ id: t.id, name: t.attributes?.name || t.id })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/kajabi/forms', requireAuth, async (req, res) => {
  try {
    const data = await kajabiGet(`/forms?filter[site_id]=${KAJABI_SITE_ID}&page[size]=200`);
    res.json({ forms: (data.data || []).map(f => ({ id: f.id, name: f.attributes?.title || f.attributes?.name || f.id })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns', requireAuth, async (req, res) => {
  try { res.json({ campaigns: await loadCampaigns() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns', requireAuth, express.json(), async (req, res) => {
  try {
    const campaigns = await loadCampaigns();
    const c = {
      id:              crypto.randomUUID(),
      name:            req.body.name,
      kajabiTagId:     req.body.kajabiTagId     || null,
      kajabiTagName:   req.body.kajabiTagName   || null,
      kajabiFormId:    req.body.kajabiFormId    || null,
      kajabiFormName:  req.body.kajabiFormName  || null,
      episodeNums:     req.body.episodeNums      || [],
      createdAt:       new Date().toISOString()
    };
    campaigns.push(c);
    await saveCampaigns(campaigns);
    res.json({ campaign: c });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/campaigns/:id', requireAuth, express.json(), async (req, res) => {
  try {
    const campaigns = await loadCampaigns();
    const idx = campaigns.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
    campaigns[idx] = { ...campaigns[idx], ...req.body, id: campaigns[idx].id, createdAt: campaigns[idx].createdAt };
    await saveCampaigns(campaigns);
    res.json({ campaign: campaigns[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/campaigns/:id', requireAuth, async (req, res) => {
  try {
    await saveCampaigns((await loadCampaigns()).filter(c => c.id !== req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns/:id/stats', requireAuth, async (req, res) => {
  try {
    const campaigns = await loadCampaigns();
    const campaign  = campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });

    const result = { campaign };

    // ── Opt-ins por día (form submissions) ────────────────────────────────────
    if (campaign.kajabiFormId) {
      try {
        const PAGE_SIZE = 200;
        let page = 1, allSubs = [];
        while (true) {
          const data = await kajabiGet(
            `/form_submissions?filter[site_id]=${KAJABI_SITE_ID}&filter[form_id]=${campaign.kajabiFormId}&page[size]=${PAGE_SIZE}&page[number]=${page}&sort=created_at`
          );
          const items = data.data || [];
          allSubs.push(...items);
          if (items.length < PAGE_SIZE) break;
          const totalPages = data.meta?.total_pages;
          if (totalPages && page >= totalPages) break;
          page++;
          if (page > 50) break;
        }
        const byDate = {};
        for (const s of allSubs) {
          const d = (s.attributes?.created_at || '').slice(0, 10);
          if (d) byDate[d] = (byDate[d] || 0) + 1;
        }
        result.optinsByDay = Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count }));
        result.optinsTotal = allSubs.length;
      } catch (e) { result.optinsError = e.message; }
    }

    // ── Episode stats ─────────────────────────────────────────────────────────
    try {
      const allEps = await computeEpisodeStats();
      result.episodes = allEps.filter(ep => {
        const n = parseInt((ep.title || '').match(/#(\d+)/)?.[1] || 0);
        return campaign.episodeNums.includes(n);
      });
    } catch (e) { result.episodesError = e.message; }

    res.json(result);
  } catch (err) {
    console.error('Campaign stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Leads endpoint separado (carga lazy en el frontend) ──────────────────────
app.get('/api/campaigns/:id/leads', requireAuth, async (req, res) => {
  try {
    const campaigns = await loadCampaigns();
    const campaign  = campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (!campaign.kajabiTagId) return res.json({ leads: null });

    const PAGE_SIZE = 200;
    let page = 1, allContacts = [];

    // Documentación Kajabi: usar filter[site_id] + filter[has_tag_id] en /contacts
    while (true) {
      const chunk = await kajabiGet(
        `/contacts?filter[site_id]=${KAJABI_SITE_ID}&filter[has_tag_id]=${campaign.kajabiTagId}&page[size]=${PAGE_SIZE}&page[number]=${page}&sort=-created_at`
      );
      const items = chunk.data || [];
      allContacts.push(...items);
      if (items.length < PAGE_SIZE) break;
      const totalPages = chunk.meta?.total_pages;
      if (totalPages && page >= totalPages) break;
      page++;
      if (page > 100) break; // safety cap ~20 000 contactos
    }

    const cutoff7  = Date.now() - 7  * 86400000;
    const cutoff30 = Date.now() - 30 * 86400000;

    // Agrupar por día para la gráfica (created_at = fecha en que el contacto
    // se registró con ese tag, equivalente a la fecha del opt-in)
    const byDate = {};
    for (const c of allContacts) {
      const d = (c.attributes?.created_at || '').slice(0, 10);
      if (d) byDate[d] = (byDate[d] || 0) + 1;
    }
    const optinsByDay = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    res.json({
      leads: {
        total: allContacts.length,
        last7:  allContacts.filter(c => new Date(c.attributes?.created_at).getTime() >= cutoff7).length,
        last30: allContacts.filter(c => new Date(c.attributes?.created_at).getTime() >= cutoff30).length
      },
      optinsByDay,
      optinsTotal: allContacts.length
    });
  } catch (e) {
    res.status(500).json({ leadsError: e.message });
  }
});

// ── Arrancar servidor ─────────────────────────────────────────────────────────
// Primero carga los links desde Redis, luego empieza a escuchar
loadSpotifyLinks().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
