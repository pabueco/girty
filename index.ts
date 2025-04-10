#!/usr/bin/env bun

import { $ } from "bun";
import chalk from "chalk";
import { glob } from "glob";
import { stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { Command } from "@commander-js/extra-typings";
import pkg from "./package.json" assert { type: "json" };

const program = new Command()
  .name(pkg.name)
  .version(pkg.version)
  .option("-a, --absolute", "Display absolute paths")
  .option("-c, --compact", "Compact output")
  .argument("[paths...]", "Directories to check (recursively)")
  .parse(process.argv);

const options = program.opts();
const positionals = program.args;

const cwd = (await $`pwd`.text()).split("\n").filter(Boolean).pop() as string;
const paths = [...(positionals.length ? positionals : [cwd])].map((x) =>
  resolve(x!)
);
const projects = new Set<string>();

for (const path of paths) {
  if (!(await isDirectory(path))) {
    console.error(`\`${path}\` is not a directory`);
    process.exit(1);
  }

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
  if (options.compact) {
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
  if (!options.absolute) {
    const path = relative(cwd, p);
    return path.length
      ? path.startsWith(".")
        ? path
        : `./${path}`
      : `./ (${basename(p)})`;
  }
  return p;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch (err) {
    return false;
  }
}
