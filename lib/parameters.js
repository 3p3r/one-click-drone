'use strict';

const cdk = require('@aws-cdk/core');

const { config } = require('./config');

/**
 * This class converts some applicable JavaScript configuration keys into CloudFormation parameters so when you create a
 * raw CloudFormation YAML from this project's CDK code, the YAML template is standalone and reusable.
 *
 * The premise of this project is being "one-click-deployable", therefore having the raw YAML to be standalone is very
 * important. This class exists to provide flexibility to raw YAML users.
 */
class Parameters extends cdk.Construct {
  constructor(scope, id = 'Parameters') {
    super(scope, id);

    /** @readonly */
    this.RunnerInstanceType = new cdk.CfnParameter(scope, 'RunnerInstanceType', {
      description: 'EC2 instance type of Drone Docker Runner agents',
      default: config.runner.instanceType,
      minLength: 2,
      type: 'String',
    });

    /** @readonly */
    this.DatabaseUsername = new cdk.CfnParameter(scope, 'DatabaseUsername', {
      description: 'Database username used by Drone server agents',
      default: config.database.username,
      minLength: 10,
      type: 'String',
    });

    /** @readonly */
    this.DatabasePassword = new cdk.CfnParameter(scope, 'DatabasePassword', {
      description: 'Database password used by Drone server agents',
      default: config.database.password,
      minLength: 10,
      type: 'String',
      noEcho: true,
    });

    /** @readonly */
    this.DatabaseSecret = new cdk.CfnParameter(scope, 'DatabaseSecret', {
      constraintDescription: 'You can generate a random token with executing "openssl rand -hex 16" in your terminal',
      description: 'Database secret used by Drone server agents to encrypt Drone secrets (DRONE_DATABASE_SECRET)',
      default: config.database.secret,
      minLength: 16,
      type: 'String',
      noEcho: true,
    });

    /** @readonly */
    this.RunnerContainer = new cdk.CfnParameter(scope, 'RunnerContainer', {
      description: 'Drone docker runner container name and version used',
      default: config.runner.container,
      type: 'String',
    });

    /** @readonly */
    this.RunnerMaxCapacity = new cdk.CfnParameter(scope, 'RunnerMaxCapacity', {
      description: 'Drone docker runner service auto-scaler limit',
      default: config.runner.maxCapacity,
      type: 'Number',
      minValue: 2,
    });

    /** @readonly */
    this.RunnerJobCapacity = new cdk.CfnParameter(scope, 'RunnerJobCapacity', {
      description: 'Max number of build jobs a single runner container accepts (DRONE_RUNNER_CAPACITY)',
      default: config.runner.jobCapacity,
      type: 'Number',
      minValue: 2,
    });

    /** @readonly */
    this.ServerContainer = new cdk.CfnParameter(scope, 'ServerContainer', {
      description: 'Drone server container name and version used',
      default: config.server.container,
      type: 'String',
    });

    /** @readonly */
    this.ServerRpcSecret = new cdk.CfnParameter(scope, 'ServerRpcSecret', {
      constraintDescription: 'You can generate a random token with executing "openssl rand -hex 16" in your terminal',
      description: 'Drone shared RPC secret used across all runners and servers (DRONE_RPC_SECRET)',
      default: config.server.rpcSecret,
      minLength: 16,
      type: 'String',
      noEcho: true,
    });

    /** @readonly */
    this.ServerRepoFilter = new cdk.CfnParameter(scope, 'ServerRepoFilter', {
      description: 'Drone repository filter (DRONE_REPOSITORY_FILTER)',
      default: config.server.repoFilter,
      type: 'String',
    });

    /** @readonly */
    this.ServerMaxCapacity = new cdk.CfnParameter(scope, 'ServerMaxCapacity', {
      description: 'Drone server service auto-scaler limit',
      default: config.server.maxCapacity,
      type: 'Number',
      minValue: 2,
    });

    /** @readonly */
    this.ServerCookieSecret = new cdk.CfnParameter(scope, 'ServerCookieSecret', {
      constraintDescription: 'You can generate a random token with executing "openssl rand -hex 16" in your terminal',
      description: 'Drone server secret key used to sign authentication cookies (DRONE_COOKIE_SECRET)',
      default: config.server.cookieSecret,
      minLength: 16,
      type: 'String',
      noEcho: true,
    });

    /** @readonly */
    this.ServerAdmin = new cdk.CfnParameter(scope, 'ServerAdmin', {
      constraintDescription: 'Without this, you will not have an admin user and cannot make trusted builds',
      description: 'Drone server admin user (created only during the initial deploy - DRONE_USER_CREATE)',
      default: config.server.admin,
      minLength: 2,
      type: 'String',
    });

    /** @readonly */
    this.GithubServer = new cdk.CfnParameter(scope, 'GithubServer', {
      description: 'Github server used. Change this if using Github enterprise',
      default: config.github.server,
      type: 'String',
    });

    /** @readonly */
    this.GithubClientId = new cdk.CfnParameter(scope, 'GithubClientId', {
      constraintDescription: 'You can obtain this here: https://github.com/settings/apps',
      description: 'Github app OAuth clientId (DRONE_GITHUB_CLIENT_ID)',
      default: config.github.clientId,
      type: 'String',
      minLength: 2,
      noEcho: true,
    });

    /** @readonly */
    this.GithubClientSecret = new cdk.CfnParameter(scope, 'GithubClientSecret (DRONE_GITHUB_CLIENT_SECRET)', {
      constraintDescription: 'You can obtain this here: https://github.com/settings/apps',
      description: 'Github app OAuth clientSecret',
      default: config.github.clientSecret,
      type: 'String',
      minLength: 2,
      noEcho: true,
    });

    /** @readonly */
    this.CacheCleanerRate = new cdk.CfnParameter(scope, 'CacheCleanerRate', {
      description: 'The rate at which the cache cleaner runs (CloudWatch rate expression)',
      default: config.cache.cleanerRate,
      type: 'String',
    });

    /** @readonly */
    this.CacheTTLInDays = new cdk.CfnParameter(scope, 'CacheTTLInDays', {
      description: 'Cache files older than this number of days are deleted at "CacheCleanerRate" intervals',
      default: config.cache.ttlInDays,
      type: 'Number',
      minValue: 1,
    });
  }
}

module.exports = { Parameters };
