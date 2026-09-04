# 라이어 게임 프론트엔드

라이어 게임(Liar Game)의 웹 브라우저 클라이언트 애플리케이션이다. React와 Vite 기반으로 구축되어 있으며, REST API를 통한 방 및 개인 게임 상태 조회·복원, STOMP/WebSocket 기반의 실시간 게임 진행 이벤트를 처리한다.

## 기술 스택

- **Core Framework**: React 18
- **Build Tool**: Vite
- **Real-time Protocol**: `@stomp/stompjs` (WebSocket STOMP 클라이언트)
- **Styling**: Vanilla CSS (`src/styles.css`)

## 실행 및 빌드 방법

### 개발 서버 실행

```powershell
npm install
npm run dev
```

기본적으로 `http://localhost:5173` 포트에서 싱글 페이지 애플리케이션(SPA)으로 실행된다.

### 프로덕션 빌드

```powershell
npm run build
```

`dist/` 디렉터리에 정적 빌드 결과물이 생성된다.

## 프로젝트 문서 안내

프로젝트 관련 세부 문서 및 계약 사항은 `docs/` 디렉터리에서 확인할 수 있다.

백엔드 API·WebSocket 계약의 기준 문서는 [liar-be-dev](https://hyuckjoon9.github.io/liar-be-dev)이다. 저장소의 [`docs/be_docs/`](docs/be_docs/)는 해당 문서의 읽기 전용 동기화 사본이다.

- [아키텍처](docs/architecture.md): 프론트엔드 모듈 구조, 컴포넌트 계층, 상태 관리 및 런타임 경계
- [게임 규칙 및 UI 흐름](docs/game-flow.md): 구현된 게임 규칙, UI 페이즈 전이 및 새로고침 복원 메커니즘
- [REST API 계약](docs/rest-api.md): HTTP API 호출 스펙 및 `X-Player-Secret` 인증 연동
- [WebSocket/STOMP 계약](docs/websocket-events.md): STOMP 연결, 발행/구독 이벤트 및 세션 대체(`SESSION_REPLACED`) 처리
- [테스트 및 검증](docs/testing.md): 빌드 검증 및 수동 회귀 테스트 시나리오
- [기술 부채](docs/technical-debt.md): 프론트엔드 잔존 이슈, 제약 사항 및 후속 과제
- [백엔드 변경 요청](docs/backend-change-requests.md): 프론트엔드 연동을 위해 필요한 백엔드 계약 변경
- [주요 변경 이력](docs/change-history.md): 프론트엔드 기능 구현 및 개선 이력
