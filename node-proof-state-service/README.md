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
| RMQ\_WORK\_EXCHANGE\_NAME       | the name of the RabbitMQ topic exchange to use |
| RMQ\_WORK\_IN\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from all other services |
| RMQ\_WORK\_IN\_SPLITTER\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from splitter service |
| RMQ\_WORK\_IN\_AGG\_0\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from aggregator service |
| RMQ\_WORK\_IN\_CAL\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from calendar service |
| RMQ\_WORK\_IN\_ETH\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from ethereum anchor service |
| RMQ\_WORK\_IN\_BTC\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from btc anchor service |
| RMQ\_WORK\_OUT\_AGGREGATOR\_0\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the aggregator service |
| RMQ\_WORK\_OUT\_CAL\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the calendar service |
| RMQ\_WORK\_OUT\_CAL\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generation service for calendar generation |
| RMQ\_WORK\_OUT\_ETH\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the eth anchor service |
| RMQ\_WORK\_OUT\_ETH\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generation service for eth anchor generation |
| RMQ\_WORK\_OUT\_BTC\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the btc anchor service |
| RMQ\_WORK\_OUT\_BTC\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generation service for btc anchor generation |
| RABBITMQ\_CONNECT\_URI       | the RabbitMQ connection URI |

The following are the types, defaults, and acceptable ranges of the configuration parameters: 

| Name           | Type         | Default | 
| :------------- |:-------------|:-------------|
| RMQ\_WORK\_EXCHANGE\_NAME       | string       | 'work\_topic\_exchange' | 
| RMQ\_WORK\_IN\_ROUTING\_KEY     | string       | 'work.*.state' | 
| RMQ\_WORK\_IN\_SPLITTER\_ROUTING\_KEY     | string       | 'work.splitter.state' | 
| RMQ\_WORK\_IN\_AGG\_0\_ROUTING\_KEY     | string       | 'work.agg_0.state' | 
| RMQ\_WORK\_IN\_CAL\_ROUTING\_KEY     | string       | 'work.cal.state' | 
| RMQ\_WORK\_IN\_ETH\_ROUTING\_KEY     | string       | 'work.eth.state' | 
| RMQ\_WORK\_IN\_BTC\_ROUTING\_KEY     | string       | 'work.btc.state' | 
| RMQ\_WORK\_OUT\_AGGREGATOR\_0\_ROUTING\_KEY       | string       | 'work.agg_0' |  
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

#### Splitter Service

The following is an example of state data published from the splitter service: 
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

#### Aggregator Service

The following is an example of state data published from the aggregator service: 
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
| value | The last calculated value from the ops array, typically a merkle root, to be passed on to the next service |

#### Calendar Service

The following is an example of state data published from the calendar service: 
```json
{
  "hash_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "state": {
    //TODO: Complete this
  },
  "value": "ecbdb5e9691b2e77bd45706e3945becf3330819f59541a478fef0124d1072408"
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for the hash with embedded timestamp |
| state | An object containing state information to be stored |
| value | The last calculated value from the ops array, typically a merkle root, to be passed on to the next service |

#### Ethereum Anchor Service

The following is an example of state data published from the ethereum anchor service: 
```json
{
  "hash_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "state": {
    //TODO: Complete this
  },
  "value": "ecbdb5e9691b2e77bd45706e3945becf3330819f59541a478fef0124d1072408"
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for the hash with embedded timestamp |
| state | An object containing state information to be stored |
| value | The last calculated value from the ops array, typically a merkle root, to be passed on to the next service |

#### BTC Anchor Service

The following is an example of state data published from the btc anchor service: 
```json
{
  "hash_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "state": {
    //TODO: Complete this
  },
  "value": "ecbdb5e9691b2e77bd45706e3945becf3330819f59541a478fef0124d1072408"
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for the hash with embedded timestamp |
| state | An object containing state information to be stored |
| value | The last calculated value from the ops array, typically a merkle root, to be passed on to the next service |


## Proof State Storage
As state data is consumed from the queue, proof state objects are created from that state data and saved to storage.

The following is an example of a proof state object: 

```json
{
  "state_id": "78dce74c-1fbe-11e7-93ae-92361f002671",
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
| state_id   | The UUIDv1 unique identifier for this proof state record with embedded timestamp |
| hash_id   | The UUIDv1 unique identifier for the hash with embedded timestamp |
| type   | The type/origin of the state data |
| state | An object containing state information to be stored |

The following indexes are added to assist in common write scenarios:

| Field | Property | Description |
|:--------|:-----------|:--------------|
| state\_id | Primary Key | The UUIDv1 for this proof state object |
| hash\_id | Index | The UUIDv1 for this hash |

TODO: The above will likely change... dependant upon our storage implementation

## Data Out 
Once the proof state data is persisted into storage, a new message is created and queued, bound for the next service in line for the overall proccess. 

#### Splitter Service

If the proof state data being stored originated from the splitter service, a new hash object message will be queued for the aggregator service to consume using the routing key as defined by the RMQ\_WORK\_OUT\_AGG\_0\_ROUTING\_KEY configuration parameter. 

The following is an example of a hash object message body: 
```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "39ec487d38b828c6f9ef5d1e8128c76c7455d0f5cbf7ce9b8ef550cf223dfbc3"
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for a hash object with embedded timestamp |
| hash | A hex string representing the hash to be processed |

#### Aggregator Service

If the proof state data being stored originated from the aggregator service, a new aggregation object message will be queued for the calendar service to consume using the routing key as defined by the RMQ\_WORK\_OUT\_CAL\_ROUTING\_KEY configuration parameter. 

The following is an example of an aggregation message body: 
```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "root": "da31a4f8b87a901707e054105a1dac415e63af5c6dd1221f0249dc44662fa9d6"
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for a hash object with embedded timestamp |
| root | A hex string representing the merkle root calculated during the aggregation process |

#### Calendar Service

If the proof state data being stored originated from the calendar service, new calendar anchor object messages will be queued for the proof generator service, ethereum anchor service, and btc anchor service to consume using the routing keys as defined by the RMQ\_WORK\_OUT\_CAL\_GEN\_ROUTING\_KEY, RMQ\_WORK\_OUT\_ETH\_ROUTING\_KEY, and RMQ\_WORK\_OUT\_BTC\_ROUTING\_KEY configuration parameters. 

The following is an example of a calendar anchor object message body: 
```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  //TODO: Complete this
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for a hash object with embedded timestamp |
TODO: Complete this

#### Ethereum Anchor Service

If the proof state data being stored originated from the ethereum anchor service, a new ethereum anchor object message will be queued for the proof generator service to consume using the routing keys as defined by the RMQ\_WORK\_OUT\_ETH\_GEN\_ROUTING\_KEY configuration parameters. 

The following is an example of an ethereum anchor object message body: 
```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  //TODO: Complete this
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for a hash object with embedded timestamp |
TODO: Complete this

#### BTC Anchor Service

If the proof state data being stored originated from the btc anchor service, a new btc anchor object message will be queued for the proof generator service to consume using the routing keys as defined by the RMQ\_WORK\_OUT\_BTC\_GEN\_ROUTING\_KEY configuration parameters. 

The following is an example of a btc anchor object message body: 
```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  //TODO: Complete this
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | The UUIDv1 unique identifier for a hash object with embedded timestamp |
TODO: Complete this

Finally, once message publishing is acked, the original proof state data object message is acked as consumed.



