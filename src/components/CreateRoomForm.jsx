import { useState } from 'react';

export default function CreateRoomForm({ onCreate, loading }) {
  const [nickname, setNickname] = useState('');
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);

  function submit(event) {
    event.preventDefault();
    onCreate({
      nickname: nickname.trim(),
      password: passwordEnabled ? password : '',
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
        <label className="checkRow">
          <input
            type="checkbox"
            checked={passwordEnabled}
            onChange={(e) => setPasswordEnabled(e.target.checked)}
          />
          비밀번호 사용
        </label>
        {passwordEnabled && (
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={20}
            />
          </label>
        )}
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
