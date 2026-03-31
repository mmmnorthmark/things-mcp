import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

type ThingsCommand =
  | "add"
  | "add-project"
  | "update"
  | "update-project"
  | "show"
  | "search"
  | "version"
  | "json";

type ParamValue = string | boolean | undefined;

export interface ExecuteResult {
  success: boolean;
  thingsId?: string;
  callbackParams?: Record<string, string>;
}

const AUTH_TOKEN_PARAM = "auth-token";

/**
 * Build a Things URL scheme URL from a command and parameters.
 * Pure function — no side effects, fully testable.
 */
export function buildUrl(
  command: ThingsCommand,
  params: Record<string, ParamValue>,
  authToken?: string,
): string {
  const parts: string[] = [];

  if (authToken) {
    parts.push(`auth-token=${encode(authToken)}`);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (typeof value === "boolean") {
      parts.push(`${encode(key)}=${value ? "true" : "false"}`);
    } else {
      parts.push(`${encode(key)}=${encode(value)}`);
    }
  }

  const query = parts.join("&");
  return query ? `things:///x-callback-url/${command}?${query}` : `things:///x-callback-url/${command}`;
}

/**
 * Build a Things JSON command URL for bulk operations.
 * Pure function — no side effects, fully testable.
 */
export function buildJsonUrl(
  items: unknown[],
  authToken?: string,
  reveal?: boolean,
): string {
  const parts: string[] = [];

  parts.push(`data=${encodeURIComponent(JSON.stringify(items))}`);

  if (authToken) {
    parts.push(`auth-token=${encode(authToken)}`);
  }

  if (reveal) {
    parts.push("reveal=true");
  }

  return `things:///x-callback-url/json?${parts.join("&")}`;
}

/**
 * Percent-encode a string for use in URL parameters.
 * Uses encodeURIComponent but also encodes characters that Things expects encoded.
 */
function encode(value: string): string {
  return encodeURIComponent(value);
}

let xcallAvailable: boolean | null = null;

/**
 * Check if xcall is available on the system (cached).
 */
async function isXcallAvailable(): Promise<boolean> {
  if (xcallAvailable !== null) return xcallAvailable;

  try {
    await access("/Applications/xcall.app/Contents/MacOS/xcall");
    xcallAvailable = true;
  } catch {
    xcallAvailable = false;
  }

  return xcallAvailable;
}

/**
 * Execute a Things URL scheme URL.
 * Tries xcall first (captures x-success callback parameters), falls back to `open`.
 */
export async function executeUrl(url: string): Promise<ExecuteResult> {
  if (await isXcallAvailable()) {
    return executeWithXcall(url);
  }
  return executeWithOpen(url);
}

function executeWithXcall(url: string): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "/Applications/xcall.app/Contents/MacOS/xcall",
      ["-url", url, "-activateApp", "NO"],
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(buildProcessError("xcall", code, stderr, url)));
        return;
      }

      resolve(parseXcallOutput(stdout.trim()));
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

function parseXcallOutput(rawOutput: string): ExecuteResult {
  if (!rawOutput) {
    return { success: true };
  }

  try {
    const parsed = JSON.parse(rawOutput);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const callbackParams = Object.fromEntries(
        Object.entries(parsed)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      );
      const thingsId = callbackParams["x-things-id"] ?? callbackParams["x-things-ids"];
      return { success: true, callbackParams, thingsId };
    }
  } catch {
    // xcall can also return a plain string value.
  }

  return { success: true, thingsId: rawOutput };
}

/**
 * Convert an x-callback-url format Things URL to direct format.
 * "things:///x-callback-url/add?..." -> "things:///add?..."
 * Used when executing via `open` instead of xcall.
 */
export function toDirectUrl(url: string): string {
  return url.replace("things:///x-callback-url/", "things:///");
}

function executeWithOpen(url: string): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("open", [toDirectUrl(url)]);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(buildProcessError("open", code, "", url)));
        return;
      }
      resolve({ success: true });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Get the Things auth token from the environment.
 * Throws a descriptive error if not set.
 */
export function requireAuthToken(): string {
  const token = process.env.THINGS_AUTH_TOKEN;
  if (!token) {
    throw new Error(
      "THINGS_AUTH_TOKEN environment variable is required for this operation. " +
        "Get your token from Things → Settings → General → Enable Things URLs → Manage. " +
        "Then add it to your MCP client config as an environment variable.",
    );
  }
  return token;
}

/**
 * Get the Things auth token if available, undefined otherwise.
 */
export function getAuthToken(): string | undefined {
  return process.env.THINGS_AUTH_TOKEN;
}

/**
 * Reset the xcall availability cache (for testing).
 */
export function _resetXcallCache(): void {
  xcallAvailable = null;
}

export function redactAuthToken(url: string): string {
  const [base, query] = url.split("?", 2);
  if (!query) return url;

  const params = query
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const [key, ...rest] = part.split("=");
      if (key === AUTH_TOKEN_PARAM) {
        return `${AUTH_TOKEN_PARAM}=[REDACTED]`;
      }
      return rest.length > 0 ? `${key}=${rest.join("=")}` : key;
    });

  return `${base}?${params.join("&")}`;
}

/**
 * Parse xcall stdout into an ExecuteResult (for testing).
 */
export function _parseXcallOutput(rawOutput: string): ExecuteResult {
  return parseXcallOutput(rawOutput.trim());
}

export function _buildProcessError(
  command: string,
  code: number | null,
  stderr: string,
  url: string,
): string {
  return buildProcessError(command, code, stderr, url);
}

function buildProcessError(
  command: string,
  code: number | null,
  stderr: string,
  url: string,
): string {
  const redactedUrl = redactAuthToken(url);
  const trimmedStderr = stderr.trim();

  if (trimmedStderr.includes(AUTH_TOKEN_PARAM) || trimmedStderr.includes(redactedUrl)) {
    return `${command} failed${code === null ? "" : ` with code ${code}`}`;
  }

  return `${command} failed${code === null ? "" : ` with code ${code}`}`;
}
