'use strict'

// Models
var User = require('../models/user');
var KeyId = require('../models/keyid');
var KeyPair = require('../models/keypair');
var Room = require('../models/room');
var PFile = require('../models/pfile');
var Message = require('../models/message');
var Chat = require('../models/chat');
var dl = require('delivery');
var fs = require('fs');
var stream = require('stream');

// Managers
var FileManager = require('./managers/file');
var EncryptionManager = require('../js/managers/encryption');

// Config
var config = require('../../config/pipo')();
var logger = require('../../config/logger');

// Admin Data
var AdminCertificate = require('../../config/adminData/adminCertificate');

// Modules
var mongoose = require('mongoose');
var crypto = require('crypto');

/**
 * Handles all socket traffic
 * @param namespace
 * @returns {Function}
 * @constructor
 */
function SocketServer(namespace) {
  this.namespace = namespace;
  if (this.namespace) {
    if (!this.namespace.socketMap) {
      this.namespace.socketMap = {};
    }
    if (!this.namespace.userMap) {
      this.namespace.userMap = {};
    }
  }
}

SocketServer.prototype.onBinarySocketConnection = function(binSocket) {
  this.binSocket = binSocket;
  var self = this;

  logger.debug("[socketServer.onBinarySocketConnection] Init binary listeners");

  binSocket.on('stream', function(fileStream, data) {
    data.socketServer = self;

    logger.debug('[socketServer.onBinarySocketConnection.stream] Got sendFile socket event');

    // Pass the fileStream to the file stream handler in fileManager
    FileManager.handleFileStream(fileStream, data, function(err) {
      if (err) {
        return console.log('Error handling file stream: %s', err);
      }

      console.log('File stream handled');
    });
  });
};

SocketServer.prototype.onSocket = function(socket) {
  this.socket = socket;
  var self = this;

  this.init();

  logger.debug('[CONNECTION] Socket %s connected to main', socket.client.id);
  logger.debug('[CONNECTION] userMap: ', self.namespace.userMap);

  socket.on('authenticate', self.authenticate.bind(self));
  socket.on('checkUsernameAvailability', self.checkUsernameAvailability.bind(self));
  socket.on('updateClientKey', self.updateClientKey.bind(self));
  socket.on('disconnect', self.disconnect.bind(self));
  socket.on('leaveRoom', self.leaveRoom.bind(self));
  socket.on('join', self.joinRoom.bind(self));
  socket.on('part', self.partRoom.bind(self));
  socket.on('createRoom', self.createRoom.bind(self));
  socket.on('updateRoom', self.updateRoom.bind(self));
  socket.on('getChat', self.getChat.bind(self));
  socket.on('getPreviousPage', self.getPreviousPage.bind(self));
  socket.on('membership', self.membership.bind(self));
  socket.on('roomMessage', self.onMessage.bind(self));
  socket.on('privateMessage', self.onPrivateMessage.bind(self));
  socket.on('toggleFavorite', self.toggleFavorite.bind(self));
  socket.on('serverCommand', self.onServerCommand.bind(self));

  // File transfer
  socket.on('sendFile', self.onSendFile.bind(self));
  socket.on('getFile', self.onGetFile.bind(self));
};

SocketServer.prototype.init = function init() {
  var self = this;
  // Make sure we have a key for the PiPo user

  if (config.encryptionScheme == 'masterKey') {
    // Do master key things
    this.initMasterKeyPair(function(err) {
      if (err) {
        return logger.error("[INIT] Error updating master key pair: "+err);
      }
      logger.info("[INIT] Finsihed updating master key pair");
    });
  } else {
    // Do client key things
  }
};


/*
 * Get the default room or create it if it does not exist
 */
SocketServer.prototype.getDefaultRoom = function getDefaultRoom(callback) {
  var self = this;
  // get the default room name
  // This needs to be set in the config somewhere and passed to the client in a config block
  var systemusername = 'pipo';

  // System user is also getting created in server.js so one of these should be removed
  var systemUserData = {
    username: 'pipo',
    publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: OpenPGP.js v1.0.1\nComment: http://openpgpjs.org\n\nxsBNBFYHKFYBCAC2+gs6wGupdqKwAAHsNfTMqpBJkezYox9fRnHXBgkOzWty\nTzBdItmKRRBr7RCpeQ9nPS4WtEq6d3iUcP4MQmL35gou4mQIH6ClhVUAZykJ\niYXugvPgZXZl6qK8/k7EaLl2kAiYM0n9NSQhOGkZXAtH6MGw0gR4bhw7Dcp7\n3GSOMpgT/n4nBOWbiATKy9Kl3FrW5DrLkt8l0P3ocwVmGC418fkqJSkuNJR1\nFi87L2E2kEcn4EHL9Z4uVTI1mdBp9oLkriW2lMrR1aKMa/I5L5U6ayNALYnS\nNC7pieG3ZuxX7crFcaWa9krFinLSf6AxATQFLpJQLPLTF68yjYhNHzSDABEB\nAAHNDGZsaXBfZmlyZWZveMLAcgQQAQgAJgUCVgcoVwYLCQgHAwIJEKb6o/qa\nk5gaBBUIAgoDFgIBAhsDAh4BAABuWQf5AagTGdxjkpWreAEbqBcolqEIP8I5\nBIHsJcpDoI7VPKsrb4H0qLdE0YTIeD59yPBbs8NPPSh3veebMGU8fVr+5HoN\nQpg8JJImlSvTnZM83fpygsOrMzULgNIqsACDM933Bu34v43dodQ/1n7SN88c\nmpxJSzjoAJdMQ6ItFg6bsPp7Us9KfCeXBSNXHnuBrky9YqyIoAbBmi9mefzh\ngTRI2OnezCIGuNvu/fK2whgjK+qx831EVepqf8JM+IVfA22eZBq9wPFbYkof\n3q1yjuyGePPpn1uTZgQSlw/Ql/uuyQe66PxLuXm2eBrbzbPGdapllywThQ6j\nhfzSR5B6hyiPGM7ATQRWByhWAQgAwXw97JA9goeBP3K3FOb8TVLq/E/Vi13i\ndsrrc2A9D9g/ISCky9Ax211rCZg7IjzKWO7tNU14f25eOoD+pPKxC4iJkmVx\nAXQGIp744g7NmA0WhgzrnM/lId2OvypUihEMq5d3EFVO8g5DKhsRHHkReE6s\nmiagfKlhHT6epZu7lBhU3uUUtwfsdl/cbwpaZb27FeiKvp+5hL03de3g8v+v\nHO81XmS8q2wWOI2OR+419iYDlmXVD9NKxiDMRaJjCDbgJUsM82QgaTnG5WvZ\nAap5OzCL/AKfnN0KQgZsF9oxsl5izmGDuu6faAzO/hyDQ4EK3WwvFtzEtsK8\nGdS6l6ROjwARAQABwsBfBBgBCAATBQJWByhXCRCm+qP6mpOYGgIbDAAAAqIH\n/jLpXcPZhnwCYG3W/9XsAA3xMfzPAiYmv0NeWuLsovPvsOkQGgD6iPoNmdCm\nJrL8dYqmwUSAn+SELYYtLjGk/0XvgCi2l3I46mO4Z8of0cjyHRr6n2j7xRRb\nKRFOj3DTrhhqHSA/rXzrR+r8dT75/EUcIlQZ/3CiI4lF474c5+793DjyCXDC\nkZdurRkTA6UWT2fvnq4HqKlBMZEGMwO5keXMcaQL+mcZOCjgNJxwVqk6DtiY\ntUX8Tvo0QvbOaFhRMaKFqeMBlSrQZmzzBmTXYOBtupfxAFIqjYLqO2AsRXUr\nk8vffgzuYy6uRINhhTfz/iGKsQAVWAWzQ+ndSj86jRE=\n=83fL\n-----END PGP PUBLIC KEY BLOCK-----',
    email: 'pipo@pipo.chat',
  }

  // Move this to User.getSystemUser
  User.findOne({ username: systemusername }, function(err, systemUser) {
    logger.debug("[getDefaultRoom] systemUser is: ", systemUser.username);
    if (!systemUser) {
      logger.debug("[getDefaultRoom] NO system user found!")
      User.create(systemUserData, function(data) {
        self.getDefaultRoom(function(newDefaultRoom) {
          logger.debug("[getDefaultRoom] Created new DEFAULT room '" + newDefaultRoom.name + "'");
          return callback(newDefaultRoom);
        })
      })
    }
    logger.debug("[getDefaultRoom] System user found!");

    var defaultRoomName = 'pipo';

    var defaultRoomData = {
      username: 'pipo',
      name: 'pipo',
      topic: "Welcome to PiPo.",
      group: "default",
      membershipRequired: false,
      keepHistory: true,
      encryptionScheme: 'clientkey',
    };

    // create the default room object
    logger.debug("[getDefaultRoom] Getting default room #" + defaultRoomName);
    Room.getByName(defaultRoomName, function(defaultRoom) {
      if (!defaultRoom) {
        logger.debug("[getDefaultRoom) No default room on initial run, creating default room...");
        Room.create(defaultRoomData, function(defaultRoom) {
          Room.getByName(defaultRoomName, function(savedDefaultRoom) {
            logger.debug("[getDefaultRoom] Saved default room is: ", savedDefaultRoom.name);

            if (savedDefaultRoom == null) {
              return logger.error("[getDefaultRoom] ERROR - Default room is NULL");
            }

            logger.debug("Found default room: #",savedDefaultRoom.name);

            return callback(savedDefaultRoom);
          })
        });
      } else {
        return callback(defaultRoom);
      }
    })
  })
};


/*
 * Check if a username is available
 */
SocketServer.prototype.checkUsernameAvailability = function checkUsernameAvailability(data) {
  var self = this;
  var username = data.username;
  var socketCallback = data.socketCallback;
  var available = true;
  var error = null;

  logger.debug("[socketServer.checkUsernameAvailability] checking username availability for username '" + username + "'");

  User.findOne({ username: username }, function(err, user) {
    if (err) {
      logger.error('[socketServer.checkUsernameAvailability] There was an error while checking availbility of a username: ' + err);
      error = "There was an error while checking availability of supplied username";
    }

    if (user) {
      available = false;
    }

    return self.socket.emit('availability-' + username, { available: available, error: error });
  });
};


/**
 * New socket connected to server
 */
SocketServer.prototype.authenticate = function authenticate(data) {
  var self = this;

  logger.debug('Authenticating new socket');

  User.authenticateOrCreate(data, function(err, authData) {
    if (err) {
      return self.socket.emit('errorMessage', {message: 'authentication failed: ' + err});
    }

    var user = new User;
    user = authData.user;
    var newUser = authData.newUser;

    if (err) {
      logger.warn('Authentication error', err);
      return self.socket.emit('errorMessage', {message: 'Error authenticating you ' + err});
    }

    if (!user) {
      logger.warn("[INIT] Problem initializing connection, no error, but no user");
      return self.socket.emit('errorMessage', {message: "An unknown error has occurred"});
    }

    if (newUser) {
      logger.debug("User", data.username, " not in the master cached userlist so adding them");
      // This helps keep track of when users sign up so that we can emit the new user data to all clients
      self.updateUserList({scope: 'all'});
    }

    var socketMapKeys = Object.keys(self.namespace.socketMap);
    socketMapKeys.forEach(function(socketKey) {
      console.log('[socketServer.authenticate][BEFORE] socket: %s, username: %s, userid %s', socketKey, self.namespace.socketMap[socketKey].username, self.namespace.socketMap[socketKey].userId);
    });

    //logger.debug('[socketServer.authenticate] socketMap before edit: ', self.namespace.socketMap);

    logger.debug('[socketServer.authenticate] Added user if needed, self.socket.id: %s username: %s userId: %s', self.socket.id, user.username, user._id.toString());

    // When adding a new user to the socket map, their socket ID overlaps
    // a previous user so messages are getting routed incorrectly until
    // this is refreshed

    // Add the user's socketId to the socket map
    self.namespace.socketMap[self.socket.id] = {
      username: user.username,
      userId: user._id.toString(),
      publicKey: user.publicKey
    };

    var socketMapKeys2 = Object.keys(self.namespace.socketMap);
    socketMapKeys2.forEach(function(socketKey) {
      console.log('[socketServer.authenticate][AFTER] socket: %s, username: %s, userid %s', socketKey, self.namespace.socketMap[socketKey].username, self.namespace.socketMap[socketKey].userId);
    });
    //logger.debug('[socketServer.authenticate] socketMap after edit: ', self.namespace.socketMap);

    // Init the user in the userMap if they don't exist yet
    if (!self.namespace.userMap[user._id.toString()])
      self.namespace.userMap[user._id.toString()] = [];

    // Push the current socket to the users socketMap arary
    self.namespace.userMap[user._id.toString()].push(self.socket.id);

    // Should call user.setActive(true) here
    // Need to figure out how to call without passing user object?
    User.setActive({ userId: user._id, active: true }, function(err) {
      self.updateUserList({ scope: 'all' });
    });

    self.socket.user = user;
    logger.debug("[INIT] Init'd user " + user.username);

    // TODO: Split this off into it's own method
    // TODO: enable this to get messages to add to each room before sending
    var favoriteRooms = [];
    User.populate(user, { path: 'membership._favoriteRooms' }, function(err, populatedUser) {
      if (populatedUser.membership._favoriteRooms.length > 0) {
        logger.debug("[socketServer.authenticate] populatedUser.membership._favoriteRooms.length: ", populatedUser.membership._favoriteRooms.length);
        logger.debug("[socketServer.authenticate] Building favorite rooms for " + user.username);
        populatedUser.membership._favoriteRooms.forEach(function(room) {
          var roomId = room._id;
          logger.debug("Adding room #" + room.name + " with id '" + roomId + "' to auto join array");
          favoriteRooms.push(roomId);
        })
      }

      // Get complete userlist to send to client on initial connection
      logger.debug("[INIT] getting userlist for user...");
      self.getDefaultRoom(function(defaultRoom) {
        logger.debug("[socketServer.authenticate] defaultRoom.name: " + defaultRoom.name);


        Message.get({ chatId: defaultRoom.id, type: 'room' }, function(err, messages) {
          logger.debug("[socketServer.authenticate] Got messages for default room. Message count is " + messages.length);

          defaultRoom.messages = messages;
          // Check that we're getting messages here
          // Are messages making it here??

          logger.debug("[socketServer.authenticate] sanatize 1");

          Room.sanatize(defaultRoom, function(sanatizedRoom) {
            logger.debug("Sanatized default room #",sanatizedRoom.name,"running User.getAllUsers");
            User.getAllUsers({}, function(userlist) {
              logger.debug("[socketServer.authenticate] Got all users, running User.buildUserIdMap");
              User.buildUserNameMap({ userlist: userlist}, function(userNameMap) {
                logger.debug("[socketServer.authenticate] Built user ID Map, running user.buildProfile");
                User.buildProfile({ user: user }, function(userProfile) {
                  // Should send userProfile separate from userlist
                  logger.debug("[socketServer.authenticate] Done building users profile, sending 'authenticated' to " + user.username);
                  self.socket.emit('authenticated', {message: 'ok', userProfile: userProfile, favoriteRooms: favoriteRooms, userlist: userlist, userNameMap: userNameMap, defaultRoomId: sanatizedRoom.id });
                });
              });
            });
          });
        });

        logger.debug("[socketServer.authenticate] getting available room list for ", user.username);

        // Send the available rooms to the user
        User.availableRooms({ userId: user._id }, function(err, roomData) {
          if (err) {
            logger.error("[socketServer.authenticate] Authentication failed getting available rooms: ", err);
            return self.socket.emit('roomUpdate', { err: "Room update failed: " + err });
          }

          // Go ahead and send the room objects to the user even if they haven't joined it yet
          // - Need to figure out how to have the client only decrypt messages once when joining
          //   as there is no need to decrypt twice. If there is a legit roomUpdate later tho,
          //   we may want to decrypt messages again? When could this happen?
          Room.sanatizeRooms(roomData.rooms, function(sanatizedRooms) {
            logger.debug("[socketServer.authenticate] Running roomUpdate from authenticate");
            self.socket.emit('roomUpdate', { rooms: sanatizedRooms });
          });
        })
      })
    })
  })
};



/*
 * Check all users to make sure they have an up to date masterKeyPair
 * encrypted to them
 *
 * TODO:
 * Add membership check before encrypting key to user
 */

SocketServer.prototype.initMasterKeyPair = function initMasterKeyPair(callback) {
  var self = this;
  // Run through each room and do this...
  KeyPair.checkMasterKeyPairForAllUsers(function(err, response) {
    logger.info("Checked master key pair for all users. Response is '"+response+"'");
    if (err) { logger.info("[START] Error checking master key for all users: "+err); };
    if (response == 'update') {
      logger.info("Users keypair needs updating so generating new master key pair");
      KeyPair.regenerateMasterKeyPair(function(err, masterKeyPair, id) {
        logger.info("[START] New master keyPair generated with id '"+id+"'");
        KeyPair.updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
          if (err) {
            logger.info("[START] Error encrypting master key for all users: "+err);
            return callback(err);
          };
          logger.info("[SOCKET SERVER] (initMasterKeyPair) Encrypted master key for all users!");
          self.namespace.emit('newMasterKey', { room: "general" } );
          callback(null);
        });
      });
    } else if (response == 'ok') {
      logger.info("All users master key matches current version");
      //self.namespace.emit('newMasterKey');
      callback(null);
    }
  });
};

/**
 * Check and sync master key for user
 */
SocketServer.prototype.getMasterKeyPairForUser = function getMasterKeyPairForUser(username, room, callback) {
  User.getMasterKeyPair(username, room, function(masterKeyPair) {
    return callback(null, masterKeyPair);
  });
};

SocketServer.prototype.updateClientKey = function updateClientKey(data) {

};



/**
 * Message broadcast from client
 */
SocketServer.prototype.onMessage = function onMessage(data) {
  var self = this;
  var chatId = data.chatId;
  // Maybe check self.socket if doesn't exist check data.socket for calling methods that don't bind?
  //

  // LEFT OFF HERE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  // Need to see if the socket id here matches what the user sending message has
  //
  logger.debug('[socketServer.onMessage] Got message from socket ID: %s', self.socket.client.id);
  logger.debug('[socketServer.onMessage] self.namespace.socketMap[this.socket.id]: %s', self.namespace.socketMap[self.socket.client.id]);
  logger.debug('[socketServer.onMessage] namespace.userMap: ', self.namespace.userMap);

  if (!self.socket.user) {
    logger.info("[MSG] Ignoring message from unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  // When a new user registers, then an existing user sends them a message,
  // self.socket.user.username here is the new users name when it should be the
  // user sending the message's username
  //
  // What is different between when we get here after a user has registered and
  // after existing users have refreshed?
  //
  // The newly registered user can decrypt the message so we know that the existing
  // user has the new users keys in their keyring
  //
  // Test1:
  // Add an entry to the socket request at the client when sending roomMessage
  // Check the socket message for that entry on the server
  //

  logger.debug('[MSG] this.socket.user.username: %s', this.socket.user.username);
  logger.info("[MSG] Server got chat message from " + self.socket.user.username);

  //TODO: Log messages
  Room.findOne({ _id: chatId }, function(err, room) {
    // Confirm that user has permission to send message to this room
    if (err) {
      return logger.error("[socketServer.onMessage] Error when finding room to send message: ", err);
    };

    if (!room) {
      return logger.error("[socketServer.onMessage] No room found for message");
    };

    User.findOne({ username: self.socket.user.username }, function(err, user) {
      // Add message to room.messages
      if (room.keepHistory) {
        var message = new Message({
          _room: chatId,
          type: 'room',
          _fromUser: user,
          messageId: data.messageId,
          date: new Date(),
          fromUser: user._id.toString(),
          encryptedMessage: data.pgpMessage
        });

        message.save(function(err) {
          logger.debug("[MSG] Pushing message to room message history");
          //room._messages.push(message);
          //room.save();
        })
      }

      logger.debug("[socketServer.onMessage] MessageId: %s fromUserId: %s", data.messageid, user._id.toString());

      self.namespace.emit('roomMessage', {
        chatId: room.id,
        fromUserId: user._id.toString(),
        messageId: data.messageId,
        message: data.pgpMessage
      });
    });
  })

  logger.info("[MSG] Server emitted chat message to users");
};



/**
 * Private message from client
 */
SocketServer.prototype.onPrivateMessage = function onPrivateMessage(data) {
  var self = this;
  var messageId = data.messageId;
  var targetSockets = [];

  if (!self.socket.user) {
    logger.info("[MSG] Ignoring message from unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  var fromUser = self.socket.user._id.toString();
  //logger.debug("[SocketServer.onPrivateMessage] fromUser: " + fromUser);

  //Chat.findOne({ chatHash: data.chatId }, function(err, chat) {
  var chatId = data.chatId;
  //logger.debug("[SocketServer.onPrivateMessage] chatId: " + chatId);
  var toUserIds = data.toUserIds;

  // Get the socketId's for each participant
  // If any of these do not exist yet, we need to grab it from the DB and add it to the namespace userMap
  toUserIds.forEach(function(toUserId) {
    if (self.namespace.userMap[toUserId]) {
      if (self.namespace.userMap[toUserId] != self.socket.user._id.toString()) {
        logger.debug("[socketServer.onPrivateMessage] Looping toUserIds to find socket - self.namespace.userMap[toUserId]: ", self.namespace.userMap[toUserId]);
        targetSockets = targetSockets.concat(self.namespace.userMap[toUserId]);
      }
    } else {
      // Notify the sending user that the receiving user is not currently online
    }
  });

  var createMessage = function createMessage(data, callback) {
    var message = new Message(data);

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
  }

  var createChat = function createChat(data, callback) {
    var chat = new Chat({
      type: data.type,
      chatHash: data.chatId,
      _participants: data.toUserIds,
    });

    //TODO:
    //Create a socketio room from this chat and emit to the room instead of individual sockets save the room
    //somewhere for later use...
    chat.save(function(err, savedChat) {
      return callback(savedChat.id);
    });
  };


  var userMapKeys = Object.keys(self.namespace.userMap);

  Chat.findOne({ chatHash: chatId }, function(err, chat) {
    // If there is not a chat with these participants create one
    if (err) {
      return logger.error("[onPrivateMessage] Error finding Chat with participantIds: ", toUserIds);
    };

    var messageData = {
      _fromUser: self.socket.user,
      _toUsers: toUserIds,
      type: 'chat',
      messageId: messageId,
      date: new Date(),
      encryptedMessage: data.pgpMessage
    };

    var emitData = {
      fromUserId: self.socket.user._id.toString(),
      type: 'chat',
      chatId: chatId,
      messageId: messageId,
      toUserIds: toUserIds,
      date: messageData.date,
      message: data.pgpMessage,
      signature: data.signature
    };

    if (!chat) {
      logger.debug("[socketServer.onPrivateMessage] No chat found with requested participants. Creating new chat.");
      self.createChat({
        type: "chat",
        chatHash: chatId,
        toUserIds: toUserIds
      }, function(err, chatId) {
        messageData._chat = chatId;
        createMessage(messageData, function(err) {
          emitToSockets(targetSockets, emitData);
        });
      });
    }

    if (chat) {
      logger.debug("[socketServer.onPrivateMessage] Found chat with participantIds: ", toUserIds);
      messageData._chat = chat.id;

      createMessage(messageData, function(err) {
        emitToSockets(targetSockets, emitData);
      });
    };

    // This shouldn't ever happen because the sending user should always get the message, and if sent should be online
    if (!targetSockets) {
      logger.info("[socketServer.onPrivateMessage] No participants of this chat are on line");
      return self.socket.emit('errorMessage', {message: "User is not online"});
    }
  });

  var emitToSockets = function emitToSockets(targetSockets, emitData) {
    targetSockets.forEach(function(targetSocket) {
      logger.debug("[socketServer.onPrivateMessage] Emitting private message to socket: " + targetSocket);

      self.socket.broadcast.to(targetSocket).emit('privateMessage', emitData);
    });
    // Must emit to self becuase broadcast.to does not emit back to itself
    self.socket.emit('privateMessage', emitData);
  };
};

SocketServer.prototype.onSendFile = function(data){
  var self = this;
  data.socketServer = self;

  logger.debug('[socketServer.onSendFile] Got sendFile socket event');

  FileManager.handleChunk(data);
};

SocketServer.prototype.onGetFile = function(data){
  var self = this;

  logger.debug("[socketServer.onGetFile] Got getFile request");

  if (!self.socket || !self.binSocket) {
    return logger.error('[socketServer.onGetFile] No self.socket or self.binSicket, one must be specified');
  }

  data.socket = self.socket;
  data.binSocket = self.binSocket;

  FileManager.handleGetFile(data);
};

SocketServer.prototype.onFileReceiveSuccess = function onFileReceiveSuccess(file) {
  var params = file.params;
  logger.debug("[socketServer.onFileReceiveSuccess] File params is: ", params);
  fs.writeFile(file.name,file.buffer, function(err){
    if(err){
      console.log('File could not be saved.');
    }else{
      console.log('File saved.');
    };
  });
};


SocketServer.prototype.arrayHash = function arrayHash(array, callback) {
  // Sort participantIds
  var orderedArray = array.sort();

  // MD5 participantIds
  encryptionManager.sha256(orderedArray.toString()).then(function(arrayHash) {
    return callback(arrayHash);
  });
};


/*
 * Handle request from client to get chat history between two or more users
 */
SocketServer.prototype.getChat = function getChat(data) {
  var self = this;

  // How do we find the chat using the participants (or some other thing)?
  var chatId = data.chatId;
  var chatHash = data.chatHash;
  var participantIds = data.participantIds;

  Chat.getSanatized({
    chatId: chatId,
    chatHash: chatHash,
    participantIds: participantIds
  }, function(err, sanatizedChat) {
    if (err) {
      self.socket.emit('chatUpdate-' + chatHash, null);
      return logger.error("[socketServer.getChat] Error getting chat: " + err);
    };

    if (!sanatizedChat) {
      logger.debug("[socketServer.getChat] No chat found! Will create a new one with hash '" + chatHash + "'");
    }

    finish(sanatizedChat);
  });

  var finish = function finish(sanatizedChat) {
    logger.debug("[socketServer.getChat finish] Starting to finish...");
    if (sanatizedChat) {
      if (chatHash) {
        logger.debug("[getChat.finish] We have chatHash '" + chatHash + "'");
        return self.socket.emit('chatUpdate-' + chatHash, { chat: sanatizedChat });
      } else {
        logger.debug("[socketServer.getChat.finish] We have no chatHash");
        return self.socket.emit('chatUpdate', { chat: sanatizedChat });
      };
    } else {
      logger.debug("[socketServer.getChat finish] Finishing without a chat");

      // This may be redundant as the client is doing the array hash also but we could check it here to make sure it matches?
      self.arrayHash(participantIds, function(chatHash) {
        Chat.create({
          participantIds: participantIds,
          chatHash: chatHash,
          type: 'chat'
        }, function(err, newChat) {
          Chat.sanatize(newChat, function(newSanatizedChat) {
            return self.socket.emit('chatUpdate-' + chatHash, { chat: newSanatizedChat });
          });
        });
      });
    };
  };
};


SocketServer.prototype.getPreviousPage = function getPreviousPage(data) {
  var self = this;
  var chatId = data.chatId;
  var type = data.type;
  var referenceMessageId = data.referenceMessageId;

  Message.get({
    chatId: chatId,
    type: type,
    referenceMessageId: referenceMessageId,
  }, function(err, messages) {
    Message.bulkSanatize(messages, function(sanatizedMessages) {
      return self.socket.emit('previousPageUpdate', {
        chatId: chatId,
        messages: sanatizedMessages
      });
    });
  });
};


SocketServer.prototype.arrayHash = function arrayHash(array, callback) {
  var self = this;

  // Sort participantIds
  var orderedArray = array.sort();

  var arrayHashString = crypto.createHash('sha256').update(orderedArray.toString()).digest('hex').toString();
  return callback(arrayHashString);
};


/*
 * Send masterKeyPair to user
 */
SocketServer.prototype.sendMasterKeyPair = function sendMasterKeyPair(userId, room, masterKeyPair) {
  var self = this;
  var targetSockets = self.namespace.userMap[userId];
  if (targetSockets) {
    targetSockets.forEach(function(targetSocket) {
      self.socket.broadcast.to(targetSocket).emit('newMasterKey', {
        room: room,
        masterKeyPair: masterKeyPair
      });
    })
  };
};

SocketServer.prototype.onServerCommand = function onServerCommand(data) {
  var self = this;
  var socket = this.socket;
  var command = data.command;
  var username = self.socket.user.username;
  //TODO refactor this
  var currentChat = data.currentChat;
  logger.info("Received command '"+command+"' from user '"+socket.name+"'");
  var splitCommand = command.split(" ");
  if (splitCommand[0] == "who") {
    logger.info("[SERVER] Responding to 'who' request from '"+socket.name+"'");
    var roomMembershipArray = [];
    logger.info("[SERVER COMMAND] Checking room #"+currentChat);
    for (var key in roomMembership[currentChat]) {
      logger.info("[SERVER COMMAND] Iterating user "+roomMembership[CurrentChat][key].username);
      roomMembershipArray.push(roomMembership[currentChat][key].username);
    }
    logger.info("[SERVER COMMAND] Broadcasting user list for #"+currentChat+" to socket.id "+socket.id+" with data ( "+roomMembershipArray.toString()+" )");
    this.namespace.to(socket.id).emit('chat status', { statusType: "WHO", statusMessage: "Current users of #"+currentChat+" are ( "+roomMembershipArray.toString()+" )"});
    //socket.broadcast.to(socket.id).emit('chat status', "Current users of #"+currentChat+" are ( "+roomMembershipArray.toString()+" )");
  } else if (splitCommand[0] == "room") {
    logger.info("Got room command");
    if (splitCommand[2] == "member") {
      logger.info("Got member sub command");
      if (splitCommand[3] == "add") {
        logger.info("Got add sub sub command");
        Room.addMember({ member: splitCommand[4], roomName: splitCommand[1] }, function(data) {
          var success = data.success;

          if (!success) {
            return logger.info("Was not successful when adding membe to room");
          }
          logger.info("Added " + splitCommand[4] + " to room " + splitCommand[1]);
          return socket.emit('serverCommandComplete', { response: "[SERVER] Added " + splitCommand[4] + " to room " + splitCommand[1] });
        })
      }
    }
  } else if (splitCommand[0] == "help") {
    // Output help here
  } else {
    logger.info("[SERVER COMMAND] Unable to parse server command...");
  }
};


/**
 * Client join room
 */
SocketServer.prototype.joinRoom = function joinRoom(data) {
  var self = this;

  //logger.debug("[JOIN ROOM] data is ",data);

  if (!self.socket.user) {
    logger.info("Ignoring join attempt by unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  var username = self.socket.user.username;
  var roomId = data.roomId;

  //logger.info("[JOIN ROOM] User '" + username + "' joining room with id "+ roomId);

  // Ensure that user has the most recent master key for this room if in masterKey mode
  if (config.encryptionScheme == 'masterKey') {
    logger.debug("[JOIN ROOM] encryptionScheme: masterKey - checking masterKey");
    KeyId.getMasterKeyId(roomName, function(err, currentKeyId) {
      User.getMasterKeyPair(username, roomName, function(err, masterKeyPair) {
        if (masterKeyPair.id !== currentKeyId) {
          self.initMasterKeyPair(function(err) {
            // Should probably return and call self here
            User.getMasterKeyPair(username, roomName, function(err, newMasterKeyPair) {
              self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: roomName, masterKeyPair: newMasterKeyPair });
              self.namespace.to(root).emit('newMasterKey', { room: roomName, keyId: currentKeyId });
              self.socket.join(roomId);
              Room.join({username: username, name: roomName}, function(err, data) {
                var auth = data.auth;
                if (err) {
                  return logger.info("Error joining room " + roomName + " with error: " + err);
                }
                if (!auth) {
                  return logger.warning("Failed to join room " + roomName);
                }
              })
              logger.debug("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + roomName);
              self.updateActiveUsers(roomId);
            });
          });
        } else {
          //logger.info("[JOIN ROOM] Clients master key is up to date");
          self.socket.join(roomName);

          self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: sanatizedRoom, masterKeyPair: masterKeyPair });
          logger.debug("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + room.name + " with member list of ", membersArray);
          self.updateActiveUsers(roomId);
        };
      });
    });
  } else {
    // Using client key encryption scheme
    Room.join({ id: roomId, username: username, socket: self.socket }, function(err, data) {
      var auth = data.auth;
      var room = data.room;
      var roomUpdated = data.updated;

      if (!room) {
        if (err) {
          return self.socket.emit('joinComplete', { err: "Error joining room:" + err });
        }

        if (!auth) {
          return self.socket.emit('joinComplete', { err: "Sorry, you are not authorized to join this room" });
        }
      }

      logger.debug("[socketServer.join] Checking to see if we should add a memberhsip to this room for this user");

      Room.sanatize(room, function(sanatizedRoom) {
        if (err) {
          return self.socket.emit('joinComplete', { err: "Error while joining room " + room.name + ": "+ err });
        }

        var rooms = {};

        // Should only include the room users here as a join should only change that
        rooms[room.id] = sanatizedRoom;

        self.socket.emit('joinComplete', { encryptionScheme: 'clientKey', room: sanatizedRoom });

        if (roomUpdated) {
          logger.debug("[socketServer.joinRoom] Running roomUpdate from joinRoom");

          // The joining user will get a double update but there isn't much better of a way to do this easily
          self.namespace.emit('roomUpdate', { rooms: rooms });
        }

        logger.debug("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + room.name);

        self.updateActiveUsers(room._id);
      })
    })
  };
};



/*
 * Create a room if user has permission
 */
SocketServer.prototype.createRoom = function createRoom(data) {
  var self = this;
  var roomData = {
    username: self.socket.user.username,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  logger.info("User " + self.socket.user.username + " is trying to create room " + data.name);
  logger.info("New room data: ",data);
  Room.create(roomData, function(err, newRoom) {
    if (err) {
      return logger.info("Error creating room: " + err);
    }
    self.socket.emit('createRoomComplete', { room: { id: newRoom.id }});
    logger.info("Room created : " + JSON.stringify(newRoom));
    var rooms = {};
    logger.debug("[socketServer.createRoom] sanatize 4");
    Room.sanatize(newRoom, function(sanatizedRoom) {
      rooms[newRoom._id.toString()] = sanatizedRoom;
      if (roomData.membershipRequired) {
        // Emit membership update to user who created private room
        self.socket.emit('roomUpdate', { rooms: rooms });
      } else {
        // Emit membership update to all users
        self.namespace.emit('roomUpdate', { rooms: rooms });
      }
    })
  })
}

/*
 * Update a room if user has permission
 */
SocketServer.prototype.updateRoom = function updateRoom(data) {
  var self = this;
  var roomData = {
    id: data.id,
    username: self.socket.user.username,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  logger.info("User " + self.socket.user.username + " is trying to update room " + data.name);
  Room.update(roomData, function(err, updatedRoom) {
    if (err) {
      return logger.info("Error creating room: " + err);
    }
    // TODO: This needs to emit room update with ID instead of name
    self.socket.emit('updateRoomComplete', { name: data.name });
    logger.debug("[socketServer.updateRoom] Room updated : " + JSON.stringify(updatedRoom));
    var rooms = {};
    Room.sanatize(updatedRoom, function(sanatizedRoom) {
      logger.debug("[socketServer.updateRoom] Sanatized room sending back as updated room: ", sanatizedRoom);
      rooms[sanatizedRoom.id] = sanatizedRoom;
      // TODO: Need to emit to members, not just the one who created the room
      if (roomData.membershipRequired) {
        // Emit membership update to user who created private room
        self.socket.emit('roomUpdate', { rooms: rooms });
      } else {
        // Emit membership update to all users
        self.namespace.emit('roomUpdate', { rooms: rooms });
      }
    });
  })
}

SocketServer.prototype.membership = function membership(data) {
  var self = this;

  var type = data.type;
  var chatId = data.chatId;
  var memberName = data.memberName;
  var memberId = data.memberId;
  var membership = data.membership;
  var username = self.socket.user.username;
  var userId = self.socket.user.id;

  logger.debug("[MEMBERSHIP] Caught membership SOCKET event with type '" + type + "'");

  if (type == 'add') {
    var addData = ({
      username: username,
      userId: userId,
      memberId: memberId,
      memberName: memberName,
      membership: membership,
      chatId: chatId,
    })

    logger.debug("[MEMBERSHIP] membership data is:", addData);

    // Should be passing both user and member as userId's here
    Room.addMember(addData, function(addResultData) {
      var success = addResultData.success;
      var message = addResultData.message;

      if (!success) {
        self.socket.emit('membershipUpdateComplete', addResultData);
        return logger.warn("Failed to add member:", message);
      }

      logger.debug("[socketServer.membership] Member added, finding room with '" + chatId + "' to return...");

      Room.findOne({ _id: chatId }).populate('_members _admins _owner _subscribers _activeUsers _messages _messages._fromUser _messages._toUsers').exec(function(err, room) {
        logger.debug("[socketServer.membership] sanatize 5");
        Room.sanatize(room, function(sanatizedRoom) {
          var rooms = {};
          rooms[room._id.toString()] = sanatizedRoom;
          addResultData.rooms = rooms;

          logger.debug("[MEMBERSHIP] Found room, emitting roomUpdate to namespace for ",room.name);
          self.namespace.emit('roomUpdate', addResultData);

          logger.debug("[MEMBERSHIP] Member added successfully. Emitting membershipUpdateComplete");
          return self.socket.emit('membershipUpdateComplete', addResultData);
        })
      })
    })
  }
  if (type == 'modify') {
    modifyData = ({
      memberName: data.member,
      chatId: data.chatId,
      memberId: data.memberId,
      membership: data.membership,
      username: username
    });

    logger.debug("[MEMBERSHIP] Attempting to modify member");
    Room.modifyMember(modifyData, function(resultData) {
      var success = resultData.success;
      var message = resultData.message;
      var chatId = resultData.chatId;
      logger.debug("[MEMBERSHIP] Member modification complete and success is ",success);


      if (!success) {
        return logger.warn("Failed to modify member:", message);
      }

      logger.debug("[MEMBERSHIP] Finding room to send back to the user");
      Room.findOne({ _id: chatId }).populate('_members _admins _owner _subscribers _activeUsers _messages').exec(function(err, room) {
        //logger.debug("[SOCKET SERVER] (membership) Room members: ",room._members);
        //logger.debug("[SOCKET SERVER] (membership) Room admins: ",room._admins);
        logger.debug("[SOCKET SERVER] (membership) Room owner: ",room._owner.username);
        //var adminKeys = Object.keys(room._admins);
        var adminsArray = [];
        room._admins.forEach(function(admin) {
          adminsArray.push(admin.username);
        })
        logger.debug("[SOCKET SERVER] (membership) Room admins: ",adminsArray);
        var rooms = {};
        logger.debug("[socketServer.membership] sanatize 6");
        Room.sanatize(room, function(sanatizedRoom) {
          logger.debug("[SOCKET SERVER] (membership) Room sanatized. Adding to rooms list and sending roomUpdate to namespace");
          rooms[room._id.toString()] = sanatizedRoom;

          var roomData = {
            rooms: rooms
          };

          logger.debug("[SOCKET SERVER] (membership) Emitting roomUpdate to namespace with roomData:",roomData)
          self.namespace.emit('roomUpdate', roomData);
          return self.socket.emit('membershipUpdateComplete', resultData);
        })
      })
    })
  }
}



/*
 * Client part room
 */
SocketServer.prototype.partRoom = function partRoom(data) {
  var self = this;
  var chatId = data.chatId;
  var userId = self.socket.user.id;
  var username = self.socket.user.username;

  // Check if user has already initiated parting this room
  //

  logger.info("[PART ROOM] Parting room for",self.socket.user.username);

  if (!self.socket.user) {
    logger.info("Ignoring part attempt by unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  logger.info("[PART ROOM] User " + username + " parting room with id '" + chatId + "'");

  Room.part({ userId: userId, chatId: chatId }, function(err, success) {
    if (err) {
      return logger.info("Error parting room with id '" + chatId + "' with error: " + err);
    }
    if (!success) {
      return logger.info("Failed to part room with id'" + chatId + "'");
    }
    logger.info("User " + username + " parted room with id'" + chatId + "'");

    // Update the active users for the chat and emit the change to all users in that namespace
    self.updateActiveUsers(chatId);

    // Emit part complete to the parting user
    self.socket.emit('partComplete', { chatId: chatId });
  })
};


/*
 * Toggle a room as favorite
 */
SocketServer.prototype.toggleFavorite = function toggleFavorite(data) {
  var self = this;
  var chatId = data.chatId;
  var userId = self.socket.user.id;
  var username = self.socket.user.username;

  logger.debug("[socketServer.toggleFavorite] (toggleFavorite) Got socket request to toggle favorite for user '" + userId + "' and chat '" + chatId + "'");

  User.findOne({ _id: userId }).exec(function(err, user) {
    var user = user;

    if (!user) {
      return logger.error("[socketServer.toggleFavorite] Error finding user '" + username + " to toggle favorite rooms for");
    };

    logger.debug("[socketServer.toggleFavorite] Found user " + user.username);
    //logger.debug("[socketServer.toggleFavorite] user.membership: ", user.membership._favoriteRooms);

    Room.findOne({ _id: chatId }, function(err, room) {
      if (!room) {
        return logger.error("[socketServer.toggleFavorite] Error finding room by chatId '" + chatId + "' while trying to toggle favorite");
      };

      logger.debug("[socketServer.toggleFavorite] favoriteRooms: ",user.membership._favoriteRooms);

      var favorite = (user.membership._favoriteRooms.indexOf(room.id) > -1);

      logger.debug("[socketServer.toggleFavorite] looking for room in membership: ", room.id);

      logger.debug("[socketServer.toggleFavorite] favorite is ", favorite);

      if (!favorite) {
        logger.debug("[socketServer.toggleFavorite] Favorite room not found for " + self.socket.user.username + " with id " + self.socket.user.id + " so adding " + chatId);
        user.membership._favoriteRooms.addToSet(room._id);
        //User.update({ _id: chatId }, { $addToSet: { membership: { _favoriteRooms: room._id }}});
        //user.membership._favoriteRooms.addToSet({ membership: { _favoriteRooms: mongoose.Types.ObjectId( room._id ) }});
        //user.membership._favoriteRooms.addToSet(room._id).save(function(err) {
        logger.debug("[socketServer.toggleFavorite] After adding room: ", user.membership._favoriteRooms);
        user.save(function(err) {
          if (err) {
            logger.error("[socketServer.toggleFavorite] Error saving toggle change");
          };

          return finish({ favorite: true });
        });
        //});
      };

      if (favorite) {
        logger.debug("[socketServer.toggleFavorite] Favorite room " + chatId + " exists for user " + self.socket.user.username + " with id " + self.socket.user.id + " so removing it");
        user.membership._favoriteRooms.pull(room._id);
        user.save(function(err) {
          return finish({ favorite: false });
        });
      };
    });

    var finish = function(data) {
      var favorite = data.favorite;

      return self.socket.emit('toggleFavoriteComplete-' + chatId, { favorite: favorite });
    };
  });
};



/*
 * Update the master userlist and send results to everyone
 */
SocketServer.prototype.updateUserList = function updateUserList(data) {
  var self = this;
  var scope = data.scope;
  User.getAllUsers({}, function(userlist) {
    logger.debug("[socketServer.updateUserList] Got data for userlist update with scope '" + scope + "'");
    User.buildUserNameMap({userlist: userlist}, function(userNameMap) {
      logger.debug("[socketServer.updateUserList] Returning userIdMap");
      if (scope == 'all') {
        self.namespace.emit("userlistUpdate", {
          userlist: userlist,
          userNameMap: userNameMap
        })
      } else if (scope == 'self') {
        self.socket.emit("userlistUpdate", {
          userlist: userlist,
          userNameMap: userNameMap
        })
      }
    });
  })
};



/**
 * Update userlist for a room and emit an update to the client
 *
 * Should this go in the room or chat model?
 * - may have to wait until room and chat are combined
 */
SocketServer.prototype.updateActiveUsers = function updateActiveUsers(chatId) {
  var self = this;

  logger.debug("[socketServer.updateActiveUsers] Getting active users...");

  self.getActiveUsers(chatId, function(err, activeUsers) {
    logger.debug("[socketServer.updateActiveUsers] Sending 'roomUsersUpdate' to namespace '" + chatId + "' after updating active members");

    self.namespace.to(chatId).emit("activeUsersUpdate", {
      chatId: chatId,
      activeUsers: activeUsers
    });
  });
};



/*
 * Get a list of a rooms active members from the socket namespace
 */
SocketServer.prototype.getActiveUsers = function(chatId, callback) {
  var self = this;
  var activeUserIds = [];
  var activeUsers = [];
  var uniqueActiveUsers = [];

  if (typeof this.namespace.adapter.rooms[chatId] !== 'undefined') {
    activeUserIds = Object.keys(this.namespace.adapter.rooms[chatId].sockets).filter(function(sid) {
      return sid;
    });

    //Map sockets to users
    activeUsers = activeUserIds.map(function(sid) {
      return self.namespace.socketMap[sid].userId;
    });

    uniqueActiveUsers = activeUsers.filter(function(elem, pos) {
      return activeUsers.indexOf(elem) == pos;
    });
  } else {
  };

  callback(null, uniqueActiveUsers);
};



SocketServer.prototype.leaveRoom = function leaveRoom(roomId) {
  logger.debug("[socketServer.leaveRoom] Got leave room for id: " + roomId);
};

// This was from a version of socket.io that I hacked and won't get used until the MR is accepted
SocketServer.prototype.disconnecting = function(disconnecting) {
  var self = this;
  if (self.socket) {
    var userId = self.socket.user.id;
    var username = self.socket.user.username;
    // BOOKMARK BOOKMARK BOOKMARK
    var roomIds = Object.keys(self.socket.rooms);

    logger.debug("[socketServer.disconnecting] roomIds: ", roomIds);

    logger.debug("[socketServer.disconnecting] User '" + username + "' is disconnecting.");
    logger.debug("[socketServer.disconnecting] rooms: ", Object.keys(self.socket.rooms));

    //roomIds.forEach(function(id) {
    //  self.updateActiveUsers(id);
    //});
  }
};


SocketServer.prototype.disconnect = function disconnect() {
  var self = this;
  if (!self.socket) {
    return logger.info("unknown socket");
  }

  logger.info("[DISCONNECT] socket.id: " + self.socket.id);
  // Is this necessary? Probably alreeady happens in socket
  //self.socket.leaveAll();

  // If there is a user and id in the socket
  if (self.socket.user && self.socket.user.id) {
    var userId = self.socket.user.id;
    var username = self.socket.user.username;

    logger.info("[SOCKET SERVER] (disconnect) username: "+username);

    // Find the user object matching the user id that is disconnecting
    User.findOne({ _id: userId }).populate('membership._currentRooms').exec(function(err, user) {
      if (err) {
        return logger.info("ERROR finding user while parting room");
      }

      if (!user) {
        return logger.info("ERROR finding user while parting room");
      }

      logger.info("[DISCONNECT] Found user, disconnecting...");

      // Send an updated userlist to all users?
      User.setActive({ userId: user._id, active: false }, function(err) {
        self.updateUserList({ scope: 'all' });
      });

      // Loop through the rooms that this user is a member of and part the user from the room
      user.membership._currentRooms.forEach(function(room) {
        logger.debug("[socketServer.disconnect] room name is: " + room.name );
        Room.part({ userId: userId, chatId: room._id }, function(err, success) {
          if (err) {
            return logger.info("ERROR parting room: " + err);
          }

          if (!success) {
            return logger.info("User " + username + " failed to part room " + room.name);
          }

          logger.info("User " + username + " successfully parted room " + room.name);
          // TODO: Should update all appropritae rooms here
          logger.info("Updating room users!");
          self.updateActiveUsers(room._id.toString());
        })
      })
    })

    // Delete disconnecting users socket from socket array
    // TODO: May be better to find a way to use socketIO's namespace and the users username to check all active sockets
    if (self.namespace.userMap && self.namespace.userMap[self.socket.user._id.toString()]) {
      var indexOfSocketId = self.namespace.userMap[self.socket.user._id.toString()].indexOf(self.socket.id);
      if (indexOfSocketId > -1) {
        self.namespace.userMap[self.socket.user._id.toString()].splice(indexOfSocketId, 1);
      };
    };

    // If there are no more sockets in the array, delete the usermap entry for that user

    logger.debug('[socketServer.disconnect] namespace.userMap is: ', self.namespace.userMap);

    // Instead of doing all of this here, should move it to a method
    // - socketJoin
    // - socketLeave
    // or something like that...

    var userId = self.socket.user._id.toString();

    logger.debug('[socketServer.disconnect] userId: %s', userId);

    var userNamespace = Object.keys(self.namespace.userMap[userId]);

    if (userNamespace) {
      var userNamespaceSocketCount = userNamespace.length;
      if (userNamespaceSocketCount == 0) {
        delete self.namespace.userMap[self.socket.user._id.toString()];
      }
    }
  } else {
    logger.info("WARNING! Someone left the room and we don't know who it was...");
  }

};



module.exports = SocketServer;
