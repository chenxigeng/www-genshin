// 公开类型入口：先载入无类型依赖的声明补丁，再转发构建产物的声明文件。
/// <reference path="./shims/postprocessing-module.d.ts" />
/// <reference path="./shims/n8ao.d.ts" />
/// <reference path="./shims/meshopt.d.ts" />
/// <reference path="./shims/three-legacy-geometries.d.ts" />
export * from "./dist/index.js";
