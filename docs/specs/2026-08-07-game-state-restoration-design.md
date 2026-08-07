# 게임 상태 복원 설계

## 목표

새로고침 또는 이벤트 지연 뒤에도 최후 변론·최종 판결·게임 종료 화면을 서버 권위 상태로 복원한다.

## 범위

- `deadlineAt`/`finalDeadlineAt`을 절대 마감 시각으로 사용해 게이지를 계산한다.
- 개인 게임 상태의 최종 판결 후보, 마감 시각, 제출 여부 및 권한을 UI 상태로 복원한다.
- 방 상세의 `lastGameResult`를 보존하고 `GAME_OVER` 모달을 복원한다.
- `SESSION_REPLACED`는 현재 탭의 서버 STOMP session ID를 알 수 없으므로 변경하지 않는다.

## 상태 흐름

`loadRoom()`은 방 상세를 정규화한 뒤 게임 페이즈를 복원한다. 최종 단계에서는 개인 게임 상태의 후보·마감 시각·투표 권한을 `finalDefense` 또는 `finalVote`로 옮긴다. 종료 게임은 `currentGame` 대신 `lastGameResult`를 읽어 `GAME_OVER`와 종료 모달 상태를 설정한다.

`GameScreen`은 최종 단계의 `deadlineAt`과 현재 시각의 차이로 게이지 비율을 계산한다. `FINAL_VOTE` 버튼은 `canFinalVote`가 true이고 `hasFinalVoted`가 false일 때만 노출한다.

## 검증

- 과거·미래의 절대 마감 시각이 각각 0%·남은 비율로 표시된다.
- 복원된 최종 판결 제출/권한 상태가 버튼과 완료 문구를 정확히 제어한다.
- `lastGameResult`만 남은 `WAITING` 방도 종료 모달을 표시한다.
