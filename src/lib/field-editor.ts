// Themed modal editor for a single project field, shared by the hosted public
// editor and the private-vault editor. Builds a <dialog> on demand with Cancel /
// Apply, status pills styled like the real badges, and an optional AI autocomplete
// with a bounded undo history.

export type FieldKind = 'input' | 'textarea' | 'status' | 'date' | 'url';

export interface FieldSpec {
  kind: FieldKind;
  label: string;
  max?: number;
  rows?: number;
}

export interface OpenFieldEditorOptions {
  spec: FieldSpec;
  current: string;
  /** for kind 'status': the selectable statuses (already filtered by the repo rule) */
  statuses?: string[];
  statusNote?: string;
  /** enables the AI button on textareas: returns the completed text */
  aiComplete?: (existing: string) => Promise<string>;
  /** one-line description of the evidence behind the last draft, shown after success */
  aiEvidenceNote?: () => string;
  onApply: (value: string) => Promise<void>;
}

const AI_UNDO_DEPTH = 5;

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll('-', ' ');

export function openFieldEditor(options: OpenFieldEditorOptions) {
  if (document.querySelector('[data-field-editor]')) return;
  const { spec, current } = options;

  const dialog = document.createElement('dialog');
  dialog.className = 'share-dialog field-editor';
  dialog.dataset.fieldEditor = '';

  const heading = document.createElement('h3');
  heading.textContent = `Edit ${spec.label}`;
  dialog.append(heading);

  let getValue: () => string;

  if (spec.kind === 'status') {
    const pills = document.createElement('div');
    pills.className = 'field-editor__pills';
    let selected = current;
    for (const value of options.statuses ?? []) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `status-badge status-badge--${value} field-editor__pill`;
      pill.textContent = capitalize(value);
      pill.dataset.selected = String(value === selected);
      pill.addEventListener('click', () => {
        selected = value;
        pills.querySelectorAll<HTMLElement>('.field-editor__pill').forEach((p) => { p.dataset.selected = 'false'; });
        pill.dataset.selected = 'true';
      });
      pills.append(pill);
    }
    dialog.append(pills);
    if (options.statusNote) {
      const note = document.createElement('p');
      note.className = 'field-editor__hint';
      note.textContent = options.statusNote;
      dialog.append(note);
    }
    getValue = () => selected;
  } else if (spec.kind === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.className = 'field-editor__control';
    textarea.rows = spec.rows ?? 6;
    textarea.maxLength = spec.max ?? 3000;
    textarea.value = current;
    dialog.append(textarea);

    if (options.aiComplete) {
      const bar = document.createElement('div');
      bar.className = 'field-editor__ai';
      const aiButton = document.createElement('button');
      aiButton.type = 'button';
      aiButton.className = 'field-editor__ai-button';
      aiButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 5.7L19.6 9l-5.7 1.9L12 16.6l-1.9-5.7L4.4 9l5.7-1.3L12 2Zm7 12 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z"/></svg> AI draft';
      const undoButton = document.createElement('button');
      undoButton.type = 'button';
      undoButton.className = 'field-editor__ai-undo';
      undoButton.textContent = 'Undo';
      undoButton.hidden = true;
      const aiNote = document.createElement('span');
      aiNote.className = 'field-editor__hint';
      bar.append(aiButton, undoButton, aiNote);
      dialog.append(bar);

      const history: string[] = [];
      aiButton.addEventListener('click', async () => {
        aiButton.disabled = true;
        aiNote.textContent = 'Reading the repository and drafting…';
        try {
          const draft = await options.aiComplete!(textarea.value);
          history.push(textarea.value);
          while (history.length > AI_UNDO_DEPTH) history.shift();
          textarea.value = draft;
          undoButton.hidden = false;
          const evidence = options.aiEvidenceNote?.();
          aiNote.textContent = evidence
            ? `Drafted from ${evidence}. Press again for another take, or Undo.`
            : 'Drafted. Press again for another take, or Undo.';
        } catch (error) {
          aiNote.textContent = (error as Error).message || 'The AI draft failed.';
        } finally {
          aiButton.disabled = false;
        }
      });
      undoButton.addEventListener('click', () => {
        const previous = history.pop();
        if (previous !== undefined) textarea.value = previous;
        undoButton.hidden = history.length === 0;
        aiNote.textContent = history.length ? '' : 'Back to your original text.';
      });
    }
    getValue = () => textarea.value.trim();
  } else {
    const input = document.createElement('input');
    input.className = 'field-editor__control';
    input.type = spec.kind === 'date' ? 'date' : spec.kind === 'url' ? 'url' : 'text';
    if (spec.max) input.maxLength = spec.max;
    input.value = current;
    if (spec.kind === 'url') input.placeholder = 'https://github.com/owner/repository';
    dialog.append(input);
    getValue = () => input.value.trim();
  }

  const status = document.createElement('p');
  status.className = 'field-editor__status';
  const actions = document.createElement('div');
  actions.className = 'share-dialog__actions';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'share-dialog__native';
  apply.textContent = 'Apply';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'share-dialog__close';
  cancel.textContent = 'Cancel';
  actions.append(apply, cancel);
  dialog.append(status, actions);

  const close = () => { dialog.close(); dialog.remove(); };
  cancel.addEventListener('click', close);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('cancel', () => dialog.remove());

  apply.addEventListener('click', async () => {
    const value = getValue();
    if (!value && spec.kind !== 'url') { status.textContent = 'A value is required.'; return; }
    if (spec.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) { status.textContent = 'Use a valid date.'; return; }
    if (spec.kind === 'url' && value && !/^https:\/\//.test(value)) { status.textContent = 'Use a full https:// link.'; return; }
    apply.disabled = true;
    status.textContent = 'Committing…';
    try {
      await options.onApply(value);
      close();
    } catch (error) {
      status.textContent = (error as Error).message || 'The commit failed.';
      apply.disabled = false;
    }
  });

  document.body.append(dialog);
  dialog.showModal();
}
