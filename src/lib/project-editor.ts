// The hosted project editor, shared by the public pages (RemoteEditor, which
// commits to this repo) and the private vault (PrivateVault, which commits to
// workbench-private). A backend supplies the storage; this module supplies the
// field specs, the modal wiring, the frontmatter patching (with the 409 retry
// the contents API needs right after a commit), display updates, and the
// Draft-from-repository pill flow.

import { parseFrontmatter, serializeFrontmatter } from './frontmatter';
import { encodeText } from './github-client';
import { openFieldEditor, type FieldSpec } from './field-editor';
import { aiComplete, describeLastEvidence, gatherRepoContext } from './ai-complete';
import { draftFromRepository } from './ai/repo-draft';
import { startDraftProgress } from './ai/draft-progress';
import { projectStatuses } from './project-schema';
import { ICON_PENCIL } from './icons';

export interface EditorBackend {
  getToken(): string;
  getIndex(): Promise<{ sha: string; text: string }>;
  putIndex(contentBase64: string, message: string, sha: string): Promise<unknown>;
  putArtifact(filename: string, base64: string, message: string): Promise<unknown>;
  /** commit message for a single-field save */
  saveMessage(label: string): string;
  onSaved(field: string): void;
  onAuthFailure(error: unknown): void;
}

export const PROJECT_FIELDS: Record<string, FieldSpec> = {
  name: { kind: 'input', label: 'name', max: 120 },
  description: { kind: 'textarea', label: 'description', max: 500, rows: 4 },
  why: { kind: 'textarea', label: 'why it was built', max: 3000, rows: 8 },
  status: { kind: 'status', label: 'status' },
  startDate: { kind: 'date', label: 'start date' },
  repositoryUrl: { kind: 'url', label: 'repository link' },
  pullRequestUrl: { kind: 'url', label: 'pull request link' },
};

export type FrontmatterPatch = (mutate: (metadata: Record<string, unknown>) => void, message: string) => Promise<void>;

/** Read-mutate-write of index.md front matter, retrying once on a stale sha. */
export function makeFrontmatterPatcher(backend: EditorBackend): FrontmatterPatch {
  const patchOnce = async (mutate: (metadata: Record<string, unknown>) => void, message: string) => {
    const { sha, text } = await backend.getIndex();
    const { metadata, body } = parseFrontmatter(text);
    mutate(metadata);
    metadata.updatedDate = new Date().toISOString().slice(0, 10);
    await backend.putIndex(encodeText(serializeFrontmatter(metadata, body)), message, sha);
  };
  return async (mutate, message) => {
    try {
      await patchOnce(mutate, message);
    } catch (error) {
      if ((error as { status?: number }).status !== 409) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await patchOnce(mutate, message);
    }
  };
}

const displayFor = (field: string) => document.querySelector<HTMLElement>(`[data-field-display="${field}"]`);

export function currentFieldValue(field: string): string {
  const display = displayFor(field);
  if (!display) return '';
  return display.dataset.value ?? display.textContent?.trim() ?? '';
}

export function applyFieldDisplay(field: string, value: string) {
  const display = displayFor(field);
  if (!display) return;
  if (field === 'status') {
    display.dataset.value = value;
    display.textContent = value.replaceAll('-', ' ');
    const badge = document.querySelector<HTMLElement>('.status-badge');
    if (badge) {
      badge.className = `status-badge status-badge--${value}`;
      badge.textContent = value.replaceAll('-', ' ');
    }
  } else if (field === 'startDate') {
    display.dataset.value = value;
    display.textContent = new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } else if (field === 'repositoryUrl' || field === 'pullRequestUrl') {
    display.dataset.value = value;
    display.replaceChildren();
    if (value) {
      const link = document.createElement('a');
      link.href = value;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = value.replace(/^https:\/\/(www\.)?/, '');
      display.append(link);
    } else {
      display.textContent = '—';
    }
  } else {
    display.textContent = value;
    if (field === 'name') document.title = `${value} · Avishek's Portfolio`;
  }
}

/** The vault renders without pencils; inject one per editable field display. */
export function ensureFieldPencils() {
  for (const [field, spec] of Object.entries(PROJECT_FIELDS)) {
    const display = displayFor(field);
    const wrapper = display?.closest('.inline-editable') ?? display?.parentElement;
    if (!display || !wrapper || wrapper.querySelector('.inline-edit')) continue;
    wrapper.classList.add('inline-editable');
    const pencil = document.createElement('button');
    pencil.type = 'button';
    pencil.className = 'inline-edit';
    pencil.dataset.inlineEdit = field;
    pencil.setAttribute('aria-label', `Edit the ${spec.label}`);
    pencil.innerHTML = ICON_PENCIL;
    wrapper.append(pencil);
  }
}

export function wireFieldPencils(backend: EditorBackend, patch: FrontmatterPatch, options: { requireToken?: () => boolean } = {}) {
  document.querySelectorAll<HTMLButtonElement>('[data-inline-edit]').forEach((pencil) => {
    pencil.addEventListener('click', () => {
      const field = pencil.dataset.inlineEdit ?? '';
      const spec = PROJECT_FIELDS[field];
      if (!spec) return;
      if (options.requireToken && !options.requireToken()) return;

      const hasRepo = Boolean(currentFieldValue('repositoryUrl'));
      const supportsAi = (field === 'description' || field === 'why')
        && Boolean(currentFieldValue('repositoryUrl') || currentFieldValue('pullRequestUrl'));

      openFieldEditor({
        spec,
        current: currentFieldValue(field),
        statuses: field === 'status' ? (hasRepo ? [...projectStatuses] : ['idea']) : undefined,
        statusNote: field === 'status' && !hasRepo ? 'Add a repository link to move this project beyond Idea.' : undefined,
        aiComplete: supportsAi
          ? async (existing) => {
              const context = await gatherRepoContext(backend.getToken(), currentFieldValue('repositoryUrl'), currentFieldValue('pullRequestUrl'));
              return aiComplete({
                field: field as 'description' | 'why',
                existing,
                projectName: currentFieldValue('name'),
                context,
              });
            }
          : undefined,
        aiEvidenceNote: describeLastEvidence,
        onApply: async (value) => {
          await patch((metadata) => {
            if ((field === 'repositoryUrl' || field === 'pullRequestUrl') && !value) delete metadata[field];
            else metadata[field] = value;
            // losing the repository drops the project back to an idea
            if (field === 'repositoryUrl' && !value) metadata.status = 'idea';
          }, backend.saveMessage(spec.label));
          applyFieldDisplay(field, value);
          if (field === 'repositoryUrl' && !value) applyFieldDisplay('status', 'idea');
          backend.onSaved(field);
        },
      });
    });
  });
}

/** The fixed Draft-from-repo pill: one confirm, then everything applies. */
export function wireRepoDraft(options: {
  backend: EditorBackend;
  patch: FrontmatterPatch;
  pill: HTMLButtonElement;
  dialog: HTMLDialogElement;
  /** gate before opening the confirm (public: require the token dialog) */
  beforeOpen?: () => boolean;
  /** e.g. refresh the vault carousel after new artifacts landed */
  afterArtifacts?: (names: string[]) => Promise<void>;
  doneMessage: (count: number) => string;
}) {
  const { backend, patch, pill, dialog } = options;
  const draftStatus = dialog.querySelector<HTMLElement>('[data-repo-draft-status]')!;
  const confirmButton = dialog.querySelector<HTMLButtonElement>('[data-repo-draft-confirm]')!;

  pill.addEventListener('click', () => {
    if (options.beforeOpen && !options.beforeOpen()) return;
    draftStatus.textContent = '';
    confirmButton.disabled = false;
    dialog.showModal();
  });
  dialog.querySelector('[data-repo-draft-cancel]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  confirmButton.addEventListener('click', async () => {
    // the dialog's job is done — the floating researcher takes it from here
    dialog.close();
    const progress = startDraftProgress();
    const existingArtifacts = [...document.querySelectorAll<HTMLElement>('[data-media-delete-trigger]')]
      .map((trigger) => trigger.dataset.filename ?? '').filter(Boolean);
    try {
      const result = await draftFromRepository(backend.getToken(), currentFieldValue('repositoryUrl'), currentFieldValue('pullRequestUrl'), {
        projectName: currentFieldValue('name'),
        existingDescription: currentFieldValue('description'),
        existingWhy: currentFieldValue('why'),
        existingArtifacts,
        status: progress.status,
        applyText: async ({ description, why }) => {
          await patch((metadata) => {
            metadata.description = description;
            metadata.why = why;
          }, 'Draft description and why from the repository');
          applyFieldDisplay('description', description);
          applyFieldDisplay('why', why);
        },
        addArtifact: (filename, base64) => backend.putArtifact(filename, base64, `Add generated artifact ${filename}`).then(() => undefined),
      });
      if (result.artifactNames.length) {
        progress.status('Recording the artifact order…');
        await patch((metadata) => {
          const order = Array.isArray(metadata.artifactOrder) ? (metadata.artifactOrder as string[]) : existingArtifacts;
          metadata.artifactOrder = [...order, ...result.artifactNames.filter((name) => !order.includes(name))];
          if (!metadata.featuredArtifact && !existingArtifacts.length) {
            metadata.featuredArtifact = result.artifactNames.find((name) => name.endsWith('.png')) ?? result.artifactNames[0];
          }
        }, 'Add generated artifacts to the order');
        if (options.afterArtifacts) {
          progress.status('Refreshing the carousel…');
          await options.afterArtifacts(result.artifactNames);
        }
      }
      progress.done(options.doneMessage(result.artifactNames.length));
    } catch (error) {
      backend.onAuthFailure(error);
      progress.fail((error as Error).message || 'The draft failed.');
    }
  });
}
