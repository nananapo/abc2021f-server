const nowTime = require("./time.js");

class Session {

    sessionId = "";
    ownerId = "";
    users = {};

    timer = null;

    dataCounter = 0;
    processedDataIndex = 0;
    dataHistory = {};
    packedHistory = {};

    constructor(sessionId,info){
        this.sessionId = sessionId;
        this.ownerId = info.ownerId;
        this.timer = setInterval(()=>this.loop(),500);
    }

    addUser(uid,socket){
        this.users[uid] = socket;
        this.log(uid,"joined");
        socket.emit("join",true);
    }

    removeUser(uid){
        if(uid in this.users){
            delete this.users[uid];
            this.log(uid,"left");
        }
    }

    loop(){

        let pack = {};
        let packedCount = 0;
        for(;this.processedDataIndex<this.dataCounter;this.processedDataIndex++){
            let data = this.dataHistory[this.processedDataIndex];
            pack[data.uid] = data.data;
            packedCount++;
        }

        // ゼロなら保存しない
        if(packedCount === 0){
            return;
        }

        let time = nowTime();
        this.packedHistory[time] = pack;

        // send to owner
        if(this.ownerId in this.users){
            this.users[this.ownerId].emit("realtime-data",{
                time: time,
                data: pack
            });
        }
    }

    pushData(uid,userData){
        this.dataHistory[this.dataCounter++] = {
            uid: uid,
            data: userData
        };
    }

    async stop(db){
        let ids = Object.keys(this.users);
        for(let index in ids){
            let uid = ids[index];
            let socket = this.users[uid];
            socket.emit("end-session",true);
            this.removeUser(uid);
            socket.disconnect();
        }

        this.users = {};
        clearInterval(this.timer);
        this.log("session ended");

        // save
        try{
            await db.collection("sessions").doc(this.sessionId).update({
                "status": "ended",
                "endTime": nowTime(),
            });
            this.log("saved session status");
        }catch(e){
            this.log("failed to save session status");
        }

        try{
            await db.collection("session_data").doc(this.sessionId).set({
                "data": JSON.stringify(this.packedHistory)
            });
            this.log("saved session data");
        }catch(e){
            this.log("failed to save session data");
            console.log(e);
        }
    }

    log(){
        let str = ""
        for(let i=0;i<arguments.length;i++){
            str += arguments[i] + " ";
        }
        console.log("[Session:" +this.sessionId+ "] " +str);
    }
}


module.exports = Session;