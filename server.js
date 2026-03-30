const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const PODCAST_ID = '1493350313';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/episodes', async (req, res) => {
  try {
    const url = `https://itunes.apple.com/lookup?id=${PODCAST_ID}&entity=podcastEpisode&limit=20&country=mx`;
    const response = await fetch(url);
    const data = await response.json();

    const results = data.results || [];
    const show = results.find(r => r.wrapperType === 'track' && r.kind === 'podcast') || results[0];
    const episodes = results
      .filter(r => r.wrapperType === 'podcastEpisode' || r.kind === 'podcast-episode')
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

    res.json({ show, episodes });
  } catch (err) {
    console.error('Error fetching episodes:', err);
    res.status(500).json({ error: 'Error fetching episodes' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
