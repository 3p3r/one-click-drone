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

module.exports = { config };
