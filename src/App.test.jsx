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

  it('keeps final vote choices disabled when FINAL_VOTE resync says voting is no longer allowed', async () => {
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
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      },
    });
    const initialFinalVoteState = {
      ...defaultGameState,
      finalCandidateId: 'player-2',
      finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      hasFinalVoted: false,
      canFinalVote: true,
    };
    const expiredFinalVoteState = {
      ...initialFinalVoteState,
      canFinalVote: false,
    };
    mocks.getPlayerGameState
      .mockResolvedValueOnce(initialFinalVoteState)
      .mockResolvedValueOnce(expiredFinalVoteState);

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

    await waitFor(() => expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeDisabled());
  });

  it('keeps final vote choices locked while FINAL_VOTE resync is pending', async () => {
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
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      },
    });
    const finalVoteState = {
      ...defaultGameState,
      phase: 'FINAL_VOTE',
      finalCandidateId: 'player-2',
      finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      hasFinalVoted: false,
      canFinalVote: true,
    };
    const resync = deferred();
    mocks.getPlayerGameState
      .mockResolvedValueOnce(finalVoteState)
      .mockImplementationOnce(() => resync.promise);

    render(<App />);

    await waitFor(() => expect(mocks.client.activate).toHaveBeenCalled());
    act(() => {
      mocks.client.connected = true;
      mocks.client.onConnect();
    });

    const killButton = await screen.findByRole('button', { name: 'KILL (탈락)' });
    fireEvent.click(killButton);
    const userSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/users/player-1',
    );
    act(() => userSubscription[2]({ type: 'ERROR', data: { command: 'FINAL_VOTE' }, message: '투표가 거절되었습니다.' }));

    expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeDisabled();

    await act(async () => resync.resolve(finalVoteState));

    await waitFor(() => expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeEnabled());
  });

  it('keeps final vote choices locked when FINAL_VOTE resync fails', async () => {
    sessionStorage.setItem('liar.roomCode', '123456');
    sessionStorage.setItem('liar.playerId', 'player-1');
    sessionStorage.setItem('liar.playerSecret', 'secret');
    mocks.createStompClient.mockReturnValue(mocks.client);
    const finalVoteRoom = {
      ...defaultRoom,
      status: 'VOTING',
      game: {
        phase: 'FINAL_VOTE',
        finalCandidateId: 'player-2',
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      },
    };
    mocks.getRoom
      .mockResolvedValueOnce(finalVoteRoom)
      .mockRejectedValueOnce(new Error('네트워크 오류'));
    mocks.getPlayerGameState.mockResolvedValue({
      ...defaultGameState,
      phase: 'FINAL_VOTE',
      finalCandidateId: 'player-2',
      finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      hasFinalVoted: false,
      canFinalVote: true,
    });

    render(<App />);

    await waitFor(() => expect(mocks.client.activate).toHaveBeenCalled());
    act(() => {
      mocks.client.connected = true;
      mocks.client.onConnect();
    });
    await screen.findByRole('button', { name: 'KILL (탈락)' });

    const userSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/users/player-1',
    );
    act(() => userSubscription[2]({ type: 'ERROR', data: { command: 'FINAL_VOTE' }, message: '투표가 거절되었습니다.' }));

    await waitFor(() => expect(mocks.getRoom).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeDisabled();
  });

  it('unlocks an eligible voter when a new FINAL_VOTE_STARTED event follows a failed resync', async () => {
    sessionStorage.setItem('liar.roomCode', '123456');
    sessionStorage.setItem('liar.playerId', 'player-1');
    sessionStorage.setItem('liar.playerSecret', 'secret');
    mocks.createStompClient.mockReturnValue(mocks.client);
    const finalVoteRoom = {
      ...defaultRoom,
      status: 'VOTING',
      game: {
        phase: 'FINAL_VOTE',
        finalCandidateId: 'player-2',
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      },
    };
    mocks.getRoom
      .mockResolvedValueOnce(finalVoteRoom)
      .mockRejectedValueOnce(new Error('네트워크 오류'));
    mocks.getPlayerGameState.mockResolvedValue({
      ...defaultGameState,
      phase: 'FINAL_VOTE',
      finalCandidateId: 'player-2',
      finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      hasFinalVoted: false,
      canFinalVote: true,
    });

    render(<App />);

    await waitFor(() => expect(mocks.client.activate).toHaveBeenCalled());
    act(() => {
      mocks.client.connected = true;
      mocks.client.onConnect();
    });
    await screen.findByRole('button', { name: 'KILL (탈락)' });

    const userSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/users/player-1',
    );
    act(() => userSubscription[2]({ type: 'ERROR', data: { command: 'FINAL_VOTE' }, message: '투표가 거절되었습니다.' }));
    await waitFor(() => expect(mocks.getRoom).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeDisabled();

    const roomSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/rooms/123456',
    );
    await act(async () => {
      await roomSubscription[2]({
        type: 'FINAL_VOTE_STARTED',
        data: {
          candidatePlayerId: 'player-2',
          deadlineAt: '2027-09-02T23:30:00.000Z',
        },
      });
    });

    expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeEnabled();
  });

  it('runs a queued FINAL_VOTE resync after an active room load finishes', async () => {
    sessionStorage.setItem('liar.roomCode', '123456');
    sessionStorage.setItem('liar.playerId', 'player-1');
    sessionStorage.setItem('liar.playerSecret', 'secret');
    mocks.createStompClient.mockReturnValue(mocks.client);
    const finalVoteRoom = {
      ...defaultRoom,
      status: 'VOTING',
      game: {
        phase: 'FINAL_VOTE',
        finalCandidateId: 'player-2',
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      },
    };
    const finalVoteState = {
      ...defaultGameState,
      phase: 'FINAL_VOTE',
      finalCandidateId: 'player-2',
      finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      hasFinalVoted: false,
      canFinalVote: true,
    };
    const activeLoad = deferred();
    const resyncLoad = deferred();
    mocks.getRoom
      .mockResolvedValueOnce(finalVoteRoom)
      .mockImplementationOnce(() => activeLoad.promise)
      .mockImplementationOnce(() => resyncLoad.promise);
    mocks.getPlayerGameState.mockResolvedValue(finalVoteState);

    render(<App />);

    await waitFor(() => expect(mocks.client.activate).toHaveBeenCalled());
    act(() => {
      mocks.client.connected = true;
      mocks.client.onConnect();
    });
    await screen.findByRole('button', { name: 'KILL (탈락)' });

    const roomSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/rooms/123456',
    );
    act(() => {
      void roomSubscription[2]({ type: 'UNRECOGNIZED_EVENT' });
    });
    await waitFor(() => expect(mocks.getRoom).toHaveBeenCalledTimes(2));

    const userSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/users/player-1',
    );
    act(() => userSubscription[2]({ type: 'ERROR', data: { command: 'FINAL_VOTE' }, message: '투표가 거절되었습니다.' }));
    expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeDisabled();

    await act(async () => activeLoad.resolve(finalVoteRoom));
    await waitFor(() => expect(mocks.getRoom).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeDisabled();

    await act(async () => resyncLoad.resolve(finalVoteRoom));
    await waitFor(() => expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeEnabled());
  });

  it('leaves the final vote screen when FINAL_VOTE resync finds a later phase', async () => {
    sessionStorage.setItem('liar.roomCode', '123456');
    sessionStorage.setItem('liar.playerId', 'player-1');
    sessionStorage.setItem('liar.playerSecret', 'secret');
    mocks.createStompClient.mockReturnValue(mocks.client);
    const finalVoteRoom = {
      ...defaultRoom,
      status: 'VOTING',
      game: {
        phase: 'FINAL_VOTE',
        finalCandidateId: 'player-2',
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      },
    };
    mocks.getRoom
      .mockResolvedValueOnce(finalVoteRoom)
      .mockResolvedValueOnce({ ...defaultRoom, status: 'VOTING', game: { phase: 'VOTE' } });
    mocks.getPlayerGameState
      .mockResolvedValueOnce({
        ...defaultGameState,
        phase: 'FINAL_VOTE',
        finalCandidateId: 'player-2',
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
        hasFinalVoted: false,
        canFinalVote: true,
      })
      .mockResolvedValueOnce({ ...defaultGameState, phase: 'VOTE' });

    render(<App />);

    await waitFor(() => expect(mocks.client.activate).toHaveBeenCalled());
    act(() => {
      mocks.client.connected = true;
      mocks.client.onConnect();
    });
    await screen.findByRole('button', { name: 'KILL (탈락)' });

    const userSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/users/player-1',
    );
    act(() => userSubscription[2]({ type: 'ERROR', data: { command: 'FINAL_VOTE' }, message: '투표가 거절되었습니다.' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'KILL (탈락)' })).not.toBeInTheDocument());
  });

  it('uses the refreshed player phase when the room snapshot still says FINAL_VOTE', async () => {
    sessionStorage.setItem('liar.roomCode', '123456');
    sessionStorage.setItem('liar.playerId', 'player-1');
    sessionStorage.setItem('liar.playerSecret', 'secret');
    mocks.createStompClient.mockReturnValue(mocks.client);
    const finalVoteRoom = {
      ...defaultRoom,
      status: 'VOTING',
      game: {
        phase: 'FINAL_VOTE',
        finalCandidateId: 'player-2',
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
      },
    };
    mocks.getRoom.mockResolvedValue(finalVoteRoom);
    mocks.getPlayerGameState
      .mockResolvedValueOnce({
        ...defaultGameState,
        phase: 'FINAL_VOTE',
        finalCandidateId: 'player-2',
        finalDeadlineAt: '2027-09-02T23:30:00.000Z',
        hasFinalVoted: false,
        canFinalVote: true,
      })
      .mockResolvedValueOnce({ ...defaultGameState, phase: 'VOTE' });

    render(<App />);

    await waitFor(() => expect(mocks.client.activate).toHaveBeenCalled());
    act(() => {
      mocks.client.connected = true;
      mocks.client.onConnect();
    });
    await screen.findByRole('button', { name: 'KILL (탈락)' });

    const userSubscription = mocks.subscribeToEvents.mock.calls.find(
      ([, destination]) => destination === '/sub/users/player-1',
    );
    act(() => userSubscription[2]({ type: 'ERROR', data: { command: 'FINAL_VOTE' }, message: '투표가 거절되었습니다.' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'KILL (탈락)' })).not.toBeInTheDocument());
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
