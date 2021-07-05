var mongoose = require("mongoose");
var _ = require("lodash");
var date = process.env.EXPIRE ? process.env.EXPIRE : new Date("3000-12-31");
var counterSchema = new mongoose.Schema({
    _id: {
        type: String
    },
    next: {
        type: Number
    },
    expiresAt: {
        type: Date,
        default: date
    }
});
counterSchema.index({
    expiresAt: 1
}, {
    expireAfterSeconds: 0
});
var counterModel = mongoose.model("counter", counterSchema);
var setDefaults = function (sequenceName, defaultValue) {
    if (!sequenceName) {
        return;
    }
    defaultValue = defaultValue ? defaultValue - 1 : 0;
    counterModel.create({
        _id: sequenceName,
        next: defaultValue
    }).then(() => { }, () => { });
};
var getCount = function (sequenceName, expire, callback) {
    var options = {};
    if (!expire) {
        expire = date;
    }
    options.new = true;
    options.upsert = true;
    options.setDefaultsOnInsert = true;
    counterModel.findByIdAndUpdate(sequenceName, {
        $inc: {
            next: 1
        },
        $set: {
            expiresAt: expire
        }
    }, options, callback);
};

function getIdGenerator(prefix, counterName, suffix, padding, counter) {
    if (counter || counter === 0) {
        counter = parseInt(counter, 10);
        setDefaults(counterName, counter);
    }
    return function (next) {
        var self = this;
        var mid = null;
        prefix = prefix ? prefix : "";
        suffix = suffix ? suffix : "";
        if (!self._id) {
            generateId(prefix, counterName, suffix, padding, counter)
                .then(id => {
                    self._id = id;
                    next();
                })
                .catch(err => {
                    next(err);
                })
        } else {
            next();
        }
    };
}

function generateId(prefix, counterName, suffix, padding, counter) {
    prefix = prefix ? prefix : "";
    suffix = suffix ? suffix : "";
    let id = null;
    return new Promise((resolve, reject) => {
        try {
            if (typeof counter == 'string') {
                counter = parseInt(counter, 10);
            }
        } catch (e) {
            counter = null;
        }
        if (typeof counter == 'number' && counter > -1) {
            getCount(counterName, null, function (err, doc) {
                if (err) {
                    return reject(err);
                }
                if (padding) {
                    id = prefix + _.padStart((doc.next + ''), padding, '0') + suffix;
                } else {
                    id = prefix + doc.next + suffix;
                }
                return resolve(id);
            });
        } else if (padding) {
            id = prefix + rand(padding) + suffix;
            resolve(id)
        } else {
            getCount(counterName, null, function (err, doc) {
                if (err) return reject(err);
                id = prefix + doc.next + suffix
                resolve(id);
            });
        }
    })
}

function rand(_i) {
    var i = Math.pow(10, _i - 1);
    var j = Math.pow(10, _i) - 1;
    return ((Math.floor(Math.random() * (j - i + 1)) + i));
};

function transactionIdGenerator() {
    return function (next) {
        var self = this;
        var date = new Date();
        date.setDate(date.getDate() + 1);
        if (!self._id) {
            getCount("universalTransactionId" + date.getDate(), date, function (err, doc) {
                var count = 1000000;
                count += doc.next;
                date.setDate(date.getDate() - 1);
                self._id = count.toString() + date.getTime();
                next();
            });
        } else {
            next();
        }
    };
}

function transactionIdGeneratorParallel() {
    return function (next, done) {
        var self = this;
        var date = new Date();
        date.setDate(date.getDate() + 1);
        if (!self._id) {
            getCount("universalTransactionId" + date.getDate(), date, function (err, doc) {
                var count = 1000000;
                count += doc.next;
                date.setDate(date.getDate() - 1);
                self._id = count.toString() + date.getTime();
                done();
            });
        } else {
            done();
        }
        next();
    };
}
module.exports.transactionIdGeneratorParallel = transactionIdGeneratorParallel;
module.exports.transactionIdGenerator = transactionIdGenerator;
module.exports.getIdGenerator = getIdGenerator;
module.exports.generateId = generateId;
module.exports.getCount = getCount;
module.exports.setDefaults = setDefaults;