import { MathUtils, Matrix3, Object3D, Vector3 as ThreeVector3 } from "three";

declare module "three/src/core/Object3D.js" {
    interface Object3D {
        /** 挂载并返回传入的节点。 */
        addObject<T extends Object3D>(object: T): T;
        /** 解除挂载并返回传入的节点。 */
        removeObject<T extends Object3D>(object: T): T;
    }
}

declare module "three/src/math/Matrix3.js" {
    interface Matrix3 {
        /** 将矩阵设为绕 Y 轴旋转，角度单位为弧度。 */
        makeRotationY(angle: number): this;
    }
}

// 所有场景和加载器共享 Three.js 构造器，添加方法时保留原版的非枚举描述符。
Object.defineProperties(Object3D.prototype, {
    addObject: {
        configurable: true,
        writable: true,
        value: function addObject<T extends Object3D>(this: Object3D, object: T) {
            this.add(object);
            return object;
        },
    },
    removeObject: {
        configurable: true,
        writable: true,
        value: function removeObject<T extends Object3D>(this: Object3D, object: T) {
            this.remove(object);
            return object;
        },
    },
});

Object.defineProperty(Matrix3.prototype, "makeRotationY", {
    configurable: true,
    writable: true,
    value: function makeRotationY(this: Matrix3, angle: number) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return this.set(cos, 0, sin, 0, 1, 0, -sin, 0, cos);
    },
});

/** 对外保留 Three.js 的向量实例类型。 */
export type Vector3 = ThreeVector3;

/** 原版静态向量为可变实例，方向别名也拥有独立引用。 */
export const Vector3 = Object.assign(ThreeVector3, {
    UNIT_X: new ThreeVector3(1, 0, 0),
    UNIT_Y: new ThreeVector3(0, 1, 0),
    UNIT_Z: new ThreeVector3(0, 0, 1),
    RIGHT: new ThreeVector3(1, 0, 0),
    UP: new ThreeVector3(0, 1, 0),
    ZERO: new ThreeVector3(),
    ONE: new ThreeVector3(1, 1, 1),
    NEG_ONE: new ThreeVector3(-1, -1, -1),
});

export const xviewerMathUtils = Object.assign(MathUtils, {
    /** 将数值限制在闭区间 [0, 1]。 */
    clamp01(value: number) {
        return MathUtils.clamp(value, 0, 1);
    },
});
