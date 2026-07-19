const DYNAMODB_REGION =
  process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-1";

const SES_REGION = process.env.SES_REGION || "us-east-1";

module.exports = { DYNAMODB_REGION, SES_REGION };
