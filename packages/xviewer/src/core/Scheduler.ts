/** 调度器依赖的任务目标身份。 */
export interface ScheduleTarget {
    /** 用于查找同组任务的字符串标识。 */
    uuid: string;
}

/** 使用目标作为上下文，接收帧增量和任务累计运行时间。 */
export type ScheduledCallback<T extends ScheduleTarget> = (this: T, dt: number, elapsed: number) => unknown;

/** 单个计时任务，interval 与 update 使用相同的时间单位。 */
class ScheduledCall {
    private target: ScheduleTarget;
    /** 用于匹配待注销任务的原始回调。 */
    readonly callback: ScheduledCallback<never>;
    private interval: number;
    private repeat: number;
    private repeatForever: boolean;
    paused = false;
    private elapsed = 0;
    private lastTime = 0;

    constructor(target: ScheduleTarget, callback: ScheduledCallback<never>, interval: number, repeat: number) {
        this.target = target;
        this.callback = callback;
        this.interval = interval;
        this.repeat = repeat;
        this.repeatForever = repeat === -1;
    }

    /** 负数中只有 -1 表示无限重复。 */
    get lived() {
        return this.repeat > 0 || this.repeatForever;
    }

    /** 单次更新最多触发一次，超出的时间留给后续更新。 */
    update(dt: number) {
        if (this.paused || !this.lived) return;
        this.elapsed += dt;
        if (this.elapsed - this.lastTime >= this.interval) {
            this.lastTime += this.interval;
            this.repeat--;
            // 注册时已校验目标与回调的泛型对应关系，任务列表同时存放不同目标类型。
            if (this.target && this.callback) {
                (this.callback as ScheduledCallback<ScheduleTarget>).call(this.target, dt, this.elapsed);
            }
        }
    }
}

/** 由调用方逐帧推进的计时器，按目标 UUID 管理任务。 */
export class Scheduler {
    /** 按 UUID 查找组，并保留组的注册顺序。 */
    private _callers: Record<string, ScheduledCall[] | undefined> = {};
    private _callersArray: {
        /** 首次注册该 UUID 的目标。 */
        target: ScheduleTarget;
        /** 属于该 UUID 的全部任务。 */
        callers: ScheduledCall[];
    }[] = [];

    /** 暂停目标目前已注册的任务，暂停期间不累计时间。 */
    pause(target: ScheduleTarget) {
        this._callers[target.uuid]?.forEach((call) => { call.paused = true; });
    }

    /** 恢复目标目前已注册的任务。 */
    resume(target: ScheduleTarget) {
        this._callers[target.uuid]?.forEach((call) => { call.paused = false; });
    }

    /** 为目标追加任务，允许重复注册同一回调。 */
    schedule<T extends ScheduleTarget>(target: T, callback: ScheduledCallback<T>, interval: number, repeat: number) {
        let callers = this._callers[target.uuid];
        if (callers === undefined) {
            callers = this._callers[target.uuid] = [];
            this._callersArray.push({ target, callers });
        }
        callers.push(new ScheduledCall(target, callback, interval, repeat));
    }

    /** 注销首个匹配回调的任务，保留原版方法名。 */
    unshedule<T extends ScheduleTarget>(target: T, callback: ScheduledCallback<T>) {
        const callers = this._callers[target.uuid];
        if (callers) {
            const index = callers.findIndex((call) => call.callback === callback);
            if (index !== -1) callers.splice(index, 1);
        }
    }

    /** 删除按 UUID 索引的任务，并按目标对象身份移除遍历组。 */
    unscheduleAll(target: ScheduleTarget) {
        delete this._callers[target.uuid];
        const index = this._callersArray.findIndex((entry) => entry.target === target);
        if (index !== -1) this._callersArray.splice(index, 1);
    }

    /** 按原版顺序倒序遍历目标和任务，在下一次遍历时清除已到期任务。 */
    update(dt: number) {
        const groups = this._callersArray;
        for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex--) {
            const { callers } = groups[groupIndex];
            for (let index = callers.length - 1; index >= 0; index--) {
                const call = callers[index];
                if (call.lived) call.update(dt);
                else callers.splice(index, 1);
            }
        }
    }
}
