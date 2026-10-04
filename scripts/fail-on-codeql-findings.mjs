import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const resultsDirectory = process.argv[2];

if (!resultsDirectory) {
  throw new Error("Usage: node scripts/fail-on-codeql-findings.mjs <results-directory>");
}

async function sarifFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? sarifFiles(path)
        : extname(entry.name) === ".sarif"
          ? [path]
          : [];
    }),
  );
  return nested.flat();
}

const files = await sarifFiles(resultsDirectory);

if (files.length === 0) {
  throw new Error(`CodeQL produced no SARIF files in ${resultsDirectory}`);
}

let findingCount = 0;
for (const file of files) {
  const sarif = JSON.parse(await readFile(file, "utf8"));
  for (const run of sarif.runs ?? []) {
    findingCount += run.results?.length ?? 0;
  }
}

if (findingCount > 0) {
  throw new Error(`CodeQL reported ${findingCount} finding(s); review is required before merge.`);
}

console.log("CodeQL reported no findings.");
