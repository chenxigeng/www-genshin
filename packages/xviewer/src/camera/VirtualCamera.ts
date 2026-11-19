import { MathUtils, Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { Component } from "../core/Component.ts";
import { $p } from "../core/properties.ts";
import type { Viewer } from "../core/Viewer.ts";
import { VCamAim, VCamLens } from "./settings.ts";

/** Camera blend settings used by the brain. */
interface CameraBlend {
    /** 原版缓动函数索引。 */
    style: number;
    /** 切换到新相机所用的秒数。 */
    time: number;
}

/** 原版弹跳缓动的输出分段。 */
function bounceOut(t: number) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

/** 镜头混合按原版编号排列，0 代表线性。 */
const blendFunctions: ((t: number) => number)[] = [
    (t) => t,
    ...[2, 3, 4, 5].flatMap((power) => [
        (t: number) => t ** power,
        (t: number) => 1 - (1 - t) ** power,
        (t: number) => t < 0.5 ? (2 * t) ** power / 2 : 1 - (2 - 2 * t) ** power / 2,
    ]),
    (t) => 1 - Math.cos(t * Math.PI / 2),
    (t) => Math.sin(t * Math.PI / 2),
    (t) => 0.5 * (1 - Math.cos(Math.PI * t)),
    (t) => t === 0 ? 0 : 1024 ** (t - 1),
    (t) => t === 1 ? 1 : 1 - 2 ** (-10 * t),
    (t) => t === 0 || t === 1 ? t : t < 0.5 ? 0.5 * 1024 ** (2 * t - 1) : 0.5 * (2 - 2 ** (-10 * (2 * t - 1))),
    (t) => 1 - Math.sqrt(1 - t * t),
    (t) => Math.sqrt(1 - (t - 1) ** 2),
    (t) => t < 0.5 ? 0.5 * (1 - Math.sqrt(1 - (2 * t) ** 2)) : 0.5 * (Math.sqrt(1 - (2 * t - 2) ** 2) + 1),
    (t) => t === 0 || t === 1 ? t : -(2 ** (10 * (t - 1))) * Math.sin(5 * (t - 1.1) * Math.PI),
    (t) => t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin(5 * (t - 0.1) * Math.PI) + 1,
    (t) => t === 0 || t === 1 ? t : t < 0.5
        ? -0.5 * 2 ** (10 * (2 * t - 1)) * Math.sin(5 * (2 * t - 1.1) * Math.PI)
        : 0.5 * 2 ** (-10 * (2 * t - 1)) * Math.sin(5 * (2 * t - 1.1) * Math.PI) + 1,
    (t) => t * t * (2.70158 * t - 1.70158),
    (t) => (t -= 1) * t * (2.70158 * t + 1.70158) + 1,
    (t) => (t *= 2) < 1 ? t * t * (3.5949095 * t - 2.5949095) * 0.5
        : 0.5 * ((t -= 2) * t * (3.5949095 * t + 2.5949095) + 2),
    (t) => 1 - bounceOut(1 - t),
    bounceOut,
    (t) => t < 0.5 ? 0.5 * (1 - bounceOut(1 - 2 * t)) : 0.5 * bounceOut(2 * t - 1) + 0.5,
];

/** 选择虚拟相机，并把镜头参数混合进 Viewer 的活动相机。 */
export class CinestationBrain extends Component {
    /** 优先级候选、显式选择和混合计时状态。 */
    private _vcam: VirtualCamera | null = null;
    private _vcamSolo: VirtualCamera | null = null;
    private _vcams: VirtualCamera[] = [];
    private _lerpTime = 0;
    /** 默认使用二次缓入缓出，持续四秒。 */
    brainBlend: CameraBlend = { style: 3, time: 4 };

    get vcam() { return this._vcam; }
    get vcams() { return this._vcams; }

    /** 每帧选定候选相机，并对实际相机应用位置和镜头。 */
    update(dt: number) {
        const camera = this.getActiveCamera();
        if (!camera) return;
        for (const candidate of this._vcams) candidate.enabled = candidate === camera;
        if (this._lerpTime < this.brainBlend.time) {
            this._lerpTime += dt;
            const t = MathUtils.clamp(this._lerpTime / this.brainBlend.time, 0, 1);
            this._lerpToMainCamera(camera, blendFunctions[this.brainBlend.style]?.(t) ?? t);
        } else this._lerpToMainCamera(camera, 1);
    }

    /** 显式选定镜头，并在选择发生变化时重置计时。 */
    activeCamera(camera: VirtualCamera | null, time = 4) {
        if (this._vcamSolo !== camera) {
            this._vcamSolo = camera;
            this._lerpTime = 0;
            this.brainBlend.time = time;
        }
    }

    /** 加入一个尚未注册的虚拟镜头。 */
    addCamera(camera: VirtualCamera) {
        if (!this._vcams.includes(camera)) this._vcams.push(camera);
    }

    /** 从候选队列移除镜头。 */
    removeCamera(camera: VirtualCamera) {
        const index = this._vcams.indexOf(camera);
        if (index !== -1) this._vcams.splice(index, 1);
    }

    /** 优先采用显式选择，否则取启用候选中优先级最高的一个。 */
    getActiveCamera() {
        return this._vcamSolo || this._vcams.filter((camera) => camera.enabled).sort((a, b) => b.priority - a.priority)[0];
    }

    /** 在当前相机状态与虚拟镜头的结果间插值。 */
    private _lerpToMainCamera(camera: VirtualCamera, amount: number) {
        const main = (this.viewer as Viewer).camera as PerspectiveCamera;
        const { lens } = camera;
        const { fov, near, far } = main;
        main.position.lerp(camera.finalPosition, amount);
        main.quaternion.slerp(camera.finalRotation, amount);
        main.fov = MathUtils.lerp(fov, lens.fov, amount);
        main.near = MathUtils.lerp(near, lens.near, amount);
        main.far = MathUtils.lerp(far, lens.far, amount);
        if (fov !== lens.fov || near !== lens.near || far !== lens.far) main.updateProjectionMatrix();
    }
}

/** 虚拟相机挂载选项与透传给节点的值。 */
export interface VirtualCameraOptions {
    /** 朝向此物体的位置。 */
    lookAt?: Object3D | null;
    /** 垂直视野角及裁剪距离。 */
    fov?: number;
    near?: number;
    far?: number;
    /** 其余属性交给原版属性工具应用到节点。 */
    [property: string]: unknown;
}

/** 表示可供 CinestationBrain 选择的场景镜头。 */
export class VirtualCamera extends Component {
    /** 节点按相机的 lookAt 规则工作。 */
    declare node: Object3D & { isCamera?: boolean };
    /** 复用最终位姿的返回对象。 */
    private _finalPosition = new Vector3();
    private _finalRotation = new Quaternion();
    /** 未指定镜头时参与优先级排序。 */
    priority = 10;
    /** 当前朝向和预留的跟随目标。 */
    lookAt: Object3D | null | undefined = null;
    follow: Object3D | null = null;
    /** 当前镜头及瞄准配置。 */
    lens = new VCamLens();
    aim = new VCamAim();
    /** 节点位姿之外额外应用的修正。 */
    correctPosition = new Vector3();
    correctRotation = new Quaternion();
    lookaheadPosition = new Vector3();
    /** 此镜头登记到的控制器。 */
    brain!: CinestationBrain;

    get finalPosition() { return this._finalPosition.copy(this.node.position).add(this.correctPosition); }
    get finalRotation() { return this._finalRotation.copy(this.node.quaternion).multiply(this.correctRotation); }

    /** 初始化镜头与节点属性，并向主相机上的控制器登记。 */
    onLoad({ lookAt, fov, near, far, ...props }: VirtualCameraOptions) {
        this.node.isCamera = true;
        this.lookAt = lookAt;
        $p(this.lens, { fov, near, far });
        $p(this.node, props);
        const viewer = this.viewer as Viewer;
        this.brain = viewer.getComponent(viewer.camera, CinestationBrain)!;
        this.brain.addCamera(this);
    }

    /** 解除虚拟相机登记。 */
    onDestroy() { this.brain.removeCamera(this); }

    /** 有目标时将虚拟镜头转向目标位置。 */
    update(_dt: number) {
        if (this.lookAt) this.node.lookAt(this.lookAt.position);
    }
}
