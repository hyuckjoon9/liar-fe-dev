import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GameScreen from './GameScreen';

afterEach(cleanup);

const room = {
  roomCode: '123456',
  players: [
    { playerId: 'candidate', nickname: '후보', status: 'ALIVE' },
    { playerId: 'other', nickname: '다른 사람', status: 'ALIVE' },
  ],
  turnOrder: [],
  currentTurnPlayerId: null,
};

function renderScreen(overrides = {}) {
  return render(
    <GameScreen
      room={room}
      roleInfo={{ role: 'CITIZEN', topicWord: '사과' }}
      playerId="candidate"
      speechLogs={[]}
      onSpeak={vi.fn()}
      onSkip={vi.fn()}
      phase="FINAL_DEFENSE"
      voteState={{}}
      voteResult={null}
      gameOverResult={null}
      finalDefense={{ candidatePlayerId: 'candidate' }}
      finalVote={null}
      onVote={vi.fn()}
      onFinalVote={vi.fn()}
      onConfirmVoteResult={vi.fn()}
      onConfirmGameOver={vi.fn()}
      onLeave={vi.fn()}
      {...overrides}
    />,
  );
}

describe('GameScreen message input', () => {
  it('enables the final-defense candidate input and displays its character count', () => {
    renderScreen();

    const input = screen.getByRole('textbox');
    expect(input).toBeEnabled();
    expect(screen.getByText('0 / 200')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '변론' } });

    expect(screen.getByText('2 / 200')).toBeInTheDocument();
  });

  it('disables game commands after the session is replaced', () => {
    renderScreen({ sessionReplaced: true });

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: '입력' })).toBeDisabled();
  });

  it('leaves the room from the game screen', () => {
    const onLeave = vi.fn();
    renderScreen({ onLeave });

    fireEvent.click(screen.getByRole('button', { name: '나가기' }));

    expect(onLeave).toHaveBeenCalledOnce();
  });
});

describe('GameScreen final vote restoration', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the server vote permission and absolute deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));

    const { container } = renderScreen({
      playerId: 'other',
      phase: 'FINAL_VOTE',
      finalDefense: null,
      finalVote: {
        candidatePlayerId: 'candidate',
        deadlineAt: '2026-08-07T12:00:05.000Z',
        hasVoted: false,
        canVote: false,
      },
    });

    expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeDisabled();
    expect(container.querySelector('.gaugeBar')).toHaveStyle({ width: '50%' });
  });
});
