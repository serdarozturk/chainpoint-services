# chainpoint-node-aggregator-service

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-aggregator-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-aggregator-service
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```

## Configuration
Configuration parameters will be stored in environment variables. Environment variables can be overridden throught the use of a .env file. 

The following is a list of configuration parameters:

| Name           | Type         | Description  | Default | Min | Max |
| :------------- |:-------------|:-------------|:----|:----|:--------|
| interval       | integer      | how often the aggregation process should run, in milliseconds | 1,000 | 250 | 10,000 | 
| max_hashes     | integer      | maximum number of hashes the aggregation process will consume per aggregation interval | 1,000 | 100 | 25,000 | 

Any values provided outside accepted bounds will result in service failure.

## Data In
The service will receive persistent hash object messages via a subscription to a durable queue (“*hash_queue*”) bound to a durable direct exchange (“*hash_exchange*”) within RabbitMQ. 

The following is an example of a hash object message body: 
```
{
  "id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "39ec487d38b828c6f9ef5d1e8128c76c7455d0f5cbf7ce9b8ef550cf223dfbc3"
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| id   | The UUIDv1 unique identifier for a hash object with embedded timestamp |
| hash | A hex string representing the hash to be processed                     |

As hash objects are received, they are temporarily stored in an array until they are processed. The AMQP message is added to the hash object in order to be able to reference it and send acknowledgment at some time in the future. Acknowledgments of the receipt of these messages are not sent until they have been completely and successfully processed. Should the service fail, RabbitMQ will requeue the unacknowledged message once its connection to the service is lost.

## Aggregation Process
This process is executed at the interval defined by the interval configuration parameter. Hashes are purged from the temporary array into a working array, clearing the temporary array and thus enabling storage of the subsequent batch of hash objects into the temporary array. 

The leaves being added to the tree are hashes defined as **H1=SHA256(id|hash)**. 

| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| id   | A buffer containing the bytes of the hash object id’s string representation |
| hash | A buffer containing the bytes of the submitted hash                    |

The resulting H1 values are stored within their hash objects to be used later when building the start of the overall proof path. All H1 values are then added as leaves to a merkle tree, and the merkle tree is constructed. For each leaf on the tree, the proof path to the merkle root is calculated and stored in the corresponding hash object in the working array.

Once the working array is complete, the data is saved in the state service which make this data available to other Chainpoint services.  

The following is an example of the data sent to the state service: 
```
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "39ec487d38b828c6f9ef5d1e8128c76c7455d0f5cbf7ce9b8ef550cf223dfbc3",
  "aggregation_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "aggregation_ops": [
    { “left”: "4814d42d7b92ef685cc5c7dca0…" },
    { “op”: "sha-256" },
    { “right”: "6f9ef5d1e8128c76c7455d0f5…" },
    { “op”: "sha-256" },
    { more ... }
  ]
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| hash_id          | The UUIDv1 unique identifier for a hash object with embedded timestamp, used to reference the state of a particular hash |
| hash             | A hex string representing the hash being processed |
| aggregation_id   | The UUIDv1 unique identifier for an aggregation object with embedded timestamp, used to reference all hashes within a particular aggregation group |
| aggregation_ops  | An array of Chainpoint operations to perform to calculate the merkle path for a particular hash |\

Once the data is stored in the state service, the aggregation process is complete, and an aggregation object message is published to RabbitMQ for the Calendar service to receive. Finally, an acknowledgment is sent back to RabbitMQ for each original hash object message that was part of the aggregation group.

## Data Out
The service will publish persistent aggregation object messages to a durable direct exchange (“root_exchange”) within RabbitMQ. 

The following is an example of an aggregation object message body: 
```
{
  "id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "hash": "4814d42d7b92ef685cc5c7dca06f5f3f1506c148bb5e7ab2231c91a8f0f119b2"
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| id   | The UUIDv1 unique identifier for an aggregation object with embedded timestamp |
| hash | A hex string representing the merkle root of the tree for this aggregation group |


## gRPC Services
The framework for basic gRPC client and server functionality will be included. The purpose of this is to lay the foundation for the addition of gRPC communication between Chainpoint services in the future. There will be no gRPC methods on the server for the initial release.


## Service Failure
In the event of any error occurring, the service will log that error to STDERR and kill itself with a process.exit(). RabbitMQ will be configured so that upon service exit, unacknowledged messages will be requeued to ensure than unfinished work lost due to failure will be processed again in full.


## Notable NPM packages
| Name         | Description                                                            |
| :---         |:-----------------------------------------------------------------------|
| dotenv       | for managing and optionally overriding environment variables |
| merkle-tools | for constructing merkle tree and calculating merkle paths |
| grpc         | for the inclusion of gRPC client and server functionality |
| amqplib      | for communication between the service and RabbitMQ |






