'use strict';

const s3 = require('@aws-cdk/aws-s3');
const cdk = require('@aws-cdk/core');
const iam = require('@aws-cdk/aws-iam');

/**
 * Creates a private S3 bucket with an associated IAM user having access to it.
 * the associated IAM user is the only one having full S3 access to the bucket
 *
 * This is used by Drone Server agents to store build logs
 */
class IAMBucket extends cdk.Construct {
  constructor(scope, id = 'IAMBucket') {
    super(scope, id);

    // IAM user used by Drone (does not support IAM roles yet)
    const bucketUser = new iam.User(this, 'BucketUser');

    // Logs S3 bucket
    const bucket = new s3.Bucket(this, 'Bucket', {
      versioned: false,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.KMS_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // FIXME: Figure out what permissions Drone need and limit this
    const bucketResourcePolicy = new iam.PolicyStatement();
    bucketResourcePolicy.addResources(bucket.arnForObjects('*'), bucket.bucketArn);
    bucketResourcePolicy.addActions('s3:*');
    bucketResourcePolicy.effect = iam.Effect.ALLOW;
    bucketResourcePolicy.addArnPrincipal(bucketUser.userArn);
    bucket.addToResourcePolicy(bucketResourcePolicy);

    // Create a set of IAM credentials for Drone (does not support IAM roles yet)
    const bucketCredentials = new iam.CfnAccessKey(this, 'LogsBucketCredentials', {
      userName: bucketUser.userName,
    });

    this._bucket = bucket;
    this._iamAccessKey = bucketCredentials.ref;
    this._iamSecretKey = bucketCredentials.attrSecretAccessKey;
  }

  get bucketName() {
    return this._bucket.bucketName;
  }

  get accessKey() {
    return this._iamAccessKey;
  }

  get secretKey() {
    return this._iamSecretKey;
  }
}

module.exports = { IAMBucket };
