var logMiddleware = (logger) => {
    var counter = 0;
    return (req, res, next) => {
        var reqId = counter++;
        if (reqId == Number.MAX_VALUE) {
            reqId = counter = 0;
        }
        let url =[];
        let api = req.originalUrl.split('?');
        url = api[0].split('/');
        if(url.length == 4  & url[3] == 'health')
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