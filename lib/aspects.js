'use strict';

const _ = require('lodash');
const cdk = require('@aws-cdk/core');

const assert = require('assert');

/**
 * A CDK Aspect that runs the supplied observer function over all the nodes matching the supplied predicate.
 * At the time of writing this, CDK does not support findByType currently
 */
class ObserveConstructsWithPredicate {
  constructor(predicate = _.stubFalse, observer = _.noop) {
    this._predicate = predicate;
    this._observer = observer;
    this.visit = node => (this._predicate(node) ? this._observer(node) : undefined);
  }
}

/**
 * A CDK Aspect that removes node when passed predicate return true
 * At the time of writing this, CDK does not support removing nodes
 */
class RemoveConstructsWithPredicate extends ObserveConstructsWithPredicate {
  constructor(predicate = () => false) {
    super(predicate, node => {
      const pathComponents = node.node.path.split(cdk.ConstructNode.PATH_SEP);
      assert.ok(pathComponents.length >= 2, 'invalid construct path found');
      assert.ok(pathComponents.shift() === node.stack.stackName);
      const connector = '.node._children.';
      eval(`delete node.stack${connector}${pathComponents.join(connector)}`);
    });
  }
}

module.exports = { RemoveConstructsWithPredicate, ObserveConstructsWithPredicate };
