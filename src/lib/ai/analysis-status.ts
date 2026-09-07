// Visibility for the background deep analysis. The request file
// (analysis-requests/<folder>.json) is the state: present = queued/running,
// present with status "failed" = failed (the error is inside), gone = done.
// watchAnalysis polls it and drives the researcher widget, so reopening the
// app while a run is in flight shows it immediately.

import { startDraftProgress, type DraftProgress } from './draft-progress';

export interface AnalysisRequestState {
  exists: boolean;
  failed?: string;
  /** set when the run completed and left its done marker */
  done?: { artifacts?: number };
  requestedAt?: string;
}

export const analysisRequestPath = (folder: string) => `analysis-requests/${folder}.json`;

/** Interpret a request file's JSON as a state (shared by both backends). */
export function requestStateFromText(text: string): AnalysisRequestState {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (data.status === 'failed') return { exists: true, failed: String(data.error ?? 'unknown error'), requestedAt: data.requestedAt as string };
  if (data.status === 'done') return { exists: true, done: { artifacts: Number(data.artifacts) || undefined }, requestedAt: data.requestedAt as string };
  return { exists: true, requestedAt: data.requestedAt as string };
}

const POLL_MS = 30_000;

const elapsedText = (requestedAt?: string) => {
  if (!requestedAt) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(requestedAt).getTime()) / 60_000));
  return minutes < 1 ? 'started moments ago' : `started ${minutes} min ago`;
};

/**
 * Poll the request state and narrate it. Call once a pending request is known
 * to exist (or right after creating one). `acknowledgeDone` clears the done
 * marker once it has been shown, so it doesn't reannounce forever.
 * Returns a stop function.
 */
export function watchAnalysis(
  read: () => Promise<AnalysisRequestState>,
  progress?: DraftProgress,
  acknowledgeDone?: () => Promise<void>,
): () => void {
  const widget = progress ?? startDraftProgress();
  let timer = 0;
  let stopped = false;

  const finishDone = (artifacts?: number) => {
    widget.done(`Deep analysis finished${artifacts ? ` — ${artifacts} artifacts attached` : ''}. Reload to see the new screenshots and report.`);
    void acknowledgeDone?.().catch(() => { /* the marker outlives a flaky delete */ });
  };

  const tick = async () => {
    if (stopped) return;
    let state: AnalysisRequestState;
    try {
      state = await read();
    } catch {
      state = { exists: true }; // a flaky read is not a completion
    }
    if (stopped) return;
    if (!state.exists) {
      finishDone();
      return;
    }
    if (state.done) {
      finishDone(state.done.artifacts);
      return;
    }
    if (state.failed) {
      widget.fail(`Deep analysis failed: ${state.failed} Press Draft from repo to retry.`);
      return;
    }
    widget.status(`Deep analysis running in the background${state.requestedAt ? ` — ${elapsedText(state.requestedAt)}` : ''}. Safe to close this page; results attach automatically.`);
    timer = window.setTimeout(() => void tick(), POLL_MS);
  };
  void tick();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
