/** 提供实体与场景组件共用的同步事件分发。 */
export class EventEmitter {
    /** 按事件名保存监听器，注册顺序影响分发和注销。 */
    private _events: Record<string, Listener[] | undefined> = {};

    /** 清空全部监听器。 */
    clear() {
        this._events = {};
        return this;
    }

    /** 注册监听器，可指定回调上下文与单次触发。 */
    on(name: string, callback: EventCallback, target?: unknown, once = false): this | undefined {
        const listeners = this._events[name] ?? (this._events[name] = []);
        if (listeners.some((listener) => listener.callback === callback && (!target || listener.target === target))) {
            console.warn(`event: ${name} duplicate registered`);
            return;
        }
        listeners.push({ name, callback, target, once });
        return this;
    }

    /** 移除第一个匹配项，省略上下文时只按回调匹配。 */
    off(name: string, callback: EventCallback, target?: unknown) {
        const listeners = this._events[name];
        if (listeners) {
            const index = listeners.findIndex((listener) => listener.callback === callback && (!target || listener.target === target));
            this._removeEvent(listeners, index, name);
        }
        return this;
    }

    /** 注册监听器，并在容器上保存可供批量注销的记录。 */
    onof(name: string, callback: EventCallback, container: object & ListenerContainer) {
        if (container._listeners === undefined) container._listeners = [];
        container._listeners.push({ name, callback });
        this.on(name, callback);
        return this;
    }

    /** 按容器记录注销监听器。原版保留容器上的记录。 */
    offof(container: object & ListenerContainer) {
        // 保留原版在未初始化容器上抛错的行为。
        for (const { name, callback } of container._listeners!) {
            this.off(name, callback);
        }
        return this;
    }

    /** 移除指定记录，并清理空的事件列表。 */
    private _removeEvent(listeners: Listener[], index: number, name: string) {
        if (index >= 0) {
            listeners.splice(index, 1);
            if (listeners.length === 0) delete this._events[name];
        }
        return this;
    }

    /** 移除所有绑定到指定上下文的监听器。 */
    targetOff(target: object) {
        for (const name in this._events) {
            const listeners = this._events[name]!;
            for (let index = listeners.length - 1; index >= 0; index--) {
                if (listeners[index].target === target) this._removeEvent(listeners, index, name);
            }
        }
    }

    /** 同步倒序分发，在执行单次回调前注销它，以兼容重入。 */
    emit(name: string, ...args: unknown[]) {
        const listeners = this._events[name];
        if (listeners) {
            for (let index = listeners.length - 1; index >= 0; index--) {
                // 分发器依据事件名转发参数，参数契约由事件的注册方和发送方维护。
                const listener = listeners[index] as Omit<Listener, "callback"> & {
                    /** 在动态分发边界接收事件参数。 */
                    callback: (...args: unknown[]) => unknown;
                };
                if (listener.once) this._removeEvent(listeners, index, name);
                if (listener.target) listener.callback.apply(listener.target, args);
                else listener.callback(...args);
            }
        }
        return this;
    }
}
/** 事件的参数由各调用方定义，分发器原样转交。 */
type EventCallback = (...args: never[]) => unknown;

/** 容器可记录后续需要批量注销的事件。 */
export interface ListenerContainer {
    /** 调用 onof 时初始化，注销后仍保留。 */
    _listeners?: {
        /** 注册的事件名。 */
        name: string;
        /** 用于注销的原始回调引用。 */
        callback: EventCallback;
    }[];
}

/** 分发器保存的单条监听记录。 */
interface Listener {
    /** 注册的事件名。 */
    name: string;
    /** 执行及注销时使用的回调引用。 */
    callback: EventCallback;
    /** 可选的回调上下文。 */
    target?: unknown;
    /** 是否在首次执行前注销。 */
    once: boolean;
}
