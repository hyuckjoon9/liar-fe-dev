# 게임 상태 복원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 스냅샷으로 최후 단계와 게임 종료 화면을 정확히 복원한다.

**Architecture:** 방 정규화는 `lastGameResult`를 유지하고, `App`은 REST 스냅샷을 UI 상태로 옮긴다. `GameScreen`은 최종 판결 상태와 절대 마감 시각만 렌더링한다.

**Tech Stack:** React, Vitest, Testing Library

## Global Constraints

- `docs/be_docs/`는 읽기 전용이다.
- `SESSION_REPLACED` 연결 종료는 이번 범위에서 구현하지 않는다.

---

### Task 1: 방 종료 결과 보존

**Files:**
- Modify: `src/utils/room.js`
- Create: `src/utils/room.test.js`

**Interfaces:**
- Produces: `normalizeRoom(room).lastGameResult`

- [ ] **Step 1: Write the failing test**

```js
expect(normalizeRoom({ status: 'WAITING', lastGameResult: { winner: 'CITIZEN' } }).lastGameResult)
  .toEqual({ winner: 'CITIZEN' });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/room.test.js`

- [ ] **Step 3: Write minimal implementation**

```js
lastGameResult: source.lastGameResult ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/room.test.js`

### Task 2: 최후 단계 게이지와 투표 권한

**Files:**
- Modify: `src/components/GameScreen.jsx`
- Modify: `src/components/GameScreen.test.jsx`

**Interfaces:**
- Consumes: `finalVote = { candidatePlayerId, deadlineAt, hasVoted, canVote }`
- Produces: 서버 권한 기반의 최종 판결 버튼과 절대 마감 시각 게이지

- [ ] **Step 1: Write failing tests**

```jsx
expect(screen.getByRole('button', { name: 'KILL (탈락)' })).toBeDisabled();
expect(gauge).toHaveStyle({ width: '50%' });
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npm test -- src/components/GameScreen.test.jsx`

- [ ] **Step 3: Write minimal implementation**

```js
const remainingRatio = Math.max(0, (new Date(deadlineAt).getTime() - Date.now()) / durationMs);
const canSubmitFinalVote = finalVote?.canVote && !finalVote?.hasVoted;
```

- [ ] **Step 4: Run test to verify they pass**

Run: `npm test -- src/components/GameScreen.test.jsx`

### Task 3: REST 복원과 문서

**Files:**
- Modify: `src/App.jsx`
- Modify: `docs/game-flow.md`
- Modify: `docs/rest-api.md`
- Modify: `docs/technical-debt.md`
- Modify: `docs/change-history.md`

**Interfaces:**
- Consumes: `finalCandidateId`, `finalDeadlineAt`, `hasFinalVoted`, `canFinalVote`, `lastGameResult`
- Produces: 복원된 `finalDefense`, `finalVote`, `gameOverResult`, `GAME_OVER` 페이즈

- [ ] **Step 1: Extend the existing component regression test with restored props**
- [ ] **Step 2: Run the targeted test and verify the new assertion fails**
- [ ] **Step 3: Restore final-stage and game-over state in `loadRoom()`**
- [ ] **Step 4: Update the current-behavior documentation and session replacement constraint**
- [ ] **Step 5: Run the targeted test, full test suite, build, and `git diff --check`**
