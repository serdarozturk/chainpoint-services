# chainpoint-node-proof-state-service

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-proof-state-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-proof-state-service
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
| RMQ\_WORK\_IN\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from other services
| RMQ\_WORK\_OUT\_AGGREGATOR\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the aggregator service 
| RMQ\_WORK\_OUT\_CAL\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the calendar service 
| RMQ\_WORK\_OUT\_CAL\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generation service for calendar generation
| RMQ\_WORK\_OUT\_ETH\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the eth anchor service 
| RMQ\_WORK\_OUT\_ETH\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generation service for eth anchor generation
| RMQ\_WORK\_OUT\_BTC\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the btc anchor service 
| RMQ\_WORK\_OUT\_BTC\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generation service for btc anchor generation
| RABBITMQ\_CONNECT\_URI       | the RabbitMQ connection URI 

The following are the types, defaults, and acceptable ranges of the configuration parameters: 

| Name           | Type         | Default | 
| :------------- |:-------------|:-------------|
| RMQ\_WORK\_EXCHANGE\_NAME       | string       | 'work\_topic\_exchange' | 
| RMQ\_WORK\_IN\_ROUTING\_KEY     | string       | 'work.*.state' | 
| RMQ\_WORK\_OUT\_AGGREGATOR\_ROUTING\_KEY       | string       | 'work.aggregator' |  
| RMQ\_WORK\_OUT\_CAL\_ROUTING\_KEY       | string       | 'work.cal' |  
| RMQ\_WORK\_OUT\_CAL\_GEN\_ROUTING\_KEY       | string       | 'work.generator.cal' |  
| RMQ\_WORK\_OUT\_ETH\_ROUTING\_KEY       | string       | 'work.eth' |  
| RMQ\_WORK\_OUT\_ETH\_GEN\_ROUTING\_KEY       | string       | 'work.generator.eth' |  
| RMQ\_WORK\_OUT\_BTC\_ROUTING\_KEY       | string       | 'work.btc' |  
| RMQ\_WORK\_OUT\_BTC\_GEN\_ROUTING\_KEY       | string       | 'work.generator.btc' |  
| RABBITMQ\_CONNECT\_URI       | string      | 'amqp://chainpoint:chainpoint@rabbitmq' | 


## Data In
The proof state service serves as both a proof state storage mechanism as well as a communication hub for most Chainpoint services. As proofs are constructed for each hash, state data is received and stored from the splitter service, aggregator(s), calendar, and all other anchor services. When the data is stored, a new message is published, bound for the next service in line, in order to continue the proof building processes. As anchors objects are completed and added to the proof, a message is also sent to the proof generator service indicating that a Chainpoint proof is ready to be created for the current state data.

TODO: Decide how data is stored and document it here.

The following is an example of state data from the splitter service: 
```json
{
  "hash_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "state": {
    "hash": "4814d42d7b92ef685cc5c7dca06f5f3f1506c148bb5e7ab2231c91a8f0f119b2"
  } 
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for the hash with embedded timestamp |
| state | An object containing state information to be stored |

The following is an example of state data from the aggregation service: 
```json
{
  "hash_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "state": {
    "ops": [
        { "l": "fab4a0b99def4631354ca8b3a7f7fe026623ade9c8c5b080b16b2c744d2b9c7d" },
        { "op": "sha-256" },
        { "r": "7fb6bb6387d1ffa74671ecf5d337f7a8881443e5b5532106f9bebb673dd72bc9" },
        { "op": "sha-256" }
      ]
  },
  "value": "ecbdb5e9691b2e77bd45706e3945becf3330819f59541a478fef0124d1072408"
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for the hash with embedded timestamp |
| state | An object containing state information to be stored |
| value | The last calculated value, typically a merkle root, to be passed on to the next service |


## Proof State Schema

The following is an example of a proof state object: 

```json
{
  "hash_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "type": "agg_0",
  "state": {
    "ops": [
        { "l": "fab4a0b99def4631354ca8b3a7f7fe026623ade9c8c5b080b16b2c744d2b9c7d" },
        { "op": "sha-256" },
        { "r": "7fb6bb6387d1ffa74671ecf5d337f7a8881443e5b5532106f9bebb673dd72bc9" },
        { "op": "sha-256" }
      ]
  }
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for the hash with embedded timestamp |
| type   | The type of state data, the origin of the state data |
| state | An object containing state information  |

The following indexes are added to assist in common write scenarios:

| Field | Property | Description |
|:--------|:-----------|:--------------|
| state\_id | Primary Key | The UUIDv1 for this state object |
| hash\_id | Index | The UUIDv1 for this hash |

TODO: The above will likely change... dependant upon our storage implementation



