# Scriblo! — Real-Time Multiplayer Drawing & Guessing Game

Scriblo! is a real-time multiplayer drawing and guessing game inspired by skribbl.io, built with React, Node.js, Express, and Socket.IO. Players can join public matches instantly or create private rooms with custom game settings to play with friends.

The game features synchronized canvas drawing, turn-based gameplay, live guessing chat, scoring system, leaderboard tracking, and server-authoritative multiplayer state management for a smooth real-time experience.

## Features

* 🎨 Real-time synchronized canvas drawing
* 🌐 Public matchmaking + private invite rooms
* 👥 Multiplayer lobby system
* ⏱ Turn-based rounds with timers
* 🧠 Random word selection system
* 💬 Live guessing/chat system
* 🏆 Dynamic scoring & leaderboard
* 🔄 Drawer rotation system
* 🖌 Brush colors, sizes, undo & clear tools
* ⚡ Built with Socket.IO for low-latency gameplay

## Tech Stack

### Frontend

* React
* Vite
* TypeScript
* CSS

### Backend

* Node.js
* Express.js
* Socket.IO

## Architecture Highlights

* Server-authoritative game state
* Real-time bidirectional communication
* Room-based multiplayer synchronization
* Canvas stroke synchronization using coordinate data
* Event-driven multiplayer architecture

## Getting Started

```bash
# Install frontend dependencies
cd client
npm install

# Install backend dependencies
cd ../server
npm install
```

```bash
# Start backend
npm run dev

# Start frontend
npm run dev
```

## Future Improvements

* Mobile responsiveness
* Friend invite links
* Drawing replay system
* Emoji reactions
* Persistent player profiles
* Spectator mode
