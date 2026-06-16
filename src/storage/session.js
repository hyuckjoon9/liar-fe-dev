const PLAYER_ID_KEY = 'liar.playerId';
const ROOM_CODE_KEY = 'liar.roomCode';

export function saveSession({ playerId, roomCode }) {
  if (playerId) localStorage.setItem(PLAYER_ID_KEY, String(playerId));
  if (roomCode) localStorage.setItem(ROOM_CODE_KEY, String(roomCode));
}

export function getSession() {
  return {
    playerId: localStorage.getItem(PLAYER_ID_KEY),
    roomCode: localStorage.getItem(ROOM_CODE_KEY),
  };
}

export function clearSession() {
  localStorage.removeItem(PLAYER_ID_KEY);
  localStorage.removeItem(ROOM_CODE_KEY);
}
