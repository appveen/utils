var logMiddleware = (logger) => {
  return (req, res, next) => {
    let url =[];
    let api = req.originalUrl.split('?');
    if(api[0].endsWith('/health/live') || api[0].endsWith('/health/ready')) next()
    else{
      logger.info(`[${req.get("TxnId")}] [${req.ip}] ${req.method} ${req.originalUrl}`);
      next();
      logger.trace(`[${req.get("TxnId")}] Sending Response`);
    }
  };
}

module.exports.getLogMiddleware = logMiddleware;