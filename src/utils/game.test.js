import { describe, expect, it } from 'vitest';
import { applyTurnChanged } from './game';

describe('applyTurnChanged', () => {
  it('moves the vote-result room into the next speech turn', () => {
    const room = {
      status: 'VOTING',
      currentTurnPlayerId: null,
      currentTurnIndex: 0,
    };

    expect(applyTurnChanged(room, {
      currentTurnPlayerId: 'player-2',
      currentTurnIndex: 1,
    })).toEqual({
      status: 'PLAYING',
      currentTurnPlayerId: 'player-2',
      currentTurnIndex: 1,
    });
  });
});
