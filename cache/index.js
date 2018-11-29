const bluebird = require("bluebird");
const redis = require("redis");
bluebird.promisifyAll(redis);
const client = redis.createClient();
const logger = global.logger;

let e = {};

e.uuid = (a) => {
  return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,e.uuid)
}

e.addToken = (_token, _uuidOfUI, _expiry) => {
  logger.debug("Inside ::  addToken()");
  logger.debug(`token :: ${_token}`);
  logger.debug(`_uuidOfUI :: ${_uuidOfUI}`);
  logger.debug(`_expiry :: ${_expiry}`);
  return client.saddAsync("t:"+_token, _uuidOfUI)
  .then( () => e.addUISessions(_uuidOfUI, _token))
  .then( () => client.expireAsync("t:"+_token, _expiry))
};

e.addUISessions = (_uuidOfUI, _token, _uiHeartbeatTimeOut) => {
  logger.debug("Inside ::  addUISessions()");
  logger.debug(`_uuidOfUI :: ${_uuidOfUI}`);
  logger.debug(`token :: ${_token}`);
  logger.debug(`uiHeartbeatTimeOut :: ${_uiHeartbeatTimeOut}`);
  return client.setAsync(_uuidOfUI, _token)
  .then( () => client.expireAsync(_uuidOfUI, uiHeartbeatTimeOut));
};

e.handleHeartBeat = (_uuidOfUI, _token, _uiHeartbeatTimeOut) => {
  logger.debug("Inside ::  handleHeartBeat()");
  logger.debug(`_uuidOfUI :: ${_uuidOfUI}`);
  logger.debug(`token :: ${_token}`);
  logger.debug(`uiHeartbeatTimeOut :: ${_uiHeartbeatTimeOut}`);
  return client.setAsync(_uuidOfUI, _token)
  .then( () => client.expireAsync(_uuidOfUI, _uiHeartbeatTimeOut));
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

setInterval(() => checkSessions(), 1000);

module.exports = e;