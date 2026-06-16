import { useState, useEffect, useRef } from "react";
import { getSession } from "../storage/session";

export default function GameScreen({
  room,
  roleInfo,
  playerId,
  speechLogs,
  onSpeak,
  phase,
  voteState,
  voteResult,
  gameOverResult,
  onVote,
  onConfirmVoteResult,
  onConfirmGameOver,
}) {
  const [content, setContent] = useState("");
  const players = room.players || [];
  const myPlayerId = normalizeId(playerId || getSession().playerId);
  const currentTurnPlayerId = normalizeId(room.currentTurnPlayerId);
  const role = roleInfo?.role;
  const topicWord = roleInfo?.topicWord;
  const currentTurnName = getTurnName(players, room.currentTurnPlayerId);
  const hasCurrentTurn = Boolean(currentTurnPlayerId);

  const myPlayer = players.find(
    (player) => String(player.playerId) === String(myPlayerId),
  );
  const myNickname = myPlayer?.nickname || "";
  const isDead = myPlayer?.status === "DEAD";

  const isMyTurn = Boolean(
    !isDead &&
    myPlayerId &&
    currentTurnPlayerId &&
    String(currentTurnPlayerId).trim() === String(myPlayerId).trim(),
  );

  const shouldGlowSpeakForm = Boolean(
    isMyTurn &&
    phase === "SPEECH" &&
    !isDead &&
    hasCurrentTurn
  );

  const isVoting = phase === "VOTE";
  const orderedPlayers = getOrderedPlayers(players, room.turnOrder);
  const currentPlayerId = playerId || getSession().playerId;

  const voteTargets = players.filter((player) => {
    const targetPlayerId = player.playerId;
    const isAlive = player.status !== "DEAD";
    return isAlive && String(targetPlayerId) !== String(currentPlayerId);
  });

  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [speechLogs]);

  function submit(event) {
    event.preventDefault();
    const value = content.trim();
    if (!value || !isMyTurn || isVoting || isDead) return;
    onSpeak(value, myPlayerId);
    setContent("");
  }

  return (
    <main className="appShell">
      <section className="lobbyHero">
        <p className="eyebrow">Game Room</p>
        <h1>{room.roomCode}번 방</h1>
        <p>
          {phase === "GAME_OVER"
            ? "최종 게임 종료"
            : phase === "VOTE_RESULT"
              ? "투표 결과 공개"
              : isVoting
                ? "투표 진행 중"
                : hasCurrentTurn
                  ? "게임 진행 중"
                  : "발언 단계 준비 중"}
        </p>
      </section>
      <section className="panel gamePanel">
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
                {role !== "LIAR" && (
                  <p className="topicTextNoBox">제시어: {topicWord || "-"}</p>
                )}
                {role === "LIAR" && (
                  <p className="topicTextNoBox" style={{ color: "#ff5277" }}>
                    당신은 라이어입니다
                  </p>
                )}
              </>
            )}
          </div>
          <div>
            <p className="eyebrow">Turn</p>
            <h2>
              {!hasCurrentTurn
                ? "발언 단계 준비 중"
                : isMyTurn
                  ? "내 차례입니다."
                  : `${currentTurnName}님의 차례입니다.`}
            </h2>
            {isDead && (
              <p className="turnHint">당신은 탈락했습니다 (관전 중)</p>
            )}
          </div>
        </div>
        <form className={`speakForm${shouldGlowSpeakForm ? " isGlow" : ""}`} onSubmit={submit}>
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={
              isDead
                ? "탈락한 플레이어입니다 (관전 중)"
                : !hasCurrentTurn
                  ? "대기 중"
                  : isVoting
                    ? "투표 단계 준비 중"
                    : role === "LIAR"
                      ? "라이어인 걸 들키지 않도록 대답해주세요!"
                      : "라이어가 알지 못하도록 대답해주세요!"
            }
            disabled={!isMyTurn || isVoting || !hasCurrentTurn || isDead}
            maxLength={200}
          />
          <button
            className="primaryButton"
            type="submit"
            disabled={
              !isMyTurn ||
              isVoting ||
              !hasCurrentTurn ||
              !content.trim() ||
              isDead
            }
          >
            입력
          </button>
        </form>
        {isVoting && (
          <div className="votePanel">
            <div className="listHeader">
              <div>
                <p className="eyebrow">Vote</p>
                <h2>투표 대상 선택</h2>
              </div>
              <p className="voteCount">
                투표 완료: {voteState.votedCount} / {voteState.totalCount}
              </p>
            </div>
            {voteState.hasVoted && <p className="turnHint">투표 완료</p>}
            <div className="players">
              {voteTargets.map((player) => {
                const targetPlayerId = player.playerId;
                return (
                  <div className="playerCard" key={targetPlayerId}>
                    <span>{player.nickname}</span>
                    <button
                      className="smallButton"
                      type="button"
                      onClick={() => onVote(targetPlayerId, playerId)}
                      disabled={voteState.hasVoted || !playerId || isDead}
                    >
                      투표하기
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {phase === "VOTE_RESULT" && voteResult && (
          <div className="votePanel">
            <div className="listHeader">
              <div>
                <p className="eyebrow">Vote Result</p>
                <h2>라운드 투표 결과</h2>
              </div>
            </div>
            <p className="topicText" style={{ marginTop: "6px" }}>
              {voteResult.eliminated
                ? `${voteResult.eliminatedPlayerNickname}님이 투표로 지목되어 탈락했습니다.`
                : "투표 결과 탈락자가 발생하지 않았습니다."}
            </p>
            <div className="resultGrid" style={{ marginTop: "12px" }}>
              <div className="speechItem">
                <strong>최다 득표자</strong>
                <span>{voteResult.mostVotedPlayerNickname || "-"}</span>
              </div>
              <div className="speechItem">
                <strong>라이어 판정 결과</strong>
                <span>
                  {voteResult.liarFound
                    ? "실제 라이어 맞음 🎯"
                    : "시민 (라이어 아님) 👤"}
                </span>
              </div>
            </div>
            {!voteResult.liarFound && voteResult.eliminated && (
              <p
                style={{
                  margin: "8px 0 0",
                  color: "#ff5277",
                  fontWeight: "bold",
                  fontSize: "14px",
                }}
              >
                ⚠️ 라이어가 아닌 무고한 시민이 탈락하여 게임을 계속 진행합니다.
              </p>
            )}
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                className="primaryButton"
                type="button"
                onClick={onConfirmVoteResult}
              >
                다음 라운드 확인
              </button>
            </div>
          </div>
        )}
        {phase === "GAME_OVER" && gameOverResult && (
          <div className="modalBackdrop">
            <div className="modal" style={{ width: "min(500px, 100%)", textAlign: "center" }}>
              <div className="listHeader" style={{ justifyContent: "center" }}>
                <div>
                  <p className="eyebrow">Game Over</p>
                  <h2 style={{ fontSize: "28px", marginTop: "8px", color: "#ffffff" }}>
                    {gameOverResult.winner === "CITIZEN"
                      ? "시민 팀 승리"
                      : "라이어 팀 승리"}
                  </h2>
                </div>
              </div>
              <p className="topicText" style={{ marginTop: "16px" }}>
                {gameOverResult.winner === "CITIZEN"
                  ? "라이어를 찾아냈습니다"
                  : "끝까지 정체를 숨겼습니다"}
              </p>
              <div className="resultGrid" style={{ marginTop: "16px" }}>
                <div className="speechItem" style={{ textAlign: "left" }}>
                  <strong>실제 라이어</strong>
                  <span>{gameOverResult.liarPlayerNickname || "-"}</span>
                </div>
                <div className="speechItem" style={{ textAlign: "left" }}>
                  <strong>승리 진영</strong>
                  <span>
                    {gameOverResult.winner === "CITIZEN" ? "시민" : "라이어"}
                  </span>
                </div>
              </div>
              <div
                style={{
                  marginTop: "20px",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <button
                  className="primaryButton"
                  type="button"
                  onClick={onConfirmGameOver}
                  style={{ width: "100%" }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="speechLog">
          <p className="eyebrow">채팅 창</p>
          {speechLogs.length === 0 ? (
            <p className="empty">아직 채팅이 없습니다.</p>
          ) : (
            <div className="speechLogList" ref={chatContainerRef}>
              {speechLogs.map((log, index) => (
                <div className="speechItem" key={`${log.playerId}-${index}`}>
                  <span>
                    [
                    {log.nickname ||
                      getTurnName(players, log.playerId) ||
                      log.playerId}
                    ] : {log.content}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="players">
          {orderedPlayers.map((player, index) => {
            const id = String(player.playerId);
            const isTurn = id === String(room.currentTurnPlayerId);
            const isDead = player.status === "DEAD";
            const isMe = id === String(myPlayerId);
            return (
              <div
                className={`playerCard${isTurn ? " isCurrentTurn" : ""}${isDead ? " isDead" : ""}${isMe ? " isMe" : ""}`}
                key={id}
              >
                <span>
                  {index + 1}. {player.nickname} {isDead ? "(탈락)" : "(생존)"}
                </span>
                <div>
                  {isMe && <em>나</em>}
                  {isDead ? (
                    <span style={{ color: "#ff5277", fontWeight: "bold" }}>
                      💀 탈락
                    </span>
                  ) : isTurn ? (
                    <b>현재 턴</b>
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

function getTurnName(players, currentTurnPlayerId) {
  const normalizedTurnId = normalizeId(currentTurnPlayerId);
  if (!normalizedTurnId) return "대기 중";
  const current = players.find(
    (player) => normalizeId(player.playerId) === normalizedTurnId,
  );
  return current ? current.nickname : "대기 중";
}

function getOrderedPlayers(players, turnOrder = []) {
  if (!turnOrder.length) return players;

  const byId = new Map(
    players.map((player) => [String(player.playerId), player]),
  );
  const ordered = turnOrder
    .map((turn) => {
      const id = typeof turn === "object" ? turn.playerId : turn;
      return byId.get(String(id));
    })
    .filter(Boolean);

  return ordered.length ? ordered : players;
}

function normalizeId(id) {
  if (id === null || id === undefined) return "";
  return String(id).trim();
}
