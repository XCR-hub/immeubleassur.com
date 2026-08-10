import { readFileSync } from "node:fs";
const installer = readFileSync("scripts/install-local-sqlite-backup-task.ps1", "utf8");
const checks = [
  installer.includes("[int]$OffsetMinute = 8"),
  installer.includes("New-TimeSpan -Hours 6"),
  installer.includes("New-TimeSpan -Minutes 20"),
  installer.includes("MultipleInstances IgnoreNew"),
  installer.includes("-UserId 'SYSTEM'"),
  installer.includes("local-sqlite-backup-task.ps1")
];
if (checks.includes(false)) throw new Error(`SQLite backup schedule contract failed: ${checks.filter(Boolean).length}/${checks.length}`);
console.log(`SQLite backup schedule contract passed: ${checks.length}/${checks.length}.`);
