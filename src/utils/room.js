export function normalizeRoom(room) {
  const source = room?.room ? { ...room.room, players: room.players ?? room.room.players } : room;
  const currentGame = source.currentGame ?? source.game;
  const turnOrder = source.turnOrder ?? currentGame?.turnOrder ?? [];
  const currentTurnIndex = source.currentTurnIndex ?? currentGame?.currentTurnIndex ?? 0;
  const turnEntry = turnOrder[currentTurnIndex];
  const restoredTurnPlayerId =
    typeof turnEntry === 'object' ? turnEntry?.playerId ?? turnEntry?.id : turnEntry;

  return {
    roomCode: source.roomCode,
    currentPlayers: source.currentPlayers ?? source.players?.length ?? 0,
    maxPlayers: source.maxPlayers ?? 0,
    hasPassword: Boolean(source.hasPassword),
    status: source.status ?? 'WAITING',
    players: source.players ?? [],
    turnOrder,
    currentTurnIndex,
    currentTurnPlayerId:
      source.currentTurnPlayerId ??
      source.currentTurn?.playerId ??
      currentGame?.currentTurnPlayerId ??
      restoredTurnPlayerId ??
      null,
  };
}

export function pickSessionPayload(data) {
  return {
    playerId: data?.playerId,
    roomCode: data?.roomCode,
  };
}
