'use strict';

const AWS = require('aws-sdk');
const Promise = require('bluebird');

class DDBLock {

	/**
	 * Constructor
	 * @param  {Object} opts options
	 * @param  {String} opts.table name of dynamodb table
	 * @param  {Integer} opts.ttl  Time to live in seconds for locks
	 * @param  {Object} [opts.aws] options passed to AWS.DynamoDB
 	 * @param  {Boolean} [opts.disabled] will initiate DDBlock in disabled mode which always resolve on unlock and lock, useful for local development.
	 */
	constructor(opts) {
		this.ttl = opts.ttl;
		this.table = opts.table;
		this.AlreadyLockedError = AlreadyLockedError;
		this.disabled = opts.disabled;

		const db = new AWS.DynamoDB(Object.assign({apiVersion: '2012-08-10'}, opts.aws || {}));

		this.db = {
			deleteItem: Promise.promisify(db.deleteItem, {context: db}),
			putItem: Promise.promisify(db.putItem, {context: db}),
			getItem: Promise.promisify(db.getItem, {context: db})
		};
	}

	/**
	 * Create lock
	 * @param  {String} name
	 * @return {Promise} may reject with AlreadyLockedError
	 * @public
	 */
	lock(name) {
		if (this.disabled) {
			return Promise.resolve();
		}

		return this
			.pruneExpired(name)
			.then(this.create.bind(this, name));
	}

	/**
	 * Remove lock
	 * @param  {String} name
	 * @return {Promise}
	 * @public
	 */
	unlock(name) {
		if (this.disabled) {
			return Promise.resolve();
		}

		return this.remove(name);
	}

	/**
	 * Create lock entry in DB
	 * @param  {String} name
	 * @return {Promise} may reject with AlreadyLockedError
	 * @private
	 */
	create(name) {
		const params = {
			TableName: this.table,
			Item: {
				Name: {
					S: name
				},
				Created: {
					N: String(new Date().getTime())
				}
			},
			ConditionExpression: '#n <> :value',
			ExpressionAttributeNames: {
				'#n': 'Name'
			},
			ExpressionAttributeValues: {
				':value': {
					S: name
				}
			}
		};

		return this.db
			.putItem(params)
			.catch((e) => {
				if (e.code === 'ConditionalCheckFailedException') {
					throw new AlreadyLockedError(`Lock with name ${name} exists`);
				}

				throw e;
			});
	}

	/**
	 * Get lock entry
	 * @param  {String} name
	 * @return {Promise}
	 * @private
	 */
	get(name) {
		const params = {
			TableName: this.table,
			ConsistentRead: true,
			AttributesToGet: ['Name', 'Created'],
			Key: {
				Name: {
					S: name
				}
			}
		};

		return this.db
			.getItem(params)
			.then((data) => {
				// it returns empty object if no match
				if (typeof (data) === 'object' && !Object.keys(data).length) {
					return false;
				}

				return {
					Name: data.Item.Name.S,
					Created: parseInt(data.Item.Created.N, 10)
				};
			});
	}

	/**
	 * Remove lock entry from db
	 * @param  {String} [name] if omitted it will do nothing
	 * @return {Promise}
	 * @private
	 */
	remove(name) {
		if (!name) {
			return Promise.resolve();
		}

		const params = {
			TableName: this.table,
			Key: {
				Name: {
					S: name
				}
			}
		};

		return this.db.deleteItem(params);
	}

	/**
	 * Check if lock has expired
	 * @param  {Object} item
	 * @param  {Integer} item.Created
	 * @return {Boolean|String} return item.Name if expired otherwise false
	 * @private
	 */
	expired(item) {
		if (!item) {
			return false;
		}

		const expires = item.Created + this.ttl * 1000;
		if (expires <= new Date().getTime()) {
			return item.Name;
		}

		return false;
	}

	/**
	 * Remove lock if it has expired
	 * @param  {String} name
	 * @return {Promise}
	 * @private
	 */
	pruneExpired(name) {
		return this
			.get(name)
			.then(this.expired.bind(this))
			.then(this.remove.bind(this));
	}
}

function AlreadyLockedError(message) {
	this.message = message;
	this.name = 'AlreadyLockedError';
	Error.captureStackTrace(this, AlreadyLockedError);
}
AlreadyLockedError.prototype = Object.create(Error.prototype);
AlreadyLockedError.prototype.constructor = AlreadyLockedError;

module.exports = function (table, ttl, opts) {
	return new DDBLock(table, ttl, opts);
};

module.exports.DDBLock = DDBLock;
module.exports.AlreadyLockedError = AlreadyLockedError;
