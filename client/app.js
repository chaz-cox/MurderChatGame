const URL = "wss://murder-chat-game.onrender.com"
// const URL = "ws://172.20.161.138:8081"
var app = new Vue({
        el: "#app",
        data: {
            socket: null,
            page: 'home',
            username: '',
            role: null,
            numberOfPlayers: null,
            maxPlayers: null,
            players: null,
            id: null,
            messages: [],
            textMessage: "",
            whisperMessages: [],
            receiver: "",
            disableMessages: false,
            gameover: false,
            killMessage: {"username":"Narrator", "message":"Nobody died!"},
            voted: false,
            vote: null,

        },
    methods: {
        receiveMessage: function (data){
            if (data.type == "game"){
                this.updateGame(data);
            }
            if (data.type == "start"){
                this.updateStart(data);
            }
            if (data.type == "time"){
                this.updateTime(data);
            }
            if (data.type == "message-town"){
                this.updateMessageTown(data);
            }
            if (data.type == "message-whisper"){
                this.updateMessageWhisper(data);
            }
            if(data.type == 'kill'){
                this.updateKill(data);
            }
            if(data.type == 'message-kill'){
                console.log("got message: ",data.message);
                if(data.typeOfDeath == 'lynched'){
                    this.messages.push({"username":"Narrator", "message":data.message});
                }
                this.killMessage.message = data.message;
            }
            if(data.type == 'vote'){
                this.updateVote(data);
            }
            if(data.type == 'gameover'){
                this.updateGameover(data);
            }

        },
        sendMessage: function (type){
            let data;
            if (type == 'start'){
                data = this.getStartData();
            }
            if (type == 'message-town'){
                data = this.getMessageTownData();
                this.textMessage = ""; //clear message
            }
            if (type == 'message-whisper'){
                data = this.getMessageWhisperData();
                this.textMessage = "";
                this.receiver = null;
            }
            if (type == 'kill' || type == 'lynch'){
                let murder = (type == 'kill');
                data = this.getKillData(murder);
                this.receiver = null;
            }
            if(type == 'vote' || type == 'unvote'){
                let isVote = (type == 'vote');
                data = this.getVoteData(isVote);
                if( !isVote){
                    this.vote = null;
                }
            }
            if(type == 'gameover'){
                data = this.getGameoverData();
            }
            if(data){
                this.socket.send(JSON.stringify(data));
            }else{
                console.log("data not found:",type);
            }
        },
        updateStart:function(data){
            this.role = data.role;
            this.id = data.id;
        },
        updateGame:function(data){
            this.numberOfPlayers = data.players.length;
            this.maxPlayers = data.max_players;
            this.players = data.players;
            if( this.page == 'waiting'){
                if ( this.numberOfPlayers >= this.maxPlayers ){
                    this.page = "game"
                }
            }
        },
        updateTime:function(data){
            if (data.time == 'daytime'){
                this.disableMessages = false;
            }else{
                this.disableMessages = true;
            }
            if (this.disableMessages){ // switching day to night 
                this.messages = [{"username":"Narrator","message":"Good night it is now nighttime."}];
                this.killMessage.message = "Nobody died!";
            }else{ // switching night to day 
                this.sendMessage('gameover'); // every morning check if there is a game over
                this.messages = [{"username":"Narrator","message":"Good morning it is now daytime."}];
                console.log("current killMessage = ", this.killMessage.message);
                this.messages.push(this.killMessage);
            }
        },
        updateMessageTown: function(data){
            let maxMessages = 15;
            this.messages = data.messages.length > maxMessages? data.messages.slice(data.messages.length-maxMessages): data.messages;
        },
        updateMessageWhisper: function(data){
            let maxWhispers = 15;
            this.whisperMessages.push(data);
            if (this.whisperMessages.length > maxWhispers){
                this.whisperMessages = this.whisperMessages.slice(this.whisperMessages.length-maxWhispers);
            }
        },
        updateKill: function(data){
            let typeOfDeath = data.murderer? "murdered" : "lynched";
            this.role = data.role;
            this.whisperMessages.push({"sender":"Narrator","message":`You where killed! The killer is: ${data.murderer? data.murderer: 'the town'}.`});
            let kill_data ={"type":"message-kill","message": `${this.username} has been ${typeOfDeath}!`, "typeOfDeath":typeOfDeath};
            this.socket.send(JSON.stringify(kill_data));
        },
        updateVote: function(data){
            console.log(data);
            if(data.trial){
                if(data.kill){
                    this.receiver = data.candidate_id;
                    this.sendMessage('lynch');
                }else{
                    this.messages.push({"username":"Narrator","message":`${data.candidate} is on trial! You got 5 seconds to plead your case.`});
                }
            }else{
                this.messages.push({"username":"Narrator","message":`${data.candidate} is off trial, you are safe... for now!`});
            }
        },
        updateGameover: function(data){
            console.log(data);
            this.gameover = true;
            this.messages.push({"username":"Narrator","message":`Game Over ${data.winner} wins!`});
        },
        getStartData: function(){
            let data = {
                "type": "start",
                "username": this.username
            }
            return data;
        },
        getMessageTownData: function(){
            let data = {
                "type": "message-town",
                "id":this.id,
                "message": this.textMessage
            };
            return data;
        },
        getMessageWhisperData:function(){
            let data = {
                "type": "message-whisper",
                "sender_id": this.id,
                "receiver_id":this.receiver,
                "message": this.textMessage
            }
            return data;
        },
        getKillData:function(murderer){
            let data = {
                "type": "kill",
                "killed_id":this.receiver
            };
            if(murderer){
                data.murderer_id = this.id;
            }
            return data;
        },
        getVoteData:function(isVote){
            console.log("vote",this.vote);
            let data = {
                "type": "vote",
                "candidate_id": this.vote,
                "vote":isVote,
            };
            let player = this.players.find((p)=> p.id = this.vote);
            if(isVote){
                this.textMessage = `Voted for ${player.username}`;
            }else{
                this.textMessage = `Unvoted for ${player.username}`;
            }

            this.sendMessage('message-town');
            return data;
        },
        getGameoverData:function(){
            let data = { "type":"gameover" };
            return data;
        },
        quit: function(){
            this.page = "home";
            this.socket.send(JSON.stringify({"type":"quit", "id":this.id}));
            location.reload();
        },
    },
    created: function() {
        this.socket = new WebSocket(URL);
        this.socket.onmessage = (event) =>{
            this.receiveMessage(JSON.parse(event.data));
        }
    },
 })

