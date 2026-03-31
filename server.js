const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const PODCAST_ID          = '1493350313';
const SPOTIFY_SHOW_ID     = '2YNRodcHc7nTjqVUzMRDB4';
const YOUTUBE_PLAYLIST_ID = 'PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';

app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  next();
});

app.get('/embed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'embed.html'));
});

// ── Cargar episode-links.json al iniciar ──────────────────────────────────────
// Este archivo guarda los Spotify URLs de episodios conocidos permanentemente.
// Así no se llama a Spotify en cada restart del servidor.
let knownSpotifyLinks = {};
const LINKS_FILE = path.join(__dirname, 'episode-links.json');
try {
  knownSpotifyLinks = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
  console.log(`✅ Loaded ${Object.keys(knownSpotifyLinks).length} Spotify links from episode-links.json`);
} catch (e) {
  console.log('ℹ️  No episode-links.json found — will fetch from Spotify API for new episodes');
}

// ── HTML entity decoder ───────────────────────────────────────────────────────
function decodeHtml(str = '') {
  return str
    .replace(/&#(\d+);/g,           (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

// ── Episode number extractor: "#83" → 83 ─────────────────────────────────────
function epNum(title = '') {
  const m = title.match(/#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Title normalizer ──────────────────────────────────────────────────────────
function normalizeTitle(title = '') {
  return title
    .replace(/#\d+\s*[:·\-]?\s*/g, '')
    .replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── Title similarity check ────────────────────────────────────────────────────
function titlesMatch(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = na.split(' ').filter(w => w.length > 3);
  const setB   = new Set(nb.split(' ').filter(w => w.length > 3));
  if (!wordsA.length) return false;
  return wordsA.filter(w => setB.has(w)).length / wordsA.length >= 0.7;
}

// ── CACHE ─────────────────────────────────────────────────────────────────────
const cache = { data: null, ts: 0 };
const CACHE_TTL     = 15 * 60 * 1000;   // refresca lista cada 15 min (iTunes)
const SPOTIFY_RETRY = 30 * 60 * 1000;   // espera 30 min si Spotify da 429
let   spotifyBlocked = 0;

// ── SPOTIFY token ─────────────────────────────────────────────────────────────
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

// ── Busca un episodio específico en Spotify por título ────────────────────────
async function findSpotifyEpisode(token, episodeName) {
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
      ep.show?.id === SPOTIFY_SHOW_ID ||
      titlesMatch(ep.name, episodeName)
    );
    return match ? `https://open.spotify.com/episode/${match.id}` : null;
  } catch (e) {
    console.error('Spotify search error:', e.message);
    return null;
  }
}

// ── YOUTUBE ───────────────────────────────────────────────────────────────────
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
    const apiResult = await fetchYouTubeViaAPI();
    if (apiResult !== null) return apiResult;
    return await fetchYouTubeViaRSS();
  } catch (e) {
    console.error('YouTube error:', e.message);
    return [];
  }
}

// ── Construye lista completa de episodios ─────────────────────────────────────
async function buildAllEpisodes() {
  const [itunesRes, spotifyToken, youtubeVideos] = await Promise.all([
    fetch(`https://itunes.apple.com/lookup?id=${PODCAST_ID}&entity=podcastEpisode&limit=200&country=mx`),
    getSpotifyToken(),
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
    const n = epNum(v.title), url = `https://music.youtube.com/watch?v=${v.videoId}`;
    if (n) youtubeByNum[n] = url;
    youtubeByTitle.push({ title: v.title, url });
  }

  // Build episodes — Spotify from file first, then API only for new ones
  const allEpisodes = [];
  for (const ep of itunesEps) {
    const n = epNum(ep.trackName || '');

    // ── Spotify: buscar primero en episode-links.json (guardado permanentemente)
    let spotifyUrl = null;
    // 1. Buscar por nombre exacto en el archivo local
    spotifyUrl = knownSpotifyLinks[ep.trackName] || null;
    // 2. Buscar por similitud de título
    if (!spotifyUrl) {
      const match = Object.entries(knownSpotifyLinks).find(([name]) => titlesMatch(ep.trackName, name));
      if (match) spotifyUrl = match[1];
    }
    // 3. Si no está en el archivo (episodio nuevo), buscar en Spotify API
    if (!spotifyUrl) {
      console.log(`🔍 Nuevo episodio sin link de Spotify: "${ep.trackName}" — buscando en API...`);
      spotifyUrl = await findSpotifyEpisode(spotifyToken, ep.trackName);
      if (spotifyUrl) {
        // Guardar en memoria para que no lo busque de nuevo en esta sesión
        knownSpotifyLinks[ep.trackName] = spotifyUrl;
        console.log(`✅ Spotify link encontrado para "${ep.trackName}"`);
      }
    }

    // ── YouTube
    let youtubeUrl = (n && youtubeByNum[n]) || null;
    if (!youtubeUrl) {
      const m = youtubeByTitle.find(v => titlesMatch(ep.trackName, v.title));
      if (m) youtubeUrl = m.url;
    }

    allEpisodes.push({ ...ep, spotifyUrl, youtubeUrl });
  }

  return { show, allEpisodes };
}

// ── MAIN API ENDPOINT ─────────────────────────────────────────────────────────
app.get('/api/episodes', async (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 6));

    if (!cache.data || Date.now() - cache.ts > CACHE_TTL) {
      console.log('Cache miss — fetching fresh data...');
      cache.data = await buildAllEpisodes();
      cache.ts   = Date.now();
    }

    const { show, allEpisodes } = cache.data;
    const total   = allEpisodes.length;
    const page    = allEpisodes.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    res.json({ show: offset === 0 ? show : undefined, episodes: page, total, hasMore, offset, limit });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Error fetching episodes' });
  }
});

// ── ADMIN: genera el contenido de episode-links.json ─────────────────────────
// Llama este endpoint UNA VEZ para obtener todos los Spotify IDs.
// Guarda el resultado como episode-links.json en GitHub.
app.get('/admin/spotify-dump', async (req, res) => {
  try {
    const token = await getSpotifyToken();
    if (!token) return res.status(400).json({ error: 'No hay credenciales de Spotify configuradas' });

    const links = {};
    let url = `https://api.spotify.com/v1/shows/${SPOTIFY_SHOW_ID}/episodes?limit=50&market=US`;
    let total = 0;
    while (url) {
      const r    = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 429) {
        return res.status(429).json({ error: 'Spotify rate limit — espera 30 min e intenta de nuevo' });
      }
      const data = await r.json();
      if (!data.items) break;
      for (const ep of data.items) {
        links[ep.name] = `https://open.spotify.com/episode/${ep.id}`;
        total++;
      }
      url = data.next || null;
    }

    res.json({ total, links });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
