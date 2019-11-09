'use strict';

const assert = require('assert');
const s3 = require('@aws-cdk/aws-s3');
const cdk = require('@aws-cdk/core');
const iam = require('@aws-cdk/aws-iam');
const efs = require('@aws-cdk/aws-efs');
const rds = require('@aws-cdk/aws-rds');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs = require('@aws-cdk/aws-ecs');
const cfr = require('@aws-cdk/aws-cloudfront');
const elb = require('@aws-cdk/aws-elasticloadbalancingv2');
const autoScaling = require('@aws-cdk/aws-autoscaling');
const ecsPatterns = require('@aws-cdk/aws-ecs-patterns');
const appAutoScaling = require('@aws-cdk/aws-applicationautoscaling');

const { Database } = require('./database');
const { IAMBucket } = require('./iamBucket');
const { Parameters } = require('./parameters');
const { Networking } = require('./networking');
const { DroneServer } = require('./droneServer');
const { DroneRunner } = require('./droneRunner');

class Stack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // These are JS config files turned into CloudFormation parameters
    const parameters = new Parameters(this);

    // Create a new VPC to house everything under
    const networking = new Networking(this, { parameters });

    // Create a serverless Aurora Postgres database
    const database = new Database(this, { networking, parameters });

    // Logs S3 bucket
    const logsBucket = new IAMBucket(this);

    // Fleet of server instances, running on Fargate
    const droneServer = new DroneServer(this, { database, logsBucket, parameters, networking });

    // Fleet of runner instances, running on EC2 backed ECS daemon containers
    new DroneRunner(this, { droneServer, networking, parameters });

    // Create a persistent EFS volume for build caching
    const cacheVolume = new efs.CfnFileSystem(this, 'EFSCacheVolume', {
      performanceMode: 'generalPurpose',
      throughputMode: 'bursting',
      lifecyclePolicies: [{ transitionToIa: 'AFTER_14_DAYS' }],
    });

    // Create a security group that opens up the database to our subnet
    const efsSecurityGroup = new ec2.SecurityGroup(this, 'EFSSecurityGroup', {
      allowAllOutbound: true,
      vpc: networking.vpc,
    });
    efsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(2049)); // 2049 is the port for NFS
    efsSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(2049)); // 2049 is the port for NFS

    // create a persistent EFS volume for Drone's cache
    networking.vpc.privateSubnets.forEach((subnet, index) => {
      new efs.CfnMountTarget(this, `EFSMountTarget${index}`, {
        fileSystemId: cacheVolume.ref,
        subnetId: subnet.subnetId,
        securityGroups: [efsSecurityGroup.securityGroupId],
      });
    });

    // Create a cleaner task that cleans the EFS volume to reduce costs
    const cleaner = new ecsPatterns.ScheduledEc2Task(this, 'CleanerAgent', {
      cluster: networking.cluster,
      desiredTaskCount: 1,
      schedule: appAutoScaling.Schedule.expression(cdk.Fn.sub('rate(${rate})', { rate: parameters.CacheCleanerRate })),
      scheduledEc2TaskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('alpine'),
        memoryReservationMiB: 512,
        command: [
          'sh',
          '-c',
          cdk.Fn.sub('find /cache -mtime +${expiry} -exec rm -f {} \\;', { expiry: parameters.CacheExpireAfter }),
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

    // Inject EFS into Runner ECS Container Instances
    networking.cluster.node.applyAspect(new InjectEfsIntoContainerInstance(cacheVolume.ref));

    // Output server's address
    const host = droneServer.httpsHost;
    new cdk.CfnOutput(this, 'DroneHomepage', { value: cdk.Fn.sub('https://${host}', { host }) });
    new cdk.CfnOutput(this, 'OAuthCallback', { value: cdk.Fn.sub('https://${host}/login', { host }) });
  }
}

/** A CDK Aspect that removes node when passed predicate return true */
class RemoveConstructsWithPredicate {
  constructor(predicate = () => false) {
    this._predicate = predicate;
  }
  visit(node) {
    if (this._predicate(node)) {
      const pathComponents = node.node.path.split(cdk.ConstructNode.PATH_SEP);
      assert.ok(pathComponents.length >= 2, 'invalid construct path found');
      assert.ok(pathComponents.shift() === node.stack.stackName);
      const connector = '.node._children.';
      eval(`delete node.stack${connector}${pathComponents.join(connector)}`);
    }
  }
}

/** This is a CDK Aspect that injects EFS into ECS Container Instance userData scripts */
class InjectEfsIntoContainerInstance {
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

module.exports = { Stack };
