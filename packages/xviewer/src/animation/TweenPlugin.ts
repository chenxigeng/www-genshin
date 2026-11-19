import { Plugin } from "../core/Plugin.ts";
import { TweenManager } from "./tween.ts";

/** Viewer 在组件更新阶段推进全局补间时钟。 */
export class TweenPlugin extends Plugin {
    /** 使用补间库自己的单调时钟。 */
    update(_dt: number) { TweenManager.TweenUpdate(); }
}
