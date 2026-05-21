import { io } from "socket.io-client";

async function runTest() {
  console.log("Starting test...");
  const socket1 = io("http://localhost:3001");
  const socket2 = io("http://localhost:3001");

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log("Socket 1 ID:", socket1.id);
  console.log("Socket 2 ID:", socket2.id);

  socket1.emit("quick_play", { playerName: "Player1" }, (res1) => {
    console.log("Player 1 quick_play response:", res1.roomCode);
    
    socket2.emit("quick_play", { playerName: "Player2" }, (res2) => {
      console.log("Player 2 quick_play response:", res2.roomCode);
      process.exit(0);
    });
  });
}

runTest();
