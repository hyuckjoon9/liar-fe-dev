import { describe, expect, it } from 'vitest';
import { normalizeRoom } from './room';

describe('normalizeRoom', () => {
  it('keeps the last game result when no current game remains', () => {
    const lastGameResult = {
      winner: 'CITIZEN',
      reason: 'LIAR_FOUND',
      liarPlayerId: 'liar',
      liarPlayerNickname: '라이어',
    };

    expect(normalizeRoom({
      roomCode: '123456',
      status: 'WAITING',
      lastGameResult,
    }).lastGameResult).toEqual(lastGameResult);
  });
});
