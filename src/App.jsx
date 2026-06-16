import { useEffect, useRef, useState } from 'react';
import { createRoom, getRoom, getRooms, joinRoom, leaveRoom } from './api/rooms';
import CreateRoomForm from './components/CreateRoomForm';
import GameScreen from './components/GameScreen';
import JoinRoomModal from './components/JoinRoomModal';
import Lobby from './components/Lobby';
import RoomList from './components/RoomList';
import { clearSession, getSession, saveSession } from './storage/session';
import { normalizeRoom, pickSessionPayload } from './utils/room';
import { createStompClient, publishJson, subscribeToEvents } from './ws/stompClient';

export default function App() {
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [playerId, setPlayerId] = useState(getSession().playerId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [roleInfo, setRoleInfo] = useState(null);
  const [speechLogs, setSpeechLogs] = useState([]);
  const [phase, setPhase] = useState('SPEECH');
  const [voteState, setVoteState] = useState({
    votedCount: 0,
    totalCount: 0,
    hasVoted: false,
  });
  const [voteResult, setVoteResult] = useState(null);
  const [gameOverResult, setGameOverResult] = useState(null);
  const [pendingTurn, setPendingTurn] = useState(null);
  const stompClientRef = useRef(null);
  const roomsSubscriptionRef = useRef(null);
  const roomSubscriptionRef = useRef(null);
  const userSubscriptionRef = useRef(null);
  const roomRef = useRef(room);
  const phaseRef = useRef(phase);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  async function loadRooms() {
    setLoading(true);
    setError('');
    try {
      const data = await getRooms();
      setRooms((Array.isArray(data) ? data : []).map(normalizeRoom));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRoom(roomCode) {
    setLoading(true);
    setError('');
    try {
      const data = await getRoom(roomCode);
      const nextRoom = normalizeRoom(data);
      if (nextRoom.status === 'VOTING') {
        setPhase('VOTE');
      } else if (nextRoom.status === 'PLAYING') {
        setPhase((current) => (current === 'RESULT' ? current : 'SPEECH'));
      }
      setRoom(() => {
        // 이미 방을 나간 상태(세션 비워짐)라면 방 정보 상태를 갱신하지 않습니다.
        const session = getSession();
        if (!session.roomCode) return null;

        if (nextRoom.status === 'WAITING') {
          return {
            ...nextRoom,
            currentTurnPlayerId: null,
            currentTurnIndex: 0,
            turnOrder: [],
          };
        }

        return nextRoom;
      });
    } catch (err) {
      clearSession();
      setPlayerId(null);
      setRoom(null);
      setError(err.message);
      await loadRooms();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const session = getSession();
    if (session.roomCode) {
      loadRoom(session.roomCode);
      return;
    }
    loadRooms();
  }, []);

  useEffect(() => {
    const client = createStompClient();
    stompClientRef.current = client;

    client.onConnect = () => {
      setWsConnected(true);
      roomsSubscriptionRef.current = subscribeToEvents(client, '/sub/rooms', loadRooms);
    };

    client.onDisconnect = () => {
      setWsConnected(false);
    };

    client.activate();

    return () => {
      setWsConnected(false);
      roomsSubscriptionRef.current?.unsubscribe();
      roomSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current?.unsubscribe();
      client.deactivate();
    };
  }, []);

  useEffect(() => {
    const client = stompClientRef.current;
    roomSubscriptionRef.current?.unsubscribe();
    roomSubscriptionRef.current = null;

    if (!room?.roomCode || !client?.connected) return;

    roomSubscriptionRef.current = subscribeToEvents(client, `/sub/rooms/${room.roomCode}`, async (event) => {
      console.log('수신한 WebSocket event.type:', event?.type, 'data:', event?.data);
      if (event?.type === 'ERROR') {
        setError(event.message || event.data?.message || '오류가 발생했습니다.');
        return;
      }

      if (event?.type === 'PLAYER_SPOKEN' || event?.type === 'PLAYER_SPEAK') {
        const data = event.data ?? event;
        setSpeechLogs((logs) => [
          ...logs,
          {
            playerId: data.playerId,
            nickname: data.nickname,
            content: data.content,
          },
        ]);
        return;
      }

      if (event?.type === 'TURN_CHANGED') {
        const data = event.data ?? event;
        if (phaseRef.current === 'VOTE_RESULT' || phaseRef.current === 'VOTE') {
          setPendingTurn(data);
          return;
        }

        const currentTurnPlayerId = normalizeEventId(data.currentTurnPlayerId ?? data.playerId);
        setRoom((current) =>
          current
            ? {
                ...current,
                currentTurnPlayerId: currentTurnPlayerId || current.currentTurnPlayerId,
                currentTurnIndex: data.currentTurnIndex ?? current.currentTurnIndex,
              }
            : current,
        );
        setPhase('SPEECH');
        return;
      }

      if (event?.type === 'GAME_START') {
        const data = event.data ?? event;
        const currentTurnPlayerId = normalizeEventId(data.currentTurnPlayerId) ?? null;

        // Clear game states on new game start
        setRoleInfo(null);
        setGameOverResult(null);
        setPendingTurn(null);
        setVoteResult(null);
        setVoteState({
          votedCount: 0,
          totalCount: 0,
          hasVoted: false,
        });
        setSpeechLogs([]);

        const nextPlayers = (data.players || roomRef.current?.players || []).map((p) => ({
          ...p,
          status: 'ALIVE',
        }));

        setRoom((current) =>
          current
            ? {
                ...current,
                status: 'PLAYING',
                currentTurnPlayerId,
                currentTurnIndex: data.currentTurnIndex ?? 0,
                turnOrder: Array.isArray(data.turnOrder) ? data.turnOrder : [],
                players: nextPlayers,
              }
            : current,
        );
        setPhase('SPEECH');
        return;
      }

      if (event?.type === 'VOTE_STARTED') {
        const data = event.data ?? event;
        const votePlayers = data.players || roomRef.current?.players || [];
        setPhase('VOTE');
        setVoteState({
          votedCount: data.votedCount ?? 0,
          totalCount: data.totalCount ?? votePlayers.length,
          hasVoted: false,
        });
        setRoom((current) =>
          current
            ? {
                ...current,
                status: 'VOTING',
                players: votePlayers,
              }
            : current,
        );
        return;
      }

      if (event?.type === 'VOTING_START') {
        const data = event.data;
        if (data?.players) {
          const votePlayers = data.players;
          setPhase('VOTE');
          setVoteState({
            votedCount: data.votedCount ?? 0,
            totalCount: data.totalCount ?? votePlayers.length,
            hasVoted: false,
          });
          setRoom((current) =>
            current
              ? {
                  ...current,
                  status: 'VOTING',
                  players: votePlayers,
                }
              : current,
          );
        } else {
          // data.players가 없는데 이미 투표 단계인 경우 덮어쓰기 방지
          setRoom((current) => {
            if (!current) return null;
            if (current.status === 'VOTING') {
              return current;
            }
            const votePlayers = roomRef.current?.players || current.players || [];
            setPhase('VOTE');
            setVoteState({
              votedCount: 0,
              totalCount: votePlayers.length,
              hasVoted: false,
            });
            return {
              ...current,
              status: 'VOTING',
              players: votePlayers,
            };
          });
        }
        return;
      }

      if (event?.type === 'PLAYER_VOTED') {
        const data = event.data ?? event;
        setVoteState((current) => ({
          ...current,
          votedCount: data.votedCount ?? data.votedPlayerCount ?? current.votedCount,
          totalCount: data.totalCount ?? current.totalCount,
        }));
        return;
      }

      if (event?.type === 'VOTE_RESULT') {
        const data = event.data ?? event;
        setVoteResult({
          mostVotedPlayerId: data.mostVotedPlayerId,
          mostVotedPlayerNickname: data.mostVotedPlayerNickname,
          liarFound: data.liarFound,
          eliminated: data.eliminated,
          eliminatedPlayerId: data.eliminatedPlayerId,
          eliminatedPlayerNickname: data.eliminatedPlayerNickname,
          alivePlayers: data.alivePlayers,
          deadPlayers: data.deadPlayers,
        });
        setPhase('VOTE_RESULT');

        const nextPlayers = [...(data.alivePlayers || []), ...(data.deadPlayers || [])];
        if (nextPlayers.length > 0) {
          setRoom((current) =>
            current
              ? {
                  ...current,
                  players: nextPlayers,
                }
              : current,
          );
        }
        return;
      }

      if (event?.type === 'GAME_OVER') {
        const data = event.data ?? event;
        console.log('GAME_OVER data 수신:', data);
        console.log('phase 변경 직전:', phaseRef.current);
        setGameOverResult({
          winner: data.winner,
          reason: data.reason,
          liarPlayerId: data.liarPlayerId,
          liarPlayerNickname: data.liarPlayerNickname,
        });
        setPhase('GAME_OVER');
        console.log('phase 변경 직후 (예약됨): GAME_OVER');
        return;
      }

      await loadRoom(roomRef.current?.roomCode);
    });

    return () => {
      roomSubscriptionRef.current?.unsubscribe();
      roomSubscriptionRef.current = null;
    };
  }, [room?.roomCode, wsConnected]);

  useEffect(() => {
    const client = stompClientRef.current;
    userSubscriptionRef.current?.unsubscribe();
    userSubscriptionRef.current = null;

    if (!playerId || !client?.connected) return;

    userSubscriptionRef.current = subscribeToEvents(client, `/sub/users/${playerId}`, (event) => {
      if (event?.type === 'ERROR') {
        setError(event.message || event.data?.message || '오류가 발생했습니다.');
        return;
      }

      if (event?.type === 'ROLE_ASSIGNED') {
        const data = event.data ?? event;
        setRoleInfo({
          role: data.role,
          topicWord: data.topicWord,
        });
      }
    });

    return () => {
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;
    };
  }, [playerId, wsConnected]);

  async function handleCreate(payload) {
    setLoading(true);
    setError('');
    try {
      const data = await createRoom(payload);
      const session = pickSessionPayload(data);
      saveSession(session);
      setPlayerId(session.playerId);
      setRoleInfo(null);
      setSpeechLogs([]);
      resetGameState();
      const roomData = await getRoom(session.roomCode);
      setRoom(normalizeRoom(roomData));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(roomCode, payload) {
    setLoading(true);
    setError('');
    try {
      const data = await joinRoom(roomCode, payload);
      const session = pickSessionPayload({ ...data, roomCode });
      saveSession(session);
      setPlayerId(session.playerId);
      setRoleInfo(null);
      setSpeechLogs([]);
      resetGameState();
      const roomData = await getRoom(session.roomCode);
      setRoom(normalizeRoom(roomData));
      setSelectedRoom(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLeave() {
    const session = getSession();
    setLoading(true);
    setError('');
    try {
      // 방을 나가기 전에 먼저 WebSocket 구독을 해제하여 퇴장 이벤트 수신으로 인한 레이스 컨디션을 방지합니다.
      roomSubscriptionRef.current?.unsubscribe();
      roomSubscriptionRef.current = null;
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;

      await leaveRoom(session.roomCode, session.playerId);
      clearSession();
      setPlayerId(null);
      setRoleInfo(null);
      setSpeechLogs([]);
      resetGameState();
      setRoom(null);
      await loadRooms();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleStartGame() {
    try {
      resetGameState();
      publishJson(stompClientRef.current, `/pub/rooms/${room.roomCode}/start`, { playerId });
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSpeak(content, speakerId = playerId) {
    try {
      publishJson(stompClientRef.current, `/pub/rooms/${room.roomCode}/speak`, {
        playerId: speakerId,
        content,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function handleVote(targetPlayerId, voterId = playerId) {
    try {
      publishJson(stompClientRef.current, '/pub/game/vote', {
        roomCode: room.roomCode,
        voterId,
        targetPlayerId,
      });
      setVoteState((current) => ({
        ...current,
        hasVoted: true,
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  function resetGameState() {
    setPhase('SPEECH');
    setVoteState({
      votedCount: 0,
      totalCount: 0,
      hasVoted: false,
    });
    setVoteResult(null);
    setGameOverResult(null);
    setPendingTurn(null);
  }

  function handleConfirmVoteResult() {
    if (pendingTurn) {
      const currentTurnPlayerId = normalizeEventId(pendingTurn.currentTurnPlayerId ?? pendingTurn.playerId);
      setRoom((current) =>
        current
          ? {
              ...current,
              currentTurnPlayerId: currentTurnPlayerId || current.currentTurnPlayerId,
              currentTurnIndex: pendingTurn.currentTurnIndex ?? current.currentTurnIndex,
            }
          : current,
      );
      setPendingTurn(null);
    }
    setPhase('SPEECH');
  }

  function handleConfirmGameOver() {
    setGameOverResult(null);
    setVoteResult(null);
    setPendingTurn(null);
    setSpeechLogs([]);
    setRoom((current) =>
      current
        ? {
            ...current,
            status: 'WAITING',
            currentTurnPlayerId: null,
            currentTurnIndex: 0,
          }
        : current,
    );
    setPhase(null);
  }

  if (room) {
    const shouldShowGameScreen =
      room.status === 'PLAYING' ||
      room.status === 'VOTING' ||
      phase === 'VOTE_RESULT' ||
      phase === 'GAME_OVER';

    console.log('shouldShowGameScreen 값:', shouldShowGameScreen);
    console.log('room.status 값:', room.status);
    console.log('현재 phase 값:', phase);

    return (
      <>
        {error && <div className="toast">{error}</div>}
        {shouldShowGameScreen ? (
          <GameScreen
            room={room}
            roleInfo={roleInfo}
            playerId={playerId}
            speechLogs={speechLogs}
            onSpeak={handleSpeak}
            phase={phase}
            voteState={voteState}
            voteResult={voteResult}
            gameOverResult={gameOverResult}
            onVote={handleVote}
            onConfirmVoteResult={handleConfirmVoteResult}
            onConfirmGameOver={handleConfirmGameOver}
          />
        ) : (
          <Lobby
            room={room}
            playerId={playerId}
            onLeave={handleLeave}
            onStart={handleStartGame}
            loading={loading}
          />
        )}
      </>
    );
  }

  return (
    <main className="appShell">
      {error && <div className="toast">{error}</div>}
      <section className="hero">
        <p className="eyebrow">Liar Game</p>
        <h1>거짓말은 조용히 시작된다</h1>
        <p>플레이어를 모아 라이어를 찾아내는 추리 대기실</p>
      </section>
      <div className="mainGrid">
        <CreateRoomForm onCreate={handleCreate} loading={loading} />
        <RoomList rooms={rooms} loading={loading} onRefresh={loadRooms} onSelectRoom={setSelectedRoom} />
      </div>
      <JoinRoomModal
        room={selectedRoom}
        onClose={() => setSelectedRoom(null)}
        onJoin={handleJoin}
        loading={loading}
      />
    </main>
  );
}

function normalizeEventId(id) {
  if (id === null || id === undefined) return '';
  return String(id).trim();
}
