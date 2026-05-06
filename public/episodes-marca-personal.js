(function () {
  const SPOTIFY_SHOW = 'https://open.spotify.com/show/2YNRodcHc7nTjqVUzMRDB4';
  const APPLE_SHOW   = 'https://podcasts.apple.com/us/podcast/algo-m%C3%A1s-que-contarte-con-alfonso-aguirre/id1493350313?l=es-MX';
  const YOUTUBE_LIST = 'https://www.youtube.com/playlist?list=PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';

  const container = document.getElementById('amqcmp-episodes');
  if (!container) return;

  // ── Styles ────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .amqcmp-list { display:flex; flex-direction:column; gap:8px; max-width:520px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }

    /* Row */
    .amqcmp-ep { display:flex; gap:13px; align-items:center; padding:12px 14px; border-radius:13px; cursor:pointer; background:#f5f5f7; border:1px solid #e8e8e8; width:100%; text-align:left; color:inherit; transition:background .15s,transform .15s; font-family:inherit; }
    .amqcmp-ep:hover { background:#ebebeb; transform:translateY(-1px); }

    /* Play button */
    .amqcmp-play { width:44px; height:44px; border-radius:50%; background:#111; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s,transform .15s; }
    .amqcmp-ep:hover .amqcmp-play { background:#333; transform:scale(1.05); }
    .amqcmp-play svg { width:18px; height:18px; fill:#fff; margin-left:2px; }

    /* Text */
    .amqcmp-ep-title { font-size:.88rem !important; font-weight:600 !important; line-height:1.35 !important; color:#111 !important; margin:0 !important; }
    .amqcmp-ep-meta  { font-size:.73rem !important; color:#888 !important; margin-top:3px !important; }
    .amqcmp-ep-chev  { color:#ccc; font-size:1.1rem; flex-shrink:0; margin-left:auto; padding-left:8px; }

    /* Overlay */
    .amqcmp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:flex-end; justify-content:center; z-index:99999; }
    .amqcmp-overlay.hidden { display:none !important; }
    @media(min-width:480px){ .amqcmp-overlay { align-items:center; } }

    /* Modal */
    .amqcmp-modal { background:#fff; border-radius:20px 20px 0 0; padding:22px 18px 36px; width:100%; max-width:480px; position:relative; animation:amqcmp-up .22s ease-out; box-shadow:0 -4px 32px rgba(0,0,0,.15); }
    @media(min-width:480px){ .amqcmp-modal { border-radius:20px; padding:24px; margin:16px; } }
    @keyframes amqcmp-up { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }

    .amqcmp-close { position:absolute; top:12px; right:12px; background:#f0f0f0; border:none; color:#666; width:28px; height:28px; border-radius:50%; font-size:1.1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; font-family:inherit; }
    .amqcmp-close:hover { background:#e0e0e0; color:#111; }

    /* Modal header */
    .amqcmp-mhead { display:flex; gap:12px; align-items:flex-start; margin-bottom:18px; padding-right:34px; }
    .amqcmp-mart  { width:60px; height:60px; border-radius:10px; object-fit:cover; flex-shrink:0; background:#eee; }
    .amqcmp-mshow { font-size:.68rem !important; color:#999 !important; margin:0 0 3px !important; }
    .amqcmp-mtitle { font-size:.9rem !important; font-weight:600 !important; line-height:1.4 !important; color:#111 !important; margin:0 !important; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }

    /* Platform buttons */
    .amqcmp-mlabel     { font-size:.65rem !important; font-weight:700 !important; text-transform:uppercase; letter-spacing:.07em; color:#aaa !important; margin:0 0 9px !important; }
    .amqcmp-mplatforms { display:flex; flex-direction:column; gap:8px; }
    .amqcmp-mbtn  { display:flex; align-items:center; gap:13px; padding:12px 15px; border-radius:13px; text-decoration:none !important; font-size:.9rem !important; font-weight:600 !important; color:#fff !important; transition:opacity .15s,transform .15s; font-family:inherit; }
    .amqcmp-mbtn:hover   { opacity:.88; transform:translateY(-1px); color:#fff !important; }
    .amqcmp-mbtn:visited { color:#fff !important; }
    .amqcmp-mbtn svg { width:19px; height:19px; flex-shrink:0; }
    .amqcmp-mbtn.sp { background:#1DB954; }
    .amqcmp-mbtn.ap { background:#B150E2; }
    .amqcmp-mbtn.yt { background:#FF0000; }
  `;
  document.head.appendChild(style);

  // ── SVGs ──────────────────────────────────────────────────────────────────────
  const SVG_PLAY = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  const SVG_SP   = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;
  const SVG_AP   = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c0 3.59-2.91 6.5-6.5 6.5S5.5 15.59 5.5 12 8.41 5.5 12 5.5s6.5 2.91 6.5 6.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`;
  const SVG_YT   = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;

  // ── Modal ─────────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'amqcmp-overlay hidden';
  overlay.innerHTML = `
    <div class="amqcmp-modal">
      <button class="amqcmp-close">&times;</button>
      <div class="amqcmp-mhead">
        <img class="amqcmp-mart" id="amqcmp-mart" src="" alt="" />
        <div>
          <p class="amqcmp-mshow">Algo Más Que Contarte · Alfonso Aguirre</p>
          <p class="amqcmp-mtitle" id="amqcmp-mtitle"></p>
        </div>
      </div>
      <p class="amqcmp-mlabel">Escuchar en</p>
      <div class="amqcmp-mplatforms">
        <a id="amqcmp-msp" href="#" class="amqcmp-mbtn sp">${SVG_SP} Spotify</a>
        <a id="amqcmp-map" href="#" class="amqcmp-mbtn ap">${SVG_AP} Apple Podcasts</a>
        <a id="amqcmp-myt" href="#" class="amqcmp-mbtn yt">${SVG_YT} YouTube</a>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  ['amqcmp-msp', 'amqcmp-map', 'amqcmp-myt'].forEach(id => {
    document.getElementById(id).addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      window.open(this.href, '_blank', 'noopener,noreferrer');
    });
  });

  function openModal(ep) {
    document.getElementById('amqcmp-mart').src             = ep.artworkUrl600 || ep.artworkUrl160 || '';
    document.getElementById('amqcmp-mtitle').textContent   = ep.trackName || '';
    document.getElementById('amqcmp-msp').href             = ep.spotifyUrl   || SPOTIFY_SHOW;
    document.getElementById('amqcmp-map').href             = ep.trackViewUrl || APPLE_SHOW;
    document.getElementById('amqcmp-myt').href             = ep.youtubeUrl   || YOUTUBE_LIST;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }
  overlay.querySelector('.amqcmp-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function fmtDate(str) {
    return new Date(str).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fmtDur(ms) {
    if (!ms) return '';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} hr ${m} min` : `${m} min`;
  }

  // ── Loading skeletons ─────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="amqcmp-list">
      ${Array(4).fill(`<div style="height:68px;background:#ececec;border-radius:13px;animation:amqcmp-sk 1.5s ease-in-out infinite"></div>`).join('')}
    </div>
    <style>@keyframes amqcmp-sk{0%,100%{opacity:1}50%{opacity:.45}}</style>`;

  // ── Fetch (ambas páginas para cubrir ep. #50–52 y #85) ───────────────────────
  Promise.all([
    fetch('https://podcast-link.onrender.com/api/episodes?offset=0&limit=50').then(r => r.json()),
    fetch('https://podcast-link.onrender.com/api/episodes?offset=50&limit=50').then(r => r.json())
  ])
    .then(([p1, p2]) => {
      const all    = [...(p1.episodes || []), ...(p2.episodes || [])];
      const target = all.filter(ep => /\#(85|52|51|50)(?!\d)/.test(ep.trackName));

      // Orden: #85, #52, #51, #50
      target.sort((a, b) => {
        const na = parseInt((a.trackName.match(/#(\d+)/) || [])[1] || 0);
        const nb = parseInt((b.trackName.match(/#(\d+)/) || [])[1] || 0);
        return nb - na;
      });

      if (!target.length) {
        container.innerHTML = '<p style="color:#aaa;font-family:sans-serif;font-size:.85rem">No se encontraron los episodios.</p>';
        return;
      }

      const list = document.createElement('div');
      list.className = 'amqcmp-list';

      target.forEach(ep => {
        const dur  = fmtDur(ep.trackTimeMillis);
        const date = fmtDate(ep.releaseDate);
        const meta = [date, dur].filter(Boolean).join(' · ');

        const btn = document.createElement('button');
        btn.className = 'amqcmp-ep';
        btn.innerHTML = `
          <div class="amqcmp-play">${SVG_PLAY}</div>
          <div style="flex:1;min-width:0">
            <div class="amqcmp-ep-title">${ep.trackName}</div>
            <div class="amqcmp-ep-meta">${meta}</div>
          </div>
          <span class="amqcmp-ep-chev">›</span>`;
        btn.addEventListener('click', () => openModal(ep));
        list.appendChild(btn);
      });

      container.innerHTML = '';
      container.appendChild(list);
    })
    .catch(() => {
      container.innerHTML = '<p style="color:#aaa;font-family:sans-serif;font-size:.85rem">No se pudieron cargar los episodios.</p>';
    });
})();
