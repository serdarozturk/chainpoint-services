# chainpoint-node-api-mon-service

Exercise the entire public API continually.

Periodically send hashes to the `POST /hashes` endpoint
of the API service. Log the `hash` w/ timestamp
and then track and log each subsequent proof
generation event for that hash.

Each proof generation event will be discovered
through a subscription to the public WebSocket
endpoint and will also be confirmed through
a call to the `GET /proofs` API.
