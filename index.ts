#!/usr/bin/env bun

import { $ } from "bun";
import chalk from "chalk";
import { glob } from "glob";
import { basename, dirname, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    absolute: {
      type: "boolean",
    },
    compact: {
      type: "boolean",
    },
  },
  strict: true,
  allowPositionals: true,
});

const cwd = (await $`pwd`.text()).split("\n").filter(Boolean).pop();
const paths = [...(positionals.length ? positionals : [cwd])].map((x) =>
  resolve(x!)
);

const projects = new Set<string>();

for (const path of paths) {
  const gitDirs = await glob("**/.git", {
    ignore: "node_modules/**",
    cwd: path,
    absolute: true,
  });

  gitDirs.forEach((d) => projects.add(d));
}

console.log(
  `Checking ${projects.size} projects in ${paths
    .map((x) => formatPath(x))
    .join(", ")}`
);

const uncommittedDirs: {
  path: string;
  changes: { type: string; path: string }[];
  commits: number;
}[] = [];

for (const dir of projects) {
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

    const unpushedCommitCount = Number(
      await shell`git rev-list --count @{u}..HEAD`.text()
    );

    if (unpushedCommitCount > 0 || paths.length) {
      uncommittedDirs.push({
        path: baseDir,
        changes: paths,
        commits: unpushedCommitCount,
      });
    }
  } catch (e) {}
}

console.log(`Found ${uncommittedDirs.length} dirty projects:`);
for (const project of uncommittedDirs) {
  if (values.compact) {
    console.log(
      `${chalk.bold(formatPath(project.path))}`,
      `(${project.commits})`,
      `[${project.changes.map((x) => x.type).join("")}]`
    );
  } else {
    console.log("");
    console.log(`${chalk.bold(formatPath(project.path))}`);
    console.log(
      chalk.italic(`  uncommitted changes:`),
      `${chalk.bold(project.changes.length)}`,
      `(${project.changes.map((x) => x.type).join("")})`
    );
    console.log(
      chalk.italic(`  unpushed commits:`),
      `${chalk.bold(project.commits)}`
    );
  }
}

function formatPath(p: string) {
  if (!values.absolute) {
    const path = relative(cwd, p);
    return path.length ? path : `./ (${basename(p)})`;
  }
  return p;
}
