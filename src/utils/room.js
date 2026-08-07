export function normalizeRoom(room) {
  const source = room?.room ? { ...room.room, players: room.players ?? room.room.players } : room;
  const currentGame = source.currentGame ?? source.game;
  const turnOrder = source.turnOrder ?? currentGame?.turnOrder ?? [];
  const currentTurnIndex = source.currentTurnIndex ?? currentGame?.currentTurnIndex ?? 0;

  return {
    roomCode: source.roomCode,
    title: source.title ?? null,
    hostId: source.hostId ?? null,
    visibility: source.visibility ?? 'PUBLIC',
    currentPlayers: source.currentPlayers ?? source.players?.length ?? 0,
    maxPlayers: source.maxPlayers ?? 0,
    status: source.status ?? 'WAITING',
    listStatus: source.listStatus ?? null,
    players: source.players ?? [],
    turnOrder,
    currentTurnIndex,
    currentTurnPlayerId:
      source.currentTurnPlayerId ??
      currentGame?.currentTurnPlayerId ??
      null,
    game: currentGame || null,
    lastGameResult: source.lastGameResult ?? null,
  };
}


export function pickSessionPayload(data) {
  return {
    playerId: data?.playerId,
    roomCode: data?.roomCode,
    playerSecret: data?.playerSecret,
  };
}
