(function () {
  const API = 'https://podcast-link.onrender.com/api/episodes';
  const SPOTIFY_SHOW = 'https://open.spotify.com/show/2YNRodcHc7nTjqVUzMRDB4';
  const APPLE_SHOW   = 'https://podcasts.apple.com/us/podcast/algo-m%C3%A1s-que-contarte-con-alfonso-aguirre/id1493350313?l=es-MX';
  const YOUTUBE_LIST = 'https://www.youtube.com/playlist?list=PLcjbYuEvmLRm3Ff2fvpnsq9MkREPV0zdt';

  // ── Inject styles ────────────────────────────────────────────────────────
  const css = `
    .pc-wrap * { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; box-sizing: border-box !important; }
    .pc-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; max-width: 520px; margin: 0 auto; padding: 8px 0 40px; color: #111; }
    .pc-header { display:flex; flex-direction:column; align-items:center; gap:12px; margin-bottom:24px; text-align:center; }
    .pc-show-art { width:88px; height:88px; border-radius:14px; object-fit:cover; box-shadow:0 4px 16px rgba(0,0,0,.12); background:#e8e8e8; }
    .pc-show-name { font-size:1.1rem !important; font-weight:700 !important; color:#111 !important; margin:0; }
    .pc-show-sub  { font-size:0.85rem !important; color:#777 !important; margin:2px 0 0; }
    .pc-platforms { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:32px; }
    .pc-pbtn { display:inline-flex; align-items:center; gap:7px; padding:8px 15px; border-radius:100px; font-size:0.8rem !important; font-weight:600 !important; text-decoration:none !important; color:#fff !important; transition:transform .15s,opacity .15s; }
    .pc-pbtn:hover { transform:translateY(-1px); opacity:.88; color:#fff !important; text-decoration:none !important; }
    .pc-pbtn:visited { color:#fff !important; }
    .pc-pbtn svg { width:15px; height:15px; flex-shrink:0; }
    .pc-pbtn.sp { background:#1DB954; } .pc-pbtn.ap { background:#B150E2; } .pc-pbtn.yt { background:#FF0000; }
    .pc-section { margin-bottom:28px; }
    .pc-section-title { font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#aaa; margin:0 0 10px; }
    .pc-latest { background:#f5f5f7; border-radius:14px; overflow:hidden; cursor:pointer; border:1px solid #e8e8e8; transition:transform .15s,background .15s; }
    .pc-latest:hover { transform:translateY(-2px); background:#efefef; }
    .pc-latest-inner { padding:14px; display:flex; gap:13px; align-items:flex-start; }
    .pc-latest-art { width:64px; height:64px; border-radius:9px; object-fit:cover; flex-shrink:0; background:#ddd; }
    .pc-latest-label { font-size:.65rem; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:.05em; margin-bottom:3px; }
    .pc-latest-title { font-size:.9rem !important; font-weight:600 !important; line-height:1.4 !important; color:#111 !important; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .pc-latest-dd { font-size:.74rem !important; color:#888 !important; margin-top:4px; }
    .pc-latest-footer { padding:10px 14px; border-top:1px solid #e8e8e8; font-size:.74rem; color:#999; display:flex; align-items:center; }
    .pc-latest-footer::after { content:'›'; margin-left:auto; font-size:1rem; color:#ccc; }
    .pc-list { display:flex; flex-direction:column; gap:1px; }
    .pc-ep { display:flex; gap:11px; align-items:center; padding:10px; border-radius:11px; cursor:pointer; background:transparent; border:none; width:100%; text-align:left; color:inherit; transition:background .15s; font-family:inherit; }
    .pc-ep:hover { background:#f5f5f7; }
    .pc-ep-thumb { width:46px; height:46px; border-radius:7px; object-fit:cover; flex-shrink:0; background:#e8e8e8; }
    .pc-ep-title { font-size:.84rem !important; font-weight:500 !important; line-height:1.35 !important; color:#111 !important; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .pc-ep-dd { font-size:.72rem !important; color:#888 !important; margin-top:2px; }
    .pc-ep-chev { color:#ccc; font-size:1rem; flex-shrink:0; }
    .pc-skel { background:#ececec; animation:pc-pulse 1.5s ease-in-out infinite; border-radius:12px; }
    .pc-skel-latest { height:110px; margin-bottom:0; }
    .pc-skel-ep { height:68px; margin-bottom:1px; }
    @keyframes pc-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
    .pc-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:flex-end; justify-content:center; z-index:99999; }
    .pc-modal-overlay.pc-hidden { display:none; }
    @media(min-width:480px){ .pc-modal-overlay { align-items:center; } }
    .pc-modal { background:#fff; border-radius:20px 20px 0 0; padding:22px 18px 36px; width:100%; max-width:480px; position:relative; animation:pc-up .22s ease-out; box-shadow:0 -4px 32px rgba(0,0,0,.15); }
    @media(min-width:480px){ .pc-modal { border-radius:20px; padding:24px; margin:16px; } }
    @keyframes pc-up { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }
    .pc-modal-close { position:absolute; top:12px; right:12px; background:#f0f0f0; border:none; color:#666; width:28px; height:28px; border-radius:50%; font-size:1.1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .pc-modal-close:hover { background:#e0e0e0; color:#111; }
    .pc-modal-head { display:flex; gap:11px; align-items:flex-start; margin-bottom:18px; padding-right:34px; }
    .pc-modal-art { width:56px; height:56px; border-radius:9px; object-fit:cover; flex-shrink:0; background:#ddd; }
    .pc-modal-show { font-size:.68rem !important; color:#999 !important; margin:0 0 3px; }
    .pc-modal-title { font-size:.9rem !important; font-weight:600 !important; line-height:1.4 !important; color:#111 !important; margin:0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .pc-modal-label { font-size:.65rem !important; font-weight:700 !important; text-transform:uppercase; letter-spacing:.07em; color:#aaa !important; margin:0 0 9px; }
    .pc-modal-platforms { display:flex; flex-direction:column; gap:8px; }
    .pc-mpbtn { display:flex; align-items:center; gap:13px; padding:12px 15px; border-radius:13px; text-decoration:none !important; font-size:.9rem !important; font-weight:600 !important; color:#fff !important; transition:opacity .15s,transform .15s; }
    .pc-mpbtn:hover { opacity:.88; transform:translateY(-1px); color:#fff !important; }
    .pc-mpbtn:visited { color:#fff !important; }
    .pc-mpbtn svg { width:19px; height:19px; flex-shrink:0; }
    .pc-mpbtn.sp { background:#1DB954; } .pc-mpbtn.ap { background:#B150E2; } .pc-mpbtn.yt { background:#FF0000; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── SVGs ─────────────────────────────────────────────────────────────────
  const SVG_SP = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;
  const SVG_AP = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3.5a3.5 3.5 0 0 1 3.5 3.5c0 1.33-.744 2.484-1.836 3.086A5.51 5.51 0 0 1 15 14.5c0 .276-.224.5-.5.5h-5a.5.5 0 0 1-.5-.5 5.51 5.51 0 0 1 1.336-3.414A3.497 3.497 0 0 1 8.5 9 3.5 3.5 0 0 1 12 5.5zm0 9.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z"/></svg>`;
  const SVG_YT = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;

  // ── Build HTML ────────────────────────────────────────────────────────────
  const container = document.getElementById('podcast-widget');
  if (!container) return;

  container.innerHTML = `
    <div class="pc-wrap">
      <div class="pc-header">
        <img id="pc-show-art" class="pc-show-art" src="https://is1-ssl.mzstatic.com/image/thumb/Podcasts116/v4/bf/ec/58/bfec583a-abc7-e2ce-98e7-ddad6b2827cc/mza_16516226109485693154.png/600x600bb.jpg" alt="Podcast" />
        <div>
          <p id="pc-show-name" class="pc-show-name">Algo Más Que Contarte</p>
          <p class="pc-show-sub">con Alfonso Aguirre</p>
        </div>
      </div>
      <div class="pc-platforms">
        <a href="${SPOTIFY_SHOW}" target="_blank" rel="noopener" class="pc-pbtn sp">${SVG_SP} Spotify</a>
        <a href="${APPLE_SHOW}"   target="_blank" rel="noopener" class="pc-pbtn ap">${SVG_AP} Apple Podcasts</a>
        <a href="${YOUTUBE_LIST}" target="_blank" rel="noopener" class="pc-pbtn yt">${SVG_YT} YouTube Music</a>
      </div>
      <div class="pc-section">
        <h2 class="pc-section-title">Episodio más reciente</h2>
        <div id="pc-latest"><div class="pc-skel pc-skel-latest"></div></div>
      </div>
      <div class="pc-section">
        <h2 class="pc-section-title">Episodios</h2>
        <div id="pc-list">
          <div class="pc-skel pc-skel-ep"></div>
          <div class="pc-skel pc-skel-ep"></div>
          <div class="pc-skel pc-skel-ep"></div>
        </div>
        <div id="pc-sentinel" style="height:1px;margin-top:8px;"></div>
      </div>
    </div>`;

  // ── Modal (attached to body so it overlays the full page) ─────────────────
  const modal = document.createElement('div');
  modal.id = 'pc-modal-overlay';
  modal.className = 'pc-modal-overlay pc-hidden';
  modal.innerHTML = `
    <div class="pc-modal">
      <button class="pc-modal-close" id="pc-modal-close">&times;</button>
      <div class="pc-modal-head">
        <img id="pc-modal-art" class="pc-modal-art" src="" alt="" />
        <div>
          <p class="pc-modal-show">Algo Más Que Contarte con Alfonso Aguirre</p>
          <p id="pc-modal-title" class="pc-modal-title"></p>
        </div>
      </div>
      <p class="pc-modal-label">Escuchar en</p>
      <div class="pc-modal-platforms">
        <a id="pc-modal-sp" href="#" target="_blank" rel="noopener" class="pc-mpbtn sp">${SVG_SP} Spotify</a>
        <a id="pc-modal-ap" href="#" target="_blank" rel="noopener" class="pc-mpbtn ap">${SVG_AP} Apple Podcasts</a>
        <a id="pc-modal-yt" href="#" target="_blank" rel="noopener" class="pc-mpbtn yt">${SVG_YT} YouTube Music</a>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // ── Modal logic ───────────────────────────────────────────────────────────
  // Force window.open() to bypass Kajabi's global click preventDefault
  function addOpenHandler(id) {
    document.getElementById(id).addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      window.open(this.href, '_blank', 'noopener,noreferrer');
    });
  }
  addOpenHandler('pc-modal-sp');
  addOpenHandler('pc-modal-ap');
  addOpenHandler('pc-modal-yt');

  function openModal(ep) {
    document.getElementById('pc-modal-art').src           = ep.artworkUrl600 || ep.artworkUrl160 || '';
    document.getElementById('pc-modal-title').textContent = ep.trackName || '';
    document.getElementById('pc-modal-sp').href = ep.spotifyUrl   || SPOTIFY_SHOW;
    document.getElementById('pc-modal-ap').href = ep.trackViewUrl || APPLE_SHOW;
    document.getElementById('pc-modal-yt').href = ep.youtubeUrl   || YOUTUBE_LIST;
    modal.classList.remove('pc-hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.add('pc-hidden');
    document.body.style.overflow = '';
  }
  document.getElementById('pc-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
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

  // ── Render ────────────────────────────────────────────────────────────────
  function renderLatest(ep) {
    document.getElementById('pc-latest').innerHTML = `
      <div class="pc-latest" id="pc-latest-card">
        <div class="pc-latest-inner">
          <img class="pc-latest-art" src="${ep.artworkUrl600 || ep.artworkUrl160 || ''}" alt="" />
          <div>
            <div class="pc-latest-label">Nuevo episodio</div>
            <div class="pc-latest-title">${ep.trackName}</div>
            <div class="pc-latest-dd">${fmtDate(ep.releaseDate)} · ${fmtDur(ep.trackTimeMillis)}</div>
          </div>
        </div>
        <div class="pc-latest-footer">Escuchar en tu plataforma favorita</div>
      </div>`;
    document.getElementById('pc-latest-card').addEventListener('click', () => openModal(ep));
  }

  function appendEps(eps) {
    const list = document.getElementById('pc-list');
    eps.forEach(ep => {
      const btn = document.createElement('button');
      btn.className = 'pc-ep';
      btn.innerHTML = `
        <img class="pc-ep-thumb" src="${ep.artworkUrl600 || ep.artworkUrl160 || ''}" alt="" />
        <div style="flex:1;min-width:0">
          <div class="pc-ep-title">${ep.trackName}</div>
          <div class="pc-ep-dd">${fmtDate(ep.releaseDate)} · ${fmtDur(ep.trackTimeMillis)}</div>
        </div>
        <span class="pc-ep-chev">›</span>`;
      btn.addEventListener('click', () => openModal(ep));
      list.appendChild(btn);
    });
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE = 6;
  let offset = 1, loading = false, done = false;

  function showSkel() {
    const list = document.getElementById('pc-list');
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'pc-skel pc-skel-ep pc-loading-skel';
      list.appendChild(d);
    }
  }
  function removeSkel() {
    document.querySelectorAll('.pc-loading-skel').forEach(el => el.remove());
  }

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    showSkel();
    try {
      const r = await fetch(`${API}?offset=${offset}&limit=${PAGE}`);
      const d = await r.json();
      removeSkel();
      const eps = d.episodes || [];
      if (eps.length) { appendEps(eps); offset += eps.length; }
      if (!d.hasMore) { done = true; document.getElementById('pc-sentinel').style.display = 'none'; }
    } catch (e) { removeSkel(); }
    loading = false;
  }

  // IntersectionObserver + scroll fallback
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadMore();
  }, { rootMargin: '400px' });
  obs.observe(document.getElementById('pc-sentinel'));

  window.addEventListener('scroll', () => {
    if (loading || done) return;
    const s = document.getElementById('pc-sentinel');
    if (s && s.getBoundingClientRect().top <= window.innerHeight + 400) loadMore();
  }, { passive: true });

  // ── Initial load ──────────────────────────────────────────────────────────
  async function init() {
    try {
      const r = await fetch(`${API}?offset=0&limit=1`);
      const d = await r.json();
      if (d.show) {
        const art = d.show.artworkUrl600 || d.show.artworkUrl100 || '';
        if (art) document.getElementById('pc-show-art').src = art;
        document.getElementById('pc-show-name').textContent =
          d.show.collectionName || d.show.trackName || 'Algo Más Que Contarte';
      }
      if (d.episodes && d.episodes[0]) renderLatest(d.episodes[0]);
      document.getElementById('pc-list').innerHTML = '';
      await loadMore();
    } catch (e) {
      document.getElementById('pc-list').innerHTML =
        '<p style="padding:16px;color:#aaa;text-align:center">No se pudieron cargar los episodios.</p>';
    }
  }

  init();
})();
