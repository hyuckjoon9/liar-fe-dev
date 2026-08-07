import { useState, useEffect, useRef } from 'react';

export default function JoinRoomModal({ room, onClose, onJoin, loading }) {
  const [nickname, setNickname] = useState('');
  const nicknameInputRef = useRef(null);

  useEffect(() => {
    if (room) {
      if (nicknameInputRef.current) {
        nicknameInputRef.current.focus();
      }
    }
  }, [room]);

  if (!room) return null;

  function submit(event) {
    event.preventDefault();
    onJoin(room.roomCode, { nickname: nickname.trim() });
  }

  return (
    <div className="modalBackdrop">
      <section className="modal">
        <div className="panelHeader">
          <p className="eyebrow">Join Room</p>
          <h2>{room.roomCode}번 방 입장</h2>
        </div>
        <form className="form" onSubmit={submit}>
          <label>
            닉네임
            <input
              ref={nicknameInputRef}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              maxLength={16}
            />
          </label>
          <div className="modalActions">
            <button type="button" className="ghostButton" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="primaryButton" disabled={loading}>
              입장
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
