'use strict';

const cdk = require('@aws-cdk/core');
const efs = require('@aws-cdk/aws-efs');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs = require('@aws-cdk/aws-ecs');
const ecsPatterns = require('@aws-cdk/aws-ecs-patterns');
const appAutoScaling = require('@aws-cdk/aws-applicationautoscaling');

// eslint-disable-next-line no-unused-vars
const { Parameters } = require('./parameters');
// eslint-disable-next-line no-unused-vars
const { Networking } = require('./networking');
// eslint-disable-next-line no-unused-vars
const { DroneRunner } = require('./droneRunner');

class EFSCache extends cdk.Construct {
  /** @param {{networking:Networking=, parameters:Parameters=, droneRunner:DroneRunner=}} props */
  constructor(scope, props, id = 'EFSCache') {
    super(scope, id);

    // Create a persistent EFS volume for build caching
    const cacheVolume = new efs.CfnFileSystem(this, 'EFSCacheVolume', {
      performanceMode: 'generalPurpose',
      throughputMode: 'bursting',
      lifecyclePolicies: [{ transitionToIa: 'AFTER_14_DAYS' }],
    });

    // Create a security group that opens up the database to our subnet
    const efsSecurityGroup = new ec2.SecurityGroup(this, 'EFSSecurityGroup', {
      allowAllOutbound: true,
      vpc: props.networking.vpc,
    });
    efsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(2049)); // 2049 is the port for NFS
    efsSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(2049)); // 2049 is the port for NFS

    // create a persistent EFS volume for Drone's cache
    props.networking.vpc.privateSubnets.forEach((subnet, index) => {
      new efs.CfnMountTarget(this, `EFSMountTarget${index}`, {
        fileSystemId: cacheVolume.ref,
        subnetId: subnet.subnetId,
        securityGroups: [efsSecurityGroup.securityGroupId],
      });
    });

    // Create a cleaner task that cleans the EFS volume to reduce costs
    const cleaner = new ecsPatterns.ScheduledEc2Task(this, 'CleanerAgent', {
      cluster: props.networking.cluster,
      desiredTaskCount: 1,
      schedule: appAutoScaling.Schedule.expression(
        cdk.Fn.sub('rate(${rate})', { rate: props.parameters.CacheCleanerRate })
      ),
      scheduledEc2TaskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('alpine'),
        memoryReservationMiB: 512,
        command: [
          'sh',
          '-c',
          cdk.Fn.sub('find /cache -mtime +${expiry} -exec rm -f {} \\;', { expiry: props.parameters.CacheTTLInDays }),
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

    // mount our EFS file system on boot
    // see: https://aws.amazon.com/premiumsupport/knowledge-center/ecs-create-docker-volume-efs/
    const mountOpts = 'nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport';
    const mountDest = '/mnt/efs';
    // Inject EFS into Runner ECS Container Instances
    props.droneRunner.containerInstance.addUserData([
      'yum update -y',
      'yum install -y amazon-efs-utils',
      `mkdir -p ${mountDest}`,
      cdk.Fn.sub(`mount -t nfs4 -o ${mountOpts} \${efsId}.efs.\${region}.amazonaws.com:/ ${mountDest}`, {
        region: cdk.Stack.of(this).region,
        efsId: cacheVolume.ref,
      }),
      `chmod 777 ${mountDest}`,
      'mount -a',
    ]);
  }
}

module.exports = { EFSCache };
