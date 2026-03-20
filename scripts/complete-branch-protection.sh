#!/bin/bash
# Complete Branch Protection Setup for memobank-cli

set -e

REPO="clawde-agent/memobank-cli"
MAIN_BRANCH="main"

echo "🛡️  Completing branch protection configuration for $REPO..."
echo ""

# Get repository ID
REPO_ID=$(gh api graphql -F owner='clawde-agent' -F name='memobank-cli' -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
    }
  }
' --jq '.data.repository.id')

echo "✓ Repository ID: $REPO_ID"

# Get the branch protection rule ID
RULE_ID=$(gh api graphql -F repositoryId="$REPO_ID" -f query='
  query GetBranchProtectionRule($repositoryId: ID!) {
    node(id: $repositoryId) {
      ... on Repository {
        branchProtectionRules(first: 1, pattern: "main") {
          nodes {
            id
          }
        }
      }
    }
  }
' --jq '.data.node.branchProtectionRules.nodes[0].id')

echo "✓ Branch Protection Rule ID: $RULE_ID"
echo ""

# Update with PR review requirements
echo "📝 Configuring pull request review requirements..."
gh api graphql -f ruleId="$RULE_ID" -f query='
  mutation UpdateBranchProtectionRule($ruleId: ID!) {
    updateBranchProtectionRule(input: {
      branchProtectionRuleId: $ruleId
      requiredApprovingReviewCount: 1
      dismissesStaleReviews: true
      requiresConversationResolution: true
      requiresCommitSignatures: false
    }) {
      branchProtectionRule {
        id
        requiredApprovingReviewCount
        dismissesStaleReviews
      }
    }
  }
'

echo "✓ PR review requirements configured"
echo ""

# Update with status check requirements
echo "📝 Configuring status check requirements..."
gh api graphql -f ruleId="$RULE_ID" -f query='
  mutation UpdateBranchProtectionRuleStatusChecks($ruleId: ID!) {
    updateBranchProtectionRule(input: {
      branchProtectionRuleId: $ruleId
      requiresStrictStatusChecks: true
      requiredStatusCheckContexts: ["test (18.x)", "test (20.x)", "test (22.x)", "publish-dry-run"]
    }) {
      branchProtectionRule {
        id
        requiresStrictStatusChecks
        requiredStatusCheckContexts
      }
    }
  }
'

echo "✓ Status check requirements configured"
echo ""

# Final verification
echo "🔍 Verifying final configuration..."
echo ""
gh api /repos/clawde-agent/memobank-cli/branches/main/protection | jq '{
  branch: .protection_url,
  enforce_admins: .enforce_admins.enabled,
  required_conversation_resolution: .required_conversation_resolution.enabled,
  required_pull_request_reviews: .required_pull_request_reviews,
  required_status_checks: .required_status_checks
}'

echo ""
echo "✅ Branch protection setup complete!"
