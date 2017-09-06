var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../../config/logger');
var config = require('../../config/pipo')();

/*
 * Things to add...
 * Salt
 * MD5 Hash of Original Message
 *
 * These messages could still be changed at the server so this might should be
 * based on the admin certificate in some way. Short messages would be much easier
 * to brute force without a salt but the salt would also be stored so it makes this
 * difficult.
 */

var messageSchema = new Schema({
  date: { type: Date, default: new Date() },
  messageId: { type: String },
  type: { type: String },
  _room: { type: mongoose.SchemaTypes.ObjectId, ref: "Room", index: true },
  _chat: { type: mongoose.SchemaTypes.ObjectId, ref: "Chat", index: true },
  _fromUser: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
  _toUsers: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User", default: [] }],
  //_toChat: { type: mongoose.SchemaTypes.ObjectId, ref: "Chat" },
  encryptedMessage: { type: String }
});


messageSchema.statics.get = function get(data, callback) {
  var self = this;
  var chatId = data.chatId;
  var type = data.type;

  if ( !type ){
    logger.error("[message.getMessages] No type provided");
    return callback("Must provide roomId or chatId", null);
  }

  var page = 0;
  var pages = data.pages || config.chats.initialPagesToLoad;
  var referenceMessageId = data.referenceMessageId;
  var messagesPerPage = data.messagesPerPage || config.chats.messagesPerPage;

  if (referenceMessageId) {
    logger.debug("[message.getMessages] Getting messages using referenceMessageId '" + referenceMessageId + "'");
    if (type == 'room') {
      mongoose.model('Message').findOne({ _room: chatId, messageId: referenceMessageId }, function(err, message) {
        mongoose.model('Message').find({ _room: chatId, date: { $lt: message.date } })
          .sort('-_id')
          .limit(pages * messagesPerPage)
          .exec(function(err, messages) {
            return callback(err, messages);
          })
      });
    } else if (type == 'chat') {
      logger.debug("[message.getMessages] Finding messages for provided chat");
      mongoose.model('Message').findOne({ messageId: referenceMessageId }, function(err, message) {
        logger.debug("[message.getMessages] Found message with id " + message._id);
        if (!message) {
          return callback("Reference message not found", null);
        }

        mongoose.model('Message').find({ _chat: message._chat, date: { $lt: message.date } })
          .sort('-_id')
          .limit(pages * messagesPerPage)
          .exec(function(err, messages) {
            logger.debug("[message.getMessages] Found " + messages.length + " messages");
            return callback(err, messages);
          })
      });
    }
  } else {
    logger.debug("[message.getMessages] No referenceMessageId provided");
    if (type == 'room') {
      mongoose.model('Message')
        .find({ _room: chatId })
        .sort('-_id')
        .skip(page * messagesPerPage)
        .limit(pages * messagesPerPage)
        .exec(function(err, messages) {
          return callback(err, messages);
        });
    } else if (type == 'chat') {
      mongoose.model('Message')
        .find({ _chat: chatId })
        .sort('-_id')
        .skip(page * messagesPerPage)
        .limit(pages * messagesPerPage)
        .exec(function(err, messages) {
          return callback(err, messages);
        });
    }
  }
};

messageSchema.statics.create = function create(data, callback) {
  var message = new this(data);

  message.save(function(err) {
    if (err) {
      if (err.name == 'ValidationError') {
        for (field in err.errors) {
          logger.error("[socketServer.onPrivateMessage] Error saving message: " + field);
        }
      } else {
        logger.error("[ERROR] Error saving message: ", err);
        return callback(err);
      }
    }
    return callback(null);
  });
};


messageSchema.statics.sanatize = function sanatize(message, callback) {
  var toUsersArray = [];

  this.populate(message, { path: '_fromUser _toUsers' }, function(err, populatedMessage) {

    if (populatedMessage._toUsers.length > 0) {
      populatedMessage._toUsers.forEach(function(toUser) {
        toUsersArray.push(toUser._id.toString());
      });
    }

    // Consider changing messageId to id
    var sanatizedMessage = {
      date: populatedMessage.date,
      messageId: message.messageId,
      fromUser: populatedMessage._fromUser._id.toString(),
      toUsers: toUsersArray,
      //toChat: populatedMessage._toChat._id.toString(),
      encryptedMessage: populatedMessage.encryptedMessage
    };

    return callback(sanatizedMessage);
  });
};

messageSchema.statics.bulkSanatize = function bulkSanatize(messages, callback) {
  var self = this;
  var sanatizedMessages = [];
  var count = 0;

  if (!messages) {
    return callback(null);
  };

  messages.forEach(function(message) {
    self.sanatize(message, function(sanatizedMessage) {
      sanatizedMessages.push(sanatizedMessage);
      count++;

      if (count == messages.length) {
        finish();
      };
    });
  });

  var finish = function() {
    return callback(sanatizedMessages);
  };
};

module.exports = mongoose.model('Message', messageSchema);
