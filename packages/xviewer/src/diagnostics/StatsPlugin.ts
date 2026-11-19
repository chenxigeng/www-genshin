import Stats from "three/examples/jsm/libs/stats.module.js";
import { Plugin } from "../core/Plugin.ts";
import type { Viewer } from "../core/Viewer.ts";

/** 将 Viewer 的渲染统计显示在 Stats.js 独立面板。 */
export class StatsPlugin extends Plugin {
    /** 帧统计与额外四个面板。 */
    private _stats = new Stats();
    private _dcPanel = new Stats.Panel("DC", "#ff8", "#221");
    private _triPanel = new Stats.Panel("TRI", "#ff8", "#221");
    private _texPanel = new Stats.Panel("TEX", "#ff8", "#221");
    private _prgPanel = new Stats.Panel("PRG", "#ff8", "#221");

    /** 按原版的面板顺序挂接到页面。 */
    onLoad() {
        this._stats.addPanel(this._dcPanel);
        this._stats.addPanel(this._texPanel);
        this._stats.addPanel(this._triPanel);
        this._stats.addPanel(this._prgPanel);
        this._stats.showPanel(0);
        document.body.appendChild(this._stats.dom);
    }

    /** 读取当帧的绘制、三角形、纹理和着色程序数量。 */
    update(_dt: number) {
        const info = (this.viewer as Viewer).renderer.info;
        this._dcPanel.update(info.render.calls, 300);
        this._triPanel.update(info.render.triangles, 500000);
        this._texPanel.update(info.memory.textures, 200);
        this._prgPanel.update(info.programs!.length, 50);
        this._stats.update();
    }
}
