import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: {
    activate: vi.fn(),
    connected: false,
    deactivate: vi.fn(),
    onConnect: null,
    onDisconnect: null,
  },
  createStompClient: vi.fn(),
  subscribeToEvents: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));

vi.mock('./api/rooms', () => ({
  createRoom: vi.fn(),
  getPlayerGameState: vi.fn().mockResolvedValue({
    role: 'CITIZEN',
    topicWord: '사과',
    players: [],
    voteCandidates: [],
    speechLogs: [],
  }),
  getRoom: vi.fn().mockResolvedValue({
    roomCode: '123456',
    status: 'PLAYING',
    currentPlayers: 3,
    maxPlayers: 6,
    players: [
      { playerId: 'player-1', nickname: '나', status: 'ALIVE' },
      { playerId: 'player-2', nickname: '다른 사람', status: 'ALIVE' },
      { playerId: 'player-3', nickname: '세 번째', status: 'ALIVE' },
    ],
    game: { phase: 'SPEECH', turnOrder: [], currentTurnIndex: 0, currentTurnPlayerId: null },
  }),
  getRooms: vi.fn().mockResolvedValue([]),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  updateRoomSettings: vi.fn(),
}));

vi.mock('./ws/stompClient', () => ({
  createStompClient: mocks.createStompClient,
  publishJson: vi.fn(),
  subscribeToEvents: mocks.subscribeToEvents,
}));

import App from './App';

describe('App STOMP reconnection', () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.client.connected = false;
    mocks.client.onConnect = null;
    mocks.client.onDisconnect = null;
    mocks.createStompClient.mockReturnValue(mocks.client);
  });

  it('resubscribes to room and user channels after reconnecting', async () => {
    sessionStorage.setItem('liar.roomCode', '123456');
    sessionStorage.setItem('liar.playerId', 'player-1');
    sessionStorage.setItem('liar.playerSecret', 'secret');
    mocks.createStompClient.mockReturnValue(mocks.client);

    render(<App />);

    await waitFor(() => expect(mocks.client.activate).toHaveBeenCalled());

    act(() => {
      mocks.client.connected = true;
      mocks.client.onConnect();
    });

    await waitFor(() => {
      expect(subscriptionCount('/sub/rooms/123456')).toBe(1);
      expect(subscriptionCount('/sub/users/player-1')).toBe(1);
    });

    act(() => mocks.client.onConnect());

    await waitFor(() => {
      expect(subscriptionCount('/sub/rooms/123456')).toBe(2);
      expect(subscriptionCount('/sub/users/player-1')).toBe(2);
    });
  });
});

function subscriptionCount(destination) {
  return mocks.subscribeToEvents.mock.calls.filter(([, subscribedDestination]) => subscribedDestination === destination).length;
}
