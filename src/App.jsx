import { useEffect, useRef, useState } from 'react';
import { createRoom, getRoom, getRooms, joinRoom, leaveRoom, getPlayerGameState } from './api/rooms';
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
  const [playerSecret, setPlayerSecret] = useState(getSession().playerSecret);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [roleInfo, setRoleInfo] = useState(null);
  const [speechLogs, setSpeechLogs] = useState([]);
  const [phase, setPhase] = useState('SPEECH');
  const [voteState, setVoteState] = useState({
    votedCount: 0,
    totalCount: 0,
    totalVoterCount: 0,
    hasVoted: false,
    canVote: true,
    votablePlayers: [],
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
  const isLoadingRef = useRef(false);
  const isRestoringRef = useRef(false);
  const lastRestoredTimeRef = useRef(0);
  const isSpeakingRef = useRef(false);

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
      } else if (nextRoom.status === 'VOTING') {
        setPhase('VOTE');
      } else if (nextRoom.status === 'PLAYING') {
        setPhase((current) => (current === 'RESULT' ? current : 'SPEECH'));
      } else if (nextRoom.status === 'WAITING') {
        setPhase(null);
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
          const response = await getPlayerGameState(roomCode, pId, pSecret);

          let gameState = response;
          if (response && typeof response === 'object') {
            if (response.data !== undefined) {
              if (response.data && typeof response.data === 'object' && response.data.data !== undefined) {
                gameState = response.data.data;
              } else {
                gameState = response.data;
              }
            }
          }

          if (gameState) {
            setRoleInfo({
              role: gameState.role,
              topicWord: gameState.topicWord,
            });

            // boolean 필드 호환 처리 (단순 OR 금지, undefined 여부 판단)
            let hasVoted = undefined;
            if (gameState.hasVoted !== undefined) {
              hasVoted = gameState.hasVoted;
            } else if (gameState.isHasVoted !== undefined) {
              hasVoted = gameState.isHasVoted;
            }

            let canVote = undefined;
            if (gameState.canVote !== undefined) {
              canVote = gameState.canVote;
            } else if (gameState.isCanVote !== undefined) {
              canVote = gameState.isCanVote;
            }

            // 투표 관련 상태 복원
            setVoteState((current) => {
              const nextVoteState = { ...current };
              if (hasVoted !== undefined) {
                nextVoteState.hasVoted = hasVoted;
              }
              if (canVote !== undefined) {
                nextVoteState.canVote = canVote;
              }
              if (gameState.votedCount !== undefined) {
                nextVoteState.votedCount = gameState.votedCount;
              }

              const totalVal = gameState.totalVoterCount !== undefined ? gameState.totalVoterCount : gameState.totalCount;
              if (totalVal !== undefined) {
                nextVoteState.totalCount = totalVal;
                nextVoteState.totalVoterCount = totalVal;
              }
              // votablePlayers가 없으면 빈 배열 처리
              nextVoteState.votablePlayers = gameState.votablePlayers || [];
              return nextVoteState;
            });

            // 채팅 로그 복원 (중복 로그 방지하며 머지 및 닉네임 매핑)
            const remoteSpeechLogs = gameState.speechLogs || [];
            const playersList = nextRoom.players || [];

            setSpeechLogs((currentLogs) => {
              const result = [...currentLogs];
              remoteSpeechLogs.forEach((remoteLog) => {
                const isDuplicate = result.some(
                  (localLog) =>
                    String(localLog.playerId) === String(remoteLog.playerId) &&
                    localLog.content === remoteLog.content
                );
                if (!isDuplicate) {
                  // players에서 playerId에 해당하는 닉네임 찾기
                  const matchingPlayer = playersList.find(
                    (p) => String(p.playerId) === String(remoteLog.playerId)
                  );
                  const nickname = remoteLog.nickname || (matchingPlayer ? matchingPlayer.nickname : null) || remoteLog.playerId || "알 수 없음";

                  result.push({
                    playerId: remoteLog.playerId,
                    nickname: nickname,
                    content: remoteLog.content,
                  });
                }
              });
              return result;
            });

            // 복원 성공 직후 콘솔 디버그 로그 출력
            const nextVoteStateLog = {
              votedCount: gameState.votedCount,
              totalCount: gameState.totalVoterCount !== undefined ? gameState.totalVoterCount : gameState.totalCount,
              totalVoterCount: gameState.totalVoterCount !== undefined ? gameState.totalVoterCount : gameState.totalCount,
              hasVoted,
              canVote,
              votablePlayers: gameState.votablePlayers || [],
            };
            const nextSpeechLogsLog = remoteSpeechLogs.map((remoteLog) => {
              const matchingPlayer = playersList.find(
                (p) => String(p.playerId) === String(remoteLog.playerId)
              );
              return {
                playerId: remoteLog.playerId,
                nickname: remoteLog.nickname || (matchingPlayer ? matchingPlayer.nickname : null) || remoteLog.playerId || "알 수 없음",
                content: remoteLog.content,
              };
            });
            console.log("=== 복원 성공 직후 데이터 확인 ===");
            console.log("gameState:", gameState);
            console.log("next voteState:", nextVoteStateLog);
            console.log("next speechLogs:", nextSpeechLogsLog);
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
        const errMsg = event.message || event.data?.message || '오류가 발생했습니다.';
        setError(errMsg);
        
        const isVoteError = errMsg.includes('투표') || errMsg.includes('vote');
        if (isVoteError && roomRef.current?.roomCode && playerId && playerSecret) {
          getPlayerGameState(roomRef.current.roomCode, playerId, playerSecret)
            .then((response) => {
              let gameState = response;
              if (response && typeof response === 'object') {
                if (response.data !== undefined) {
                  if (response.data && typeof response.data === 'object' && response.data.data !== undefined) {
                    gameState = response.data.data;
                  } else {
                    gameState = response.data;
                  }
                }
              }
              if (gameState) {
                let hasVoted = undefined;
                if (gameState.hasVoted !== undefined) {
                  hasVoted = gameState.hasVoted;
                } else if (gameState.isHasVoted !== undefined) {
                  hasVoted = gameState.isHasVoted;
                }
                let canVote = undefined;
                if (gameState.canVote !== undefined) {
                  canVote = gameState.canVote;
                } else if (gameState.isCanVote !== undefined) {
                  canVote = gameState.isCanVote;
                }
                setVoteState((current) => {
                  const nextVoteState = { ...current };
                  if (hasVoted !== undefined) {
                    nextVoteState.hasVoted = hasVoted;
                  }
                  if (canVote !== undefined) {
                    nextVoteState.canVote = canVote;
                  }
                  if (gameState.votedCount !== undefined) {
                    nextVoteState.votedCount = gameState.votedCount;
                  }
                  const totalVal = gameState.totalVoterCount !== undefined ? gameState.totalVoterCount : gameState.totalCount;
                  if (totalVal !== undefined) {
                    nextVoteState.totalCount = totalVal;
                    nextVoteState.totalVoterCount = totalVal;
                  }
                  const nextVotable = (gameState.votablePlayers || []).filter(
                    (p) => String(p.playerId) !== String(playerId) && p.status !== 'DEAD'
                  );
                  nextVoteState.votablePlayers = nextVotable;
                  return nextVoteState;
                });
              }
            })
            .catch((err) => {
              console.error("에러 발생 후 투표 상태 재동기화 실패:", err);
            });
        }
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
          totalVoterCount: 0,
          hasVoted: false,
          canVote: true,
          votablePlayers: [],
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
        
        const myPlayer = votePlayers.find((p) => String(p.playerId) === String(playerId));
        const isDead = myPlayer?.status === 'DEAD';
        const isJustRestored = Date.now() - lastRestoredTimeRef.current < 2000;
        
        const filteredVotable = votePlayers.filter(
          (p) => String(p.playerId) !== String(playerId) && p.status !== 'DEAD'
        );

        setVoteState((current) => ({
          votedCount: data.votedCount ?? 0,
          totalCount: data.totalCount ?? data.totalVoterCount ?? votePlayers.length,
          totalVoterCount: data.totalVoterCount ?? data.totalCount ?? votePlayers.length,
          hasVoted: isJustRestored ? current.hasVoted : false,
          canVote: isDead ? false : (isJustRestored ? current.canVote : true),
          votablePlayers: filteredVotable,
        }));

        setRoom((current) =>
          current
            ? {
                ...current,
                status: 'VOTING',
                players: votePlayers,
                currentTurnPlayerId: null,
              }
            : current,
        );
        return;
      }

      if (event?.type === 'VOTING_START') {
        const data = event.data;
        const votePlayers = data?.players || roomRef.current?.players || [];
        setPhase('VOTE');
        
        const myPlayer = votePlayers.find((p) => String(p.playerId) === String(playerId));
        const isDead = myPlayer?.status === 'DEAD';
        const isJustRestored = Date.now() - lastRestoredTimeRef.current < 2000;
        
        const filteredVotable = votePlayers.filter(
          (p) => String(p.playerId) !== String(playerId) && p.status !== 'DEAD'
        );

        setVoteState((current) => ({
          votedCount: data?.votedCount ?? 0,
          totalCount: data?.totalCount ?? data?.totalVoterCount ?? votePlayers.length,
          totalVoterCount: data?.totalVoterCount ?? data?.totalCount ?? votePlayers.length,
          hasVoted: isJustRestored ? current.hasVoted : false,
          canVote: isDead ? false : (isJustRestored ? current.canVote : true),
          votablePlayers: filteredVotable,
        }));

        setRoom((current) =>
          current
            ? {
                ...current,
                status: 'VOTING',
                players: votePlayers,
                currentTurnPlayerId: null,
              }
            : current,
        );
        return;
      }

      if (event?.type === 'PLAYER_VOTED') {
        const data = event.data ?? event;
        setVoteState((current) => {
          const rawVoterId = data.voterId ?? data.playerId;
          const trimmedVoterId = (rawVoterId !== null && rawVoterId !== undefined) ? String(rawVoterId).trim() : '';
          const trimmedPlayerId = (playerId !== null && playerId !== undefined) ? String(playerId).trim() : '';
          
          const isMe = Boolean(
            trimmedVoterId !== '' &&
            trimmedPlayerId !== '' &&
            trimmedVoterId === trimmedPlayerId
          );

          const isDead = roomRef.current?.players?.find(p => String(p.playerId) === String(playerId))?.status === 'DEAD';
          return {
            ...current,
            votedCount: data.votedCount ?? data.votedPlayerCount ?? current.votedCount,
            totalCount: data.totalCount ?? current.totalCount,
            totalVoterCount: data.totalCount ?? current.totalCount,
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
        const errMsg = event.message || event.data?.message || '오류가 발생했습니다.';
        setError(errMsg);
        
        const isVoteError = errMsg.includes('투표') || errMsg.includes('vote');
        if (isVoteError && roomRef.current?.roomCode && playerId && playerSecret) {
          getPlayerGameState(roomRef.current.roomCode, playerId, playerSecret)
            .then((response) => {
              let gameState = response;
              if (response && typeof response === 'object') {
                if (response.data !== undefined) {
                  if (response.data && typeof response.data === 'object' && response.data.data !== undefined) {
                    gameState = response.data.data;
                  } else {
                    gameState = response.data;
                  }
                }
              }
              if (gameState) {
                let hasVoted = undefined;
                if (gameState.hasVoted !== undefined) {
                  hasVoted = gameState.hasVoted;
                } else if (gameState.isHasVoted !== undefined) {
                  hasVoted = gameState.isHasVoted;
                }
                let canVote = undefined;
                if (gameState.canVote !== undefined) {
                  canVote = gameState.canVote;
                } else if (gameState.isCanVote !== undefined) {
                  canVote = gameState.isCanVote;
                }
                setVoteState((current) => {
                  const nextVoteState = { ...current };
                  if (hasVoted !== undefined) {
                    nextVoteState.hasVoted = hasVoted;
                  }
                  if (canVote !== undefined) {
                    nextVoteState.canVote = canVote;
                  }
                  if (gameState.votedCount !== undefined) {
                    nextVoteState.votedCount = gameState.votedCount;
                  }
                  const totalVal = gameState.totalVoterCount !== undefined ? gameState.totalVoterCount : gameState.totalCount;
                  if (totalVal !== undefined) {
                    nextVoteState.totalCount = totalVal;
                    nextVoteState.totalVoterCount = totalVal;
                  }
                  const nextVotable = (gameState.votablePlayers || []).filter(
                    (p) => String(p.playerId) !== String(playerId) && p.status !== 'DEAD'
                  );
                  nextVoteState.votablePlayers = nextVotable;
                  return nextVoteState;
                });
              }
            })
            .catch((err) => {
              console.error("에러 발생 후 투표 상태 재동기화 실패:", err);
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
      setPlayerSecret(null);
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

  async function handleSpeak(content, speakerId = playerId) {
    if (isSpeakingRef.current) return;
    isSpeakingRef.current = true;
    try {
      publishJson(stompClientRef.current, `/pub/rooms/${room.roomCode}/speak`, {
        playerId: speakerId,
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
    try {
      publishJson(stompClientRef.current, '/pub/game/vote', {
        roomCode: room.roomCode,
        voterId,
        targetPlayerId,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function resetGameState() {
    setPhase('SPEECH');
    setVoteState({
      votedCount: 0,
      totalCount: 0,
      totalVoterCount: 0,
      hasVoted: false,
      canVote: true,
      votablePlayers: [],
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
