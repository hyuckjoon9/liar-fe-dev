function normalizeEventId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function applyTurnChanged(room, event) {
  const currentTurnPlayerId = normalizeEventId(event.currentTurnPlayerId ?? event.playerId);

  return {
    ...room,
    status: 'PLAYING',
    currentTurnPlayerId: currentTurnPlayerId || room.currentTurnPlayerId,
    currentTurnIndex: event.currentTurnIndex ?? room.currentTurnIndex,
  };
}
