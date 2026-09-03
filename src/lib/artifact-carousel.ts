// Shared artifact-carousel behavior. Public project pages render the carousel
// server-side ([slug].astro) and only need the wiring + PDF previews; the
// private vault injects the same markup client-side after unlock, so it also
// needs the HTML builder. Keeping all three here keeps the two views identical.

export type ArtifactKind = 'image' | 'video' | 'pdf' | 'file';

export interface CarouselArtifact {
  filename: string;
  kind: ArtifactKind;
  href: string;
  featured: boolean;
}

export const artifactKind = (name: string): ArtifactKind =>
  /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ? 'image'
  : /\.(mp4|webm|mov)$/i.test(name) ? 'video'
  : /\.pdf$/i.test(name) ? 'pdf'
  : 'file';

/** the label shown on non-image tiles: PDF, VIDEO, or the actual extension */
export const kindLabel = (artifact: { filename: string; kind: ArtifactKind }) =>
  artifact.kind === 'file'
    ? (artifact.filename.split('.').pop() ?? 'file').toUpperCase()
    : artifact.kind.toUpperCase();

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"></path></svg>';
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
const LOCK = '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';

const slideHtml = (artifact: CarouselArtifact, index: number) => {
  const name = escapeHtml(artifact.filename);
  const href = escapeHtml(artifact.href);
  const media = artifact.kind === 'image'
    ? `<img src="${href}" alt="Preview of ${name}" loading="${index === 0 ? 'eager' : 'lazy'}" />`
    : artifact.kind === 'video'
      ? `<video src="${href}" muted playsinline preload="metadata"></video>`
      : `<div class="artifact-slide__document"${artifact.kind === 'pdf' ? ` data-pdf-preview="${href}"` : ''}><span aria-hidden="true">▤</span><strong>${kindLabel(artifact)}</strong><small>Open to ${artifact.kind === 'pdf' ? 'preview' : 'view'}</small></div>`;
  return `<figure class="artifact-slide" data-carousel-slide aria-hidden="${index === 0 ? 'false' : 'true'}">
    <a class="artifact-slide__media" href="${href}" target="_blank" rel="noreferrer" aria-label="Open ${name}">${media}</a>
    <button type="button" class="artifact-slide__feature" data-media-feature-trigger data-filename="${name}" data-featured="${artifact.featured}" aria-label="${artifact.featured ? `${name} is the featured artifact` : `Feature ${name}`}" title="Featured artifact shows on the project card">${STAR}</button>
    <button type="button" class="artifact-slide__delete" data-media-delete-trigger data-filename="${name}" aria-label="Delete ${name}" title="Delete ${name}">${TRASH}</button>
    <figcaption>
      <div><strong>${name}</strong><span>${artifact.kind}</span></div>
      <a href="${href}" target="_blank" rel="noreferrer">Open original ↗</a>
    </figcaption>
  </figure>`;
};

const thumbnailHtml = (artifact: CarouselArtifact, index: number) => {
  const name = escapeHtml(artifact.filename);
  const href = escapeHtml(artifact.href);
  const inner = artifact.kind === 'image'
    ? `<img src="${href}" alt="" loading="lazy" draggable="false" />`
    : `<span${artifact.kind === 'pdf' ? ` data-pdf-preview="${href}"` : ''}>${kindLabel(artifact)}</span>`;
  return `<button type="button" data-carousel-thumbnail data-filename="${name}" data-active="${index === 0 ? 'true' : 'false'}" aria-label="Show ${name}"${index === 0 ? ' aria-current="true"' : ''}>${inner}</button>`;
};

// Same structure the public page renders in Astro — keep the two in sync.
export function carouselHtml(artifacts: CarouselArtifact[], options: { lockBadge?: boolean } = {}): string {
  if (!artifacts.length) {
    return '<div class="artifact-empty"><span aria-hidden="true">□</span><div><h3>No artifacts attached yet</h3><p>Use ＋ Add media to upload images, PDFs, or videos.</p></div></div>';
  }
  return `<div class="artifact-carousel" data-artifact-carousel ${artifacts.length > 1 ? 'tabindex="0"' : ''} aria-label="Project artifacts carousel">
    <div class="artifact-carousel__viewport" data-carousel-viewport>
      <div class="artifact-carousel__track" data-carousel-track>${artifacts.map(slideHtml).join('')}</div>
    </div>
    ${options.lockBadge ? `<span class="artifact-privacy-lock artifact-privacy-lock--detail" aria-label="Private project">${LOCK}</span>` : ''}
    ${artifacts.length > 1 ? `<div class="artifact-carousel__footer">
      <p aria-live="polite"><strong data-carousel-current>1</strong> / ${artifacts.length}</p>
      <div class="artifact-carousel__controls">
        <button type="button" data-carousel-previous aria-label="Show previous artifact"><span aria-hidden="true">←</span></button>
        <button type="button" data-carousel-next aria-label="Show next artifact"><span aria-hidden="true">→</span></button>
      </div>
    </div>` : ''}
    <div class="artifact-carousel__thumbnails" data-media-tiles aria-label="Choose an artifact">${artifacts.map(thumbnailHtml).join('')}</div>
  </div>`;
}

// Slide navigation: buttons, thumbnails, arrow keys, swipe.
export function wireCarousel(carousel: HTMLElement) {
  const track = carousel.querySelector<HTMLElement>('[data-carousel-track]');
  const slides = [...carousel.querySelectorAll<HTMLElement>('[data-carousel-slide]')];
  const thumbnails = [...carousel.querySelectorAll<HTMLButtonElement>('[data-carousel-thumbnail]')];
  const currentLabel = carousel.querySelector<HTMLElement>('[data-carousel-current]');
  let current = 0;
  let touchStartX = 0;

  const show = (next: number) => {
    if (!track || slides.length === 0) return;
    current = (next + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    slides.forEach((slide, index) => slide.setAttribute('aria-hidden', String(index !== current)));
    thumbnails.forEach((thumbnail, index) => {
      thumbnail.dataset.active = String(index === current);
      if (index === current) thumbnail.setAttribute('aria-current', 'true');
      else thumbnail.removeAttribute('aria-current');
    });
    if (currentLabel) currentLabel.textContent = String(current + 1);
  };

  carousel.querySelector<HTMLButtonElement>('[data-carousel-previous]')?.addEventListener('click', () => show(current - 1));
  carousel.querySelector<HTMLButtonElement>('[data-carousel-next]')?.addEventListener('click', () => show(current + 1));
  thumbnails.forEach((thumbnail, index) => thumbnail.addEventListener('click', () => show(index)));
  carousel.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
  });
  carousel.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0]?.clientX ?? 0; }, { passive: true });
  carousel.addEventListener('touchend', (event) => {
    const distance = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    if (Math.abs(distance) > 45) show(current + (distance < 0 ? 1 : -1));
  }, { passive: true });
}

// Render the first page of each PDF artifact as its preview (slide + thumbnail);
// the generic "PDF / Open to preview" card stays as the fallback.
export async function renderPdfPreviews(scope: ParentNode) {
  const targets = [...scope.querySelectorAll<HTMLElement>('[data-pdf-preview]')];
  if (!targets.length) return;
  try {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const rendered = new Map<string, string>();

    for (const target of targets) {
      const href = target.dataset.pdfPreview ?? '';
      try {
        let dataUrl = rendered.get(href);
        if (!dataUrl) {
          const url = href.startsWith('blob:') ? href : new URL(href, window.location.origin).toString();
          const doc = await pdfjs.getDocument({ url }).promise;
          const page = await doc.getPage(1);
          const base = page.getViewport({ scale: 1 });
          // render wide enough for the big slide; tiles reuse the same bitmap
          const scale = Math.min(1200 / base.width, 4);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) continue;
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          dataUrl = canvas.toDataURL('image/png');
          rendered.set(href, dataUrl);
        }
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'First page of the PDF';
        img.draggable = false;
        target.replaceChildren(img);
        target.classList.add('pdf-preview--ready');
      } catch (error) {
        console.error('[pdf-preview] could not render', href, error);
      }
    }
  } catch (error) {
    console.error('[pdf-preview] pdf.js failed to load', error);
  }
}
