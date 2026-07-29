import { randomUUID } from "node:crypto";
import { mkdir, readFile, appendFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const HISTORY_SCHEMA_VERSION = 1;

function historyDirectory() {
  return (
    process.env.SITEBOARD_HOME?.trim() ||
    join(homedir(), ".siteboard")
  );
}

export class DeploymentHistoryStore {
  constructor({ directory = historyDirectory() } = {}) {
    this.directory = directory;
    this.path = join(directory, "deployment-history.jsonl");
  }

  async append(input) {
    const record = Object.freeze({
      ...input,
      schemaVersion: HISTORY_SCHEMA_VERSION,
      eventId: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await appendFile(this.path, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "a",
    });
    try {
      await chmod(this.path, 0o600);
    } catch {
      // Some filesystems do not expose POSIX permissions.
    }
    return record;
  }

  async list(projectName, { limit = 100 } = {}) {
    let raw;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }

    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const record = JSON.parse(line);
          return record?.schemaVersion === HISTORY_SCHEMA_VERSION
            ? [record]
            : [];
        } catch {
          return [];
        }
      })
      .filter((record) => !projectName || record.projectName === projectName)
      .slice(-limit)
      .reverse();
  }
}
