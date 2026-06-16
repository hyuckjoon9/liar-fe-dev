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
    throw new Error(data?.message || '요청 처리 중 오류가 발생했습니다.');
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

export function createRoom({ nickname, password, maxPlayers }) {
  return request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ nickname, password: password || null, maxPlayers }),
  });
}

export function joinRoom(roomCode, { nickname, password }) {
  return request(`/api/rooms/${roomCode}/join`, {
    method: 'POST',
    body: JSON.stringify({ nickname, password: password || null }),
  });
}

export function getRoom(roomCode) {
  return request(`/api/rooms/${roomCode}`);
}

export function leaveRoom(roomCode, playerId) {
  return request(`/api/rooms/${roomCode}/leave`, {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}
