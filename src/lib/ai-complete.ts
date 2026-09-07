// AI field drafting for the hosted editor: gather evidence about the linked
// repository/PR (ai/evidence.ts), then draft a single field through the
// provider shell (ai/provider.ts). Key storage lives in ai/keys.ts; this
// module adds the safety policy (owner allowlist) and the field prompts.

import { collectEvidence, describeContext, parseGitHubRepo, parsePullRequest, serializeContext, type RepositoryContext } from './ai/evidence';
import { completeRaw } from './ai/provider';

// ~12k tokens of input context per call — matches the evidence collector's
// own packing budget, so this is a belt-and-braces cap
const MAX_CONTEXT_CHARS = 50_000;

// Only repos under these owners may be sent to an external model. Everything
// else (and anything outside github.com — ADO can't be reached at all) is
// refused before a single byte is collected.
const ALLOWED_OWNERS = ['aviman1258'];

let lastContext: RepositoryContext | null = null;

/** One line describing what the most recent draft was grounded in. */
export function describeLastEvidence(): string {
  return lastContext ? describeContext(lastContext) : '';
}

export function assertAllowedOwners(...urls: string[]) {
  for (const url of urls) {
    const owner = (parsePullRequest(url) ?? parseGitHubRepo(url))?.owner;
    if (owner && !ALLOWED_OWNERS.includes(owner.toLowerCase())) {
      throw new Error(`For safety, AI analysis only reads repositories owned by ${ALLOWED_OWNERS.join(', ')} — ${owner} is not on that list.`);
    }
  }
}

/** Typed evidence package for the drafting flow (allowlist enforced). */
export async function collectProjectEvidence(
  token: string,
  repositoryUrl: string,
  pullRequestUrl: string,
): Promise<RepositoryContext> {
  assertAllowedOwners(repositoryUrl, pullRequestUrl);
  const context = await collectEvidence(token, repositoryUrl, pullRequestUrl);
  if (!context.sources.length) throw new Error('Add a repository (or pull request) link first — the AI reads it for context.');
  lastContext = context;
  return context;
}

export async function gatherRepoContext(
  token: string,
  repositoryUrl: string,
  pullRequestUrl: string,
): Promise<string> {
  return serializeContext(await collectProjectEvidence(token, repositoryUrl, pullRequestUrl));
}

const SYSTEM_PROMPT = 'You help a developer document their portfolio projects. Use only the provided evidence and draft. Reply with the final text only — no preamble, no quotes, no markdown.';

export async function aiComplete(options: {
  field: 'description' | 'why';
  existing: string;
  projectName: string;
  context: string;
}): Promise<string> {
  const { field, existing, projectName, context } = options;

  const instruction = field === 'description'
    ? 'Write a 1-3 sentence description of what this project does. Concrete and plain-English; no marketing fluff.'
    : 'Write 2-4 sentences in first person ("I built this…") on WHY this project was built — the problem, curiosity, or need behind it. The author is Avishek Chandra, a senior software engineer who builds side projects to explore ideas end to end. Ground the reasoning in the repository evidence, but you may draw on general knowledge of developers and the world to make the motivation plausible and human. If the current draft below contains intent, treat it as the strongest signal and refine it.';

  const userPrompt = `Project: ${projectName}\n\nCurrent draft (may be empty):\n${existing.slice(0, 3_000)}\n\n${instruction}\n\nEvidence:\n${context.slice(0, MAX_CONTEXT_CHARS)}`;

  const { text } = await completeRaw(SYSTEM_PROMPT, userPrompt, 'fast', 600);
  if (!text) throw new Error('The AI returned nothing usable.');
  return text;
}
