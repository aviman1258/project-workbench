// Floating progress companion for the Draft-from-repository background job.
// Instead of a spinner, a little researcher: a magnifying glass sweeping over
// a document while the status line narrates what is actually happening.

export interface DraftProgress {
  status: (message: string) => void;
  done: (message: string) => void;
  fail: (message: string) => void;
}

export function startDraftProgress(): DraftProgress {
  document.querySelector('[data-draft-progress]')?.remove();

  const panel = document.createElement('div');
  panel.className = 'draft-progress';
  panel.setAttribute('data-draft-progress', '');
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <span class="draft-progress__scene" aria-hidden="true">
      <span class="draft-progress__doc"></span>
      <span class="draft-progress__lens"></span>
    </span>
    <span class="draft-progress__text">Starting…</span>
    <button type="button" class="draft-progress__close" aria-label="Dismiss" hidden>✕</button>`;
  document.body.append(panel);

  const text = panel.querySelector<HTMLElement>('.draft-progress__text')!;
  const close = panel.querySelector<HTMLButtonElement>('.draft-progress__close')!;
  close.addEventListener('click', () => panel.remove());

  const finish = (message: string, failed: boolean) => {
    panel.dataset.state = failed ? 'failed' : 'done';
    text.textContent = message;
    close.hidden = false;
    if (!failed) setTimeout(() => panel.remove(), 8000);
  };

  return {
    status: (message) => { text.textContent = message; },
    done: (message) => finish(message, false),
    fail: (message) => finish(message, true),
  };
}
