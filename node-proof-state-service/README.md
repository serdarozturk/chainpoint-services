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


## temp copy
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
| hash | A hex string representing the merkle root of the tree for this aggregation group |\
*/

## Proof State Schema

```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "dee46745c1435784a4aab8b1398a9489860c6ac4a81ab12f6fe0387e7e00d3fd",
  "aggregation_events": {
    "level0": {
      "id": "c46aa06e-155f-11e7-93ae-92361f002671",
      "ops": [
        { "l": "fab4a0b99def4631354ca8b3a7f7fe026623ade9c8c5b080b16b2c744d2b9c7d" },
        { "op": "sha-256" },
        { "r": "7fb6bb6387d1ffa74671ecf5d337f7a8881443e5b5532106f9bebb673dd72bc9" },
        { "op": "sha-256" }
      ]
    },
    "complete": true
  },
  "cal": {
    "id": "582f65a8-1b9d-11e7-93ae-92361f002671",
    "ops": [
      { "l": "71696d030e1984bac3891f5872e9c88161ea54b14847e0f91d0f819a7515b54b" },
      { "op": "sha-256" },
      { "r": "279062e8124601f88ff4f7bbe87ee1ca44442644348a6712ada3231ac048135c" },
      { "op": "sha-256" }
    ],
    "anchor_id": "11654",
    "anchor_uris": [
      "http://a.cal.chainpoint.org/46374/root",
      "http://b.cal.chainpoint.org/46374/root"
    ],
    "complete": true
  },
  "eth": {
    "id": "49daf3be-1b9d-11e7-93ae-92361f002671",
    "ops": [
      { "l": "6bb1c74695ca40b851fefcf719b470a81c7ec1c1137c8496d46a8d5612f2d339" },
      { "op": "sha-256" },
      { "r": "267c18f4f0e27257bfd18cf9f1be25d50dd6db4cf2045d11a5947e96bb35835a" },
      { "op": "sha-256" }
    ],
    "anchor_id": "d3e7ec84c3dbe86f7d9a8ea68ae4ded6c0b012be519f433a07f15bd612fb47a9",
    "complete": true
  },
  "btc": {
    "id": "404e4fc6-1b9d-11e7-93ae-92361f002671",
    "tx_ops": [
      { "l": "98b56a4694f427b6170d387a848e8c8e41c0eb4e059754285fe5d4dbf590cfec" },
      { "op": "sha-256" },
      { "r": "a6fe46ba29671e59c98782884c797f99875a9af4d7173c257f6f41588d4b2265" },
      { "op": "sha-256" }
    ],
    "header_ops": [
      { "l": "1c5bee8b7b63d962ce5a3feedef050336a773e2e28e97c31248aff0f06540989" },
      { "op": "sha-256-x2" },
      { "r": "ecbdb5e9691b2e77bd45706e3945becf3330819f59541a478fef0124d1072408" },
      { "op": "sha-256-x2" },
      { "r": "8354f6578f47230553b1fab8adba1785cf42afdfff47808fc376251c3a653f1d" },
      { "op": "sha-256-x2" }
    ],
    "anchor_id": "48987",
    "complete": true
  }
}
```

The proof state schema is similar to the Chainpoint schema, but is optimized for idempotent write operations. 

The following indexes are added to assist in common write scenarios:

| Field | Property | Description |
|:--------|:-----------|:--------------|
| hash\_id | Primary Key | The UUIDv1 for this hash and corresponding proof |
| aggregation\_events.level0.id | Index | The UUIDv1 for this aggregation event |
| cal.id | Index | The UUIDv1 for this calendar aggregation and anchoring event |
| btc.id | Index | The UUIDv1 for this multi-step btc block header anchoring event |

These common write scenarios include:
* Create new record by inserting hash, hash\_id, and aggregation\_events.level0
* Insert cal object for all records with a given aggregation\_events.level0 value
* Insert eth object for all records with a given cal.id
* Insert btc object for all records with a given cal.id
* Insert btc.header_ops object for all records with a given btc.id

Note: The .level0 distinction exists in aggregation\_events to allow for multiple aggregation levels. In the example above, only 1 level of aggregation is shown. To show _x_ levels of aggregation, you would start by adding the first level, level(x-1), and continue down to level0.


