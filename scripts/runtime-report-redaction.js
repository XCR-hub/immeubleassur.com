import { basename } from "node:path";

export function redactLocalPaths(value) {
  return String(value || "")
    .replace(/[A-Za-z]:[\\/][^\r\n]*/g, "[local-path]")
    .replace(/\\\\[^\\\r\n]+\\[^\r\n]*/g, "[network-path]");
}

export function reportFileName(value) {
  return basename(String(value || ""));
}