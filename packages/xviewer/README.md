# @xviewer2/xviewer 还原与开发指南

目标是在本目录交付可独立构建、可维护、可扩展的 xviewer 兼容实现，覆盖原版公开运行时功能和 TypeScript 类型，以及现有项目依赖的内部行为。原版 ESM、声明文件和现有调用方共同定义兼容范围。原版产物保留为测试参照。

## 当前进度

已达到 **491 / 491 个运行时导出**。严格盘点验证入口名称和运行时类型完全匹配。对照测试另行验证常量、命名空间成员、公开 GLSL、补间时间线、相机和粒子计算、后处理参数以及库的核心生命周期。发布声明和实际浏览器行为仍需按模块验收。

已定位原版的 491 个 ESM 导出和 Three.js revision 150，建立导出盘点脚本，并还原 `EventEmitter`、`Scheduler`、`Component`、`Plugin` 和 `dependencies`。组件管理器与生命周期调度器已实现。`Entity`、`ComponentManager` 和 `ComponentScheduler` 保持内部使用，符合原版 ESM 的导出范围。

## 包结构与发布

```
packages/xviewer
├─ src/            实现源码（相对导入显式带 .ts 后缀）
├─ shims/          无类型依赖的模块补丁（postprocessing/module、n8ao、meshopt、three 旧几何体）
├─ types.d.ts      公开类型入口：先引入 shims，再转发 dist 声明
├─ reference/      原版压缩包与旧声明文件，仅测试对照使用，不随包发布
├─ scripts/        导出盘点、类型对照与浏览器对照脚本
└─ dist/           `pnpm build:lib` 产物（ESM + 类型），随包发布
```

`tsdown` 只打包 `src/index.ts`，`three`、`postprocessing`、`n8ao` 与 `@tweenjs/tween.js` 保持外部引用。`three` 以 `peerDependencies` 交付，使用方需自行安装同一 r150 版本。`shims/` 与 `types.d.ts` 随包发布，保证使用方拿到的类型与库内一致。

`apps/www-genshin` 通过 workspace 依赖 `@xviewer2/xviewer` 使用本包，因此改完源码需重新构建（或在根目录运行 `pnpm dev` 同时启动 `tsdown --watch`）。

## 开发与验收

实现、测试和盘点脚本均使用 TypeScript。使用 Node.js 22.18 或更新版本，从仓库根目录运行以下命令。本包锁定 Three.js `0.150.1`、Tween.js `18.6.4`、postprocessing `6.30.2` 与 N8AO `1.6.8`。后两个是经原版接口和代表性配置比对后选择的兼容版本。

```sh
pnpm install
pnpm --filter @xviewer2/xviewer build
pnpm --filter @xviewer2/xviewer typecheck
pnpm --filter @xviewer2/xviewer check:app-types
pnpm --filter @xviewer2/xviewer check:browser
pnpm --filter @xviewer2/xviewer inventory -- --strict
pnpm --filter @xviewer2/xviewer test
```

原版压缩包与旧声明文件存放在 `reference/`，测试直接按该路径加载；`check:app-types` 会把应用对 `@xviewer2/xviewer` 的引用在原版声明与候选源码间切换后对比诊断。需要恢复原版运行时入口时，让应用改为导入 `reference/xviewer.module.min.js`。


盘点脚本输出原版文件哈希、依赖版本和导出差异。`--strict` 在导出缺失、多出或运行时类型不同时返回非零。原版声明中的仅类型接口与声明曾标为导出的内部类需要单独验收。

`check:app-types` 分别用原版声明和候选入口编译现有应用，在内存中重定向实际指向原库的 import。候选新增诊断时命令失败。应用中本来存在的 `ShaderTest.ts` 诊断按原版结果保留为基线。组件继续支持泛型节点类型，应用自定义资源通过其现有 `User` 类型访问。`property()` 兼容旧式调用和 TypeScript 标准成员装饰器。

`check:browser` 使用根项目已安装的 esbuild 构建独立对照页，以临时回环 HTTP 服务提供页面和资源，并使用隔离配置启动无头 Chrome。Windows 默认路径是 Chrome 的标准安装路径，其他路径可通过环境变量 `XVIEWER_BROWSER` 指定。对照页仅将 Draco CDN 请求重定向到随 Three.js 安装的本地解码器，测试不依赖外网或应用开发服务器。

## Three.js 兼容导出

公开入口从锁定的 Three.js r150 复用相机、灯光、几何体、材质、纹理、动画与 WebGL 构造器，以及对应枚举值。Viewer、加载器和调用方共享构造器，因此加载得到的网格可直接通过公开的 `Mesh` 和 `Object3D` 做 `instanceof` 检查。

r150 的旧 `*BufferGeometry` 构造器保留各自的实例继承和重命名告警。候选源码补充了 `@types/three` 省略的声明，运行时直接复用锁定版本里的实现。

入口加载时会扩展共享实例的 `Object3D` 和 `Matrix3` 原型，并给 `Vector3` 与 `MathUtils` 补充原版成员。应用若直接从同一份 `three` 导入，也会看到这些运行时扩展。`Vector3` 的静态方向向量是可变共享值，取用后需要修改时先 `clone()`。`property(options)(Class.prototype, "field")` 登记元数据，派生类首次写入时浅拷贝父级记录。

入口还提供 `$c`、`$v2`、`$v3`、`$v4`、`$q` 和 `getFullscreenTriangle()`。向量工具的后续分量省略时沿用首项。全屏三角形每次调用会创建新几何体，由使用它的通道负责释放。

`makeInstanced(root, props?, ignore?)` 遍历网格，按几何体 UUID 与材质名分组，返回由 `InstancedMesh` 组成的新 `Group`。原节点保留在场景树上。每个实例使用源网格的世界矩阵，新批次与源网格共享几何体和材质。同名材质在组内取第一份。可见性按网格自身的 `visible` 判断，父节点隐藏仍会遍历其子节点。调用方应将结果挂到世界变换为单位矩阵的节点下，以免重复应用父级变换。

## 动画、相机与粒子

`TWEEN.TweenManager.Timeline(target)` 可链式使用 `.to()`、`.delay()`、`.call()` 和 `.union()`。时间单位为秒，Viewer 默认挂载 `TweenPlugin`，每帧推进全局组。独立使用时可调用 `TWEEN.update(seconds)`，或使用独立的 `TWEEN.Group`。

`VirtualCameraPlugin` 在活动相机上挂载控制器及自由镜头。自定义镜头可先用 `addComponent(viewer.camera, CinestationBrain)` 创建控制器，再通过 `addNode(VirtualCamera, options)` 登记。虚拟镜头按显式选择和优先级切换。`CinetationMath` 提供阻尼、定步长插值和四元数插值。

`primitives` 包含可用 `viewer.addNode(primitives.Box, props)` 等方式挂载的图元。`Particle` 包含粒子、行为、发射器、系统和 GPU 渲染器。可给 `Particle.System` 添加 `Emitter` 和 `GPURenderer` 后调用 `play()`。CPU 行为和实例属性写入已有原版对照，粒子的 GPU 画面仍需浏览器验证。

## 音频

在 Viewer 上通过 `viewer.addNode(AudioComponent)` 或 `viewer.addNode(PositionalAudioComponent)` 创建音源。普通与空间音源默认将监听器挂在活动相机下，也可通过节点配置中的 `listener` 指定父节点。`AudioListenerComponent` 可单独创建监听器。应用可在用户手势回调中调用 `audio.play({ url, loop: true })` 发起加载和播放，由浏览器决定 Web Audio 解锁状态。

`play()` 返回 `void`，沿用原版调用方式。默认保留正在播放的音源，传入 `force: true` 会先停止它再播放。空间音源立即更新距离参数。候选实现把加载和播放失败报告到控制台。Node 对照覆盖参数、回调时序和状态，真实浏览器解码、用户手势和空间音效仍待验证。

## 实施顺序

| 阶段 | 还原内容 | 验证方式 |
| --- | --- | --- |
| 1. 识别依赖 | 从导出、版本常量、模块内容和行为识别 Three.js、补间、后处理及工具依赖。核对上游版本、许可和内嵌改动。 | 记录来源、版本证据、原版差异和许可证。用相同版本验证代表性导出与对象身份。 |
| 2. 运行基础 | 还原事件、实体销毁、调度、属性工具、序列化、`Component`、`ComponentManager` 和 `ComponentScheduler`。 | 对比返回值、异常、生命周期顺序、回调内修改状态，以及历史序列化数据的读写。 |
| 3. Viewer 与资源 | 还原场景、相机、渲染帧、尺寸更新、设备输入、资源加载、音频和释放逻辑。 | 浏览器对照覆盖帧循环、资源错误与重复加载、输入参数、销毁后监听器及 GPU 资源释放。现有项目改写的 `DeviceInput.prototype._onResize` 纳入验收。 |
| 4. 动画与插件 | 还原补间时间线、虚拟相机与混合、后处理插件、调试工具，以及盘点发现的剩余模块。 | 固定时间步对比数值和事件序列。固定相机、分辨率、资源和浏览器配置对比渲染结果。 |
| 5. 类型与集成 | 补全声明、构建入口、使用文档、扩展指南和迁移说明。用候选入口运行现有项目和覆盖其他公开能力的最小示例。 | 对照全部导出的名字、值、嵌套成员、继承关系和类型签名。验证项目的加载、进场、开门、音效、尺寸适配与重启流程。 |

## 实现与维护约定

- 用 `src/index.ts` 保持原版导出名和入口。实现按职责拆分，只有在模块落地时才建立目录。测试参考原版，生产入口独立运行。
- 对能确认版本及行为的第三方模块优先复用原始上游实现。多个模块共享同一套 Three.js 构造器，验证 `instanceof`、资源类型和插件之间的互操作。对有内嵌改动的部分记录差异，兼容逻辑放在相关模块旁。
- 每个模块先从原版建立可执行对照，再实现候选行为。记录输入、输出、异常、可观察副作用和回收规则。原版可观察的怪异行为默认保留，改进需要显式版本策略。
- `EventEmitter` 同步倒序调用监听器，单次监听在回调执行前注销，同一事件的重复注册会告警并返回 `undefined`。当前实现类型使用 `this | undefined` 表达这个行为。原声明写成 `this`，发布类型阶段须评估对现有链式调用的影响。
- 每个还原模块随实现补齐公共用法、生命周期或资源所有权、原版兼容边界和最小示例。发布前同时提供 Viewer 入门、组件与插件扩展、故障排查和升级指南。

## 计时与组件

```ts
import { Scheduler } from "@xviewer2/xviewer";

const scheduler = new Scheduler();
const target = { uuid: "intro" };
scheduler.schedule(target, (dt, elapsed) => {
    // 此例以秒为单位，elapsed 为该任务累计的有效时间。
}, 0.5, 1);
scheduler.update(0.5);
```

`Scheduler` 每次更新最多调用每个任务一次。跨过多个间隔时，剩余时间会在后续更新中逐步处理。回调的 `this` 是目标对象，参数依次为本次更新增量和累计有效时间。`-1` 表示无限重复。单项注销沿用原版方法名 `unshedule`。

`Component` 扩展事件分发和实体生命周期，挂载后通过所属 Viewer 使用调度器。修改 `enabled` 会通知组件调度器。销毁时依次清理任务、解除节点挂载、处理禁用，再对已加载的组件调用 `onDestroy`。该回调执行时 `isValid` 仍为 `true`。`Plugin` 继承组件行为并提供 `isPlugin` 标记。

组件管理器先挂载 `dependencies(OtherComponent)(MyComponent)` 声明的依赖，再调用组件的 `onLoad` 与 `onEnable`。每帧依次运行定时任务、`start`、`update` 和 `lastUpdate`。重新启用组件时，原版会再次安排 `start`。加入事件为 `component-changed`，移除事件沿用原版的 `omponent-changed` 拼写。

生命周期队列保留原版的活动数组遍历。正在执行的组件若从队列中移除，紧随其后的组件可能延至下一帧。批量销毁同样会在遍历时解除挂载，原版在多组件节点上可能跳过紧随其后的组件。对照测试记录了这两种行为。

## 输入桥接

`DeviceInput`、`Vector2` 和 `REVISION` 已接入候选入口。输入宿主提供画布、`resize` 和 `emit`。调用 `addEventListeners()` 后会立即同步窗口尺寸。移除输入层时调用 `removeAllListeners()`。现有项目覆写的 `DeviceInput.prototype._onResize` 仍可使用。

`pointerPosition` 是 CSS 像素页面坐标，`pointer` 使用窗口尺寸归一化。`touches` 会复用历史触点对象，只有前 `touchCount` 项来自最近一次 `touchmove`。`touchstart` 和 `touchend` 只转发事件。滚轮保留原版事件名 `mousewheel`。当前测试使用 Node EventTarget 对照，浏览器真实输入和 Viewer 挂载仍待验证。

## Viewer 渲染基础

```ts
import { Viewer } from "@xviewer2/xviewer";

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
const viewer = new Viewer({ canvas });
viewer.camera.position.z = 10;

// 页面卸载时调用
viewer.destroy();
canvas.remove();
```

构造器创建活动场景和相机，注册输入，并启动 Three.js 动画循环。默认渲染插件在组件更新阶段渲染，帧增量以秒计。`resize()` 分别处理透视与正交相机。`pushScene()` 和 `popScene()` 保存及恢复场景与相机。`addNode()` 接受 Three.js 对象或构造器，也可为组件创建宿主节点。`$p` 保留原版对可复制对象和连字符属性路径的处理。

Node 对照覆盖节点创建、场景切换、视口、帧时间和销毁顺序。受控浏览器回归使用 Windows Chrome、SwiftShader、WebGL 2.0、DPR 1 和 96×64 渲染缓冲。原版和候选的普通帧及 FXAA、泛光、ACES 后处理帧各读取两个 RGBA 像素，最大通道差为 0，测试阈值为 2。两者都通过了窗口尺寸事件、输入解绑和重复销毁检查。

`RenderPlugin` 已公开导出，Viewer 启动时会自动挂载它。通过 `viewer.addNode(ImagePanorama, { url: "/panorama.jpg" })` 可创建向内渲染的球体并异步载入图片。`VideoPanorama` 提供与原版一致的空球体，调用方在其材质的 `map` 上设置视频纹理。全景组件对照核验了球面尺寸、材质朝向及图片加载后的材质更新，真实视频与 WebGL 输出仍待浏览器验证。

## 后处理、反射和诊断

通过 `viewer.addPlugin(FXAAPlugin)`、`viewer.addPlugin(BloomPlugin, { intensity: 1.2 })` 等入口启用后处理。依赖会自动挂载 `PostprocessingPlugin`，后者在启用期间暂停默认渲染插件。自定义效果可继承 `EffectPlugin`，独立通道可继承 `PassPlugin`。`PlaneReflector` 使用离屏反射目标和可选模糊，`RenderTexture` 提供通用离屏纹理。

`StatsPlugin` 可查看绘制调用、三角形及内存统计。`InspectorPlugin` 与其节点、组件、材质和灯光扩展通过 `property()` 元数据构建控制面板。当前检查器支持基本控制和纹理预览，原版材质字段自动发现、向量拖拽手势和面板样式仍需完整对照。

原版 `ShaderChunk` 与 `ShaderLib` 的改写片段已作为独立 GLSL 字典公开。候选 `WebGLRenderer` 仍走上游 r150 的内置着色器管线。原版 Scene 的环境旋转矩阵及其 uniform 注入尚未接入候选渲染器。NVFXAA、SSAO、反射及粒子使用各自的原版 GLSL 源文本，但 GPU 编译、像素输出与性能仍需实测。

## 资源与图集

```ts
import { AssetManager, Object3D } from "@xviewer2/xviewer";

const model = await AssetManager.Load<Object3D>({ url: "/models/example.glb" });
// 已创建 Viewer 时也可以加载后直接挂载到活动场景。
await viewer.load({ url: "/models/example.glb", castShadow: true });
```

`AssetManager` 按扩展名选择加载器。内建注册覆盖原版的 GLTF/GLB、FBX、HDR、JSON、图集、图片和音频扩展名。自定义加载器继承 `AssetLoader`，登记 `extensions` 并在 `load()` 中调用 `onLoad` 或 `onError`，再用 `AssetManager.RegistLoader()` 安装。GLTF/GLB 沿用原版 Draco 解码器地址，并启用随 Three.js 提供的 Meshopt 解码器。候选实现使用临时 Blob URL 适配本地文件和相对路径附件。

缓存按原始 URL 或主文件名及设置枚举顺序索引。相同键共享成功返回的对象，加载失败后可重试。`Viewer.destroy()` 清空全局缓存引用，资产的 GPU 释放仍由持有者负责。扩展名匹配区分大小写，也保留查询串。通过 `setEnvironment()` 设置环境时，默认会启动背景更新，返回的 Promise 只等待环境贴图。需要等待背景完成时，单独调用并等待 `setBackground()`，或通过 `noBackground` 关闭自动背景更新。

已对照资源分派、缓存、图集坐标和 Viewer 环境与背景时序，并解析过最小本地 GLB。浏览器回归还使用项目的 `DOOR.glb` 和 `SM_Road.glb` 核对 Draco 网格、嵌入 WebP、缓存对象及 Viewer 挂载。两个库分别加载出 12 和 24 个网格，门模型有 14 条动画，右门采样四元数一致，门模型均提交了 12 次绘制。完整应用流程、外部图片、HDR、FBX、音频和 CDN 可用性另行验证。

## 完整复刻的验收条件

严格导出检查已通过。完整验收还包括发布声明兼容、浏览器场景及原有业务流程回归，以及独立发行构建。导出名称一致只验证入口形状，默认值、事件时序、异常和视觉输出需要独立验证。每次浏览器对照记录原版哈希、运行环境和视觉误差阈值。

原版 bundle 内引用了 `xviewer.module.min.js.LICENSE.txt`，当前库目录未找到该文件。复用或发布内嵌代码前应查明其来源与许可，并补齐发行所需的声明。
