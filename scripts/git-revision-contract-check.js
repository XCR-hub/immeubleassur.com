import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readGitRevision } from "./git-revision.js";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-git-revision-"));
const a = "a".repeat(40);
const b = "b".repeat(40);
const c = "c".repeat(40);
const checks = [];
try {
  const detached = join(root, "detached"); mkdirSync(join(detached, ".git"), { recursive: true }); writeFileSync(join(detached, ".git", "HEAD"), a);
  checks.push(["detached-head", readGitRevision(detached) === a]);

  const loose = join(root, "loose"); mkdirSync(join(loose, ".git", "refs", "heads"), { recursive: true }); writeFileSync(join(loose, ".git", "HEAD"), "ref: refs/heads/main\n"); writeFileSync(join(loose, ".git", "refs", "heads", "main"), b);
  checks.push(["loose-reference", readGitRevision(loose) === b]);

  const packed = join(root, "packed"); mkdirSync(join(packed, ".git"), { recursive: true }); writeFileSync(join(packed, ".git", "HEAD"), "ref: refs/heads/main\n"); writeFileSync(join(packed, ".git", "packed-refs"), `# pack-refs\n${c} refs/heads/main\n^${a}\n`);
  checks.push(["packed-reference", readGitRevision(packed) === c]);

  const worktree = join(root, "worktree"); const worktreeGit = join(root, "main.git", "worktrees", "child"); const common = join(root, "main.git");
  mkdirSync(worktree, { recursive: true }); mkdirSync(worktreeGit, { recursive: true });
  writeFileSync(join(worktree, ".git"), `gitdir: ${worktreeGit}\n`); writeFileSync(join(worktreeGit, "HEAD"), "ref: refs/heads/child\n"); writeFileSync(join(worktreeGit, "commondir"), "../..\n"); writeFileSync(join(common, "packed-refs"), `${b} refs/heads/child\n`);
  checks.push(["worktree-common-packed-reference", readGitRevision(worktree) === b]);

  const unsafe = join(root, "unsafe"); mkdirSync(join(unsafe, ".git"), { recursive: true }); writeFileSync(join(unsafe, ".git", "HEAD"), "ref: ../outside\n");
  checks.push(["unsafe-reference-rejected", readGitRevision(unsafe) === ""]);
} finally { rmSync(root, { recursive: true, force: true }); }
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Git revision contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }

