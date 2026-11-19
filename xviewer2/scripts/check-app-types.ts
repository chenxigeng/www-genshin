import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const configPath = resolve(root, "tsconfig.json");
const candidateDir = resolve(root, "xviewer2/src");
const candidateEntry = resolve(candidateDir, "index.ts");
const originalEntry = resolve(root, "src/libs/xviewer");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const projects = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, root);
const formatHost: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => root,
    getCanonicalFileName: (name) => name,
    getNewLine: () => "\n",
};
const configErrors = config.error ? [config.error, ...projects.errors] : projects.errors;
if (configErrors.length) throw new Error(ts.formatDiagnostics(configErrors, formatHost));

/** 仅在候选编译中替换真实指向 src/libs/xviewer 的相对模块。 */
function check(useCandidate: boolean) {
    const host = ts.createCompilerHost(projects.options);
    if (useCandidate) {
        host.resolveModuleNames = (names, source) => names.map((name) => {
            const specifier = name.startsWith(".") && resolve(dirname(source), name) === originalEntry
                ? candidateEntry : name;
            return ts.resolveModuleName(specifier, source, projects.options, host).resolvedModule;
        });
    }
    const ambientTypes = useCandidate ? ts.sys.readDirectory(candidateDir, [".d.ts"]) : [];
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
