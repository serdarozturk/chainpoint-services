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
| RMQ\_WORK\_IN\_AGG\_0\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from aggregator service |
| RMQ\_WORK\_IN\_CAL\_ROUTING\_KEY     | the topic exchange routing key for message consumption originating from calendar service |
| RMQ\_WORK\_OUT\_CAL\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generator service |
| RMQ\_WORK\_OUT\_ETH\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generator service |
| RMQ\_WORK\_OUT\_BTC\_GEN\_ROUTING\_KEY       | the topic exchange routing key for message publishing bound for the proof generator service |
| RABBITMQ\_CONNECT\_URI       | the RabbitMQ connection URI |

The following are the types, defaults, and acceptable ranges of the configuration parameters: 

| Name           | Type         | Default | 
| :------------- |:-------------|:-------------|
| RMQ\_WORK\_EXCHANGE\_NAME       | string       | 'work\_topic\_exchange' | 
| RMQ\_WORK\_IN\_ROUTING\_KEY     | string       | 'work.*.state' | 
| RMQ\_WORK\_IN\_SPLITTER\_ROUTING\_KEY     | string       | 'work.splitter.state' | 
| RMQ\_WORK\_IN\_AGG\_0\_ROUTING\_KEY     | string       | 'work.agg_0.state' | 
| RMQ\_WORK\_IN\_CAL\_ROUTING\_KEY     | string       | 'work.cal.state' | 
| RMQ\_WORK\_OUT\_GEN\_CAL\_ROUTING\_KEY       | string       | 'work.generator.cal' |  
| RMQ\_WORK\_OUT\_GEN\_ETH\_ROUTING\_KEY       | string       | 'work.generator.eth' |  
| RMQ\_WORK\_OUT\_GEN\_BTC\_ROUTING\_KEY       | string       | 'work.generator.btc' |   
| RABBITMQ\_CONNECT\_URI       | string      | 'amqp://chainpoint:chainpoint@rabbitmq' | 


## Data In
The proof state service serves as the a proof state storage mechanism for all hashes as they are being processed. As proofs are constructed for each hash, state data is received and stored from the aggregator and calendar services. As anchors objects are completed and added to the proof, a message is also sent to the proof generator service indicating that a Chainpoint proof is ready to be created for the current state data.

TODO: Decide how data is stored and document it here.

#### Aggregator Service

The following is an example of state data published from the aggregator service: 
```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "a0ec06301bf1814970a70f89d1d373afdff9a36d1ba6675fc02f8a975f4efaeb",
  "agg_id": "0cdecc3e-2452-11e7-93ae-92361f002671",
  "agg_root": "419001851bcf08329f0c34bb89570028ff500fc85707caa53a3e5b8b2ecacf05",
  "agg_state": {
    "ops": [
      { "l": "fab4a0b99def4631354ca8b3a7f7fe026623ade9c8c5b080b16b2c744d2b9c7d" },
      { "op": "sha-256" },
      { "r": "7fb6bb6387d1ffa74671ecf5d337f7a8881443e5b5532106f9bebb673dd72bc9" },
      { "op": "sha-256" }
    ]
  }
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| hash_id          | The UUIDv1 unique identifier for a hash object with embedded timestamp |
| hash          | A hex string representing the hash to be processed  |
| agg_id          | The UUIDv1 unique identifier for the aggregation event with embedded timestamp |
| agg_root          | A hex string representing the merkle root for the aggregation event  |
| agg_state  | The state data being stored, in this case, aggregation operations |

#### Calendar Service

The following is an example of state data published from the calendar service: 
```json
{
  "agg_id": "0cdecc3e-2452-11e7-93ae-92361f002671",
  "agg_root": "419001851bcf08329f0c34bb89570028ff500fc85707caa53a3e5b8b2ecacf05",
  "cal_id": "b117b242-2458-11e7-93ae-92361f002671",
  "cal_root": "c7d5bd8fff415efa38bd20465132107a02c7117e4ede0272f5a88a8daf694089",
  "cal_state": {
    "ops": [
      { "l": "fab4a0b99def4631354ca8b3a7f7fe026623ade9c8c5b080b16b2c744d2b9c7d" },
      { "op": "sha-256" },
      { "r": "7fb6bb6387d1ffa74671ecf5d337f7a8881443e5b5532106f9bebb673dd72bc9" },
      { "op": "sha-256" }
    ],
    "anchor": {
      "anchor_id" : "1027",
      "uris": [
        "http://a.cal.chainpoint.org/1027/root",
        "http://b.cal.chainpoint.org/1027/root"
      ]
    }
  }
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| agg_id          | The UUIDv1 unique identifier for the aggregation event with embedded timestamp |
| agg_root          | A hex string representing the merkle root for the aggregation event  |
| cal_id          | The UUIDv1 unique identifier for a calendar entry with embedded timestamp |
| cal_root          | A hex string representing the merkle root for the calendar entry  |
| cal_state  | The state data being stored, in this case, calendar aggregation operations and cal anchor information |






## Proof State Storage
As state data is consumed from the queue, proof state objects are created from that state data and saved to storage.

The following is an example of a proof state object: 

```json
{
  "type": "agg_0",
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "a0ec06301bf1814970a70f89d1d373afdff9a36d1ba6675fc02f8a975f4efaeb",
  "agg_id": "0cdecc3e-2452-11e7-93ae-92361f002671",
  "agg_root": "419001851bcf08329f0c34bb89570028ff500fc85707caa53a3e5b8b2ecacf05",
  "agg_state": {
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
| type   | The type/origin of the state data |
| hash_id          | The UUIDv1 unique identifier for a hash object with embedded timestamp |
| hash          | A hex string representing the hash to be processed  |
| agg_id          | The UUIDv1 unique identifier for the aggregation event with embedded timestamp |
| agg_root          | A hex string representing the merkle root for the aggregation event  |
| agg_state  | The state data being stored, in this case, aggregation operations |


## Data Out 
If an anchor opertation has been added to the proof state, a message is queued for the proof generation service informing it that it may generate new proofs with the latest anchor state information added.





