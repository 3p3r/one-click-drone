'use strict';

const _ = require('lodash');
const rc = require('@rootstream/rc-typed');
const cdk = require('@aws-cdk/core');
const debug = require('debug')('ocd:config');

const DEBUG = !_.get(process, 'env.NODE_ENV', 'dev')
  .toLowerCase()
  .startsWith('p');

const defaultConfig = {
  opts: {
    debug: DEBUG,
    stack: {
      name: 'one-click-drone-stack',
    },
    runner: {
      container: 'drone/drone-runner-docker:latest',
      instanceType: 't2.micro',
      jobCapacity: 2,
      maxCapacity: 5,
    },
    server: {
      container: 'drone/drone:latest',
      repoFilter: '3p3r,rootstream,virtulabs',
      rpcSecret: 'change-this-secret',
      maxCapacity: 2,
      host: '',
    },
    github: {
      server: 'https://github.com',
      clientId: 'e72b6552a33b54a91edc',
      clientSecret: '5297e6641c1599aa4de050d328c88f344ba64828',
    },
  },
};

const userConfig = rc('ocd', defaultConfig);
debug('options: %o', userConfig);
const config = userConfig.opts;

class Parameters {
  /** @param {cdk.Construct} scope  */
  constructor(scope) {
    this.runnerInstanceType = new cdk.CfnParameter(scope, 'RunnerInstanceType', {
      description: 'EC2 instance type of Drone docker runners',
      default: config.runner.instanceType,
      type: 'String',
    });
    this.runnerContainer = new cdk.CfnParameter(scope, 'RunnerContainer', {
      description: 'Drone docker runner container name and version used',
      default: config.runner.container,
      type: 'String',
    });
    this.runnerMaxCapacity = new cdk.CfnParameter(scope, 'RunnerMaxCapacity', {
      description: 'Drone docker runner service auto-scaler limit',
      default: config.runner.maxCapacity,
      type: 'Number',
      minValue: 2,
    });
    this.runnerJobCapacity = new cdk.CfnParameter(scope, 'RunnerJobCapacity', {
      description: 'Max number of build jobs a single runner container accepts',
      default: config.runner.jobCapacity,
      type: 'Number',
      minValue: 2,
    });
    this.serverContainer = new cdk.CfnParameter(scope, 'ServerContainer', {
      description: 'Drone server container name and version used',
      default: config.server.container,
      type: 'String',
    });
    this.serverHost = new cdk.CfnParameter(scope, 'ServerHost', {
      description: 'Drone server host used - uses load balancer DNS name if empty',
      default: config.server.host,
      type: 'String',
    });
    this.serverRpcSecret = new cdk.CfnParameter(scope, 'ServerRpcSecret', {
      description: 'Drone shared RPC secret used across all runners and servers (DRONE_RPC_SECRET)',
      default: config.server.rpcSecret,
      type: 'String',
    });
    this.serverRepoFilter = new cdk.CfnParameter(scope, 'ServerRepoFilter', {
      description: 'Drone repository filter (DRONE_REPOSITORY_FILTER)',
      default: config.server.repoFilter,
      type: 'String',
    });
    this.serverMaxCapacity = new cdk.CfnParameter(scope, 'ServerMaxCapacity', {
      description: 'Drone server service auto-scaler limit',
      default: config.server.maxCapacity,
      type: 'Number',
      minValue: 2,
    });
    this.githubServer = new cdk.CfnParameter(scope, 'GithubServer', {
      description: 'Github server used. Change this if using Github enterprise',
      default: config.github.server,
      type: 'String',
    });
    this.githubClientId = new cdk.CfnParameter(scope, 'GithubClientId', {
      description: 'Github app OAuth clientId',
      default: config.github.clientId,
      type: 'String',
    });
    this.githubClientSecret = new cdk.CfnParameter(scope, 'GithubClientSecret', {
      description: 'Github app OAuth clientSecret',
      default: config.github.clientSecret,
      type: 'String',
    });
  }
}

module.exports = { Parameters, config };
