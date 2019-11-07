'use strict';

const _ = require('lodash');
const rc = require('@rootstream/rc-typed');
const cdk = require('@aws-cdk/core');
const debug = require('debug')('ocd:config');
const { description, homepage } = require('../package.json');

const DEBUG = !_.get(process, 'env.NODE_ENV', 'dev')
  .toLowerCase()
  .startsWith('p');

const defaultConfig = {
  opts: {
    debug: DEBUG,
    stack: {
      name: 'one-click-drone-stack',
      description: `${description} see: ${homepage}`,
    },
    database: {
      username: '',
      password: '',
      secret: 'change-this-secret',
    },
    runner: {
      container: 'drone/drone-runner-docker:latest',
      instanceType: 't2.micro',
      jobCapacity: 2,
      maxCapacity: 5,
    },
    server: {
      container: 'drone/drone:latest',
      repoFilter: '',
      rpcSecret: 'change-this-secret',
      maxCapacity: 2,
      cookieSecret: 'change-this-secret',
      admin: '',
    },
    cache: {
      cleanerRate: '1 day',
      expireAfter: 1,
    },
    github: {
      server: 'https://github.com',
      clientId: '',
      clientSecret: '',
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
    this.databaseUsername = new cdk.CfnParameter(scope, 'DatabaseUsername', {
      description: 'Database username used by Drone server agents',
      default: config.database.username,
      type: 'String',
    });
    this.databasePassword = new cdk.CfnParameter(scope, 'DatabasePassword', {
      description: 'Database password used by Drone server agents',
      default: config.database.password,
      type: 'String',
      noEcho: true,
    });
    this.databaseSecret = new cdk.CfnParameter(scope, 'DatabaseSecret', {
      description: 'Database secret used by Drone server agents to encrypt Drone secrets',
      default: config.database.secret,
      type: 'String',
      noEcho: true,
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
    this.serverRpcSecret = new cdk.CfnParameter(scope, 'ServerRpcSecret', {
      description: 'Drone shared RPC secret used across all runners and servers (DRONE_RPC_SECRET)',
      default: config.server.rpcSecret,
      type: 'String',
      noEcho: true,
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
    this.serverCookieSecret = new cdk.CfnParameter(scope, 'ServerCookieSecret', {
      description: 'Drone server secret key used to sign authentication cookies',
      default: config.server.cookieSecret,
      type: 'String',
      noEcho: true,
    });
    this.serverAdmin = new cdk.CfnParameter(scope, 'ServerAdmin', {
      description: 'Drone server admin user (created only during the initial deploy)',
      default: config.server.admin,
      type: 'String',
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
      noEcho: true,
    });
    this.githubClientSecret = new cdk.CfnParameter(scope, 'GithubClientSecret', {
      description: 'Github app OAuth clientSecret',
      default: config.github.clientSecret,
      type: 'String',
      noEcho: true,
    });
    this.cacheCleanerRate = new cdk.CfnParameter(scope, 'CacheCleanerRate', {
      description: 'The rate at which the cache cleaner runs (CloudWatch rate expression)',
      default: config.cache.cleanerRate,
      type: 'String',
    });
    this.cacheExpireAfter = new cdk.CfnParameter(scope, 'CacheExpireAfter', {
      description: 'Cache files older than this number of days are deleted at "CacheCleanerRate" intervals',
      default: config.cache.expireAfter,
      type: 'Number',
      minValue: 1,
    });
  }
}

module.exports = { Parameters, config };
