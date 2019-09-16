var log4js = require("log4js");
const logLevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info';

function getLogger(defaultContext) {
  log4js.configure({
    levels: {
      AUDIT: { value: Number.MAX_VALUE - 1, colour: 'yellow' }
    },
    appenders: {
      out: {
        type: 'stdout', layout: {
          type: 'pattern',
          pattern: '[%d] [%p] [%x{ns}] [%x{podId}] [%x{user}] [%x{txnId}] - %m%n',
          tokens: {
            ns: defaultContext.ns,
            podId: defaultContext.podId,
            user: function (logEvent) {
              let user = defaultContext.user;
              let req = logEvent.data[0];
              if (req && typeof req == 'object') {
                user = req.get('user') || req.user || user;
                if (req.get('txnId') == undefined || req.txnId == undefined) logEvent.data.shift();
              }
              return user;
            },
            txnId: function (logEvent) {
              let txnId = defaultContext.txnId;
              let req = logEvent.data[0]
              if (req && typeof req == 'object') {
                txnId = req.txnId;
                logEvent.data.shift();
              }
              return txnId;
            }
          }
        }
      }
    },
    categories: { default: { appenders: ['out'], level: logLevel.toUpperCase() } }
  });
  log4js.level = logLevel;
  return log4js;
}

module.exports = {
  getLogger
};
