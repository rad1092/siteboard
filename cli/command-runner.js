import { spawn } from "node:child_process";

const ANSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  "g",
);
const SECRET_PATTERNS = [
  /\bBearer\s+\S+/gi,
  /\b(?:token|secret|key)\s*[:=]\s*\S+/gi,
  /\b[A-Za-z0-9_-]{40,}\b/g,
];

export class CommandExecutionError extends Error {
  constructor(message, { exitCode = null, cause } = {}) {
    super(message, { cause });
    this.name = "CommandExecutionError";
    this.exitCode = exitCode;
  }
}

export function sanitizeCommandOutput(value) {
  let sanitized = String(value ?? "").replace(ANSI_PATTERN, "");
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized.trim().slice(-2_000);
}

export function createCommandRunner({
  command,
  prefixArgs = [],
  spawnImpl = spawn,
  baseEnv = process.env,
}) {
  if (!command) throw new Error("A command executable is required.");

  return {
    run(args, options = {}) {
      const {
        cwd = process.cwd(),
        env = {},
        timeoutMs = 180_000,
        sensitive = false,
      } = options;

      return new Promise((resolve, reject) => {
        const child = spawnImpl(command, [...prefixArgs, ...args], {
          cwd,
          env: {
            ...baseEnv,
            WRANGLER_LOG_SANITIZE: "true",
            WRANGLER_SEND_ERROR_REPORTS: "false",
            WRANGLER_SEND_METRICS: "false",
            FORCE_COLOR: "0",
            ...env,
          },
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let exceededLimit = false;
        const outputLimit = 2 * 1024 * 1024;
        const append = (current, chunk) => {
          const next = current + chunk.toString("utf8");
          if (next.length > outputLimit) {
            exceededLimit = true;
            child.kill("SIGTERM");
            return next.slice(-outputLimit);
          }
          return next;
        };

        child.stdout?.on("data", (chunk) => {
          stdout = append(stdout, chunk);
        });
        child.stderr?.on("data", (chunk) => {
          stderr = append(stderr, chunk);
        });

        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          reject(
            new CommandExecutionError("Cloudflare command timed out."),
          );
        }, timeoutMs);
        timeout.unref?.();

        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(
            new CommandExecutionError(
              "Cloudflare command could not be started.",
              { cause: error },
            ),
          );
        });

        child.once("close", (code) => {
          clearTimeout(timeout);
          if (code === 0 && !exceededLimit) {
            resolve({ stdout, stderr, exitCode: 0 });
            return;
          }

          const detail = sensitive
            ? ""
            : sanitizeCommandOutput(stderr || stdout);
          const message = exceededLimit
            ? "Cloudflare command produced too much output."
            : detail || "Cloudflare command failed.";
          reject(
            new CommandExecutionError(message, {
              exitCode: code,
            }),
          );
        });
      });
    },
  };
}
