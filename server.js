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

// ── Spotify Client Credentials ──────────────────────────────────────────────
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

// ── Fetch ALL Spotify episodes (handles pagination) ──────────────────────────
async function fetchSpotifyEpisodes(token) {
  if (!token) return [];
  const all = [];
  let url = `https://api.spotify.com/v1/shows/${SPOTIFY_SHOW_ID}/episodes?limit=50&market=US`;
  while (url) {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.items) break;
    all.push(...data.items);
    url = data.next || null;
  }
  return all;
}

// ── Fetch ALL YouTube playlist videos (handles pagination) ───────────────────
async function fetchYouTubeVideos() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const all = [];
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems`
      + `?part=snippet&playlistId=${YOUTUBE_PLAYLIST_ID}&maxResults=50&key=${key}`
      + (pageToken ? `&pageToken=${pageToken}` : '');
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.items) break;
    all.push(...data.items);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
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
      fetchSpotifyEpisodes(spotifyToken),
      fetchYouTubeVideos()
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
      const title   = video.snippet?.title || '';
      const videoId = video.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      const n = epNum(title);
      if (n) youtubeMap[n] = `https://music.youtube.com/watch?v=${videoId}`;
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
