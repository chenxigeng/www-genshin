/** 原版浏览器模块只在兼容回归中载入，运行时由对照断言验证。 */
declare module "*xviewer.module.min.js" {
    const original: typeof import("../src/index.ts");
    export = original;
}
