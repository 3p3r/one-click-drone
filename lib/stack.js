'use strict';

const assert = require('assert');
const cdk = require('@aws-cdk/core');
const rds = require('@aws-cdk/aws-rds');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs = require('@aws-cdk/aws-ecs');
const cfr = require('@aws-cdk/aws-cloudfront');
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

    // Create a subnet group from private subnets of our vpc
    const subnetGroup = new rds.CfnDBSubnetGroup(this, 'db-subnet-group', {
      dbSubnetGroupDescription: 'Drone CI database cluster subnet group',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
    });
    // Create a security group that opens up the database to our subnet
    const securityGroup = new ec2.SecurityGroup(this, 'db-security-group', {
      allowAllOutbound: true,
      vpc,
    });
    // Create a serverless Aurora Postgres database
    const db = new rds.CfnDBCluster(this, 'db-cluster', {
      databaseName: 'drone',
      dbClusterIdentifier: 'one-click-drone-db',
      dbSubnetGroupName: subnetGroup.ref,
      vpcSecurityGroupIds: [securityGroup.securityGroupId],
      engineMode: 'serverless',
      engine: 'aurora-postgresql',
      engineVersion: '10.7', // minimum postgre-sql compatible version
      masterUsername: params.databaseUsername,
      masterUserPassword: params.databasePassword,
      storageEncrypted: true,
      backupRetentionPeriod: 1,
      deletionProtection: false,
      port: 5432,
      scalingConfiguration: {
        autoPause: true,
        secondsUntilAutoPause: 1800, // half an hour of inactivity
      },
    });
    // Configure the security group and expose database endpoint
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(db.port));
    securityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(db.port));

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
          DRONE_RPC_SECRET: params.serverRpcSecret,
          DRONE_DATABASE_DRIVER: 'postgres',
          DRONE_DATABASE_DATASOURCE: cdk.Fn.sub('postgres://${user}:${pass}@${host}:${port}/drone?sslmode=disable', {
            user: params.databaseUsername,
            pass: params.databasePassword,
            host: db.attrEndpointAddress,
            port: db.attrEndpointPort,
          }),
        },
      },
    });

    // Scale server based on 90% cpu utilization
    server.service
      .autoScaleTaskCount({ maxCapacity: params.serverMaxCapacity })
      .scaleOnCpuUtilization('server-cpu-scaling', {
        targetUtilizationPercent: 90,
        scaleInCooldown: cdk.Duration.minutes(1),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

    // Put CloudFront in front of Drone to add HTTPS to it and cache its frontend files
    const cloudFront = new cfr.CloudFrontWebDistribution(this, 'cloudfront-wrapper', {
      viewerProtocolPolicy: cfr.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      originConfigs: [
        {
          customOriginSource: {
            domainName: server.loadBalancer.loadBalancerDnsName,
            originProtocolPolicy: cfr.OriginProtocolPolicy.HTTP_ONLY,
            allowedOriginSSLVersions: [
              cfr.OriginSslPolicy.TLS_V1,
              cfr.OriginSslPolicy.TLS_V1_1,
              cfr.OriginSslPolicy.TLS_V1_2,
            ],
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              allowedMethods: cfr.CloudFrontAllowedMethods.ALL,
              cachedMethods: cfr.CloudFrontAllowedCachedMethods.GET_HEAD_OPTIONS,
              forwardedValues: { queryString: true, cookies: { forward: 'all' } },
            },
          ],
        },
      ],
    });

    // Drone server instances need to know their public DNS for callback URL generation
    server.taskDefinition.defaultContainer.props.environment.DRONE_SERVER_HOST = cloudFront.domainName;
    server.taskDefinition.defaultContainer.props.environment.DRONE_SERVER_PROTO = 'https';

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
          DRONE_RPC_HOST: server.loadBalancer.loadBalancerDnsName,
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
      .scaleOnCpuUtilization('runner-cpu-scaling', {
        targetUtilizationPercent: 90,
        scaleInCooldown: cdk.Duration.minutes(1),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

    // Remove all CDK auto generated CfnOutput constructs
    this.node.applyAspect(new StackNestedOutputRemover());

    // Output server's address
    const host = cloudFront.domainName;
    new cdk.CfnOutput(this, 'DroneHost', { value: host });
    new cdk.CfnOutput(this, 'DroneHomepage', { value: cdk.Fn.sub('https://${host}', { host }) });
    new cdk.CfnOutput(this, 'OAuthCallback', { value: cdk.Fn.sub('https://${host}/login', { host }) });
  }
}

/** This is a CDK Aspect that removes all nested (auto generated) CfnOutput constructs */
class StackNestedOutputRemover {
  visit(node) {
    // See that we're dealing with a CfnBucket
    if (node instanceof cdk.CfnOutput) {
      const pathComponents = node.node.path.split(cdk.ConstructNode.PATH_SEP);
      assert.ok(pathComponents.length >= 2, 'invalid construct path found');
      // is path an immediate child of the stack (${stack}/${construct})?
      const isImmediate = pathComponents.length == 2;
      // these are user added constructs, return
      if (isImmediate) return;
      assert.ok(pathComponents.shift() === node.stack.stackName);
      const connector = '.node._children.';
      eval(`delete node.stack${connector}${pathComponents.join(connector)}`);
    }
  }
}

module.exports = { Stack };
