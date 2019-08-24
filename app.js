const path = require('path');
const fs = require('fs');

var port = 3000;
var userfile_directory = path.join(__dirname, 'files');
var userfile_expire = 7 * 24 * 60 * 60;
for (var i = 0; i < process.argv.length; i++) {
    if (process.argv[i] == "-p") {
        port = parseInt(process.argv[++i]);
    } else if (process.argv[i] == "-ufd") {
        userfile_directory = parseInt(process.argv[++i]);
    } else if (process.argv[i] == "-ufe") {
        var argstr = process.argv[++i];
        var argmatch = /^((\d+)d)?((\d+)h)?((\d+)m)?((\d+)s)?$/.exec(argstr);
        if (argmatch === null) throw "invalid param \"-ufe " + argstr + "\"";
        var nd = parseInt(argmatch[1] || "0");
        var nh = parseInt(argmatch[3] || "0");
        var nm = parseInt(argmatch[5] || "0");
        var ns = parseInt(argmatch[7] || "0");
        userfile_expire = (((nd * 24 + nh) * 60) + nm) * 60 + ns;
    }
}

const _ = require("lodash");
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const WebSocketServer = require('websocket').server;
const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});
const uuid = require("node-uuid");

if (!fs.existsSync(userfile_directory)) fs.mkdirSync(userfile_directory);

app.set("view engine", "ejs");

app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/file', express.static(userfile_directory));

app.get('/', (req, res) => res.render('index'));

app.use(express.static('public'));
const upload = require('multer')({ dest: userfile_directory });

app.post('/upload', upload.single("file"), function(req, res, next) {
    res.json({
        success: true,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        fileid: req.file.filename
    });
});

app.get('/download', function(req, res, next) {
    var filepath = path.join(userfile_directory, req.query.fileid);
    if (fs.existsSync(filepath)) {
        res.status(200).download(filepath, req.query.filename);
    } else {
        res.status(404).send("Cannot download this file.");
    }
});

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
                msgtype: message.msgtype,
                msgdata: message.msgdata
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

setInterval(function() {
    var nowts = new Date().getTime();
    var expirets = userfile_expire * 1000;
    for (var filename of fs.readdirSync(userfile_directory)) {
        var filepath = path.join(userfile_directory, filename);
        var stat = fs.statSync(filepath);
        if ((nowts - stat.ctime.getTime()) > expirets) {
            fs.unlinkSync(filepath);
        }
    }
}, 60 * 1000);

// app.listen(port, () => console.log(`Web server listening on port ${port}!`));
server.listen({ port: port }, () => console.log(`Web server listening on port ${port}!`));