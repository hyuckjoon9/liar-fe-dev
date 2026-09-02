import { useState, useEffect, useRef } from "react";
import { getSession } from "../storage/session";

export default function GameScreen({
  room,
  roleInfo,
  playerId,
  speechLogs,
  onSpeak,
  onSkip,
  phase,
  voteState,
  voteResult,
  gameOverResult,
  finalDefense,
  finalVote,
  sessionReplaced = false,
  onVote,
  onFinalVote,
  onConfirmGameOver,
  onLeave,
  loading = false,
}) {
  const [content, setContent] = useState("");
  const [finalVoteSubmitted, setFinalVoteSubmitted] = useState(null); // "KILL" | "SAVE" | null
  const [gaugeProgress, setGaugeProgress] = useState(100);
  const chatContainerRef = useRef(null);

  const players = room.players || [];
  const myPlayerId = normalizeId(playerId || getSession().playerId);
  const currentTurnPlayerId = normalizeId(room.currentTurnPlayerId);
  const role = roleInfo?.role;
  const topicWord = roleInfo?.topicWord;
  const currentTurnName = getTurnName(players, room.currentTurnPlayerId);

  const myPlayer = players.find((p) => normalizeId(p.playerId) === myPlayerId);
  const myNickname = myPlayer?.nickname || "";
  const isDead = !myPlayer || myPlayer.status === "DEAD";

  const isMyTurn = !sessionReplaced && !isDead && !!myPlayerId && !!currentTurnPlayerId && currentTurnPlayerId === myPlayerId;
  const isFinalDefenseCandidate =
    !sessionReplaced &&
    phase === "FINAL_DEFENSE" &&
    !!finalDefense?.candidatePlayerId &&
    normalizeId(finalDefense.candidatePlayerId) === myPlayerId;

  const canInput = (phase === "SPEECH" && isMyTurn) || isFinalDefenseCandidate;
  const showSkip = isMyTurn && phase === "SPEECH";

  const orderedPlayers = getOrderedPlayers(players, room.turnOrder);

  const voteTargets = (
    voteState.votablePlayers?.length > 0 ? voteState.votablePlayers : players
  ).filter((p) => p.status !== "DEAD" && normalizeId(p.playerId) !== myPlayerId);

  const timedPhaseState = phase === "FINAL_DEFENSE" ? finalDefense : phase === "FINAL_VOTE" ? finalVote : null;
  const canSubmitFinalVote =
    !sessionReplaced &&
    !isDead &&
    normalizeId(finalVote?.candidatePlayerId) !== myPlayerId &&
    !finalVoteSubmitted &&
    finalVote?.hasVoted !== true &&
    finalVote?.canVote !== false;

  useEffect(() => {
    setFinalVoteSubmitted(phase === "FINAL_VOTE" && finalVote?.hasVoted ? true : null);
  }, [phase, finalVote?.hasVoted]);

  // 서버의 절대 마감 시각을 기준으로 최후 단계 게이지를 계산한다.
  useEffect(() => {
    let durationMs = 0;
    if (phase === "FINAL_DEFENSE" || phase === "FINAL_VOTE") {
      durationMs = (timedPhaseState?.durationSeconds || 10) * 1000;
    }
    else if (phase === "VOTE_RESULT") durationMs = 4000;

    if (durationMs <= 0) {
      setGaugeProgress(100);
      return;
    }

    const startTime = Date.now();
    const deadlineMs = timedPhaseState?.deadlineAt ? new Date(timedPhaseState.deadlineAt).getTime() : NaN;
    const updateGauge = () => {
      const remainingRatio = Number.isFinite(deadlineMs)
        ? Math.max(0, Math.min(1, (deadlineMs - Date.now()) / durationMs))
        : Math.max(0, 1 - (Date.now() - startTime) / durationMs);
      setGaugeProgress(remainingRatio * 100);
      return remainingRatio;
    };
    updateGauge();

    const interval = setInterval(() => {
      if (updateGauge() <= 0) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  }, [phase, timedPhaseState?.deadlineAt, timedPhaseState?.durationSeconds]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [speechLogs]);

  function submit(event) {
    event.preventDefault();
    const value = content.trim();
    if (!value || !canInput || isDead || sessionReplaced) return;
    onSpeak(value, myPlayerId);
    setContent("");
  }

  function handleFinalVoteClick(decision) {
    if (!canSubmitFinalVote || sessionReplaced) return;
    setFinalVoteSubmitted(decision);
    onFinalVote?.(decision);
  }

  const phaseLabel =
    phase === "GAME_OVER" ? "최종 게임 종료"
    : phase === "VOTE_RESULT" ? "투표 결과 공개"
    : phase === "FINAL_DEFENSE" ? "최후 변론 진행 중"
    : phase === "FINAL_VOTE" ? "최종 판결 투표 진행 중"
    : phase === "VOTE" ? "투표 진행 중"
    : currentTurnPlayerId ? "게임 진행 중"
    : "발언 단계 준비 중";

  const turnLabel =
    phase === "SPEECH"
      ? !currentTurnPlayerId ? "발언 단계 준비 중"
        : isMyTurn ? "내 차례입니다." : `${currentTurnName}님의 차례입니다.`
    : phase === "VOTE" ? "투표 진행 중"
    : phase === "FINAL_DEFENSE" ? (isFinalDefenseCandidate ? "당신의 최후 변론 시간입니다 (10초)" : "최후 변론 관전 중 (10초)")
    : phase === "FINAL_VOTE" ? "최종 판결 투표 중 (10초)"
    : "발언 단계 준비 중";

  return (
    <main className="appShell">
      <section className="lobbyHero">
        <p className="eyebrow">Game Room</p>
        <h1>{room.roomCode}번 방</h1>
        <p>{phaseLabel}</p>
      </section>

      <section className="panel gamePanel">
        <div className="gameActions">
          <button className="ghostButton" type="button" onClick={onLeave} disabled={loading || sessionReplaced}>
            나가기
          </button>
        </div>
        {/* 역할/제시어 + 턴 정보 */}
        <div className="gameGrid">
          <div>
            <p className="eyebrow">Role</p>
            {!role ? (
              <h2>역할을 기다리는 중...</h2>
            ) : (
              <>
                <h2>
                  {role === "LIAR" ? "라이어" : role === "CITIZEN" ? "시민" : role}
                  {myNickname && (
                    <span style={{ float: "right", color: "#bdb0c9", fontSize: "16px", fontWeight: "normal" }}>
                      내 이름 : {myNickname}
                    </span>
                  )}
                </h2>
                {role !== "LIAR" && <p className="topicTextNoBox">제시어: {topicWord || "-"}</p>}
                {role === "LIAR" && <p className="topicTextNoBox" style={{ color: "#ff5277" }}>당신은 라이어입니다</p>}
              </>
            )}
          </div>
          <div>
            <p className="eyebrow">Turn</p>
            <h2>{turnLabel}</h2>
            {isDead && <p className="turnHint">당신은 탈락했습니다 (관전 중)</p>}
          </div>
        </div>

        {/* 발언 입력 폼 - 내 차례일 때 스포트라이트 효과 */}
        <form className={`speakForm${canInput ? " speakFormSpotlight" : ""}`} onSubmit={submit}>
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              isDead ? "탈락한 플레이어입니다 (관전 중)"
              : isFinalDefenseCandidate ? "최후 변론을 입력하세요"
              : phase === "FINAL_DEFENSE" ? "최후 변론 관전 중"
              : !canInput ? "대기 중"
              : role === "LIAR" ? "라이어인 걸 들키지 않도록 대답해주세요!"
              : "라이어가 알지 못하도록 대답해주세요!"
            }
            disabled={!canInput || isDead}
            maxLength={200}
          />
          <button className="primaryButton" type="submit" disabled={!canInput || !content.trim() || isDead}>
            입력
          </button>
          {showSkip && (
            <button className="ghostButton" type="button" onClick={() => onSkip?.()} disabled={isDead} style={{ marginLeft: "4px" }}>
              턴 넘기기
            </button>
          )}
        </form>
        <p className="inputCount" aria-live="polite">{content.length} / 200</p>

        {/* 일반 투표 */}
        {phase === "VOTE" && (
          <div className="sectionBlock">
            <div className="listHeader">
              <div>
                <p className="eyebrow">Vote</p>
                <h2>투표 대상 선택</h2>
              </div>
              <p className="voteCount">
                투표 완료: {voteState.votedCount ?? 0} / {voteState.totalVoterCount ?? 0}
              </p>
            </div>
            {voteState.hasVoted && <p className="turnHint">투표 완료</p>}
            <div className="playerList">
              {voteTargets.map((player) => (
                <div className="playerRow" key={player.playerId}>
                  <span className="playerRowName">{player.nickname}</span>
                  <button
                    className="smallButton"
                    type="button"
                    onClick={() => onVote(player.playerId, playerId)}
                    disabled={sessionReplaced || voteState.hasVoted || !voteState.canVote || !playerId || isDead}
                  >
                    투표하기
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 최후 변론 */}
        {phase === "FINAL_DEFENSE" && (
          <div className="sectionBlock">
            <p className="eyebrow">Final Defense</p>
            <h2>최후 변론 (10초)</h2>
            <p className="topicTextNoBox" style={{ marginTop: "8px" }}>
              {isFinalDefenseCandidate
                ? "당신은 단독 최다 득표자입니다. 남은 10초 동안 최후 변론 시간입니다!"
                : `단독 최다 득표자 (${getTurnName(players, finalDefense?.candidatePlayerId)})의 최후 변론이 진행 중입니다.`}
            </p>
            <div className="gaugeTrack">
              <div className="gaugeBar" style={{ width: `${gaugeProgress}%` }} />
            </div>
          </div>
        )}

        {/* 최종 판결 KILL/SAVE */}
        {phase === "FINAL_VOTE" && (
          <div className="sectionBlock">
            <p className="eyebrow">Final Vote</p>
            <h2>최종 판결 (KILL / SAVE)</h2>
            <p className="topicTextNoBox" style={{ marginTop: "8px" }}>
              후보자를 제외한 생존 플레이어는 판결을 선택해주세요. (10초)
            </p>
            <div className="gaugeTrack" style={{ marginBottom: "12px" }}>
              <div className="gaugeBar" style={{ width: `${gaugeProgress}%` }} />
            </div>
            {!isDead && normalizeId(finalVote?.candidatePlayerId) !== myPlayerId && (
              finalVoteSubmitted ? (
                <p className="turnHint" style={{ marginTop: "12px" }}>
                  {finalVoteSubmitted === true ? "투표 완료" : <><strong>{finalVoteSubmitted === "KILL" ? "🔴 KILL (탈락)" : "🟢 SAVE (생존)"}</strong> 투표 완료</>}
                </p>
              ) : (
                <div style={{ marginTop: "12px", display: "flex", gap: "12px" }}>
                  <button className="primaryButton" type="button" onClick={() => handleFinalVoteClick("KILL")} disabled={!canSubmitFinalVote} style={{ background: "#ff5277" }}>
                    KILL (탈락)
                  </button>
                  <button className="ghostButton" type="button" onClick={() => handleFinalVoteClick("SAVE")} disabled={!canSubmitFinalVote}>
                    SAVE (생존)
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* 투표 결과 */}
        {phase === "VOTE_RESULT" && voteResult && (
          <div className="sectionBlock">
            <p className="eyebrow">Vote Result</p>
            <h2>라운드 투표 결과</h2>
            <p className="topicTextNoBox" style={{ marginTop: "6px" }}>
              {voteResult.eliminated
                ? `${voteResult.eliminatedPlayerNickname}님이 KILL 판결로 탈락했습니다.`
                : "SAVE 판결 또는 동수로 탈락자가 발생하지 않았습니다."}
            </p>
            <div className="infoGrid" style={{ marginTop: "12px" }}>
              <div className="infoRow">
                <span className="infoLabel">최다 득표자:</span>
                <span className="infoValue">{voteResult.mostVotedPlayerNickname || "-"}</span>
              </div>
              {/* KILL(탈락) 실행 시에만 라이어 여부 노출 (SAVE 시에는 비공개) */}
              {voteResult.eliminated && (
                <div className="infoRow">
                  <span className="infoLabel">라이어 판정 결과:</span>
                  <span className="infoValue">{voteResult.liarFound ? "실제 라이어 맞음 🎯" : "시민 (라이어 아님) 👤"}</span>
                </div>
              )}
            </div>
            {!voteResult.liarFound && voteResult.eliminated && (
              <p style={{ margin: "8px 0 0", color: "#ff5277", fontWeight: "bold", fontSize: "14px" }}>
                ⚠️ 라이어가 아닌 무고한 시민이 탈락하여 게임을 계속 진행합니다.
              </p>
            )}
            <div className="gaugeTrack">
              <div className="gaugeBar" style={{ width: `${gaugeProgress}%` }} />
            </div>
            <p className="turnHint" style={{ marginTop: "8px", textAlign: "right", fontSize: "13px" }}>
              서버 자동 다음 라운드 진입 중...
            </p>
          </div>
        )}

        {/* 게임 종료 모달 */}
        {phase === "GAME_OVER" && gameOverResult && (
          <div className="modalBackdrop">
            <div className="modal" style={{ width: "min(500px, 100%)", textAlign: "center" }}>
              <p className="eyebrow">Game Over</p>
              <h2 style={{ fontSize: "28px", marginTop: "8px", color: "#ffffff" }}>
                {gameOverResult.winner === "CITIZEN" ? "시민 팀 승리" : "라이어 팀 승리"}
              </h2>
              <p className="topicTextNoBox" style={{ marginTop: "16px" }}>
                {gameOverResult.winner === "CITIZEN" ? "라이어를 찾아냈습니다" : "끝까지 정체를 숨겼습니다"}
              </p>
              <div className="infoGrid" style={{ marginTop: "16px", textAlign: "left" }}>
                <div className="infoRow">
                  <span className="infoLabel">실제 라이어:</span>
                  <span className="infoValue">{gameOverResult.liarPlayerNickname || "-"}</span>
                </div>
                <div className="infoRow">
                  <span className="infoLabel">승리 진영:</span>
                  <span className="infoValue">{gameOverResult.winner === "CITIZEN" ? "시민" : "라이어"}</span>
                </div>
              </div>
              <div style={{ marginTop: "20px" }}>
                <button className="primaryButton" type="button" onClick={onConfirmGameOver} style={{ width: "100%" }}>확인</button>
              </div>
            </div>
          </div>
        )}

        {/* 채팅 로그 */}
        <div className="speechLogSection" style={{ marginTop: "24px" }}>
          <p className="eyebrow">채팅 창</p>
          {speechLogs.length === 0 ? (
            <p className="empty">아직 발언이 없습니다.</p>
          ) : (
            <div className="speechLogList" ref={chatContainerRef}>
              {speechLogs.map((log, index) => (
                <div className="speechLogRow" key={`${log.playerId}-${index}`}>
                  <span className="speechSpeaker">[{resolveNickname(log, players)}]</span>
                  <span className="speechContent">{log.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 플레이어 현황 */}
        <div className="playerList" style={{ marginTop: "24px" }}>
          <p className="eyebrow" style={{ marginBottom: "8px" }}>플레이어 현황</p>
          {orderedPlayers.map((player, index) => {
            const id = normalizeId(player.playerId);
            const isTurn = id === currentTurnPlayerId;
            const isPlayerDead = player.status === "DEAD";
            const isMe = id === myPlayerId;
            return (
              <div className={`playerRow${isTurn ? " isCurrentTurn" : ""}${isPlayerDead ? " isDead" : ""}`} key={id}>
                <span className="playerRowName">
                  {index + 1}. {player.nickname} {isPlayerDead ? "(탈락)" : "(생존)"}
                </span>
                <div className="playerRowBadges">
                  {isMe && <em className="badgeMe">나</em>}
                  {isPlayerDead ? (
                    <span style={{ color: "#ff5277", fontWeight: "bold" }}>💀 탈락</span>
                  ) : isTurn ? (
                    <b className="badgeHost">현재 턴</b>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function resolveNickname(log, players) {
  if (log.nickname) return log.nickname;
  const matched = players.find((p) => normalizeId(p.playerId) === normalizeId(log.playerId));
  return matched?.nickname || '알 수 없음';
}

function getTurnName(players, turnPlayerId) {
  if (!turnPlayerId) return "대기 중";
  const p = players.find((pl) => normalizeId(pl.playerId) === normalizeId(turnPlayerId));
  return p ? p.nickname : "대기 중";
}

function getOrderedPlayers(players, turnOrder = []) {
  if (!turnOrder.length) return players;
  const byId = new Map(players.map((p) => [String(p.playerId), p]));
  const ordered = turnOrder.map((t) => byId.get(String(typeof t === "object" ? t.playerId : t))).filter(Boolean);
  return ordered.length ? ordered : players;
}

function normalizeId(id) {
  if (id == null) return "";
  return String(id).trim();
}
