'use strict';

const cdk = require('@aws-cdk/core');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs = require('@aws-cdk/aws-ecs');
const elb = require('@aws-cdk/aws-elasticloadbalancingv2');
const ecsPatterns = require('@aws-cdk/aws-ecs-patterns');

const { Parameters } = require('./config');

class Stack extends cdk.Stack {
  /**
   *
   * @param {cdk.Construct} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const params = new Parameters(this);

    // Create a new VPC to house everything under
    const vpc = new ec2.Vpc(this, 'vpc');

    // ECS Cluster where runners and server instances will run in
    const cluster = new ecs.Cluster(this, 'cluster', {
      vpc: vpc,
      capacity: {
        // this is only applicable to runners. servers are running on Fargate
        instanceType: new ec2.InstanceType(params.runnerInstanceType.valueAsString),
      },
    });

    // Fleet of server instances, running on Fargate
    const server = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'servers', {
      cluster: cluster,
      publicLoadBalancer: true,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(params.serverContainer.valueAsString),
        environment: {
          DRONE_LOGS_DEBUG: 'true',
          DRONE_AGENTS_ENABLED: 'true',
          DRONE_REPOSITORY_FILTER: params.serverRepoFilter,
          DRONE_GITHUB_SERVER: params.githubServer,
          DRONE_GITHUB_CLIENT_ID: params.githubClientId,
          DRONE_GITHUB_CLIENT_SECRET: params.githubClientSecret,
          DRONE_SERVER_PROTO: 'http',
          DRONE_RPC_SECRET: params.serverRpcSecret,
        },
      },
    });

    // Is ServerHost parameter empty?
    const hostCondition = new cdk.CfnCondition(this, 'host-condition', {
      expression: cdk.Fn.conditionEquals(params.serverHost, ''),
    });
    // If ServerHost is empty, use Fargate service's public load balancer DNS
    const host = cdk.Fn.conditionIf(
      hostCondition.logicalId,
      server.loadBalancer.loadBalancerDnsName,
      params.serverHost.valueAsString
    );
    // Drone server instances need to know their public DNS for callback URL generation
    server.taskDefinition.defaultContainer.props.environment.DRONE_SERVER_HOST = host;
    // Scale server based on 90% cpu utilization
    server.service
      .autoScaleTaskCount({ maxCapacity: params.serverMaxCapacity })
      .scaleOnCpuUtilization('server-cpu-scaling', {
        targetUtilizationPercent: 90,
        scaleInCooldown: cdk.Duration.minutes(1),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

    // Drone's docker runner need access to the docker socket, therefore cannot be in
    // a Fargate task definition. We launch our runners inside classic EC2 instances.
    const runner = new ecsPatterns.ApplicationLoadBalancedEc2Service(this, 'runners', {
      cluster: cluster,
      publicLoadBalancer: false,
      memoryReservationMiB: 512,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(params.runnerContainer),
        environment: {
          DRONE_DEBUG: 'true',
          DRONE_TRACE: 'true',
          DRONE_RUNNER_CAPACITY: params.runnerJobCapacity,
          DRONE_RPC_HOST: host,
          DRONE_RPC_PROTO: 'http',
          DRONE_RPC_SECRET: params.serverRpcSecret,
        },
      },
    });

    // Mount docker socket inside runner containers
    runner.taskDefinition.addVolume({
      host: { sourcePath: '/var/run/docker.sock' },
      name: 'docker-sock',
    });
    runner.taskDefinition.defaultContainer.addMountPoints({
      sourceVolume: 'docker-sock',
      containerPath: '/var/run/docker.sock',
      readOnly: false,
    });

    // Scale runner based on 90% cpu utilization
    runner.service
      .autoScaleTaskCount({ maxCapacity: params.runnerMaxCapacity })
      .scaleOnCpuUtilization('server-cpu-scaling', {
        targetUtilizationPercent: 90,
        scaleInCooldown: cdk.Duration.minutes(1),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

    // Output server's address
    new cdk.CfnOutput(this, 'OneClickDroneHost', { value: server.loadBalancer.loadBalancerDnsName });
  }
}

module.exports = { Stack };
