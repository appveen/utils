const axios = require("axios");

function isUrlPermitted(permittedUrls, originalUrl) {
    let permitted = false;
    if (!permittedUrls) return false;
    permittedUrls.forEach(url => {
        if (originalUrl.startsWith(url)) {
            permitted = true;
            return;
        }
    });
    return permitted;
}

function validateJWT(url, req) {
    var options = {
        headers: {
            "Content-Type": "application/json",
            "TxnId": req.get('txnId'),
            "Authorization": req.get("Authorization")
        },
        json: true
    };
    return new Promise((resolve, reject) => {
        axios.get(url, { ...options })
            .then(response => {
                resolve(response.data);
            })
            .catch(error => {
                logger.error("Error requesting User Management");
                if (error.response) {
                    // The request was made and the server responded with a status code
                    reject(new Error(JSON.stringify(error.response.data)));
                } else if (error.request) {
                    // The request was made but no response was received
                    reject(new Error("User management service Down"));
                } else {
                    // Something happened in setting up the request
                    reject(error);
                }
            });
    });
}

var getAuthorizationMiddleware = (validationAPI, permittedUrls) => {
    return (_req, _res, next) => {
        if (_req.method == "OPTIONS") next();
        else if (isUrlPermitted(permittedUrls, _req.originalUrl)) next();
        else if (_req.get("authorization")) {
            let token = _req.get("authorization").split(" ")[1];
            if (token) {
                validateJWT(validationAPI, _req)
                    .then(body => {
                        _req.user = body;
                        next();
                    })
                    .catch(err => {
                        _res.status(401).json({
                            message: "Unauthorized"
                        });
                    });
            }
        } else {
            _res.status(401).json({
                message: "Unauthorized"
            });
        }
    };
}

module.exports.getAuthMiddleware = getAuthorizationMiddleware;
