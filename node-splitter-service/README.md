# chainpoint-node-splitter-service

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-splitter-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-splitter-service
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```

## Configuration
Configuration parameters will be stored in environment variables. Environment variables can be overridden throught the use of a .env file. 

The following are the descriptions of the configuration parameters:

| Name           | Description  |
| :------------- |:-------------|
| RMQ\_WORK\_EXCHANGE\_NAME       | the name of the RabbitMQ topic exchange to use 
| RMQ\_WORK\_IN\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating the web service
| RMQ\_WORK\_OUT\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the aggregtion service 
| RABBITMQ\_CONNECT\_URI       | the RabbitMQ connection URI 

The following are the types, defaults, and acceptable ranges of the configuration parameters: 

| Name           | Type         | Default | 
| :------------- |:-------------|:-------------|
| RMQ\_WORK\_EXCHANGE\_NAME       | string       | 'work\_topic\_exchange' | 
| RMQ\_WORK\_IN\_ROUTING\_KEY     | string       | 'work.splitter' | 
| RMQ\_WORK\_OUT\_ROUTING\_KEY       | string       | 'work.agg_0' |  
| RABBITMQ\_CONNECT\_URI       | string      | 'amqp://chainpoint:chainpoint@rabbitmq' | 


## Data In
The service will receive persistent hash object messages via a subscription to a durable queue bound to a durable topic exchange within RabbitMQ. The routing key is defined by the RMQ\_WORK\_IN\_ROUTING\_KEY configuration parameter.

The following is an example of a hash object array message body: 
```json
[
  {
    "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
    "hash": "39ec487d38b828c6f9ef5d1e8128c76c7455d0f5cbf7ce9b8ef550cf223dfbc3"
  },
  {
    "hash_id": "6d627180-1883-11e7-a8f9-edb8c212ef23",
    "hash": "ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4"
  }
]
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for a hash object with embedded timestamp |
| hash | A hex string representing the hash to be processed                     |


## Splitting Process
Once a message is consumed, the hash object array is split into individual hash objects. 

## Data Out
For each hash object, a hash object message is published using the RMQ\_WORK\_OUT\_ROUTING\_KEY for consumption by the aggregation service.

The following is an example of a hash object message sent to the aggregation service: 
```json
{
  "hash_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "hash": "4814d42d7b92ef685cc5c7dca06f5f3f1506c148bb5e7ab2231c91a8f0f119b2"
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| hash_id          | The UUIDv1 unique identifier for a hash object with embedded timestamp, used to reference the state of a particular hash |
| hash | The hash value submitted by the client to be anchored |

When all hash objects in the array have been processed, the original message is acked.

## Service Failure
In the event of any error occurring, the service will log that error to STDERR and kill itself with a process.exit(). RabbitMQ will be configured so that upon service exit, unacknowledged messages will be requeued to ensure than unfinished work lost due to failure will be processed again in full.


## Notable NPM packages
| Name         | Description                                                            |
| :---         |:-----------------------------------------------------------------------|
| dotenv       | for managing and optionally overriding environment variables |
| amqplib      | for communication between the service and RabbitMQ |
| async      | for handling flow control for some asynchronous operations |
