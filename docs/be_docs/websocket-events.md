# WebSocket/STOMP 계약

현재 코드가 수신하고 발행하는 STOMP destination, 명령 payload, 구독 경로와 이벤트 payload를 정의한다. 상태 전이 규칙은 [게임 규칙과 상태 전이](game-flow.md), REST 복원 계약은 [REST API 계약](rest-api.md)을 참조한다.

## 연결 설정

| 항목 | 값 |
| --- | --- |
| WebSocket endpoint | `/ws` |
| 애플리케이션 destination prefix | `/pub`, `/app` |
| simple broker prefix | `/sub` |
| 허용 origin | `http://localhost:5173` |
| SockJS | 설정하지 않음 |

방 참가자 STOMP `CONNECT`에는 다음 native header가 모두 필요하다. 서버는 이 값으로 플레이어를 인증하고 playerId별 활성 session을 등록한다. 헤더를 모두 생략하면 익명 로비 연결이 되며 `/sub/rooms`만 구독할 수 있다.

| header | 값 |
| --- | --- |
| `roomCode` | 접속할 방 코드 |
| `playerId` | 공개 플레이어 식별자 |
| `playerSecret` | 방 생성·입장 시 발급된 secret |

같은 playerId가 새 session으로 `CONNECT`하면 새 session만 활성이다. 이전 session의 `/pub` 및 `/app` 명령은 controller에 도달하기 전에 무시된다. 각 명령은 여전히 payload의 `playerId` 또는 `voterId`와 같은 payload의 `playerSecret`을 함께 사용하며, 서버는 해당 공개 ID로 찾은 플레이어의 secret이 일치할 때만 상태를 변경한다.

익명 로비 연결의 `/pub`·`/app` 명령과 방별·개인 구독은 거부된다. 참가자 세션은 `/sub/rooms`, 자신의 `/sub/rooms/{roomCode}`, 자신의 `/sub/users/{playerId}`만 구독할 수 있다.

## 공통 이벤트 형식

모든 서버 이벤트는 `WebSocketMessage<T>` 형식이다.

```json
{
  "type": "EVENT_TYPE",
  "roomCode": "123456",
  "data": {},
  "message": "메시지"
}
```

## 클라이언트 publish

아래 표는 `/pub` prefix를 사용한 실제 destination이다. `/app`도 애플리케이션 prefix로 설정되어 있어 같은 `@MessageMapping`에 도달할 수 있다.

| 동작 | destination | payload |
| --- | --- | --- |
| 게임 시작 | `/pub/rooms/{roomCode}/start` | `{ "playerId": string, "playerSecret": string }` |
| 발언 | `/pub/rooms/{roomCode}/speak` | `{ "playerId": string, "playerSecret": string, "content": string }` |
| 턴 넘기기 | `/pub/rooms/{roomCode}/skip` | `{ "playerId": string, "playerSecret": string }` |
| 투표 | `/pub/game/vote` | `{ "roomCode": string, "voterId": string, "playerSecret": string, "targetPlayerId": string }` |
| 최종 판결 | `/pub/game/final-vote` | `{ "roomCode": string, "voterId": string, "playerSecret": string, "decision": "KILL" 또는 "SAVE" }` |

요청 객체 또는 요청자 식별자가 비어 있는 시작·발언·투표 명령은 `ERROR` 없이 반환될 수 있다. 요청자 ID가 있고 secret이 누락하거나 일치하지 않으면 상태를 변경하지 않고 해당 개인 구독으로 `ERROR`를 발행한다. 그 밖의 서비스 검증 오류도 요청 payload의 플레이어 식별자에 해당하는 개인 구독으로 전달한다.

## 전체 방 목록 구독

구독: `/sub/rooms`

| 이벤트 | `data` | 발행 시점 |
| --- | --- | --- |
| `ROOM_CREATED` | `RoomSummaryResponse` | 방 생성 |
| `ROOM_UPDATED` | `RoomSummaryResponse` | 입장, 퇴장, 게임 시작, 게임 종료 |
| `ROOM_DELETED` | `LeaveRoomResponse` | 마지막 플레이어 퇴장 |

`ROOM_CREATED`와 `ROOM_UPDATED`의 `data`는 REST 방 목록과 같은 `RoomSummaryResponse`다. 공개방만 목록 구독으로 발행된다. 비공개방은 생성·입장·퇴장·삭제·게임 시작·게임 종료 어떤 생명주기 변경도 `/sub/rooms`에 발행하지 않는다. UI는 `data.listStatus`의 `WAITING`, `PLAYING`, `FULL`로 대기중·게임중·정원 마감을 표시한다. 게임중 방은 입장 대상이 아니다.

## 방 구독

구독: `/sub/rooms/{roomCode}`

| 이벤트 | `data` 필드 | 발행 시점 |
| --- | --- | --- |
| `PLAYER_JOIN` | `playerId`, `nickname`, `status` | 플레이어 입장 |
| `PLAYER_LEAVE` | `playerId`, `nickname`, `status` | 플레이어 퇴장 |
| `HOST_CHANGED` | `newHostId`, `roomDeleted` | 방장 퇴장 후 변경 |
| `ROOM_UPDATED` | `RoomResponse` | 방 설정 변경 |
| `GAME_START` | `categoryId`, `turnOrder`, `currentTurnIndex`, `currentTurnPlayerId`, `players`, `startedAt` | 게임 시작 |
| `TURN_CHANGED` | `currentTurnIndex`, `currentTurnPlayerId` | 시작, 발언 진행, 다음 라운드, 퇴장 후 턴 변경 |
| `PLAYER_SPOKEN` | `playerId`, `nickname`, `content`, `spokenAt` | 발언 저장 후 |
| `VOTE_STARTED` | `phase`, `alivePlayers`, `votedCount`, `totalCount` | 발언 종료 또는 현재 발언자 퇴장 후 투표 시작 |
| `FINAL_DEFENSE_STARTED` | `candidatePlayerId`, `durationSeconds`, `deadlineAt` | 단독 최다 득표 후보의 최후 변론 시작 |
| `FINAL_VOTE_STARTED` | `candidatePlayerId`, `durationSeconds`, `deadlineAt` | 최후 변론 후보의 발언 직후 또는 변론 시간 만료 후, 후보자를 제외한 생존자의 최종 판결 시작 |
| `PLAYER_VOTED` | `voterId`, `votedCount`, `totalCount` | 투표 저장 또는 투표 중 퇴장으로 현황 변경 |
| `VOTE_RESULT` | 아래 결과 필드 | 일반 투표 동점 또는 최종 판결 결과; 종료가 아니면 4초 뒤 자동 전환 |
| `GAME_OVER` | `winner`, `reason`, `liarPlayerId`, `liarPlayerNickname` | 종료 조건 충족 |
| `SESSION_REPLACED` | `replacedSessionId`, `graceSeconds` | 같은 playerId의 새 STOMP session이 연결됨 |

`GAME_START.players`와 `VOTE_STARTED.alivePlayers`의 각 항목은 `PlayerResponse`다. `alivePlayers`는 생존자 전체이며 특정 요청자 기준으로 본인을 제외하지 않는다. 개인 REST의 `voteCandidates`와 의미가 다르다. `FINAL_DEFENSE_STARTED.deadlineAt`과 `FINAL_VOTE_STARTED.deadlineAt`은 해당 단계의 서버 권위 마감 시각이며 REST `finalDeadlineAt`과 같은 값이다.

`VOTE_RESULT`:

| 필드 | 타입 |
| --- | --- |
| `mostVotedPlayerId` | string 또는 null |
| `mostVotedPlayerNickname` | string 또는 null |
| `liarFound` | boolean |
| `tied` | boolean |
| `eliminated` | boolean |
| `eliminatedPlayerId` | string 또는 null |
| `eliminatedPlayerNickname` | string 또는 null |
| `alivePlayers` | `PlayerResponse[]` |
| `deadPlayers` | `PlayerResponse[]` |
| `liarPlayerId` | null |
| `mostVotedPlayerRole` | null |
| `aliveLiars` | number |
| `aliveCitizens` | number |

일반 투표 동점이나 제출 표가 없는 시간 만료의 `VOTE_RESULT.message`는 "4초 후 다음 라운드가 시작됩니다."를 알린다. 제출 표가 없으면 후보 식별자는 `null`, `tied`는 `true`다. 최종 판결의 결과 이벤트는 `최종 판결 결과가 발표되었습니다.`를 사용하며, 게임이 종료되지 않은 경우에만 4초 뒤 `TURN_CHANGED`가 뒤따른다. 클라이언트는 별도 next-round 명령을 보내지 않는다.

`GAME_OVER.winner`는 `CITIZEN` 또는 `LIAR`이고 `reason`은 `LIAR_FOUND`, `LIAR_LEFT`, `LIAR_PARITY` 중 하나다.

`SESSION_REPLACED.data`는 이전 서버 STOMP sessionId를 `replacedSessionId`로, 이전 탭의 종료 유예를 초 단위로 `graceSeconds`로 제공한다. 현재 유예는 `5`다. 새 탭은 REST 방·개인 상태를 다시 조회해 복원하고, 이전 탭은 유예 안에 연결을 종료한다. 이전 session이 유예 중 연결되어 있어도 `/pub`와 `/app` 명령은 이미 거부된다.

## 개인 구독

구독: `/sub/users/{playerId}`

| 이벤트 | `data` | 설명 |
| --- | --- | --- |
| `ROLE_ASSIGNED` | `role`, `topicWord` | 역할 배정; 라이어의 `topicWord`는 null |
| `ERROR` | null | 오류 설명은 공통 `message` 필드에 포함 |

게임 명령 검증 오류는 HTTP 상태가 아니라 요청 플레이어의 개인 구독으로 전달한다.
