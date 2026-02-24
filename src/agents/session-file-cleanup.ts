/**
 * Session file cleanup utility
 * Prunes old session .jsonl files from the sessions directory
 *
 * This complements the session-reaper.ts which cleans up cron run session
 * references in the sessions store. This module cleans up actual .jsonl files.
 */

import fs from "node:fs/promises";
import path from "node:path";

export type CleanupOptions = {
  /** Path to the sessions directory */
  sessionsDir: string;
  /** Maximum age in milliseconds (default: 7 days) */
  maxAgeMs?: number;
  /** Dry run - don't actually delete */
  dryRun?: boolean;
};

export type CleanupResult = {
  deleted: number;
  kept: number;
  errors: string[];
  freedBytes: number;
};

/**
 * Clean up session files older than maxAgeMs
 */
export async function cleanupSessionFiles(options: CleanupOptions): Promise<CleanupResult> {
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days default
  const now = Date.now();
  const result: CleanupResult = {
    deleted: 0,
    kept: 0,
    errors: [],
    freedBytes: 0,
  };

  try {
    const files = await fs.readdir(options.sessionsDir);

    for (const file of files) {
      // Only process .jsonl files that are session files
      if (!file.endsWith(".jsonl") || file.includes(".lock") || file.includes(".deleted")) {
        result.kept++;
        continue;
      }

      const filePath = path.join(options.sessionsDir, file);

      try {
        const stat = await fs.stat(filePath);
        const ageMs = now - stat.mtimeMs;

        if (ageMs > maxAgeMs) {
          if (options.dryRun) {
            result.deleted++;
            result.freedBytes += stat.size;
          } else {
            // Rename to .deleted first instead of direct deletion
            const deletedPath = `${filePath}.deleted.${new Date().toISOString().replace(/[:.]/g, "-")}`;
            await fs.rename(filePath, deletedPath);
            result.deleted++;
            result.freedBytes += stat.size;
          }
        } else {
          result.kept++;
        }
      } catch (err) {
        result.errors.push(
          `Failed to process ${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Failed to read sessions directory: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return result;
}

/**
 * Parse duration string to milliseconds (simple implementation)
 * Supports formats like: "7d", "24h", "30m", etc.
 */
export function parseDurationStrict(input: string | undefined, defaultMs: number): number {
  if (!input) {
    return defaultMs;
  }

  const match = input.match(/^(\d+)([dhms]?)$/);
  if (!match) {
    return defaultMs;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2] || "d"; // default to days

  switch (unit) {
    case "d":
      return value * 24 * 60 * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "m":
      return value * 60 * 1000;
    case "s":
      return value * 1000;
    default:
      return defaultMs;
  }
}
