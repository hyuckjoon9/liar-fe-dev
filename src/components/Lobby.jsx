export default function Lobby({ room, playerId, onLeave, onStart, onUpdateSettings, loading, sessionReplaced = false }) {
  const players = room.players || [];
  const me = players.find((player) => String(player.playerId) === String(playerId));
  const isHost = Boolean(me?.host);

  const currentCategory = room.categoryId || 'RANDOM';
  const currentTimePreset = room.timePreset || 'STANDARD';

  function handleCategoryChange(e) {
    onUpdateSettings?.({ categoryId: e.target.value, timePreset: currentTimePreset });
  }

  function handleTimePresetChange(e) {
    onUpdateSettings?.({ categoryId: currentCategory, timePreset: e.target.value });
  }

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
        {isHost && (
          <div className="settingsSection">
            <div className="listHeader">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>게임 설정</h2>
              </div>
            </div>
            <div className="settingsGrid">
              <label>
                카테고리
                <select value={currentCategory} onChange={handleCategoryChange} disabled={loading || sessionReplaced}>
                  <option value="RANDOM">랜덤 (전체)</option>
                  <option value="FOOD">음식</option>
                  <option value="ANIMAL">동물</option>
                  <option value="PLACE">장소</option>
                  <option value="JOB">직업</option>
                  <option value="COUNTRY">나라</option>
                </select>
              </label>
              <label>
                제한 시간 프리셋
                <select value={currentTimePreset} onChange={handleTimePresetChange} disabled={loading || sessionReplaced}>
                  <option value="FAST">빠름 (발언 15초 / 투표 20초)</option>
                  <option value="STANDARD">표준 (발언 30초 / 투표 30초)</option>
                  <option value="RELAXED">느림 (발언 45초 / 투표 45초)</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <div className="listHeader" style={{ marginTop: isHost ? '24px' : '0' }}>
          <div>
            <p className="eyebrow">Players</p>
            <h2>플레이어 목록</h2>
          </div>
          <div className="lobbyActions">
            <button className="ghostButton" type="button" onClick={onLeave} disabled={loading || sessionReplaced}>
              나가기
            </button>
            <button className="primaryButton" type="button" onClick={onStart} disabled={!isHost || loading || sessionReplaced}>
              게임 시작
            </button>
          </div>
        </div>

        <div className="playerList">
          {players.map((player) => {
            const id = String(player.playerId);
            const isHostPlayer = Boolean(player.host);
            return (
              <div className="playerRow" key={id}>
                <span className="playerRowName">{player.nickname}</span>
                <div className="playerRowBadges">
                  {isHostPlayer && <b className="badgeHost">방장</b>}
                  {id === String(playerId) && <em className="badgeMe">나</em>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
