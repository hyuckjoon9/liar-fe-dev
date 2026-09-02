import { useEffect, useRef, useState } from 'react';
import { createRoom, getRoom, getRooms, joinRoom, leaveRoom, getPlayerGameState, updateRoomSettings } from './api/rooms';
import CreateRoomForm from './components/CreateRoomForm';
import GameScreen from './components/GameScreen';
import JoinRoomModal from './components/JoinRoomModal';
import Lobby from './components/Lobby';
import RoomList from './components/RoomList';
import { clearSession, getSession, saveSession } from './storage/session';
import { applyTurnChanged } from './utils/game';
import { restoreFinalStage, restoreLastGameResult } from './utils/gameRestoration';
import { normalizeRoom, pickSessionPayload } from './utils/room';
import { createStompClient, publishJson, subscribeToEvents } from './ws/stompClient';

const ROOM_LIST_POLL_INTERVAL_MS = 1000;

export default function App() {
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [playerId, setPlayerId] = useState(getSession().playerId);
  const [playerSecret, setPlayerSecret] = useState(getSession().playerSecret);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [roleInfo, setRoleInfo] = useState(null);
  const [speechLogs, setSpeechLogs] = useState([]);
  const [phase, setPhase] = useState('SPEECH');
  const [voteState, setVoteState] = useState({
    votedCount: 0,
    totalVoterCount: 0,
    hasVoted: false,
    canVote: true,
    votablePlayers: [],
  });
  const [voteResult, setVoteResult] = useState(null);
  const [gameOverResult, setGameOverResult] = useState(null);
  const [finalDefense, setFinalDefense] = useState(null);
  const [finalVote, setFinalVote] = useState(null);
  const [sessionReplacedModal, setSessionReplacedModal] = useState(false);
  const stompClientRef = useRef(null);
  const roomsSubscriptionRef = useRef(null);
  const roomSubscriptionRef = useRef(null);
  const userSubscriptionRef = useRef(null);
  const roomRef = useRef(room);
  const phaseRef = useRef(phase);
  const isLoadingRef = useRef(false);
  const isRestoringRef = useRef(false);
  const lastRestoredTimeRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const isFetchingGameStartPlayersRef = useRef(false);

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
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const data = await getRoom(roomCode);
      const nextRoom = normalizeRoom(data);

      if (nextRoom.game?.phase) {
        setPhase(nextRoom.game.phase);
        if (nextRoom.game.phase === 'VOTE_RESULT' && nextRoom.game.voteResult) {
          setVoteResult(nextRoom.game.voteResult);
        } else {
          setVoteResult(null);
        }
      } else if (restoreLastGameResult(nextRoom)) {
        setGameOverResult(restoreLastGameResult(nextRoom));
        setFinalDefense(null);
        setFinalVote(null);
        setVoteResult(null);
        setPhase('GAME_OVER');
      } else {
        setVoteResult(null);
        if (nextRoom.status === 'VOTING') {
          setPhase('VOTE');
        } else if (nextRoom.status === 'PLAYING') {
          setPhase((current) => (current === 'RESULT' ? current : 'SPEECH'));
        } else if (nextRoom.status === 'WAITING') {
          setPhase(null);
        }
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

      const session = getSession();
      const pId = session.playerId;
      const pSecret = session.playerSecret;

      if (roomCode && pId && pSecret && (nextRoom.status !== 'WAITING' || nextRoom.game)) {
        try {
          isRestoringRef.current = true;
          const gameState = await getPlayerGameState(roomCode, pId, pSecret);

          if (gameState) {
            setRoleInfo({
              role: gameState.role,
              topicWord: gameState.topicWord,
            });

            // 플레이어 병합: 방 응답과 개인 상태 응답을 합쳐 DEAD 상태 누락 방지
            const nextRoomPlayers = nextRoom.players || [];
            const gameStatePlayers = gameState.players || [];
            const playerMap = new Map();
            nextRoomPlayers.forEach(p => {
              playerMap.set(String(p.playerId).trim(), { ...p });
            });
            gameStatePlayers.forEach(p => {
              const id = String(p.playerId).trim();
              if (playerMap.has(id)) {
                const existing = playerMap.get(id);
                playerMap.set(id, {
                  ...existing,
                  ...p,
                  status: p.status === 'DEAD' || existing.status === 'DEAD' ? 'DEAD' : p.status || existing.status,
                });
              } else {
                playerMap.set(id, { ...p });
              }
            });
            const mergedPlayers = Array.from(playerMap.values());
            setRoom((current) => {
              if (!current) return null;
              return { ...current, players: mergedPlayers };
            });

            if (gameState.voteResult) {
              setVoteResult(gameState.voteResult);
            }

            const restoredFinalStage = restoreFinalStage(nextRoom.game, gameState);
            setFinalDefense(restoredFinalStage.finalDefense);
            setFinalVote(restoredFinalStage.finalVote);

            // 투표 관련 상태 복원
            setVoteState((current) => {
              const nextVoteState = { ...current };
              if (gameState.hasVoted !== undefined) nextVoteState.hasVoted = gameState.hasVoted;
              if (gameState.canVote !== undefined) nextVoteState.canVote = gameState.canVote;
              if (gameState.votedCount !== undefined) nextVoteState.votedCount = gameState.votedCount;
              if (gameState.totalVoterCount !== undefined) nextVoteState.totalVoterCount = gameState.totalVoterCount;
              // voteCandidates: 서버 필드명, voteState 내부 키는 votablePlayers 유지
              nextVoteState.votablePlayers = gameState.voteCandidates || [];
              return nextVoteState;
            });

            // 채팅 로그 복원: spokenAt + playerId + content 기반 중복 방지
            const remoteSpeechLogs = gameState.speechLogs || [];
            setSpeechLogs((currentLogs) => {
              const result = [...currentLogs];
              remoteSpeechLogs.forEach((remoteLog) => {
                const isDuplicate = result.some((localLog) => {
                  if (localLog.spokenAt && remoteLog.spokenAt) {
                    const lt = new Date(localLog.spokenAt).getTime();
                    const rt = new Date(remoteLog.spokenAt).getTime();
                    if (!isNaN(lt) && !isNaN(rt)) {
                      return String(localLog.playerId).trim() === String(remoteLog.playerId).trim() &&
                             localLog.content === remoteLog.content && lt === rt;
                    }
                  }
                  return String(localLog.playerId).trim() === String(remoteLog.playerId).trim() &&
                         localLog.content === remoteLog.content;
                });
                if (!isDuplicate) {
                  result.push({
                    playerId: remoteLog.playerId,
                    nickname: remoteLog.nickname || '알 수 없음',
                    content: remoteLog.content,
                    spokenAt: remoteLog.spokenAt,
                  });
                }
              });
              result.sort((a, b) => {
                const ta = a.spokenAt ? new Date(a.spokenAt).getTime() : 0;
                const tb = b.spokenAt ? new Date(b.spokenAt).getTime() : 0;
                return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
              });
              return result;
            });

            lastRestoredTimeRef.current = Date.now();
          }
        } catch (gameStateErr) {
          const status = gameStateErr.status;
          if (status === 401 || status === 403) {
            clearSession();
            setPlayerId(null);
            setPlayerSecret(null);
            setRoom(null);
            setRoleInfo(null);
            resetGameState();
            setError('인증 오류가 발생하여 대기실로 이동합니다.');
            await loadRooms();
            return;
          } else if (status === 404) {
            clearSession();
            setPlayerId(null);
            setPlayerSecret(null);
            setRoom(null);
            setRoleInfo(null);
            resetGameState();
            setError(gameStateErr.message);
            await loadRooms();
            return;
          } else {
            console.error("개인 게임 상태 조회 중 네트워크/기타 오류 발생:", gameStateErr);
          }
        } finally {
          isRestoringRef.current = false;
        }
      }
    } catch (err) {
      const status = err.status;
      if (status === 401 || status === 403 || status === 404) {
        clearSession();
        setPlayerId(null);
        setPlayerSecret(null);
        setRoom(null);
        setRoleInfo(null);
        resetGameState();
        setError(err.message);
        await loadRooms();
      } else {
        console.error("방 정보 로드 중 일시적 오류 발생:", err);
      }
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
      isRestoringRef.current = false;
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

  // 인증되지 않은 메인 로비에서는 REST 폴링으로 공개 방 목록을 갱신한다.
  useEffect(() => {
    if (room) return;
    const interval = setInterval(loadRooms, ROOM_LIST_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [room]);

  useEffect(() => {
    // STOMP 연결은 오직 React state 값만으로 판단한다.
    // getSession() 직접 참조를 제거하여, loadRoom 404 → setRoom(null) 이후
    // 즉시 STOMP 연결이 차단되도록 경쟁 조건(Race Condition)을 제거한다.
    const currentRoomCode = room?.roomCode || '';
    const currentId = playerId || '';
    const currentSecret = playerSecret || '';

    // 백엔드 STOMP CONNECT 필수 조건: roomCode, playerId, playerSecret 모두 있어야만 연결
    if (!currentRoomCode || !currentId || !currentSecret) {
      stompClientRef.current?.deactivate();
      stompClientRef.current = null;
      setWsConnected(false);
      return;
    }

    const connectHeaders = {
      roomCode: currentRoomCode,
      playerId: currentId,
      playerSecret: currentSecret,
    };

    const client = createStompClient(connectHeaders);
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
  }, [room?.roomCode, playerId, playerSecret]);

  useEffect(() => {
    const client = stompClientRef.current;
    roomSubscriptionRef.current?.unsubscribe();
    roomSubscriptionRef.current = null;

    if (!room?.roomCode || !client?.connected) return;

    roomSubscriptionRef.current = subscribeToEvents(client, `/sub/rooms/${room.roomCode}`, async (event) => {
      if (event?.type === 'ERROR') {
        const errMsg = event.message || event.data?.message || '오류가 발생했습니다.';
        setError(errMsg);

        if (roomRef.current?.roomCode && playerId && playerSecret) {
          getPlayerGameState(roomRef.current.roomCode, playerId, playerSecret)
            .then((gameState) => {
              if (gameState) {
                setVoteState((current) => {
                  const nextVoteState = { ...current };
                  if (gameState.hasVoted !== undefined) nextVoteState.hasVoted = gameState.hasVoted;
                  if (gameState.canVote !== undefined) nextVoteState.canVote = gameState.canVote;
                  if (gameState.votedCount !== undefined) nextVoteState.votedCount = gameState.votedCount;
                  if (gameState.totalVoterCount !== undefined) nextVoteState.totalVoterCount = gameState.totalVoterCount;
                  nextVoteState.votablePlayers = (gameState.voteCandidates || []).filter(
                    (p) => String(p.playerId) !== String(playerId) && p.status !== 'DEAD'
                  );
                  return nextVoteState;
                });
              }
            })
            .catch((err) => {
              console.error('에러 발생 후 투표 상태 재동기화 실패:', err);
            });
        }
        return;
      }

      if (event?.type === 'PLAYER_SPOKEN') {
        const data = event.data ?? event;
        setSpeechLogs((logs) => [
          ...logs,
          {
            playerId: data.playerId,
            nickname: data.nickname || '알 수 없음',
            content: data.content,
            spokenAt: data.spokenAt,
          },
        ]);
        return;
      }

      if (event?.type === 'TURN_CHANGED') {
        const data = event.data ?? event;
        setRoom((current) => (current ? applyTurnChanged(current, data) : current));
        setPhase('SPEECH');
        setVoteResult(null);
        setFinalDefense(null);
        setFinalVote(null);
        return;
      }

      if (event?.type === 'GAME_START') {
        const data = event.data ?? event;
        const currentTurnPlayerId = normalizeEventId(data.currentTurnPlayerId) ?? null;

        // Clear game states on new game start
        setRoleInfo(null);
        setGameOverResult(null);
        setVoteResult(null);
        setVoteState({
          votedCount: 0,
          totalVoterCount: 0,
          hasVoted: false,
          canVote: true,
          votablePlayers: [],
        });
        setSpeechLogs([]);

        const hasPlayers = Array.isArray(data.players) && data.players.length > 0;
        if (!hasPlayers && roomRef.current?.roomCode && !isFetchingGameStartPlayersRef.current) {
          isFetchingGameStartPlayersRef.current = true;
          getRoom(roomRef.current.roomCode)
            .then((freshRoom) => {
              const normalized = normalizeRoom(freshRoom);
              const freshPlayers = (normalized.players || []).map((p) => ({
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
                      players: freshPlayers,
                    }
                  : current,
              );
            })
            .catch((err) => {
              console.error("GAME_START 중 플레이어 목록 재조회 실패:", err);
            })
            .finally(() => {
              isFetchingGameStartPlayersRef.current = false;
            });
        }

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
        // 백엔드 VOTE_STARTED 이벤트는 alivePlayers 필드를 사용
        const alivePlayers = data.alivePlayers || roomRef.current?.players || [];
        setPhase('VOTE');

        const myPlayer = alivePlayers.find((p) => String(p.playerId) === String(playerId));
        const isDead = myPlayer?.status === 'DEAD';
        const isJustRestored = Date.now() - lastRestoredTimeRef.current < 2000;

        // 투표 후보: 본인 및 DEAD 제외
        const filteredVotable = alivePlayers.filter(
          (p) => String(p.playerId) !== String(playerId) && p.status !== 'DEAD'
        );

        setVoteState((current) => ({
          votedCount: data.votedCount ?? 0,
          totalVoterCount: data.totalCount ?? alivePlayers.length,
          hasVoted: isJustRestored ? current.hasVoted : false,
          canVote: isDead ? false : (isJustRestored ? current.canVote : true),
          votablePlayers: filteredVotable,
        }));

        setRoom((current) =>
          current
            ? {
                ...current,
                status: 'VOTING',
                players: alivePlayers,
                currentTurnPlayerId: null,
              }
            : current,
        );
        return;
      }

      if (event?.type === 'PLAYER_VOTED') {
        const data = event.data ?? event;
        setVoteState((current) => {
          const voterId = data.voterId != null ? String(data.voterId).trim() : '';
          const myId = playerId != null ? String(playerId).trim() : '';
          const isMe = voterId !== '' && myId !== '' && voterId === myId;
          const isDead = roomRef.current?.players?.find(p => String(p.playerId) === String(playerId))?.status === 'DEAD';
          return {
            ...current,
            votedCount: data.votedCount ?? current.votedCount,
            totalVoterCount: data.totalCount ?? current.totalVoterCount,
            hasVoted: isMe ? true : current.hasVoted,
            canVote: isDead ? false : (isMe ? false : current.canVote),
          };
        });
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

      if (event?.type === 'ROOM_UPDATED') {
        const data = event.data ?? event;
        if (data?.roomCode) {
          setRoom((current) => (current ? { ...current, ...normalizeRoom(data) } : current));
        }
        return;
      }

      if (event?.type === 'SESSION_REPLACED') {
        setSessionReplacedModal(true);
        client.deactivate();
        if (stompClientRef.current === client) {
          stompClientRef.current = null;
        }
        return;
      }

      if (event?.type === 'FINAL_DEFENSE_STARTED') {
        const data = event.data ?? event;
        setFinalDefense({
          candidatePlayerId: data.candidatePlayerId,
          durationSeconds: data.durationSeconds || 10,
          deadlineAt: data.deadlineAt,
        });
        setPhase('FINAL_DEFENSE');
        return;
      }

      if (event?.type === 'FINAL_VOTE_STARTED') {
        const data = event.data ?? event;
        setFinalVote({
          candidatePlayerId: data.candidatePlayerId,
          durationSeconds: data.durationSeconds || 10,
          deadlineAt: data.deadlineAt,
        });
        setPhase('FINAL_VOTE');
        return;
      }

      if (event?.type === 'GAME_OVER') {
        const data = event.data ?? event;
        setGameOverResult({
          winner: data.winner,
          reason: data.reason,
          liarPlayerId: data.liarPlayerId,
          liarPlayerNickname: data.liarPlayerNickname,
        });
        setPhase('GAME_OVER');
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
        const errMsg = event.message || event.data?.message || '오류가 발생했습니다.';
        setError(errMsg);
        // 투표 오류 시 개인 게임 상태 재조회로 투표 상태 동기화
        if (roomRef.current?.roomCode && playerId && playerSecret) {
          getPlayerGameState(roomRef.current.roomCode, playerId, playerSecret)
            .then((gameState) => {
              if (gameState) {
                setVoteState((current) => {
                  const nextVoteState = { ...current };
                  if (gameState.hasVoted !== undefined) nextVoteState.hasVoted = gameState.hasVoted;
                  if (gameState.canVote !== undefined) nextVoteState.canVote = gameState.canVote;
                  if (gameState.votedCount !== undefined) nextVoteState.votedCount = gameState.votedCount;
                  if (gameState.totalVoterCount !== undefined) nextVoteState.totalVoterCount = gameState.totalVoterCount;
                  nextVoteState.votablePlayers = (gameState.voteCandidates || []).filter(
                    (p) => String(p.playerId) !== String(playerId) && p.status !== 'DEAD'
                  );
                  return nextVoteState;
                });
              }
            })
            .catch((err) => {
              console.error('에러 발생 후 투표 상태 재동기화 실패:', err);
            });
        }
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
      setPlayerSecret(session.playerSecret);
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
      setPlayerSecret(session.playerSecret);
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
    if (sessionReplacedModal) return;
    const session = getSession();
    const currentRoomCode = room?.roomCode || session.roomCode;
    const currentId = playerId || session.playerId;
    const currentSecret = playerSecret || session.playerSecret;

    setLoading(true);
    setError('');
    try {
      // 방을 나가기 전에 먼저 WebSocket 구독을 해제하여 퇴장 이벤트 수신으로 인한 레이스 컨디션을 방지합니다.
      roomSubscriptionRef.current?.unsubscribe();
      roomSubscriptionRef.current = null;
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;

      if (currentRoomCode && currentId && currentSecret) {
        await leaveRoom(currentRoomCode, currentId, currentSecret);
      }
    } catch (err) {
      console.warn('퇴장 API 호출 실패 (로컬 세션 정리 진행):', err.message);
    } finally {
      clearSession();
      setPlayerId(null);
      setPlayerSecret(null);
      setRoleInfo(null);
      setSpeechLogs([]);
      resetGameState();
      setRoom(null);
      setLoading(false);
      await loadRooms();
    }
  }

  function handleStartGame() {
    if (sessionReplacedModal) return;
    try {
      resetGameState();
      publishJson(stompClientRef.current, `/pub/rooms/${room.roomCode}/start`, { playerId, playerSecret });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSpeak(content, speakerId = playerId) {
    if (sessionReplacedModal) return;
    if (isSpeakingRef.current) return;
    isSpeakingRef.current = true;
    try {
      publishJson(stompClientRef.current, `/pub/rooms/${room.roomCode}/speak`, {
        playerId: speakerId,
        playerSecret,
        content,
      });
      // 800ms 동안 중복 발언 제출을 방지하기 위한 비동기 딜레이
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err) {
      setError(err.message);
    } finally {
      isSpeakingRef.current = false;
    }
  }

  function handleVote(targetPlayerId, voterId = playerId) {
    if (sessionReplacedModal) return;
    try {
      publishJson(stompClientRef.current, '/pub/game/vote', {
        roomCode: room.roomCode,
        voterId,
        playerSecret,
        targetPlayerId,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateSettings({ categoryId, timePreset }) {
    if (sessionReplacedModal) return;
    if (!room?.roomCode || !playerId || !playerSecret) return;
    try {
      setLoading(true);
      await updateRoomSettings(room.roomCode, { playerId, categoryId, timePreset }, playerSecret);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    if (sessionReplacedModal) return;
    if (!room?.roomCode || !playerId) return;
    try {
      publishJson(stompClientRef.current, `/pub/rooms/${room.roomCode}/skip`, { playerId, playerSecret });
    } catch (err) {
      setError(err.message);
    }
  }

  function handleFinalVote(decision) {
    if (sessionReplacedModal) return;
    if (!room?.roomCode || !playerId) return;
    try {
      publishJson(stompClientRef.current, '/pub/game/final-vote', {
        roomCode: room.roomCode,
        voterId: playerId,
        playerSecret,
        decision,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function resetGameState() {
    setPhase(null);
    setVoteState({
      votedCount: 0,
      totalVoterCount: 0,
      hasVoted: false,
      canVote: true,
      votablePlayers: [],
    });
    setVoteResult(null);
    setGameOverResult(null);
    setFinalDefense(null);
    setFinalVote(null);
  }

  function handleConfirmGameOver() {
    setGameOverResult(null);
    setVoteResult(null);
    setFinalDefense(null);
    setFinalVote(null);
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
      phase === 'FINAL_DEFENSE' ||
      phase === 'FINAL_VOTE' ||
      phase === 'GAME_OVER';

    return (
      <>
        {error && <div className="toast">{error}</div>}
        {sessionReplacedModal && (
          <div className="modalBackdrop">
            <div className="modal" style={{ textAlign: "center" }}>
              <p className="eyebrow">Session Replaced</p>
              <h2>세션 대체 안내</h2>
              <p style={{ marginTop: "12px", color: "#d8cedf" }}>
                다른 브라우저 탭에서 접속하여 현재 연결이 종료되었습니다.
              </p>
            </div>
          </div>
        )}
        {shouldShowGameScreen ? (
          <GameScreen
            room={room}
            roleInfo={roleInfo}
            playerId={playerId}
            speechLogs={speechLogs}
            onSpeak={handleSpeak}
            onSkip={handleSkip}
            phase={phase}
            voteState={voteState}
            voteResult={voteResult}
            gameOverResult={gameOverResult}
            finalDefense={finalDefense}
            finalVote={finalVote}
            sessionReplaced={sessionReplacedModal}
            onVote={handleVote}
            onFinalVote={handleFinalVote}
            onConfirmGameOver={handleConfirmGameOver}
          />
        ) : (
          <Lobby
            room={room}
            playerId={playerId}
            sessionReplaced={sessionReplacedModal}
            onLeave={handleLeave}
            onStart={handleStartGame}
            onUpdateSettings={handleUpdateSettings}
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
