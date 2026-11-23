var mongoose = require("mongoose");
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
// Increments the counter and resolves with the updated counter document.
// The optional callback is still honoured for existing callers; the promise is always returned.
var getCount = function (sequenceName, expire, callback) {
    var options = {};
    if (!expire) {
        expire = date;
    }
    options.returnDocument = "after";
    options.upsert = true;
    options.setDefaultsOnInsert = true;
    var promise = counterModel.findByIdAndUpdate(sequenceName, {
        $inc: {
            next: 1
        },
        $set: {
            expiresAt: expire
        }
    }, options).exec();
    if (typeof callback === "function") {
        promise.then(function (doc) { callback(null, doc); }, function (err) { callback(err); });
    }
    return promise;
};

// The returned function is a Mongoose pre hook. Mongoose 9 does not pass next() to pre hooks, so it is async;
// async hooks work the same way on Mongoose 6, 7 and 8.
function getIdGenerator(prefix, counterName, suffix, padding, counter) {
    if (counter || counter === 0) {
        counter = parseInt(counter, 10);
        setDefaults(counterName, counter);
    }
    return async function () {
        prefix = prefix ? prefix : "";
        suffix = suffix ? suffix : "";
        if (!this._id) {
            this._id = await generateId(prefix, counterName, suffix, padding, counter);
        }
    };
}

async function generateId(prefix, counterName, suffix, padding, counter) {
    prefix = prefix ? prefix : "";
    suffix = suffix ? suffix : "";
    if (counter || counter === 0) {
        const doc = await getCount(counterName, null);
        let nextNo = padding ? Math.pow(10, padding) + doc.next : doc.next;
        nextNo = nextNo.toString();
        if (padding && parseInt(nextNo.substr(0, 1)) > 1) {
            throw new Error("length of _id is exceeding counter");
        }
        return padding ? prefix + nextNo.substr(1) + suffix : prefix + nextNo + suffix;
    } else if (padding) {
        return prefix + rand(padding) + suffix;
    }
    const doc = await getCount(counterName, null);
    return prefix + doc.next;
}

function rand(_i) {
    var i = Math.pow(10, _i - 1);
    var j = Math.pow(10, _i) - 1;
    return ((Math.floor(Math.random() * (j - i + 1)) + i));
};

function transactionIdGenerator() {
    return async function () {
        if (!this._id) {
            var date = new Date();
            date.setDate(date.getDate() + 1);
            const doc = await getCount("universalTransactionId" + date.getDate(), date);
            var count = 1000000;
            count += doc.next;
            date.setDate(date.getDate() - 1);
            this._id = count.toString() + date.getTime();
        }
    };
}

// Was a parallel (next, done) hook. Mongoose 9 has no parallel hooks, so it now runs like transactionIdGenerator.
function transactionIdGeneratorParallel() {
    return transactionIdGenerator();
}
module.exports.transactionIdGeneratorParallel = transactionIdGeneratorParallel;
module.exports.transactionIdGenerator = transactionIdGenerator;
module.exports.getIdGenerator = getIdGenerator;
module.exports.generateId = generateId;
module.exports.getCount = getCount;
module.exports.setDefaults = setDefaults;

