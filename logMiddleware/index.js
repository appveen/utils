var logMiddleware = (logger) => {
    var counter = 0;
    return (req, res, next) => {
        var reqId = counter++;
        if (reqId == Number.MAX_VALUE) {
            reqId = counter = 0;
        }
        let url =[];
        let api = req.originalUrl.split('?');
        if(api[0].endsWith('/health/live') || api[0].endsWith('/health/ready'))
        {
            next();
        }
        else{
            logger.info(reqId + " " + req.ip + " " + req.method + " " + req.originalUrl);
            next();
            logger.trace(reqId + " Sending Response");
        }
    };
}



module.exports.getLogMiddleware = logMiddleware;