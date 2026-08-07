export default function RoomList({ rooms, loading, onRefresh, onSelectRoom }) {
  function getStatusLabel(room) {
    const ls = room.listStatus;
    if (ls === 'WAITING') return '대기중';
    if (ls === 'PLAYING') return '게임중';
    if (ls === 'FULL') return '정원마감';
    // listStatus 없을 경우 status로 fallback
    if (room.status === 'WAITING') return '대기중';
    return '게임중';
  }

  return (
    <section className="panel roomPanel">
      <div className="listHeader">
        <div>
          <p className="eyebrow">Rooms</p>
          <h2>방 목록</h2>
        </div>
        <button className="ghostButton" type="button" onClick={onRefresh} disabled={loading}>
          새로고침
        </button>
      </div>
      <div className="table">
        <div className="tableHead">
          <span>방 번호</span>
          <span>인원</span>
          <span>공개</span>
          <span>상태</span>
          <span></span>
        </div>
        {rooms.length === 0 ? (
          <p className="empty">생성된 방이 없습니다.</p>
        ) : (
          rooms.map((room) => (
            <div className="tableRow" key={room.roomCode}>
              <strong>{room.roomCode}</strong>
              <span>
                {room.currentPlayers} / {room.maxPlayers}
              </span>
              <span>{room.visibility === 'PRIVATE' ? '비공개' : '공개'}</span>
              <span className="status">{getStatusLabel(room)}</span>
              <button className="smallButton" type="button" onClick={() => onSelectRoom(room)}>
                입장
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
