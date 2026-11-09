import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/** 에이전트 3이 쓰는 data/krv-variants.json + public 사본. 없으면 {} */
const CANDIDATES = [
  ["data", "krv-variants.json"],
  ["public", "data", "krv-variants.json"],
  ["public", "krv-variants.json"],
  ["public", "word-study", "krv-variants.json"],
];

export async function GET() {
  for (const parts of CANDIDATES) {
    try {
      const buf = await readFile(join(process.cwd(), ...parts), "utf8");
      JSON.parse(buf);
      return new Response(buf, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    } catch {
      /* 다음 경로 */
    }
  }
  return new Response("{}", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
