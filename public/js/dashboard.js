
let files = [];
let quota = {
  used: 0,
  total: 50 * 1024 * 1024,
  maxFileSize: 10 * 1024 * 1024
};
let chosen = null;

const ticketsBox = $('#tickets');
const emptyBox = $('#empty');
const fileInput = $('#file');
const drop = $('#drop');
const msg = $('#upload-msg');
const uploadBtn = $('#upload-btn');
const progress = $('#progress');

/* ---------------- Expiry slider ---------------- */
const expirySlider = document.querySelector('#expiry-slider');
const expiryDisplay = document.querySelector('#expiry-display');
const expiryValue = document.querySelector('#expiry-value');

function getExpiryMinutes(position) {
  if (position <= 60) {
    return position; // 1–60 minutes
  }

  if (position <= 80) {
    return 60 + (position - 60) * 60; // 2–20 hours
  }

  return 1260 + (position - 80) * 153; // up to 3 days
}

function formatExpiry(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function updateExpiry() {
  const minutes = getExpiryMinutes(Number(expirySlider.value));

  expiryDisplay.textContent = formatExpiry(minutes);
  expiryValue.value = minutes;
}

expirySlider.addEventListener('input', updateExpiry);
updateExpiry();

/* ---------------- Auth guard ---------------- */
(async function init() {
  try {
    const user = await API.me();
    $('#user-email').textContent = user.email;
    await load();
    setInterval(load, 20000);
    setInterval(tick, 1000);
  } catch (err) {
    if (err.code === 'auth') {
      location.href = 'index.html';
    } else {
      toast(err.message, 'error');
    }
  }
})();

$('#logout').addEventListener('click', async () => {
  await API.logout();
  location.href = 'index.html';
});

/* ---------------- Load + render ---------------- */
async function load() {
  try {
    const data = await API.listFiles();
    files = data.files;
    quota = data.quota;
    renderQuota();
    renderTickets();
  } catch (err) {
    if (err.code === 'auth') location.href = 'index.html';
  }
}

function renderQuota() {
  const pct = Math.min(quota.used / quota.total, 1);
  const on = Math.round(pct * 20);
  const track = $('#meter-track');

  track.replaceChildren(
    ...Array.from({ length: 20 }, (_, i) =>
      el('i', { class: i < on ? 'on' : '' })
    )
  );

  track.className =
    'meter-track' +
    (pct >= 0.9 ? ' full' : pct >= 0.7 ? ' warn' : '');

  $('#quota-text').textContent =
    `${formatSize(quota.used)} of ${formatSize(quota.total)}`;
}

function pipsFor(f) {
  if (f.maxDownloads === 0) {
    return el(
      'div',
      { class: 'pips' },
      el('span', {
        class: 'pip infinite',
        text: 'unlimited'
      })
    );
  }

  const pips = Array.from(
    { length: Math.min(f.maxDownloads, 10) },
    (_, i) =>
      el('span', {
        class: 'pip' + (i < f.downloadCount ? ' used' : '')
      })
  );

  return el('div', {
    class: 'pips',
    'aria-hidden': 'true'
  }, pips);
}

function renderTickets() {
  const active = files.filter(
    (f) => f.status === 'active'
  ).length;

  $('#count').textContent = files.length
    ? `${active} active of ${files.length}`
    : '';

  emptyBox.hidden = files.length > 0;
  ticketsBox.replaceChildren(...files.map(buildTicket));
  tick();
}

function buildTicket(f) {
  const isActive = f.status === 'active';
  const ext = extOf(f.originalName);

  const info = el(
    'div',
    { class: 'ticket-info' },
    el('h3', {
      class: 'ticket-name',
      text: f.originalName
    }),
    el(
      'div',
      { class: 'ticket-meta' },
      el('span', { text: formatSize(f.size) }),
      el('span', {
        text: `Created ${formatDate(f.createdAt)}`
      }),
      el('span', {
        text: `Last download: ${formatDate(f.lastDownloadedAt)}`
      })
    )
  );

  if (isActive) {
    info.append(
      el(
        'div',
        { class: 'fuse', 'data-fuse': '' },
        el(
          'div',
          { class: 'fuse-bar' },
          el('span', { class: 'spark' })
        )
      ),
      el('p', {
        class: 'fuse-text',
        'data-fuse-text': ''
      })
    );
  }

  const left = f.maxDownloads === 0
    ? 'Unlimited downloads'
    : `${f.downloadCount} of ${f.maxDownloads} downloaded`;

  const actions = el('div', { class: 'actions' });

  if (isActive) {
    actions.append(
      el('button', {
        class: 'btn small sun',
        type: 'button',
        text: 'Copy link',
        onclick: () => copy(f.link)
      }),
      el('button', {
        class: 'btn small danger',
        type: 'button',
        text: 'Revoke',
        onclick: () => revoke(f)
      })
    );
  }

  actions.append(
    el('button', {
      class: 'btn small danger',
      type: 'button',
      text: 'Delete',
      onclick: () => remove(f)
    })
  );

  const stub = el(
    'div',
    { class: 'ticket-stub' },
    pipsFor(f),
    el('p', { class: 'stub-label', text: left }),
    actions
  );

  const ticket = el(
    'article',
    {
      class: 'ticket' + (isActive ? '' : ' is-done'),
      'data-id': f.id,
      'data-expires': f.expiresAt,
      'data-created': f.createdAt
    },
    el(
      'div',
      { class: 'ticket-main' },
      el('div', {
        class: `ext ${extClass(ext)}`,
        text: ext.slice(0, 4)
      }),
      info
    ),
    stub
  );

  if (!isActive) {
    const label = {
      consumed: 'Burned',
      expired: 'Expired',
      revoked: 'Revoked'
    }[f.status] || f.status;

    ticket.append(
      el('span', {
        class: `stamp ${f.status}`,
        text: label
      })
    );
  }

  return ticket;
}

/* ---------------- Countdown ---------------- */
function tick() {
  let expiredNow = false;

  $$('.ticket[data-expires]').forEach((t) => {
    const fuse = $('[data-fuse]', t);
    if (!fuse) return;

    const end = new Date(t.dataset.expires).getTime();
    const start = new Date(t.dataset.created).getTime();
    const remaining = end - Date.now();

    const pct = Math.max(
      0,
      Math.min(1, remaining / (end - start))
    );

    const bar = $('.fuse-bar', fuse);
    bar.style.width = `${pct * 100}%`;
    bar.classList.toggle('low', pct < 0.15);

    $('[data-fuse-text]', t).textContent =
      remaining > 0
        ? `Burns in ${timeLeft(remaining)}`
        : 'Burning out…';

    if (remaining <= 0) expiredNow = true;
  });

  if (expiredNow) load();
}

/* ---------------- Actions ---------------- */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link copied', 'ok');
  } catch {
    window.prompt('Copy this link:', text);
  }
}

async function revoke(f) {
  if (!confirm(
    `Revoke "${f.originalName}"? The link stops working right now.`
  )) return;

  try {
    await API.revoke(f.id);
    toast('Link revoked', 'ok');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function remove(f) {
  if (!confirm(
    `Delete "${f.originalName}" and its stats for good?`
  )) return;

  try {
    await API.remove(f.id);
    toast('Deleted', 'ok');
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------------- Choosing a file ---------------- */
function pick(file) {
  chosen = file || null;
  msg.textContent = '';
  msg.className = 'form-msg';

  if (!file) {
    $('#drop-title').textContent = 'Drop a file here';
    $('#drop-title').className = '';
    $('#drop-sub').textContent =
      'or click to browse. Up to 10 MB.';
    return;
  }

  $('#drop-title').textContent = file.name;
  $('#drop-title').className = 'picked';
  $('#drop-sub').textContent =
    `${formatSize(file.size)}. Click to change.`;

  if (file.size > quota.maxFileSize) {
    msg.textContent =
      `That file is ${formatSize(file.size)}. The limit is ${formatSize(quota.maxFileSize)}.`;
    msg.className = 'form-msg error';
  }
}

fileInput.addEventListener('change', () => {
  pick(fileInput.files[0]);
});

['dragenter', 'dragover'].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
});

['dragleave', 'drop'].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove('over');
  });
});

drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];

  if (f) {
    const dt = new DataTransfer();
    dt.items.add(f);
    fileInput.files = dt.files;
    pick(f);
  }
});

/* ---------------- Upload ---------------- */
$('#upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!chosen) {
    msg.textContent = 'Pick a file first.';
    msg.className = 'form-msg error';
    return;
  }

  if (chosen.size > quota.maxFileSize) return;

  // Read the current slider value directly.
  const minutes = Number(expirySlider.value);
  expiryValue.value = String(minutes);

  const limit = parseInt(
    $('input[name="limit"]:checked').value,
    10
  );

  console.log('Uploading expiry:', minutes, 'minutes');

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Lighting the fuse…';
  progress.hidden = false;
  $('div', progress).style.width = '0';
  msg.textContent = '';
  msg.className = 'form-msg';

  try {
    const file = await API.upload(
      chosen,
      minutes,
      limit,
      (p) => {
        $('div', progress).style.width = `${p * 100}%`;
      }
    );
    console.log('SERVER RESPONSE:', file);
    showLink(file, minutes, limit);
    fileInput.value = '';
    pick(null);
    load();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'form-msg error';
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Create link';
    setTimeout(() => {
      progress.hidden = true;
    }, 400);
  }
});
/* ---------------- Link dialog ---------------- */
const dlg = $('#link-dialog');
function showLink(file, minutes, limit) {
  $('#dlg-link').value = file.link;
  const when = minutes >= 1440
    ? `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
    : minutes >= 60
      ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
      : `${minutes} minute${minutes === 1 ? '' : 's'}`;
  $('#dlg-sub').textContent = limit === 0
    ? `It burns in ${when}. Anyone with this link can download it until then.`
    : `It burns after ${limit} download${limit === 1 ? '' : 's'} or in ${when}, whichever comes first.`;
  dlg.showModal();
  $('#dlg-link').select();
}
$('#dlg-copy').addEventListener('click', () => {
  copy($('#dlg-link').value);
});
$('#dlg-close').addEventListener('click', () => {
  dlg.close();
});
