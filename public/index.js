$(function() {

var fake_data = function (vue) {
    // for (var i = 0; i < 3; i++) {
    //     vue.appendMessage({
    //         sender: "Cosmo",
    //         type: "in",
    //         content: "Use Bootstrap’s custom button styles for actions in forms, dialogs, and more with support for multiple sizes, states, and more."
    //     });
    //     vue.appendMessage({
    //         sender: "Cosmo",
    //         type: "in",
    //         content: "Use Bootstrap’s custom button styles for actions in forms, dialogs, and more with support for multiple sizes, states, and more."
    //     });
    //     vue.appendMessage({
    //         sender: "Cosmo",
    //         type: "out",
    //         content: "Use Bootstrap’s custom button styles for actions in forms, dialogs, and more with support for multiple sizes, states, and more."
    //     });
    // }
    // for (var i = 0; i < 9; i++)
    //     vue.editing += "Use Bootstrap’s custom button styles for actions in forms, dialogs, and more with support for multiple sizes, states, and more.";

};

function alertDialog(title, text) {
    $("#modal-alert-title").text(title);
    $("#modal-alert-text").text(text);
    $("#modal-alert").modal("show");
};
function confirmDialog(title, text, callback) {
    $("#modal-confirm-title").text(title);
    $("#modal-confirm-text").text(text);
    $("#modal-confirm").modal("show");
    $("#modal-confirm-btn-yes").off("click").on("click", () => callback(true));
    $("#modal-confirm-btn-no").off("click").on("click", () => callback(false));
};

var $messageElTemplate = $($(".message-item")[0]).detach().clone().removeClass("template");
var messageEl = function (message) {
    $el = $messageElTemplate.clone();
    $el.find(".message-row").addClass(message.type == "out" ? "right" : "left");
    $el.find(".message-sender").text(message.sender);
    $el.find(".message-bubble").text(message.content);
    return $el;
};

var $messageListBoxEl;
var $messageListEl;

// var scrollTop = $.fn.scrollTop;
// $.fn.scrollTop = function() {
//     console.log("scollTop");
//     return scrollTop.apply(this, arguments);
// }

window.vue = new Vue({
    el: "#app",
    data: {
        app_ready: false,
        messages: [],
        editing: "",
        sending: false,
        inroom: false,
        m_username: "",
        m_roomid: "",
        sending: false,
        joining: false,
        quiting: false,
        editfocus: false
    },
    created: function() {
        var that = this;
        setTimeout(function() {
            $messageListBoxEl = $(".message-list-box");
            $messageListEl = $(".message-list");
            fake_data(that);
        }, 0);
        that.username = window.localStorage.username || "";
    },
    methods: {
        appendMessage: function(message) {
            $messageListEl.append(messageEl(message));
            $messageListBoxEl.scrollTop($messageListEl.height());
        },
        prependMessage: function(message) {
            $messageListEl.prepend(messageEl(message));
            $messageListBoxEl.scrollTop($messageListEl.height());
        },
        joinOrCreateRoom: function() {
            var that = this;
            if (this.joining) return;
            if (this.inroom) return;
            var roomid = this.roomid;
            var username = this.username;
            if (username.length == 0) {
                alertDialog("Failed", "You must provide a username");
                return;
            }
            if (roomid.length > 0) {
                that.joining = true;
                ws.sendJson({
                    type: "join",
                    username: username,
                    roomid: roomid
                }, function(result) {
                    if (result) {
                        that.inroom = true;
                        window.localStorage.username = username;
                        document.title = "Chatroom #" + roomid;
                    } else {
                        alertDialog("Failed", "Failed to join room " + roomid);
                    }
                    that.joining = false;
                });
            } else {
                that.joining = true;
                ws.sendJson({
                    type: "create",
                    username: username
                }, function(result, data) {
                    if (result) {
                        that.inroom = true;
                        that.roomid = data.roomid;
                        window.localStorage.username = username;
                        document.title = "Chatroom #" + that.roomid;
                    } else {
                        alertDialog("Failed", "Failed to join room " + roomid);
                    }
                    that.joining = false;
                });
            }
        },
        quitRoom: function() {
            var that = this;
            if (this.quiting) return;
            if (this.inroom) {
                this.quiting = true;
                ws.sendJson({
                    type: "quit"
                }, function(result) {
                    if (result) {
                        that.inroom = false;
                        document.title = "Chatroom";
                    } else {
                        alertDialog("Failed", "Failed to quit room");
                    }
                    that.quiting = false;
                });
            }
        },
        sendMessage: function() {
            var text = this.editing;
            if (text.length == 0) return;
            if (!this.inroom) return;
            this.sending = true;
            var that = this;
            ws.sendJson({
                type: "message",
                message: text
            }, function(result) {
                if (result) {
                    that.editing = "";
                    that.sending = false;
                    that.appendMessage({
                        sender: that.username,
                        type: "out",
                        content: text
                    });
                } else {
                }
            })
        }
    },
    computed: {
        joinButtonText: function() {
            if (this.roomid.length == 0) {
                if (this.joining)
                    return "Creating ...";
                else
                    return "Create";
            }
            else {
                if (this.joining)
                    return "Joining ...";
                else
                    return "Join";
            }
        },
        username: {
            set: function(value) {
                this.m_username = value;
            },
            get: function() {
                return (this.m_username || "").trim();
            }
        },
        roomid: {
            set: function(value) {
                this.m_roomid = value;
            },
            get: function() {
                return (this.m_roomid || "").trim().replace(/\D/g, "");
            }
        },
        connected: function() {
            return false;
        },
        sendButtonDisabled: function() {
            if (this.sending) return true;
            return false;
        }
    }
});

window.WebSocketClient = function(url) {
    var that = this;
    this.ws = new WebSocket("ws://" + window.location.host);
    this._event_handlers = {
        "message": []
    };
    this._seq = 0;
    this._sendings = [];
    this.ws.onmessage = function(event) {
        var data = event.data;
        if (typeof data === "string") {
            data = JSON.parse(data);
            that.trigger("message", data);
        } else if (data instanceof Blob) {
        }
    };
    this.ws.onopen = (event) => that.trigger("open", event);
    this.ws.onclose = (event) => that.trigger("close", event);
    this.ws.onerror = (event) => that.trigger("error", event);
    this.on("message", function(data) {
        if (data.type === "ack") {
            if (typeof data.seq === "number") {
                var req = this._sendings[data.seq];
                this._sendings[data.seq] = undefined;
                if (req) {
                    req = req.callback;
                    req.apply(this, [data.success, data]);
                }
            }
        }
    });
    this.on("open", function() { vue.app_ready = true; });
    this.on("close", function() { vue.app_ready = false; });
};
WebSocketClient.prototype.on = function(eventname, callback) {
    if (this._event_handlers[eventname] === undefined) this._event_handlers[eventname] = [];
    this._event_handlers[eventname].push(callback);
};
WebSocketClient.prototype.trigger = function(eventname) {
    var that = this;
    var args = _.slice(arguments, 1);
    setTimeout(function() {
        if (that._event_handlers[eventname] === undefined) return;
        for (var fn of that._event_handlers[eventname]) {
            fn.apply(that, args);
        }
    }, 0);
};
WebSocketClient.prototype.sendJson = function(json, callback, timeout) {
    var seq = this._seq;
    this._seq += 1;
    var senddata = JSON.stringify($.extend({}, json, {seq: seq}));
    this.ws.send(senddata);
    this._sendings[seq] = {
        callback: callback
    };
    var that = this;
    if (typeof timeout === "number" && timeout > 0) {
        setTimeout(function() {
            that._sendings[seq] = undefined;
        }, timeout);
    }
};
WebSocketClient.prototype.sendText = function(text, callback, timeout) {
    return this.sendJson({
        type: "message",
        message: text
    });
};

window.ws = new WebSocketClient("ws://" + window.location.host);
ws.on("message", function(message) {
    if (message.type == "message") {
        vue.appendMessage({
            sender: message.sender,
            type: "in",
            content: message.message
        });
    }
});

});
