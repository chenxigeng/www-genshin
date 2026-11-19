import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as candidate from "../src/index.ts";

const originalUrl = new URL("../../src/libs/xviewer/xviewer.module.min.js", import.meta.url);
const original: Record<string, unknown> = await import(originalUrl.href);
const declarationUrl = new URL("../../src/libs/xviewer.d.ts", import.meta.url);
const sourceHash = createHash("sha256").update(await readFile(originalUrl)).digest("hex");
const declarationHash = createHash("sha256").update(await readFile(declarationUrl)).digest("hex");

const runtimeExports = Object.keys(original).sort();
const missing = runtimeExports.filter((name) => !Object.hasOwn(candidate, name));
const extra = Object.keys(candidate).filter((name) => !Object.hasOwn(original, name));
const differentTypes = runtimeExports.filter((name) => (
    Object.hasOwn(candidate, name) && typeof candidate[name as keyof typeof candidate] !== typeof original[name]
));

const report = {
    sourceHash,
    declarationHash,
    threeRevision: original.REVISION,
    tweenVersion: (original.TWEEN as { VERSION?: string } | undefined)?.VERSION,
    originalExportCount: runtimeExports.length,
    candidateExportCount: Object.keys(candidate).length,
    missing,
    extra,
    differentTypes,
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");

// 发布时用严格模式阻止缺少导出、增加导出或运行时类型变化。
if (process.argv.includes("--strict") && (missing.length || extra.length || differentTypes.length)) {
    process.exitCode = 1;
}
