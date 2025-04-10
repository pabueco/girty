import { $, Glob } from "bun";
import { trimEnd } from "es-toolkit";
import { glob } from "glob";
import { log } from "node:console";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    short: {
      type: "boolean",
    },
  },
  strict: true,
  allowPositionals: true,
});

const path = positionals[0] ?? __dirname;
const fullPath = resolve(path);

const gitDirs = await glob("**/.git", {
  ignore: "node_modules/**",
  cwd: path,
  absolute: true,
});

console.log(`Checking ${gitDirs.length} projects in ${fullPath}`);

const uncommittedDirs: {
  path: string;
  changes: { type: string; path: string }[];
}[] = [];

for (const dir of gitDirs) {
  const baseDir = dirname(dir);
  const shell = $.cwd(baseDir);

  try {
    const lines = await shell`git status --porcelain`.text();
    const paths = lines
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(" ").filter(Boolean))
      .map((x) => ({
        type: x[0]!.replace("??", "?"),
        path: x[1]!,
      }));

    if (paths.length) {
      uncommittedDirs.push({
        path: baseDir,
        changes: paths,
      });
    }
  } catch (e) {}
}

console.log(
  `Found ${uncommittedDirs.length} projects with uncommitted changes:`
);
for (const project of uncommittedDirs) {
  console.log(
    `- ${withoutBasePath(project.path)} (${
      project.changes.length
    }) [${project.changes.map((x) => x.type).join("")}]`
  );
}

function withoutBasePath(p: string) {
  return p.replace(trimEnd(fullPath, "/") + "/", "");
}
