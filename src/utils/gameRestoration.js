export function restoreFinalStage(game, playerGameState) {
  const finalStage = {
    candidatePlayerId: playerGameState?.finalCandidateId ?? game?.finalCandidateId ?? null,
    deadlineAt: playerGameState?.finalDeadlineAt ?? game?.finalDeadlineAt ?? null,
    durationSeconds: 10,
  };

  if (game?.phase === 'FINAL_DEFENSE') {
    return { finalDefense: finalStage, finalVote: null };
  }
  if (game?.phase === 'FINAL_VOTE') {
    return {
      finalDefense: null,
      finalVote: {
        ...finalStage,
        hasVoted: playerGameState?.hasFinalVoted === true,
        canVote: playerGameState?.canFinalVote === true,
      },
    };
  }
  return { finalDefense: null, finalVote: null };
}

export function restoreLastGameResult(room) {
  return room?.game ? null : room?.lastGameResult ?? null;
}
