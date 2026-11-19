import { Euler, MathUtils, Object3D, Quaternion, Spherical, Vector2, Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import { $p } from "../core/properties.ts";
import { Plugin } from "../core/Plugin.ts";
import type { Viewer } from "../core/Viewer.ts";
import { DeviceInput } from "../input/DeviceInput.ts";
import { quarticDamp } from "./damping.ts";
import { VCamFreeLook, VCamFreeLookMode } from "./settings.ts";
import { CinestationBrain, VirtualCamera } from "./VirtualCamera.ts";
import type { VirtualCameraOptions } from "./VirtualCamera.ts";

/** 虚拟镜头与可从挂载参数配置的输入开关。 */
type FreelookOptions = VirtualCameraOptions & Partial<Pick<VCamFreeLook,
    "forbidX" | "forbidY" | "forbidZ" | "forbidPanX" | "forbidPanY" | "mode"
>>;

/** 按指针和多点触摸调整虚拟镜头。 */
export class FreelookVirtualCamera extends VirtualCamera {
    /** 跟踪指针按键、触点和上次坐标。 */
    private _button = -1;
    private _touchID = -1;
    private _preLoc0 = new Vector2();
    private _preLoc1 = new Vector2();
    /** 当前帧中还未应用的交互增量。 */
    private _distanceDelta = 0;
    private _rotateDelta = new Vector2();
    private _panDelta = new Vector2();
    /** 输入模式与运动限制。 */
    freelook = new VCamFreeLook();

    override onLoad({
        forbidX = false, forbidY = false, forbidZ = false,
        forbidPanX = false, forbidPanY = false, mode = VCamFreeLookMode.FREE, ...camera
    }: FreelookOptions) {
        super.onLoad(camera);
        $p(this.freelook, { forbidX, forbidY, forbidZ, forbidPanX, forbidPanY, mode });
    }

    /** 启用时连接 Viewer 输入，并清除上一轮状态。 */
    onEnable() {
        const viewer = this.viewer as Viewer;
        viewer.on(DeviceInput.POINTER_DOWN, this._onPointerDown, this);
        viewer.on(DeviceInput.POINTER_UP, this._onPointerUp, this);
        viewer.on(DeviceInput.POINTER_MOVE, this._onPointerMove, this);
        viewer.on(DeviceInput.MOUSE_WHEEL, this._onMouseWheel, this);
        viewer.on(DeviceInput.TOUCH_START, this._onTouchStart, this);
        viewer.on(DeviceInput.TOUCH_MOVE, this._onTouchMove, this);
        this.reset();
    }

    /** 禁用时只卸载此镜头登记的输入回调。 */
    onDisable() {
        const viewer = this.viewer as Viewer;
        viewer.off(DeviceInput.POINTER_DOWN, this._onPointerDown, this);
        viewer.off(DeviceInput.POINTER_UP, this._onPointerUp, this);
        viewer.off(DeviceInput.POINTER_MOVE, this._onPointerMove, this);
        viewer.off(DeviceInput.MOUSE_WHEEL, this._onMouseWheel, this);
        viewer.off(DeviceInput.TOUCH_START, this._onTouchStart, this);
        viewer.off(DeviceInput.TOUCH_MOVE, this._onTouchMove, this);
    }

    /** 清除未应用的移动和拖拽状态。 */
    reset() {
        this._button = -1;
        this._touchID = -1;
        this._rotateDelta.set(0, 0);
        this._panDelta.set(0, 0);
        this._distanceDelta = 0;
    }

    /** 从新的页面坐标开始拖动。 */
    private _onPointerDown(event: PointerEvent) {
        this._button = event.button;
        this._preLoc0.set(event.pageX, event.pageY);
    }

    /** 结束当前鼠标拖动。 */
    private _onPointerUp() { this._button = -1; }

    /** 左键旋转，中键平移。 */
    private _onPointerMove(event: PointerEvent) {
        const position = new Vector2(event.pageX, event.pageY);
        if (this._button === 0) this._rotateDelta.add(this._calculateRotateDelta(new Vector2(), this._preLoc0, position));
        if (this._button === 1) this._panDelta.add(this._calculatePanDelta(new Vector2(), this._preLoc0, position));
        this._preLoc0.copy(position);
    }

    /** 滚轮每步按原版比例调整镜头距离。 */
    private _onMouseWheel(event: WheelEvent) {
        const target = this.lookAt;
        if (!target) return;
        const distance = new Vector3().copy(target.position).add(this.aim.trackedObjectOffset).distanceTo(this.node.position);
        let desired = distance + this._distanceDelta;
        if (event.deltaY > 0) desired *= this._calculateDistanceScale(1 / 0.85);
        if (event.deltaY < 0) desired *= this._calculateDistanceScale(0.85);
        this._distanceDelta = desired - distance;
    }

    /** 记录单指旋转或双指平移和缩放的起点。 */
    private _onTouchStart(event: TouchEvent) {
        if (this._button > -1) return;
        const index = this.freelook.rotateTouchID;
        const first = event.touches[index];
        const second = event.touches[index + 1];
        if (first && second) {
            this._preLoc0.set(first.pageX, first.pageY);
            this._preLoc1.set(second.pageX, second.pageY);
        } else if (first) {
            this._touchID = first.identifier;
            this._preLoc0.set(first.pageX, first.pageY);
        }
    }

    /** 更新触摸缩放、平移或单指旋转增量。 */
    private _onTouchMove(event: TouchEvent) {
        if (this._button > -1) return;
        const index = this.freelook.rotateTouchID;
        const first = event.touches[index];
        const second = event.touches[index + 1];
        if (first && second) {
            const current0 = new Vector2(first.pageX, first.pageY);
            const current1 = new Vector2(second.pageX, second.pageY);
            if (this.lookAt) {
                const target = this.lookAt.position.clone().add(this.aim.trackedObjectOffset);
                const distance = target.distanceTo(this.node.position);
                const scale = this._calculateDistanceScale(this._preLoc0.distanceTo(this._preLoc1) / current0.distanceTo(current1));
                this._distanceDelta = (distance + this._distanceDelta) * scale - distance;
            }
            const previousCenter = this._preLoc0.clone().add(this._preLoc1).multiplyScalar(0.5);
            const currentCenter = current0.clone().add(current1).multiplyScalar(0.5);
            this._panDelta.add(this._calculatePanDelta(new Vector2(), previousCenter, currentCenter));
            this._preLoc0.copy(current0);
            this._preLoc1.copy(current1);
        } else if (first?.identifier === this._touchID) {
            const position = new Vector2(first.pageX, first.pageY);
            this._rotateDelta.add(this._calculateRotateDelta(new Vector2(), this._preLoc0, position));
            this._preLoc0.copy(position);
        }
    }

    /** 禁止缩放时保持倍率为一。 */
    private _calculateDistanceScale(scale: number) { return this.freelook.forbidZ ? 1 : scale; }

    /** 按画布像素高度换算旋转弧度。 */
    private _calculateRotateDelta(out: Vector2, from: Vector2, to: Vector2) {
        const options = this.freelook;
        const height = (this.viewer as Viewer).renderer.domElement.height;
        out.copy(to).sub(from).multiplyScalar(2 * options.rotateSpeed * Math.PI / height);
        out.y = -out.y;
        if (options.forbidX) out.x = 0;
        if (options.forbidY) out.y = 0;
        return out;
    }

    /** 将页面坐标差归一化为平移增量。 */
    private _calculatePanDelta(out: Vector2, from: Vector2, to: Vector2) {
        const options = this.freelook;
        const height = (this.viewer as Viewer).renderer.domElement.height;
        out.copy(to).sub(from).multiplyScalar(options.panSpeed / height);
        if (options.forbidPanX) out.x = 0;
        if (options.forbidPanY) out.y = 0;
        return out;
    }

    /** 按当前交互模式更新镜头位置、旋转与目标偏移。 */
    override update(dt: number) {
        if (!this.lookAt) return;
        const options = this.freelook;
        const offset = this.aim.trackedObjectOffset;
        const target = this.lookAt.position.clone().add(offset);
        const { position, quaternion } = this.node;
        const rotation = this._rotateDelta;
        const significantMotion = Math.abs(rotation.x) + Math.abs(rotation.y) + Math.abs(this._distanceDelta) > 0.001;
        const retain = quarticDamp(1, 0, options.rotateSmoothing, dt);
        if (options.mode === VCamFreeLookMode.FREE && significantMotion) {
            const align = new Quaternion().setFromUnitVectors(this.node.up, Object3D.DEFAULT_UP);
            const radial = position.clone().sub(target).applyQuaternion(align);
            const spherical = new Spherical().setFromVector3(radial);
            rotation.x = spherical.theta - MathUtils.clamp(spherical.theta - rotation.x, options.thetaMin, options.thetaMax);
            spherical.theta -= rotation.x * (1 - retain);
            rotation.y = MathUtils.clamp(spherical.phi + rotation.y, options.phiMin, options.phiMax) - spherical.phi;
            spherical.phi = MathUtils.clamp(spherical.phi + rotation.y * (1 - retain), 0.001, Math.PI - 0.001);
            this._distanceDelta = MathUtils.clamp(spherical.radius + this._distanceDelta, options.distanceMin, options.distanceMax) - spherical.radius;
            spherical.radius += this._distanceDelta * (1 - retain);
            rotation.multiplyScalar(retain);
            this._distanceDelta *= retain;
            position.copy(radial.setFromSpherical(spherical).applyQuaternion(align.invert()).add(target));
        } else if (options.mode === VCamFreeLookMode.TRANSLATE && Math.abs(this._distanceDelta) > 0.001) {
            const radial = position.clone().sub(this.lookAt.position);
            const radius = radial.length();
            this._distanceDelta = MathUtils.clamp(radius + this._distanceDelta, options.distanceMin, options.distanceMax) - radius;
            const nextRadius = radius + this._distanceDelta * (1 - retain);
            this._distanceDelta *= retain;
            const next = radial.normalize().multiplyScalar(nextRadius).add(this.lookAt.position);
            offset.add(next.clone().sub(position));
            position.copy(next);
            target.copy(this.lookAt.position).add(offset);
        } else if (options.mode === VCamFreeLookMode.LOCK && significantMotion) {
            const next = new Quaternion().setFromEuler(new Euler(-rotation.y * (1 - retain), rotation.x * (1 - retain), 0)).multiply(quaternion);
            const difference = quaternion.clone().invert().multiply(next);
            quaternion.multiply(difference.multiply(next));
            rotation.multiplyScalar(retain);
        }

        if (options.mode === VCamFreeLookMode.FREE || options.mode === VCamFreeLookMode.TRANSLATE) {
            const pan = this._panDelta;
            if (Math.abs(pan.x) + Math.abs(pan.y) > 0.001) {
                const radial = position.clone().sub(target);
                const right = new Vector3().setFromMatrixColumn(this.node.matrix, 0);
                const up = new Vector3().setFromMatrixColumn(this.node.matrix, 1);
                const scale = 2 * radial.length() * Math.tan(MathUtils.degToRad(0.5 * this.lens.fov));
                const panRetain = quarticDamp(1, 0, options.panSmoothing, dt);
                offset.sub(right.multiplyScalar(pan.x * scale * (1 - panRetain)));
                offset.add(up.multiplyScalar(pan.y * scale * (1 - panRetain)));
                pan.multiplyScalar(panRetain);
                target.copy(this.lookAt.position).add(offset);
                position.copy(radial.add(target));
            }
            this.node.lookAt(target);
        }
    }
}

/** 配置主相机控制器和默认自由视角。 */
export class VirtualCameraPlugin extends Plugin {
    /** 原版检查器使用的名称。 */
    name = "VirtualCameraPlugin";
    /** 与插件启用状态联动的控制器与镜头。 */
    private _brain: CinestationBrain | null = null;
    private _freelookCamera: FreelookVirtualCamera | null = null;

    /** 在当前主镜头上装载控制器，并创建一个自由视角。 */
    onLoad(options: FreelookOptions) {
        const viewer = this.viewer as Viewer;
        const camera = viewer.camera as PerspectiveCamera;
        const props = {
            fov: camera.fov, near: camera.near, far: camera.far,
            lookAt: new Object3D(), position: new Vector3(0, 0, 4), ...options,
        };
        this._brain = viewer.addComponent(camera, CinestationBrain);
        this._freelookCamera = viewer.addNode(FreelookVirtualCamera, props);
    }

    /** 恢复控制器与镜头调度。 */
    onEnable() {
        if (this._brain) this._brain.enabled = true;
        if (this._freelookCamera) this._freelookCamera.enabled = true;
    }

    /** 暂停控制器与镜头调度。 */
    onDisable() {
        if (this._brain) this._brain.enabled = false;
        if (this._freelookCamera) this._freelookCamera.enabled = false;
    }
}
