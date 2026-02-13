import { defineConfig } from "vitest/config";
import path from "path";

const solutionLevel = process.env.SOLUTION_LEVEL;
const runAll = process.env.RUN_ALL_TESTS === "1";

function testIncludes(): string[] | undefined {
  if (!solutionLevel || runAll) return undefined;
  const n = parseInt(solutionLevel, 10);
  return Array.from({ length: n }, (_, i) => `tests/level-${i + 1}.test.ts`);
}

export default defineConfig({
  resolve: {
    alias: solutionLevel
      ? {
          "@handler": path.resolve(
            __dirname,
            `solutions/level-${solutionLevel}.ts`
          ),
        }
      : {
          "@handler": path.resolve(__dirname, "src/handler.ts"),
        },
  },
  test: {
    include: testIncludes(),
    reporters: ["verbose"],
  },
});
