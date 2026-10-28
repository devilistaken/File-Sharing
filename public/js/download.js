const stage = $('#stage');
const token = new URLSearchParams(location.search).get('t') || '';
let timer = null;

/* Friendly end states. Not-found and expired share one screen on purpose,
   so nobody can tell which tokens ever existed. */
const STATES = {
  unavailable: {
    title: 'This link is gone',
    text: 'It may have expired, been removed, or never existed. Ask the sender for a fresh link.',
    icon: '<circle cx="48" cy="48" r="38" fill="#e8e4fb" stroke="#17123a" stroke-width="4"/><path d="M48 26v24l14 8" fill="none" stroke="#17123a" stroke-width="5" stroke-linecap="round"/>',
  },
  revoked: {
    title: 'The sender pulled this file',
    text: 'The link was revoked and the file deleted. Ask the sender to share it again if you still need it.',
    icon: '<circle cx="48" cy="48" r="38" fill="#ffd23f" stroke="#17123a" stroke-width="4"/><path d="M30 30l36 36" stroke="#17123a" stroke-width="6" stroke-linecap="round"/>',
  },
  consumed: {
    title: 'This file already burned',
    text: 'The sender set a download limit and it has been reached. The file is permanently deleted.',
    icon: '<path d="M48 8c4 18 26 26 26 50a26 26 0 0 1-52 0c0-10 5-16 10-21 0 10 5 15 10 16C38 40 40 24 48 8z" fill="#ff5a45" stroke="#17123a" stroke-width="4" stroke-linejoin="round"/>',
  },
};

function renderState(kind, headline) {
  clearInterval(timer);
  const s = STATES[kind] || STATES.unavailable;
  const card = el('section', { class: 'card state-card' });
  card.innerHTML = `<svg viewBox="0 0 96 96" aria-hidden="true">${s.icon}</svg>`;
  card.append(
    el('h1', { text: headline || s.title }),
    el('p', { text: s.text }),
    el('a', { class: 'btn light', href: 'index.html', text: 'Send a file yourself' })
  );
  stage.replaceChildren(card);
}

function renderReady(f) {
  clearInterval(timer);
  const ext = extOf(f.originalName);
  const left = f.maxDownloads > 0 ? f.maxDownloads - f.downloadCount : null;

  const fuseText = el('p', { class: 'fuse-text' });
  const bar = el('div', { class: 'fuse-bar' }, el('span', { class: 'spark' }));
  const btn = el('button', { class: 'btn big block', type: 'button', text: 'Download file' });

  const main = el('div', { class: 'ticket-main' },
    el('div', { class: `ext ${extClass(ext)}`, text: ext.slice(0, 4) }),
    el('h1', { text: f.originalName }),
    el('div', { class: 'ticket-meta' },
      el('span', { text: formatSize(f.size) }),
      left !== null ? el('span', { text: `${left} download${left === 1 ? '' : 's'} left` }) : el('span', { text: 'Unlimited downloads until it expires' })
    ),
    el('div', { class: 'fuse' }, bar),
    fuseText
  );
  const stub = el('div', { class: 'ticket-stub' },
    f.maxDownloads === 1 ? el('p', { class: 'warn-note', text: 'This link works once. The file is deleted right after you download it.' }) : null,
    btn
  );
  const ticket = el('article', { class: 'ticket' }, main, stub);
  stage.replaceChildren(ticket);

  const end = new Date(f.expiresAt).getTime();
  const start = new Date(f.createdAt).getTime();
  const update = () => {
    const remaining = end - Date.now();
    bar.style.width = `${Math.max(0, Math.min(1, remaining / (end - start))) * 100}%`;
    bar.classList.toggle('low', remaining / (end - start) < 0.15);
    fuseText.textContent = remaining > 0 ? `Burns in ${timeLeft(remaining)}` : 'Burning out…';
    if (remaining <= 0) { clearInterval(timer); setTimeout(refresh, 800); }
  };
  update();
  timer = setInterval(update, 1000);

  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Starting download…';
    try {
      await API.startDownload(token, f.originalName);
    } catch (err) {
      return refresh();
    }
    // Give the server a moment to count it, then show what happened
    setTimeout(async () => {
      try {
        const next = await API.publicInfo(token);
        toast('Download started', 'ok');
        renderReady(next);
      } catch (err) {
        if (err.code === 'consumed') {
          ticket.classList.add('burn-away');
          setTimeout(() => renderState('consumed', 'Downloaded. The link just burned.'), 1100);
        } else renderState(err.code);
      }
    }, 1200);
  });
}

async function refresh() {
  if (!/^[a-f0-9]{64}$/.test(token)) return renderState('unavailable');
  try {
    renderReady(await API.publicInfo(token));
  } catch (err) {
    if (err.code === 'network') {
      stage.replaceChildren(el('section', { class: 'card state-card' }, el('h1', { text: 'Cannot reach the server' }), el('p', { text: err.message })));
    } else renderState(err.code);
  }
}
refresh();
