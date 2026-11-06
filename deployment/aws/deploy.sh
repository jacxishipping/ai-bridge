#!/usr/bin/env bash
# ==============================================================================
#  AI Bridge — AWS CloudFormation Deployment Script
# ==============================================================================
#  Guided deployment of the full AI Bridge production stack on AWS.
#  Run this from the deployment/aws/ directory.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log_info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# --- Gather inputs -----------------------------------------------------------
read -rp "AWS Region [us-east-2]: " AWS_REGION; AWS_REGION="${AWS_REGION:-us-east-2}"
read -rp "CloudFormation stack name [ai-bridge-prod]: " STACK_NAME; STACK_NAME="${STACK_NAME:-ai-bridge-prod}"
read -rp "Domain name (e.g. app.mydomain.com): " DOMAIN
read -rp "Route53 Hosted Zone ID: " HOSTED_ZONE_ID
read -rp "ACM Certificate ARN: " ACM_ARN
read -rp "EC2 KeyPair name: " SSH_KEY_NAME
read -rp "VPC ID: " VPC_ID
read -rp "Subnet IDs (comma-separated, at least 2): " SUBNET_IDS
read -rsp "Admin token (leave blank to auto-generate): " ADMIN_TOKEN_INPUT; echo
ADMIN_TOKEN="${ADMIN_TOKEN_INPUT:-$(openssl rand -hex 32)}"

# --- Validate ----------------------------------------------------------------
if [ -z "$DOMAIN" ] || [ -z "$HOSTED_ZONE_ID" ] || [ -z "$ACM_ARN" ] || [ -z "$SSH_KEY_NAME" ] || [ -z "$VPC_ID" ] || [ -z "$SUBNET_IDS" ]; then
    log_err "Missing required inputs."
    exit 1
fi

# --- Store secrets in SSM ----------------------------------------------------
log_info "Storing secrets in AWS SSM Parameter Store..."
for param in db-password redis-password secret-key; do
    existing=$(aws ssm get-parameter --name "/ai-bridge/$STACK_NAME/$param" --region "$AWS_REGION" --query Parameter.Value --output text 2>/dev/null || true)
    if [ -n "$existing" ]; then
        log_info "  /ai-bridge/$STACK_NAME/$param already exists, skipping."
    else
        value=$(openssl rand -hex 20)
        [ "$param" = "secret-key" ] && value=$(openssl rand -hex 32)
        aws ssm put-parameter --name "/ai-bridge/$STACK_NAME/$param" \
            --value "$value" --type SecureString --region "$AWS_REGION" >/dev/null
        log_ok "  Created /ai-bridge/$STACK_NAME/$param"
    fi
done

# --- Deploy CloudFormation ---------------------------------------------------
log_info "Deploying CloudFormation stack '$STACK_NAME'..."
aws cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file cloudformation.yml \
    --parameter-overrides \
        DomainName="$DOMAIN" \
        HostedZoneId="$HOSTED_ZONE_ID" \
        AcmCertificateArn="$ACM_ARN" \
        SshKeyName="$SSH_KEY_NAME" \
        AdminToken="$ADMIN_TOKEN" \
        VpcId="$VPC_ID" \
        SubnetIds="$SUBNET_IDS" \
    --capabilities CAPABILITY_IAM \
    --region "$AWS_REGION" \
    --no-fail-on-empty-changeset

log_ok "Stack deployment initiated. Monitor with:"
echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION --query \"Stacks[0].StackStatus\""
echo ""
echo "Outputs (after completion):"
echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION --query \"Stacks[0].Outputs\""
