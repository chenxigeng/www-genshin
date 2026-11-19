import { Vector3 } from "three";

/** 原版自由镜头的移动策略，包含数字到名称的枚举反查。 */
export const VCamFreeLookMode = {
    0: "FREE", 1: "TRANSLATE", 2: "LOCK",
    FREE: 0, TRANSLATE: 1, LOCK: 2,
} as const;

/** 虚拟相机镜头参数。 */
export class VCamLens {
    /** 垂直视野角，单位为度。 */
    fov = 45;
    /** 近、远裁剪面的世界距离。 */
    near = 0.1;
    far = 1000;
}

/** 虚拟相机的目标偏移。 */
export class VCamAim {
    /** 每个镜头独立持有的三维追踪偏移。 */
    trackedObjectOffset = new Vector3();
}

/** 自由镜头输入、平滑和移动限制。 */
export class VCamFreeLook {
    /** 自由绕转、平移或锁定模式。 */
    mode: 0 | 1 | 2 = VCamFreeLookMode.FREE;
    /** 分别禁用水平旋转、垂直旋转、缩放及两轴平移。 */
    forbidX = false;
    forbidY = false;
    forbidZ = false;
    forbidPanX = false;
    forbidPanY = false;
    /** 输入灵敏度及平滑时间。 */
    rotateSpeed = 2;
    rotateSmoothing = 0.5;
    panSpeed = 2;
    panSmoothing = 0.5;
    /** 俯仰和水平旋转的弧度范围。 */
    phiMin = 0.001;
    phiMax = Math.PI - 0.001;
    thetaMin = -Infinity;
    thetaMax = Infinity;
    /** 相机到目标的世界距离范围。 */
    distanceMin = 0.001;
    distanceMax = Infinity;
    /** 用于旋转的触点索引。 */
    rotateTouchID = 0;
}
