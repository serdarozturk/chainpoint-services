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
| AGGREGATION_INTERVAL       | integer      | how often the aggregation process should run, in milliseconds | 1,000 | 250 | 10,000 | 
| HASHES\_PER\_MERKLE_TREE     | integer      | maximum number of hashes the aggregation process will consume per aggregation interval | 1,000 | 100 | 25,000 | 
| FINALIZE_INTERVAL       | integer      | how often the finalize process should run, in milliseconds | 250 | 250 | 10,000 | 
| AGGREGATOR\_INGRESS\_QUEUE       | string      | name of the aggregator ingress queue | 'aggregator_ingress' |  |  | 
| CALENDAR\_INGRESS\_QUEUE       | string      | name of the calendar ingress queue | 'calendar_ingress' |  |  | 
| RABBITMQ\_CONNECT\_URI       | string      | RabbitMQ connection URI | 'amqp://chainpoint:chainpoint@rabbitmq' |  |  | 


Any values provided outside accepted bounds will result in service failure.


## Data In
The service will receive persistent hash object messages via a subscription to a durable queue bound to a durable direct exchange within RabbitMQ. The name of the queue is defined by the AGGREGATOR\_INGRESS\_QUEUE configuration parameter.

The following is an example of a hash object array message body: 
```json
[
  {
    "id": "34712680-14bb-11e7-9598-0800200c9a66",
    "hash": "39ec487d38b828c6f9ef5d1e8128c76c7455d0f5cbf7ce9b8ef550cf223dfbc3"
  },
  {
    "id": "6d627180-1883-11e7-a8f9-edb8c212ef23",
    "hash": "ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4"
  }
]
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| id   | The UUIDv1 unique identifier for a hash object with embedded timestamp |
| hash | A hex string representing the hash to be processed                     |

As hash object arrays are received, they are split into individual hash objects and temporarily stored in the HASHES array until they are processed. The incoming message is assigned an id and stored in the MESSAGES array along with the total hashes count for that message. This is done in order to be able to reference the message and send acknowledgment at some time in the future when all hashes from that message have been successfully finalized. Hashes are considered successfully finalized when they are fully processed, their state recorded in the Proof State service, and they are part of a tree sent off to a Calendar service. Should this service fail, all incomplete work will be destroyed, RabbitMQ will requeue the unacknowledged message when the connection is lost, and the message will be consumed and processed again from the beginning once connection to RabbitMQ is re-established.


## Aggregation Process [aggregate]
This process is executed at the interval defined by the AGGREGATION\_INTERVAL configuration parameter. The maximum number of hashes to read for any given aggregation process is defined by the HASHES\_PER\_MERKLE\_TREE configuration parameter. Hashes are simultaneously removed from the HASHES array and added to the hashesForTree array. The HASHES array will continue to receive new hashes while the aggregation method works with those in the hashesForTree array.

A Merkle tree is constructed for all hashes in hashesForTree. The leaves being added to the tree are hashes defined as **H1=SHA256(id|hash)**. 

| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| id   | A buffer containing the bytes of the hash object id’s string representation |
| hash | A buffer containing the bytes of the submitted hash                    |

The resulting H1 values are stored within a leaves array to be used later when building the start of the overall proof path. All H1 values are then added as leaves to a merkle tree, and the merkle tree is constructed. 

A treeData object is created that contains the results of this aggregation event.

The following is an example of a treeData object:
```json
{
  "id": "4eeefd08-1a55-11e7-93ae-92361f002671",
  "root": "419001851bcf08329f0c34bb89570028ff500fc85707caa53a3e5b8b2ecacf05",
  "proofs": [
    [ /* proof path array from merkle tree for leaf 0 ... */ ],
    [ /* proof path array from merkle tree for leaf 1 ... */ ],
    [ /* more ... */ ],
  ],
  "messageTotals": {
    "1cd95b50-1a56-11e7-93ae-92361f002671": 2
  }
}
```

A UUID is generated and merkle root assigned to the treeObject. For each leaf on the tree, the proof path to the merkle root is calculated and stored within the treeObject's proofs array. These proof paths will be prepeneded with the additional hash operation representing the earlier H1=SHA256(id|hash) calculation. A messageTotals object is added which consists of key/value pairs containing messageIds and hash counts for each message in this aggregation event. 

Once all these fields are populated for this object, it is added to the TREES array to await finalizing.


## Data Out [finalize]
This process is executed at the interval defined by the FINALIZE\_INTERVAL configuration parameter. The service will use a gRPC call to send state inforamation to a proof state service, and publish persistent aggregation object messages to a durable direct exchange within RabbitMQ. The name of the queue is defined by the CALENDAR\_INGRESS\_QUEUE configuration parameter.

The finalize method will loop through and process every treeData object ready for finalization in the TREES array. The first step in finalizing is to send the data to a proof state service which make this data available to other Chainpoint services.  

The following is an example of the data sent to the state service: 
```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "39ec487d38b828c6f9ef5d1e8128c76c7455d0f5cbf7ce9b8ef550cf223dfbc3",
  "aggregation_id": "c46aa06e-155f-11e7-93ae-92361f002671",
  "aggregation_ops": [
    { "l": "4814d42d7b92ef685cc5c7dca0…" },
    { "op": "sha-256" },
    { "r": "6f9ef5d1e8128c76c7455d0f5…" },
    { "op": "sha-256" },
    // more ... 
  ]
}
```
| Name             | Description                                                            |
| :--------------- |:-----------------------------------------------------------------------|
| hash_id          | The UUIDv1 unique identifier for a hash object with embedded timestamp, used to reference the state of a particular hash |
| hash             | A hex string representing the hash being processed |
| aggregation_id   | The UUIDv1 unique identifier for an aggregation event with embedded timestamp, as generated for the treeObject, used to reference all hashes for a particular aggregation event |
| aggregation_ops  | An array of Chainpoint operations to perform to calculate the merkle path for a particular hash |\

Once the data is stored in the proof state service, an aggregation object message is published to RabbitMQ for the Calendar service to receive. 

The following is an example of an aggregation object message body: 
```json
{
  "id": "c46aa06e-155f-11e7-93ae-92361f002671", // for this agg event, id == treeObject.id == aggregation_id from the previous step
  "hash": "4814d42d7b92ef685cc5c7dca06f5f3f1506c148bb5e7ab2231c91a8f0f119b2" // for this agg event, hash == treeObject.root
}
```
| Name | Description                                                            |
| :--- |:-----------------------------------------------------------------------|
| id   | The UUIDv1 unique identifier for an aggregation event with embedded timestamp |
| hash | A hex string representing the merkle root of the tree for this aggregation group |

Finally, the workingCounts in the MESSAGES array are reduced by the number of hashes processed for each message making up the tree being finalized. Once a  workingCount value has reached 0, all hashes submitted within that message have been successfully finalized, and an acknowledgment is sent back to RabbitMQ for that message.


## gRPC Services
The framework for basic gRPC client and server functionality will be included. A gRPC client with be used to communicate with the proof state service. There will be no gRPC servewr methods for the initial release.


## Service Failure
In the event of any error occurring, the service will log that error to STDERR and kill itself with a process.exit(). RabbitMQ will be configured so that upon service exit, unacknowledged messages will be requeued to ensure than unfinished work lost due to failure will be processed again in full.


## Notable NPM packages
| Name         | Description                                                            |
| :---         |:-----------------------------------------------------------------------|
| dotenv       | for managing and optionally overriding environment variables |
| merkle-tools | for constructing merkle tree and calculating merkle paths |
| grpc         | for the inclusion of gRPC client and server functionality |
| amqplib      | for communication between the service and RabbitMQ |






