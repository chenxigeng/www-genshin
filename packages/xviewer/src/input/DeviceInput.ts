import { Vector2 } from "three";

/** 输入层所需的 Viewer 能力。 */
interface InputHost {
    /** 提供接收输入的渲染画布。 */
    renderer: { domElement: HTMLElement };
    /** 将窗口尺寸同步到渲染器。 */
    resize(width: number, height: number): void;
    /** 将输入事件或尺寸参数转交给场景。 */
    emit(name: string, ...args: unknown[]): unknown;
}

/** 触点缓存中的一条记录。 */
interface InputTouch {
    /** 浏览器提供的触点标识。 */
    id: number;
    /** 页面坐标，单位为 CSS 像素。 */
    position: Vector2;
}

/** DOM input events plus the legacy wheel event used by the original. */
type InputEventMap = HTMLElementEventMap & {
    /** 旧式滚轮事件，沿用原版事件名。 */
    mousewheel: WheelEvent;
};

/** 将画布与窗口事件转发给 Viewer，并保存最近一次收到的输入状态。 */
export class DeviceInput {
    static readonly MOUSE_WHEEL = "mousewheel";
    static readonly TOUCH_START = "touchstart";
    static readonly TOUCH_END = "touchend";
    static readonly TOUCH_MOVE = "touchmove";
    static readonly POINTER_DOWN = "pointerdown";
    static readonly POINTER_UP = "pointerup";
    static readonly POINTER_MOVE = "pointermove";
    static readonly KEYDOWN = "keydown";
    static readonly KEYPRESS = "keypress";
    static readonly KEYUP = "keyup";
    static readonly RESIZE = "resize";

    /** 输入事件的接收者。 */
    viewer: InputHost;
    /** 监听器的注销回调，每次注册单独记录。 */
    private _listeners: (() => void)[] = [];
    /** 最近一次滚轮位移及触点缓存，活动范围由 touchCount 给出。 */
    private _mouseWheel = 0;
    private _touches: InputTouch[] = [];
    private _touchCount = 0;
    /** 最近的鼠标按键、页面坐标和归一化指针坐标。 */
    private _pointerButton = -1;
    private _pointerPosition = new Vector2();
    private _pointer = new Vector2();
    /** 按 KeyboardEvent.key 保存最近的按键状态。 */
    private _keys: Record<string, boolean> = {};

    constructor(viewer: InputHost) {
        this.viewer = viewer;
    }

    get pointerButton() { return this._pointerButton; }
    get pointer() { return this._pointer; }
    get pointerPosition() { return this._pointerPosition; }
    get mouseWheel() { return this._mouseWheel; }
    get touchCount() { return this._touchCount; }
    get touches() { return this._touches; }
    get keys() { return this._keys; }

    /** 绑定窗口及画布事件，并立即同步一次尺寸。 */
    addEventListeners() {
        const canvas = this.viewer.renderer.domElement;
        canvas.style.touchAction = "none";
        this._addEventListener(window, "resize", () => this._onResize());
        this._addEventListener(canvas, "contextmenu", (event) => event.preventDefault());
        this._addEventListener(canvas, "pointerdown", (event) => this._onPointerDown(event));
        this._addEventListener(canvas, "pointerup", (event) => this._onPointerUp(event));
        this._addEventListener(canvas, "pointermove", (event) => this._onPointerMove(event));
        this._addEventListener(canvas, "mousewheel", (event) => this._onMouseWheel(event));
        this._addEventListener(canvas, "touchstart", (event) => this._onTouchStart(event));
        this._addEventListener(canvas, "touchend", (event) => this._onTouchEnd(event));
        this._addEventListener(canvas, "touchmove", (event) => this._onTouchMove(event));
        this._addEventListener(canvas, "keydown", (event) => this._onKeyDown(event));
        this._addEventListener(canvas, "keypress", (event) => this._onKeyPress(event));
        this._addEventListener(canvas, "keyup", (event) => this._onKeyUp(event));
        this._onResize();
    }

    /** 保留原型方法供现有项目覆写尺寸计算。 */
    _onResize() {
        this.viewer.resize(window.innerWidth, window.innerHeight);
        this.viewer.emit(DeviceInput.RESIZE, window.innerWidth, window.innerHeight);
    }

    /** 保存按下的鼠标键并禁用默认行为。 */
    private _onPointerDown(event: PointerEvent) {
        event.preventDefault();
        this._pointerButton = event.button;
        this.viewer.emit(DeviceInput.POINTER_DOWN, event);
    }

    /** 重置按键状态并转发抬起事件。 */
    private _onPointerUp(event: PointerEvent) {
        event.preventDefault();
        this._pointerButton = -1;
        this.viewer.emit(DeviceInput.POINTER_UP, event);
    }

    /** 使用窗口尺寸归一化页面坐标。 */
    private _onPointerMove(event: PointerEvent) {
        this._pointer.x = event.pageX / window.innerWidth * 2 - 1;
        this._pointer.y = 1 - event.pageY / window.innerHeight * 2;
        this._pointerPosition.set(event.pageX, event.pageY);
        this.viewer.emit(DeviceInput.POINTER_MOVE, event);
    }

    /** 缓存 deltaY 并阻止默认滚动。 */
    private _onMouseWheel(event: WheelEvent) {
        event.preventDefault();
        this._mouseWheel = event.deltaY;
        this.viewer.emit(DeviceInput.MOUSE_WHEEL, event);
    }

    /** 转发起始触摸，触点缓存由 touchmove 刷新。 */
    private _onTouchStart(event: TouchEvent) {
        this.viewer.emit(DeviceInput.TOUCH_START, event);
    }

    /** 转发结束触摸，保留最近一次 touchmove 的缓存。 */
    private _onTouchEnd(event: TouchEvent) {
        this.viewer.emit(DeviceInput.TOUCH_END, event);
    }

    /** 复用已分配的触点记录并更新活动数量。 */
    private _onTouchMove(event: TouchEvent) {
        const touches = event.touches;
        for (let index = touches.length - 1; index >= 0; index--) {
            const record = this._touches[index] ??= { id: -1, position: new Vector2() };
            const touch = touches[index];
            record.id = touch.identifier;
            record.position.set(touch.pageX, touch.pageY);
        }
        this._touchCount = touches.length;
        this.viewer.emit(DeviceInput.TOUCH_MOVE, event);
    }

    /** 将当前键记为按下。 */
    private _onKeyDown(event: KeyboardEvent) {
        this._keys[event.key] = true;
        this.viewer.emit(DeviceInput.KEYDOWN, event);
    }

    /** 按原版保留旧式 keypress 事件。 */
    private _onKeyPress(event: KeyboardEvent) {
        this._keys[event.key] = true;
        this.viewer.emit(DeviceInput.KEYPRESS, event);
    }

    /** 将当前键记为释放。 */
    private _onKeyUp(event: KeyboardEvent) {
        this._keys[event.key] = false;
        this.viewer.emit(DeviceInput.KEYUP, event);
    }

    /** 注册 DOM 监听器。原版注册未向 DOM 传递选项。 */
    private _addEventListener<K extends keyof InputEventMap>(
        target: Window | HTMLElement,
        name: K,
        callback: (event: InputEventMap[K]) => void,
    ) {
        const listener = callback as EventListener;
        target.addEventListener(name, listener);
        this._listeners.push(() => target.removeEventListener(name, listener));
    }

    /** 移除已注册监听器，保留原版输入缓存和画布样式。 */
    removeAllListeners() {
        for (const remove of this._listeners) remove();
        this._listeners = [];
    }
}
