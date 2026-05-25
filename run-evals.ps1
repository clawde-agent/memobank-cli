# Runs promptfoo evals using system Node.js, bypassing pi-node's broken npm.
# pi puts its own node.exe on PATH first, but its npm module is missing.
# This script uses C:\Program Files\nodejs\npx.cmd directly.

$npx = "C:\Program Files\nodejs\npx.cmd"
$config = "skills/memobank/evals/promptfooconfig.yaml"
$output = "skills/memobank/evals/output.json"

& $npx promptfoo@latest eval -c $config -o $output --no-cache --no-share @args
