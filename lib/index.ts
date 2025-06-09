import { $ } from "bun";
import chalk from "chalk";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { glob } from "glob";
import { log } from "@clack/prompts";

export type AnalyzedRepo = {
  path: string;
  remote: boolean;
  changes: { type: string; path: string }[];
  branches: {
    name: string;
    tracked: boolean;
    ahead: number;
    commits: string[];
  }[];
};

export async function analyseDirectory(
  dir: string,
  options: { fetch?: boolean; formatPath: (path: string) => string }
): Promise<AnalyzedRepo | null> {
  const shouldFetch = options.fetch ?? false;

  const baseDir = dirname(dir);

  const shell = new $.Shell();
  shell.cwd(baseDir);

  try {
    const hasRemote = !!(await shell`git remote`.text().then((x) => x.trim()));

    if (hasRemote && shouldFetch) {
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

    const repo: AnalyzedRepo = {
      path: baseDir,
      remote: hasRemote,
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

      const branch: AnalyzedRepo["branches"][number] = {
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

        repo.branches.push(branch);
      }
    }

    if (!repo.remote || repo.changes.length || repo.branches.length) {
      return repo;
    } else {
      return null;
    }
  } catch (e) {
    console.error(
      `Error checking ${chalk.bold(options.formatPath(baseDir))}:`,
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

export async function printRepoState(
  repo: AnalyzedRepo,
  options: { compact?: boolean; formatPath: (path: string) => string }
) {
  const dirtyBranches = repo.branches.filter((b) => b.ahead > 0);
  const untrackedBranches = repo.branches.filter((b) => !b.tracked);

  const formatPath = options.formatPath;

  if (options.compact) {
    console.log(
      ...[
        `${chalk.bold(formatPath(repo.path))}:`,
        !repo.remote && `no remote`,
        dirtyBranches.length &&
          `(${dirtyBranches
            .map((b) => `${b.name}: ${b.ahead} ahead`)
            .join(", ")})`,
        untrackedBranches.length &&
          `(${untrackedBranches
            .map((b) => `${b.name}: untracked`)
            .join(", ")})`,
        repo.changes.length && `[${repo.changes.map((x) => x.type).join("")}]`,
      ].filter(Boolean)
    );
  } else {
    console.log("");
    console.log(`${chalk.bold(formatPath(repo.path))}`);

    if (!repo.remote) {
      console.log(chalk.italic(`  no remote`));
    }

    if (repo.changes.length) {
      console.log(
        chalk.italic(`  uncommitted changes (${repo.changes.length})`)
      );
      for (const change of repo.changes) {
        console.log(`    ${chalk.bold(change.type)} ${change.path}`);
      }
    }

    const dirtyTrackedBranches = repo.branches.filter(
      (b) => b.tracked && b.ahead > 0
    );
    if (dirtyTrackedBranches.length) {
      console.log(
        chalk.italic(`  unpushed commits (${dirtyTrackedBranches.length})`)
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
        chalk.italic(`  untracked branches (${untrackedBranches.length})`)
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

export async function findGitRepos(paths: string[]): Promise<Set<string>> {
  const repos = await Promise.all(
    paths.map(async (path) => {
      if (!(await isDirectory(path))) {
        log.error(chalk.red(`\`${path}\` is not a directory`));
        process.exit(1);
      }

      const gitDirs = await glob("**/.git", {
        ignore: "node_modules/**",
        cwd: path,
        absolute: true,
      });

      return gitDirs;
    })
  );

  return new Set(repos.flat());
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch (err) {
    return false;
  }
}
