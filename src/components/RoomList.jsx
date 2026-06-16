export default function RoomList({ rooms, loading, onRefresh, onSelectRoom }) {
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
          <span>잠금</span>
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
              <span>{room.hasPassword ? '비밀번호' : '공개'}</span>
              <span className="status">{room.status}</span>
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
