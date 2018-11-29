const bluebird = require("bluebird");
const redis = require("redis");
bluebird.promisifyAll(redis);
const client = redis.createClient();
const logger = global.logger;

let e = {};

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

e.addToken = (_token, _default, _uuidOfUI, _expiry, _uiHeartbeatInterval) => {
  logger.debug("Inside ::  addToken()");
  logger.debug(`token :: ${_token}`);
  logger.debug(`default :: ${_default}`);
  logger.debug(`uuidOfUI :: ${_uuidOfUI}`);
  logger.debug(`expiry :: ${_expiry}`);
  logger.debug(`uiHeartbeatInterval :: ${_uiHeartbeatInterval}`);
  return client.saddAsync("t:"+_token, _uuidOfUI)
  .then( () => {
    if(_default) client.saddAsync("t:"+_token, _token)
  })
  .then( () => e.addUISessions(_uuidOfUI, _token, _uiHeartbeatInterval))
  .then( () => client.expireAsync("t:"+_token, _expiry))
};

e.refreshToken = (_tokenOld, _tokenNew, _expiry) => {
  logger.debug("Inside ::  refreshToken()");
  logger.debug(`token OLD :: ${_tokenOld}`);
  logger.debug(`token NEW :: ${_tokenNew}`);
  logger.debug(`expiry :: ${_expiry}`);
  return client.smembersAsync("t:"+_tokenOld)
  .then( _d => client.saddAsync("t:"+_tokenNew, _d))
  .then( () => client.expireAsync("t:"+_tokenNew, _expiry))
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

e.blacklist = (_token, _expiry) => {
  logger.debug("Inside ::  addToken()");
  logger.debug(`token :: ${_token}`);
  logger.debug(`_expiry :: ${_expiry}`);
  return client.delAsync("t:"+_token)
  .then( () => client.saddAsync("b:"+_token, _expiry))
  .then( () => client.expireAsync("b:"+_token, _expiry))
};

function checkSessions(){
  logger.debug("Running :: checkSessions()");
  client.keysAsync("t:*")
  .then( _tokens => _tokens.forEach(_t => cleanup(_t)))
  client.keysAsync("USR*")
  .then( _users => _users.forEach(_u => cleanupUsers(_u)))
}

function cleanup(_t) {
  logger.debug("Inside ::  cleanup()");
  logger.debug(_t);
  client.smembersAsync(_t)
  .then( _keys => {
    _keys.forEach(_k => {
      client.existsAsync(_k)
      .then(_d => {
        if (_d == 0) client.srem(_t, _k);
      });
    })
  })
}

function cleanupUsers(_t) {
  logger.debug("Inside ::  cleanupUsers()");
  logger.debug(_t);
  client.typeAsync(_t)
  .then( _type => {
    if( _type == "string") {
      client.getAsync(_t)
      .then( _token => client.existsAsync(_token))
      .then(_d => {
        if( _d == 0 ) client.delAsync(_t)
      });
    } else {
      client.smembersAsync(_t)
      .then( _keys => {
        _keys.forEach(_k => {
          client.existsAsync("t:" + _k)
          .then(_d => {
            if (_d == 0) client.srem(_t, _k);
          });
        })
      })
    }
  })
}

setInterval(() => checkSessions(), 1000);

module.exports = e;