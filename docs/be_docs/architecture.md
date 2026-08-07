# 백엔드 아키텍처

## 시스템 경계

이 저장소는 라이어 게임 백엔드만 포함한다. 브라우저 클라이언트는 REST로 방과 개인 상태를 조회하고, STOMP로 게임 명령을 보내며 이벤트를 구독한다. 프론트엔드, 데이터베이스, 외부 메시지 브로커는 없다.

```text
Browser
├─ HTTP /api/rooms/** ──> RoomController ──> RoomService
└─ STOMP /pub 또는 /app ─> GameWebSocketController ─> GameService
                                      │
RoomService / GameService ────────────┴─> RoomManager
        │                                  └─ ConcurrentHashMap<String, Room>
        └─> WebSocketService ──> /sub/rooms
                              ├─> /sub/rooms/{roomCode}
                              └─> /sub/users/{playerId}
```

## 패키지 책임

| 패키지 | 책임 |
| --- | --- |
| `room.controller` | 방과 개인 상태 REST endpoint |
| `room.service` | 방 생명주기, 설정, 개인 상태 인증·응답 조립 |
| `room.manager` | 인메모리 방 저장·조회·삭제 |
| `room.domain`, `room.dto` | 방·플레이어 상태와 REST·방 이벤트 데이터 |
| `game.controller` | STOMP 명령을 게임 서비스로 전달 |
| `game.service` | 시작, 발언, 투표, 자동 다음 라운드, 종료 상태 전이 |
| `game.domain`, `game.dto` | 게임 상태와 명령·이벤트 데이터 |
| `websocket` | 공통 이벤트 envelope와 구독 destination 발행, 플레이어별 활성 STOMP 연결 소유권 관리 |
| `topic.service` | 카테고리 5종의 내장 제시어 100개 중 선택 |
| `global` | CORS, STOMP broker, 공통 REST 응답과 예외 처리 |

## 상태 소유권

`RoomManager`는 모든 `Room`을 `ConcurrentHashMap`에 저장한다. `Room`은 다음 상태를 소유한다.

- 방 코드(비공개방의 초대 코드), 공개 범위, 자동 제목, 방장, 최대 인원과 생성 시각
- 플레이어 목록과 방 설정
- 방 상태와 현재 `Game`

`Game`은 제시어, 라이어, 발언 순서, 누적 발언, 현재 라운드 발언 여부, 일반 투표, 마지막 투표 결과와 예약 작업 세대 `timerGeneration`을 소유한다. 최종 판결 중에는 후보, 판결 표와 서버 권위 마감 시각 `finalDeadlineAt`도 `Game`에 저장한다. 플레이어 역할과 생존 상태는 `Player`에 저장한다. `PlayerSessionService`는 프로세스 메모리에서 playerId별 활성 STOMP sessionId와 sessionId별 방·플레이어 소유자를 별도로 관리한다.

영속 저장소가 없으므로 서버 재시작 시 모든 방, 플레이어, secret, 게임, 발언, 투표가 사라진다. 다중 애플리케이션 인스턴스 사이에서도 상태를 공유하지 않는다.

## STOMP 연결 소유권

STOMP `CONNECT`는 native header의 `roomCode`, `playerId`, `playerSecret`으로 방과 플레이어를 인증한다. 같은 playerId가 새 연결하면 새 sessionId가 활성 소유권을 즉시 대체하고, 이전 sessionId는 활성 목록에서 제거된다. 서버는 방 구독에 이전 sessionId와 5초 유예를 포함한 `SESSION_REPLACED`를 발행한다.

`/pub` 또는 `/app`으로 보내는 명령은 활성 sessionId에서만 채널을 통과한다. 따라서 이전 탭은 아직 WebSocket transport가 열려 있어도 상태를 바꾸는 명령을 보낼 수 없다. 클라이언트는 `SESSION_REPLACED`를 받으면 새 탭에서 REST 방·개인 상태를 다시 조회해 화면을 복원하고, 이전 탭은 `graceSeconds`(현재 5초) 안에 연결을 종료해야 한다. 활성 session의 disconnect와 방 퇴장은 같은 연결 소유권 임계구역에서 처리하므로, 그 사이 새 연결이 기존 플레이어를 다시 등록할 수 없다. 이미 대체된 이전 session의 disconnect는 무시한다.

## 요청과 이벤트 흐름

REST 요청은 `RoomController`에서 `RoomService`로 바로 전달된다. 성공과 `LiarGameException` 오류는 공통 `ApiResponse`로 반환한다.

STOMP 명령은 `GameWebSocketController`가 `GameService`에 전달한다. 게임 명령 오류는 HTTP 응답이 아니라 `/sub/users/{playerId}`의 `ERROR` 이벤트로 발행한다. 요청 객체나 playerId가 비어 있는 일부 명령은 오류 이벤트 없이 반환된다. `GameService`는 `TaskScheduler`로 발언 타임아웃, 일반 투표 타임아웃, 최후 변론 만료, 최종 판결 만료와 `VOTE_RESULT` 뒤 4초 후 다음 라운드 전환을 예약한다.

`Game.timerGeneration`은 예약 작업마다 증가하는 단조 세대다. 예약 Runnable은 생성 시 게임 객체와 세대를 캡처하고, 실행 시 현재 `Room.currentGame`이 같은 객체인지, 현재 세대가 캡처한 세대와 같은지, 예상 `GamePhase`가 같은지를 모두 확인한다. 발언 타이머는 현재 턴 플레이어도, 최후 변론·최종 판결 타이머는 후보 ID도 추가로 확인한다. 새 턴 또는 새 단계에서 타이머를 예약하면 기존 Runnable은 취소 성공 여부와 관계없이 이전 세대가 되어 no-op가 된다. 다음 라운드에서도 같은 `Game` 객체와 발언 순서를 재사용하므로, 게임 객체와 phase만 확인하면 이전 라운드의 타이머가 새 라운드 상태를 변경할 수 있다.

구체적인 외부 계약은 [REST API 계약](rest-api.md)과 [WebSocket/STOMP 계약](websocket-events.md)을 참조한다.

## 동시성 경계

방을 변경하는 `RoomService`와 `GameService`의 주요 흐름은 `synchronized (room)`으로 같은 방의 변경을 직렬화한다. 예약 Runnable도 이 경계 안에서 타이머 세대와 상태 조건을 다시 확인하고 상태를 변경하므로, 사용자 명령과 만료 처리는 한 방에서 동시에 전이하지 않는다. 서로 다른 방은 독립적으로 변경될 수 있다.

`getRooms()`, `getRoom()`, `getPlayerGameState()`는 대상 `Room`의 monitor 안에서 응답 DTO를 조립한다. 따라서 방 상세와 개인 상태 응답의 필드는 같은 방 상태 시점을 반영한다. 게임 스냅샷의 발언 순서와 투표 결과는 방어 복사해, 응답 생성 뒤 게임 상태가 바뀌어도 이미 만든 REST 응답은 바뀌지 않는다. 목록은 방마다 독립적으로 스냅샷을 만들므로, 서로 다른 방 사이의 전역 시점 일관성은 보장하지 않는다.

조회가 방 객체를 찾은 뒤 마지막 플레이어 퇴장으로 방이 삭제될 수 있어, 잠금을 얻은 뒤 `RoomManager`가 같은 객체를 아직 보관하는지도 확인한다. 삭제됐다면 이전 객체를 반환하지 않고 not found 오류를 낸다.

방 생성은 `putIfAbsent()` 기반 등록에 성공할 때까지 새 6자리 코드를 생성한다. `ConcurrentHashMap`은 저장소 연산 자체만 안전하게 만들며 `Room` 내부 객체의 복합 읽기·쓰기를 보호하지 않는다.

영향과 후속 판단은 [기술 부채](technical-debt.md)에 기록한다.

## 보안 경계

로그인, 세션, JWT는 없다.

- `playerId`는 방 응답과 이벤트에 노출되는 공개 식별자다.
- `playerSecret`은 방 생성·입장 때 발급된다. 개인 game-state 조회, 방 설정 변경, 퇴장 REST는 `X-Player-Secret`으로 해당 플레이어의 secret을 검증한다.
- STOMP 게임 시작·발언·투표 명령은 payload의 `playerId` 또는 `voterId`와 `playerSecret`을 함께 받고, secret이 일치할 때만 상태를 변경한다.

STOMP session 사용자 매핑과 장기 로그인·세션 모델은 없으며, player secret과 활성 연결 소유권은 프로세스 메모리에만 보관된다. 다중 인스턴스나 장기 사용자 인증이 필요한 환경에는 별도 인증·인가 모델이 필요하다.

## 네트워크 설정

- REST CORS: `http://localhost:5173`, 모든 method/header, credential 허용
- STOMP endpoint: `/ws`
- 애플리케이션 prefix: `/pub`, `/app`
- simple broker prefix: `/sub`
- WebSocket 허용 origin: `http://localhost:5173`
- SockJS: 설정하지 않음
