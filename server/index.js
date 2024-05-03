const express = require('express');
const WebSocket = require('ws');

const app = express();

app.use(express.static("../client"));

const server = app.listen(8081, ()=>{
    console.log("server running on port 8081");
});

const wss = new WebSocket.WebSocketServer({ server });

/* ws://{ip}:8080 */

const MAX_PLAYERS = 3;
const players = [];
const messages = [];
var id = 1;
var murderChosen = false;
var candidates = [];
var onTrial = "";
var interval = null;

function getRole(){ // picks role, just murderer and townie for now
    if (players.length >= MAX_PLAYERS){
        return "spectator";
    }else if (murderChosen){
        return "townie";
    }else if (players.length == MAX_PLAYERS-1){
        murderChosen = true;
        return "murderer";
    }else{
        if  (Math.random() * 100 >= 50){
            murderChosen = true;
            return "murderer";
        }else{
            return "townie"
        }
    }
}

function getPlayers(){
    let p = [];
    players.forEach((player)=>{
        let info = {
            "username": player.username,
            "id":player.id
        };
        p.push(info);
    });
    return p;
}

wss.on('connection', function connection(ws){
    console.log("a client is connected...");
    updateData();

    function updateData(){
        console.log("sending data");
        let players = getPlayers();
        let data = {
            "type":"game",
            "players": players,
            "max_players":MAX_PLAYERS,
        };

        if (players.length >= MAX_PLAYERS){
            // start sending checking time stuff 
            let isDay = false;
            interval = setInterval(() => {
                let data = {
                    "type": "time",
                    "time": isDay ? "daytime" : "nighttime"
                };
                isDay = !isDay; // Toggle time

                console.log("changing Time! isday: ", isDay);

                // Send data to all WebSocket clients
                wss.clients.forEach(function (client) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }, 30000);
        }

        wss.clients.forEach(function (client) {
            if (client.readyState == WebSocket.OPEN){
                client.send(JSON.stringify(data));
            }
        });
    }

    ws.on('error', function(err){
        console.error("connection error:",err)
    });

    ws.on('close', function(){
        console.log("a client disconnected");
        console.log(players);
        console.log(ws.readyState);
        let player = players.findIndex((p) => p.socket.readyState === ws.readyState);
        players.splice(player, 1);
        console.log(players);
        updateData();
        //loop through players, and end game if needed
    });

    ws.on('message', function message(data, isBinary){
        data = JSON.parse(data);
        console.log("receiving a message from client: ",data);
        if (data.type == 'start'){
            let player = {
                "type":"start",
                "id": id,
                "username": data.username,
                "role": getRole()
            }
            id += 1;
            ws.send(JSON.stringify(player));
            player.socket = ws;
            players.push(player);
            updateData();

        }else if (data.type == 'message-town'){
            let player = players.find((p)=> p.id == data.id);
            let msg = {
                "id" : player.id,
                "username" : player.username,
                "message" : data.message
            }
            if(player.role != "spectator"){
                messages.push(msg);
                console.log("messages updated: ", messages);

                wss.clients.forEach(function (client) {
                    if (client.readyState == WebSocket.OPEN){
                        let messageData = {
                            "type":"message-town",
                            "messages":messages
                        };

                        client.send(JSON.stringify(messageData), {binary : isBinary});
                    }
                });
            }

        } else if (data.type == 'message-whisper'){
            let sender = players.find((p)=> p.id == data.sender_id);
            let receiver = players.find((p)=> p.id == data.receiver_id);
            if (sender && receiver){
                let msg = {
                    "type":"message-whisper",
                    "sender" : sender.username,
                    "message" : data.message
                };
                receiver.socket.send(JSON.stringify(msg));
            }
        
        }else if (data.type == 'message-kill'){
            console.log("got kill message: ", data.message);
            wss.clients.forEach(function (client){
                client.send(JSON.stringify(data));
            });

        } else if (data.type == 'kill'){
            //check role
            let msg= {"type":"none"};
            let killed = players.find((p)=>p.id == data.killed_id);
            if (killed && killed.role != 'spectator'){
                if (data.murderer_id){
                    let killer = players.find((p)=>p.id == data.murderer_id);
                    console.log(killed.role, killer.role);
                    if (killer.role == "murderer"){
                        msg = {
                            "type": "kill",
                            "murderer": killer.username,
                            "role": "spectator"
                        };
                    }
                }else{
                    let candidate = candidates.find((c)=>c.id = killed.id);
                    if( candidate.id == onTrial){ // is candidate on trial 
                        msg = {
                            "type": "kill",
                            "role": "spectator"
                        };
                    }
                }
                //murder client kill the particular client
                if(msg.type == "kill"){
                    console.log("sending death note");
                    killed.role = "spectator";
                    killed.socket.send(JSON.stringify(msg));
                    console.log(killed);
                }
            }

        }else if (data.type == 'vote'){
            //vote to lynch someone
            let numberOfCandidates = players.reduce((count, candidate) => { // count all non spectators
                if (candidate.role != "spectator"){
                    return count + 1;
                }else{
                    return count;
                }
            },0); //the init count is 0
            let candidate = players.find((p)=> p.id = data.candidate_id); //find candidate
            if (candidate.role != "spectator"){
                if( data.vote == true ){ // if voting for candidate
                    let votedCandidate = candidates.findIndex((c)=> c.id = candidate.id);
                    if (votedCandidate != -1){
                        console.log("candidates: ", candidates, votedCandidate);
                        candidates[votedCandidate].votes += 1; // increase the candidates vote
                    }else{
                        console.log("candidates add: ",candidates, votedCandidate);
                        candidates.push({"id":candidate.id, "votes": 1}); // add candidate to voting
                        votedCandidate = candidates.length - 1;
                        console.log("candidates add: ",candidates, votedCandidate);
                    }
                    if ( candidates[votedCandidate].votes > Math.floor(numberOfCandidates/2)){ // majority vote
                    //    //send them on trial
                        onTrial = candidate.id;
                        wss.clients.forEach(function(client){
                            client.send(JSON.stringify({"type":"vote","candidate": candidate.username, "trial":true, "kill":false}));
                        });
                        setTimeout(()=>{
                            wss.clients.forEach(function(client){
                            //wait 5 seconds then send again, if on trial still client should call kill
                                console.log("trial",onTrial);
                                if(onTrial == candidate.id){
                                    client.send(JSON.stringify({"type":"vote","candidate": candidate.username,"candidate_id":candidate.id, "trial":true, "kill":true}));
                                }
                            });
                        },50000);
                    //    //send a message to all that they are on trial
                    }
                }else if( data.vote == false){ //unvote
                    let unVotedCandidate = candidates.findIndex((c)=> c.id = candidate.id);
                    if (unVotedCandidate != -1 && candidates[unVotedCandidate].votes > 0){
                        candidates[unVotedCandidate].votes -= 1;
                        console.log("unVotedCandidates: ",candidates);
                        if (candidates[unVotedCandidate].votes <= Math.floor(numberOfCandidates/2) && onTrial == candidate.id){
                        //    //check if they should be on trial
                            onTrial = "";
                            console.log("nobody on trial");
                            wss.clients.forEach(function(client){
                                client.send(JSON.stringify({"type":"vote","candidate": candidate.username, "trial":false}));
                            });
                        }
                        //    //send a message to all that they are off trial
                    }else{
                        console.log("something is wrong here! trying to unvote when not valid");
                    }
                }
            }

        }else if (data.type == 'gameover'){
            let isMurderer = false;
            let activePlayers = players.reduce((count, player) => { // count all non spectators
                if (player.role == "murderer"){
                    isMurderer = true;
                    return count + 1;
                }else if( player.role == "townie"){
                    return count += 1
                }else{
                    return count;
                }
            },0); //the init count is 0
            let msg;
            if (!isMurderer){
                console.log("town wins clearing interval");
                clearInterval(interval);
                console.log("interval", interval);
                wss.clients.forEach(function(client){
                    client.send(JSON.stringify({"type":"gameover", "winner":"town"}));
                });
            }else if ( activePlayers == 1){
                console.log("town wins clearing interval");
                clearInterval(interval);
                console.log("interval", interval);
                clearInterval(interval);
                interval = null;
                wss.clients.forEach(function(client){
                    client.send(JSON.stringify({"type":"gameover", "winner":"murderer"}));
                });
            }
        }else if (data.type == 'quit'){
            let player = players.find((p)=>data.id = p.id);
            player.socket.readyState = 3;
            console.log("disconnecting player");
            console.log(player);
            murderChosen = false;
        }

    });
});



