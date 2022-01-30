// adminを初期化
let admin = require("firebase-admin");
let serviceAccount = require("./.secret/a2021o-firebase-adminsdk.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://a2021o-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "gs://a2021o.appspot.com"
});
let auth = admin.auth();
let db = admin.firestore();

// サーバーを起動
const nowTime = require("./time.js");
const express = require('express');
const http = require('http');
const Session = require('./session.js');
const cors = require('cors');

const app = express();
app.use(cors());

const io = require("socket.io").listen(3030);

const users = {};
const sessions = {};

io.on('connection', (socket) => {

    let userLog = function(){
        let str = ""
        for(let i=0;i<arguments.length;i++){
            str += arguments[i] + " ";
        }
        console.log("user[" +socket.id+ "] " + str);
    }

    userLog("connected");

    let isLoggedIn = false;
    let uid = null;

    socket.on("disconnect", () => {
        userLog("disconnected");
        if (isLoggedIn) {
            if(!uid in users || users[uid].socket !== socket) return;

            let sessionId = users[uid].sessionId;
            if(sessionId !== null && sessionId in sessions){
                // ユーザーを退室させる
                sessions[sessionId].removeUser(uid);

                // オーナーならセッション終了
                if(sessions[sessionId].ownerId === uid) {
                    sessions[sessionId].stop(db);
                    delete sessions[sessionId];
                }
            }

            delete users[uid];
        }
    });

    socket.on("error", (err) => {
        //console.log("error", err);
    });

    socket.on('login', async (jwt) => {

        userLog("try login");

        if(isLoggedIn) return;
        try{
            let decodedToken = await auth.verifyIdToken(jwt);
            isLoggedIn = true;
            uid = decodedToken.uid;

            if(uid in users) {
                users[uid].socket.disconnect();

                isLoggedIn = false;
                socket.disconnect();
                return;
            }

            users[uid] = {
                socket: socket,
                sessionId: null
            };
            socket.emit('login', true);

            userLog("logged in as", uid);
        }catch(err){
            console.log(err);
            socket.emit('login', false);
            socket.disconnect();
        }
    });

    socket.on("join", async (sessionId) => {

        userLog("try join", sessionId);

        if(!isLoggedIn) return;

        if(!(uid in users) || users[uid].sessionId !== null){
            socket.disconnect();
            return;
        }
        users[uid].sessionId = sessionId;

        if(!(sessionId in sessions)) {

            let infoSnapshot;
            try{
                infoSnapshot = await db.collection("sessions").doc(sessionId).get();
            }catch(err){
                socket.disconnect();
                return;
            }

            // セッションが見つからない
            if(!infoSnapshot.exists) {
                socket.disconnect();
                return;
            }

            // セッションが開催されていない
            let info = infoSnapshot.data();
            if(info.status !== "waiting") {
                socket.disconnect();
                return;
            }

            // オーナーしか開始できない
            if(info.ownerId !== uid) {
                socket.disconnect();
                return;
            }

            // 状態を保存
            try{
                await db.collection("sessions").doc(sessionId).update({
                    "status": "started",
                    "startTime": nowTime()
                });
            }catch(err){
                socket.disconnect();
                return;
            }

            // セッションを作成
            sessions[sessionId] = new Session(sessionId,info);
        }

        sessions[sessionId].addUser(uid, socket);
        users[uid].sessionId = sessionId;
    });

    socket.on("watch-data",data => {
        if(!isLoggedIn || !(uid in users)) return;

        let sessionId = users[uid].sessionId;
        if(sessionId  === null || !(sessionId in sessions))return;

        sessions[sessionId].pushData(uid,data);
    });
});