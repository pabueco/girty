# girty

> git dirty

Find local git repos with uncommitted changes or unpushed commits.

## Usage

[Bun](https://bun.sh/) (`bunx`) is required to run this command.

```
Usage: girty [options] [paths...]

Arguments:
  paths           Paths to check (recursively)

Options:
  -V, --version   output the version number
  -a, --absolute  Display absolute paths
  -c, --compact   Compact output
  -h, --help      display help for command
```

### Example

```sh
# Find and check all git repos in the directory 'projects' (recusively).
bunx girty ./projects

# Find and check all git repos in the directories 'projects' and '../../more-projects' (recusively).
bunx girty./projects ../../more-projects
```
