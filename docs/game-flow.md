# 프론트엔드 게임 규칙 및 UI 흐름

이 문서는 프론트엔드 클라이언트에 구현된 게임 진행 규칙, UI 상태 전이, 그리고 백엔드와의 상태 동기화 흐름을 설명한다. 백엔드 원본은 [be_docs/game-flow.md](be_docs/game-flow.md)를 참조한다.

## 상태 모델과 UI 매핑

| 백엔드 상태 | 값 | 프론트엔드 UI 매핑 |
| --- | --- | --- |
| `RoomStatus` | `WAITING` | 대기실 화면 (`Lobby.jsx`) |
| `RoomStatus` | `PLAYING` | 인게임 화면 (`GameScreen.jsx`) — 발언 진행 중 |
| `RoomStatus` | `VOTING` | 인게임 화면 (`GameScreen.jsx`) — 투표 또는 결과 |
| `GamePhase` | `SPEECH` | 생존 플레이어순 발언. 현재 발언자 폼 및 턴 넘기기 버튼 활성화 |
| `GamePhase` | `VOTE` | 일반 투표. 본인·사망자 제외 후보 선택 버튼 활성화 |
| `GamePhase` | `FINAL_DEFENSE` | 단독 최다 득표자의 10초 최후 변론 화면 |
| `GamePhase` | `FINAL_VOTE` | 후보 제외 생존자들의 `KILL`/`SAVE` 판결 버튼 |
| `GamePhase` | `VOTE_RESULT` | 투표 결과 노출 및 4초 자동 라운드 전환 대기 |
| `GamePhase` | `GAME_OVER` | 게임 종료 모달 (승리팀, 라이어 공개) |
| `PlayerStatus` | `ALIVE`, `DEAD` | 생존/사망(💀) 표시. 사망자는 투표권 및 대상에서 제외 |

```text
[Lobby.jsx] (WAITING)
  └─ 방장 '게임 시작' 클릭 ──> [GameScreen.jsx] (PLAYING / SPEECH)
                                 │
  ┌──────────────────────────────┘ (모든 생존자 발언 완료 또는 턴 넘기기/타임아웃)
  ▼
(VOTING / VOTE) ──> 일반 투표 진행
  ├─ 동점 / 무투표 ─────────────> (VOTE_RESULT) ──> 서버 4초 자동 ──> 2라운드 (SPEECH)
  └─ 단독 최다 득표자 발생 ────> (FINAL_DEFENSE 10초) ──> (FINAL_VOTE 10초)
                                       ├─ KILL 과반 ──> 라이어 탈락 시 CITIZEN 승리 (GAME_OVER)
                                       └─ SAVE / 기권 ──> (VOTE_RESULT) ──> 서버 4초 자동 ──> 2라운드 (SPEECH)
```

## 단계별 UI 진행 흐름

### 1. 대기실 및 방 설정 (`WAITING`)
- `Lobby.jsx`에서 참가자 목록과 현황이 표출된다.
- 방 생성 시 `visibility`로 공개/비공개를 선택한다. 비공개방은 `roomCode`(6자리)가 초대 코드이며 입장 시 닉네임만 필요하다.
- 방장은 카테고리(`FOOD`, `ANIMAL`, `PLACE`, `JOB`, `COUNTRY`, `RANDOM`) 및 제한시간 프리셋(`FAST`, `STANDARD`, `RELAXED`)을 변경할 수 있으며, `PATCH /api/rooms/{roomCode}/settings`가 호출된다.
- 방장이 '게임 시작' 클릭 시 `/pub/rooms/{roomCode}/start` 메시지를 발행한다.
- `GAME_START` 수신 시 `GameScreen.jsx`로 전환되며, 개인 구독 `/sub/users/{playerId}`의 `ROLE_ASSIGNED` 이벤트로 역할·제시어가 표시된다.

### 2. 발언 단계 (`SPEECH`)
- `TURN_CHANGED` 이벤트 수신 시 `currentTurnPlayerId`에 해당하는 플레이어의 입력 폼 및 '턴 넘기기' 버튼이 활성화된다.
- 본인 턴일 경우 발언 입력 후 전송하거나 '턴 넘기기'를 통해 `/pub/rooms/{roomCode}/skip`을 전송한다.
- `FINAL_DEFENSE` 중 후보자도 `speak`를 사용할 수 있다. 이 발언은 누적 로그에 남지만 턴·단계 전이를 바꾸지 않는다.
- `PLAYER_SPOKEN` 이벤트는 채팅 로그 영역에 실시간으로 기록된다.

### 3. 일반 투표 단계 (`VOTE`)
- `VOTE_STARTED` 이벤트 수신 시 화면이 투표 상태로 전환된다. `alivePlayers`는 전체 생존자이며, 투표 UI에는 본인·사망자 제외 후보만 표시한다.
- 본인이 생존 상태이고 아직 투표하지 않은 경우에만 후보 선택 버튼이 활성화된다.
- `/pub/game/vote`로 투표를 제출한다.

### 4. 최후 변론 및 최종 판결 (`FINAL_DEFENSE`, `FINAL_VOTE`)
- 단독 최다 득표자 발생 시 `FINAL_DEFENSE_STARTED`로 10초 최후 변론 타이머가 표시된다.
- 이어서 `FINAL_VOTE_STARTED` 수신 시 후보자를 제외한 생존 플레이어에게 `KILL`/`SAVE` 선택 버튼이 활성화되며, `/pub/game/final-vote`로 판결표를 전송한다.

### 5. 투표 결과 및 다음 라운드 진입 (`VOTE_RESULT`)
- `VOTE_RESULT` 수신 시 결과가 노출된다. 이후 서버가 4초 뒤 자동으로 다음 라운드를 시작한다.
- 클라이언트는 별도 명령 없이 `TURN_CHANGED` 이벤트를 수신하면 발언 단계로 전환된다.

### 6. 게임 종료 (`GAME_OVER`)
- `GAME_OVER` 수신 시 게임 종료 모달이 노출되어 승리팀(`CITIZEN`/`LIAR`), 종료 사유, 라이어가 공개된다.
- 결과 확인 후 대기실(`Lobby.jsx`)로 복귀한다.

## 새로고침(F5) 시 UI 복원 메커니즘

1. 브라우저 새로고침 시 `App.jsx`는 `sessionStorage` 세션에서 `roomCode`, `playerId`, `playerSecret`을 읽어온다.
2. REST API `GET /api/rooms/{roomCode}`와 `GET .../players/{playerId}/game-state`를 호출한다.
3. 응답받은 `game.phase`, `role`, `topicWord`, `players`, `speechLogs`, `voteResult`, `voteCandidates` 등을 통해 이전 진행 화면을 복원한다.
4. `FINAL_DEFENSE`·`FINAL_VOTE`에서는 `finalCandidateId`, `finalDeadlineAt`과 개인별 `hasFinalVoted`, `canFinalVote`를 복원한다. 게이지는 서버 절대 마감 시각 기준으로 남은 시간을 표시한다.
5. 진행 중 게임이 없고 `lastGameResult`가 남아 있으면 `GAME_OVER` 모달을 복원한다.
