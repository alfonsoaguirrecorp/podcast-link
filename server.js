const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const PODCAST_ID          = '1493350313';
const SPOTIFY_SHOW_ID     = '2YNRodcHc7nTjqVUzMRDB4';
const YOUTUBE_PLAYLIST_ID = 'PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';

app.use(express.static(path.join(__dirname, 'public')));

// CORS — permite que sitios externos (Kajabi, etc.) usen el API
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  next();
});

app.get('/embed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'embed.html'));
});

// ── DEBUG endpoint ───────────────────────────────────────────────────────────
app.get('/debug/spotify', async (req, res) => {
  try {
    const token = await getSpotifyToken();
    if (!token) return res.json({ error: 'No token — check env vars', id: !!process.env.SPOTIFY_CLIENT_ID, secret: !!process.env.SPOTIFY_CLIENT_SECRET });
    const r = await fetch(`https://api.spotify.com/v1/shows/${SPOTIFY_SHOW_ID}/episodes?limit=5&market=US`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    res.json({ status: r.status, hasItems: !!d.items, count: d.items?.length, error: d.error, first: d.items?.[0]?.name });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── HTML entity decoder for RSS titles ──────────────────────────────────────
function decodeHtml(str = '') {
  return str
    .replace(/&#(\d+);/g,        (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

// ── Episode number extractor: "#83" → 83 ────────────────────────────────────
function epNum(title = '') {
  const m = title.match(/#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Title normalizer: strips episode numbers, punctuation, lowercases ────────
function normalizeTitle(title = '') {
  return title
    .replace(/#\d+\s*[:·\-]?\s*/g, '')              // remove "#83: " prefix
    .replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ\s]/g, ' ')         // keep letters/numbers/Spanish
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── Title similarity check ───────────────────────────────────────────────────
function titlesMatch(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Word overlap: 70% of the shorter title's meaningful words appear in the other
  const wordsA = na.split(' ').filter(w => w.length > 3);
  const setB   = new Set(nb.split(' ').filter(w => w.length > 3));
  if (!wordsA.length) return false;
  return wordsA.filter(w => setB.has(w)).length / wordsA.length >= 0.7;
}

// ── SPOTIFY ──────────────────────────────────────────────────────────────────
async function getSpotifyToken() {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res  = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  return (await res.json()).access_token || null;
}

async function fetchSpotifyEpisodes(token) {
  if (!token) return [];
  try {
    const all = [];
    let url = `https://api.spotify.com/v1/shows/${SPOTIFY_SHOW_ID}/episodes?limit=50&market=US`;
    while (url) {
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.items) break;
      all.push(...data.items);           // each item: { id, name }
      url = data.next || null;
    }
    return all;
  } catch (e) {
    console.error('Spotify API error:', e.message);
    return [];
  }
}

// ── YOUTUBE ──────────────────────────────────────────────────────────────────
// Option A: YouTube Data API (all videos, requires YOUTUBE_API_KEY)
async function fetchYouTubeViaAPI() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null; // signal to use RSS fallback
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

// Option B: Free YouTube RSS feed (last 15 videos only, no key needed)
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
    if (apiResult !== null) return apiResult;   // API available → use it (all videos)
    return await fetchYouTubeViaRSS();          // no key → RSS (last 15 only)
  } catch (e) {
    console.error('YouTube error:', e.message);
    return [];
  }
}

// ── MAIN API ENDPOINT — supports ?offset=0&limit=6 ──────────────────────────
app.get('/api/episodes', async (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 6));

    const [itunesRes, spotifyToken] = await Promise.all([
      fetch(`https://itunes.apple.com/lookup?id=${PODCAST_ID}&entity=podcastEpisode&limit=200&country=mx`),
      getSpotifyToken()
    ]);

    const [itunesData, spotifyEps, youtubeVideos] = await Promise.all([
      itunesRes.json(),
      fetchSpotifyEpisodes(spotifyToken),
      fetchYouTubeVideos()
    ]);

    // iTunes
    const results   = itunesData.results || [];
    const show      = results.find(r => r.wrapperType === 'track' && r.kind === 'podcast') || results[0];
    const itunesEps = results
      .filter(r => r.wrapperType === 'podcastEpisode' || r.kind === 'podcast-episode')
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

    // Spotify: index by number AND keep list for title matching
    const spotifyByNum   = {};
    const spotifyByTitle = [];
    for (const ep of spotifyEps) {
      const n   = epNum(ep.name);
      const url = `https://open.spotify.com/episode/${ep.id}`;
      if (n) spotifyByNum[n] = url;
      spotifyByTitle.push({ title: ep.name, url });
    }

    // YouTube: index by number AND keep list for title matching
    const youtubeByNum   = {};
    const youtubeByTitle = [];
    for (const v of youtubeVideos) {
      const n   = epNum(v.title);
      const url = `https://music.youtube.com/watch?v=${v.videoId}`;
      if (n) youtubeByNum[n] = url;
      youtubeByTitle.push({ title: v.title, url });
    }

    // Merge all episodes with platform URLs
    const allEpisodes = itunesEps.map(ep => {
      const n = epNum(ep.trackName || '');

      let spotifyUrl = (n && spotifyByNum[n]) || null;
      if (!spotifyUrl) {
        const m = spotifyByTitle.find(v => titlesMatch(ep.trackName, v.title));
        if (m) spotifyUrl = m.url;
      }

      let youtubeUrl = (n && youtubeByNum[n]) || null;
      if (!youtubeUrl) {
        const m = youtubeByTitle.find(v => titlesMatch(ep.trackName, v.title));
        if (m) youtubeUrl = m.url;
      }

      return { ...ep, spotifyUrl, youtubeUrl };
    });

    const total   = allEpisodes.length;
    const page    = allEpisodes.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    res.json({ show: offset === 0 ? show : undefined, episodes: page, total, hasMore, offset, limit });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Error fetching episodes' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
