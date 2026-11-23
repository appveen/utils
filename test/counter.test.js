'use strict';
// Needs a running MongoDB: MONGO_URL=mongodb://localhost:27017/utils-test npm test
// Runs against whichever Mongoose is installed (6.5.1+ through 9).
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const mongoose = require('mongoose');
const utils = require('../index');

const url = process.env.MONGO_URL;
const skip = url ? false : 'set MONGO_URL to run the counter tests';
const unique = Date.now().toString(36);

test.before(async () => { if (url) await mongoose.connect(url); });
test.after(async () => {
	if (!url) return;
	await mongoose.connection.db.dropDatabase();
	await mongoose.disconnect();
});

// getIdGenerator seeds its counter with a fire-and-forget create(); wait for it so the first id is deterministic
const seeded = async (counterName) => {
	for (let i = 0; i < 100; i++) {
		if (await mongoose.connection.db.collection('counters').findOne({ _id: counterName })) return;
		await new Promise(r => setTimeout(r, 20));
	}
	throw new Error('counter was not seeded: ' + counterName);
};

const model = (name, hook) => {
	const schema = new mongoose.Schema({ _id: { type: String }, name: String });
	schema.pre('save', hook);
	return mongoose.model(name, schema);
};

test('getIdGenerator assigns sequential ids from the counter (the hook must finish before save)', { skip }, async () => {
	const M = model('seq' + unique, utils.counter.getIdGenerator('BUM', 'seq' + unique, null, null, 1000));
	await seeded('seq' + unique);
	const a = await new M({ name: 'a' }).save();
	const b = await new M({ name: 'b' }).save();
	assert.strictEqual(a._id, 'BUM1000');
	assert.strictEqual(b._id, 'BUM1001');
	assert.strictEqual(await M.countDocuments({ _id: { $in: ['BUM1000', 'BUM1001'] } }), 2);
});

test('getIdGenerator pads the number when padding is given', { skip }, async () => {
	const M = model('pad' + unique, utils.counter.getIdGenerator('P', 'pad' + unique, null, 4, 1));
	await seeded('pad' + unique);
	const a = await new M({ name: 'a' }).save();
	assert.strictEqual(a._id, 'P0001');
});

test('getIdGenerator keeps an _id that is already set', { skip }, async () => {
	const M = model('keep' + unique, utils.counter.getIdGenerator('K', 'keep' + unique, null, null, 1));
	await seeded('keep' + unique);
	const a = await new M({ _id: 'FIXED', name: 'a' }).save();
	assert.strictEqual(a._id, 'FIXED');
});

test('getIdGenerator concurrent saves get distinct ids', { skip }, async () => {
	const M = model('par' + unique, utils.counter.getIdGenerator('C', 'par' + unique, null, null, 1));
	await seeded('par' + unique);
	const docs = await Promise.all(Array.from({ length: 20 }, (_, i) => new M({ name: 'n' + i }).save()));
	assert.strictEqual(new Set(docs.map(d => d._id)).size, 20);
});

test('generateId rejects when the padded number would overflow', { skip }, async () => {
	// padding 1 holds the numbers 1 to 9; the 10th would need two digits
	for (let i = 1; i <= 9; i++) assert.strictEqual(await utils.counter.generateId('X', 'ovf' + unique, null, 1, 9), 'X' + i);
	await assert.rejects(() => utils.counter.generateId('X', 'ovf' + unique, null, 1, 9), /exceeding counter/);
});

test('getCount returns a promise and still honours the callback form', { skip }, async () => {
	const viaPromise = await utils.counter.getCount('cnt' + unique);
	assert.strictEqual(viaPromise.next, 1);
	const viaCallback = await new Promise((resolve, reject) => utils.counter.getCount('cnt' + unique, null, (err, doc) => (err ? reject(err) : resolve(doc))));
	assert.strictEqual(viaCallback.next, 2);
});

test('transactionIdGenerator and transactionIdGeneratorParallel assign an _id', { skip }, async () => {
	const A = model('txa' + unique, utils.counter.transactionIdGenerator());
	const B = model('txb' + unique, utils.counter.transactionIdGeneratorParallel());
	const a = await new A({ name: 'a' }).save();
	const b = await new B({ name: 'b' }).save();
	assert.match(a._id, /^\d{7,}\d{13}$/);
	assert.match(b._id, /^\d{7,}\d{13}$/);
	assert.notStrictEqual(a._id, b._id);
});

test('logToMongo writes a log document without throwing', { skip }, async () => {
	const res = new EventEmitter();
	res.getHeaders = () => ({ 'content-type': 'application/json' });
	res.statusCode = 200;
	const req = { headers: { authorization: 'JWT secret' }, originalUrl: '/x', method: 'GET', body: {}, connection: { remoteAddress: '127.0.0.1' } };
	await new Promise((resolve) => utils.logToMongo('test-' + unique)(req, res, resolve));
	res.emit('finish');
	await new Promise(r => setTimeout(r, 300));
	const doc = await mongoose.connection.db.collection('logs').findOne({ name: 'test-' + unique });
	assert.ok(doc, 'log document was written');
	assert.strictEqual(doc.reqHeaders.authorization, 'JWT *************************');
});
