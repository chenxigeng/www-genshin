import {
    Easing, Group as UpstreamGroup, Interpolation, now as milliseconds, Sequence,
    Tween as UpstreamTween, VERSION,
} from "@tweenjs/tween.js";

export { Easing, Interpolation, Sequence, VERSION };

/** xviewer 使用秒作为补间时间单位。 */
export const now = () => milliseconds() * 0.001;
export const nextId = Sequence.nextId;

/** 使用秒级时钟的补间组。 */
export class Group extends UpstreamGroup {
    /** 无显式时间时与 xviewer 的全局时钟同步。 */
    override update(time = now(), preserve = false) {
        return super.update(time, preserve);
    }
}

const mainGroup = new Group();
export const getAll = mainGroup.getAll.bind(mainGroup);
export const add = mainGroup.add.bind(mainGroup);
export const remove = mainGroup.remove.bind(mainGroup);
export const removeAll = mainGroup.removeAll.bind(mainGroup);
export const update = mainGroup.update.bind(mainGroup);

/** 固定依赖版本的内部状态，供原版扩展访问而不复制插值核心。 */
interface TweenState<T extends object> {
    /** 被驱动的对象和原始开始/结束属性表。 */
    _object: T;
    _valuesStart: Record<string, unknown>;
    _valuesEnd: Record<string, unknown>;
    _valuesStartRepeat: Record<string, unknown>;
    /** 运行时的秒级时钟与循环设置。 */
    _duration: number;
    _startTime: number;
    _delayTime: number;
    _repeat: number;
    _initialRepeat: number;
    _repeatDelayTime?: number;
    _yoyo: boolean;
    _reversed: boolean;
    /** 播放和回调状态。 */
    _isPlaying: boolean;
    _isPaused: boolean;
    _goToEnd: boolean;
    _onStartCallbackFired: boolean;
    _onStartCallback?: (target: T) => void;
    _onUpdateCallback?: (target: T, elapsed: number) => void;
    _onCompleteCallback?: (target: T) => void;
    _onRepeatCallback?: (target: T) => void;
    _easingFunction: (elapsed: number) => number;
    /** 当前补间登记的后续操作。 */
    _chainedTween?: Tween<T>;
    _chainedTweens: UpstreamTween<object>[];
    /** 调用锁定版本自身的嵌套属性插值和循环端点交换。 */
    _updateProperties(target: T, start: Record<string, unknown>, end: Record<string, unknown>, value: number): void;
    _swapEndStartRepeatValues(key: string): void;
}

/** 继承 Tween.js 18.6.4 的插值和暂停逻辑，补齐原版时间线操作。 */
export class Tween<T extends object> extends UpstreamTween<T> {
    /** 合并时间线的两个边界与首次启动标记。 */
    private _headTween: Tween<T> | null = null;
    private _tailTween: Tween<T> | null = null;
    private _headStart = false;
    /** 每轮到达终点时执行，早于 repeat 或完成回调。 */
    private _onFinishCallback?: (target: T) => void;

    constructor(target: T, group: UpstreamGroup | false = mainGroup) {
        super(target, group);
        this.duration(0);
    }

    /** 为兼容重写更新逻辑，集中收窄固定版本的私有状态。 */
    private get state() { return this as unknown as TweenState<T>; }

    /** 字符串时间相对当前时钟，数值时间是绝对秒数。 */
    override start(time: number | string = now()) {
        return super.start(typeof time === "string" ? now() + Number.parseFloat(time) : time);
    }

    /** 在秒级时钟上记录暂停时间。 */
    override pause(time = now()) { return super.pause(time); }

    /** 在秒级时钟上恢复播放。 */
    override resume(time = now()) { return super.resume(time); }

    /** 为此步骤设置明确的起始属性。 */
    from(start: object) {
        this.state._valuesStart = Object.create(start) as Record<string, unknown>;
        return this;
    }

    /** 保存终值和步骤时长。 */
    override to(end: object, duration?: number) {
        super.to(end, duration);
        this.state._chainedTween = this;
        return this;
    }

    /** 在每轮结束处插入回调。 */
    call(callback: (target: T) => void) {
        this._onFinishCallback = callback;
        return this;
    }

    /** 将一段操作首尾相接，返回控制整段的驱动补间。 */
    union(head: Tween<T>, tail: Tween<T>) {
        this._headTween = head;
        this._tailTween = tail.chain(this);
        this._headStart = true;
        return this;
    }

    /** 删除首个匹配的后续操作。 */
    unchain(...steps: UpstreamTween<object>[]) {
        const chained = this.state._chainedTweens;
        for (const step of steps) {
            const index = chained.indexOf(step);
            if (index !== -1) chained.splice(index, 1);
        }
        return this;
    }

    /** 停止且清空原版后续操作列表。 */
    override stopChainedTweens() {
        super.stopChainedTweens();
        this.state._chainedTweens = [];
        return this;
    }

    /** 完成此帧或推进到下一轮与下一步。 */
    override update(time = now(), autoStart = true): boolean {
        const state = this.state;
        if (state._isPaused) return true;
        if (!state._goToEnd && !state._isPlaying) {
            if (time > state._startTime + state._duration) return false;
            if (autoStart) this.start(time);
        }
        state._goToEnd = false;
        if (time < state._startTime) return true;
        if (!state._onStartCallbackFired) {
            state._onStartCallback?.(state._object);
            state._onStartCallbackFired = true;
        }
        const elapsed = state._duration === 0 ? 1 : Math.min((time - state._startTime) / state._duration, 1);
        state._updateProperties(state._object, state._valuesStart, state._valuesEnd, state._easingFunction(elapsed));
        state._onUpdateCallback?.(state._object, elapsed);
        if (elapsed !== 1) return true;

        this._onFinishCallback?.(state._object);
        if (this._headTween && this._headStart) {
            this._headTween.start(state._startTime + state._duration);
            this._headStart = false;
            state._isPlaying = false;
            return false;
        }
        if (state._repeat > 0) {
            if (Number.isFinite(state._repeat)) state._repeat--;
            for (const key in state._valuesStartRepeat) {
                const end = state._valuesEnd[key];
                if (!state._yoyo && typeof end === "string") {
                    state._valuesStartRepeat[key] = (state._valuesStartRepeat[key] as number) + Number.parseFloat(end);
                }
                if (state._yoyo) state._swapEndStartRepeatValues(key);
                state._valuesStart[key] = state._valuesStartRepeat[key];
            }
            if (state._yoyo) state._reversed = !state._reversed;
            state._startTime = time + (state._repeatDelayTime ?? state._delayTime);
            state._onRepeatCallback?.(state._object);
            if (this._headTween) {
                this._headStart = true;
                state._initialRepeat = state._repeat;
            }
            return true;
        }
        this._tailTween?.unchain(this);
        state._onCompleteCallback?.(state._object);
        const steps = state._chainedTweens;
        for (let index = 0, length = steps.length; index < length; index++) {
            steps[index].start(state._startTime + state._duration);
        }
        state._isPlaying = false;
        return false;
    }
}

/** 时间线中单次插值所需的起始值、缓动与回调。 */
interface ChainOptions<T extends object> {
    /** 可选的显式起始属性。 */
    from?: object;
    /** 归一化进度的缓动函数。 */
    easing?: Parameters<Tween<T>["easing"]>[0];
    /** 步骤开始、停止、完成、更新及重复回调。 */
    onStart?: Parameters<Tween<T>["onStart"]>[0];
    onStop?: Parameters<Tween<T>["onStop"]>[0];
    onComplete?: Parameters<Tween<T>["onComplete"]>[0];
    onUpdate?: Parameters<Tween<T>["onUpdate"]>[0];
    onRepeat?: Parameters<Tween<T>["onRepeat"]>[0];
}

/** 按调用顺序连接多个秒级补间步骤。 */
export class TweenChain<T extends object> {
    /** 同一时间线的目标、首项和尾项。 */
    private _object: T;
    private _tween: Tween<T>;
    private _chainedTween?: Tween<T>;

    constructor(target: T) {
        this._object = target;
        this._tween = new Tween(target);
    }

    /** 按当前全局时钟开始。 */
    start() { this._tween.start(); return this; }
    /** 停止首项及其后续步骤。 */
    stop() { this._tween.stop(); return this; }
    /** 仅重复当前尾项。 */
    repeat(count: number) { this._chainedTween!.repeat(count); return this; }
    /** 合并当前步骤为可重复的一段。 */
    union() { this._chainedTween = this._tween = new Tween(this._object).union(this._tween, this._chainedTween!); return this; }
    /** 添加零时长回调步骤。 */
    call(callback: (target: T) => void) { this._chainTween().call(callback); return this; }
    /** 添加等待步骤。 */
    delay(seconds: number) { this._chainTween().delay(seconds); return this; }
    /** 添加属性插值步骤。 */
    to(end: object, duration?: number, options?: ChainOptions<T>) {
        const step = this._chainTween().to(end, duration);
        if (options?.from) step.from(options.from);
        if (options?.easing) step.easing(options.easing);
        if (options?.onStart) step.onStart(options.onStart);
        if (options?.onStop) step.onStop(options.onStop);
        if (options?.onComplete) step.onComplete(options.onComplete);
        if (options?.onUpdate) step.onUpdate(options.onUpdate);
        if (options?.onRepeat) step.onRepeat(options.onRepeat);
        return this;
    }
    /** 复用未配置的起始补间，之后追加新步骤。 */
    private _chainTween() {
        if (!this._chainedTween) return this._chainedTween = this._tween;
        const step = new Tween(this._object);
        this._chainedTween.chain(step);
        return this._chainedTween = step;
    }
}

/** 提供原版创建、推进及按对象清理的静态入口。 */
export class TweenManager {
    /** 创建单段补间。 */
    static Tween<T extends object>(target: T) { return new Tween(target); }
    /** 创建时间线。 */
    static Timeline<T extends object>(target: T) { return new TweenChain(target); }
    /** 从全局列表移除驱动指定目标的补间。 */
    static KillTweensOf(target: object) {
        for (const step of getAll()) {
            if ((step as unknown as TweenState<object>)._object === target) remove(step);
        }
    }
    /** 推进全局组。 */
    static TweenUpdate(time?: number) { update(time); }
}
