# DDBLock

Distributed locking using DynamoDB.


## Install

	npm install @aptoma/ddblock

## Preqrequistes

Requires a DynamoDB table with a primary partition key called `Name` of type `String`.

## Example

```javascript

	const ddblock = require('@aptoma/ddblock')({
		table: 'MyDynamoTableName',
		ttl: 60,
		aws: {region: 'eu-west-1'}
	});

	ddblock
		.lock('job1')
		.then(() => {
			// do my work
		})
		.then(() => ddblock.unlock('job1'))
		.catch(ddblock.AlreadyLockedError, () => {
			// An active lock aready exists for 'job1'
		});

```

For local development where the locking mecanism isnt needed you can initiate DDBlock in a disabled mode, lock & unlock will resolve without doing anything.

```javascript

	const ddblock = require('@aptoma/ddblock')({
		disabled: true,
		table: 'MyDynamoTableName',
		ttl: 60
	});

```
