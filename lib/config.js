'use strict';

const _ = require('lodash');
const rc = require('@rootstream/rc-typed');
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
      username: 'DroneDBUser',
      password: 'DroneDBPass',
      secret: 'change-this-secret',
    },
    // Runners are Drone Docker runner containers, running in EC2 backed ECS container instances
    // Since we are not using Drone's auto-scaler and instead opt in ECS' internal auto scaler, make sure the number you
    // set for "jobCapacity", puts the instance at above 90% cpu usage, otherwise you won't have scaling and your build
    // queues will go up instead!
    runner: {
      container: 'drone/drone-runner-docker:1',
      instanceType: 't2.micro', // runner EC2 instance type
      jobCapacity: 10, // max number of build jobs per runner
      maxCapacity: 5, // max number of runners per deployment
      sshKey: '', // SSH key name used for runner instances debugging
      ami: '', // AMI used for runner agents. Leave empty for Amazon Linux AMI
    },
    server: {
      container: 'drone/drone:1',
      repoFilter: '',
      rpcSecret: 'change-this-secret',
      maxCapacity: 2,
      cookieSecret: 'change-this-secret',
      admin: 'octocat',
      domain: '',
    },
    cache: {
      enabled: false, // if set to "false", no EFS cache is created
      cleanerRate: '1 day', // run cleaner everyday
      ttlInDays: 30, // remove files older than a month
    },
    github: {
      server: 'https://github.com',
      clientId: 'get this from https://github.com/settings/apps !',
      clientSecret: 'get this from https://github.com/settings/apps !',
    },
  },
};

const userConfig = rc('ocd', defaultConfig);
debug('options: %o', userConfig);
const config = userConfig.opts;

module.exports = { config };
