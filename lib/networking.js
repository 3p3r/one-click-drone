'use strict';

const cdk = require('@aws-cdk/core');
const ec2 = require('@aws-cdk/aws-ec2');

/** Everything networking and VPC related goes here */
class Networking extends cdk.Construct {
  constructor(scope, id = 'Networking') {
    super(scope, id);

    /** @private */
    this._vpc = new ec2.Vpc(this, 'VPC');
  }

  get vpc() {
    return this._vpc;
  }
}

module.exports = { Networking };
