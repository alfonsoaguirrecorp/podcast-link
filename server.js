const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const PODCAST_ID          = '1493350313';
const SPOTIFY_SHOW_ID     = '2YNRodcHc7nTjqVUzMRDB4';
const YOUTUBE_PLAYLIST_ID = 'PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';
const REDIS_URL           = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN         = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY           = 'episode-links';
const OP3_TOKEN           = process.env.OP3_TOKEN;
const OP3_SHOW_UUID       = process.env.OP3_SHOW_UUID;

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  next();
});
app.get('/embed', (req, res) => res.sendFile(path.join(__dirname, 'public', 'embed.html')));
app.get('/stats', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stats.html')));

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

// ── Construye lista de episodios ──────────────────────────────────────────────
async function buildAllEpisodes() {
  const [itunesRes, youtubeVideos] = await Promise.all([
    fetch(`https://itunes.apple.com/lookup?id=${PODCAST_ID}&entity=podcastEpisode&limit=200&country=mx`),
    fetchYouTubeVideos()
  ]);

  const itunesData = await itunesRes.json();
  const results    = itunesData.results || [];
  const show       = results.find(r => r.wrapperType === 'track' && r.kind === 'podcast') || results[0];
  const itunesEps  = results
    .filter(r => r.wrapperType === 'podcastEpisode' || r.kind === 'podcast-episode')
    .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

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

  // Construir episodios con sus links
  const allEpisodes = [];
  let foundNew = false;

  for (const ep of itunesEps) {
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
        foundNew  = true;
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

// ── OP3 Stats endpoint ────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    // 1. Historical CSV data
    const csvEpisodes = loadHistoricalCSV();

    // 2. OP3 data (optional — graceful fallback if missing)
    let op3Episodes = [];
    if (OP3_TOKEN && OP3_SHOW_UUID) {
      try {
        const url = `https://op3.dev/api/1/queries/episode-download-counts?showUuid=${OP3_SHOW_UUID}&token=${OP3_TOKEN}`;
        const r   = await fetch(url);
        if (r.ok) {
          const data = await r.json();
          op3Episodes = data.episodes || [];
        }
      } catch (err) {
        console.error('OP3 fetch error:', err);
      }
    }

    // 3. Merge: match OP3 episodes to CSV by pubdate (±2 days) or exact title
    const merged = csvEpisodes.map(ep => {
      const match = op3Episodes.find(o => {
        const diffDays = Math.abs(new Date(o.pubdate) - new Date(ep.pubdate)) / 86400000;
        return diffDays < 2 || o.title === ep.title;
      });
      if (match) {
        // Para downloads7/30/All: usar el mayor valor entre OP3 y CSV.
        // OP3 solo cuenta desde que se puso el prefijo, Libsyn tiene el historial completo.
        const higher = (a, b) => {
          const va = (a != null && a > 0) ? a : null;
          const vb = (b != null && b > 0) ? b : null;
          if (va != null && vb != null) return Math.max(va, vb);
          return va ?? vb;
        };
        // downloads1/3 solo los usamos de OP3 si el episodio es nuevo (≤ 14 días)
        const epDays = ep.pubdate
          ? (Date.now() - new Date(ep.pubdate).getTime()) / 86400000
          : 999;
        return {
          ...ep,
          downloads1:   epDays <= 14 ? (match.downloads1   || null) : null,
          downloads3:   epDays <= 14 ? (match.downloads3   || null) : null,
          downloads7:   higher(match.downloads7,   ep.downloads7),
          downloads30:  higher(match.downloads30,  ep.downloads30),
          downloadsAll: higher(match.downloadsAll, ep.downloadsAll),
          source: epDays <= 14 ? 'op3' : 'libsyn'
        };
      }
      return ep;
    });

    // 4. Add OP3 episodes not yet in CSV (brand new)
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

    // 5. Sort newest first
    merged.sort((a, b) => new Date(b.pubdate) - new Date(a.pubdate));

    // 6. Add daysOld to each episode
    const now = Date.now();
    for (const ep of merged) {
      ep.daysOld = ep.pubdate
        ? Math.floor((now - new Date(ep.pubdate).getTime()) / 86400000)
        : null;
    }

    res.json({ episodes: merged });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

// ── OP3 Trend endpoint ────────────────────────────────────────────────────
app.get('/api/trend', async (req, res) => {
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

// ── Arrancar servidor ─────────────────────────────────────────────────────────
// Primero carga los links desde Redis, luego empieza a escuchar
loadSpotifyLinks().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
