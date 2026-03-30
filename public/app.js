const SPOTIFY_SHOW = 'https://open.spotify.com/show/2YNRodcHc7nTjqVUzMRDB4';
const APPLE_SHOW = 'https://podcasts.apple.com/us/podcast/algo-m%C3%A1s-que-contarte-con-alfonso-aguirre/id1493350313?l=es-MX';
const YOUTUBE_PLAYLIST = 'https://www.youtube.com/playlist?list=PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';

function formatDuration(ms) {
  if (!ms) return '';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function openModal(episode) {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-artwork').src = episode.artworkUrl600 || episode.artworkUrl160 || '';
  document.getElementById('modal-title').textContent = episode.trackName || 'Episodio';

  // Apple Podcasts: use episode-specific URL from iTunes API
  document.getElementById('modal-apple').href = episode.trackViewUrl || APPLE_SHOW;

  // Spotify: link to show (episode-specific requires Spotify API auth)
  document.getElementById('modal-spotify').href = SPOTIFY_SHOW;

  // YouTube: playlist
  document.getElementById('modal-youtube').href = YOUTUBE_PLAYLIST;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderLatest(ep) {
  const container = document.getElementById('latest-episode');
  container.classList.remove('skeleton');
  container.innerHTML = `
    <div class="latest-card-inner">
      <img class="latest-artwork" src="${ep.artworkUrl600 || ep.artworkUrl160 || ''}" alt="${ep.trackName}" />
      <div class="latest-meta">
        <div class="latest-episode-num">Episodio más reciente</div>
        <div class="latest-title">${ep.trackName}</div>
        <div class="latest-date-duration">${formatDate(ep.releaseDate)} · ${formatDuration(ep.trackTimeMillis)}</div>
      </div>
    </div>
    <div class="latest-listen-label">Escuchar en tu plataforma favorita</div>
  `;
  container.addEventListener('click', () => openModal(ep));
}

function renderEpisodes(episodes) {
  const list = document.getElementById('episodes-list');
  list.innerHTML = '';

  episodes.forEach(ep => {
    const btn = document.createElement('button');
    btn.className = 'episode-item';
    btn.innerHTML = `
      <img class="episode-thumb" src="${ep.artworkUrl600 || ep.artworkUrl160 || ''}" alt="" />
      <div class="episode-meta">
        <div class="episode-title">${ep.trackName}</div>
        <div class="episode-date-dur">${formatDate(ep.releaseDate)} · ${formatDuration(ep.trackTimeMillis)}</div>
      </div>
      <span class="episode-chevron">›</span>
    `;
    btn.addEventListener('click', () => openModal(ep));
    list.appendChild(btn);
  });
}

async function loadEpisodes() {
  try {
    const res = await fetch(
      'https://itunes.apple.com/lookup?id=1493350313&entity=podcastEpisode&limit=20&country=mx'
    );
    const raw = await res.json();
    const results = raw.results || [];
    const show = results.find(r => r.kind === 'podcast') || results[0];
    const episodes = results
      .filter(r => r.kind === 'podcast-episode')
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
    const data = { show, episodes };

    if (data.show) {
      const artworkEl = document.getElementById('show-artwork');
      artworkEl.src = data.show.artworkUrl600 || data.show.artworkUrl100 || '';
    }

    if (data.episodes && data.episodes.length > 0) {
      renderLatest(data.episodes[0]);
      renderEpisodes(data.episodes.slice(1));
    }
  } catch (err) {
    console.error('Error loading episodes:', err);
    document.getElementById('latest-episode').innerHTML = '<p style="padding:20px;color:#666">No se pudieron cargar los episodios.</p>';
    document.getElementById('episodes-list').innerHTML = '';
  }
}

// Modal close handlers
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

loadEpisodes();
