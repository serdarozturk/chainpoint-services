namespace :build do
  desc 'Build node-base image from Dockerfile'
  task :node_base do
    system 'cd node-base && docker build -t chainpoint/node-base:latest --no-cache=true .'
  end

  desc 'Build node-web-service image from Dockerfile'
  task :node_web_service do
    system 'cd node-web-service && yarn && docker build -t chainpoint/node-web-service:latest --no-cache=true .'
  end

  desc 'Build node-aggregator-service image from Dockerfile'
  task :node_aggregator_service do
    system 'cd node-aggregator-service && yarn && docker build -t chainpoint/node-aggregator-service:latest --no-cache=true .'
  end

  desc 'Build node-proof-service image from Dockerfile'
  task :node_proof_service do
    system 'cd node-proof-service && yarn && docker build -t chainpoint/node-proof-service:latest --no-cache=true .'
  end

  desc 'Build all images from Dockerfiles'
  task all: [:node_base, :node_web_service, :node_aggregator_service, :node_proof_service]
end

namespace :prune do
  desc 'Cleanup all local unused containers (destructive!)'
  task :containers do
    system 'docker container prune -f'
  end

  desc 'Cleanup all local unused images (destructive!)'
  task :images do
    system 'docker image prune -f'
  end

  desc 'Cleanup all local unused volumes (destructive!)'
  task :volumes do
    system 'docker volume prune -f'
  end

  desc 'Cleanup all local unused networks (destructive!)'
  task :networks do
    system 'docker network prune -f'
  end

  desc 'Cleanup all local containers, images, volumes and networks!'
  task all: [:containers, :images, :volumes, :networks]
end

task default: ['build:all']
