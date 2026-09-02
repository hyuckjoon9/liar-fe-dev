import { useState } from 'react';

export default function RoomList({ rooms, loading, onRefresh, onSelectRoom, onJoinByCode }) {
  const [inviteCode, setInviteCode] = useState('');
  const [nickname, setNickname] = useState('');

  function getStatusLabel(room) {
    const ls = room.listStatus;
    if (ls === 'WAITING') return '대기중';
    if (ls === 'PLAYING') return '게임중';
    if (ls === 'FULL') return '정원마감';
    // listStatus 없을 경우 status로 fallback
    if (room.status === 'WAITING') return '대기중';
    return '게임중';
  }

  function isJoinable(room) {
    if (room.listStatus) return room.listStatus === 'WAITING';
    return room.status === 'WAITING' && room.currentPlayers < room.maxPlayers;
  }

  function handleJoinByCode(event) {
    event.preventDefault();
    const roomCode = inviteCode.trim();
    if (!/^\d{6}$/.test(roomCode)) return;

    onJoinByCode?.(roomCode, { nickname: nickname.trim() });
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
              <button className="smallButton" type="button" onClick={() => onSelectRoom(room)} disabled={loading || !isJoinable(room)}>
                입장
              </button>
            </div>
          ))
        )}
      </div>
      <form className="joinByCodeForm" onSubmit={handleJoinByCode}>
        <div>
          <p className="eyebrow">Private Room</p>
          <h3>초대 코드로 입장</h3>
        </div>
        <div className="joinByCodeFields">
          <label>
            초대 코드
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              placeholder="6자리 코드"
            />
          </label>
          <label>
            닉네임
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={16}
              required
              placeholder="표시할 이름"
            />
          </label>
          <button className="primaryButton" type="submit" disabled={loading}>
            코드로 입장
          </button>
        </div>
      </form>
    </section>
  );
}
