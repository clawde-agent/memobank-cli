#!/bin/bash
# GitHub Labels Setup Script
# Run: bash .github/labels.sh

set -e

REPO="clawde-agent/memobank-cli"

# Define labels in JSON format
labels=(
  # Issue Types
  '{"name":"bug","color":"d73a4a","description":"Something isn'\''t working"}'
  '{"name":"enhancement","color":"a2eeef","description":"New feature or request"}'
  '{"name":"documentation","color":"0075ca","description":"Improvements or additions to documentation"}'
  '{"name":"question","color":"d876e3","description":"Further information is requested"}'
  
  # Priority
  '{"name":"priority:critical","color":"b60205","description":"Highest priority - blocks release"}'
  '{"name":"priority:high","color":"d93f0b","description":"High priority issue"}'
  '{"name":"priority:medium","color":"fbca04","description":"Medium priority issue"}'
  '{"name":"priority:low","color":"0e8a16","description":"Low priority issue"}'
  
  # Contribution
  '{"name":"good first issue","color":"7057ff","description":"Good for newcomers"}'
  '{"name":"help wanted","color":"008672","description":"Extra attention is needed"}'
  
  # Memobank Specific
  '{"name":"memory","color":"fbca04","description":"Memory-related issues"}'
  '{"name":"self-improving","color":"c2e0c6","description":"Self-improvement features"}'
  '{"name":"cli","color":"5319e7","description":"CLI-related issues"}'
  '{"name":"integration","color":"1d76db","description":"Platform integrations"}'
  
  # Status
  '{"name":"in progress","color":"0052cc","description":"Currently being worked on"}'
  '{"name":"needs review","color":"c5def5","description":"Ready for review"}'
  '{"name":"blocked","color":"e11d21","description":"Blocked by another issue"}'
  
  # Dependencies
  '{"name":"dependencies","color":"0366d6","description":"Pull requests that update a dependency file"}'
  '{"name":"npm","color":"cb3837","description":"npm-related changes"}'
  '{"name":"github-actions","color":"2088bb","description":"GitHub Actions workflow changes"}'
  
  # Won't Do
  '{"name":"wontfix","color":"ffffff","description":"This will not be worked on"}'
  '{"name":"duplicate","color":"d93f0b","description":"This issue or pull request already exists"}'
  '{"name":"invalid","color":"e4e669","description":"This doesn'\''t seem right"}'
)

echo "Setting up labels for $REPO..."

for label in "${labels[@]}"; do
  echo "Creating label: $label"
  gh api --method POST /repos/$REPO/labels --input <(echo "$label") 2>/dev/null || echo "  (may already exist)"
done

echo ""
echo "✅ Labels setup complete!"
echo "View labels at: https://github.com/$REPO/labels"
