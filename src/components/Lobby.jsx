export default function Lobby({ room, playerId, onLeave, onStart, loading }) {
  const players = room.players || [];
  const me = players.find((player) => String(player.playerId) === String(playerId));
  const isHost = Boolean(me?.isHost ?? me?.host ?? me?.role === 'HOST');

  return (
    <main className="appShell">
      <section className="lobbyHero">
        <p className="eyebrow">Waiting Room</p>
        <h1>{room.roomCode}번 방</h1>
        <p>
          현재 인원 {room.currentPlayers} / {room.maxPlayers}
        </p>
      </section>
      <section className="panel lobbyPanel">
        <div className="listHeader">
          <div>
            <p className="eyebrow">Players</p>
            <h2>플레이어 목록</h2>
          </div>
          <div className="lobbyActions">
            <button className="ghostButton" type="button" onClick={onLeave} disabled={loading}>
              나가기
            </button>
            <button className="primaryButton" type="button" onClick={onStart} disabled={!isHost || loading}>
              게임 시작
            </button>
          </div>
        </div>
        <div className="players">
          {players.map((player) => {
            const id = String(player.playerId);
            const isHost = Boolean(player.isHost ?? player.host ?? player.role === 'HOST');
            return (
              <div className="playerCard" key={id}>
                <span>{player.nickname}</span>
                <div>
                  {isHost && <b>방장</b>}
                  {id === String(playerId) && <em>나</em>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
