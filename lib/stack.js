'use strict';

const assert = require('assert');
const cdk = require('@aws-cdk/core');
const s3 = require('@aws-cdk/aws-s3');
const iam = require('@aws-cdk/aws-iam');
const efs = require('@aws-cdk/aws-efs');
const rds = require('@aws-cdk/aws-rds');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs = require('@aws-cdk/aws-ecs');
const cfr = require('@aws-cdk/aws-cloudfront');
const autoScaling = require('@aws-cdk/aws-autoscaling');
const ecsPatterns = require('@aws-cdk/aws-ecs-patterns');
const appAutoScaling = require('@aws-cdk/aws-applicationautoscaling');

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

    // These are JS config files turned into CloudFormation parameters
    const params = new Parameters(this);

    // Create a new VPC to house everything under
    const vpc = new ec2.Vpc(this, 'VPC');

    // Create a subnet group from private subnets of our vpc
    const dbSubnetGroup = new rds.CfnDBSubnetGroup(this, 'DBSubnetGroup', {
      dbSubnetGroupDescription: 'Drone CI database cluster subnet group',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
    });
    // Create a security group that opens up the database to our subnet
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', { allowAllOutbound: true, vpc });
    // Create a serverless Aurora Postgres database
    const db = new rds.CfnDBCluster(this, 'DBCluster', {
      databaseName: 'drone',
      dbClusterIdentifier: 'one-click-drone-db',
      dbSubnetGroupName: dbSubnetGroup.ref,
      vpcSecurityGroupIds: [dbSecurityGroup.securityGroupId],
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
    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(db.port));
    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(db.port));

    // ECS Cluster where runners and server instances will run in
    const cluster = new ecs.Cluster(this, 'cluster', {
      vpc: vpc,
      capacity: {
        // this is only applicable to runners. servers are running on Fargate
        instanceType: new ec2.InstanceType(params.runnerInstanceType.valueAsString),
      },
    });

    // IAM user used by Drone (does not support IAM roles yet)
    const logsBucketUser = new iam.User(this, 'LogsBucketUser');
    // Logs S3 bucket
    const logsBucket = new s3.Bucket(this, 'LogsBucket', {
      versioned: false,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.KMS_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    // FIXME: Figure out what permissions Drone need and limit this
    const logsBucketResourcePolicy = new iam.PolicyStatement();
    logsBucketResourcePolicy.addResources(logsBucket.arnForObjects('*'), logsBucket.bucketArn);
    logsBucketResourcePolicy.addActions('s3:*');
    logsBucketResourcePolicy.effect = iam.Effect.ALLOW;
    logsBucketResourcePolicy.addArnPrincipal(logsBucketUser.userArn);
    logsBucket.addToResourcePolicy(logsBucketResourcePolicy);

    // Create a set of IAM credentials for Drone (does not support IAM roles yet)
    const logsBucketCredentials = new iam.CfnAccessKey(this, 'LogsBucketCredentials', {
      userName: logsBucketUser.userName,
    });
    const logsAccessKey = logsBucketCredentials.ref;
    const logsSecretKey = logsBucketCredentials.attrSecretAccessKey;

    // Fleet of server instances, running on Fargate
    const server = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ServerAgents', {
      cluster: cluster,
      publicLoadBalancer: true,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(params.serverContainer.valueAsString),
        environment: {
          AWS_ACCESS_KEY_ID: logsAccessKey,
          AWS_SECRET_ACCESS_KEY: logsSecretKey,
          AWS_DEFAULT_REGION: this.region,
          AWS_REGION: this.region,
          DRONE_S3_BUCKET: logsBucket.bucketName,
          DRONE_LOGS_DEBUG: 'true',
          DRONE_LOGS_COLOR: 'false',
          DRONE_AGENTS_ENABLED: 'true',
          DRONE_REPOSITORY_FILTER: params.serverRepoFilter,
          DRONE_GITHUB_SERVER: params.githubServer,
          DRONE_GITHUB_CLIENT_ID: params.githubClientId,
          DRONE_GITHUB_CLIENT_SECRET: params.githubClientSecret,
          DRONE_RPC_SECRET: params.serverRpcSecret,
          DRONE_DATABASE_DRIVER: 'postgres',
          DRONE_DATABASE_SECRET: params.databaseSecret,
          DRONE_DATABASE_DATASOURCE: cdk.Fn.sub('postgres://${user}:${pass}@${host}:${port}/drone?sslmode=disable', {
            user: params.databaseUsername,
            pass: params.databasePassword,
            host: db.attrEndpointAddress,
            port: db.attrEndpointPort,
          }),
          DRONE_COOKIE_SECRET: params.serverCookieSecret,
          DRONE_USER_CREATE: cdk.Fn.sub('username:${admin},admin:true', {
            admin: params.serverAdmin,
          }),
        },
      },
    });

    // CDK currently does not give us APIs to modify the health check so we inject it
    this.node.applyAspect(new AddDroneServerHealthCheck());

    // Scale server based on 90% cpu utilization
    server.service
      .autoScaleTaskCount({ maxCapacity: params.serverMaxCapacity })
      .scaleOnCpuUtilization('ServerCPUScaling', {
        targetUtilizationPercent: 90,
        scaleInCooldown: cdk.Duration.minutes(1),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

    // Put CloudFront in front of Drone to add HTTPS to it and cache its frontend files
    const cloudFront = new cfr.CloudFrontWebDistribution(this, 'CloudfrontWrapper', {
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
    const runner = new ecsPatterns.ApplicationLoadBalancedEc2Service(this, 'RunnerAgents', {
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
      .scaleOnCpuUtilization('RunnerCPUScaling', {
        targetUtilizationPercent: 90,
        scaleInCooldown: cdk.Duration.minutes(1),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

    // Create a persistent EFS volume for build caching
    const cacheVolume = new efs.CfnFileSystem(this, 'EFSCacheVolume', {
      performanceMode: 'generalPurpose',
      throughputMode: 'bursting',
      lifecyclePolicies: [{ transitionToIa: 'AFTER_14_DAYS' }],
    });

    // Create a security group that opens up the database to our subnet
    const efsSecurityGroup = new ec2.SecurityGroup(this, 'EFSSecurityGroup', { allowAllOutbound: true, vpc });
    efsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(2049)); // 2049 is the port for NFS
    efsSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(2049)); // 2049 is the port for NFS

    // create a persistent EFS volume for Drone's cache
    vpc.privateSubnets.forEach((subnet, index) => {
      new efs.CfnMountTarget(this, `EFSMountTarget${index}`, {
        fileSystemId: cacheVolume.ref,
        subnetId: subnet.subnetId,
        securityGroups: [efsSecurityGroup.securityGroupId],
      });
    });

    // Create a cleaner task that cleans the EFS volume to reduce costs
    const cleaner = new ecsPatterns.ScheduledEc2Task(this, 'CleanerAgent', {
      cluster,
      desiredTaskCount: 1,
      schedule: appAutoScaling.Schedule.expression(cdk.Fn.sub('rate(${rate})', { rate: params.cacheCleanerRate })),
      scheduledEc2TaskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('alpine'),
        memoryReservationMiB: 512,
        command: [
          'sh',
          '-c',
          cdk.Fn.sub('find /cache -mtime +${expiry} -exec rm -f {} \\;', { expiry: params.cacheExpireAfter }),
        ],
      },
    });
    // Mount cache volume inside cleaner containers
    cleaner.taskDefinition.addVolume({
      host: { sourcePath: '/mnt/efs' },
      name: 'efs-cache',
    });
    cleaner.taskDefinition.defaultContainer.addMountPoints({
      sourceVolume: 'efs-cache',
      containerPath: '/cache',
      readOnly: false,
    });

    // Remove all CDK auto generated CfnOutput constructs
    this.node.applyAspect(new StackNestedOutputRemover());
    // Inject EFS into Runner ECS Container Instances
    this.node.applyAspect(new InjectEfsIntoContainerInstances(cacheVolume.ref));

    // Output server's address
    const host = cloudFront.domainName;
    new cdk.CfnOutput(this, 'DroneHost', { value: host });
    new cdk.CfnOutput(this, 'DroneHomepage', { value: cdk.Fn.sub('https://${host}', { host }) });
    new cdk.CfnOutput(this, 'OAuthCallback', { value: cdk.Fn.sub('https://${host}/login', { host }) });
  }
}

/** This is a CDK aspect that injects Drone's custom health check endpoint into its task */
class AddDroneServerHealthCheck {
  visit(node) {
    if (node instanceof ecs.CfnTaskDefinition && node.node.path.includes('ServerAgents')) {
      node.addOverride('Properties.ContainerDefinitions.0.HealthCheck.Command', [
        'curl -f http://localhost/healthz || exit 1',
      ]);
    }
  }
}

/** This is a CDK Aspect that injects EFS into ECS Container Instance userData scripts */
class InjectEfsIntoContainerInstances {
  constructor(efs) {
    this._efs = efs;
  }
  visit(node) {
    if (node instanceof autoScaling.AutoScalingGroup) {
      // mount our EFS file system on boot
      // see: https://aws.amazon.com/premiumsupport/knowledge-center/ecs-create-docker-volume-efs/
      const mountOpts = 'nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport';
      const mountDest = '/mnt/efs';
      node.addUserData([
        'yum update -y',
        'yum install -y amazon-efs-utils',
        `mkdir -p ${mountDest}`,
        cdk.Fn.sub(`mount -t nfs4 -o ${mountOpts} \${efsId}.efs.\${region}.amazonaws.com:/ ${mountDest}`, {
          region: node.stack.region,
          efsId: this._efs,
        }),
        `chmod 777 ${mountDest}`,
        'mount -a',
      ]);
    }
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
