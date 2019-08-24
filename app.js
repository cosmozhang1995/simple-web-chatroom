var port = 3000;
for (var i = 0; i < process.argv.length; i++) {
    if (process.argv[i] == "-p")
        port = parseInt(process.argv[++i]);
}

const _ = require("lodash");
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const WebSocketServer = require('websocket').server;
const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

app.set("view engine", "ejs");

app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));
app.use('/static', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.render('index'));

var rooms = [];

wsServer.on("request", function(request) {
    var conn = request.accept();
    var room = undefined;
    var username = undefined;
    var on_utf8message = function(message) {
        if (room) {
            conn.sendUTF(JSON.stringify({
                type: "ack",
                seq: message.seq,
                success: true
            }));
            var postmsg = JSON.stringify({
                type: "message",
                sender: username,
                message: message.message
            });
            for (var other of room.users) {
                if (other != conn)
                    other.sendUTF(postmsg);
            }
        } else {
            conn.sendUTF(JSON.stringify({
                type: "ack",
                seq: message.seq,
                success: false
            }));
        }
    };
    var on_create = function(message) {
        if (room) {
            conn.sendUTF(JSON.stringify({
                type: "ack",
                seq: message.seq,
                success: false
            }));
        } else {
            var roomid;
            while (true) {
                roomid = parseInt(Math.min(Math.floor(Math.random() * 10000), 9999));
                if (rooms[roomid] === undefined) break;
            }
            room = {
                id: _.padStart("" + roomid, 4, "0"),
                users: [conn]
            };
            rooms[roomid] = room;
            username = message.username;
            conn.sendUTF(JSON.stringify({
                type: "ack",
                seq: message.seq,
                success: true,
                roomid: room.id
            }));
        }
    };
    var on_join = function(message) {
        if (room) {
            conn.sendUTF(JSON.stringify({
                type: "ack",
                seq: message.seq,
                success: false
            }));
        } else {
            var roomid = parseInt(message.roomid);
            if (rooms[roomid] === undefined) {
                conn.sendUTF(JSON.stringify({
                    type: "ack",
                    seq: message.seq,
                    success: false
                }));
            } else {
                room = rooms[roomid];
                username = message.username;
                room.users.push(conn);
                conn.sendUTF(JSON.stringify({
                    type: "ack",
                    seq: message.seq,
                    success: true
                }));
            }
        }
    };
    var on_quit = function(message) {
        if (room) {
            _.remove(room.users, (x) => x == conn);
            if (room.users.length == 0) rooms[parseInt(room.id)] = undefined;
            room = undefined;
            username = undefined;
            if (message) {
                conn.sendUTF(JSON.stringify({
                    type: "ack",
                    seq: message.seq,
                    success: true
                }));
            }
        } else {
            if (message) {
                conn.sendUTF(JSON.stringify({
                    type: "ack",
                    seq: message.seq,
                    success: false
                }));
            }
        }
    };
    conn.on("message", function(message) {
        if (message.type == "utf8") {
            message = JSON.parse(message.utf8Data);
            if (message.type == "message") {
                on_utf8message(message);
            } else if (message.type == "create") {
                on_create(message);
            } else if (message.type == "join") {
                on_join(message);
            } else if (message.type == "quit") {
                on_quit(message);
            }
        } else if (message.type == "binary") {
            conn.send(message.binaryData);
        }
    });
    conn.on("close", function(reasonCode, description) {
        on_quit();
    });
});

// app.listen(port, () => console.log(`Web server listening on port ${port}!`));
server.listen({ port: port }, () => console.log(`Web server listening on port ${port}!`));