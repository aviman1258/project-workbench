// Visibility for the background deep analysis. The request file
// (analysis-requests/<folder>.json) is the state: present = queued/running,
// present with status "failed" = failed (the error is inside), gone = done.
// watchAnalysis polls it and drives the researcher widget, so reopening the
// app while a run is in flight shows it immediately.

import { startDraftProgress, type DraftProgress } from './draft-progress';

export interface AnalysisRequestState {
  exists: boolean;
  failed?: string;
  requestedAt?: string;
}

export const analysisRequestPath = (folder: string) => `analysis-requests/${folder}.json`;

const POLL_MS = 30_000;

const elapsedText = (requestedAt?: string) => {
  if (!requestedAt) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(requestedAt).getTime()) / 60_000));
  return minutes < 1 ? 'started moments ago' : `started ${minutes} min ago`;
};

/**
 * Poll the request state and narrate it. Call once a pending request is known
 * to exist (or right after creating one). Returns a stop function.
 */
export function watchAnalysis(read: () => Promise<AnalysisRequestState>, progress?: DraftProgress): () => void {
  const widget = progress ?? startDraftProgress();
  let timer = 0;
  let stopped = false;

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
      widget.done('Deep analysis finished — reload to see the new screenshots and report.');
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
