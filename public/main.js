const root_ref = document.getElementById("root");

let playerName = "";
let playerId = "";
let players = {};
let gameTick;

let handleChangePlayers = null;
let gameId = null;

socket.on("update_id", function(id) {
    playerId = id;
});

function LoginPage() {
    root_ref.innerHTML = `
        <div id="content-tile">
            <div id="header">Pong</div>
            <br/>
            <div id="body-tile">
                <div id="sub-header">What's your name?</div>
                <br/>
                <form id="form">
                    <input type="text" id="username" name="username" autofocus>
                    <div id="invalid-username" class="invalid-text hidden">Already in use</div>
                    <br/>
                    <br/>
                    <br/>
                    <br/>
                    <button>Submit</button>
                </form>
            </div>
        </div>
    `;

    const form_ref = document.getElementById("form");
    const username_ref = document.getElementById("username");
    const invalidUsernameLabel_ref = document.getElementById("invalid-username");

    form_ref.addEventListener("submit", function(e) {
        e.preventDefault();
        socket.emit("login", playerName);
    });


    username_ref.addEventListener("change", function() {
        playerName = this.value;
    });

    socket.on("login_failed", (reason) => {
        switch(reason) {
            case "username_taken":
                username_ref.classList.add("invalid");
                invalidUsernameLabel_ref.classList.remove("hidden");
                break;
        }
    });

    socket.on("login_success", transitionPage(HostOrJoinPage));
}

function HostOrJoinPage() {
    root_ref.innerHTML = `
        <div id="content-tile">
            <div id="header">Hello, ${playerName}</div>
            <br/>
            <div id="body-tile">
                <div id="sub-header">Would you like to?</div>
                <br/>
                <button id="host-button">Host Game</button>
                <button id="join-button">Join Game</button>                
            </div>
        </div>
    `;

    const host_button_ref = document.getElementById("host-button");
    const join_button_ref = document.getElementById("join-button");

    host_button_ref.addEventListener("click", transitionPage(HostGamePage));
    join_button_ref.addEventListener("click", transitionPage(BrowseGamesPage));
}

function HostGamePage() {
    root_ref.innerHTML = `
        <div id="content-tile">
            <div id="header">${playerName}'s game</div>
            <br/>
            <div id="body-tile">
                <div>Your game will start when another player joins.</div>  
                <br/>  
                <div id="sub-header">Challenge players</div>
                <br/>
                <div id="players-list"></div>
            </div>
        </div>
    `;

    const players_ref = document.getElementById("players-list");

    handleChangePlayers = function() {
        let updatePlayerList = "";
        for (const id in players) {
            const { username, inGame } = players[id];
            if (username !== playerName && !inGame) updatePlayerList += `
                <div id="${id}" class="players-list-player">
                    <div>${username}</div>
                    <button>Challenge</button>
                </div>
            `;
        }
        updatePlayerList = updatePlayerList || "<div>Players will appear here, when they become available.</div>"
        players_ref.innerHTML = updatePlayerList;

        const player_nodes = players_ref.children;
        for (const player_node of player_nodes) {
            player_node.addEventListener("click", challengePlayer(player_node.id));
        }
    }

    const challengePlayer = (playerId) => () => {
        socket.emit("challenge_player", playerId);
    }

    socket.emit("get_players");
}

function BrowseGamesPage() {
    root_ref.innerHTML = `
        <div id="content-tile">
            <div id="header">Hello, ${playerName}</div>
            <br/>
            <div id="body-tile">
                <div id="sub-header">Challenge a player</div>
                <br/>
                <div id="games-list"></div><div></div>
            </div>
        </div>
    `;

    const games_list_ref = document.getElementById("games-list");

    socket.on("games_changed", (updatedPlayers) => {
        players = updatedPlayers;
        let updatePlayerList = "";
        for (const id in players) {
            const { username } = players[id];
            if (username !== playerName) updatePlayerList += `
                <div id="player-${id}" class="players-list-player">${username}</div>
            `;
        }
        updatePlayerList = updatePlayerList || "<div>There are currently no players online.</div>"
        players_ref.innerHTML = updatePlayerList;

        const player_nodes = players_ref.children;
        for (const player_node of player_nodes) {
            // player_node.addEventListener("click", challengePlayer(player_node.innerHTML));
        }
    });

    socket.emit("get_games");
}

function PongPage() {
    root_ref.innerHTML = `
        <div id="content-tile">
            <div id="header">Game Test</div>
            <br/>
            <div id="body-tile">
                <div id="game"></div>           
            </div>
        </div>
    `;

    const game_ref = document.getElementById("game");
    let game_tile_ref;
    let pong_ref;

    socket.on("start_game", function() {
        game_ref.innerHTML = `
            <div id="game-tile">
                <canvas id="pong" />
            </div>
        `;

        game_tile_ref = document.getElementById("game-tile");
        pong_ref = document.getElementById("pong");
        document.addEventListener("keydown", handleInput(true));
        document.addEventListener("keyup", handleInput(false));
    });

    socket.on("waiting_for_player", function() {
        game_ref.innerHTML = `
            <div>Waiting for other player to join.</div>
        `;
    });

    socket.on("game_updated", function(game) {
        console.log(game);
    });

    const handleInput = (isPressed) => ({ key }) => {
        if (key === "w" || key === "UpArrow") socket.emit("player_input", { isPressed, key: "up" });
        if (key === "s" || key === "DownArrow") socket.emit("player_input", { isPressed, key: "down" });
        if (key === "space") socket.emit("player_input", { isPressed, key: "space" });
    }    

    socket.emit("loaded_game", playerId);
}

const transitionPage = (Page) => () =>{
    handleChangePlayers = null;
    Page();
}

socket.on("new_challenge", (playerId) => {
    const notification_node = document.createElement('div');
    notification_node.innerHTML = `
        <div class="notification" id="${playerId}-challenge">
            <div>You have been challenged by:</div>
            <div>${players[playerId].username}</div>
            <button id="accept-${playerId}-challenge">Accept</button>
            <button id="decline-${playerId}-challenge">Decline</button>
        </div>
    `;
    root_ref.prepend(notification_node);

    const accept_ref = document.getElementById(`accept-${playerId}-challenge`);
    const decline_ref = document.getElementById(`decline-${playerId}-challenge`);

    accept_ref.addEventListener("click", () => {
        socket.emit("join_game", playerId);        
    });

    decline_ref.addEventListener("click", () => {
        document.getElementById(`${playerId}-challenge`).remove();
    });
});

socket.on("players_changed", (updatedPlayers) => {
    players = updatedPlayers;

    for (const id in players) {
        const { inGame } = players[id];
        if (inGame !== gameId) {
            gameId = inGame;
            PongPage();
        }
    }

    if (handleChangePlayers) handleChangePlayers();
});

LoginPage();