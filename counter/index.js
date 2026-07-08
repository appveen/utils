var mongoose = require("mongoose");
var date = process.env.EXPIRE ? new Date(process.env.EXPIRE) : new Date("3000-12-31");

// Counter reads/writes go through the raw native driver (via Mongoose's own
// already-connected MongoClient) instead of a Mongoose Model. Mongoose 8.x's
// Model/Query layer buffers operations and can stall indefinitely against
// this deployment ("Operation counters.findOneAndUpdate() buffering timed
// out"); the native driver has no such buffering step, so this sidesteps
// the stall while still using the same live connection pool.
var indexEnsured = false;
function ensureIndexes(collection) {
    if (indexEnsured) {
        return;
    }
    indexEnsured = true;
    // TTL index used to be created automatically by Mongoose's autoIndex
    // behavior for the "counter" model. Fired once, best-effort, in the
    // background so a slow/failed index build never blocks counter reads.
    collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(err => {
        indexEnsured = false;
        console.error("Error creating TTL index on counters collection:", err.message);
    });
}

// Mongoose Models transparently queue ("buffer") operations issued before
// the connection is ready; the raw driver does not. Some callers (e.g.
// schema pre-save hooks wired up at module-load time) invoke the counter
// before mongoose.connect() has resolved, so wait for the "connected"
// event here instead of assuming the client already exists.
function waitForConnection() {
    if (mongoose.connection.readyState === 1 && mongoose.connection.getClient()) {
        return Promise.resolve();
    }
    return new Promise(resolve => {
        mongoose.connection.once("connected", resolve);
    });
}

async function getCounterCollection() {
    await waitForConnection();
    var collection = mongoose.connection.getClient().db(mongoose.connection.name).collection("counters");
    ensureIndexes(collection);
    return collection;
}

var setDefaults = function (sequenceName, defaultValue) {
    if (!sequenceName) {
        return;
    }
    defaultValue = defaultValue ? defaultValue - 1 : 0;
    getCounterCollection().then(collection => collection.insertOne({
        _id: sequenceName,
        next: defaultValue,
        expiresAt: date
    })).then(() => { }, () => { });
};
var getCount = async function (sequenceName, expire) {
    if (!expire) {
        expire = date;
    }
    var collection = await getCounterCollection();
    // includeResultMetadata is set explicitly so the return shape (raw
    // document vs. {value: document}) doesn't depend on driver-version
    // defaults; a wrong guess here previously produced NaN counter values.
    var doc = await collection.findOneAndUpdate({
        _id: sequenceName
    }, {
        $inc: {
            next: 1
        },
        $set: {
            expiresAt: expire
        }
    }, {
        returnDocument: "after",
        upsert: true,
        includeResultMetadata: false
    });
    if (!doc || typeof doc.next !== "number") {
        throw new Error("Counter document for " + sequenceName + " did not return a valid 'next' value");
    }
    return doc;
};

function getIdGenerator(prefix, counterName, suffix, padding, counter) {
    if (counter || counter === 0) {
        counter = parseInt(counter, 10);
        setDefaults(counterName, counter);
    }
    return function (next) {
        var self = this;
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
                });
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
        if (counter || counter === 0) {
            getCount(counterName, null).then(doc => {
                let nextNo = padding ? Math.pow(10, padding) + doc.next : doc.next;
                nextNo = nextNo.toString();
                if (padding && parseInt(nextNo.substr(0, 1)) > 1) {
                    return reject(new Error("length of _id is exceeding counter"));
                }
                id = padding ? prefix + nextNo.substr(1) + suffix : prefix + nextNo + suffix;
                return resolve(id);
            }).catch(err => reject(err));
        } else if (padding) {
            id = prefix + rand(padding) + suffix;
            resolve(id);
        } else {
            getCount(counterName, null).then(doc => {
                id = prefix + doc.next;
                resolve(id);
            }).catch(err => reject(err));
        }
    });
}

function rand(_i) {
    var i = Math.pow(10, _i - 1);
    var j = Math.pow(10, _i) - 1;
    return ((Math.floor(Math.random() * (j - i + 1)) + i));
}

function transactionIdGenerator() {
    return function (next) {
        var self = this;
        var date = new Date();
        date.setDate(date.getDate() + 1);
        if (!self._id) {
            getCount("universalTransactionId" + date.getDate(), date).then(doc => {
                var count = 1000000;
                count += doc.next;
                date.setDate(date.getDate() - 1);
                self._id = count.toString() + date.getTime();
                next();
            }).catch(err => next(err));
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
            getCount("universalTransactionId" + date.getDate(), date).then(doc => {
                var count = 1000000;
                count += doc.next;
                date.setDate(date.getDate() - 1);
                self._id = count.toString() + date.getTime();
                done();
            }).catch(err => done(err));
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

