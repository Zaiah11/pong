const path = require("path");
const express = require("express");
const { userInfo } = require("os");
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const players = {};
function addPlayer (socketId, username) { 
  players[socketId] = { username, inGame: null } 
};
function usernameIsValid(username) {
  for (const id in players) {
    if (players[id].username === username) return false;
  }
  return true;
}

const games = {};
function getNewGameId() {
  const id = Math.random().toString().slice(0, 10);
  for (const existingId in games){
    if (id === existingId) return getNewGameId();
  }
  return id;
}
function newGame(hostId, playerId) {
  const newGameId = getNewGameId();
  games[newGameId] = { 
    [hostId]: { 
      connected: false
    }, 
    [playerId]: { 
      connected: false
    } 
  };
  return newGameId;
}

const PORT = process.env.PORT || 3000;
 
app.use(express.static(path.join(__dirname, "public")));

io.on('connection', (socket) => {
  socket.emit("update_id", socket.id);
  socket.on("login", function(username) {
    if (!usernameIsValid(username)) return socket.emit("login_failed", "username_taken");
    addPlayer(socket.id, username);
    socket.username = username;
    socket.emit("login_success");
    socket.broadcast.emit("players_changed", players);
  });

  socket.on("get_players", function() {
    socket.emit("players_changed", players);
  });

  socket.on("challenge_player", function(playerId) {
    io.to(playerId).emit("new_challenge", socket.id);
  });

  socket.on('disconnect', function () {
    delete players[socket.id];
    socket.broadcast.emit("players_changed", players);
  });

  socket.on("join_game", function(playerId) {
    if (players[playerId].inGame || players[socket.id].inGame) return;
    const newGameId = newGame(playerId, socket.id);
    players[playerId].inGame = newGameId;
    players[socket.id].inGame = newGameId;
    socket.emit("players_changed", players);
    socket.broadcast.emit("players_changed", players);
  });

  socket.on("loaded_game", function(playerId) {
    const { inGame } = players[playerId];
    const game = games[inGame];
    game[playerId].connected = true;
    
    let connectedPlayers = 0;
    for (const id in games) {
      for (const playerId in games[id]) {
        const { connected } = games[id][playerId];
        if (connected) connectedPlayers++
      }
    }
 
    if (connectedPlayers === 2) { 
      for (const id in game){
        io.to(id).emit("start_game", socket.id);
      }
    }
    else socket.emit("waiting_for_player");
   
  });
});

http.listen(PORT, () => {
  console.log('listening on *:3000');
});