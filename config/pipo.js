'use strict';

var fs = require('fs');

module.exports = function(){
  var development = {
    environment: 'development',
    encryptionScheme: 'clientKey',
    encryptionType: 'aes256',
    chats: {
      messagesPerPage: 50,
      initialPagesToLoad: 1
    },
    systemUser: {
      username: 'pipo',
      publicKey: fs.readFileSync(__dirname + '/../keys/pipo.pub'),
      privateKey: fs.readFileSync(__dirname + '/../keys/pipo.key'),
      email: 'pipo@pipo.chat'
    },
    server: {
      ssl: false,
      host: 'localhost',
      port: 3030,
    },
    client: {
      ssl: false,
      port: 3030,
      host: 'localhost'
    },
    binServer: {
      port: 3031,
      host: 'localhost',
      ssl: false,
    },
    binClient: {
      port: 3031,
      host: 'localhost',
      ssl: false
    }
  };

  var production = {
    environment: 'production',
    encryptionScheme: 'clientKey',
    encryptionType: 'aes256',
    chats: {
      messagesPerPage: 50,
      initialPagesToLoad: 1
    },
    systemUser: {
      username: 'pipo',
      publicKey: fs.readFileSync(__dirname + '/../keys/pipo.pub'),
      privateKey: fs.readFileSync(__dirname + '/../keys/pipo.key'),
      email: 'pipo@pipo.chat'
    },
    server: {
      ssl: false,
      host: 'pipo.chat',
      port: 3030
    },
    client: {
      ssl: true,
      port: 443,
      host: 'pipo.chat'
    },
    binServer: {
      port: 3031,
      host: 'pipo.chat',
      ssl: false
    },
    binClient: {
      ssl: true,
      host: 'pipo.chat',
      port: 8543
    }
  };

  switch(process.env.NODE_ENV){
    case 'development':
      return development;

    case 'production':
      return production;

    default:
      return development;
  }
};
