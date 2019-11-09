'use strict';

const cdk = require('@aws-cdk/core');

const { Database } = require('./database');
const { EFSCache } = require('./efsCache');
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
    new EFSCache(this, { networking, parameters });

    // Output server's address
    const host = droneServer.httpsHost;
    new cdk.CfnOutput(this, 'DroneHomepage', { value: cdk.Fn.sub('https://${host}', { host }) });
    new cdk.CfnOutput(this, 'OAuthCallback', { value: cdk.Fn.sub('https://${host}/login', { host }) });
  }
}

module.exports = { Stack };
