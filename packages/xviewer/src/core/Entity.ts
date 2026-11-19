import { EventEmitter } from "./EventEmitter.ts";

/** 创建与原版数字枚举兼容的双向生命周期标志。 */
const flagValues = {
    Destroyed: 1,
    OnLoadCalled: 2,
    OnEnableCalled: 4,
    StartCalled: 8,
    Deactivating: 16,
};
const flags = Object.assign(
    Object.fromEntries(Object.entries(flagValues).map(([name, value]) => [value, name])),
    flagValues,
);

/** 所有实体共享递增的字符串 ID，供调度器分组。 */
let nextId = 100;

/** 为组件和管理器提供身份、事件和销毁状态。 */
export class Entity extends EventEmitter {
    static Flags = flags;
    uuid = String(nextId++);
    name = "";
    _objFlags = 0;
    /** 可选的清理钩子，由实体子类实现。 */
    protected _onPreDestroy?(): void;

    constructor(name?: string) {
        super();
        this.name = name || this.name;
    }

    /** 设置一个或多个生命周期标志。 */
    __setFlag(flag: number) {
        this._objFlags |= flag;
    }

    /** 清除指定的生命周期标志。 */
    __clearFlag(flag: number) {
        this._objFlags &= ~flag;
    }

    /** 判断指定掩码是否有任意一位已设置。 */
    __getFlag(flag: number) {
        return Boolean(this._objFlags & flag);
    }

    /** 销毁钩子成功执行后，实体才会失效。 */
    get isValid() {
        return !(this._objFlags & flags.Destroyed);
    }

    /** 首次销毁返回 true，已销毁时返回 false。 */
    destroy() {
        if (this.__getFlag(flags.Destroyed)) return false;
        this.destroyImmediate();
        return true;
    }

    /** 直接执行销毁钩子，兼容原版允许重复直接调用的行为。 */
    destroyImmediate() {
        if (this._onPreDestroy) this._onPreDestroy();
        this.__setFlag(flags.Destroyed);
    }
}
