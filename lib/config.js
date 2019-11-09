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
      username: '',
      password: '',
      secret: 'change-this-secret',
    },
    // Runners are Drone Docker runner containers, running in EC2 backed ECS container instances
    // Since we are not using Drone's auto-scaler and instead opt in ECS' internal auto scaler, make sure the number you
    // set for "jobCapacity", puts the instance at above 90% cpu usage, otherwise you won't have scaling and your build
    // queues will go up instead!
    runner: {
      container: 'drone/drone-runner-docker:latest',
      instanceType: 't2.micro', // runner EC2 instance type
      jobCapacity: 10, // max number of build jobs per runner
      maxCapacity: 5, // max number of runners per deployment
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
      ttlInDays: 7,
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

module.exports = { config };
