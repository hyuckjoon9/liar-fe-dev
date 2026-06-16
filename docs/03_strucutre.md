# Frontend Structure

```text
liar_frontend/
├─ docs/
│  ├─ 01_rest_api_spec.md
│  ├─ 02_websocket_event_spec.md
│  └─ strucutre.md
├─ src/
│  ├─ api/
│  │  └─ rooms.js
│  ├─ components/
│  │  ├─ CreateRoomForm.jsx
│  │  ├─ GameScreen.jsx
│  │  ├─ JoinRoomModal.jsx
│  │  ├─ Lobby.jsx
│  │  └─ RoomList.jsx
│  ├─ storage/
│  │  └─ session.js
│  ├─ utils/
│  │  └─ room.js
│  ├─ ws/
│  │  └─ stompClient.js
│  ├─ App.jsx
│  ├─ config.js
│  ├─ main.jsx
│  └─ styles.css
├─ index.html
├─ package.json
├─ package-lock.json
├─ node_modules/
└─ dist/
```

## Root

- `index.html`: Vite 진입 HTML
- `package.json`: 실행 스크립트와 의존성 정의
- `package-lock.json`: npm 의존성 잠금 파일
- `node_modules/`: 설치된 npm 패키지
- `dist/`: `npm run build` 결과물

## Docs

- `docs/01_rest_api_spec.md`: REST API 명세
- `docs/02_websocket_event_spec.md`: WebSocket/STOMP 이벤트 명세
- `docs/strucutre.md`: 현재 프론트 파일 구조 문서

## Source

- `src/main.jsx`: React 앱 마운트
- `src/App.jsx`: 앱 최상위 상태 관리. REST API를 통한 새로고침 상태 복원(voteResult 등) 수행, WebSocket(STOMP) 채널 구독 및 실시간 이벤트 핸들링, 다음 라운드 확인(`next-round`) 및 발언 전송(`speak`) 메시지 발행 등을 담당합니다.
- `src/config.js`: API/WebSocket Base URL 관리
- `src/styles.css`: 전체 UI 스타일과 반응형 레이아웃

## API

- `src/api/rooms.js`: 방 목록, 생성, 입장, 상세 조회, 퇴장 REST API 호출

## WebSocket

- `src/ws/stompClient.js`: STOMP 클라이언트 생성, 구독, publish 유틸

## Storage

- `src/storage/session.js`: `playerId`, `roomCode` localStorage 저장/조회/삭제

## Utils

- `src/utils/room.js`: 방 상세/목록 응답 정규화, 세션 payload 추출

## Components

- `src/components/CreateRoomForm.jsx`: 방 생성 폼
- `src/components/RoomList.jsx`: 방 목록 표시와 입장 버튼
- `src/components/JoinRoomModal.jsx`: 방 입장 모달
- `src/components/Lobby.jsx`: 대기실 화면, 플레이어 목록, 게임 시작/퇴장 버튼
- `src/components/GameScreen.jsx`: 게임 진행 화면 렌더링. 역할 및 제시어 표시, 턴 멘트 마스킹, 발언 입력 폼 및 발언 로그(채팅창) 출력, 투표 대상 목록 렌더링 및 본인 생존 여부(`ALIVE`/`DEAD`) 기준 투표 버튼 활성/비활성화 처리, 투표 결과(`VOTE_RESULT`) 화면 렌더링을 담당합니다. (※ 투표 버튼의 실시간 비활성화 오동작 방어 로직 내포)
