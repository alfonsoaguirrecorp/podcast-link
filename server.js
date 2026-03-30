const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const PODCAST_ID          = '1493350313';
const SPOTIFY_SHOW_ID     = '2YNRodcHc7nTjqVUzMRDB4';
const YOUTUBE_PLAYLIST_ID = 'PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';

// Fallbacks when API keys are missing
const SPOTIFY_SHOW_URL   = 'https://open.spotify.com/show/2YNRodcHc7nTjqVUzMRDB4';
const YOUTUBE_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';

app.use(express.static(path.join(__dirname, 'public')));

// ── Spotify: get token via Client Credentials (optional) ────────────────────
async function getSpotifyToken() {
  const id     = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token || null;
}

// ── Spotify: fetch episodes via official API ─────────────────────────────────
async function fetchSpotifyViaAPI(token) {
  const all = [];
  let url = `https://api.spotify.com/v1/shows/${SPOTIFY_SHOW_ID}/episodes?limit=50&market=US`;
  while (url) {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.items) break;
    all.push(...data.items);
    url = data.next || null;
  }
  return all; // each item has { id, name }
}

// ── Spotify: parse episode IDs from show page HTML (no credentials needed) ───
async function fetchSpotifyViaPage() {
  const res = await fetch(`https://open.spotify.com/show/${SPOTIFY_SHOW_ID}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await res.text();

  // Spotify embeds all page data in a __NEXT_DATA__ JSON script tag
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return [];

  const raw = match[1];
  // Extract all { "name": "...", "uri": "spotify:episode:ID" } pairs
  const pairs = [...raw.matchAll(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*"[^"]*"\s*:\s*(?:"[^"]*"|[^,}\]]*)\s*,?\s*)*"uri"\s*:\s*"spotify:episode:([A-Za-z0-9]+)"/g)];

  // Also try the reverse order: uri before name
  const pairsRev = [...raw.matchAll(/"uri"\s*:\s*"spotify:episode:([A-Za-z0-9]+)"[^}]*?"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];

  const results = [];
  for (const [, name, id] of pairs)    results.push({ id, name: name.replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) });
  for (const [, id, name] of pairsRev) results.push({ id, name: name.replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) });

  // Deduplicate by ID
  const seen = new Set();
  return results.filter(e => seen.has(e.id) ? false : seen.add(e.id));
}

// ── Spotify: try API first, then page scraping ───────────────────────────────
async function fetchSpotifyEpisodes(token) {
  try {
    if (token) return await fetchSpotifyViaAPI(token);
    return await fetchSpotifyViaPage();
  } catch (e) {
    console.error('Spotify fetch error:', e.message);
    return [];
  }
}

// ── Fetch YouTube videos via free public RSS feed (no API key needed) ────────
async function fetchYouTubeVideos() {
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${YOUTUBE_PLAYLIST_ID}`;
    const res  = await fetch(url);
    const xml  = await res.text();

    // Parse <entry> blocks from Atom feed
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
    return entries.map(([, block]) => {
      const videoId = (block.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || '';
      const title   = (block.match(/<title>(.*?)<\/title>/)            || [])[1] || '';
      return { videoId, title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') };
    }).filter(v => v.videoId);
  } catch (e) {
    console.error('YouTube RSS error:', e.message);
    return [];
  }
}

// ── Extract episode number from title, e.g. "#83" → 83 ──────────────────────
function epNum(title = '') {
  const m = title.match(/#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Main API endpoint ────────────────────────────────────────────────────────
app.get('/api/episodes', async (req, res) => {
  try {
    const itunesUrl = `https://itunes.apple.com/lookup?id=${PODCAST_ID}&entity=podcastEpisode&limit=50&country=mx`;

    // Kick off all fetches in parallel
    const [itunesRes, spotifyToken] = await Promise.all([
      fetch(itunesUrl),
      getSpotifyToken()
    ]);

    const [itunesData, spotifyEps, youtubeVideos] = await Promise.all([
      itunesRes.json(),
      fetchSpotifyEpisodes(spotifyToken),  // uses page scraping if no token
      fetchYouTubeVideos()                 // uses free RSS feed, no key needed
    ]);

    // ── iTunes ──
    const results = itunesData.results || [];
    const show    = results.find(r => r.wrapperType === 'track' && r.kind === 'podcast') || results[0];
    const itunesEps = results
      .filter(r => r.wrapperType === 'podcastEpisode' || r.kind === 'podcast-episode')
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

    // ── Spotify: build map { episodeNumber → spotifyEpisodeUrl } ──
    const spotifyMap = {};
    for (const ep of spotifyEps) {
      const n = epNum(ep.name);
      if (n) spotifyMap[n] = `https://open.spotify.com/episode/${ep.id}`;
    }

    // ── YouTube: build map { episodeNumber → youtubeMusicUrl } ──
    const youtubeMap = {};
    for (const video of youtubeVideos) {
      const n = epNum(video.title);
      if (n) youtubeMap[n] = `https://music.youtube.com/watch?v=${video.videoId}`;
    }

    // ── Merge ──
    const episodes = itunesEps.map(ep => {
      const n = epNum(ep.trackName || '');
      return {
        ...ep,
        spotifyUrl: n && spotifyMap[n] ? spotifyMap[n] : null,
        youtubeUrl: n && youtubeMap[n] ? youtubeMap[n] : null
      };
    });

    res.json({ show, episodes, spotifyReady: !!spotifyToken, youtubeReady: youtubeVideos.length > 0 });
  } catch (err) {
    console.error('Error fetching episodes:', err);
    res.status(500).json({ error: 'Error fetching episodes' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
