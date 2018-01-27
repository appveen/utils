var log4js = require("log4js");
log4js.configure({
    levels: {
      OFF: { value: Number.MAX_VALUE-1, colour: 'white' },
      AUDIT: { value: Number.MAX_VALUE, colour: 'yellow' }
    },
    appenders: { out: { type: 'stdout' } },
    categories: { default: { appenders: ['out'], level: 'AUDIT' } }
  });
log4js.level = process.env.LOG_LEVEL ? process.env.LOG_LEVEL: 'info';
module.exports.getLogger = log4js;
