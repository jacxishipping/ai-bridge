# AI Bridge — AWS Deployment

Deploy the AI Bridge production stack on AWS with CloudFormation.

## Architecture

```
Route53 ──► ALB (HTTPS) ──► EC2 Auto Scaling ──► RDS PostgreSQL
                                │                       │
                                ├── ElastiCache Redis   │
                                └── EFS (shared data)   │
                                                        │
                          ┌─────────────────────────────┘
                          ▼
                    Docker Compose (control-api, mcp-http, oauth-gateway, nginx, coturn)
```

## Prerequisites

1. **AWS CLI** installed and configured (`aws configure`)
2. **Domain** in Route53 with a public hosted zone
3. **ACM certificate** in `us-east-1` (or your target region) for the domain
4. **EC2 Key Pair** for SSH access
5. **SSM Parameters** for secrets (created automatically by the deploy script)

## Quick Start

```bash
# 1. Set required variables
export AWS_REGION=us-east-2
export STACK_NAME=ai-bridge-prod
export DOMAIN=app.mydomain.com
export HOSTED_ZONE_ID=Z1234567890
export ACM_ARN=arn:aws:acm:us-east-1:1234567890:certificate/xxxx
export SSH_KEY_NAME=my-key-pair
export ADMIN_TOKEN=$(openssl rand -hex 32)
export VPC_ID=vpc-xxxxx
export SUBNET_IDS="subnet-xxxx,subnet-yyyy"

# 2. Store secrets in SSM Parameter Store
aws ssm put-parameter --name "/ai-bridge/$STACK_NAME/db-password" \
  --value "$(openssl rand -hex 20)" --type SecureString --region $AWS_REGION
aws ssm put-parameter --name "/ai-bridge/$STACK_NAME/redis-password" \
  --value "$(openssl rand -hex 20)" --type SecureString --region $AWS_REGION
aws ssm put-parameter --name "/ai-bridge/$STACK_NAME/secret-key" \
  --value "$(openssl rand -hex 32)" --type SecureString --region $AWS_REGION

# 3. Deploy CloudFormation
aws cloudformation create-stack \
  --stack-name $STACK_NAME \
  --template-body file://cloudformation.yml \
  --parameters \
    ParameterKey=DomainName,ParameterValue=$DOMAIN \
    ParameterKey=HostedZoneId,ParameterValue=$HOSTED_ZONE_ID \
    ParameterKey=AcmCertificateArn,ParameterValue=$ACM_ARN \
    ParameterKey=SshKeyName,ParameterValue=$SSH_KEY_NAME \
    ParameterKey=AdminToken,ParameterValue=$ADMIN_TOKEN \
    ParameterKey=VpcId,ParameterValue=$VPC_ID \
    ParameterKey=SubnetIds,ParameterValue=\"$SUBNET_IDS\" \
  --capabilities CAPABILITY_IAM \
  --region $AWS_REGION

# 4. Monitor progress
aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION \
  --query "Stacks[0].StackStatus"
```

## Deploy Script

Use the included `deploy.sh` for a guided deployment:

```bash
chmod +x deploy.sh
./deploy.sh
```

## Updating the Application

After the stack is deployed, use the deploy script to update the application code:

```bash
# SSH-based update
export AI_BRIDGE_SSH_KEY=~/.ssh/aws-key.pem
export AI_BRIDGE_SSH_HOST=ubuntu@ec2-instance
python ../../deploy_to_aws.py

# Or via AWS SSM
export AI_BRIDGE_SSM_INSTANCE_ID=i-1234567890abcdef0
python ../../deploy_to_aws.py
```

## Architecture Decisions

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **EC2 over ECS** | Auto Scaling + Docker Compose | Simpler migration from existing Docker Compose setup; full control over networking (TURN/WebRTC) |
| **RDS over self-hosted** | Managed PostgreSQL | Automated backups, Multi-AZ failover, performance insights |
| **ElastiCache Redis** | Managed Redis | Automatic failover, monitoring, no maintenance overhead |
| **EFS** | Shared NFS filesystem | Persists workspace/data across instance replacements; multi-AZ access |
| **ALB** | Application Load Balancer | Native HTTPS termination, path-based routing, WebSocket support |
| **SSM over SSH** | AWS Systems Manager | No bastion host needed; IAM-based access control; audit logging |

## Security

- All data at rest encrypted (RDS, EFS, EBS, ElastiCache)
- Secrets stored in SSM Parameter Store (SecureString)
- Security groups follow least-privilege model
- ALB terminates TLS 1.2+ with modern ciphers
- EC2 instances have no public IPs (ALB-facing only)
- RDS has deletion protection enabled
- Backup retention: 7 days (RDS automated backups)
