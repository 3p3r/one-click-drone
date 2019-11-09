'use strict';

const cdk = require('@aws-cdk/core');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs = require('@aws-cdk/aws-ecs');

// eslint-disable-next-line no-unused-vars
const { Parameters } = require('./parameters');

/** Everything networking and VPC related goes here */
class Networking extends cdk.Construct {
  /** @param {{parameters:Parameters=}} props */
  constructor(scope, props, id = 'Networking') {
    super(scope, id);

    /** @private */
    this._vpc = new ec2.Vpc(this, 'VPC');

    // ECS Cluster where runners and server instances will run in
    this._cluster = new ecs.Cluster(this, 'Cluster', { vpc: this._vpc });
  }

  get vpc() {
    return this._vpc;
  }

  get cluster() {
    return this._cluster;
  }
}

module.exports = { Networking };
