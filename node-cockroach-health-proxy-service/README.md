# Cockroach Health Proxy

This is a band-aid response to an issue with CockroachDB
and its `/health` check API. Specifically, the `/health`
endpoint cannot be served using plain `http` and always
redirects to an `https` url. This is a problem for the
Google TCP (Network) load balancer which can only
check `http` endpoints for health.

This application performs a very simple function.

* Check the `/health` endpoint of a single CockroachDB instance every second.
* Test if upstream `/health` returns a 200 response
* Provide a proxy `/health` HTTP only API that returns a `200` response if the last health check was OK.
* Return a non-200 response if the upstream check failed.

See the following bug reports to determine when/if this can be removed:
[https://github.com/cockroachdb/cockroach/issues/16578](https://github.com/cockroachdb/cockroach/issues/16578)
[https://github.com/cockroachdb/docs/issues/1602](https://github.com/cockroachdb/docs/issues/1602)
