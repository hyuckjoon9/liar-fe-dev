# REST API 계약

현재 코드가 제공하는 HTTP endpoint, header, 요청·응답 필드와 애플리케이션 오류를 정의한다. 게임 규칙은 [게임 규칙과 상태 전이](game-flow.md), 실시간 계약은 [WebSocket/STOMP 계약](websocket-events.md)을 참조한다.

기본 경로는 `/api/rooms`이며 JSON을 사용한다.

## 공통 응답

성공과 애플리케이션 오류는 `ApiResponse` 형식을 사용한다.

```json
{
  "success": true,
  "data": {},
  "message": "요청 성공"
}
```

```json
{
  "success": false,
  "data": null,
  "message": "에러 메시지"
}
```

## REST 오류

| HTTP 상태 | 코드에서 사용하는 조건 |
| --- | --- |
| `400 Bad Request` | 잘못된 최대 인원·공개 범위, 정원 초과, 대기 상태가 아닌 방 입장, 방에 없는 playerId |
| `403 Forbidden` | 방장이 아닌 설정 변경, 개인 상태 조회·방 설정 변경·퇴장의 secret 누락·불일치 |
| `404 Not Found` | 존재하지 않는 roomCode |
| `429 Too Many Requests` | 같은 IP에서 존재하지 않는 초대 코드를 1분에 11회 이상 입장 요청 |

`GlobalExceptionHandler`는 `LiarGameException`을 해당 상태의 공통 오류 응답으로 변환한다. JSON 역직렬화 실패는 `400 Bad Request`와 `잘못된 요청입니다.` 메시지로, 그 밖의 처리되지 않은 예외는 상세 원인을 노출하지 않는 `500 Internal Server Error` 공통 응답으로 변환한다.

## 방 목록 조회

`GET /api/rooms`

공개방만 `data` 배열에 포함한다. `listStatus`로 대기중·게임중·정원 마감을 구분한다. 비공개방은 6자리 `roomCode`로 직접 조회·입장할 수 있지만 목록에는 포함하지 않는다.

| `RoomSummaryResponse` 필드 | 타입 | 설명 |
| --- | --- | --- |
| `roomCode` | string | 6자리 방 코드 |
| `currentPlayers` | number | 현재 플레이어 수 |
| `maxPlayers` | number | 최대 인원 |
| `title` | string | 방장 표시 닉네임 기반의 `닉네임님의 방` |
| `visibility` | string | `PUBLIC` 또는 `PRIVATE` |
| `status` | string | `WAITING`, `PLAYING`, `VOTING`; 목록 UI에서는 `PLAYING`과 `VOTING`을 모두 게임중으로 표시 |
| `listStatus` | string | `WAITING`, `PLAYING`, `FULL`; `FULL`은 대기 방의 정원이 찬 경우 |

## 방 생성

`POST /api/rooms`

성공 상태는 `201 Created`다.

요청:

| 필드 | 타입 | 검증 |
| --- | --- | --- |
| `nickname` | string 또는 null | 앞뒤 공백 제거 후 0000~9999 임의의 4자리 번호를 붙인다. null·공백이면 `게스트#1234` 형식이다. 같은 표시 닉네임은 서버에 남아 있는 전체 플레이어에서 유일하다. |
| `maxPlayers` | number | 3 이상 8 이하 |
| `visibility` | string 또는 null | `PUBLIC` 또는 `PRIVATE`; 생략하면 `PUBLIC` |

응답 `data`는 `RoomEnterResponse`다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `roomCode` | string | 생성된 방 코드 |
| `playerId` | string | 공개 플레이어 식별자 |
| `playerSecret` | string | 본인 인증과 개인 game-state 조회에 사용하는 비밀값 |
| `host` | boolean | 생성자는 `true` |

새 방의 게임 설정은 `categoryId=RANDOM`, `timePreset=STANDARD`, `speechTimeLimit=30`, `voteTimeLimit=30`으로 초기화된다.

## 방 입장

`POST /api/rooms/{roomCode}/join`

요청:

| 필드 | 타입 | 검증 |
| --- | --- | --- |
| `nickname` | string 또는 null | 생성과 같이 임의의 4자리 번호가 붙는다. null·공백이면 `게스트#1234` 형식이다. |

방 상태가 `WAITING`이고 현재 인원이 최대 인원보다 적을 때만 입장할 수 있다. 비공개방은 `roomCode`를 초대 코드로 사용하며, 이를 아는 사람은 정원까지 반복 입장할 수 있다. 존재하지 않는 코드의 요청은 IP별 1분 10회까지 허용하며, 초과하면 `429`와 `입장 코드 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.`를 반환한다. 응답은 방 생성과 같은 `RoomEnterResponse`이며 `host`는 `false`다.

## 방 상세 조회

`GET /api/rooms/{roomCode}`

응답 `data`는 `RoomResponse`다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `roomCode` | string | 방 코드 |
| `title` | string | 자동 생성된 방 제목 |
| `visibility` | string | `PUBLIC` 또는 `PRIVATE` |
| `hostId` | string | 현재 방장 playerId |
| `players` | `PlayerResponse[]` | 생존·사망을 포함한 방의 전체 플레이어 |
| `status` | string | `WAITING`, `PLAYING`, `VOTING` |
| `maxPlayers` | number | 최대 인원 |
| `createdAt` | datetime | 방 생성 시각 |
| `game` | `GameSnapshotResponse` 또는 null | 진행 중 게임 스냅샷 |
| `lastGameResult` | `GameOverResponse` 또는 null | 마지막 종료 결과; 다음 게임 시작 또는 방 삭제 전까지 유지 |

`PlayerResponse`:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `playerId` | string | 공개 식별자 |
| `nickname` | string | 표시 이름 |
| `host` | boolean | 방장 여부 |
| `connected` | boolean | 도메인에 저장된 연결 상태 |
| `joinedOrder` | number | 입장 순서 |
| `status` | string | `ALIVE` 또는 `DEAD` |

`GameSnapshotResponse`:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `phase` | string | `SPEECH`, `VOTE`, `FINAL_DEFENSE`, `FINAL_VOTE`, `VOTE_RESULT`, `GAME_OVER` |
| `turnOrder` | `string[]` | playerId 기반 발언 순서 |
| `currentTurnIndex` | number | 현재 턴 인덱스 |
| `currentTurnPlayerId` | string 또는 null | `SPEECH`이고 인덱스가 유효할 때만 반환 |
| `voteResult` | `VoteResultSnapshot` 또는 null | `VOTE_RESULT`일 때만 마지막 결과 반환 |
| `finalCandidateId` | string 또는 null | `FINAL_DEFENSE`·`FINAL_VOTE` 단계의 판결 후보 playerId |
| `finalDeadlineAt` | datetime 또는 null | `FINAL_DEFENSE`·`FINAL_VOTE` 단계의 서버 권위 최종 판결 마감 시각 |

`VoteResultSnapshot`:

| 필드 | 타입 |
| --- | --- |
| `mostVotedPlayerId` | string 또는 null |
| `mostVotedPlayerNickname` | string 또는 null |
| `liarFound` | boolean |
| `eliminated` | boolean |
| `eliminatedPlayerId` | string 또는 null |
| `eliminatedPlayerNickname` | string 또는 null |
| `voteCounts` | playerId별 득표 수 map |
| `liarEliminated` | boolean |
| `nextRoundAvailable` | boolean |
| `gameOver` | boolean |
| `tied` | boolean |

공개 응답에는 `playerSecret`, 역할, 제시어, `liarId`가 포함되지 않는다.

## 개인 게임 상태 조회

`GET /api/rooms/{roomCode}/players/{playerId}/game-state`

요청 header:

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `X-Player-Secret` | 예 | 방 생성·입장 응답에서 받은 해당 플레이어의 secret |

응답 `data`는 `PlayerGameStateResponse`다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `playerId` | string | 조회한 본인 식별자 |
| `phase` | string 또는 null | 진행 중 게임 단계 |
| `currentTurnIndex` | number | 게임이 없으면 `0` |
| `currentTurnPlayerId` | string 또는 null | `SPEECH` 단계의 현재 발언자 |
| `players` | `PlayerResponse[]` | 방의 전체 플레이어 |
| `playerStatus` | string | 본인의 `ALIVE` 또는 `DEAD` |
| `voteResult` | `VoteResultSnapshot` 또는 null | `VOTE_RESULT`일 때만 반환 |
| `role` | string 또는 null | `CITIZEN`, `LIAR`; 게임이 없으면 null |
| `topicWord` | string 또는 null | 시민에게만 반환 |
| `hasVoted` | boolean | `VOTE` 단계에서 본인의 투표 저장 여부 |
| `canVote` | boolean | `VOTE` 단계의 생존자이며 아직 투표하지 않았는지 여부 |
| `votedCount` | number | 저장된 투표 수 |
| `totalVoterCount` | number | 현재 생존 플레이어 수 |
| `voteCandidates` | `PlayerResponse[]` | 본인과 사망자를 제외한 생존 후보 |
| `speechLogs` | `PlayerSpokenResponse[]` | 현재 게임에 누적된 전체 발언 |
| `finalCandidateId` | string 또는 null | `FINAL_DEFENSE`·`FINAL_VOTE` 단계의 판결 후보 playerId |
| `finalDeadlineAt` | datetime 또는 null | `FINAL_DEFENSE`·`FINAL_VOTE` 단계의 서버 권위 최종 판결 마감 시각 |
| `hasFinalVoted` | boolean | `FINAL_VOTE` 단계에서 본인의 판결 표 저장 여부 |
| `canFinalVote` | boolean | `FINAL_VOTE` 단계의 생존 후보 제외 플레이어이며 아직 표를 내지 않았는지 여부 |

`PlayerSpokenResponse`는 `playerId`, `nickname`, `content`, `spokenAt`을 포함한다. 라운드 번호나 별도 발언 ID는 없다.

## 방 설정 변경

`PATCH /api/rooms/{roomCode}/settings`

요청 header:

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `X-Player-Secret` | 예 | request의 `playerId`에 해당하는 플레이어가 입장 때 받은 secret |

요청:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `playerId` | string | 방장 playerId |
| `categoryId` | string | `FOOD`, `ANIMAL`, `PLACE`, `JOB`, `COUNTRY`, `RANDOM` 중 하나 |
| `timePreset` | string | `FAST`(발언 15초/투표 20초), `STANDARD`(30초/30초), `RELAXED`(45초/45초) 중 하나 |

요청자 secret이 일치하고 요청자가 방장이며 방 상태가 `WAITING`일 때만 변경한다. `PLAYING`, `VOTING`에서는 HTTP 400으로 거부하고 기존 설정을 유지한다. 잘못된 JSON이나 요청 필드도 HTTP 400과 공통 `ApiResponse` 오류 형식으로 반환하며, 처리되지 않은 서버 오류는 상세 원인을 노출하지 않는 HTTP 500 공통 오류 응답으로 반환한다.

응답 `RoomSettingsResponse`는 `categoryId`, `timePreset`, `speechTimeLimit`, `voteTimeLimit`을 포함한다. 초 단위는 서버가 프리셋에서 결정한다.

## 방 퇴장

`POST /api/rooms/{roomCode}/leave`

요청은 `playerId`를 포함한다. 해당 플레이어가 방에 있고 request의 `playerId`에 해당하는 `X-Player-Secret` header가 일치해야 한다.

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `X-Player-Secret` | 예 | request의 `playerId`에 해당하는 플레이어가 입장 때 받은 secret |

응답 `LeaveRoomResponse`:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `newHostId` | string 또는 null | 남은 방의 방장, 방 삭제 시 null |
| `roomDeleted` | boolean | 마지막 플레이어 퇴장으로 방이 삭제됐는지 여부 |

퇴장이 게임 상태에 미치는 영향은 [게임 흐름](game-flow.md)에서 설명한다.
