import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";

type Player = {
  id: string;
  name: string;
};

type LobbyState = {
  roomCode?: string;
  playerName?: string;
  players?: Player[];
  inviteToken?: string;
};

function readStoredLobby(): LobbyState {
  const rawLobby = sessionStorage.getItem("drawing-game-lobby");

  if (!rawLobby) {
    return {};
  }

  try {
    return JSON.parse(rawLobby) as LobbyState;
  } catch {
    return {};
  }
}

function Lobby() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as LobbyState | null;
  const storedLobby = readStoredLobby();
  const initialRoomCode = routeState?.roomCode ?? storedLobby.roomCode ?? "";
  const initialPlayerName =
    routeState?.playerName ?? storedLobby.playerName ?? "";
  const initialPlayers = routeState?.players ?? storedLobby.players ?? [];
  const initialInviteToken =
    routeState?.inviteToken ?? storedLobby.inviteToken ?? "";

  const [roomCode] = useState(initialRoomCode);
  const [playerName] = useState(initialPlayerName);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [inviteToken] = useState(initialInviteToken);
  const [copied, setCopied] = useState(false);

  const inviteLink = inviteToken
    ? `${window.location.origin}/?invite=${inviteToken}`
    : "";

  const copyToClipboard = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    const handlePlayerListUpdated = (payload: {
      roomCode: string;
      players: Player[];
    }) => {
      if (payload.roomCode !== roomCode) {
        return;
      }

      setPlayers(payload.players);
      sessionStorage.setItem(
        "drawing-game-lobby",
        JSON.stringify({
          roomCode: payload.roomCode,
          playerName,
          players: payload.players,
          inviteToken,
        }),
      );
    };

    socket.on("player_list_updated", handlePlayerListUpdated);

    return () => {
      socket.off("player_list_updated", handlePlayerListUpdated);
    };
  }, [playerName, roomCode, inviteToken]);

  if (!roomCode) {
    return (
      <main className="shell lobby-shell">
        <section className="panel lobby-panel">
          <p className="eyebrow">Lobby unavailable</p>
          <h1>No room session found.</h1>
          <p className="lede">
            Go back to the home screen and create or join a room first.
          </p>
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

  return (
    <main className="shell lobby-shell">
      <section className="panel lobby-panel">
        <div className="lobby-header">
          <div>
            <p className="eyebrow">Lobby</p>
            <h1>Room {roomCode}</h1>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("/")}
          >
            Leave lobby
          </button>
        </div>

        <p className="lede">You are connected as {playerName || "Player"}.</p>

        {!inviteToken && (
          <div className="room-card">
            <span className="room-label">Room code</span>
            <strong className="room-code">{roomCode}</strong>
          </div>
        )}

        {inviteToken && (
          <div className="room-card invite-card">
            <span className="room-label">📎 Invite Link</span>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <input
                type="text"
                readOnly
                value={inviteLink}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={copyToClipboard}
                style={{ whiteSpace: "nowrap" }}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate("/game", { state: { roomCode, playerName } })}
        >
          🎨 Start Drawing
        </button>
      </section>

      <section className="panel players-panel">
        <div className="section-heading">
          <p className="eyebrow">Players</p>
          <h2>Live player list</h2>
        </div>

        <ul className="player-list">
          {players.map((player) => (
            <li key={player.id} className="player-item">
              <span className="player-dot" aria-hidden="true" />
              <span>{player.name}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default Lobby;
