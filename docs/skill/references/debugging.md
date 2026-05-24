# Debugging memobank-cli

## capture --auto finds no sessions

**Symptom**: `memo capture --auto` prints "No new sessions to capture"

**Check 1 — transcript directory**

```bash
node -e "
const {getTranscriptDir} = require('./dist/core/transcript-parser');
const dir = getTranscriptDir(process.cwd());
console.log('Looking in:', dir);
const fs = require('fs');
console.log('Exists:', fs.existsSync(dir));
if (fs.existsSync(dir)) console.log('Files:', fs.readdirSync(dir).slice(0,5));
"
```

On Windows the expected path is `~/.claude/projects/D--Repo-<project-name>/`.  
If the directory is wrong, `deriveProjectId` may be miscalculated — see `src/core/transcript-parser.ts:16`.

**Check 2 — cursor file**

All sessions may already be marked processed:

```bash
cat .memobank/meta/capture-cursor.json
```

Reset to reprocess: `echo '{"processedSessions":[]}' > .memobank/meta/capture-cursor.json`

**Check 3 — LLM provider**

If capture runs but produces only checkpoint memories (not semantic lessons), no LLM is configured:

```bash
cat .memobank/meta/config.yaml | grep -A4 "capture:"
```

Add a `capture` section pointing to a chat model (not an embedding model).

---

## recall returns empty or wrong results

**Check index exists**:

```bash
ls .memobank/meta/
# text engine: no index file needed
# lancedb: expects code-index.db or lancedb/ directory
```

**Check memory files exist**:

```bash
ls .memobank/lesson/ .memobank/decision/ .memobank/workflow/ .memobank/architecture/ 2>/dev/null
```

**Run search directly** (bypasses MEMORY.md write):

```bash
npx ts-node src/cli.ts search "your query" --format json
```

---

## process-queue writes nothing

Check pending queue is not empty AND entries have correct projectId:

```bash
ls .memobank/.pending/ 2>/dev/null
# If empty: capture never ran or all sessions already processed
cat .memobank/.pending/*.json 2>/dev/null | node -e "
  const d=require('fs').readFileSync('/dev/stdin','utf8').split('\n').filter(Boolean);
  d.forEach(l=>{ const j=JSON.parse(l); console.log('projectId:', j.projectId); });
"
```

ProjectId mismatch causes entries to be deleted silently. Expected value:

```bash
node -e "const {resolveProjectId}=require('./dist/core/store');console.log(resolveProjectId(process.cwd()))"
```

---

## index-code fails / extracts 0 symbols

tree-sitter is an optional dependency. Check:

```bash
node -e "require('tree-sitter')" 2>&1
# Error = not installed → run: npm install --include=optional
```

If tree-sitter is installed but extraction returns 0 symbols, run with verbose output:

```bash
npx ts-node src/cli.ts index-code --force 2>&1 | head -30
```
