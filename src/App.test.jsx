import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  getRoom: vi.fn(),
  getPlayerGameState: vi.fn(),
}));

vi.mock('./api/rooms', () => ({
  createRoom: vi.fn(),
  getPlayerGameState: mocks.getPlayerGameState,
  getRoom: mocks.getRoom,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.connected = false;
    mocks.client.onConnect = null;
    mocks.client.onDisconnect = null;
    mocks.createStompClient.mockReturnValue(mocks.client);
    mocks.getPlayerGameState.mockResolvedValue(defaultGameState);
    mocks.getRoom.mockResolvedValue(defaultRoom);
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
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

  it('re-enables final vote after a FINAL_VOTE command error', async () => {
    sessionStorage.setItem('liar.roomCode', '123456');
    sessionStorage.setItem('liar.playerId', 'player-1');
    sessionStorage.setItem('liar.playerSecret', 'secret');
    mocks.createStompClient.mockReturnValue(mocks.client);
    mocks.getRoom.mockResolvedValue({
      ...defaultRoom,
      status: 'VOTING',
      game: {
        phase: 'FINAL_VOTE',
        finalCandidateId: 'player-2',
        finalDeadlineAt: '2026-09-02T23:30:00.000Z',
      },
    });
    mocks.getPlayerGameState.mockResolvedValue({
      ...defaultGameState,
      finalCandidateId: 'player-2',
      finalDeadlineAt: '2026-09-02T23:30:00.000Z',
      hasFinalVoted: false,
      canFinalVote: true,
    });

    render(<App />);

    await waitFor(() => expect(mocks.client.activate).toHaveBeenCalled());
    act(() => {
      mocks.client.connected = true;
      mocks.client.onConnect();
    });

    const killButton = await screen.findByRole('button', { name: 'KILL (탈락)' });
    fireEvent.click(killButton);
    expect(screen.getByText(/투표 완료/)).toBeInTheDocument();

    const userSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/users/player-1',
    );
    act(() => userSubscription[2]({ type: 'ERROR', data: { command: 'FINAL_VOTE' }, message: '투표가 거절되었습니다.' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeEnabled());
  });
});

const defaultRoom = {
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
};

const defaultGameState = {
  role: 'CITIZEN',
  topicWord: '사과',
  players: defaultRoom.players,
  voteCandidates: [],
  speechLogs: [],
};

function subscriptionCount(destination) {
  return mocks.subscribeToEvents.mock.calls.filter(([, subscribedDestination]) => subscribedDestination === destination).length;
}
