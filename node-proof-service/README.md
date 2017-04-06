# chainpoint-node-proof-service

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-proof-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-proof-service
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```

## Proof State Schema

```json
{
  "hash_id": "34712680-14bb-11e7-9598-0800200c9a66",
  "hash": "39ec487d38b828c6f9ef5d1e8128c76c7455d0f5cbf7ce9b8ef550cf223dfbc3",
  "aggregation_events": {
    "level0": {
      "id": "c46aa06e-155f-11e7-93ae-92361f002671",
      "ops": [
        { "l": "4814d42d7b92ef685cc5c7dca0…" },
        { "op": "sha-256" },
        { "r": "6f9ef5d1e8128c76c7455d0f5…" },
        { "op": "sha-256" }
      ]
    },
    "complete": true
  },
  "cal": {
    "id": "c46aa06e-155f-11e7-93ae-92361f002671",
    "ops": [
      { "l": "4814d42d7b92ef685cc5c7dca0…" },
      { "op": "sha-256" },
      { "r": "6f9ef5d1e8128c76c7455d0f5…" },
      { "op": "sha-256" }
    ],
    "anchor_id": "11654",
    "uris": [
      "http://a.cal.chainpoint.org/46374/root",
      "http://b.cal.chainpoint.org/46374/root"
    ],
    "complete": true
  },
  "eth": {
    "id": "c46aa06e-155f-11e7-93ae-92361f002671",
    "ops": [
      { "l": "4814d42d7b92ef685cc5c7dca0…" },
      { "op": "sha-256" },
      { "r": "6f9ef5d1e8128c76c7455d0f5…" },
      { "op": "sha-256" }
    ],
    "anchor_id": "d3e7ec84c3dbe86f7d9a8ea68ae4ded6c0b012be519f433a07f15bd612fb47a9",
    "complete": true
  },
  "btc": {
    "id": "c46aa06e-155f-11e7-93ae-92361f002671",
    "tx_ops": [
      { "l": "4814d42d7b92ef685cc5c7dca0…" },
      { "op": "sha-256" },
      { "r": "6f9ef5d1e8128c76c7455d0f5…" },
      { "op": "sha-256" }
    ],
    "header_ops": [
      { "l": "4814d42d7b92ef685cc5c7dca0…" },
      { "op": "sha-256-x2" },
      { "r": "6f9ef5d1e8128c76c7455d0f5…" },
      { "op": "sha-256-x2" },
      { "r": "6f9ef5d1e8128c76c7455d0f5…" },
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


