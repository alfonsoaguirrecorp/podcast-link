(function () {
  const API = 'https://podcast-link.onrender.com/api/episodes?offset=0&limit=200';
  const SPOTIFY_SHOW = 'https://open.spotify.com/show/2YNRodcHc7nTjqVUzMRDB4';
  const APPLE_SHOW   = 'https://podcasts.apple.com/us/podcast/algo-m%C3%A1s-que-contarte-con-alfonso-aguirre/id1493350313?l=es-MX';
  const YOUTUBE_LIST = 'https://www.youtube.com/playlist?list=PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';

  const container = document.getElementById('amqc-episodes');
  if (!container) return;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .amqc-list { display:flex; flex-direction:column; gap:8px; max-width:520px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
    .amqc-ep { display:flex; gap:13px; align-items:center; padding:12px; border-radius:13px; cursor:pointer; background:#f5f5f7; border:1px solid #e8e8e8; width:100%; text-align:left; color:inherit; transition:background .15s,transform .15s; font-family:inherit; }
    .amqc-ep:hover { background:#ebebeb; transform:translateY(-1px); }
    .amqc-ep-thumb { width:56px; height:56px; border-radius:9px; object-fit:cover; flex-shrink:0; background:#ddd; }
    .amqc-ep-title { font-size:.88rem !important; font-weight:600 !important; line-height:1.35 !important; color:#111 !important; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin:0 !important; }
    .amqc-ep-dd { font-size:.73rem !important; color:#888 !important; margin-top:3px !important; }
    .amqc-ep-chev { color:#ccc; font-size:1.1rem; flex-shrink:0; margin-left:auto; padding-left:8px; }
    .amqc-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:flex-end; justify-content:center; z-index:99999; }
    .amqc-overlay.hidden { display:none !important; }
    @media(min-width:480px){ .amqc-overlay { align-items:center; } }
    .amqc-modal { background:#fff; border-radius:20px 20px 0 0; padding:22px 18px 36px; width:100%; max-width:480px; position:relative; animation:amqc-up .22s ease-out; box-shadow:0 -4px 32px rgba(0,0,0,.15); }
    @media(min-width:480px){ .amqc-modal { border-radius:20px; padding:24px; margin:16px; } }
    @keyframes amqc-up { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }
    .amqc-close { position:absolute; top:12px; right:12px; background:#f0f0f0; border:none; color:#666; width:28px; height:28px; border-radius:50%; font-size:1.1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; font-family:inherit; }
    .amqc-close:hover { background:#e0e0e0; color:#111; }
    .amqc-mhead { display:flex; gap:12px; align-items:flex-start; margin-bottom:18px; padding-right:34px; }
    .amqc-mart { width:56px; height:56px; border-radius:9px; object-fit:cover; flex-shrink:0; background:#ddd; }
    .amqc-mshow { font-size:.68rem !important; color:#999 !important; margin:0 0 3px !important; }
    .amqc-mtitle { font-size:.9rem !important; font-weight:600 !important; line-height:1.4 !important; color:#111 !important; margin:0 !important; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .amqc-mlabel { font-size:.65rem !important; font-weight:700 !important; text-transform:uppercase; letter-spacing:.07em; color:#aaa !important; margin:0 0 9px !important; }
    .amqc-mplatforms { display:flex; flex-direction:column; gap:8px; }
    .amqc-mbtn { display:flex; align-items:center; gap:13px; padding:12px 15px; border-radius:13px; text-decoration:none !important; font-size:.9rem !important; font-weight:600 !important; color:#fff !important; transition:opacity .15s,transform .15s; font-family:inherit; }
    .amqc-mbtn:hover { opacity:.88; transform:translateY(-1px); color:#fff !important; }
    .amqc-mbtn:visited { color:#fff !important; }
    .amqc-mbtn svg { width:19px; height:19px; flex-shrink:0; }
    .amqc-mbtn.sp { background:#1DB954; }
    .amqc-mbtn.ap { background:#B150E2; }
    .amqc-mbtn.yt { background:#FF0000; }
  `;
  document.head.appendChild(style);

  // ── SVGs ──────────────────────────────────────────────────────────────────
  const SVG_SP = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;
  const SVG_AP = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3.5a3.5 3.5 0 0 1 3.5 3.5c0 1.33-.744 2.484-1.836 3.086A5.51 5.51 0 0 1 15 14.5c.0.276-.224.5-.5.5h-5a.5.5 0 0 1-.5-.5 5.51 5.51 0 0 1 1.336-3.414A3.497 3.497 0 0 1 8.5 9 3.5 3.5 0 0 1 12 5.5zm0 9.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>`;
  const SVG_YT = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;

  // ── Modal ─────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'amqc-overlay hidden';
  overlay.innerHTML = `
    <div class="amqc-modal">
      <button class="amqc-close">&times;</button>
      <div class="amqc-mhead">
        <img class="amqc-mart" id="amqc-mart" src="" alt="" />
        <div>
          <p class="amqc-mshow">Algo Más Que Contarte con Alfonso Aguirre</p>
          <p class="amqc-mtitle" id="amqc-mtitle"></p>
        </div>
      </div>
      <p class="amqc-mlabel">Escuchar en</p>
      <div class="amqc-mplatforms">
        <a id="amqc-msp" href="#" class="amqc-mbtn sp">${SVG_SP} Spotify</a>
        <a id="amqc-map" href="#" class="amqc-mbtn ap">${SVG_AP} Apple Podcasts</a>
        <a id="amqc-myt" href="#" class="amqc-mbtn yt">${SVG_YT} YouTube</a>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function openLink(id) {
    document.getElementById(id).addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      window.open(this.href, '_blank', 'noopener,noreferrer');
    });
  }
  openLink('amqc-msp'); openLink('amqc-map'); openLink('amqc-myt');

  function openModal(ep) {
    document.getElementById('amqc-mart').src       = ep.artworkUrl600 || ep.artworkUrl160 || '';
    document.getElementById('amqc-mtitle').textContent = ep.trackName || '';
    document.getElementById('amqc-msp').href = ep.spotifyUrl   || SPOTIFY_SHOW;
    document.getElementById('amqc-map').href = ep.trackViewUrl || APPLE_SHOW;
    document.getElementById('amqc-myt').href = ep.youtubeUrl   || YOUTUBE_LIST;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }
  overlay.querySelector('.amqc-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtDur(ms) {
    if (!ms) return '';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} hr ${m} min` : `${m} min`;
  }
  function fmtDate(str) {
    return new Date(str).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' });
  }

  // ── Fetch & render ────────────────────────────────────────────────────────
  container.innerHTML = '<div class="amqc-list"><div style="height:68px;background:#ececec;border-radius:13px;animation:amqc-pulse 1.5s ease-in-out infinite"></div><div style="height:68px;background:#ececec;border-radius:13px;animation:amqc-pulse 1.5s ease-in-out infinite"></div></div><style>@keyframes amqc-pulse{0%,100%{opacity:1}50%{opacity:.45}}</style>';

  fetch(API)
    .then(r => r.json())
    .then(data => {
      const all = data.episodes || [];
      // Filter to episodes #35 and #48 — match /#35[ :,]/ and /#48[ :,]/
      const target = all.filter(ep => /\#(35|48)(?!\d)/.test(ep.trackName));

      // Sort: #48 first, then #35
      target.sort((a, b) => {
        const numA = parseInt((a.trackName.match(/\#(\d+)/) || [])[1] || 0);
        const numB = parseInt((b.trackName.match(/\#(\d+)/) || [])[1] || 0);
        return numB - numA;
      });

      if (!target.length) {
        container.innerHTML = '<p style="color:#aaa;font-family:sans-serif;font-size:.85rem">No se encontraron los episodios.</p>';
        return;
      }

      const list = document.createElement('div');
      list.className = 'amqc-list';

      target.forEach(ep => {
        const btn = document.createElement('button');
        btn.className = 'amqc-ep';
        btn.innerHTML = `
          <img class="amqc-ep-thumb" src="${ep.artworkUrl600 || ep.artworkUrl160 || ''}" alt="" />
          <div style="flex:1;min-width:0">
            <div class="amqc-ep-title">${ep.trackName}</div>
            <div class="amqc-ep-dd">${fmtDate(ep.releaseDate)} · ${fmtDur(ep.trackTimeMillis)}</div>
          </div>
          <span class="amqc-ep-chev">›</span>`;
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
