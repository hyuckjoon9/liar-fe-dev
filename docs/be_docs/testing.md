# 테스트와 검증

## 자동 테스트 실행

Windows PowerShell:

```powershell
.\gradlew.bat test
```

테스트를 캐시와 관계없이 다시 실행:

```powershell
.\gradlew.bat test --rerun-tasks
```

컴파일, 테스트와 패키징을 함께 확인:

```powershell
.\gradlew.bat build
```

## 자동 테스트 범위

| 테스트 클래스 | 검증 범위 |
| --- | --- |
| `LiarApplicationTests` | Spring 애플리케이션 컨텍스트 로드 |
| `RoomServiceTest` | 대기중·게임중 목록, 공개·비공개 전역 목록 이벤트, 방 코드 충돌 재시도와 동시 생성, 기본 게임 설정과 대기 상태 설정 제한, 삭제와 경합한 방 조회, 방 잠금 뒤 개인 상태 스냅샷, 개인 secret 인증, 역할·제시어, 게임 중 발언자·일반·최종 투표자·후보·라이어 퇴장 전이, 플레이어·투표·발언·게임 종료 결과와 최종 판결 후보·자격·마감 시각 복원, 사망자 표시, 생성 뒤 변경되지 않는 `VOTE_RESULT` 스냅샷 |
| `GameServiceTest` | 게임 시작 스냅샷, 공개·비공개 게임 생명주기 목록 이벤트, 발언·일반 투표 무제출 포함 타임아웃과 턴 넘기기, 라이어를 포함한 단독 최다 득표 뒤 최후 변론·최종 판결의 과반·타임아웃·마감 시각 이벤트, 최종 판결 라이어 탈락의 `LIAR_FOUND` 종료·결과 이벤트, 게임 종료·새 게임·퇴장 뒤 예약 작업의 상태 불변. `previousRoundSpeechTimeoutDoesNotSkipSamePlayerAtTheStartOfTheNextRound`는 이전 라운드에서 캡처한 발언 Runnable이 다음 라운드 같은 플레이어의 `SPEECH` phase, `currentTurnIndex`, 발언 로그를 바꾸지 않는지 검증한다. `finalDefenseCandidateSpeechImmediatelyStartsFinalVoteAndInvalidatesItsTimeout`는 후보 발언 뒤 `PLAYER_SPOKEN`, `FINAL_VOTE_STARTED` 순서의 단일 전환과 이전 최후 변론 Runnable의 중복 이벤트 방지를 검증한다. |
| `RoomControllerIntegrationTest` | 실제 Spring MVC 요청에서 공개·비공개 방 목록, 자동 번호 닉네임, 정원 마감 목록 상태, 존재하지 않는 초대 코드의 IP별 429 제한, `STANDARD` 설정 변경·퇴장의 secret 검증, 잘못된 JSON의 공통 400 응답 |
| `GameWebSocketIntegrationTest` | 실제 랜덤 포트의 `/ws` 연결, 타인 secret 게임 시작 요청의 `ERROR`·상태 불변, 발언·투표 명령의 방 이벤트 전달, 같은 플레이어의 인증된 두 STOMP session에서 `SESSION_REPLACED`의 이전 session 식별·이전 session의 `/pub`·`/app` 투표 거부·새 session 투표 수락, 대체·활성 socket disconnect의 방 멤버십 차이 |
| `GlobalExceptionHandlerTest` | 처리되지 않은 예외의 일반 500 `ApiResponse` |
| `PlayerSessionServiceTest` | 같은 플레이어의 새 STOMP session 등록이 이전 session을 대체하고 활성 연결과 플레이어 연결 상태를 갱신하는지 검증 |
| `PlayerSessionChannelInterceptorTest` | 대체된 이전 session의 `/pub`·`/app` 명령이 controller에 도달하기 전에 거부되는지 검증 |
| `PlayerSessionDisconnectListenerTest` | 대체 session disconnect 무시, 활성 session disconnect의 방 퇴장, disconnect와 재연결 사이 임계구역을 검증 |

배포 환경에서만 확인할 수 있는 동작은 아래 수동 회귀 점검표와 [기술 부채의 dev 배포 항목](technical-debt.md#dev-배포)에서 관리한다.

## 수동 회귀 점검표

### 방 생명주기

- [ ] 방 생성 응답의 `roomCode`, `playerId`, `playerSecret`, `host=true`를 확인한다.
- [ ] 공개방만 목록에 보이고, 비공개방은 6자리 초대 코드로 입장되는지 확인한다.
- [ ] 비공개방의 생성·입장·퇴장·삭제·게임 시작·게임 종료가 `/sub/rooms`에 발행되지 않는지 확인한다.
- [ ] 새 방이 `RANDOM`, `STANDARD`, 발언 30초, 투표 30초로 시작하고 설정 변경은 `WAITING`에서만 되는지 확인한다.
- [ ] 표시 닉네임과 방 제목이 `닉네임#1234`, `닉네임#1234님의 방` 형식인지 확인한다.
- [ ] 같은 IP에서 존재하지 않는 초대 코드를 11회 요청하면 429가 반환되는지 확인한다.
- [ ] 공개방에 다른 플레이어가 입장하면 전체 방 목록의 `ROOM_UPDATED`와 방의 `PLAYER_JOIN`이 함께 발행되는지 확인한다.
- [ ] 방에 입장하지 않은 로비 연결이 `/sub/rooms`에서 공개방 변경을 즉시 받고, 비공개방 이벤트는 받지 않는지 확인한다.
- [ ] 방장만 설정을 바꿀 수 있고 방에 `ROOM_UPDATED`가 발행되는지 확인한다.
- [ ] 방장 퇴장 시 `HOST_CHANGED`를 확인하고, 공개방의 마지막 플레이어 퇴장 시 전체 목록의 `ROOM_DELETED`를 확인한다.
- [ ] 공개방의 게임 시작 뒤 전체 방 목록이 게임중으로 갱신되고, 새 참가자 입장이 거부되는지 확인한다.

### 시작과 발언

- [ ] 3명 이상인 대기 방에서 방장만 게임을 시작할 수 있는지 확인한다.
- [ ] `GAME_START`, `TURN_CHANGED`, 개인 `ROLE_ASSIGNED` 순서를 확인한다.
- [ ] 라이어의 `topicWord`가 `null`이고 시민의 제시어가 같은지 확인한다.
- [ ] 현재 차례의 생존자만 한 번 발언할 수 있는지 확인한다.
- [ ] `PLAYER_SPOKEN` 뒤 다음 `TURN_CHANGED` 또는 `VOTE_STARTED`가 발행되는지 확인한다.

### 투표와 다음 라운드

- [ ] 본인, 사망자, 방에 없는 플레이어를 대상으로 한 투표가 `ERROR`인지 확인한다.
- [ ] `VOTE_STARTED.alivePlayers`가 모든 생존자이고, 개인 game-state REST `voteCandidates`는 요청자 본인과 사망자를 제외한 생존 후보인지 확인한다.
- [ ] 단독 최다 득표 뒤 `FINAL_DEFENSE_STARTED`가 발생하는지 확인한다.
- [ ] 후보가 마감 전 발언하면 `PLAYER_SPOKEN` 뒤 즉시 `FINAL_VOTE_STARTED`가 정확히 한 번 발생하는지 확인한다.
- [ ] 후보가 발언하지 않을 때만 최후 변론 10초 마감 뒤 `FINAL_VOTE_STARTED`가 발생하는지 확인한다.
- [ ] 후보 발언으로 조기 전환된 뒤 기존 최후 변론 타이머가 실행돼도 `FINAL_VOTE_STARTED`가 중복 발생하지 않는지 확인한다.
- [ ] `FINAL_DEFENSE`와 `FINAL_VOTE`마다 각 시작 이벤트의 `deadlineAt`이 방 상세·개인 game-state REST의 `finalDeadlineAt`과 같고, 최종 판결 단계가 끝나면 두 REST 응답에서 `finalDeadlineAt`이 `null`인지 확인한다.
- [ ] 후보자를 제외한 생존자만 `KILL`·`SAVE`에 투표하고, `KILL` 과반일 때만 후보가 탈락하는지 확인한다.
- [ ] 발언·일반 투표·최종 판결의 시간 만료가 각각 미발언·기권 처리되는지 확인한다.
- [ ] 일반 투표를 아무도 제출하지 않아도 후보 없는 `VOTE_RESULT` 뒤 다음 라운드로 진행하는지 확인한다.
- [ ] 최종 판결 투표자가 REST 퇴장 또는 disconnect하면 기존 표가 제거되고 남은 유권자 기준으로 완료되는지 확인한다.
- [ ] 최종 후보 퇴장 시 기존 종료 조건을 먼저 적용하고, 계속 가능한 게임은 후보 탈락 없이 다음 라운드로 진행하는지 확인한다.
- [ ] 방 상세와 개인 game-state에서 같은 `VOTE_RESULT`를 복원하고, 최종 변론·판결 중에는 같은 `finalCandidateId`와 개인별 최종 투표 가능 여부를 복원하는지 확인한다.
- [ ] 탈락자는 전체 `players`에 `DEAD`로 남고 `voteCandidates`에서는 빠지는지 확인한다.
- [ ] `VOTE_RESULT` 메시지가 4초 후 자동 시작을 안내하고, 약 4초 뒤 `SPEECH`와 `TURN_CHANGED`, 누적 `speechLogs`를 확인한다.
- [ ] 첫 라운드 A, B, C가 제한시간보다 충분히 빠르게 발언하고, 단독 최다 득표 후보의 최후 변론과 `SAVE` 판결도 빠르게 완료한 뒤 `VOTE_RESULT` 4초 후 다음 라운드가 시작되는지 확인한다. 다음 라운드 A가 새 발언 제한시간을 온전히 받고 이전 A 타이머로 즉시 또는 조기 스킵되지 않아야 하며, A 발언 뒤 B와 C도 각각 새 제한시간을 받고 이전 B/C 타이머로 조기 스킵되지 않아야 한다.
- [ ] 일반 투표, 최후 변론, 최종 판결, 다음 라운드의 이전 단계 예약 작업을 가능한 시점에 실행해도 중복 이벤트나 잘못된 단계 전환이 발생하지 않는지 확인한다.

### 종료와 복원

- [ ] 최종 판결에서 라이어가 탈락하면 시민 승리, 시민 탈락으로 라이어와 시민 수가 같아지면 라이어 승리가 되는지 확인한다.
- [ ] 진행 중 라이어 퇴장 시 `LIAR_LEFT` 종료가 발생하는지 확인한다.
- [ ] 종료 직후 방이 `WAITING`, `game=null`이고 종료 결과가 REST로 복원되는지 확인한다.
- [ ] 같은 방에서 다시 시작하면 모든 플레이어가 `ALIVE`로 초기화되는지 확인한다.
- [ ] secret 누락·불일치·다른 플레이어 secret 사용 시 개인 REST가 `403`인지 확인한다.

### 연결 소유권

- [ ] 새 탭의 STOMP `CONNECT`에 `roomCode`, `playerId`, `playerSecret`을 모두 보낸다.
- [ ] 같은 플레이어가 새 탭에서 연결하면 기존 탭의 방 구독이 `replacedSessionId`, `graceSeconds: 5`를 담은 `SESSION_REPLACED`를 받는지 확인한다.
- [ ] 새 탭이 방 상세와 개인 game-state를 다시 조회해 현재 화면을 복원하고, 기존 탭이 5초 안에 연결을 종료하는지 확인한다.
- [ ] 기존 탭이 유예 중 `/pub`·`/app` 명령을 보내도 상태가 바뀌지 않고, 새 탭의 명령은 처리되는지 확인한다.
- [ ] 활성인 새 탭을 disconnect하면 플레이어 퇴장 흐름이 실행되고, 이미 대체된 기존 탭의 disconnect는 퇴장을 일으키지 않는지 확인한다.

## 결과 기록

수동 검증 결과에는 실행 날짜, commit, 참여 인원, 사용한 roomCode, REST 상태와 핵심 필드, WebSocket 이벤트 순서, 기대·실제 결과를 남긴다. 실패하면 최소 재현 단계와 관련 서버 로그를 함께 기록한다.
