# REST API 명세서

---

# 1. HTTP 상태 코드

| 상태 코드                 | 의미        | 설명             |
| ------------------------- | ----------- | ---------------- |
| 200 OK                    | 요청 성공   | 정상 처리        |
| 201 Created               | 생성 성공   | 리소스 생성 성공 |
| 400 Bad Request           | 잘못된 요청 | 요청 값 오류     |
| 401 Unauthorized          | 인증 실패   | 인증 실패        |
| 403 Forbidden             | 권한 없음   | 방장만 가능      |
| 404 Not Found             | 리소스 없음 | 존재하지 않는 방 |
| 409 Conflict              | 충돌        | 닉네임 중복 등   |
| 500 Internal Server Error | 서버 오류   | 서버 내부 오류   |

---

# 2. 공통 응답 형식

## 성공 응답

```json id="yztz6p"
{
  "success": true,
  "data": {},
  "message": "요청 성공"
}
```

---

## 실패 응답

```json id="4zpw0d"
{
  "success": false,
  "data": null,
  "message": "에러 메시지"
}
```

---

# 3. Room API

| API 이름     | Method | URL                              | 설명                   | Request Body                                         | Response Data                                             | 성공 코드   | 실패 코드     |
| ------------ | ------ | -------------------------------- | ---------------------- | ---------------------------------------------------- | --------------------------------------------------------- | ----------- | ------------- |
| 방 목록 조회 | GET    | `/api/rooms`                     | 대기 중인 방 목록 조회 | 없음                                                 | roomCode, currentPlayers, maxPlayers, hasPassword, status | 200 OK      | -             |
| 방 생성      | POST   | `/api/rooms`                     | 새로운 방 생성         | nickname, password, maxPlayers                       | roomCode, playerId, host                                  | 201 Created | 400, 409      |
| 방 상세 조회 | GET    | `/api/rooms/{roomCode}`          | 특정 방 정보 조회      | 없음                                                 | room 정보, players 목록                                   | 200 OK      | 404           |
| 방 입장      | POST   | `/api/rooms/{roomCode}/join`     | 특정 방 입장           | nickname, password                                   | roomCode, playerId, host                                  | 200 OK      | 400, 404, 409 |
| 방 설정 변경 | PATCH  | `/api/rooms/{roomCode}/settings` | 게임 설정 변경         | playerId, categoryId, speechTimeLimit, voteTimeLimit | 설정 정보                                                 | 200 OK      | 403, 404      |
| 방 퇴장      | POST   | `/api/rooms/{roomCode}/leave`    | 방 퇴장                | playerId                                             | newHostId, roomDeleted                                    | 200 OK      | 404           |

---

# 4. Topic API

| API 이름      | Method | URL                     | 설명                      | Request Body | Response Data    | 성공 코드 | 실패 코드 |
| ------------- | ------ | ----------------------- | ------------------------- | ------------ | ---------------- | --------- | --------- |
| 카테고리 조회 | GET    | `/api/topic-categories` | 제시어 카테고리 목록 조회 | 없음         | categoryId, name | 200 OK    | -         |

---

# 5. 상태값 정의

## Room Status

| 상태값  | 의미         |
| ------- | ------------ |
| WAITING | 대기 중      |
| PLAYING | 게임 진행 중 |
| VOTING  | 투표 진행 중 |
| RESULT  | 결과 표시 중 |

---

# 6. 핵심 구조 정리

```text id="k0ck6w"
REST API
→ 요청/응답 기반 처리

WebSocket
→ 실시간 이벤트 처리
```

---

# 7. 프론트엔드 상태 복원 및 UI 활용 명세

## 새로고침 시 VOTE_RESULT 단계 복원
- 프론트엔드는 새로고침(F5) 발생 시 `GET /api/rooms/{roomCode}` API를 호출하여 최신 게임 상태를 로드합니다.
- 이때 응답 데이터의 `game.phase`가 `"VOTE_RESULT"` 이고 `game.voteResult` 객체가 존재할 경우, 프론트엔드는 이를 사용하여 투표 결과 화면을 강제 복원(`setVoteResult`)합니다.
- 만약 `phase`가 `"VOTE_RESULT"`가 아니라면, 이전 투표 결과가 화면에 유지되지 않도록 `voteResult` 상태를 `null`로 초기화합니다.

## 플레이어 생존 상태(status) 렌더링
- `GET /api/rooms/{roomCode}` 응답 내 `players[]` 목록의 각 플레이어 객체는 `status` 필드를 가집니다.
- 프론트엔드는 이 `status` 필드의 값(`ALIVE` / `DEAD`)을 기준으로 각 플레이어의 생존 및 탈락(사망) 상태를 화면에 렌더링하고, 투표 화면 진입 시 투표 가능 여부(`canVote` 등)를 결정하는 기준으로 사용합니다.
