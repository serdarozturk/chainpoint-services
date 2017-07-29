# Node ETH Contracts

This service is responsible for maintaining the ETH contracts being used by the chainpoint services.

# Development Env

For development, the docker-compose configuration will bring this image up and deploy the contracts to testrpc.  The deployed contracts will then be exposed to the other docker images through a volume so they can reference the addresses used in deployment for their specific environment.  

The contracts will be deployed to new addresses every time the environment is started and the deployment address is saved to the build/contracts json files.

# Production and Testnet

The deployments to production and testnet Eth networks should be done manually against a real node (e.g. not testrpc).  Once deployed, the resulting json files in build/contracts should be checked back in.  From that point on any other services that run against the testnet/livenet networks can use those json files to reference the deployed contracts.
