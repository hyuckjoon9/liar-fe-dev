import { Client } from '@stomp/stompjs';
import { WS_URL } from '../config';

const EVENT_TYPES = new Set([
  'ROOM_CREATED',
  'ROOM_UPDATED',
  'PLAYER_JOIN',
  'PLAYER_LEAVE',
  'HOST_CHANGED',
  'ROOM_DELETED',
  'GAME_START',
  'ROLE_ASSIGNED',
  'PLAYER_SPOKEN',
  'TURN_CHANGED',
  'VOTE_STARTED',
  'FINAL_DEFENSE_STARTED',
  'FINAL_VOTE_STARTED',
  'PLAYER_VOTED',
  'VOTE_RESULT',
  'GAME_OVER',
  'SESSION_REPLACED',
  'ERROR',
]);

export function createStompClient(connectHeaders = {}) {
  return new Client({
    brokerURL: WS_URL,
    connectHeaders,
    reconnectDelay: 3000,
    debug: () => {},
    onStompError: (frame) => {
      console.error('STOMP error', frame.headers?.message);
    },
    onWebSocketError: () => {
      console.error('WebSocket error');
    },
  });
}

export function subscribeToEvents(client, destination, onEvent) {
  if (!client?.connected) return null;

  return client.subscribe(destination, (message) => {
    try {
      const event = JSON.parse(message.body);
      if (!event?.type || EVENT_TYPES.has(event.type)) {
        onEvent(event);
      }
    } catch {
      onEvent(null);
    }
  });
}

export function publishJson(client, destination, body) {
  if (!client?.connected) {
    throw new Error('WebSocket 연결이 준비되지 않았습니다.');
  }

  client.publish({
    destination,
    body: JSON.stringify(body),
  });
}
