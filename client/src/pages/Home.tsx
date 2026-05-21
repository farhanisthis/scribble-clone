import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { socket } from "../socket";
import scribloLogo from "../assets/scriblo-logo.png";

// ─── Types ──────────────────────────────────────────────────────

type Player = { id: string; name: string };

type RoomResponse = {
  success: boolean;
  roomCode?: string;
  players?: Player[];
  game?: Record<string, unknown>;
  message?: string;
};

// ─── Component ──────────────────────────────────────────────────

function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [playerName, setPlayerName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"play" | "create" | "join" | null>(
    null,
  );

  // Show / hide the private room panel.
  const [showPrivate, setShowPrivate] = useState(false);

  // Room settings (only used for private room creation).
  const [settings, setSettings] = useState({
    rounds: 3,
    drawTime: 60,
    maxPlayers: 8,
    wordCount: 3,
    hints: 2,
  });

  const inviteToken = searchParams.get("invite");

  // Show invite panel if invite token is in URL
  useEffect(() => {
    if (inviteToken) {
      setShowPrivate(true);
    }
  }, [inviteToken]);

  // Always leave any active room when returning to the home page
  useEffect(() => {
    socket.emit("leave_room");
  }, []);

  // Ensure the socket is connected before emitting.
  const ensureConnected = () => {
    if (!socket.connected) socket.connect();
  };

  // Navigate to the game page after a successful room action.
  const goToGame = (code: string, name: string) => {
    navigate("/game", { state: { roomCode: code, playerName: name } });
  };

  // ── Quick Play ────────────────────────────────────────────────
  // Auto-joins an existing public room or creates a new one.

  const handleQuickPlay = () => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      setError("Enter your name first!");
      return;
    }

    setError("");
    setLoading("play");
    ensureConnected();

    socket.emit("quick_play", { playerName: trimmed }, (res: RoomResponse) => {
      setLoading(null);
      if (!res?.success || !res.roomCode) {
        setError(res?.message ?? "Could not find a game.");
        return;
      }
      goToGame(res.roomCode, trimmed);
    });
  };

  // ── Create Private Room ───────────────────────────────────────

  const handleCreatePrivate = () => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      setError("Enter your name first!");
      return;
    }

    setError("");
    setLoading("create");
    ensureConnected();

    socket.emit(
      "create_private_room",
      {
        playerName: trimmed,
        settings,
      },
      (res: RoomResponse) => {
        setLoading(null);
        if (!res?.success || !res.roomCode) {
          setError(res?.message ?? "Could not create a private room.");
          return;
        }
        goToGame(res.roomCode, trimmed);
      },
    );
  };

  // ── Join Private Room ─────────────────────────────────────────

  // ── Join via Invite Token ──────────────────────────────────────

  const handleJoinViaInvite = () => {
    const trimmed = playerName.trim();

    if (!trimmed) {
      setError("Enter your name first!");
      return;
    }

    if (!inviteToken) {
      setError("No invite token found.");
      return;
    }

    setError("");
    setLoading("join");
    ensureConnected();

    socket.emit(
      "join_via_invite_token",
      { playerName: trimmed, inviteToken },
      (res: RoomResponse) => {
        setLoading(null);
        if (!res?.success || !res.roomCode) {
          setError(res?.message ?? "Could not join via invite link.");
          return;
        }
        goToGame(res.roomCode, trimmed);
      },
    );
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <main className="shell home-shell home-shell--centered">
      {/* ── Hero card ── */}
      <section className="panel hero-card">
        <p className="eyebrow">Multiplayer Drawing Game</p>
        <p className="lede">
          Draw, guess, and compete with friends in real time.
        </p>
        <div className="logo-container">
          <img src={scribloLogo} alt="Scriblo Logo" className="hero-logo" />
        </div>

        {/* Player name */}
        <label className="field">
          <span>Your name</span>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
          />
        </label>

        {error && <p className="error-banner">{error}</p>}

        {/* Big action buttons */}
        <div className="home-actions">
          {inviteToken ? (
            // Invite flow
            <button
              type="button"
              className="play-button"
              onClick={handleJoinViaInvite}
              disabled={loading !== null}
            >
              {loading === "join" ? "Joining..." : "✓ Join Room"}
            </button>
          ) : (
            // Normal flow
            <button
              type="button"
              className="play-button"
              onClick={handleQuickPlay}
              disabled={loading !== null}
            >
              {loading === "play" ? "Finding game..." : "▶ PLAY"}
            </button>
          )}

          {!inviteToken && (
            <button
              type="button"
              className="secondary-button private-toggle"
              onClick={() => setShowPrivate(!showPrivate)}
              disabled={loading !== null}
            >
              {showPrivate ? "✕ Close" : "🔒 Private Room"}
            </button>
          )}
        </div>

        {/* Private room panel (expandable) */}
        {showPrivate && !inviteToken && (
          <div className="private-panel">
            {/* Settings row */}
            <div className="settings-row">
              <label className="setting-field">
                <span>Rounds</span>
                <select
                  value={settings.rounds}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      rounds: Number(e.target.value),
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <label className="setting-field">
                <span>Draw Time</span>
                <select
                  value={settings.drawTime}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      drawTime: Number(e.target.value),
                    }))
                  }
                >
                  {[30, 45, 60, 90, 120].map((t) => (
                    <option key={t} value={t}>
                      {t}s
                    </option>
                  ))}
                </select>
              </label>

              <label className="setting-field">
                <span>Words</span>
                <select
                  value={settings.wordCount}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      wordCount: Number(e.target.value),
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <label className="setting-field">
                <span>Hints</span>
                <select
                  value={settings.hints}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      hints: Number(e.target.value),
                    }))
                  }
                >
                  <option value={0}>Disabled</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <label className="setting-field">
                <span>Players</span>
                <select
                  value={settings.maxPlayers}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      maxPlayers: Number(e.target.value),
                    }))
                  }
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={handleCreatePrivate}
              disabled={loading !== null}
              style={{ width: "100%" }}
            >
              {loading === "create" ? "Creating..." : "Create Private Room"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default Home;
