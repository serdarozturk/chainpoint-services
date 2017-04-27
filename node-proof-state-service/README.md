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
| RMQ\_PREFETCH\_COUNT | the maximum number of messages sent over the channel that can be awaiting acknowledgement |
| RMQ\_WORK\_IN\_QUEUE     | the queue name for message consumption originating from the api service |
| RMQ\_WORK\_OUT\_GEN\_QUEUE       | the queue name for outgoing message to the proof gen service | 
| RMQ\_WORK\_OUT\_STATE\_QUEUE       | the queue name for outgoing message to the proof state service |
| RABBITMQ\_CONNECT\_URI       | the RabbitMQ connection URI |

The following are the types, defaults, and acceptable ranges of the configuration parameters: 

| Name           | Type         | Default | 
| :------------- |:-------------|:-------------|
| RMQ\_PREFETCH\_COUNT      | integer      | 10 | 0 | - | 
| RMQ\_WORK\_IN\_QUEUE      | string      | 'work.state' |  |  | 
| RMQ\_WORK\_OUT\_GEN\_QUEUE       | string      | 'work.gen' |  |  | 
| RMQ\_WORK\_OUT\_STATE\_QUEUE       | string      | 'work.state' |  |  |   
| RABBITMQ\_CONNECT\_URI       | string      | 'amqp://chainpoint:chainpoint@rabbitmq' | 


## Data In
The proof state service serves as the a proof state storage mechanism for all hashes as they are being processed. As proofs are constructed for each hash, state data is received and stored in a Crate DB cluster from the aggregator and calendar services. As anchors objects are completed and added to the proof, a proof ready message is also queued for the proof generator service indicating that a Chainpoint proof is ready to be created for the current state data. These proof ready messages are both published and consumed by this service. Milestone events occurring during the proof building process are logged to a hash tracker table.

#### Splitter Service
When the splitter service splits a batch of hashes received from the api service, it queues hash object messages bound for the proof state service for tracking of that event.
The following is an example of a hash object message published from the splitter service: 
```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "a0ec06301bf1814970a70f89d1d373afdff9a36d1ba6675fc02f8a975f4efaeb"
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| hash_id          | The UUIDv1 unique identifier for a hash object with embedded timestamp |
| hash          | A hex string representing the hash to be processed  |


#### Aggregator Service
When an aggregation event occurs, the aggregation service will queue messages bound for the proof state service for each hash in that aggregation event.
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
When a new calendar entrty is created, the calendar service will queue messages bound for the proof state service for each aggregation event in that calendar entry.
The following is an example of state data published from the calendar service: 
```json
{
  "agg_id": "0cdecc3e-2452-11e7-93ae-92361f002671",
  "agg_root": "419001851bcf08329f0c34bb89570028ff500fc85707caa53a3e5b8b2ecacf05",
  "agg_hash_count": 100,
  "cal_id": "b117b242-2458-11e7-93ae-92361f002671",
  "cal_root": "c7d5bd8fff415efa38bd20465132107a02c7117e4ede0272f5a88a8daf694089",
  "cal_state": {
    "ops": [
      { "l": "315be5d46580b617928b53f3bac5bac3d5e0d10a1c6143cc1fdab224cd1450ea" },
      { "op": "sha-256" },
      { "r": "585a960c51c665432f52d2ceb5a31a11bdc375bac136ffa0af84afa1b1e7840f" },
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
| agg\_hash\_count         | An integer representing the total hash count for the aggregation event  |
| cal_id          | The UUIDv1 unique identifier for a calendar entry with embedded timestamp |
| cal_root          | A hex string representing the merkle root for the calendar entry  |
| cal_state  | The state data being stored, in this case, calendar aggregation operations and cal anchor information |


#### Proof State Service
After the proof state service consumes a calendar message and stores the calendar entry state data, the proof state service will also queue proof ready messages bound for the proof state service for each hash part of the aggregation event for that calendar message.
The following is an example of proof ready data published from the proof state service: 
```json
{
  "type": "cal",
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66"
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| type          | The type of proof ready to be generated |
| hash_id          | The UUIDv1 unique identifier for the hash with embedded timestamp |



## Proof State Storage
As state data is consumed from the queue, proof state objects are created from that state data and saved to storage.

The following is an example of a proof state object: 

```json
{
  "type": "agg",
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

In addition to storing state data, the proof state service also updates the hash tracker log for milestone events that occurring during the proof generation process. The events being tracked are shown in the following table.

| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| splitter_at          | A timestamp value indicating when the hash was processed by the splitter service |
| aggregator_at          | A timestamp value indicating when the hash was processed by the aggregator service |
| calendar_at          | A timestamp value indicating when calendar proof generation has begun for this hash |
| eth_at          | A timestamp value indicating when eth proof generation has begun for this hash |
| btc_at          | A timestamp value indicating when btc proof generation has begun for this hash |


## Data Out 
The service will publish proof ready messages and proof generation message to durable queues within RabbitMQ. The queue names are defined by the RMQ\_WORK\_OUT\_STATE\_QUEUE and RMQ\_WORK\_OUT\_GEN\_QUEUE configuration parameters.

When consuming a calendar message, the proof state service will queue proof ready messages bound for the proof state service for each hash part of the aggregation event for that calendar message.

The following is an example of a proof state object message sent to the proof state service: 
```json
{
  "type": "cal",
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66"
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| type          | The type of proof ready to be generated |
| hash_id          | The UUIDv1 unique identifier for the hash with embedded timestamp |

In addition to publishing these proof ready messages, the proof state service also consumes them. All state data for the specified hash is read from storage and included in a proof generation message bound for the proof gen service. 

The following is an example of a proof generation message sent to the proof gen service: 
```json
{
  "type": "cal",
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "a0ec06301bf1814970a70f89d1d373afdff9a36d1ba6675fc02f8a975f4efaeb",
  "agg_state": {
    "ops": [
        { "l": "fab4a0b99def4631354ca8b3a7f7fe026623ade9c8c5b080b16b2c744d2b9c7d" },
        { "op": "sha-256" },
        { "r": "7fb6bb6387d1ffa74671ecf5d337f7a8881443e5b5532106f9bebb673dd72bc9" },
        { "op": "sha-256" }
      ]
  },
  "cal_state": {
    "ops": [
      { "l": "315be5d46580b617928b53f3bac5bac3d5e0d10a1c6143cc1fdab224cd1450ea" },
      { "op": "sha-256" },
      { "r": "585a960c51c665432f52d2ceb5a31a11bdc375bac136ffa0af84afa1b1e7840f" },
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
| type          | The type of proof ready to be generated |
| hash_id          | The UUIDv1 unique identifier for the hash with embedded timestamp |
| hash          | A hex string representing the hash being processed  |
| agg_state  | The aggregation state data for this hash to be used for proof generation |
| cal_state  | The calendar state data for this hash to be used for proof generation |

## Service Failure
In the event of any error occurring, the service will log that error to STDERR and kill itself with a process.exit(). RabbitMQ will be configured so that upon service exit, unacknowledged messages will be requeued to ensure than unfinished work lost due to failure will be processed again in full.


## Notable NPM packages
| Name         | Description                                                            |
| :---         |:-----------------------------------------------------------------------|
| dotenv       | for managing and optionally overriding environment variables |
| amqplib      | for communication between the service and RabbitMQ |
| async      | for handling flow control for some asynchronous operations |





