import { useState } from 'react';

export default function CreateRoomForm({ onCreate, loading }) {
  const [nickname, setNickname] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [maxPlayers, setMaxPlayers] = useState(6);

  function submit(event) {
    event.preventDefault();
    onCreate({
      nickname: nickname.trim(),
      visibility,
      maxPlayers: Number(maxPlayers),
    });
  }

  return (
    <section className="panel">
      <div className="panelHeader">
        <p className="eyebrow">Create Room</p>
        <h2>방 만들기</h2>
      </div>
      <form className="form" onSubmit={submit}>
        <label>
          닉네임
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={16} />
        </label>
        <label>
          공개 범위
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="PUBLIC">공개방</option>
            <option value="PRIVATE">비공개방 (초대 코드)</option>
          </select>
        </label>
        <label>
          최대 인원
          <select value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)}>
            {[3, 4, 5, 6, 7, 8].map((count) => (
              <option key={count} value={count}>
                {count}명
              </option>
            ))}
          </select>
        </label>
        <button className="primaryButton" type="submit" disabled={loading}>
          방 생성
        </button>
      </form>
    </section>
  );
}
