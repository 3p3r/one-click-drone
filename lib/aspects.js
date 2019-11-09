'use strict';

const cdk = require('@aws-cdk/core');
const autoScaling = require('@aws-cdk/aws-autoscaling');

const assert = require('assert');

/**
 * This is a CDK Aspect that injects EFS into ECS Container Instance userData scripts
 * At the time of writing this, CDK does not support modifying userData scripts
 */
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

/**
 * A CDK Aspect that removes node when passed predicate return true
 * At the time of writing this, CDK does not support removing nodes
 */
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

module.exports = { InjectEfsIntoContainerInstance, RemoveConstructsWithPredicate };
