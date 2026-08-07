# 주요 변경 이력

사용자 관점에서 의미 있는 프론트엔드 주요 완료 변경 사항만 기록한다. 현재 제약 사항 및 후속 작업은 [기술 부채](technical-debt.md)를 참조한다.

## 2026-08-07 — 최후 단계와 게임 종료 새로고침 복원

- 최후 변론·최종 판결 게이지가 서버 권위 `deadlineAt`/`finalDeadlineAt` 기준으로 남은 시간을 표시하도록 수정했다.
- 새로고침 뒤에도 최종 후보, 최종 판결 제출 여부와 투표 권한을 복원해 잘못된 판결 버튼 노출을 막았다.
- 종료 뒤 방이 `WAITING`으로 바뀌어도 `lastGameResult`로 게임 종료 모달을 다시 표시한다.

## 2026-08-07 — 백엔드 문서 기반 코드 정합성 전면 수정

- **`password`→`visibility` 교체**: 백엔드 API에 없는 `password` 개념을 `visibility: PUBLIC | PRIVATE`로 전면 교체했다. 방 생성 UI에 공개/비공개 선택 옵션이 추가되고 입장 시 닉네임만 입력하면 된다.
- **`VOTING_START`/`PLAYER_SPEAK` 이벤트 제거**: 백엔드에 존재하지 않는 가짜 이벤트 타입에 대한 방어 코드를 삭제했다.
- **`VOTE_STARTED.alivePlayers` 필드명 수정**: `data.players`로 잘못 읽던 부분을 백엔드 실제 필드명인 `data.alivePlayers`로 수정했다.
- **`voteCandidates` 필드명 수정**: `game-state` 응답의 실제 필드명인 `voteCandidates`를 올바르게 참조하도록 수정했다.
- **gameState 이중 파싱 제거**: `request()` 함수가 이미 `data`를 추출하는데 추가로 래핑을 벗기던 이중 파싱 로직을 삭제했다.
- **`isHasVoted`/`isCanVote` 폴백 제거**: 백엔드에 없는 필드를 방어하던 불필요한 분기를 삭제했다.
- **`voteState.totalCount` 중복 제거**: `totalVoterCount`와 동일값을 유지하던 `totalCount` 필드를 제거하고 `totalVoterCount`만 사용하도록 통일했다.
- **`isHost` 로직 단순화**: `PlayerResponse.host` 필드가 유일하므로 3단계 폴백을 `player.host` 하나로 단순화했다.
- **`listStatus` 한글 표시**: 방 목록에서 서버 `listStatus` 기반 `WAITING`→대기중, `PLAYING`→게임중, `FULL`→정원마감으로 표시한다.
- **`speechLogs` 복원 및 `resolveNickname` 단순화**: 백엔드 `PlayerSpokenResponse`가 항상 `nickname`을 포함하므로 UUID 매핑 로직을 제거했다.

## 2026-08-06 — 라운드 전환 및 최후 변론 입력 안정화

- 서버의 자동 `TURN_CHANGED` 이벤트를 즉시 반영해 투표 결과 화면에서 다음 발언 라운드로 전환되도록 수정했다.
- 최후 변론 후보자의 발언 입력을 활성화하고, 발언 입력창에 `현재 / 200` 글자 수를 표시했다.
- 메인 로비의 공개방 목록 갱신 주기를 1초로 줄였다. WebSocket 기반의 즉시 갱신에 필요한 백엔드 계약은 [기술 부채](technical-debt.md)에 분리했다.

## 2026-08-06 — 백엔드 v2 기능 연동 완결 및 UI 디자인 리팩토링

- **지침 수립**: `AGENTS.md`에 `docs/be_docs/` 100% 읽기 전용 규정 및 최외각 이외 중첩 카드 금지, 절제된 선 스타일 가이드라인을 명시했다.
- **방 설정 연동 (`Lobby.jsx`)**: `PATCH /api/rooms/{roomCode}/settings` API 클라이언트(`updateRoomSettings`)를 추가하고, 방장 전용 카테고리(`FOOD`, `ANIMAL`, `PLACE`, `JOB`, `COUNTRY`, `RANDOM`) 및 시간 제한 프리셋(`FAST`, `STANDARD`, `RELAXED`) 선택 UI를 연동했다.
- **턴 넘기기 연동 (`GameScreen.jsx`)**: 발언 턴 플레이어 대상 '턴 넘기기' 버튼을 추가하고 `/pub/rooms/{roomCode}/skip` 발행을 연동했다.
- **최후 변론 / 최종 판결 UI 연동 (`GameScreen.jsx`)**: `FINAL_DEFENSE_STARTED` 10초 타이머 화면 및 `FINAL_VOTE_STARTED` `KILL` / `SAVE` 판결 버튼과 `/pub/game/final-vote` 발행을 구현했다.
- **세션 대체 모달 연동 (`App.jsx`)**: `SESSION_REPLACED` 이벤트 수신 시 타 탭 접속 안내 모달을 표출하고 명령 입력을 비활성화했다.
- **STOMP 세션 인증 연결 보강 (`stompClient.js` & `App.jsx`)**: STOMP `CONNECT` 프레임 전송 시 필수 native header인 `roomCode`, `playerId`, `playerSecret`을 `connectHeaders`로 동적 반영하여, 백엔드 세션 인증 수립 및 STOMP 전송 에러(`ExecutorSubscribableChannel`) 현상을 해결했다. **추가 수정**: 세션 정보가 없는 메인 로비 상태에서는 STOMP 연결을 시도하지 않도록 사전 검증 조건을 추가하여, 인증 없는 STOMP 연결 시 백엔드 채널 인터셉터가 거부하며 발생하던 반복 에러를 완전히 차단했다.
- **방 퇴장 안전 세션 정리 보강 (`rooms.js` & `App.jsx`)**: `leaveRoom` REST 호출 시 `roomCode`, `playerId`, `playerSecret` 매개변수가 React 상태와 세션 스토리지에서 상호 보완적으로 폴백되도록 개선하고 `X-Player-Secret` 헤더 전달을 보장했습니다. 또한 서버 오류 발생 시에도 `finally` 블록에서 웹소켓 구독 해제, 로컬 세션 삭제 및 방 대기열 이탈 처리가 보장되도록 수정했습니다.
- **실시간 로비 방 목록 갱신 (`App.jsx`)**: 메인 로비 화면에서 5초 간격 REST 폴링(`loadRooms`)을 적용하여 A 사용자가 생성/수정한 방 정보가 B, C 화면에 실시간 자동 갱신되도록 구축했다.
- **발언 턴 스포트라이트 연출 (`styles.css` & `GameScreen.jsx`)**: 본인 차례일 때 발언 입력 구역(`.speakFormSpotlight`)에 앰비언트 박동 글로우 애니메이션을 적용했다.
- **타이머 게이지 바 & SAVE 정체 비공개화 (`GameScreen.jsx`)**: `FINAL_DEFENSE` (10초), `FINAL_VOTE` (10초), `VOTE_RESULT` (4초 자동 라운드 전환) 구역에 진행 게이지 바(`.gaugeBar`)를 노출하고, `SAVE` (생존) 판결 시 라이어 여부 공개를 차단하여 유저 게임성을 강화했다.
- **코드 리팩토링 및 찌꺼기 로그 제거 (`App.jsx`)**: 복잡했던 복원 로그 및 웹소켓 수신 `console.log` 찌꺼기를 전면 제거하고 페이즈 제어 로직을 정돈했다.
- **UI 디자인 리팩토링 (`styles.css`)**: 내부 요소의 중첩 카드 형태(`.playerCard`, `.speechItem`, `.tableRow`)를 완전히 제거하고 텍스트 시인성 중심의 경량 리스트 행 구조 및 저대비(low-contrast) 구분선 스타일을 적용했다.

## 2026-06-22 — 발언 정렬 및 새로고침 복원 안정화 (문제 1 해결)

- `pendingTurn` 상태 소비 로직을 보강하여 라운드 전환 후 화면 갇힘 현상을 해결했다.
- `speechLogs` 병합 시 `spokenAt` 타임스탬프 기반 정렬 및 중복 판정 방어 코드를 추가하여, 새로고침 시 2라운드 발언 유실 및 시간 순서 꼬임 문제를 수정했다.

## 2026-06-16 — 투표 결과 새로고침 복원 및 백엔드 라운드 연동

- `App.jsx` 내 `loadRoom()` REST 호출 결과에 `VOTE_RESULT` 페이즈 매핑을 추가하여, 새로고침 시에도 투표 결과 화면이 깨지지 않고 복원되도록 처리했다.
- 백엔드 4초 자동 라운드 전환 스케줄에 맞추어 실시간 `TURN_CHANGED` 이벤트 수신 기반 턴 연동을 안정화했다.

## 2026-06-15 — 보안 인증 헤더(`X-Player-Secret`) 및 개인 상태 연동

- 방 생성 및 입장 응답으로 발급받는 `playerSecret`을 `localStorage`에 영속화하고, 개인 게임 상태 조회 REST 호출 시 `X-Player-Secret` 헤더로 본인 인증을 수행하도록 구축했다.
- STOMP 게임 명령 전송 시 `playerSecret` 필드를 함께 발행하도록 동기화했다.
