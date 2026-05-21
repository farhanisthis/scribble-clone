import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Game from "./pages/Game";
import { socket } from "./socket";

function App() {
  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/game" element={<Game />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
