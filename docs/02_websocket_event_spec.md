# WebSocket 이벤트 명세서

---

# 1. 기본 연결 정보

| 항목               | 값                      | 설명                          |
| ------------------ | ----------------------- | ----------------------------- |
| WebSocket Endpoint | `/ws`                   | WebSocket 연결 주소           |
| Publish Prefix     | `/pub`                  | 클라이언트 → 서버 메시지 전송 |
| Subscribe Prefix   | `/sub`                  | 서버 → 클라이언트 메시지 전송 |
| 방 구독 경로       | `/sub/rooms/{roomCode}` | 특정 방 이벤트 수신           |
| 개인 구독 경로     | `/sub/users/{playerId}` | 특정 유저 개인 이벤트 수신    |

---

# 2. 이벤트 타입 정의

| 이벤트 타입  | 설명             |
| ------------ | ---------------- |
| PLAYER_JOIN  | 플레이어 입장    |
| PLAYER_LEAVE | 플레이어 퇴장    |
| HOST_CHANGED | 방장 변경        |
| ROOM_UPDATED | 방 정보 변경     |
| GAME_START   | 게임 시작        |
| TURN_CHANGED | 현재 발언자 변경 |
| PLAYER_SPEAK | 플레이어 발언    |
| VOTING_START | 투표 시작        |
| VOTE_SUBMIT  | 투표 제출        |
| GAME_RESULT  | 게임 결과        |
| ERROR        | 에러 메시지      |

---

# 3. Publish 이벤트 명세

클라이언트가 서버로 메시지를 보내는 이벤트.

| 이벤트 이름        | Destination                   | Request Data           | 설명                       |
| ------------------ | ----------------------------- | ---------------------- | -------------------------- |
| 게임 시작          | `/pub/rooms/{roomCode}/start` | playerId               | 방장이 게임 시작 요청      |
| 발언 제출          | `/pub/rooms/{roomCode}/speak` | playerId, content      | 현재 턴 플레이어 발언 제출 |
| 투표 제출          | `/pub/rooms/{roomCode}/vote`  | voterId, targetId      | 플레이어 투표 제출         |
| 다음 라운드 확인   | `/pub/rooms/{roomCode}/next-round` | playerId         | 다음 라운드 확인 및 진입   |
| 라이어 제시어 추측 | `/pub/rooms/{roomCode}/guess` | playerId, guessedTopic | 라이어 제시어 추측         |

---

# 4. Subscribe 이벤트 명세

서버가 클라이언트에게 브로드캐스트하는 이벤트.

| 이벤트 타입  | Subscribe Path          | Response Data       | 설명                  |
| ------------ | ----------------------- | ------------------- | --------------------- |
| PLAYER_JOIN  | `/sub/rooms/{roomCode}` | playerId, nickname  | 새로운 플레이어 입장  |
| PLAYER_LEAVE | `/sub/rooms/{roomCode}` | playerId            | 플레이어 퇴장         |
| HOST_CHANGED | `/sub/rooms/{roomCode}` | hostId              | 방장 변경             |
| ROOM_UPDATED | `/sub/rooms/{roomCode}` | room 정보           | 방 설정 변경          |
| GAME_START   | `/sub/rooms/{roomCode}` | gameStart 정보      | 게임 시작             |
| TURN_CHANGED | `/sub/rooms/{roomCode}` | currentTurnPlayerId | 현재 턴 변경          |
| PLAYER_SPEAK | `/sub/rooms/{roomCode}` | nickname, content   | 플레이어 발언         |
| VOTING_START | `/sub/rooms/{roomCode}` | voteTimeLimit       | 투표 시작             |
| VOTE_SUBMIT  | `/sub/rooms/{roomCode}` | votedPlayerCount    | 현재 투표 진행 상황   |
| GAME_RESULT  | `/sub/rooms/{roomCode}` | liar, winner, topic | 게임 결과             |
| ERROR        | `/sub/users/{playerId}` | message             | 특정 유저 에러 메시지 |

---

# 5. 이벤트 흐름 요약

| 단계      | 클라이언트 동작       | 서버 처리    | 브로드캐스트 |
| --------- | --------------------- | ------------ | ------------ |
| 방 입장   | REST API 요청         | 방 참가 처리 | PLAYER_JOIN  |
| 게임 시작 | `/pub/.../start` 전송 | 게임 생성    | GAME_START   |
| 발언      | `/pub/.../speak` 전송 | 발언 저장    | PLAYER_SPEAK |
| 턴 변경   | 서버 내부 처리        | 다음 턴 계산 | TURN_CHANGED |
| 투표 시작 | 서버 내부 처리        | 상태 변경    | VOTING_START |
| 투표 제출 | `/pub/.../vote` 전송  | 투표 저장    | VOTE_SUBMIT  |
| 결과 계산 | 서버 내부 처리        | 승패 계산    | VOTE_RESULT (GAME_RESULT)|
| 다음 라운드 확인 | `/pub/.../next-round` 전송 | 다음 라운드 셋업 | TURN_CHANGED / SPEECH |

---

# 5-2. 투표 결과 확인 및 다음 라운드 진입 흐름
1. **투표 결과 공개**: 서버에서 투표 완료 후 `VOTE_RESULT` 이벤트를 브로드캐스트하여 클라이언트 화면에 투표 결과 화면이 표시됩니다.
2. **사용자 확인**: 플레이어가 결과 화면에서 "다음 라운드 확인" 버튼을 클릭합니다.
3. **이벤트 발행**: 클라이언트는 `/pub/rooms/{roomCode}/next-round` 경로로 자신의 `playerId`가 담긴 JSON 페이로드를 발행합니다.
4. **턴 변경 및 진행**: 서버는 모든 활성 플레이어의 `next-round` 수신 후 다음 라운드를 셋업하고 `TURN_CHANGED` 이벤트를 브로드캐스트하여 클라이언트를 다시 `SPEECH` 단계로 전환시킵니다.

---

# 6. 핵심 구조 정리

| 구분      | 역할                        |
| --------- | --------------------------- |
| REST API  | 요청/응답 기반 처리         |
| WebSocket | 실시간 이벤트 동기화        |
| `/pub`    | 클라이언트 → 서버           |
| `/sub`    | 서버 → 클라이언트           |
| Broadcast | 서버가 모든 구독자에게 전송 |
