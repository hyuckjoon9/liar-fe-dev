# 기술 부채 및 잔존 과제

이 문서는 라이어 게임 프론트엔드 코드베이스에서 확인된 기술 부채, 잔존 이슈 및 향후 개선 과제를 정리한다. 백엔드 원본은 [be_docs/technical-debt.md](be_docs/technical-debt.md)를 참조한다.

## 완료된 주요 과제

- [x] **방 설정 변경 UI 연동 (`Lobby.jsx`)**: `PATCH /api/rooms/{roomCode}/settings` 및 STOMP `ROOM_UPDATED` 연동완료.
- [x] **턴 넘기기 연동 (`GameScreen.jsx`)**: `/pub/rooms/{roomCode}/skip` 전송 및 턴 포기 흐름 연동완료.
- [x] **최후 변론 / 최종 판결 UI 연동**: `FINAL_DEFENSE_STARTED` 10초 타이머, `FINAL_VOTE_STARTED` `KILL`/`SAVE` 판결표 발행 연동완료.
- [x] **다중 탭 세션 대체 안내**: `SESSION_REPLACED` 이벤트 수신 시 세션 교체 경고 모달 표시 연동완료.
- [x] **STOMP 세션 인증 및 경쟁 조건 버그 수정**: STOMP `CONNECT` 프레임에 native header 전달 완료.
- [x] **방 퇴장 안전 세션 정리**: `leaveRoom` REST 호출 시 `X-Player-Secret` 전달 완료.
- [x] **메인 로비 방 목록 자동 갱신**: 1초 간격 REST 폴링 구축완료.
- [x] **발언 턴 스포트라이트 애니메이션**: 내 발언 차례일 때 입력창 앰비언트 글로우 애니메이션 적용완료.
- [x] **SAVE 판결 시 라이어 정체 공개 비공개화**: `voteResult.eliminated === true` 조건 보안 처리완료.
- [x] **4초 자동 라운드 전이 게이지 바**: `VOTE_RESULT` 수신 시 4초 게이지 바 표시 완료.
- [x] **디버그 콘솔 로그 청소**: `src/` 전체의 `console.log` 찌꺼기 정돈완료.
- [x] **백엔드 문서 기반 코드 정합성 수정**: `password`→`visibility` 교체, `VOTING_START`/`PLAYER_SPEAK` 제거, `VOTE_STARTED.alivePlayers` 필드명 수정, `voteCandidates` 필드명 수정, `isHasVoted`/`isCanVote` 폴백 제거, `totalCount` 중복 제거, `isHost` 로직 단순화, `listStatus` 한글 표시, `resolveNickname`/`speechLogs` 복원 단순화 완료.
- [x] **임의 닉네임 번호(`#0000~#9999`) 검증**: 서버가 보내는 닉네임(`게스트#4829`)이 그대로 UI에 노출됨을 확인. 별도 처리 불필요.

## 남은 프론트엔드 보완 과제

### 1. `SESSION_REPLACED` 연결 종료 식별자 부재
- **상태**: 백엔드 계약 보완 필요
- **내용**: 방 구독 이벤트에는 대체된 서버 session ID만 전달되지만, 프론트는 자신의 서버 STOMP session ID를 신뢰성 있게 알 수 없다. 따라서 이벤트 수신 탭이 모두 `deactivate()`하면 새 활성 탭까지 끊길 수 있다.
- **후속 과제**: CONNECTED 프레임 또는 전용 API로 현재 session ID를 제공하고, `replacedSessionId`와 일치하는 탭만 `graceSeconds` 안에 연결을 종료하도록 한다. 또는 백엔드가 대체된 연결에만 종료 신호를 전달·종료한다.

### 2. 다중 클릭 방지 및 Optimistic UI 가드
- **상태**: 부분 적용 완료
- **내용**: 투표·판결 버튼 클릭 시 연타 방지가 적용되어 있으나, 네트워크 응답 지연 시 버튼 로딩 스피너/비활성화를 전면 적용한다.

### 3. 공개방 목록 폴링의 요청 중첩과 전역 로딩 상태
- **상태**: 개선 필요
- **내용**: `App.jsx`는 메인 로비에서 1초마다 `loadRooms()`를 호출한다. 이전 `GET /api/rooms`가 끝나기 전에도 다음 호출을 시작하고, 각 호출이 전역 `loading`을 변경한다. 응답 지연 시 요청이 누적되고 방 생성·입장 컨트롤이 주기적으로 비활성화될 수 있다.
- **후속 과제**: 목록 조회 전용 로딩 상태와 진행 중 요청 가드를 두고, 이전 요청 취소 또는 완료 뒤 다음 폴링을 예약한다.

### 4. REST 비JSON 응답의 오류 상태 유실
- **상태**: 개선 필요
- **내용**: `src/api/rooms.js`의 `request()`는 응답 본문을 항상 `JSON.parse()`한다. 프록시·서버 오류 페이지처럼 JSON이 아닌 응답은 파싱 단계에서 예외가 발생해 HTTP 상태 코드가 `error.status`에 저장되지 않는다. 그 결과 `App.jsx`의 401·403·404 세션 정리 분기가 동작하지 않을 수 있다.
- **후속 과제**: JSON 파싱 실패를 처리하고, 실패해도 HTTP 상태 코드와 일반 오류 메시지를 보존한다. JSON이 아닌 오류 응답을 다루는 단위 테스트를 추가한다.
