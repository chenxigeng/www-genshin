import { execFile } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const chrome = process.env.XVIEWER_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const temp = realpathSync(tmpdir());
const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./browser-smoke-page.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
});
const directory = mkdtempSync(join(temp, "xviewer2-browser-"));
const htmlPage = '<!doctype html><meta charset="utf-8"><output data-status="pending"></output><img src="/completion" alt="" hidden><script src="/probe.js"></script>';
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const appRoot = fileURLToPath(new URL("../../../apps/www-genshin", import.meta.url));
const routes = new Map([
    ["/", { bytes: Buffer.from(htmlPage), type: "text/html; charset=utf-8" }],
    ["/probe.js", { bytes: Buffer.from(bundle.outputFiles[0].contents), type: "text/javascript" }],
]);
// 挂起图片请求，让 Chrome 等待真实的异步模型与 Worker 流程，而非使用虚拟时间。
let completion: ServerResponse | undefined;
let completed = false;
const server = createServer((request, response) => {
    if (request.url === "/completion") {
        if (completed) response.writeHead(204).end();
        else completion = response;
        return;
    }
    if (request.url === "/done" && request.method === "POST") {
        completed = true;
        completion?.writeHead(204).end();
        response.writeHead(204).end();
        return;
    }
    const asset = routes.get(request.url ?? "");
    if (!asset) {
        response.writeHead(404).end();
        return;
    }
    response.writeHead(200, { "Content-Type": asset.type, "Content-Length": asset.bytes.length });
    response.end(asset.bytes);
});

try {
    for (const name of ["DOOR.glb", "SM_Road.glb"]) {
        const path = `/Genshin/Login/${name}`;
        routes.set(path, { bytes: await readFile(join(appRoot, "public", path)), type: "model/gltf-binary" });
    }
    for (const name of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
        routes.set(`/decoder/${name}`, {
            bytes: await readFile(join(packageRoot, "node_modules", "three", "examples", "jsm", "libs", "draco", "gltf", name)),
            type: name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        });
    }
    await new Promise<void>((done, fail) => {
        server.once("error", fail);
        server.listen(0, "127.0.0.1", done);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not bind");
    const { stdout: html } = await promisify(execFile)(chrome, [
        "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-extensions",
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--force-device-scale-factor=1", "--window-size=960,720",
        `--user-data-dir=${join(directory, "profile")}`, "--dump-dom", `http://127.0.0.1:${address.port}/`,
    ], { encoding: "utf8", timeout: 45000, windowsHide: true });
    const result = html.match(/<output data-status="([^"]+)">([\s\S]*?)<\/output>/);
    if (!result || result[1] === "pending") throw new Error("Chrome returned without running the WebGL probe");
    process.stdout.write(`${result[1]}\n${result[2]}\n`);
    if (result[1] !== "passed") process.exitCode = 1;
} catch (error) {
    process.stderr.write(`environment_blocked\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
} finally {
    server.close();
    server.closeAllConnections();
    // 只清理本次创建且确认归属系统临时目录的浏览器配置。
    const target = realpathSync(directory);
    if (dirname(resolve(target)) === temp && target === directory) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
}
