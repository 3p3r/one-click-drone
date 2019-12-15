'use strict';

const cdk = require('@aws-cdk/core');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs = require('@aws-cdk/aws-ecs');
const autoScaling = require('@aws-cdk/aws-autoscaling');

const { ObserveConstructsWithPredicate } = require('./aspects');

/** Everything networking and VPC related goes here */
class Networking extends cdk.Construct {
  /** @param {{parameters:Parameters=}} props */
  constructor(scope, props, id = 'Networking') {
    super(scope, id);

    /** @private */
    this._vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 });

    // ECS Cluster where runners and server instances will run in
    // Cluster is made here instead of in Runner file because CDK is broken and if we don't pass it a capacity here,
    // it force-creates a capacity for us which is annoying!
    this._cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: this._vpc,
      capacity: {
        instanceType: new ec2.InstanceType(props.parameters.RunnerInstanceType.valueAsString),
        vpcSubnets: this._vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
        associatePublicIpAddress: true,
        keyName: cdk.Fn.conditionIf(
          new cdk.CfnCondition(this, 'KeyCondition', {
            expression: cdk.Fn.conditionEquals(props.parameters.RunnerSSHKey, ''),
          }).logicalId,
          'AWS::NoValue',
          props.parameters.RunnerSSHKey
        ),
      },
    });

    // assign the conditional image directly to the underlying CFN resource
    this._cluster.node.applyAspect(
      new ObserveConstructsWithPredicate(
        node => node instanceof autoScaling.CfnLaunchConfiguration,
        node => {
          const originalImageId = node.imageId;
          node.imageId = cdk.Fn.conditionIf(
            // if no AMI specified, use Amazon Linux
            new cdk.CfnCondition(this, 'ImageCondition', {
              expression: cdk.Fn.conditionEquals(props.parameters.RunnerAMI, ''),
            }).logicalId,
            originalImageId,
            props.parameters.RunnerAMI
          );
        }
      )
    );

    // At the time of writing this, CDK is broken and does not accept "maxCapacity" parameter as a CfnParameter and
    // inserts [object Object] into the final CloudFormation instead.
    this._cluster.node.applyAspect({
      visit(node) {
        if (node instanceof autoScaling.CfnAutoScalingGroup) {
          // Fn::Sub is used to convert from Number to String in CloudFormation side
          node.addOverride('Properties.MaxSize', { 'Fn::Sub': ['${Cap}', { Cap: { Ref: 'RunnerMaxCapacity' } }] });
        }
      },
    });

    this._cluster.autoscalingGroup.scaleOnCpuUtilization('RunnerCPUScaling', {
      targetUtilizationPercent: 90,
      scaleInCooldown: cdk.Duration.minutes(1),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });
  }

  get vpc() {
    return this._vpc;
  }

  get cluster() {
    return this._cluster;
  }

  get containerInstance() {
    return this._cluster.autoscalingGroup;
  }
}

module.exports = { Networking };
