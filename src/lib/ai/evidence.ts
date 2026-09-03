// Stage 0 of the AI pipeline: deterministic evidence collection.
//
// Given a repository (and optionally a pull request), build a typed, budgeted
// evidence package from the GitHub API — no model involved. Later pipeline
// stages (code investigator → product analyst → demo director) consume this
// package; today's description/why drafts consume its serialized form.
//
// Principles: deterministic, budgeted (priority packing, per-source caps),
// redacted (secret-looking values scrubbed), and honest (what was truncated
// or omitted is recorded, not hidden).

export type SourceKind =
  | 'repo' | 'readme' | 'tree' | 'pr' | 'commits' | 'diff'
  | 'reviews' | 'issue' | 'file' | 'neighbors';

export interface EvidenceSource {
  /** stable id later stages cite, e.g. "diff:src/filter-panel.tsx" */
  id: string;
  kind: SourceKind;
  /** human-readable pointer: a path, "PR #12", "issue #34" */
  ref: string;
  text: string;
  truncated: boolean;
}

export interface EscalationSignals {
  emptyPrBody: boolean;
  noLinkedIssue: boolean;
  largePr: boolean;
  manyAreasTouched: boolean;
}

export interface RepositoryContext {
  repo?: { owner: string; repo: string };
  pr?: { number: number; title: string };
  sources: EvidenceSource[];
  /** source ids dropped entirely because the budget ran out */
  omitted: string[];
  signals: EscalationSignals;
  chars: number;
}

// ~12k tokens of evidence for the whole package
const TOTAL_BUDGET = 50_000;

// Per-source caps (before packing). Diffs matter most, boilerplate least.
const CAPS = {
  repo: 500,
  pr: 4_000,
  commits: 2_500,
  patch: 1_500,
  issue: 1_500,
  reviews: 2_500,
  readme: 8_000,
  file: 2_500,
  tree: 3_000,
  neighbors: 1_500,
};

// Files whose diffs are noise: lockfiles, build output, generated bundles.
const SKIP_FILE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)|\.map|^dist\/|^build\/|^node_modules\/|\.(png|jpe?g|gif|webp|ico|pdf|mp4|woff2?)$)/i;

// Light secret scrub for anything headed to an external model.
function redact(text: string): string {
  return text
    .replace(/\b(api[_-]?key|secret|token|password|passwd|authorization|client[_-]?secret)\b(\s*[:=]\s*)("[^"]+"|'[^']+'|\S+)/gi, '$1$2[redacted]')
    .replace(/\b(gh[pousr]|github_pat|sk-ant-|sk-|xox[bap]-)[A-Za-z0-9_-]{16,}\b/g, '[redacted-token]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-private-key]');
}

const cap = (text: string, limit: number) => ({
  text: text.length > limit ? `${text.slice(0, limit)}\n…[truncated]` : text,
  truncated: text.length > limit,
});

export function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const match = /github\.com\/([^/]+)\/([^/#?]+)/.exec(url);
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, '') } : null;
}

export function parsePullRequest(url: string): { owner: string; repo: string; number: number } | null {
  const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null;
}

const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

async function ghJson(token: string, url: string): Promise<any> {
  const response = await fetch(url, { headers: ghHeaders(token), cache: 'no-store' });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${url.split('.com')[1] ?? url}`);
  return response.json();
}

async function ghRaw(token: string, url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: { ...ghHeaders(token), Accept: 'application/vnd.github.raw+json' },
    cache: 'no-store',
  });
  return response.ok ? response.text() : null;
}

interface Collected extends EvidenceSource { priority: number }

/**
 * Build the evidence package. Repo-only, PR-only, and repo+PR all work; every
 * fetch is best-effort (a missing README never sinks the collection).
 */
export async function collectEvidence(
  token: string,
  repositoryUrl: string,
  pullRequestUrl: string,
): Promise<RepositoryContext> {
  const collected: Collected[] = [];
  const push = (priority: number, kind: SourceKind, id: string, ref: string, raw: string, limit: number) => {
    const { text, truncated } = cap(redact(raw), limit);
    collected.push({ priority, kind, id, ref, text, truncated });
  };

  const pr = parsePullRequest(pullRequestUrl);
  const repoFromUrl = parseGitHubRepo(repositoryUrl);
  // a PR link implies its repo even when no separate repository link is set
  const repo = repoFromUrl ?? (pr ? { owner: pr.owner, repo: pr.repo } : null);
  const api = (path: string) => `https://api.github.com${path}`;

  const signals: EscalationSignals = { emptyPrBody: false, noLinkedIssue: true, largePr: false, manyAreasTouched: false };
  let prTitle = '';
  let changedPaths: string[] = [];
  let treePaths: string[] = [];

  // --- pull request evidence ---
  if (pr) {
    try {
      const pull = await ghJson(token, api(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`));
      prTitle = String(pull.title ?? '');
      signals.emptyPrBody = !String(pull.body ?? '').trim();
      signals.largePr = Number(pull.changed_files ?? 0) > 40 || Number(pull.additions ?? 0) + Number(pull.deletions ?? 0) > 4000;
      push(1, 'pr', `pr:${pr.number}`, `PR #${pr.number}`,
        `Title: ${pull.title}\nState: ${pull.state}${pull.merged_at ? ` (merged ${String(pull.merged_at).slice(0, 10)})` : ''}\nFiles changed: ${pull.changed_files} (+${pull.additions}/−${pull.deletions})\n\n${pull.body ?? '(no description)'}`,
        CAPS.pr);

      // linked issues referenced from the body (closes/fixes #N, plain #N)
      const issueRefs = [...new Set([...String(pull.body ?? '').matchAll(/#(\d+)/g)].map((m) => m[1]))].slice(0, 2);
      for (const ref of issueRefs) {
        try {
          const issue = await ghJson(token, api(`/repos/${pr.owner}/${pr.repo}/issues/${ref}`));
          if (!issue.pull_request) {
            signals.noLinkedIssue = false;
            push(4, 'issue', `issue:${ref}`, `issue #${ref}`, `${issue.title}\n\n${issue.body ?? ''}`, CAPS.issue);
          }
        } catch { /* dead reference */ }
      }
    } catch { /* PR metadata is optional */ }

    try {
      const commits = await ghJson(token, api(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/commits?per_page=50`));
      const subjects = (commits as any[]).map((c) => `- ${String(c.commit?.message ?? '').split('\n')[0]}`).join('\n');
      if (subjects) push(3, 'commits', 'commits', `PR #${pr.number} commits`, subjects, CAPS.commits);
    } catch { /* optional */ }

    try {
      const files = await ghJson(token, api(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files?per_page=100`));
      const useful = (files as any[]).filter((f) => !SKIP_FILE.test(String(f.filename)));
      changedPaths = useful.map((f) => String(f.filename));
      const areas = new Set(changedPaths.map((p) => p.split('/').slice(0, 2).join('/')));
      signals.manyAreasTouched = areas.size > 6;
      // biggest changes first — they carry the feature
      useful.sort((a, b) => (Number(b.additions) + Number(b.deletions)) - (Number(a.additions) + Number(a.deletions)));
      for (const file of useful.slice(0, 25)) {
        const name = String(file.filename);
        push(2, 'diff', `diff:${name}`, name,
          `${file.status} (+${file.additions}/−${file.deletions})\n${file.patch ?? '(no text diff — binary or too large)'}`,
          CAPS.patch);
      }
    } catch { /* optional */ }

    try {
      const reviews = await ghJson(token, api(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/comments?per_page=20`));
      const text = (reviews as any[]).slice(0, 12).map((c) => `${c.path ?? ''}: ${c.body}`).join('\n---\n');
      if (text) push(7, 'reviews', 'reviews', `PR #${pr.number} review comments`, text, CAPS.reviews);
    } catch { /* optional */ }
  }

  // --- repository evidence ---
  if (repo) {
    try {
      const meta = await ghJson(token, api(`/repos/${repo.owner}/${repo.repo}`));
      push(9, 'repo', 'repo', meta.full_name,
        `${meta.full_name}: ${meta.description ?? '(no description)'} · language: ${meta.language ?? '?'} · created ${String(meta.created_at ?? '').slice(0, 10)}`,
        CAPS.repo);
    } catch { /* optional */ }

    const readme = await ghRaw(token, api(`/repos/${repo.owner}/${repo.repo}/readme`)).catch(() => null);
    if (readme) push(5, 'readme', 'readme', 'README', readme, CAPS.readme);

    try {
      const tree = await ghJson(token, api(`/repos/${repo.owner}/${repo.repo}/git/trees/HEAD?recursive=1`));
      treePaths = ((tree.tree ?? []) as any[]).filter((e) => e.type === 'blob').map((e) => String(e.path));
      push(8, 'tree', 'tree', 'file tree', treePaths.slice(0, 300).join('\n'), CAPS.tree);
    } catch { /* optional */ }

    // current content of the most-changed source files: the diff shows the
    // delta, this shows what the code looks like now
    for (const path of changedPaths.slice(0, 2)) {
      const content = await ghRaw(token, api(`/repos/${repo.owner}/${repo.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`)).catch(() => null);
      if (content) push(6, 'file', `file:${path}`, path, content, CAPS.file);
    }

    // neighbors: what sits next to the changed files (from the tree, no extra calls)
    if (treePaths.length && changedPaths.length) {
      const dirs = [...new Set(changedPaths.map((p) => p.split('/').slice(0, -1).join('/')))].slice(0, 5);
      const lines = dirs.map((dir) => `${dir || '.'}/\n${treePaths.filter((p) => p.startsWith(dir ? `${dir}/` : '') && !p.slice(dir ? dir.length + 1 : 0).includes('/')).slice(0, 20).map((p) => `  ${p.split('/').pop()}`).join('\n')}`);
      push(8, 'neighbors', 'neighbors', 'files near the change', lines.join('\n'), CAPS.neighbors);
    }
  }

  // --- priority packing into the total budget ---
  collected.sort((a, b) => a.priority - b.priority);
  const sources: EvidenceSource[] = [];
  const omitted: string[] = [];
  let chars = 0;
  for (const { priority: _p, ...source } of collected) {
    if (chars + source.text.length <= TOTAL_BUDGET) {
      sources.push(source);
      chars += source.text.length;
    } else {
      omitted.push(source.id);
    }
  }

  return {
    repo: repo ?? undefined,
    pr: pr ? { number: pr.number, title: prTitle } : undefined,
    sources,
    omitted,
    signals,
    chars,
  };
}

/** Flatten the package for a single-prompt consumer (today's field drafts). */
export function serializeContext(context: RepositoryContext): string {
  return context.sources.map((s) => `## ${s.kind}: ${s.ref}\n${s.text}`).join('\n\n');
}

/** One line for the UI: what the last draft was grounded in. */
export function describeContext(context: RepositoryContext): string {
  const kinds = [...new Set(context.sources.map((s) => s.kind))];
  return `${context.sources.length} evidence sources (${Math.round(context.chars / 1000)}k chars: ${kinds.join(', ')})${context.omitted.length ? `, ${context.omitted.length} omitted for budget` : ''}`;
}
