$(function() {

// var fnText = $.fn.text;
// $.fn.text = function(val) {
//     if (val === undefined) {
//         return fnText.apply(this, arguments);
//     } else {
//         fnText.apply(this, arguments);
//         return this.html(this.html().replace(/\n/g, '<br/>'));
//     }
// };

$.fn.safeHtml = function(htmltext) {
    htmltext = htmltext
        .replace(/\&/g, "&amp;")
        .replace(/\</g, "&lt;")
        .replace(/\>/g, "&gt;")
        .replace(/\x20/g, "&nbsp;")
        .replace(/\"/g, "&quot;")
        .replace(/\r\n/g, "<br/>")
        .replace(/\n/g, "<br/>");
    return this.html(htmltext);
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
    $el.find(".message-row").addClass(message.direction == "out" ? "right" : "left");
    $el.find(".message-sender").text(message.sender);
    var $bubbleEl = $el.find(".message-bubble");
    if (message.type == "text") {
        $bubbleEl.safeHtml(message.data).addClass("text");
    } else if (message.type == "file") {
        var mimetype = message.data.mimetype.split("/");
        var fileurl = "/file?fileid=" + message.data.fileid + "&filename=" + message.data.filename;
        if (mimetype[0] == "image") {
            var $imageitemEl = $("<img></img>").addClass("message-bubble-image").attr("src", fileurl);
            $imageitemEl.appendTo($bubbleEl);
        } else {
            var $fileitemEl = $("<div></div>").addClass("message-bubble-file");
            $("<div></div>").addClass("icon").appendTo($fileitemEl);
            $("<div></div>").addClass("filename").text(message.data.filename).appendTo($fileitemEl);
            $fileitemEl.appendTo($bubbleEl);
        }
        $bubbleEl.on("click", function() {
            window.open(fileurl);
        });
    }
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
        inroom: false,
        m_username: "",
        m_roomid: "",
        sendings: [],
        joining: false,
        quiting: false,
        editfocus: false
    },
    created: function() {
        var that = this;
        setTimeout(function() {
            $messageListBoxEl = $(".message-list-box");
            $messageListEl = $(".message-list");
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
        clearMessages: function(message) {
            $messageListEl.children().remove();
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
                        that.clearMessages();
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
            var that = this;
            var request = ws.sendJson({
                type: "message",
                msgtype: "text",
                msgdata: text
            }, function(result) {
                if (result) {
                    that.editing = "";
                    that.sendings = _.filter(that.sendings, (item) => item != request);
                    that.appendMessage({
                        sender: that.username,
                        direction: "out",
                        type: "text",
                        data: text
                    });
                } else {
                }
            });
            this.sendings.push(request);
        },
        openImage: function() {
            var that = this;
            window.openFile({
                accept: "image/*"
            }, function(file) {
                if (file === undefined) {
                    return;
                }
                that.sendFile(file);
            });
        },
        openFile: function() {
            var that = this;
            window.openFile(function(file) {
                if (file === undefined) {
                    return;
                }
                that.sendFile(file);
            });
        },
        sendFile: function(file) {
            var that = this;
            if (!that.inroom) return;
            uploadFile(that.roomid, file, function(result) {
                var fileid = result.fileid;
                var filename = result.filename;
                var mimetype = result.mimetype;
                var senddata = {
                    type: "message",
                    msgtype: "file",
                    msgdata: {
                        fileid: fileid,
                        filename: filename,
                        mimetype: mimetype
                    }
                };
                var request = ws.sendJson(senddata, function(success) {
                    if (success) {
                        that.appendMessage({
                            sender: that.username,
                            direction: "out",
                            type: senddata.msgtype,
                            data: senddata.msgdata
                        });
                    }
                    that.sendings = _.filter(that.sendings, (item) => item != request);
                });
                that.sendings.push(request);
            }, function() {
            });
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
        },
        sending: function() {
            return this.sendings.length > 0;
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
    return {
        seq: seq
    };
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
            direction: "in",
            type: message.msgtype,
            data: message.msgdata
        });
    }
});

var $fileSelectorElement = $("#file-selector");
window.openFile = function(options, callback) {
    if (typeof options === "function") {
        callback = options;
        options = {};
    }
    options = options || {};
    if (options.accept) $fileSelectorElement.attr("accept", options.accept);
    $fileSelectorElement.trigger("click");
    $fileSelectorElement.one("change", function() {
        var file = $fileSelectorElement[0].files[0];
        $fileSelectorElement.val("");
        $fileSelectorElement.attr("accept", null);
        if (callback) callback(file);
    });
};

window.uploadFile = function(roomid, file, success, failed, always) {
    var form = new FormData();
    form.append("file", file);
    return $.ajax({
        url: "upload?roomid=" + roomid,
        type: "post",
        data: form,
        processData: false,
        contentType: false
    })
    .done(function(data) {
        if (data.success) {
            if (success) success(data);
        } else {
            if (failed) failed(data);
        }
    })
    .fail(function(event) {
        if (failed) failed(event);
    })
    .always(function() {
        if (always) always();
    });
};

document.ondragover = function(event) {
    event.preventDefault();
};
document.ondrop = function(event) {
    event.preventDefault();
    var files = event.dataTransfer.files;
    if (files.length == 0) return;
    for (file of files)
        vue.sendFile(file);
};

$(".edit-input").on("keyup", function(event) {
    if (event.keyCode == 13 && (event.ctrlKey || event.metaKey)) {
        $(this).trigger("done", arguments);
    }
});

$(".edit-input").on("done", function() {
    vue.sendMessage();
});

});