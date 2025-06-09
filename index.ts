#!/usr/bin/env bun

import { $ } from "bun";
import { basename, relative, resolve } from "node:path";
import { Command } from "@commander-js/extra-typings";
import pkg from "./package.json" assert { type: "json" };
import {
  analyseDirectory,
  findGitRepos,
  printRepoState,
  type AnalyzedRepo,
} from "./lib";
import { intro, log, spinner, tasks } from "@clack/prompts";
import chalk from "chalk";

const program = new Command()
  .name(pkg.name)
  .version(pkg.version)
  .option("-a, --absolute", "Display absolute paths")
  .option("-c, --compact", "Compact output")
  .option("-f, --fetch", "Fetch remote branches before checking state", false)
  .argument("[paths...]", "Directories to check (recursively)")
  .parse(process.argv);

const options = program.opts();
const positionals = program.args;

intro(chalk.bgBlack.white(` girty `));

const cwd = (await $`pwd`.text()).split("\n").filter(Boolean).pop() as string;
const paths = [...(positionals.length ? positionals : [cwd])].map((x) =>
  resolve(x!)
);

log.message("Checking directories:" + paths.map((p) => `\n  ${p}`), {
  symbol: chalk.black("~"),
});

let repos: Set<string> = new Set();
let dirtyRepos: AnalyzedRepo[] = [];

await tasks([
  {
    title: "Looking for git repos",
    task: async () => {
      repos = await findGitRepos(paths);
      return `Found ${chalk.bold(repos.size)} git repos`;
    },
  },
  {
    title: "Analyzing repos",
    task: async () => {
      dirtyRepos = (
        await Promise.all(
          Array.from(repos).map((p) =>
            analyseDirectory(p, { fetch: !!options.fetch, formatPath })
          )
        )
      ).filter(Boolean) as AnalyzedRepo[];

      return `${chalk.bold(dirtyRepos.length)} repos are dirty!`;
    },
  },
]);

if (!dirtyRepos.length) {
  log.success("No dirty repos found.");
} else {
  for (const project of dirtyRepos) {
    printRepoState(project, { compact: options.compact, formatPath });
  }
}

function formatPath(p: string, absolute = options.absolute) {
  if (!absolute) {
    const path = relative(cwd, p);
    return path.length
      ? path.startsWith(".")
        ? path
        : `./${path}`
      : `./ (${basename(p)})`;
  }
  return p;
}
