const PLAYER_ID_KEY = 'liar.playerId';
const ROOM_CODE_KEY = 'liar.roomCode';
const PLAYER_SECRET_KEY = 'liar.playerSecret';

export function saveSession({ playerId, roomCode, playerSecret }) {
  if (playerId) sessionStorage.setItem(PLAYER_ID_KEY, String(playerId));
  if (roomCode) sessionStorage.setItem(ROOM_CODE_KEY, String(roomCode));
  if (playerSecret) sessionStorage.setItem(PLAYER_SECRET_KEY, String(playerSecret));
}

export function getSession() {
  return {
    playerId: sessionStorage.getItem(PLAYER_ID_KEY),
    roomCode: sessionStorage.getItem(ROOM_CODE_KEY),
    playerSecret: sessionStorage.getItem(PLAYER_SECRET_KEY),
  };
}

export function clearSession() {
  sessionStorage.removeItem(PLAYER_ID_KEY);
  sessionStorage.removeItem(ROOM_CODE_KEY);
  sessionStorage.removeItem(PLAYER_SECRET_KEY);
}

