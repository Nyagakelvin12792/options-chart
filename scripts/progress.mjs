import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const progressPath = join(repositoryRoot, "PROGRESS.md");
const milestoneConfigurations = [
  {
    id: "M0",
    title: "M0 Architecture Lock",
    journalDirectory: join(repositoryRoot, "docs", "progress", "M0"),
    filePattern: /^M0\.(\d+)\.md$/,
    headingPattern: /^# (M0\.\d+) (.+)$/m,
    completedNext:
      "M0 exit review and product-owner approval, then begin M0.5.",
  },
  {
    id: "M0.5",
    title: "M0.5 Walking Skeleton",
    journalDirectory: join(repositoryRoot, "docs", "progress", "M0.5"),
    filePattern: /^M0\.5\.(\d+)\.md$/,
    headingPattern: /^# (M0\.5\.\d+) (.+)$/m,
    completedNext:
      "M0.5 exit review and product-owner approval, then begin M1.",
  },
];

const buildGeneratedSection = (configuration) => {
  const journalFiles = readdirSync(configuration.journalDirectory)
    .filter((fileName) => configuration.filePattern.test(fileName))
    .sort((left, right) => {
      const leftNumber = Number(left.match(configuration.filePattern)?.[1]);
      const rightNumber = Number(right.match(configuration.filePattern)?.[1]);
      return leftNumber - rightNumber;
    });

  const tasks = journalFiles.map((fileName) => {
    const contents = readFileSync(
      join(configuration.journalDirectory, fileName),
      "utf8",
    );
    const heading = contents.match(configuration.headingPattern);
    const status = contents.match(/^Status: (COMPLETE|IN_PROGRESS|BLOCKED)$/m);

    if (!heading || !status) {
      throw new Error(`Invalid progress journal: ${fileName}`);
    }

    return { id: heading[1], title: heading[2], status: status[1] };
  });

  const completedCount = tasks.filter(
    (task) => task.status === "COMPLETE",
  ).length;
  const milestoneStatus =
    completedCount === tasks.length ? "COMPLETE" : "IN PROGRESS";
  const checklist = tasks
    .map(
      (task) =>
        `- [${task.status === "COMPLETE" ? "x" : " "}] ${task.id} ${task.title}`,
    )
    .join("\n");
  const nextTask =
    completedCount === tasks.length
      ? configuration.completedNext
      : (tasks.find((task) => task.status !== "COMPLETE")?.id ??
        "Review task journals.");
  const startMarker = `<!-- progress:${configuration.id}:start -->`;
  const endMarker = `<!-- progress:${configuration.id}:end -->`;

  return `${startMarker}
## ${configuration.title}

Status: ${milestoneStatus}

${checklist}

Progress: ${completedCount} / ${tasks.length}

Blockers:

- None.

Next recommended task:

\`\`\`text
${nextTask}
\`\`\`
${endMarker}`;
};

const replaceGeneratedSections = (contents) =>
  milestoneConfigurations.reduce((updatedContents, configuration) => {
    const startMarker = `<!-- progress:${configuration.id}:start -->`;
    const endMarker = `<!-- progress:${configuration.id}:end -->`;
    const start = updatedContents.indexOf(startMarker);
    const end = updatedContents.indexOf(endMarker);

    if (start < 0 || end < start) {
      throw new Error(
        `PROGRESS.md does not contain the ${configuration.id} generation markers`,
      );
    }

    return `${updatedContents.slice(0, start)}${buildGeneratedSection(configuration)}${updatedContents.slice(end + endMarker.length)}`;
  }, contents);

const mode = process.argv[2];
const currentProgress = readFileSync(progressPath, "utf8");

if (mode === "build") {
  const updatedProgress = replaceGeneratedSections(currentProgress);
  if (updatedProgress !== currentProgress) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(progressPath, updatedProgress, "utf8");
  }
} else if (mode === "check") {
  if (replaceGeneratedSections(currentProgress) !== currentProgress) {
    console.error("PROGRESS.md is stale. Run npm run progress:build.");
    process.exitCode = 1;
  }
} else if (mode === "policy") {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    const changedFiles = execFileSync(
      "git",
      ["diff", "--name-only", `origin/${baseRef}...HEAD`],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    const codeChanged = changedFiles.some((file) =>
      /^(apps|packages|tools)\//.test(file),
    );
    const progressChanged = changedFiles.some(
      (file) => file === "PROGRESS.md" || file.startsWith("docs/progress/"),
    );
    if (codeChanged && !progressChanged) {
      console.error(
        "Project code changed without a PROGRESS.md or task-journal update.",
      );
      process.exitCode = 1;
    }
  }
} else {
  console.error("Usage: node scripts/progress.mjs <build|check|policy>");
  process.exitCode = 1;
}