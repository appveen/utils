var log4js = require("log4js");
const logLevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL: 'info';
log4js.configure({
    levels: {
      AUDIT: { value: Number.MAX_VALUE-1, colour: 'yellow' }
    },
    appenders: { out: { type: 'stdout', layout: { type: 'basic' } } },
    categories: { default: { appenders: ['out'], level: logLevel.toUpperCase() } }
  });
log4js.level = logLevel;
module.exports.getLogger = log4js;