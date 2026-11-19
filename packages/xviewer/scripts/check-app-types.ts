import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceRoot = resolve(packageRoot, "../..");
const appRoot = resolve(workspaceRoot, "apps", "www-genshin");
const configPath = resolve(appRoot, "tsconfig.json");
const candidateDir = resolve(packageRoot, "src");
const candidateEntry = resolve(candidateDir, "index.ts");
const shimsDir = resolve(packageRoot, "shims");
const originalEntry = resolve(packageRoot, "reference", "xviewer.d.ts");
const packageName = "@xviewer2/xviewer";
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const projects = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, appRoot);
const formatHost: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => workspaceRoot,
    getCanonicalFileName: (name) => name,
    getNewLine: () => "\n",
};
const configErrors = config.error ? [config.error, ...projects.errors] : projects.errors;
if (configErrors.length) throw new Error(ts.formatDiagnostics(configErrors, formatHost));

/** 仅在对照编译中替换应用对包名的引用：原版声明或候选源码。 */
function check(useCandidate: boolean) {
    const host = ts.createCompilerHost(projects.options);
    host.resolveModuleNames = (names, source) => names.map((name) => {
        if (name !== packageName) return ts.resolveModuleName(name, source, projects.options, host).resolvedModule;
        return {
            resolvedFileName: useCandidate ? candidateEntry : originalEntry,
            extension: useCandidate ? ts.Extension.Ts : ts.Extension.Dts,
            isExternalLibraryImport: true,
        };
    });
    const ambientTypes = useCandidate ? ts.sys.readDirectory(shimsDir, [".d.ts"]) : [];
    const program = ts.createProgram([...projects.fileNames, ...ambientTypes], projects.options, host);
    return ts.getPreEmitDiagnostics(program);
}

/** 按文件、位置及消息匹配，避免把应用已有错误算作候选新增。 */
function diagnosticKey(diagnostic: ts.Diagnostic) {
    return JSON.stringify([
        diagnostic.file?.fileName, diagnostic.start, diagnostic.code,
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ]);
}

const baseline = check(false);
const candidate = check(true);
const baselineKeys = new Set(baseline.map(diagnosticKey));
const added = candidate.filter((diagnostic) => !baselineKeys.has(diagnosticKey(diagnostic)));
process.stdout.write(`Original diagnostics: ${baseline.length}\nCandidate diagnostics: ${candidate.length}\nNew diagnostics: ${added.length}\n`);
if (added.length) {
    process.stderr.write(ts.formatDiagnostics(added, formatHost));
    process.exitCode = 1;
}
