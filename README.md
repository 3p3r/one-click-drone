# one-click-drone

one click deploy of [Drone CI](https://drone.io/) into your AWS account with Fargate, CloudFront, RDS, and CloudWatch.

this project was made out of my personal frustration with people's crappy Drone CI setups, half-assed entirely useless
Medium articles and broken CloudFormation scripts all around the Internet. It seems like nobody wants to put down the
time to properly set up a CI installation for their projects. Either that, or nobody bothers open sourcing it!

## usage

this project uses AWS CDK. make sure your environment is set up
[accordingly](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html).

```bash
npm install
# skip this step if you have already bootstrapped CDK for your account
npx cdk bootstrap
# to deploy to your AWS account
npm run deploy
```

## roadmap

- [x] ~~A basic publicly accessible Drone setup (MVP)~~
- [x] ~~Figure out API Gateway issues with Drone's homepage~~
- [x] ~~Add CloudFront and enable HTTPS access to the server instance~~
- [x] ~~Investigate compatibility with serverless Aurora~~
- [x] ~~Add a PostgreSQL database to the server fleet in Fargate~~
- [x] ~~Investigate and R&D into how we can add a permanent shared volume to runners~~
- [x] ~~Rework the CDK script to have all the names following cfn conventions (CamelCased)~~
- [x] ~~Use Drone's capability to upload logs into a private S3 bucket instead of the database~~
- [x] ~~Add an ECS task that cleans up the EFS cache once in a while to reduce costs~~
- [x] ~~Use Drone's internal health check (/healthz) in task definitions~~
- [ ] Revamp and review security and put Drone behind a private API Gateway integration
- [ ] Configure dependabot to submit PRs when Drone agent and server images update
- [ ] Document how different parameters are configured
- [ ] Filter out CDK metadata constructs and generate a one-click deployable CFN yaml
- [ ] Write CDK unit tests for all the resources deployed
- [ ] Write integration tests and R&D how we can do continuos integration testing with CDK
- [ ] Put Github OAuth and other sensitive parameters in SSM and read it from SSM for security
- [ ] Automate custom domain creation in the wrapper CloudFront distribution
