import { defineConfig } from "tsdown";

// 产出可独立发布的 ESM 与类型声明；three、后处理等运行时依赖保持外部引用，由使用方安装。
export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "dist",
    format: "esm",
    platform: "browser",
    target: "es2022",
    dts: true,
    clean: true,
    sourcemap: true,
    deps: {
        neverBundle: [/^three(\/|$)/, "postprocessing", "n8ao", "@tweenjs/tween.js"],
    },
});
