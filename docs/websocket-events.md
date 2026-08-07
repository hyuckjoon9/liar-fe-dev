# WebSocket/STOMP 계약

이 문서는 프론트엔드 클라이언트(`src/ws/stompClient.js` 및 `src/App.jsx`)가 백엔드 서버와 처리하는 STOMP WebSocket 연결, 구독/발행 Destination 명세, 이벤트 메시지 구조 및 세션 대체 이벤트를 정의한다. 백엔드 원본은 [be_docs/websocket-events.md](be_docs/websocket-events.md)를 참조한다.

## 연결 설정 및 CONNECT 헤더

- **WebSocket Endpoint**: `/ws`
- **Application Destination Prefix**: `/pub`, `/app`
- **Broker Destination Prefix**: `/sub`

STOMP `CONNECT` 프레임 전송 시 다음 native header를 필수 전달한다. 세 헤더를 모두 생략하면 익명 로비 연결이 되며 `/sub/rooms`만 구독할 수 있다.

| Header | 설명 |
| --- | --- |
| `roomCode` | 6자리 방 코드 |
| `playerId` | 공개 플레이어 식별자 |
| `playerSecret` | 방 생성/입장 시 발급된 비밀키 |

## 클라이언트 Publish 명세

| 기능 | Destination | Payload |
| --- | --- | --- |
| 게임 시작 | `/pub/rooms/{roomCode}/start` | `{ playerId, playerSecret }` |
| 발언 제출 | `/pub/rooms/{roomCode}/speak` | `{ playerId, playerSecret, content }` |
| 턴 넘기기 | `/pub/rooms/{roomCode}/skip` | `{ playerId, playerSecret }` |
| 일반 투표 | `/pub/game/vote` | `{ roomCode, voterId, playerSecret, targetPlayerId }` |
| 최종 판결 | `/pub/game/final-vote` | `{ roomCode, voterId, playerSecret, decision: "KILL" | "SAVE" }` |

다음 라운드 전환은 서버가 `VOTE_RESULT` 후 4초 자동 예약한다. 클라이언트는 별도 명령을 보내지 않는다.

## 구독 및 이벤트 명세

### 1. 전체 방 목록 구독 (`/sub/rooms`)

공개방만 발행된다. 비공개방은 어떤 생명주기 변경도 이 채널에 발행하지 않는다.

| 이벤트 | `data` | 발행 시점 |
| --- | --- | --- |
| `ROOM_CREATED` | `RoomSummaryResponse` | 공개방 생성 |
| `ROOM_UPDATED` | `RoomSummaryResponse` | 공개방 입장·퇴장·게임 시작·종료 |
| `ROOM_DELETED` | `LeaveRoomResponse` | 마지막 플레이어 퇴장 |

### 2. 방 구독 (`/sub/rooms/{roomCode}`)

| 이벤트 | 주요 `data` 필드 | 설명 |
| --- | --- | --- |
| `PLAYER_JOIN` | `playerId`, `nickname`, `status` | 플레이어 입장 |
| `PLAYER_LEAVE` | `playerId`, `nickname`, `status` | 플레이어 퇴장 |
| `HOST_CHANGED` | `newHostId`, `roomDeleted` | 방장 변경 |
| `ROOM_UPDATED` | `RoomResponse` | 방 설정 변경 |
| `GAME_START` | `categoryId`, `turnOrder`, `currentTurnIndex`, `currentTurnPlayerId`, `players`, `startedAt` | 게임 시작 |
| `TURN_CHANGED` | `currentTurnIndex`, `currentTurnPlayerId` | 턴 변경 |
| `PLAYER_SPOKEN` | `playerId`, `nickname`, `content`, `spokenAt` | 발언 저장 |
| `VOTE_STARTED` | `phase`, `alivePlayers`, `votedCount`, `totalCount` | 투표 시작 (`alivePlayers`: 전체 생존자) |
| `FINAL_DEFENSE_STARTED` | `candidatePlayerId`, `durationSeconds`, `deadlineAt` | 최후 변론 시작 |
| `FINAL_VOTE_STARTED` | `candidatePlayerId`, `durationSeconds`, `deadlineAt` | 최종 판결 시작 |
| `PLAYER_VOTED` | `voterId`, `votedCount`, `totalCount` | 투표 현황 갱신 |
| `VOTE_RESULT` | `mostVotedPlayerId`, `eliminated`, `tied`, `alivePlayers`, `deadPlayers`, ... | 투표 결과 |
| `GAME_OVER` | `winner`, `reason`, `liarPlayerId`, `liarPlayerNickname` | 게임 종료 |
| `SESSION_REPLACED` | `replacedSessionId`, `graceSeconds` | 동일 ID 타 탭 접속 |

`VOTE_STARTED.alivePlayers`는 전체 생존자 목록이다. 개인 REST `voteCandidates`(본인·사망자 제외)와 의미가 다르다.

### 3. 개인 구독 (`/sub/users/{playerId}`)

| 이벤트 | `data` | 설명 |
| --- | --- | --- |
| `ROLE_ASSIGNED` | `role`, `topicWord` | 역할 배정 (라이어의 `topicWord`는 null) |
| `ERROR` | null | 오류 메시지는 공통 `message` 필드 |

## 세션 대체 처리

같은 `playerId`로 다른 탭이 새 연결을 맺으면 이전 탭의 방 구독으로 `SESSION_REPLACED`가 발행된다. 프론트엔드는 세션 대체 안내 모달을 표시하고 명령 발행을 비활성화한다. 이전 탭은 `graceSeconds`(현재 5초) 안에 연결을 종료해야 한다.
