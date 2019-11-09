'use strict';

const cdk = require('@aws-cdk/core');
const assert = require('assert');

/**
 * A CDK Aspect that removes node when passed predicate return true
 * At the time of writing this, CDK does not support removing nodes
 */
module.exports = { RemoveConstructsWithPredicate };
class RemoveConstructsWithPredicate {
  constructor(predicate = () => false) {
    this._predicate = predicate;
  }
  visit(node) {
    if (this._predicate(node)) {
      const pathComponents = node.node.path.split(cdk.ConstructNode.PATH_SEP);
      assert.ok(pathComponents.length >= 2, 'invalid construct path found');
      assert.ok(pathComponents.shift() === node.stack.stackName);
      const connector = '.node._children.';
      eval(`delete node.stack${connector}${pathComponents.join(connector)}`);
    }
  }
}
