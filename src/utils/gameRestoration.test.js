import { describe, expect, it } from 'vitest';
import { restoreFinalStage, restoreLastGameResult } from './gameRestoration';

describe('restoreFinalStage', () => {
  it('uses the player snapshot for final-vote eligibility', () => {
    expect(restoreFinalStage(
      { phase: 'FINAL_VOTE', finalCandidateId: 'candidate', finalDeadlineAt: '2026-08-07T12:00:10.000Z' },
      { finalCandidateId: 'candidate', finalDeadlineAt: '2026-08-07T12:00:10.000Z', hasFinalVoted: true, canFinalVote: false },
    )).toEqual({
      finalDefense: null,
      finalVote: {
        candidatePlayerId: 'candidate',
        deadlineAt: '2026-08-07T12:00:10.000Z',
        durationSeconds: 10,
        hasVoted: true,
        canVote: false,
      },
    });
  });
});

describe('restoreLastGameResult', () => {
  it('restores a completed game only when no current game is active', () => {
    const result = { winner: 'CITIZEN', reason: 'LIAR_FOUND' };

    expect(restoreLastGameResult({ game: null, lastGameResult: result })).toEqual(result);
    expect(restoreLastGameResult({ game: { phase: 'SPEECH' }, lastGameResult: result })).toBeNull();
  });
});
