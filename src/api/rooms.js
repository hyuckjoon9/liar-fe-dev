import { API_BASE_URL } from '../config';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || '요청 처리 중 오류가 발생했습니다.');
    error.status = response.status;
    throw error;
  }

  if (data && typeof data === 'object' && 'success' in data) {
    if (!data.success) {
      throw new Error(data.message || '요청 처리 중 오류가 발생했습니다.');
    }
    return data.data;
  }

  return data;
}

export function getRooms() {
  return request('/api/rooms');
}

export function createRoom({ nickname, visibility, maxPlayers }) {
  return request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ nickname, visibility: visibility || null, maxPlayers }),
  });
}

export function joinRoom(roomCode, { nickname }) {
  return request(`/api/rooms/${roomCode}/join`, {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  });
}

export function getRoom(roomCode) {
  return request(`/api/rooms/${roomCode}`);
}

export function leaveRoom(roomCode, playerId, playerSecret) {
  if (!roomCode || !playerId || !playerSecret) {
    throw new Error('퇴장 처리에 필요한 방 정보 또는 인증 키가 유효하지 않습니다.');
  }
  return request(`/api/rooms/${roomCode}/leave`, {
    method: 'POST',
    headers: {
      'X-Player-Secret': playerSecret,
    },
    body: JSON.stringify({ playerId }),
  });
}

export function getPlayerGameState(roomCode, playerId, playerSecret) {
  if (!playerSecret) {
    throw new Error('playerSecret이 유효하지 않습니다.');
  }
  return request(`/api/rooms/${roomCode}/players/${playerId}/game-state`, {
    method: 'GET',
    headers: {
      'X-Player-Secret': playerSecret,
    },
  });
}

export function updateRoomSettings(roomCode, { playerId, categoryId, timePreset }, playerSecret) {
  if (!playerSecret) {
    throw new Error('playerSecret이 유효하지 않습니다.');
  }
  return request(`/api/rooms/${roomCode}/settings`, {
    method: 'PATCH',
    headers: {
      'X-Player-Secret': playerSecret,
    },
    body: JSON.stringify({ playerId, categoryId, timePreset }),
  });
}
