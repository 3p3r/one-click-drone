'use strict';

const cdk = require('@aws-cdk/core');
const ecs = require('@aws-cdk/aws-ecs');

// eslint-disable-next-line no-unused-vars
const { Networking } = require('./networking');
// eslint-disable-next-line no-unused-vars
const { DroneServer } = require('./droneServer');

class DroneRunner extends cdk.Construct {
  /** @param {{droneServer:DroneServer, networking:Networking=, parameters:Parameters=}} props */
  constructor(scope, props, id = 'DroneRunner') {
    super(scope, id);

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'RunnerTaskDef');
    // Mount docker socket inside runner containers
    taskDefinition.addVolume({
      host: { sourcePath: '/var/run/docker.sock' },
      name: 'docker-sock',
    });

    const logDriver = new ecs.AwsLogDriver({ streamPrefix: this.node.id });
    const container = taskDefinition.addContainer('runner', {
      image: ecs.ContainerImage.fromRegistry(props.parameters.RunnerContainer),
      memoryReservationMiB: 512,
      logging: logDriver,
      environment: {
        DRONE_DEBUG: 'true',
        DRONE_TRACE: 'true',
        DRONE_RUNNER_CAPACITY: props.parameters.RunnerJobCapacity,
        DRONE_RPC_HOST: props.droneServer.httpHost,
        DRONE_RPC_PROTO: 'http',
        DRONE_RPC_SECRET: props.parameters.ServerRpcSecret,
      },
    });
    container.addMountPoints({
      sourceVolume: 'docker-sock',
      containerPath: '/var/run/docker.sock',
      readOnly: false,
    });
    container.addPortMappings({
      containerPort: 80,
    });

    new ecs.Ec2Service(this, 'DroneRunner', {
      cluster: props.networking.cluster,
      daemon: true,
      assignPublicIp: false,
      taskDefinition,
    });
  }
}

module.exports = { DroneRunner };
