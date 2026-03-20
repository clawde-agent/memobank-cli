#!/bin/bash
# Setup Branch Protection Rules for memobank-cli using GraphQL
# Requires: gh CLI with admin permissions

set -e

REPO="clawde-agent/memobank-cli"
MAIN_BRANCH="main"

echo "🛡️  Setting up branch protection for $REPO..."
echo ""

# Check if gh is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not authenticated with gh CLI"
    echo "Run: gh auth login"
    exit 1
fi

# Check admin permissions
PERMISSION=$(gh repo view $REPO --json viewerPermission -q '.viewerPermission')
if [[ "$PERMISSION" != "ADMIN" ]]; then
    echo "❌ Error: You need ADMIN permissions to set branch protection rules"
    echo "Current permission: $PERMISSION"
    exit 1
fi

echo "✓ Authenticated as $(gh api user --jq .login)"
echo "✓ Admin permission confirmed"
echo ""

# Step 1: Create main branch from master if it doesn't exist
echo "📋 Checking if 'main' branch exists..."
if ! git ls-remote --heads origin main | grep -q 'refs/heads/main'; then
    echo "Creating 'main' branch from 'master'..."
    git checkout master
    git checkout -b main
    git push -u origin main
    echo "✓ Created 'main' branch"
else
    echo "✓ 'main' branch already exists"
    # Also push any local changes to main
    git push -u origin main
fi
echo ""

# Step 2: Set main as default branch
echo "🔄 Setting 'main' as default branch..."
gh api -X PATCH "/repos/$REPO" -f default_branch=main > /dev/null
echo "✓ Default branch set to 'main'"
echo ""

# Step 3: Get repository ID for GraphQL
echo "🔍 Getting repository ID..."
REPO_ID=$(gh api graphql -F owner='clawde-agent' -F name='memobank-cli' -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
    }
  }
' --jq '.data.repository.id')

echo "✓ Repository ID: $REPO_ID"
echo ""

# Step 4: Configure branch protection using GraphQL
echo "🔒 Configuring branch protection rules for 'main'..."

gh api graphql -f repositoryId="$REPO_ID" -f query='
  mutation CreateBranchProtectionRule($repositoryId: ID!) {
    createBranchProtectionRule(input: {
      repositoryId: $repositoryId
      pattern: "main"
      requiresStrictStatusChecks: true
      requiredStatusCheckContexts: ["test (18.x)", "test (20.x)", "test (22.x)", "publish-dry-run"]
      isAdminEnforced: true
      requiredApprovingReviewCount: 1
      dismissesStaleReviews: true
      requiresConversationResolution: true
      blocksCreations: false
      allowsDeletions: false
      allowsForcePushes: false
      lockBranch: false
    }) {
      branchProtectionRule {
        id
        pattern
        isAdminEnforced
        requiredApprovingReviewCount
        requiresConversationResolution
      }
    }
  }
'

echo "✓ Branch protection rules configured for 'main'"
echo ""

# Summary
echo "✅ Branch protection setup complete!"
echo ""
echo "📋 Summary:"
echo "   • Default branch: main"
echo "   • Protection enabled: true"
echo "   • Required approvals: 1"
echo "   • Status checks required: test (18.x, 20.x, 22.x), publish-dry-run"
echo "   • Admin enforcement: enabled"
echo "   • Conversation resolution: required"
echo ""
echo "🔧 Next steps:"
echo "   1. Push CODEOWNERS file if not already pushed"
echo "   2. Create @clawde-agent/maintainers team on GitHub (if using organization)"
echo "   3. Add maintainers to the team"
echo ""
echo "📖 View protection rules: gh api /repos/$REPO/branches/main/protection"
echo ""
