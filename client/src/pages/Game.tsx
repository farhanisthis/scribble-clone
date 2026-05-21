import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";

// ─── Types ──────────────────────────────────────────────────────

type Point = { x: number; y: number };

type Stroke = {
  points: Point[];
  color: string;
  size: number;
};

type Player = { id: string; name: string; isReady?: boolean };

type ChatMessage = {
  type: "chat" | "correct_guess" | "system";
  playerName?: string;
  text: string;
};

type GameInfo = {
  status: "waiting" | "choosing" | "drawing" | "round_over" | "game_over";
  round: number;
  maxRounds: number;
  currentDrawerId: string | null;
  currentDrawerName: string | null;
  maskedWord: string;
  currentWord: string | null;
  wordChoices: string[];
  roundTimeLeft: number;
  isDrawer: boolean;
  scores: Record<string, number>;
  guessedPlayers: string[];
  isHost: boolean;
  isPublic: boolean;
  inviteToken?: string | null;
  hostName: string | null;
  settings: {
    maxPlayers: number;
    rounds: number;
    drawTime: number;
    wordCount?: number;
    hints?: number;
  };
};

type RouteState = {
  roomCode?: string;
  playerName?: string;
};

// ─── Constants ──────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#ffffff",
  "#000000",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#92400e",
  "#64748b",
];

const SIZE_OPTIONS = [3, 6, 10, 16, 24];
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 420;

// ─── Component ──────────────────────────────────────────────────

function Game() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as RouteState | null;
  const roomCode = routeState?.roomCode ?? "";
  const playerName = routeState?.playerName ?? "";

  // ── Canvas refs ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // ── Drawing state (refs — no re-renders needed) ──
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const remoteStrokeRef = useRef<Stroke | null>(null);

  // ── React state for UI ──
  const [brushColor, setBrushColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(6);

  // ── Game state (driven entirely by the server) ──
  const [players, setPlayers] = useState<Player[]>([]);
  const [game, setGame] = useState<GameInfo>({
    status: "waiting",
    round: 0,
    maxRounds: 3,
    currentDrawerId: null,
    currentDrawerName: null,
    maskedWord: "",
    currentWord: null,
    wordChoices: [],
    roundTimeLeft: 0,
    isDrawer: false,
    scores: {},
    guessedPlayers: [],
    isHost: false,
    isPublic: true,
    hostName: null,
    settings: { maxPlayers: 8, rounds: 3, drawTime: 60 },
  });
  const [revealedWord, setRevealedWord] = useState<string | null>(null);

  // ── Chat state ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref of isDrawer so mouse handlers always see the latest value
  // without re-creating the callbacks (which would cause effect churn).
  const isDrawerRef = useRef(game.isDrawer);
  isDrawerRef.current = game.isDrawer;

  const gameStatusRef = useRef(game.status);
  gameStatusRef.current = game.status;

  // ─── Canvas helpers ───────────────────────────────────────────

  const applyBrushSettings = useCallback(
    (ctx: CanvasRenderingContext2D, color: string, size: number) => {
      if (color === "eraser") {
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.globalCompositeOperation = "destination-out";
      } else {
        ctx.strokeStyle = color;
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    },
    [],
  );

  const redrawAllStrokes = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      if (stroke.points.length === 0) continue;
      applyBrushSettings(ctx, stroke.color, stroke.size);
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.closePath();
    }
  }, [applyBrushSettings]);

  // ─── Init canvas once ─────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;
    applyBrushSettings(ctx, brushColor, brushSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Socket listeners ─────────────────────────────────────────

  useEffect(() => {
    const ctx = ctxRef.current;

    // ── Game state sync ──
    const handleGameState = (payload: {
      roomCode: string;
      players: Player[];
      game: GameInfo;
    }) => {
      if (payload.roomCode !== roomCode) return;
      setPlayers(payload.players);
      setGame(payload.game);
    };

    const handlePlayerList = (payload: {
      roomCode: string;
      players: Player[];
    }) => {
      if (payload.roomCode !== roomCode) return;
      setPlayers(payload.players);
    };

    const handleTimerTick = (data: { timeLeft: number }) => {
      setGame((prev) => ({ ...prev, roundTimeLeft: data.timeLeft }));
    };

    const handleTurnOver = (data: { word: string }) => {
      setRevealedWord(data.word);
    };

    // ── Chat messages ──
    const handleChatMessage = (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev.slice(-100), msg]); // Keep last 100

      let isOverlay = false;
      if (msg.type === "correct_guess") isOverlay = true;
      if (
        msg.type === "system" &&
        (msg.text.includes("Game over") ||
          msg.text.includes("Game started") ||
          msg.text.includes("The word was"))
      ) {
        isOverlay = true;
      }

      if (isOverlay) {
        setOverlayMessage(msg.text);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => {
          setOverlayMessage(null);
        }, 3500);
      }
    };

    const handleGameOver = () => {
      // game_state_update will set status to "game_over".
      // The overlay is rendered based on that status.
    };

    // ── Drawing sync (remote strokes) ──
    const handleDrawStart = (data: {
      x: number;
      y: number;
      color: string;
      size: number;
    }) => {
      if (!ctx) return;
      applyBrushSettings(ctx, data.color, data.size);
      ctx.beginPath();
      ctx.moveTo(data.x, data.y);
      remoteStrokeRef.current = {
        points: [{ x: data.x, y: data.y }],
        color: data.color,
        size: data.size,
      };
    };

    const handleDrawMove = (data: { x: number; y: number }) => {
      if (!ctx) return;
      ctx.lineTo(data.x, data.y);
      ctx.stroke();
      remoteStrokeRef.current?.points.push({ x: data.x, y: data.y });
    };

    const handleDrawEnd = () => {
      if (!ctx) return;
      ctx.closePath();
      if (remoteStrokeRef.current) {
        strokesRef.current.push(remoteStrokeRef.current);
        remoteStrokeRef.current = null;
      }
      applyBrushSettings(ctx, brushColor, brushSize);
    };

    const handleDrawData = () => {
      // Backup sync — draw_end already handled saving the stroke.
    };

    const handleCanvasClear = () => {
      strokesRef.current = [];
      remoteStrokeRef.current = null;
      const canvas = canvasRef.current;
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleDrawUndo = () => {
      strokesRef.current.pop();
      redrawAllStrokes();
    };

    // Register all listeners.
    socket.on("game_state_update", handleGameState);
    socket.on("player_list_updated", handlePlayerList);
    socket.on("timer_tick", handleTimerTick);
    socket.on("turn_over", handleTurnOver);
    socket.on("chat_message", handleChatMessage);
    socket.on("game_over", handleGameOver);
    socket.on("draw_start", handleDrawStart);
    socket.on("draw_move", handleDrawMove);
    socket.on("draw_end", handleDrawEnd);
    socket.on("draw_data", handleDrawData);
    socket.on("canvas_clear", handleCanvasClear);
    socket.on("draw_undo", handleDrawUndo);

    // Rejoin the room on mount (handles page refresh)
    if (roomCode) {
      socket.emit("join_private_room", { roomCode, playerName }, () => {
        socket.emit("request_game_state");
      });
    }

    return () => {
      socket.off("game_state_update", handleGameState);
      socket.off("player_list_updated", handlePlayerList);
      socket.off("timer_tick", handleTimerTick);
      socket.off("turn_over", handleTurnOver);
      socket.off("chat_message", handleChatMessage);
      socket.off("game_over", handleGameOver);
      socket.off("draw_start", handleDrawStart);
      socket.off("draw_move", handleDrawMove);
      socket.off("draw_end", handleDrawEnd);
      socket.off("draw_data", handleDrawData);
      socket.off("canvas_clear", handleCanvasClear);
      socket.off("draw_undo", handleDrawUndo);
    };
  }, [roomCode, brushColor, brushSize, applyBrushSettings, redrawAllStrokes]);

  // Clear the revealed word when leaving round_over.
  useEffect(() => {
    if (game.status !== "round_over") {
      setRevealedWord(null);
    }
  }, [game.status]);

  // Auto-scroll chat to the bottom on new messages.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ─── Mouse helpers ────────────────────────────────────────────

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.nativeEvent.offsetX / rect.width) * canvas.width,
      y: (e.nativeEvent.offsetY / rect.height) * canvas.height,
    };
  };

  /** Can the local player draw right now? */
  const canDraw = () => {
    // During the "waiting" phase anyone can free-draw (sandbox mode).
    if (gameStatusRef.current === "waiting") return true;
    // During the active game, only the drawer can draw.
    return gameStatusRef.current === "drawing" && isDrawerRef.current;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canDraw()) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    isDrawingRef.current = true;
    const { x, y } = getCanvasCoords(e);

    applyBrushSettings(ctx, brushColor, brushSize);
    ctx.beginPath();
    ctx.moveTo(x, y);

    currentStrokeRef.current = {
      points: [{ x, y }],
      color: brushColor,
      size: brushSize,
    };

    socket.emit("draw_start", { x, y, color: brushColor, size: brushSize });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    currentStrokeRef.current?.points.push({ x, y });
    socket.emit("draw_move", { x, y });
  };

  const getTouchCoords = (e: React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      x: ((touch.clientX - rect.left) / rect.width) * canvas.width,
      y: ((touch.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // touch-action: none in CSS prevents scrolling, but preventDefault guarantees no zoom/pan on some older browsers
    if (!canDraw()) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    isDrawingRef.current = true;
    const { x, y } = getTouchCoords(e);

    applyBrushSettings(ctx, brushColor, brushSize);
    ctx.beginPath();
    ctx.moveTo(x, y);

    currentStrokeRef.current = {
      points: [{ x, y }],
      color: brushColor,
      size: brushSize,
    };

    socket.emit("draw_start", { x, y, color: brushColor, size: brushSize });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    const { x, y } = getTouchCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    currentStrokeRef.current?.points.push({ x, y });
    socket.emit("draw_move", { x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    isDrawingRef.current = false;
    ctx.closePath();

    if (currentStrokeRef.current) {
      strokesRef.current.push(currentStrokeRef.current);
      socket.emit("draw_data", { stroke: currentStrokeRef.current });
      currentStrokeRef.current = null;
    }
    socket.emit("draw_end", {});
  };

  const handleMouseLeave = () => {
    if (isDrawingRef.current) handleMouseUp();
  };

  // ─── Toolbar actions ──────────────────────────────────────────

  const handleClear = () => {
    if (!canDraw()) return;
    strokesRef.current = [];
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit("canvas_clear");
  };

  const handleUndo = () => {
    if (!canDraw()) return;
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    redrawAllStrokes();
    socket.emit("draw_undo");
  };

  // ─── Game actions ─────────────────────────────────────────────

  const handleStartGame = () => {
    socket.emit(
      "start_game",
      {},
      (res: { success: boolean; message?: string }) => {
        if (!res.success) {
          alert(res.message ?? "Could not start the game.");
        }
      },
    );
  };

  const handleWordSelect = (word: string) => {
    socket.emit("word_selected", { word });
  };

  /** Send a chat/guess message. */
  const handleSendGuess = () => {
    const text = chatInput.trim();
    if (!text) return;
    socket.emit("chat_guess", { message: text });
    setChatInput("");
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendGuess();
    }
  };

  // ─── Guard ────────────────────────────────────────────────────

  if (!roomCode) {
    return (
      <main className="shell game-shell">
        <section className="panel lobby-panel">
          <p className="eyebrow">No active session</p>
          <h1>Room not found.</h1>
          <p className="lede">Go back and create or join a room first.</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/")}
          >
            Back home
          </button>
        </section>
      </main>
    );
  }

  // ─── Determine what cursor the canvas should show ─────────────

  const canvasCanDraw =
    game.status === "waiting" || (game.status === "drawing" && game.isDrawer);

  // ─── Render ───────────────────────────────────────────────────

  return (
    <main className="shell game-shell">
      {/* ── Left: Canvas area ── */}
      <section className="panel canvas-panel">
        {/* Header bar */}
        <div className="canvas-header">
          <div className="canvas-header-left">
            {game.status !== "waiting" && (
              <span className="round-badge">
                Round {game.round}/{game.maxRounds}
              </span>
            )}
            {game.status !== "waiting" && (
              <span
                className={`timer-badge${game.roundTimeLeft <= 10 && game.roundTimeLeft > 0 ? " timer-badge--urgent" : ""}`}
              >
                ⏱ {game.roundTimeLeft}s
              </span>
            )}
          </div>

          <div className="word-display">
            {game.status === "drawing" && game.isDrawer && game.currentWord && (
              <span className="word-text word-text--drawer">
                {game.currentWord}
              </span>
            )}
            {game.status === "drawing" && !game.isDrawer && (
              <span className="word-text word-text--guesser">
                {game.maskedWord}
              </span>
            )}
            {game.status === "choosing" && !game.isDrawer && (
              <span className="word-text word-text--guesser">
                {game.currentDrawerName} is choosing a word…
              </span>
            )}
            {game.status === "round_over" && revealedWord && (
              <span className="word-text word-text--revealed">
                The word was: <strong>{revealedWord}</strong>
              </span>
            )}
          </div>

          <span className="player-badge">
            <span className="player-dot" aria-hidden="true" />
            {playerName || "Player"}
          </span>
        </div>

        <div className="canvas-and-chat">
          {/* Canvas with overlay for word choosing */}
          <div className="canvas-wrapper">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="drawing-canvas"
              style={{ cursor: canvasCanDraw ? "crosshair" : "not-allowed" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
              onTouchCancel={handleMouseLeave}
            />

            {/* Word chooser overlay — only the drawer sees this */}
            {game.status === "choosing" && game.isDrawer && (
              <div className="word-overlay">
                <p className="word-overlay-title">Choose a word to draw</p>
                <div className="word-choices">
                  {game.wordChoices.map((word) => (
                    <button
                      key={word}
                      type="button"
                      className="word-choice-btn"
                      onClick={() => handleWordSelect(word)}
                    >
                      {word}
                    </button>
                  ))}
                </div>
                <p className="word-overlay-timer">
                  Auto-selecting in {game.roundTimeLeft}s
                </p>
              </div>
            )}

            {/* Waiting for choosing — non-drawer sees overlay */}
            {game.status === "choosing" && !game.isDrawer && (
              <div className="word-overlay word-overlay--waiting">
                <p className="word-overlay-title">
                  ✏️ {game.currentDrawerName} is choosing a word…
                </p>
              </div>
            )}

            {/* Game over overlay */}
            {game.status === "game_over" && (
              <div className="word-overlay word-overlay--gameover">
                <p className="word-overlay-title">🏆 Game Over!</p>
                <div className="gameover-rankings">
                  {[...players]
                    .sort(
                      (a, b) =>
                        (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0),
                    )
                    .map((p, i) => (
                      <div
                        key={p.id}
                        className={`gameover-row ${
                          i === 0 ? "gameover-row--winner" : ""
                        }`}
                      >
                        <span className="gameover-rank">
                          {i === 0
                            ? "🥇"
                            : i === 1
                              ? "🥈"
                              : i === 2
                                ? "🥉"
                                : `#${i + 1}`}
                        </span>
                        <span className="gameover-name">{p.name}</span>
                        <span className="gameover-score">
                          {game.scores[p.id] ?? 0} pts
                        </span>
                      </div>
                    ))}
                </div>
                <p className="word-overlay-timer">Returning to lobby…</p>
              </div>
            )}

            {/* Dynamic Announcement Overlay */}
            {overlayMessage && (
              <div className="canvas-announcement-overlay">
                <h2>{overlayMessage}</h2>
              </div>
            )}
          </div>
          {/* ── Chat box (right of canvas) ── */}
          {game.status !== "waiting" && (
            <div className="chat-box">
              <div className="chat-messages">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`chat-msg chat-msg--${msg.type}`}>
                    {msg.type === "chat" && (
                      <>
                        <strong>{msg.playerName}: </strong>
                        {msg.text}
                      </>
                    )}
                    {msg.type === "correct_guess" && <span>✅ {msg.text}</span>}
                    {msg.type === "system" && <em>{msg.text}</em>}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              {!game.isDrawer && game.status === "drawing" && (
                <div className="chat-input-row">
                  <input
                    type="text"
                    className="chat-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Type your guess…"
                    maxLength={50}
                  />
                  <button
                    type="button"
                    className="chat-send-btn"
                    onClick={handleSendGuess}
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Right: Sidebar ── */}
      <section className="panel toolbar-panel">
        {/* ── Waiting phase: player list + start button ── */}
        {game.status === "waiting" && (
          <>
            <div className="section-heading">
              <p className="eyebrow">Lobby</p>
              
            </div>

            {!game.inviteToken ? (
              <div className="room-card">
                <span className="room-label">Room code</span>
                <strong className="room-code">{roomCode}</strong>
              </div>
            ) : (
              <div className="room-card invite-card">
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                      marginTop: 8,
                    justifyContent: "center",
                  }}
                >
                  
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={(e) => {
                      const inviteUrl = `${window.location.origin}/?invite=${game.inviteToken}`;
                      navigator.clipboard.writeText(inviteUrl);
                      const btn = e.currentTarget;
                      const originalText = btn.innerText;
                      btn.innerText = "✓ Copied";
                      setTimeout(() => (btn.innerText = originalText), 2000);
                    }}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Copy Invite Link 🔗
                  </button>
                </div>
              </div>
            )}

            {/* Room type badge + settings */}
            <div className="lobby-info">
              <span
                className={`room-badge ${game.isPublic ? "room-badge--public" : "room-badge--private"}`}
              >
                {game.isPublic ? "🌐 Public" : "🔒 Private"}
              </span>
              <span className="lobby-setting">
                {game.settings.rounds} rounds
              </span>
              <span className="lobby-setting">
                {game.settings.drawTime}s draw time
              </span>
              <span className="lobby-setting">
                Max {game.settings.maxPlayers} players
              </span>
            </div>

            <div className="section-heading">
              <p className="eyebrow">
                Players ({players.length}/{game.settings.maxPlayers})
              </p>
            </div>

            <ul className="player-list">
              {players.map((p) => (
                <li key={p.id} className="player-item">
                  <span className="player-dot" aria-hidden="true" />
                  <span>
                    {p.name}
                    {game.isPublic
                      ? null
                      : p.id === socket.id && game.isHost
                        ? " 👑"
                        : null}
                  </span>
                  <span className="player-score" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {p.isReady ? <span title="Ready" style={{ color: '#10b981' }}>✓</span> : null}
                    {game.scores[p.id] ?? 0}
                  </span>
                </li>
              ))}
            </ul>

            {/* Start / Ready button */}
            {game.isPublic || game.isHost ? (
              <button
                type="button"
                className="primary-button"
                onClick={handleStartGame}
                disabled={players.length < 2}
                style={{ marginTop: "auto" }}
              >
                {players.length < 2 ? "Need 2+ players" : "🎮 Start Game"}
              </button>
            ) : (
              <button
                type="button"
                className={`primary-button ${players.find(p => p.id === socket.id)?.isReady ? 'secondary-button' : ''}`}
                onClick={() => socket.emit("toggle_ready")}
                style={{ marginTop: "auto" }}
              >
                {players.find(p => p.id === socket.id)?.isReady ? "Cancel Ready" : "✓ Ready Up"}
              </button>
            )}
            
            {!game.isPublic && !game.isHost && (
              <div className="waiting-for-host" style={{ marginTop: '12px' }}>
                <p>
                  ⏳ Waiting for <strong>{game.hostName ?? "host"}</strong> to
                  start the game…
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Active game: drawing tools (only for drawer) ── */}
        {game.status !== "waiting" &&
          game.status !== "game_over" &&
          game.isDrawer && (
            <>
              <div className="section-heading">
                <p className="eyebrow">Your turn!</p>
                <h2>Draw: {game.currentWord ?? "…"}</h2>
              </div>

              {/* Color Picker */}
              <div className="tool-group">
                <span className="tool-label">Color</span>
                <div className="color-grid">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch ${brushColor === color ? "color-swatch--active" : ""}`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setBrushColor(color);
                        const ctx = ctxRef.current;
                        if (ctx) applyBrushSettings(ctx, color, brushSize);
                      }}
                      aria-label={`Select color ${color}`}
                    />
                  ))}
                  <label 
                    className={`color-swatch ${brushColor !== "eraser" && !COLOR_PALETTE.includes(brushColor) ? "color-swatch--active" : ""}`}
                    style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', background: brushColor !== "eraser" ? brushColor : '#ffffff' }}
                    title="Custom Color"
                  >
                    <input
                      type="color"
                      value={brushColor !== "eraser" ? brushColor : "#ffffff"}
                      onChange={(e) => {
                        const newColor = e.target.value;
                        setBrushColor(newColor);
                        const ctx = ctxRef.current;
                        if (ctx) applyBrushSettings(ctx, newColor, brushSize);
                      }}
                      style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer' }}
                    />
                    <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', mixBlendMode: 'difference', color: '#fff', fontSize: '12px' }}>+</span>
                  </label>
                  <button
                    type="button"
                    className={`color-swatch ${brushColor === "eraser" ? "color-swatch--active" : ""}`}
                    style={{ 
                      background: "repeating-linear-gradient(45deg, #eee, #eee 4px, #ccc 4px, #ccc 8px)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px"
                    }}
                    title="Eraser"
                    onClick={() => {
                      setBrushColor("eraser");
                      const ctx = ctxRef.current;
                      if (ctx) applyBrushSettings(ctx, "eraser", brushSize);
                    }}
                  >
                    🧹
                  </button>
                </div>
              </div>

              {/* Brush Size */}
              <div className="tool-group">
                <span className="tool-label">Size</span>
                <div className="size-options">
                  {SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`size-button ${brushSize === size ? "size-button--active" : ""}`}
                      onClick={() => {
                        setBrushSize(size);
                        const ctx = ctxRef.current;
                        if (ctx) applyBrushSettings(ctx, brushColor, size);
                      }}
                    >
                      <span
                        className="size-dot"
                        style={{
                          width: Math.max(size, 6),
                          height: Math.max(size, 6),
                          backgroundColor: brushColor,
                        }}
                      />
                      <span className="size-label">{size}px</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="tool-group">
                <span className="tool-label">Actions</span>
                <div className="action-buttons">
                  <button
                    type="button"
                    className="secondary-button action-btn"
                    onClick={handleUndo}
                  >
                    ↩ Undo
                  </button>
                  <button
                    type="button"
                    className="secondary-button action-btn action-btn--danger"
                    onClick={handleClear}
                  >
                    🗑 Clear
                  </button>
                </div>
              </div>

              {/* Leaderboard (drawer sees scores too) */}
              <div className="tool-group">
                <span className="tool-label">Scores</span>
                <ul className="player-list">
                  {[...players]
                    .sort(
                      (a, b) =>
                        (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0),
                    )
                    .map((p) => (
                      <li
                        key={p.id}
                        className={`player-item ${
                          p.id === game.currentDrawerId
                            ? "player-item--drawer"
                            : ""
                        } ${
                          game.guessedPlayers.includes(p.id)
                            ? "player-item--guessed"
                            : ""
                        }`}
                      >
                        <span className="player-dot" aria-hidden="true" />
                        <span>
                          {p.name}
                          {p.id === game.currentDrawerId && " ✏️"}
                          {game.guessedPlayers.includes(p.id) && " ✅"}
                        </span>
                        <span className="player-score">
                          {game.scores[p.id] ?? 0}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            </>
          )}

        {/* ── Active game: guesser view ── */}
        {game.status !== "waiting" &&
          game.status !== "game_over" &&
          !game.isDrawer && (
            <>
              <div className="section-heading">
                <p className="eyebrow">
                  {game.status === "round_over"
                    ? "Turn ended"
                    : `${game.currentDrawerName ?? "?"} is drawing`}
                </p>
                <h2>
                  {game.status === "round_over"
                    ? revealedWord
                      ? `The word was: ${revealedWord}`
                      : "Waiting…"
                    : game.maskedWord || "…"}
                </h2>
              </div>

              <div className="section-heading" style={{ marginTop: 12 }}>
                <p className="eyebrow">Leaderboard</p>
              </div>

              <ul className="player-list">
                {[...players]
                  .sort(
                    (a, b) =>
                      (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0),
                  )
                  .map((p) => (
                    <li
                      key={p.id}
                      className={`player-item ${
                        p.id === game.currentDrawerId
                          ? "player-item--drawer"
                          : ""
                      } ${
                        game.guessedPlayers.includes(p.id)
                          ? "player-item--guessed"
                          : ""
                      }`}
                    >
                      <span className="player-dot" aria-hidden="true" />
                      <span>
                        {p.name}
                        {p.id === game.currentDrawerId && " ✏️"}
                        {game.guessedPlayers.includes(p.id) && " ✅"}
                      </span>
                      <span className="player-score">
                        {game.scores[p.id] ?? 0}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}

        {/* ── Game over sidebar ── */}
        {game.status === "game_over" && (
          <>
            <div className="section-heading">
              <p className="eyebrow">Game Over</p>
              <h2>Final Scores</h2>
            </div>
            <ul className="player-list">
              {[...players]
                .sort(
                  (a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0),
                )
                .map((p, i) => (
                  <li
                    key={p.id}
                    className={`player-item ${i === 0 ? "player-item--winner" : ""}`}
                  >
                    <span className="gameover-rank-inline">
                      {i === 0
                        ? "🥇"
                        : i === 1
                          ? "🥈"
                          : i === 2
                            ? "🥉"
                            : `#${i + 1}`}
                    </span>
                    <span>{p.name}</span>
                    <span className="player-score">
                      {game.scores[p.id] ?? 0}
                    </span>
                  </li>
                ))}
            </ul>
          </>
        )}

        {/* Leave button (always visible) */}
        <button
          type="button"
          className="secondary-button"
          style={{ marginTop: game.status === "waiting" ? 0 : "auto" }}
          onClick={() => navigate("/")}
        >
          ← Leave
        </button>
      </section>
    </main>
  );
}

export default Game;
