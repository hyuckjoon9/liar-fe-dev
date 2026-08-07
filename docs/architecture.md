# 프론트엔드 아키텍처

## 시스템 경계

이 저장소는 라이어 게임(Liar Game)의 웹 브라우저 프론트엔드 클라이언트이다. Vite 기반의 React SPA(Single Page Application)로 구현되어 있으며, 브라우저 환경에서 REST API를 통한 방 및 게임 상태 조회·복원을 수행하고 STOMP/WebSocket 채널을 통해 실시간 게임 메시지 및 이벤트를 송수신한다.

```text
Browser (React SPA / Vite - http://localhost:5173)
├─ HTTP REST API ──> Backend (/api/rooms/**)
│   ├─ 방 목록 / 생성 / 입장 / 퇴장 / 설정 변경 (rooms.js)
│   └─ 새로고침 및 세션 복원 (/players/{playerId}/game-state)
└─ STOMP WebSocket ──> Backend (/ws)
    ├─ Publish (/pub/rooms/{code}/*, /pub/game/*)
    └─ Subscribe (/sub/rooms, /sub/rooms/{code}, /sub/users/{playerId})
```

## 모듈 및 파일 책임

| 디렉터리/파일 | 책임 |
| --- | --- |
| `src/main.jsx` | React 애플리케이션 진입점 및 DOM 마운트 |
| `src/App.jsx` | 최상위 메인 컴포넌트, 전역 방/게임 상태 소유, STOMP 연결 및 세션 대체 관리, 뷰 전이 제어 |
| `src/config.js` | REST API Base URL 및 WebSocket URL 서버 접속 정보 관리 |
| `src/styles.css` | 최외각 패널 가이드라인 기반의 레이아웃, 절제된 선 스타일 및 반응형 CSS |
| `src/api/rooms.js` | 백엔드 HTTP REST API 호출 클라이언트 (`getRooms`, `createRoom`, `joinRoom`, `getRoom`, `leaveRoom`, `getPlayerGameState`, `updateRoomSettings`) |
| `src/ws/stompClient.js` | `@stomp/stompjs` 기반 STOMP 클라이언트 생성, 구독 및 JSON 메시지 발행 유틸리티 |
| `src/storage/session.js` | `sessionStorage` 기반 세션 정보(`playerId`, `playerSecret`, `roomCode`) 저장·조회·초기화 |
| `src/utils/room.js` | 서버 응답 데이터 정규화(`normalizeRoom`) 및 세션 데이터 추출 유틸리티 |
| `src/components/Lobby.jsx` | 대기실 화면 (인원 현황, 참가자 목록, 방장 전용 카테고리/시간 프리셋 변경 폼, 시작/퇴장 버튼) |
| `src/components/GameScreen.jsx` | 인게임 화면 (역할/제시어, 턴 마스킹, 발언/턴 넘기기, 채팅 로그, 투표, 최후 변론, KILL/SAVE 최종 판결) |
| `src/components/RoomList.jsx` | 공개방 목록 조회 및 입장 모달 호출 UI |
| `src/components/CreateRoomForm.jsx` | 방 생성 입력 폼 (닉네임, visibility 선택, 최대 인원 선택) |
| `src/components/JoinRoomModal.jsx` | 방 입장 모달 (닉네임 입력 폼) |

## 상태 소유권

`App.jsx`가 프론트엔드의 단일 상태 원천(Single Source of Truth) 역할을 수행하며 다음과 같은 핵심 상태를 관리한다:

1. **접속 및 세션 상태**: `playerId`, `playerSecret`, `roomCode`, `wsConnected`, `sessionReplacedModal`
2. **방 및 참가자 정보**: `room` (`roomCode`, `title`, `hostId`, `players`, `status`, `maxPlayers`, `categoryId`, `timePreset`)
3. **인게임 핵심 진행 상태**: `phase` (`SPEECH`, `VOTE`, `FINAL_DEFENSE`, `FINAL_VOTE`, `VOTE_RESULT`, `GAME_OVER`), `roleInfo` (`role`, `topicWord`), `finalDefense`, `finalVote`
4. **발언 및 투표 로그 상태**: `speechLogs`, `voteState` (`votedCount`, `totalVoterCount`, `hasVoted`, `canVote`, `votablePlayers`), `voteResult`, `gameOverResult`

새로고침(F5) 시 화면 및 게임 상태 유실을 방지하기 위해 `session.js`를 통해 `playerId`, `playerSecret`, `roomCode`를 `sessionStorage`에 영속화한다. 새로고침 발생 시 `App.jsx` 마운트 시점에 REST `GET /api/rooms/{roomCode}` 및 `GET .../players/{playerId}/game-state`를 순차 호출하여 클라이언트 상태를 완벽히 복원한다.

## STOMP 연결 소유권 및 세션 교체 처리

STOMP 연결 시 native header에 `roomCode`, `playerId`, `playerSecret`을 포함하여 인증을 수행한다.
동일한 `playerId`로 다른 브라우저 탭이나 창에서 새 웹소켓 연결이 수립될 경우, 백엔드로부터 `/sub/rooms/{roomCode}` 채널을 통해 `SESSION_REPLACED` 이벤트가 발행된다.

프론트엔드는 `SESSION_REPLACED` 이벤트를 수신하면 이전 탭에서 세션 대체 안내 모달(`sessionReplacedModal`)을 띄우고 추가 명령 전송을 차단하여 동시 명령 충돌을 방지한다.

백엔드 원본은 [be_docs/architecture.md](be_docs/architecture.md)를 참조한다.
