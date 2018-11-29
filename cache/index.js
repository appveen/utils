const bluebird = require("bluebird");
const redis = require("redis");
bluebird.promisifyAll(redis);
let host = process.env.REDIS_HOST;
let port = process.env.REDIS_PORT;
const client = redis.createClient(port, host);
const logger = global.logger;

let e = {};

client.on('error', function(err){
  logger.error(err.message);
})

client.on('connect', function() {
  logger.info('Redis client connected');
});

function calculateExpirySeconds(expiry){
  return parseInt((expiry - Date.now())/1000);
}

e.uuid = (a) => {
  return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,e.uuid)
}

e.addUser = (_uid, _token, _singleLogin) => {
  logger.debug("Inside ::  addUser()");
  logger.debug(`uid :: ${_uid}`);
  logger.debug(`token :: ${_token}`);
  logger.debug(`singleLogin :: ${_singleLogin}`);
  if(_singleLogin) return client.setAsync(_uid, _token);
  else return client.saddAsync(_uid, _token);
}

e.checkUser = (_uid) => client.existsAsync(_user).then(_d => _d == 1);

e.removeUser = (_uid) => {
  logger.debug("Inside ::  removeUser()");
  logger.debug(`uid :: ${_uid}`);
  client.typeAsync(_user)
  .then( _type => {
    if( _type == "string") {
      client.getAsync(_uid)
      .then( _token => client.existsAsync("t:"+_token))
      .then(_d => {
        if( _d == 0 ) {
          client.getAsync(_uid)
          .then( _token => e.blacklist(_token))
          .then( () => client.delAsync(_uid))
        }
      });
    } else {
      client.smembersAsync(_uid)
      .then( _tokens => {
        _tokens.forEach(_token => {
          client.existsAsync("t:" + _token)
          .then(_d => {
            if (_d == 1) {
              client.sremAsync(_uid, _token)
              .then( () => e.blacklist(_token))
            }
          });
        })
      })
    }
  })
}

e.addToken = (_token, _default, _uuidOfUI, _expiry, _uiHeartbeatInterval) => {
  logger.debug("Inside ::  addToken()");
  logger.debug(`token :: ${_token}`);
  logger.debug(`default :: ${_default}`);
  logger.debug(`uuidOfUI :: ${_uuidOfUI}`);
  logger.debug(`expiry :: ${_expiry}`);
  logger.debug(`expiry in seconds:: ${calculateExpirySeconds(_expiry)}`);
  logger.debug(`uiHeartbeatInterval :: ${_uiHeartbeatInterval}`);
  return client.saddAsync("t:"+_token, _uuidOfUI)
  .then( () => {
    if(_default) client.saddAsync("t:"+_token, "DUMMY")
  })
  .then( () => e.addUISessions(_uuidOfUI, _token, _uiHeartbeatInterval))
  .then( () => client.expireAsync("t:"+_token, calculateExpirySeconds(_expiry)))
};

e.refreshToken = (_tokenOld, _tokenNew, _expiry) => {
  logger.debug("Inside ::  refreshToken()");
  logger.debug(`token OLD :: ${_tokenOld}`);
  logger.debug(`token NEW :: ${_tokenNew}`);
  logger.debug(`expiry :: ${_expiry}`);
  logger.debug(`expiry in seconds:: ${calculateExpirySeconds(_expiry)}`);
  return client.smembersAsync("t:"+_tokenOld)
  .then( _d => client.saddAsync("t:"+_tokenNew, _d))
  .then( () => client.expireAsync("t:"+_tokenNew, calculateExpirySeconds(_expiry)))
  .then( () => client.delAsync("t:"+_tokenOld))
};

e.addUISessions = (_uuidOfUI, _token, _uiHeartbeatInterval) => {
  logger.debug("Inside ::  addUISessions()");
  logger.debug(`uuidOfUI :: ${_uuidOfUI}`);
  logger.debug(`token :: ${_token}`);
  logger.debug(`uiHeartbeatInterval :: ${_uiHeartbeatInterval}`);
  return client.setAsync(_uuidOfUI, _token)
  .then( () => client.expireAsync(_uuidOfUI, _uiHeartbeatInterval));
};

e.handleHeartBeat = (_uuidOfUI, _token, _uiHeartbeatInterval) => {
  logger.debug("Inside ::  handleHeartBeat()");
  logger.debug(`uuidOfUI :: ${_uuidOfUI}`);
  logger.debug(`token :: ${_token}`);
  logger.debug(`uiHeartbeatInterval :: ${_uiHeartbeatInterval}`);
  return client.setAsync(_uuidOfUI, _token)
  .then( () => client.expireAsync(_uuidOfUI, _uiHeartbeatInterval));
}

e.showUISessions = (_token) => {
  logger.debug("Inside ::  showUISessions()");
  logger.debug(`token :: ${_token}`);
  return client.smembersAsync("t:"+_token)
  .then(_d => { logger.debug(_d); return _d;});
};

e.isValidToken = (_k) => client.existsAsync("t:" + _k).then(_d => _d == 1);

e.isBlacklistedToken = (_k) => client.existsAsync("b:" + _k).then(_d => _d == 1);

e.blacklist = (_token) => {
  logger.debug("Inside ::  blacklist()");
  logger.debug(`token :: ${_token}`);
  return client.saddAsync("b:"+_token, _token)
  .then( () => client.ttlAsync("t:"+_token))
  .then( _expiry => client.expireAsync("b:"+_token, _expiry))
  .then( () => client.delAsync("t:"+_token))
};

function checkSessions(){
  client.keysAsync("t:*")
  .then( _tokens => _tokens.forEach(_t => cleanup(_t)))
  client.keysAsync("USR*")
  .then( _users => _users.forEach(_u => cleanupUsers(_u)))
}

function cleanup(_t) {
  client.smembersAsync(_t)
  .then( _keys => {
    _keys.forEach(_k => {
      if(_k != "DUMMY" )
        client.existsAsync(_k)
        .then(_d => {
          if (_d == 0) client.sremAsync(_t, _k);
        });
    })
  })
}

function cleanupUsers(_user) {
  client.typeAsync(_user)
  .then( _type => {
    if( _type == "string") {
      client.getAsync(_user)
      .then( _token => client.existsAsync("t:"+_token))
      .then(_d => {
        if( _d == 0 ) {
          client.getAsync(_user)
          .then( _token => e.blacklist(_token))
          .then( () => client.delAsync(_user))
        }
      });
    } else {
      client.smembersAsync(_user)
      .then( _tokens => {
        _tokens.forEach(_token => {
          client.existsAsync("t:" + _token)
          .then(_d => {
            if (_d == 0) {
              client.sremAsync(_user, _token)
              .then( () => e.blacklist(_token))
            }
          });
        })
      })
    }
  })
}

setInterval(() => checkSessions(), 1000);

module.exports = e;