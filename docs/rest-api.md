# REST API 계약

이 문서는 프론트엔드 클라이언트(`src/api/rooms.js`)가 백엔드 서버와 통신하는 REST API 계약을 정의한다. 백엔드 원본은 [be_docs/rest-api.md](be_docs/rest-api.md)를 참조한다.

## 공통 응답 형식

백엔드의 모든 REST 응답은 `ApiResponse` 공통 포맷을 사용하며, `src/api/rooms.js`의 `request()` 유틸리티가 `data` 영역을 추출하여 반환한다.

```json
{ "success": true, "data": {}, "message": "요청 성공" }
```

```json
{ "success": false, "data": null, "message": "오류 메시지" }
```

## Endpoint 명세

| 기능 | Method | URL | 함수 | 필수 Body / Header | 응답 |
| --- | --- | --- | --- | --- | --- |
| 방 목록 | `GET` | `/api/rooms` | `getRooms()` | — | `RoomSummaryResponse[]` (공개방만) |
| 방 생성 | `POST` | `/api/rooms` | `createRoom()` | `{ nickname, visibility, maxPlayers }` | `RoomEnterResponse` |
| 방 입장 | `POST` | `/api/rooms/{code}/join` | `joinRoom()` | `{ nickname }` | `RoomEnterResponse` |
| 방 상세 | `GET` | `/api/rooms/{code}` | `getRoom()` | — | `RoomResponse` |
| 개인 상태 | `GET` | `/api/rooms/{code}/players/{id}/game-state` | `getPlayerGameState()` | `X-Player-Secret` | `PlayerGameStateResponse` |
| 방 설정 | `PATCH` | `/api/rooms/{code}/settings` | `updateRoomSettings()` | `X-Player-Secret` + `{ playerId, categoryId, timePreset }` | `RoomSettingsResponse` |
| 방 퇴장 | `POST` | `/api/rooms/{code}/leave` | `leaveRoom()` | `X-Player-Secret` + `{ playerId }` | `LeaveRoomResponse` |

### 방 목록 `RoomSummaryResponse` 필드

| 필드 | 설명 |
| --- | --- |
| `roomCode` | 6자리 방 코드 |
| `title` | 방 제목 (`닉네임님의 방`) |
| `currentPlayers` | 현재 인원 |
| `maxPlayers` | 최대 인원 |
| `visibility` | `PUBLIC` 또는 `PRIVATE` |
| `status` | `WAITING`, `PLAYING`, `VOTING` |
| `listStatus` | `WAITING`, `PLAYING`, `FULL` (목록 UI용) |

### 방 상세 `RoomResponse` 종료 결과

`currentGame`이 제거되어 방이 `WAITING` 상태가 된 뒤에도 `lastGameResult`가 남을 수 있다. 프론트는 이 값을 `GAME_OVER` 모달 복원에 사용한다.

### 방 생성/입장 `RoomEnterResponse` 필드

| 필드 | 설명 |
| --- | --- |
| `roomCode` | 방 코드 |
| `playerId` | 공개 플레이어 식별자 |
| `playerSecret` | 본인 인증 비밀키 |
| `host` | 방장 여부 (`boolean`) |

- `visibility`는 `PUBLIC` 또는 `PRIVATE`. 생략하면 `PUBLIC`.
- 비공개방은 `roomCode`(6자리)가 초대 코드가 된다. 입장 시 닉네임만 필요하다.

### 개인 상태 `PlayerGameStateResponse` 주요 필드

| 필드 | 설명 |
| --- | --- |
| `role` | `CITIZEN`, `LIAR`, 또는 null |
| `topicWord` | 시민에게만 반환 |
| `hasVoted` | 투표 완료 여부 |
| `canVote` | 투표 가능 여부 |
| `votedCount` | 현재 완료 투표 수 |
| `totalVoterCount` | 총 투표 가능 인원 |
| `voteCandidates` | 본인·사망자 제외 투표 후보 (`PlayerResponse[]`) |
| `speechLogs` | 누적 발언 (`PlayerSpokenResponse[]`) |
| `finalCandidateId` | 최후 변론·최종 판결 단계의 후보 |
| `finalDeadlineAt` | 서버 권위 마감 시각 |
| `hasFinalVoted` | 최종 판결 표 제출 여부 |
| `canFinalVote` | 최종 판결 투표 가능 여부 |

## 인증 헤더 (`X-Player-Secret`)

방 생성/입장 성공 시 발급받은 `playerSecret`을 다음 요청의 `X-Player-Secret` 헤더에 전달한다.

- 개인 상태 조회: `getPlayerGameState(roomCode, playerId, playerSecret)`
- 방 설정 변경: `updateRoomSettings(roomCode, settings, playerSecret)`
- 방 퇴장: `leaveRoom(roomCode, playerId, playerSecret)`

## 새로고침 상태 복원

`App.jsx`의 `loadRoom()` 함수가 다음 순서로 복원한다.

1. `GET /api/rooms/{roomCode}`: 방 기본 정보, 전체 플레이어, 방 상태, 게임 스냅샷
2. `GET .../players/{playerId}/game-state`: 역할, 제시어, `voteCandidates`, `speechLogs`, 투표 상태

두 응답의 `players`를 병합하여 `DEAD` 상태 누락을 방지한다.

`FINAL_DEFENSE`·`FINAL_VOTE`에서는 방 스냅샷과 개인 상태의 `finalCandidateId`, `finalDeadlineAt`을 사용하고, 개인 상태의 `hasFinalVoted`, `canFinalVote`로 최종 판결 UI를 제어한다.
