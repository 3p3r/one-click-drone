'use strict';

const _ = require('lodash');
const rc = require('rc');
const debug = require('debug')('ocd:config');
const { default: boolean } = require('boolean');

// set NODE_ENV to "production" to enable optimizations
const DEBUG = !_.get(process, 'env.NODE_ENV', 'dev')
  .toLowerCase()
  .startsWith('p');

const defaultConfig = {
  opts: {
    debug: DEBUG,
    stack: {
      name: 'OneClickDroneStack',
    },
  },
};

const userConfig = rc('ks', defaultConfig);
// type corrections go here (everything overridden from command line is a string)
userConfig.opts.debug = boolean(userConfig.opts.debug);
// we do this to preserve the type for vscode ('rc' module has a broken d.ts)
const typedConfig = _.assign({}, defaultConfig, userConfig);

debug('options: %o', typedConfig);
const config = typedConfig.opts;
module.exports = { config };
