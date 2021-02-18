const path = require("path");
const express = require("express");
const { userInfo } = require("os");
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const players = {};
function addPlayer (socketId, username) { 
  players[socketId] = { username, inGame: null, keys_pressed: { up: false, down: false, space: false } } 
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
    id: newGameId,
    interval_ref: null,
    game_loop_ref: null,
    players: {
      [hostId]: { 
        connected: false,
        paddle_location: 0
      }, 
      [playerId]: { 
        connected: false,
        paddle_location: 0
      },
    },
    player_1: null,
    player_2: null,
    turn: null
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
    game.players[playerId].connected = true;
    
    let connectedPlayers = 0;
    for (const id in game.players) {
      const { connected } = game.players[id];
      if (connected) connectedPlayers++;
    }
 
    if (connectedPlayers !== 2) return socket.emit("waiting_for_player");
    
    for (const id in game.players){
      io.to(id).emit("start_game", socket.id);
    }

    const [player_1, player_2] = Object.keys(game.players);
    game.player_1 = player_1;
    game.player_2 = player_2;
    game.game_loop_ref = gameLoop(game);
    game.interval_ref = setInterval(game.game_loop_ref, 100);
  });

  socket.on("player_input", function({ isPressed, key }) {
    players[socket.id].keys_pressed[key] = isPressed;
  });

  const gameLoop = (game) => () => {
    game.turn = (!game.turn || game.turn === "player_2") ? "player_1" : "player_2";
    for (const id in game.players) {
      if (!players[id]) console.log("Handle player disconnect");
      else {
        const { keys_pressed: { up, down, space } } = players[id];
        if (up) game.players[id].paddle_location--;
        if (down) game.players[id].paddle_location++;
      }
    }

    for (const id in game.players){
      io.to(id).emit("game_updated", game);
    }
  }
});

http.listen(PORT, () => {
  console.log('listening on *:3000');
});