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

The following are the descriptions of the configuration parameters:

| Name           | Description  |
| :------------- |:-------------|
| RMQ\_PREFETCH\_COUNT | the maximum number of messages sent over the channel that can be awaiting acknowledgement |
| RMQ\_WORK\_IN\_QUEUE     | the queue name for message consumption originating from the splitter service |
| RMQ\_WORK\_OUT\_CAL\_QUEUE       | the queue name for outgoing message to the calendar service |
| RMQ\_WORK\_OUT\_STATE\_QUEUE       | the queue name for outgoing message to the proof state service |
| AGGREGATION_INTERVAL       | how often the aggregation process should run, in milliseconds | 
| HASHES\_PER\_MERKLE_TREE     | maximum number of hashes the aggregation process will consume per aggregation interval | 
| FINALIZE_INTERVAL       | how often the finalize process should run, in milliseconds | 
| RABBITMQ\_CONNECT\_URI       | RabbitMQ connection URI |

The following are the types, defaults, and acceptable ranges of the configuration parameters: 

| Name           | Type         | Default | Min | Max |
| :------------- |:-------------|:-------------|:----|:--------|
| RMQ\_PREFETCH\_COUNT      | integer      | 0 | 0 | - | 
| RMQ\_WORK\_IN\_QUEUE      | string      | 'work.agg' |  |  | 
| RMQ\_WORK\_OUT\_CAL\_QUEUE       | string      | 'work.cal' |  |  | 
| RMQ\_WORK\_OUT\_STATE\_QUEUE       | string      | 'work.state' |  |  | 
| AGGREGATION_INTERVAL       | integer       | 1,000 | 250 | 10,000 | 
| HASHES\_PER\_MERKLE_TREE     | integer       | 1,000 | 100 | 25,000 | 
| FINALIZE_INTERVAL       | integer       | 250 | 250 | 10,000 | 
| RABBITMQ\_CONNECT\_URI       | string      | 'amqp://chainpoint:chainpoint@rabbitmq' |  |  |

Any values provided outside accepted ranges will result in service failure.


## Data In
The service will receive persistent hash object messages from a durable queue within RabbitMQ. The queue name is defined by the RMQ\_WORK\_IN\_QUEUE  configuration parameter.

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
| hash | A hex string representing the hash to be processed                     |

As hash objects are received, they are temporarily stored in the HASHES array until they are consumed by the aggregation process. The RMQ message is also appended to the hash object so that it may be referenced and acked once it has been processed.


## Aggregation Process [aggregate]
This process is executed at the interval defined by the AGGREGATION\_INTERVAL configuration parameter. The maximum number of hashes to read for any given aggregation process is defined by the HASHES\_PER\_MERKLE\_TREE configuration parameter. Hashes are simultaneously removed from the HASHES array and added to the hashesForTree array. The HASHES array will continue to receive new hashes while the aggregation method works with those in the hashesForTree array.

A Merkle tree is constructed for all hashes in hashesForTree. The leaves being added to the tree are hashes defined as **H1=SHA256(hash_id|hash)**. 

| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| hash_id   | A buffer containing the bytes of the hash object hash\_id’s string representation |
| hash | A buffer containing the bytes of the submitted hash                    |

The resulting H1 values are stored within a leaves array to be used later when building the start of the overall proof path. All H1 values are then added as leaves to a merkle tree, and the merkle tree is constructed. 

A treeData object is created that contains the results of this aggregation event.

The following is an example of a treeData object:
```json
{
  "agg_id": "0cdecc3e-2452-11e7-93ae-92361f002671", // a UUIDv1 for this aggregation event
  "agg_root": "419001851bcf08329f0c34bb89570028ff500fc85707caa53a3e5b8b2ecacf05",
  "agg_hash_count": 100, // the number of hashes included in this aggregation event
  "proofData": [
    {
      "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
      "hash": "a0ec06301bf1814970a70f89d1d373afdff9a36d1ba6675fc02f8a975f4efaeb",
      "hash_msg": /* the RMQ message object for this hash */,
      "proof": [ /* Chainpoint v3 ops list for leaf 0 ... */ ]
    },
    {
      "hash_id": "6d627180-1883-11e7-a8f9-edb8c212ef23",
      "hash": "2222d5f509d86e2627b1f498d7b44db1f8e70aae1528634580a9b68f05d57a9f",
      "hash_msg": /* the RMQ message object for this hash */,
      "proof": [ /* Chainpoint v3 ops list for leaf 1 ... */ ]
    },
    { /* more ... */ },
  ]
}
```

For each leaf on the tree, the proof path to the merkle root is calculated, converted to a Chainpoint v3 ops list, and stored within the treeObject's proofData.proof array. These proof paths are prepeneded with the additional hash operation representing the earlier H1=SHA256(id|hash) calculation. The original hash_id, hash, and hash object message are appended for use during the finalize process.

Once all these fields are populated for this object, it is added to the TREES array to await finalizing.


## Data Out [finalize]
This process is executed at the interval defined by the FINALIZE\_INTERVAL configuration parameter. The service will publish proof state information and aggregation events in persistent state object messages to durable queues within RabbitMQ. The queue names are defined by the RMQ\_WORK\_OUT\_STATE\_QUEUE and RMQ\_WORK\_OUT\_CAL\_QUEUE configuration parameters.

The finalize method will loop through and process every treeData object ready for finalization in the TREES array. For each hash and proof in each tree, a proof state object message is constructed and queued for the proof state service to consume.

The following is an example of a proof state object message sent to the proof state service: 
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

Once proof state messages are successfully queued, an aggregation event message is queued for the calendar service.

The following is an example of an aggregation event message sent to the calendar service: 
```json
{
  "agg_id": "0cdecc3e-2452-11e7-93ae-92361f002671",
  "agg_root": "419001851bcf08329f0c34bb89570028ff500fc85707caa53a3e5b8b2ecacf05",
  "agg_hash_count": 100
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| agg_id          | The UUIDv1 unique identifier for the aggregation event with embedded timestamp |
| agg_root          | A hex string representing the merkle root for the aggregation event  |
| agg\_hash\_count          | An integer representing the total hash count for this aggregation event  |

Once this message is successfully queued, all the original hash object messages received that were part of this aggregation event are acked.


## Service Failure
In the event of any error occurring, the service will log that error to STDERR and kill itself with a process.exit(). RabbitMQ will be configured so that upon service exit, unacknowledged messages will be requeued to ensure than unfinished work lost due to failure will be processed again in full.


## Notable NPM packages
| Name         | Description                                                            |
| :---         |:-----------------------------------------------------------------------|
| dotenv       | for managing and optionally overriding environment variables |
| merkle-tools | for constructing merkle tree and calculating merkle paths |
| amqplib      | for communication between the service and RabbitMQ |
| async      | for handling flow control for some asynchronous operations |






