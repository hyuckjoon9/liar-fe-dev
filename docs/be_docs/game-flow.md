# 게임 규칙과 상태 전이

이 문서는 코드에 구현된 게임 규칙을 설명한다. HTTP 필드는 [REST API 계약](rest-api.md), destination과 이벤트 payload는 [WebSocket/STOMP 계약](websocket-events.md)을 참조한다.

## 상태 모델

| 모델 | 값 | 의미 |
| --- | --- | --- |
| `RoomStatus` | `WAITING` | 입장과 게임 시작이 가능한 대기 상태 |
| `RoomStatus` | `PLAYING` | 발언 진행 중 |
| `RoomStatus` | `VOTING` | 투표 또는 투표 결과 확인 중 |
| `GamePhase` | `SPEECH` | 생존자 발언 차례 진행 |
| `GamePhase` | `VOTE` | 생존자 투표 접수 |
| `GamePhase` | `FINAL_DEFENSE` | 단독 최다 득표 후보자의 10초 최후 변론 |
| `GamePhase` | `FINAL_VOTE` | 후보자를 제외한 생존자의 10초 `KILL`·`SAVE` 판결 투표 |
| `GamePhase` | `VOTE_RESULT` | 동점 또는 최종 판결 뒤 다음 라운드 전환 대기 |
| `GamePhase` | `GAME_OVER` | 종료 이벤트 발행 직전에 잠시 설정 |
| `PlayerStatus` | `ALIVE`, `DEAD` | 현재 게임의 생존 여부 |

`RoomStatus`와 `GamePhase`는 별도 상태다. 예를 들어 투표 결과를 기다리는 동안 방은 `VOTING`, 게임은 `VOTE_RESULT`다.

방 목록에서는 `WAITING`을 대기중으로, `PLAYING`과 `VOTING`을 게임중으로 표시한다. `VOTING`은 게임 내부 진행을 위한 상태이며 목록에 별도로 노출하지 않는다.

```text
WAITING / no game
  └─ start ─> PLAYING / SPEECH
                 └─ all alive players speak or speech timeout ─> VOTING / VOTE
                        ├─ tied or vote timeout without a leader ─> VOTE_RESULT ─> 4초 후 SPEECH
                        └─ single leader ─> FINAL_DEFENSE (10초) ─> FINAL_VOTE (10초)
                               ├─ KILL 과반 ─> 탈락 후 승패 확인 또는 VOTE_RESULT
                               └─ SAVE·기권·과반 미달 ─> VOTE_RESULT ─> 4초 후 SPEECH
```

## 게임 시작

다음 조건을 모두 만족해야 한다.

- 요청자가 현재 방장이다.
- 플레이어가 3명 이상이다.
- 방 상태가 `WAITING`이다.

서버는 방장이 설정한 `FOOD`, `ANIMAL`, `PLACE`, `JOB`, `COUNTRY` 카테고리의 20개 내장 제시어 중 하나와 라이어 한 명을 무작위로 선택하고 발언 순서를 섞는다. `RANDOM`이면 시작 시 실제 카테고리를 무작위로 확정한다. 기존 플레이어를 모두 `ALIVE`로 초기화하고 역할을 다시 배정한다.

`GAME_START`는 확정된 `categoryId`를 전원에게 공개한 뒤 `TURN_CHANGED`, 각 플레이어의 `ROLE_ASSIGNED` 순서로 발행한다. 라이어의 `topicWord`는 `null`이다.

## 발언

- 방은 `PLAYING`, 게임은 `SPEECH`여야 한다.
- 방에 남아 있는 생존한 현재 차례 플레이어만 발언할 수 있다.
- 공백뿐인 내용은 거부하고, 앞뒤 공백을 제거해 저장한다.
- 플레이어는 한 라운드에 한 번만 발언할 수 있다.
- 발언 내용과 당시 nickname, 시각을 게임의 누적 발언 목록에 저장한다.
- 다음 발언자가 있으면 `TURN_CHANGED`, 모두 발언했으면 `VOTE_STARTED`를 발행한다.
- 설정된 발언 시간이 만료되거나 현재 발언자가 `/pub/rooms/{roomCode}/skip`을 보내면 `발언하지 않았음`을 같은 발언 로그 형식으로 저장하고 다음 턴 또는 투표로 진행한다.

다음 라운드로 넘어가도 누적 발언은 유지한다. 라운드 내 발언 여부만 초기화한다.

## 투표

- 게임은 `VOTE`여야 한다.
- 방에 남아 있는 생존자만 투표할 수 있다.
- 방에 남아 있는 다른 생존자에게만 투표할 수 있다.
- 자기 자신, 사망자, 존재하지 않는 플레이어는 대상이 될 수 없다.
- 플레이어당 한 번만 투표할 수 있다.
- 현재 생존자 전원이 투표하거나 설정된 투표 시간이 만료되면 제출된 표로 결과를 계산한다. 미제출자는 기권이다.

투표 시작 이벤트의 `alivePlayers`는 모든 생존자를 나타내며, 개인 상태 REST의 `voteCandidates`는 요청자 본인과 사망자를 제외한 후보만 나타낸다.

최다 득표자가 둘 이상인 동점이거나 제한 시간까지 제출된 표가 하나도 없으면 후보 없이 아무도 탈락하지 않는다. 서버는 빈 득표 결과의 `tied`도 `true`로 설정해 `VOTE_RESULT`를 발행하고 4초 후 다음 라운드를 자동 시작한다.

### 단독 최다 득표와 최종 판결

단독 최다 득표 후보자는 역할과 관계없이 즉시 탈락하지 않는다. 라이어가 후보여도 서버는 `FINAL_DEFENSE_STARTED`로 후보, 10초와 절대 마감 시각 `deadlineAt`을 알린 뒤 `FINAL_VOTE_STARTED`를 발행한다. 후보자를 제외한 생존자는 `/pub/game/final-vote`로 `KILL` 또는 `SAVE`를 한 번 제출할 수 있다.

최후 변론 중에는 생존한 후보자만 `deadlineAt` 전 `/pub/rooms/{roomCode}/speak`로 발언할 수 있다. 이 발언은 먼저 `PLAYER_SPOKEN`으로 누적 로그에 남고, 일반 라운드의 발언 횟수·현재 턴을 바꾸지 않은 채 즉시 `FINAL_VOTE_STARTED`로 전환한다. 발언이 없으면 10초 만료 시 같은 전환을 수행한다.

가능한 유권자 전원이 제출하거나 10초가 지나면 판결한다. 가능한 전체 유권자의 절반을 초과한 `KILL` 표가 있어야 후보자를 `DEAD`로 바꾼다. 서버는 항상 `VOTE_RESULT`로 판결 결과를 알린다. 탈락자가 라이어이면 시민 승리와 `LIAR_FOUND` 종료를 이어서 알리고, 그 밖에는 종료 조건이 아니면 4초 뒤 다음 라운드를 시작한다.

## 다음 라운드

`VOTE_RESULT`가 발생하고 `lastVoteResult.nextRoundAvailable`이 `true`이면 서버가 4초 뒤 자동 전환을 예약한다. 발언·일반 투표·최후 변론·최종 판결·다음 라운드의 모든 예약 작업은 생성 때 단조 증가 타이머 세대를 함께 저장한다. 실행 시 현재 게임 객체, 타이머 세대, 단계와 필요한 턴·후보 조건을 모두 다시 확인하므로, 이후 단계나 다음 라운드의 상태를 바꾸지 않는다.

전환 시 서버는 투표와 마지막 결과를 지우고, 생존자만 포함하도록 기존 발언 순서를 재구성한다. 누적 발언은 유지하고 현재 라운드 발언 여부를 초기화한 뒤 `SPEECH`로 바꾼다. 클라이언트는 `next-round` 명령을 보내지 않는다.

## 게임 종료

| 승자 | 이유 | 조건 |
| --- | --- | --- |
| `CITIZEN` | `LIAR_FOUND` | 최종 판결의 `KILL` 과반으로 라이어가 탈락함 |
| `CITIZEN` | `LIAR_LEFT` | 진행 중 라이어가 방에서 나감 |
| `LIAR` | `LIAR_PARITY` | 생존 라이어 수가 생존 시민 수 이상 |

서버는 `GAME_OVER`를 발행한 뒤 종료 결과를 방에 보관하고 `currentGame`을 제거하며 방을 `WAITING`으로 바꾼다. 방 상세 REST의 `lastGameResult`로 다음 게임 시작 또는 방 삭제 전까지 복원할 수 있다.

## 플레이어 퇴장

- 마지막 플레이어가 나가면 방을 삭제한다.
- 방장이 나가면 입장 순서가 가장 빠른 남은 플레이어가 방장이 된다.
- 진행 중 라이어가 나가면 시민 승리로 종료한다.
- 다른 플레이어가 나가면 생존자 기준으로 발언 순서를 재구성하고 종료 조건을 확인한다.
- 현재 발언자가 나가면 다음 턴을 계산하며 남은 발언자가 없으면 투표를 시작한다.
- 투표 중 나가면 해당 플레이어가 한 투표와 그 플레이어에게 한 투표를 제거한 뒤 완료 여부를 다시 계산한다.
- 최후 변론·최종 판결 중 나가면 해당 플레이어의 최종 판결 표를 제거하고, 방에 남은 생존 후보 제외 플레이어만 유권자로 다시 계산한다. 남은 유권자가 모두 제출한 상태면 즉시 판결한다.
- 최종 후보가 나가면 먼저 라이어 퇴장·생존자 수 종료 조건을 적용한다. 게임이 계속될 수 있으면 후보를 탈락시키지 않은 `VOTE_RESULT`를 발행하고 다음 라운드로 진행한다.

## 상태 복원

1. 방 상세 REST에서 전체 플레이어, 게임 phase, 발언 순서와 `VOTE_RESULT` 스냅샷을 받는다. `FINAL_DEFENSE`·`FINAL_VOTE`에는 `finalCandidateId`와 서버 권위 마감 시각 `finalDeadlineAt`도 받는다.
2. 개인 game-state REST에서 역할, 제시어, 본인 상태, 일반 투표 후보 `voteCandidates`, 일반·최종 투표 상태, 최종 판결 후보·마감 시각과 누적 발언을 받는다.

게임 종료 직후 `currentGame`이 제거되므로 `GAME_OVER` 결과는 복원 범위에 포함되지 않는다.

## 동일 플레이어의 새 탭 연결

새 탭은 STOMP `CONNECT`에서 방 코드, playerId, playerSecret을 함께 보내고 방·개인 상태 REST를 다시 조회해 게임 화면을 복원한다. 같은 playerId의 기존 탭에는 `SESSION_REPLACED`가 방 구독으로 발행되며, 이전 sessionId의 `/pub`·`/app` 명령은 즉시 무시된다. 이벤트의 `graceSeconds`는 현재 5이므로 이전 탭은 5초 안에 연결을 종료해야 한다.

새 활성 session이 disconnect하면 플레이어는 방 퇴장 흐름을 따른다. 이미 새 session으로 대체된 이전 탭의 disconnect는 활성 소유권을 지우거나 플레이어를 퇴장시키지 않는다.
