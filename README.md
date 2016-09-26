# DDBLock

Distributed locking using DynamoDB.


## Install

	npm install @aptoma/ddblock

## Preqrequistes

Requires a DynamoDB table with a primary partition key called `Name` of type `String`.

## Example

```javascript

	const require('@aptoma/ddblock')('MyDynamoTableName', 60, {
		region: 'eu-west-1'
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
