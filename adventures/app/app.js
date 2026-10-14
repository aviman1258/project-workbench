// Our Adventures — gallery + vertical reel viewer + admin publishing.
// Everything talks to the same-origin Worker API; Cloudflare Access has
// already authenticated whoever is here.

const timeline = document.querySelector('[data-timeline]');
const loading = document.querySelector('[data-loading]');
const sortToggle = document.querySelector('[data-sort-toggle]');
const adminOpen = document.querySelector('[data-admin-open]');
const adminDialog = document.querySelector('[data-admin-dialog]');
const viewer = document.querySelector('[data-viewer]');
const viewerFeed = document.querySelector('[data-viewer-feed]');

let library = { vacations: [], reels: [] };
let newestFirst = true;
let me = { email: '', admin: false };

const media = (key) => `/media/${encodeURIComponent(key).replaceAll('%2F', '/')}`;

const fmtRange = (start, end) => {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const month = (d) => d.toLocaleDateString('en-US', { month: 'short' });
  if (start === end) return `${month(s)} ${s.getDate()}, ${s.getFullYear()}`;
  if (s.getFullYear() === e.getFullYear()) {
    const sameMonth = s.getMonth() === e.getMonth();
    return `${month(s)} ${s.getDate()} – ${sameMonth ? '' : month(e) + ' '}${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${month(s)} ${s.getDate()}, ${s.getFullYear()} – ${month(e)} ${e.getDate()}, ${e.getFullYear()}`;
};

// ---------------------------------------------------------------------------
// Gallery — grouped by the year the trip happened, never the upload date
// ---------------------------------------------------------------------------

function renderTimeline() {
  timeline.replaceChildren();
  if (!library.vacations.length) {
    const empty = document.createElement('p');
    empty.className = 'timeline__loading';
    empty.textContent = me.admin
      ? 'The journal is empty. Add your first vacation with “+ Add”.'
      : 'The journal is empty — check back soon.';
    timeline.append(empty);
    return;
  }

  const sorted = [...library.vacations].sort((a, b) =>
    newestFirst ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate));

  let currentYear = '';
  let grid = null;
  for (const vacation of sorted) {
    const year = vacation.startDate.slice(0, 4);
    if (year !== currentYear) {
      currentYear = year;
      const heading = document.createElement('h2');
      heading.className = 'timeline__year';
      heading.textContent = year;
      timeline.append(heading);
      grid = document.createElement('div');
      grid.className = 'vacation-grid';
      timeline.append(grid);
    }
    const reels = library.reels.filter((r) => r.vacationId === vacation.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'vacation-card';
    card.addEventListener('click', () => openViewer(vacation, reels));

    const cover = vacation.coverKey
      ? Object.assign(document.createElement('img'), { className: 'vacation-card__cover', src: media(vacation.coverKey), alt: '', loading: 'lazy' })
      : Object.assign(document.createElement('div'), { className: 'vacation-card__cover vacation-card__cover--empty', textContent: '✈' });

    const body = document.createElement('div');
    body.className = 'vacation-card__body';
    const title = document.createElement('h3');
    title.textContent = vacation.title;
    const meta = document.createElement('p');
    meta.className = 'vacation-card__meta';
    meta.textContent = [vacation.destination, fmtRange(vacation.startDate, vacation.endDate)].filter(Boolean).join(' · ');
    body.append(title, meta);
    if (vacation.description) {
      const desc = document.createElement('p');
      desc.className = 'vacation-card__desc';
      desc.textContent = vacation.description;
      body.append(desc);
    }

    const count = document.createElement('span');
    count.className = 'vacation-card__count';
    count.textContent = reels.length === 1 ? '1 reel' : `${reels.length} reels`;

    card.append(cover, body, count);
    grid.append(card);
  }
}

// ---------------------------------------------------------------------------
// Full-screen vertical viewer: snap-scroll feed, autoplay the visible reel
// ---------------------------------------------------------------------------

let viewerObserver = null;

function openViewer(vacation, reels) {
  if (!reels.length) return;
  viewerFeed.replaceChildren();
  for (const reel of reels) {
    const section = document.createElement('section');
    section.className = 'reel';

    const video = document.createElement('video');
    video.src = media(reel.videoKey);
    if (reel.thumbKey) video.poster = media(reel.thumbKey);
    video.playsInline = true;
    video.loop = true;
    video.muted = true;
    video.preload = 'metadata';
    video.addEventListener('click', () => (video.paused ? video.play() : video.pause()));

    const scrim = document.createElement('div');
    scrim.className = 'reel__scrim';
    const title = document.createElement('p');
    title.className = 'reel__title';
    title.textContent = reel.title || vacation.title;
    const sub = document.createElement('p');
    sub.className = 'reel__sub';
    sub.textContent = [vacation.destination, fmtRange(vacation.startDate, vacation.endDate)].filter(Boolean).join(' · ');
    scrim.append(title, sub);
    if (reel.music?.title) {
      const music = document.createElement('p');
      music.className = 'reel__music';
      music.textContent = [reel.music.title, reel.music.artist].filter(Boolean).join(' — ');
      scrim.append(music);
    }

    const controls = document.createElement('div');
    controls.className = 'reel__controls';
    const playButton = Object.assign(document.createElement('button'), { type: 'button', textContent: '❚❚' });
    playButton.setAttribute('aria-label', 'Play or pause');
    playButton.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
    const muteButton = Object.assign(document.createElement('button'), { type: 'button', textContent: '🔇' });
    muteButton.setAttribute('aria-label', 'Mute or unmute');
    muteButton.addEventListener('click', () => {
      video.muted = !video.muted;
      muteButton.textContent = video.muted ? '🔇' : '🔊';
    });
    controls.append(playButton, muteButton);
    video.addEventListener('play', () => (playButton.textContent = '❚❚'));
    video.addEventListener('pause', () => (playButton.textContent = '▶'));

    const progress = document.createElement('div');
    progress.className = 'reel__progress';
    const bar = document.createElement('div');
    progress.append(bar);
    video.addEventListener('timeupdate', () => {
      if (video.duration) bar.style.width = `${(video.currentTime / video.duration) * 100}%`;
    });
    progress.addEventListener('click', (event) => {
      const rect = progress.getBoundingClientRect();
      if (video.duration) video.currentTime = ((event.clientX - rect.left) / rect.width) * video.duration;
    });

    section.append(video, scrim, controls, progress);
    viewerFeed.append(section);
  }

  // play whichever reel is snapped into view, pause the rest
  viewerObserver?.disconnect();
  viewerObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const video = entry.target.querySelector('video');
      if (entry.intersectionRatio > 0.6) video.play().catch(() => {});
      else {
        video.pause();
        video.currentTime = 0;
      }
    }
  }, { threshold: [0, 0.6, 1] });
  for (const section of viewerFeed.children) viewerObserver.observe(section);

  viewer.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeViewer() {
  viewerObserver?.disconnect();
  viewerFeed.querySelectorAll('video').forEach((v) => v.pause());
  viewerFeed.replaceChildren();
  viewer.hidden = true;
  document.body.style.overflow = '';
}

viewer.querySelector('[data-viewer-close]').addEventListener('click', closeViewer);

document.addEventListener('keydown', (event) => {
  if (viewer.hidden) return;
  const step = viewerFeed.clientHeight;
  if (event.key === 'Escape') closeViewer();
  if (event.key === 'ArrowDown') { event.preventDefault(); viewerFeed.scrollBy({ top: step, behavior: 'smooth' }); }
  if (event.key === 'ArrowUp') { event.preventDefault(); viewerFeed.scrollBy({ top: -step, behavior: 'smooth' }); }
  if (event.key === ' ') {
    event.preventDefault();
    const video = [...viewerFeed.querySelectorAll('video')].find((v) => !v.paused) ?? viewerFeed.querySelector('video');
    if (video) video.paused ? video.play() : video.pause();
  }
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

sortToggle.addEventListener('click', () => {
  newestFirst = !newestFirst;
  sortToggle.textContent = newestFirst ? 'Newest first' : 'Oldest first';
  renderTimeline();
});

// ---------------------------------------------------------------------------
// Admin: create vacations, publish reels
// ---------------------------------------------------------------------------

const vacationForm = document.querySelector('[data-vacation-form]');
const reelForm = document.querySelector('[data-reel-form]');
const vacationStatus = document.querySelector('[data-vacation-status]');
const reelStatus = document.querySelector('[data-reel-status]');

adminOpen.addEventListener('click', () => {
  const select = document.querySelector('[data-reel-vacations]');
  select.replaceChildren(...[...library.vacations]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((v) => Object.assign(document.createElement('option'), { value: v.id, textContent: `${v.title} (${v.startDate.slice(0, 4)})` })));
  adminDialog.showModal();
});

adminDialog.querySelectorAll('[data-admin-close]').forEach((b) => b.addEventListener('click', () => adminDialog.close()));

adminDialog.querySelectorAll('[data-admin-tab]').forEach((tab) => tab.addEventListener('click', () => {
  const which = tab.dataset.adminTab;
  adminDialog.querySelectorAll('[data-admin-tab]').forEach((t) => (t.dataset.active = String(t === tab)));
  vacationForm.hidden = which !== 'vacation';
  reelForm.hidden = which !== 'reel';
}));

async function upload(file, status) {
  status.textContent = `Uploading ${file.name}…`;
  const response = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) throw new Error((await response.json()).error ?? 'Upload failed.');
  return (await response.json()).key;
}

const videoDuration = (file) => new Promise((resolve) => {
  const probe = document.createElement('video');
  probe.preload = 'metadata';
  probe.onloadedmetadata = () => { URL.revokeObjectURL(probe.src); resolve(Math.round(probe.duration)); };
  probe.onerror = () => resolve(0);
  probe.src = URL.createObjectURL(file);
});

vacationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = vacationForm.querySelector('.admin__primary');
  submit.disabled = true;
  try {
    const data = new FormData(vacationForm);
    const coverFile = data.get('cover');
    const coverKey = coverFile && coverFile.size ? await upload(coverFile, vacationStatus) : '';
    vacationStatus.textContent = 'Saving…';
    const response = await fetch('/api/vacations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.get('title'),
        destination: data.get('destination'),
        startDate: data.get('startDate'),
        endDate: data.get('endDate'),
        description: data.get('description'),
        coverKey,
      }),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? 'Save failed.');
    vacationStatus.textContent = 'Saved.';
    vacationForm.reset();
    await loadLibrary();
  } catch (error) {
    vacationStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

reelForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = reelForm.querySelector('.admin__primary');
  submit.disabled = true;
  try {
    const data = new FormData(reelForm);
    const videoFile = data.get('video');
    const thumbFile = data.get('thumb');
    const duration = await videoDuration(videoFile);
    const videoKey = await upload(videoFile, reelStatus);
    const thumbKey = thumbFile && thumbFile.size ? await upload(thumbFile, reelStatus) : '';
    reelStatus.textContent = 'Publishing…';
    const response = await fetch('/api/reels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vacationId: data.get('vacationId'),
        title: data.get('title'),
        videoKey,
        thumbKey,
        duration,
        music: {
          title: data.get('musicTitle'),
          artist: data.get('musicArtist'),
          source: data.get('musicSource'),
          license: data.get('musicLicense'),
        },
      }),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? 'Publish failed.');
    reelStatus.textContent = 'Published.';
    reelForm.reset();
    await loadLibrary();
  } catch (error) {
    reelStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function loadLibrary() {
  const response = await fetch('/api/library');
  if (!response.ok) {
    loading.textContent = 'Could not open the journal. Try refreshing.';
    return;
  }
  library = await response.json();
  renderTimeline();
}

(async () => {
  try {
    const response = await fetch('/api/me');
    if (response.ok) {
      me = await response.json();
      adminOpen.hidden = !me.admin;
    }
  } catch { /* viewer-only */ }
  await loadLibrary();
})();
