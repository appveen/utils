const bluebird = require("bluebird");
const redis = require("ioredis");
bluebird.promisifyAll(redis);
let host = process.env.REDIS_HOST;
let port = process.env.REDIS_PORT;
let client = null;
let log4js = require('log4js');
const logLevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info';
log4js.configure({
  levels: {
    AUDIT: { value: Number.MAX_VALUE - 1, colour: 'yellow' }
  },
  appenders: { out: { type: 'stdout', layout: { type: 'basic' } } },
  categories: { default: { appenders: ['out'], level: logLevel.toUpperCase() } }
});
const loggerName = process.env.HOSTNAME ? `[CACHE] [${process.env.HOSTNAME}]` : '[CACHE]';
let logger = log4js.getLogger(loggerName);
let e = {};

function calculateExpirySeconds(expiry) {
  return parseInt((expiry - Date.now()) / 10000);
}

function getClusterNodes() {
  let nodes = [];
  //format: 127.0.0.1,127.0.0.2:8990 results in 127.0.0.1:6379 and 127.0.0.2:8990 respectively
  let clusterNodes = process.env.REDIS_CLUSTER.split(',');
  clusterNodes.map(node => {
    nodes.push({
      host: node.split(':')[0],
      port: node.split(':')[1] || '6379',
    })
  })
  return nodes;
}

e.init = () => {
  if (process.env.REDIS_CLUSTER) {
    logger.info('Connecting to redis cluster nodes :: ', JSON.stringify(getClusterNodes()));
    client = new redis.Cluster(getClusterNodes());
  }
  else {
  	logger.info('Connecting to redis standalone server');
    client = redis.createClient(port, host);
  }
  client.on('error', function (err) {
    logger.error(err.message);
  })

  client.on('connect', function () {
    logger.info('Redis client connected');
    setInterval(() => checkSessions(), 1000);
  });

}

e.uuid = (a) => {
  return a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, e.uuid)
}

e.addUser = (_uid, _token, _singleLogin) => {
  logger.trace("Inside ::  addUser()");
  logger.trace(`uid :: ${_uid}`);
  logger.trace(`token :: ${_token}`);
  logger.trace(`singleLogin :: ${_singleLogin}`);
  _uid = `ODP:${_uid}`;
  if (_singleLogin) return client.setAsync(_uid, _token);
  else return client.saddAsync(_uid, _token);
}

e.checkUser = (_uid) => {
  _uid = `ODP:${_uid}`;
  return client.existsAsync(_uid).then(_d => _d == 1);
}

e.removeUser = (_uid) => {
  logger.trace("Inside ::  removeUser()");
  logger.trace(`uid :: ${_uid}`);
  _uid = `ODP:${_uid}`;
  return client.typeAsync(_uid)
    .then(_type => {
      if (_type == "string") {
        return client.getAsync(_uid)
          .then(_token => e.blacklist(_token))
          .then(() => client.delAsync(_uid))
      } else {
        return client.smembersAsync(_uid)
          .then(_tokens => {
            _tokens.forEach(_token => {
              client.sremAsync(_uid, _token)
                .then(() => e.blacklist(_token))
            })
          })
      }
    })
}

e.addToken = (_token, _default, _uuidOfUI, _expiry, _uiHeartbeatInterval) => {
  logger.trace("Inside ::  addToken()");
  logger.trace(`token :: ${_token}`);
  logger.trace(`default :: ${_default}`);
  logger.trace(`uuidOfUI :: ${_uuidOfUI}`);
  logger.trace(`expiry :: ${_expiry}`);
  logger.trace(`expiry in seconds:: ${calculateExpirySeconds(_expiry)}`);
  logger.trace(`uiHeartbeatInterval :: ${_uiHeartbeatInterval}`);
  return client.saddAsync("t:" + _token, _uuidOfUI)
    .then(() => {
      if (_default) client.saddAsync("t:" + _token, "DUMMY")
    })
    .then(() => e.addUISessions(_uuidOfUI, _token, _uiHeartbeatInterval))
    .then(() => client.expireAsync("t:" + _token, calculateExpirySeconds(_expiry)))
};

e.refreshToken = (_uid, _tokenOld, _tokenNew, _uuidOfUI, _expiryNew, _singleLogin, _uiHeartbeatInterval, _extend) => {
  logger.trace("Inside ::  refreshToken()");
  logger.trace(`token OLD :: ${_tokenOld}`);
  logger.trace(`token NEW :: ${_tokenNew}`);
  logger.trace(`uuidOfUI :: ${_uuidOfUI}`);
  logger.trace(`expiry :: ${_expiryNew}`);
  logger.trace(`expiry in seconds:: ${calculateExpirySeconds(_expiryNew)}`);
  logger.trace(`singleLogin :: ${_singleLogin}`);
  logger.trace(`uiHeartbeatInterval :: ${_uiHeartbeatInterval}`);
  logger.trace(`extend :: ${_extend}`);
  return e.addUser(_uid, _tokenNew, _singleLogin)
    .then(() => client.smembersAsync("t:" + _tokenOld))
    .then(_d => {
      logger.trace(`smembers :: ${_d}`);
      logger.trace(typeof _d);
      if (_d && _d.length > 0)
        return client.saddAsync("t:" + _tokenNew, _d);
      else return Promise.resolve();
    })
    .then(() => e.addUISessions(_uuidOfUI, _tokenNew, _uiHeartbeatInterval))
    .then(() => client.saddAsync("t:" + _tokenNew, _uuidOfUI))
    .then(() => client.expireAsync("t:" + _tokenNew, calculateExpirySeconds(_expiryNew)))
    .then(() => {
      if (_extend && _singleLogin)
        return e.blacklist(_tokenOld)
    })
};

e.addUISessions = (_uuidOfUI, _token, _uiHeartbeatInterval) => {
  logger.trace("Inside ::  addUISessions()");
  logger.trace(`uuidOfUI :: ${_uuidOfUI}`);
  logger.trace(`token :: ${_token}`);
  logger.trace(`uiHeartbeatInterval :: ${_uiHeartbeatInterval}`);
  return client.setAsync(_uuidOfUI, _token)
    .then(() => client.expireAsync(_uuidOfUI, _uiHeartbeatInterval));
};

e.handleHeartBeat = (_uuidOfUI, _token, _uiHeartbeatInterval) => {
  logger.trace("Inside ::  handleHeartBeat()");
  logger.trace(`uuidOfUI :: ${_uuidOfUI}`);
  logger.trace(`token :: ${_token}`);
  logger.trace(`uiHeartbeatInterval :: ${_uiHeartbeatInterval}`);
  return client.setAsync(_uuidOfUI, _token)
    .then(() => client.expireAsync(_uuidOfUI, _uiHeartbeatInterval));
}

e.showUISessions = (_token) => {
  logger.trace("Inside ::  showUISessions()");
  logger.trace(`token :: ${_token}`);
  return client.smembersAsync("t:" + _token)
    .then(_d => { logger.trace(_d); return _d; });
};

e.isValidToken = (_k) => client.existsAsync("t:" + _k).then(_d => _d == 1);

e.isBlacklistedToken = (_k) => client.existsAsync("b:" + _k).then(_d => _d == 1);

e.blacklist = (_token) => {
  logger.trace("Inside ::  blacklist()");
  logger.trace(`token :: ${_token}`);
  return client.saddAsync("b:" + _token, _token)
    .then(() => client.ttlAsync("t:" + _token))
    .then(_expiry => client.expireAsync("b:" + _token, _expiry))
    .then(() => client.delAsync("t:" + _token))
};

function checkSessions() {
  client.keysAsync("t:*")
    .then(_tokens => _tokens.forEach(_t => cleanup(_t)))
  client.keysAsync("ODP:*")
    .then(_users => _users.forEach(_u => cleanupUsers(_u)))
}

function cleanup(_t) {
  client.smembersAsync(_t)
    .then(_keys => {
      _keys.forEach(_k => {
        if (_k != "DUMMY")
          client.existsAsync(_k)
            .then(_d => {
              if (_d == 0) client.sremAsync(_t, _k);
            });
      })
    })
}

function cleanupUsers(_user) {
  client.typeAsync(_user)
    .then(_type => {
      if (_type == "string") {
        client.getAsync(_user)
          .then(_token => client.existsAsync("t:" + _token))
          .then(_d => {
            if (_d == 0) {
              client.getAsync(_user)
                .then(_token => e.blacklist(_token))
                .then(() => client.delAsync(_user))
            }
          });
      } else {
        client.smembersAsync(_user)
          .then(_tokens => {
            _tokens.forEach(_token => {
              client.existsAsync("t:" + _token)
                .then(_d => {
                  if (_d == 0) {
                    client.sremAsync(_user, _token)
                      .then(() => e.blacklist(_token))
                  }
                });
            })
          })
      }
    })
}

e.isConnected = () => {
	logger.trace(`Redis connection status : ${client.status}, ${client.status == 'ready'}`)
  return client.status == 'ready';
}

module.exports = e;