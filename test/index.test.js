'use strict';

const nock = require('nock');
const assert = require('chai').assert;

const dbUrl = 'http://localhost:9191';
const ddblock = require('../');
const lock = ddblock('squid-test', 60, {
	region: 'eu-central-1',
	endpoint: dbUrl,
	accessKeyId: 'a',
	secretAccessKey: 'a'
});

describe('DDBLock', () => {

	before(() => nock.disableNetConnect());
	after(() => nock.enableNetConnect());
	afterEach(() => nock.cleanAll());

	describe('#create', () => {

		it('throws AlreadyLockedError if lock exists', () => {
			nock(dbUrl)
				.post('/')
				.reply(400, {
					'__type': 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException',
					message: 'The conditional request failed'
				});

			return lock
				.create('condition-fail')
				.then(() => {
					throw new Error('Should throw AlreadyLockedError');
				})
				.catch(lock.AlreadyLockedError, (err) => {
					assert.isOk(err);
				});
		});

		it('creates lock with name and created date', () => {
			let payload;

			nock(dbUrl)
				.post('/', (data) => {
					payload = data;
					return data;
				})
				.reply(200, {});

			return lock
				.create('foobar')
				.then((res) => {
					assert.isOk(res);
					assert.equal(payload.Item.Name.S, 'foobar');
					assert.deepProperty(payload, 'Item.Created.N');
				});
		});

	});

	describe('#get', () => {

		it('returns item from dynamodb', () => {
			nock(dbUrl)
				.post('/')
				.reply(200, {
					Item: {
						Name: {
							S: 'foobar'
						},
						Created: {
							N: '1474640528613'
						}
					}
				});

			return lock
				.get('foobar')
				.then((item) => {
					assert.deepEqual(item, {
						Name: 'foobar',
						Created: 1474640528613
					});
				});

		});

		it('return falsy value if item doesn\'t exist', () => {
			nock(dbUrl)
				.post('/', {
					TableName: 'squid-test',
					ConsistentRead: true,
					AttributesToGet: ['Name', 'Created'],
					Key: {
						Name: {
							S: 'notexisting'
						}
					}
				})
				.reply(200, {});

			return lock
				.get('notexisting')
				.then((l) => {
					assert.isNotOk(l);
				});
		});

	});

	describe('#expired', () => {

		it('return false if lock hasnt expired', () => {
			assert.isFalse(lock.expired({
				Name: 'foo',
				Created: new Date().getTime()
			}));
		});

		it('returns the lock name if lock has expired', () => {
			const expired = lock.expired({
				Name: 'foo',
				Created: new Date().getTime() - 60000
			});

			assert.equal(expired, 'foo');
		});

	});

	describe('#pruneExpired', () => {

		it('removes locks that have expired', () => {
			const getReq = nock(dbUrl)
				.post('/', {
					TableName: 'squid-test',
					ConsistentRead: true,
					AttributesToGet: ['Name', 'Created'],
					Key: {
						Name: {S: 'expired'}
					}
				})
				.reply(200, {
					Item: {
						Name: {
							S: 'expired'
						},
						Created: {
							N: '1474640528613'
						}
					}
				});

			const removeReq = nock(dbUrl)
				.post('/', {
					TableName: 'squid-test',
					Key: {Name: {S: 'expired'}}
				})
				.reply(200, {});

			return lock
				.pruneExpired('expired')
				.then(() => {
					assert(getReq.isDone());
					assert(removeReq.isDone());
				});
		});

	});

	describe('#remove', () => {

		it('does nothing if name is omitted', () => {
			return lock.remove();
		});

		it('removes lock from db', () => {
			nock(dbUrl)
				.post('/', {
					TableName: 'squid-test',
					Key: {
						Name: {
							S: 'foobar'
						}
					}
				})
				.reply(200, {});

			return lock.remove('foobar');
		});

	});
});
