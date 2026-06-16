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
- `src/App.jsx`: 앱 최상위 상태, REST 호출 흐름, WebSocket 구독 연결
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
- `src/components/GameScreen.jsx`: 게임 진행 화면, 역할/제시어, 턴, 발언 입력, 발언 로그
