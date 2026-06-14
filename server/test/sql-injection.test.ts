import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Static analysis test that verifies no unsafe raw SQL patterns exist in production code.
 * Prisma's tagged template literals (e.g., prisma.$queryRaw`SELECT ${var}`) are safe
 * because they produce parameterized queries. What we flag:
 * - $queryRawUnsafe() or $executeRawUnsafe() with non-constant arguments
 * - $queryRaw() or $executeRaw() called with string concatenation or template literals
 *   (non-tagged usage)
 */

const SRC_DIR = join(import.meta.dirname, "..", "src");

/** Recursively collect all .ts files in a directory. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("SQL injection prevention", () => {
  const sourceFiles = collectTsFiles(SRC_DIR);

  test("no source files use $queryRawUnsafe or $executeRawUnsafe", () => {
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = readFileSync(filePath, "utf-8");
      const relPath = relative(join(SRC_DIR, ".."), filePath);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;
        if (
          line.includes("$queryRawUnsafe") ||
          line.includes("$executeRawUnsafe")
        ) {
          violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found unsafe raw SQL usage in production code:\n${violations.join("\n")}`,
    );
  });

  test("no source files use $queryRaw or $executeRaw with string concatenation", () => {
    const violations: string[] = [];

    // Pattern: $queryRaw( or $executeRaw( followed by string concat or template literal
    // Safe: $queryRaw`...` (tagged template - parameterized)
    // Unsafe: $queryRaw("SELECT " + x) or $queryRaw(`SELECT ${x}`)
    const unsafeCallPattern =
      /\$(?:queryRaw|executeRaw)\s*\(\s*(?:`[^`]*\$\{|['"].*\+|\+.*['"])/;

    for (const filePath of sourceFiles) {
      const content = readFileSync(filePath, "utf-8");
      const relPath = relative(join(SRC_DIR, ".."), filePath);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;
        if (unsafeCallPattern.test(line)) {
          violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found raw SQL with string interpolation:\n${violations.join("\n")}`,
    );
  });

  test("tagged template usage of $queryRaw and $executeRaw is safe (parameterized)", () => {
    // Verify that any $queryRaw or $executeRaw usage in src/ uses tagged templates
    const taggedTemplatePattern = /\$(?:queryRaw|executeRaw)`/;
    const anyRawPattern = /\$(?:queryRaw|executeRaw)/;

    let taggedCount = 0;
    let totalRawCount = 0;

    for (const filePath of sourceFiles) {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        if (anyRawPattern.test(line)) {
          totalRawCount++;
          if (taggedTemplatePattern.test(line)) {
            taggedCount++;
          }
        }
      }
    }

    // All raw SQL usage should be tagged templates
    assert.equal(
      taggedCount,
      totalRawCount,
      `Found ${totalRawCount - taggedCount} raw SQL calls that are not tagged templates (safe parameterized form)`,
    );
  });
});
