#!/usr/bin/env bun

import { $ } from "bun";
import chalk from "chalk";
import { glob } from "glob";
import { stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { Command } from "@commander-js/extra-typings";
import pkg from "./package.json" assert { type: "json" };

const SKIP_FETCH = true;

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

type Dir = {
  path: string;
  changes: { type: string; path: string }[];
  branches: {
    name: string;
    tracked: boolean;
    ahead: number;
    commits: string[];
  }[];
};

const dirtyDirs: Dir[] = [];

for (const dir of projects) {
  const baseDir = dirname(dir);
  const shell = $.cwd(baseDir);

  try {
    if (!SKIP_FETCH) {
      await shell`git fetch --all --quiet`;
    }

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

    const dir: Dir = {
      path: baseDir,
      changes: paths,
      branches: [],
    };

    const branchesState =
      await shell`git for-each-ref --format='%(refname:short) %(upstream:short) %(upstream:track)' refs/heads/`.text();

    for (const line of branchesState
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)) {
      const matched = line.match(
        /^(?<name>.+?)(\s+(?<remote>.+?))?(\s+(?<tracking>.+))?$/
      );

      const { name, remote, tracking } = matched?.groups ?? {};
      if (!name) continue;

      const ahead = parseInt(tracking?.match(/ahead (\d+)/)?.[1] ?? "") || 0;

      const branch: Dir["branches"][number] = {
        name,
        tracked: !!remote,
        ahead,
        commits: [],
      };

      if (!branch.tracked || branch.ahead > 0) {
        // Get commit messages for unpushed commits
        if (branch.ahead > 0) {
          const commits =
            await shell`git log ${remote}..HEAD --pretty=format:"%s (%ad)" --date=short`.text();
          branch.commits = commits
            .split("\n")
            .map((c) => c.trim())
            .filter(Boolean);
        }

        dir.branches.push(branch);
      }
    }

    if (dir.changes.length || dir.branches.length) {
      dirtyDirs.push(dir);
    }
  } catch (e) {
    console.error(
      `Error checking ${chalk.bold(formatPath(baseDir))}:`,
      e instanceof Error ? e.message : String(e)
    );
    continue;
  }
}

console.log(`Found ${dirtyDirs.length} dirty project(s):`);
for (const project of dirtyDirs) {
  const dirtyBranches = project.branches.filter((b) => b.ahead > 0);
  const untrackedBranches = project.branches.filter((b) => !b.tracked);

  if (options.compact) {
    console.log(
      `${chalk.bold(formatPath(project.path))}`,
      `(${dirtyBranches.map((b) => `${b.name}: ${b.ahead}`).join(", ")})`,
      `[${project.changes.map((x) => x.type).join("")}]`
    );
  } else {
    console.log("");
    console.log(`${chalk.bold(formatPath(project.path))}`);

    if (project.changes.length) {
      console.log(
        chalk.italic(`  uncommitted changes`),
        `(${project.changes.length})`
      );
      for (const change of project.changes) {
        console.log(`    ${chalk.bold(change.type)} ${change.path}`);
      }
    }

    const dirtyTrackedBranches = project.branches.filter(
      (b) => b.tracked && b.ahead > 0
    );
    if (dirtyTrackedBranches.length) {
      console.log(
        chalk.italic(`  unpushed commits`),
        `(${dirtyTrackedBranches.length})`
      );
      for (const branch of dirtyTrackedBranches) {
        console.log(`    ${chalk.bold(branch.name)} (${branch.ahead})`);
        for (const commit of branch.commits) {
          console.log(`      ${chalk.dim(commit)}`);
        }
      }
    }
    if (untrackedBranches.length) {
      console.log(
        chalk.italic(`  untracked branches`),
        `(${untrackedBranches.length})`
      );
      for (const branch of untrackedBranches) {
        console.log(`    ${chalk.bold(branch.name)}`);
        for (const commit of branch.commits) {
          console.log(`      ${chalk.dim(commit)}`);
        }
      }
    }
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
