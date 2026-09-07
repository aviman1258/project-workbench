// "Draft from repository": drafts the description and why in the browser
// (fast, a few seconds), then queues the deep analysis as a background CI job
// by committing an analysis-request file. The workflow clones the linked repo,
// boots the app, takes real screenshots, documents every page and control, and
// commits the results to the project — it keeps running even if this page (or
// the whole device) goes away. See scripts/deep-analysis.mjs.

import { serializeContext } from './evidence';
import { aiComplete, collectProjectEvidence } from '../ai-complete';

export interface DraftTarget {
  projectName: string;
  existingDescription: string;
  existingWhy: string;
  status: (message: string) => void;
  applyText: (fields: { description: string; why: string }) => Promise<void>;
  /** commit the background deep-analysis request; resolve false when unsupported */
  requestAnalysis: () => Promise<boolean>;
}

export interface DraftResult {
  description: string;
  why: string;
  analysisRequested: boolean;
}

export async function draftFromRepository(
  token: string,
  repositoryUrl: string,
  pullRequestUrl: string,
  target: DraftTarget,
): Promise<DraftResult> {
  target.status('Reading the repository…');
  const context = await collectProjectEvidence(token, repositoryUrl, pullRequestUrl);
  const contextText = serializeContext(context);

  target.status('Drafting the description…');
  const description = await aiComplete({ field: 'description', existing: target.existingDescription, projectName: target.projectName, context: contextText });
  target.status('Drafting why it was built…');
  const why = await aiComplete({ field: 'why', existing: target.existingWhy, projectName: target.projectName, context: contextText });
  await target.applyText({ description, why });

  target.status('Queuing the deep analysis…');
  const analysisRequested = await target.requestAnalysis();
  return { description, why, analysisRequested };
}
