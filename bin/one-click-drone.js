#!/usr/bin/env node

'use strict';

const cdk = require('@aws-cdk/core');
const debug = require('debug')('ocd:one-click-drone');

const { Stack } = require('../lib/stack');
const { config } = require('../lib/config');

debug('creating a new CDK app');
const app = new cdk.App();

debug('instantiating the main stack');
new Stack(app, config.stack.name, {
  description: config.stack.description,
});

if (config.debug) {
  debug('synthesizing in-code for debugging purposes');
  app.synth();
}
