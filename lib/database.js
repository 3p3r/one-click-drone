'use strict';

const cdk = require('@aws-cdk/core');
const rds = require('@aws-cdk/aws-rds');
const ec2 = require('@aws-cdk/aws-ec2');

// eslint-disable-next-line no-unused-vars
const { Parameters } = require('./parameters');
// eslint-disable-next-line no-unused-vars
const { Networking } = require('./networking');

/**
 * Creates a database to be used by Drone Server agents
 *
 * Database engine is Serverless Aurora - PostgreSQL
 * PostgreSQL is chosen since it's advised so on Drone's docs (https://docs.drone.io/installation/storage/database/)
 * Serverless is chosen since in my personal workload I don't need the database up all the time. There are definitely
 * downtimes in your CI workflow that you are not submitting builds - serverless cut costs from your AWS bill
 *
 * Note: at the time of writing this, Serverless Aurora is not supported by CDK natively. This construct is put together
 * by mostly looking at Former2 exports and https://github.com/aws/aws-cdk/issues/929
 */
class Database extends cdk.Construct {
  /** @param {{networking:Networking=, parameters:Parameters=}} props */
  constructor(scope, props, id = 'Database') {
    super(scope, id);

    // Create a subnet group from private subnets of our vpc
    const dbSubnetGroup = new rds.CfnDBSubnetGroup(this, 'DBSubnetGroup', {
      dbSubnetGroupDescription: 'Drone CI database cluster subnet group',
      subnetIds: props.networking.vpc.privateSubnets.map(subnet => subnet.subnetId),
    });
    // Create a security group that opens up the database to our subnet
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      allowAllOutbound: true,
      vpc: props.networking.vpc,
    });
    // Create a serverless Aurora Postgres database
    const db = new rds.CfnDBCluster(this, 'DBCluster', {
      databaseName: 'drone',
      dbClusterIdentifier: 'one-click-drone-db',
      dbSubnetGroupName: dbSubnetGroup.ref,
      vpcSecurityGroupIds: [dbSecurityGroup.securityGroupId],
      engineMode: 'serverless',
      engine: 'aurora-postgresql',
      engineVersion: '10.7', // minimum postgre-sql compatible version
      masterUsername: props.parameters.DatabaseUsername,
      masterUserPassword: props.parameters.DatabasePassword,
      storageEncrypted: true,
      backupRetentionPeriod: 1,
      deletionProtection: false,
      port: 5432, // postgre-sql's default port
      scalingConfiguration: {
        autoPause: true,
        secondsUntilAutoPause: 1800, // half an hour of inactivity
      },
    });
    // Configure the security group and expose database endpoint
    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(db.port));
    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(db.port));

    /** @private */
    this._db = db;
  }

  get host() {
    return this._db.attrEndpointAddress;
  }

  get port() {
    return this._db.attrEndpointPort;
  }
}

module.exports = { Database };
