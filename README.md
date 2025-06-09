# girty

> git dirty

Find local git repos with:

- uncommitted changes
- unpushed commits
- untracked branches
- no remote connected

It essentially helps you find repos that would loose work if they were deleted from your hard drive.

## Usage

[Bun](https://bun.sh/) (`bunx`) is required to run this command.

```
Usage: girty [paths...] [options]

Arguments:
  paths           Paths to check (recursively)

Options:
  -V, --version   output the version number
  -a, --absolute  Display absolute paths
  -c, --compact   Compact output
  -f, --fetch     Run `git fetch` before checking the repo state (slower)
  -h, --help      display help for command
```

### Example

```sh
# Find and check all git repos in the directory 'projects' (recusively).
bunx girty ./projects

# Find and check all git repos in the directories 'projects' and '../../more-projects' (recusively).
bunx girty ./projects ../../more-projects
```

The output will look something like this:

```sh
┌   girty
│
~  Checking directories:
│    /home/user/dev
│
◇  Found 69 git repos
│
◇  2 repos are dirty:

./dev/my-project
  uncommitted changes (2)
    M README.md
    M package.json
    D some/nested/file
  unpushed commits
    main (2)
      add something very cool (2025-06-01)
      fix some annoying bug (2025-06-01)
  untracked branches (1)
    some-new-feature
    explore-something-cool

./dev/prototype-24
  no remote

```
