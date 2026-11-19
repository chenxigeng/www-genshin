import {
    AdditiveBlending, Color as ThreeColor, DynamicDrawUsage, Euler, InstancedBufferGeometry,
    InstancedInterleavedBuffer, InterleavedBufferAttribute, MathUtils, Mesh, PlaneGeometry,
    Quaternion, ShaderMaterial, Vector3, Vector4,
} from "three";
import type { Blending, Object3D, Texture } from "three";
import { Easing } from "@tweenjs/tween.js";
import { Component } from "../core/Component.ts";
import { $p } from "../core/properties.ts";
import { fragmentShader, vertexShader } from "./shaders.ts";

/** 粒子生命周期使用的归一化进度曲线。 */
type ProgressCurve = (progress: number) => number;

/** 原版粒子系统公开的缓动函数。 */
export const ease = {
    easeLinear: Easing.Linear.None,
    easeInQuad: Easing.Quadratic.In, easeOutQuad: Easing.Quadratic.Out, easeInOutQuad: Easing.Quadratic.InOut,
    easeInCubic: Easing.Cubic.In, easeOutCubic: Easing.Cubic.Out, easeInOutCubic: Easing.Cubic.InOut,
    easeInQuart: Easing.Quartic.In, easeOutQuart: Easing.Quartic.Out, easeInOutQuart: Easing.Quartic.InOut,
    easeInSine: Easing.Sinusoidal.In, easeOutSine: Easing.Sinusoidal.Out, easeInOutSine: Easing.Sinusoidal.InOut,
    easeInExpo: Easing.Exponential.In, easeOutExpo: Easing.Exponential.Out, easeInOutExpo: Easing.Exponential.InOut,
    easeInCirc: Easing.Circular.In, easeOutCirc: Easing.Circular.Out, easeInOutCirc: Easing.Circular.InOut,
    easeInBack: Easing.Back.In, easeOutBack: Easing.Back.Out, easeInOutBack: Easing.Back.InOut,
};

/** 赋值给目标已有的自有字段，兼容进行按需抽样的 Span 对象。 */
export function setPrototypeByObj<T extends object>(target: T, props?: object, exclude?: string[]) {
    const source = props as Record<string, unknown>;
    for (const key in source) {
        if (!Object.prototype.hasOwnProperty.call(target, key) || exclude?.includes(key)) continue;
        const value = source[key] as { constructor: { type?: string }; getValue(): unknown };
        Reflect.set(target, key, value.constructor.type === "Span" ? value.getValue() : value);
    }
    return target;
}

/** 给目标已有的字段赋值，向量等可复制对象保持身份。 */
export function copyProperties<T extends object>(target: T, props: object) {
    const source = props as Record<string, unknown>;
    for (const key in source) {
        if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
        const current = Reflect.get(target, key) as { copy?: (value: unknown) => unknown } | undefined;
        if (current?.copy) current.copy(source[key]);
        else Reflect.set(target, key, source[key]);
    }
    return target;
}

/** 粒子可独立运行，也可由发射器和场景系统持有。 */
export class Particle {
    /** 发射器内的产生顺序和秒级寿命状态。 */
    index = 0;
    age = 0;
    life = Infinity;
    energy = 1;
    progress = 0;
    dead = false;
    sleep = false;
    delay = 0;
    /** 单次模拟步骤的物理和几何数据。 */
    acceleration = new Vector3();
    scale = new Vector3(1, 1, 1);
    position = new Vector3();
    velocity = new Vector3();
    rotation = new Euler();
    mass = 1;
    /** 当前外观、行为及对象池复用状态。 */
    behaviours: Behaviour[] = [];
    parent: Emitter | System | null = null;
    color = new ThreeColor();
    alpha = 1;
    easing: ProgressCurve = ease.easeLinear;
    transform: Record<string, unknown> = {};
    rand = new Vector3();

    constructor(options?: Partial<Particle>) { setPrototypeByObj(this, options); }

    /** 重置可复用字段，原版保留 index 和 transform 容器。 */
    reset() {
        this.age = this.progress = this.delay = 0;
        this.life = Infinity;
        this.energy = this.alpha = this.mass = 1;
        this.dead = this.sleep = false;
        this.acceleration.set(0, 0, 0);
        this.scale.set(1, 1, 1);
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.rotation.set(0, 0, 0);
        this.parent = null;
        this.color.setRGB(1, 1, 1);
        this.easing = ease.easeLinear;
        this.rand.set(0, 0, 0);
        this.removeAllBehaviours();
        return this;
    }

    /** 标记结束并解除上级关联。 */
    destroy() { this.dead = true; this.parent = null; return this; }

    /** 更新寿命，然后倒序应用行为。 */
    update(dt: number) {
        if (this.sleep || this.dead) return false;
        if (this.delay > 0) {
            this.delay -= dt;
            return false;
        }
        this.age += dt;
        if (this.age > this.life) {
            if (!(this.energy > 0)) {
                this.destroy();
                return false;
            }
            this.energy = 0;
            this.progress = 1;
        } else {
            this.progress = this.easing(MathUtils.clamp(this.age / this.life, 0, 1));
            this.energy = 1 - this.progress;
        }
        for (let index = this.behaviours.length - 1; index >= 0; index--) {
            this.behaviours[index].applyBehaviour(this, dt, this.progress);
        }
        return true;
    }

    /** 按登记顺序初始化新行为。 */
    addBehaviour(...behaviours: Behaviour[]) {
        for (const behaviour of behaviours) {
            this.behaviours.push(behaviour);
            behaviour.initialize(this);
        }
    }
    /** 移除第一个匹配的行为。 */
    removeBehaviour(behaviour: Behaviour) {
        const index = this.behaviours.indexOf(behaviour);
        if (index !== -1) this.behaviours.splice(index, 1);
    }
    /** 清空粒子上的行为。 */
    removeAllBehaviours() { this.behaviours.length = 0; }
}

/** 粒子数值、外观和受力行为的基类。 */
export class Behaviour {
    /** 禁用后停止调用 mutate，初始化仍然执行。 */
    enabled: boolean;
    constructor(enabled = true) { this.enabled = enabled; }
    /** 调用已启用的行为。 */
    applyBehaviour(particle: Particle, dt: number, progress: number) {
        if (this.enabled) this.mutate(particle, dt, progress);
    }
    /** 在行为加入粒子后保存起始数据。 */
    initialize(_particle: Particle) {}
    /** 修改当前粒子。 */
    mutate(_particle: Particle, _dt: number, _progress: number) {}
}

/** 随寿命改变透明度。 */
export class Alpha extends Behaviour {
    /** 设置起始透明度、可选终值与进度曲线。 */
    alphaA: number;
    alphaB?: number;
    easing: ProgressCurve;
    constructor(from = 1, to?: number, easing = ease.easeLinear, enabled?: boolean) {
        super(enabled);
        this.alphaA = from; this.alphaB = to; this.easing = easing;
    }
    /** 将原始范围保存到粒子。 */
    override initialize(particle: Particle) {
        particle.transform.alphaA = this.alphaA;
        particle.transform.alphaB = this.alphaB;
    }
    /** 在开始透明度与结束透明度之间插值。 */
    override mutate(particle: Particle, _dt: number, ratio: number) {
        const from = particle.transform.alphaA as number;
        const to = particle.transform.alphaB as number | undefined;
        particle.alpha = to === undefined ? from : MathUtils.lerp(from, to, this.easing(ratio));
    }
}

/** 随寿命改变颜色。 */
export class Color extends Behaviour {
    /** 按独立值保存颜色的边界。 */
    colorA: ThreeColor;
    colorB?: ThreeColor;
    easing: ProgressCurve;
    constructor(from = new ThreeColor(), to?: ThreeColor, easing = ease.easeLinear, enabled?: boolean) {
        super(enabled);
        this.colorA = from; this.colorB = to; this.easing = easing;
    }
    /** 创建当前粒子的颜色边界。 */
    override initialize(particle: Particle) {
        particle.transform.colorA = this.colorA.clone();
        particle.transform.colorB = this.colorB?.clone();
    }
    /** 将粒子颜色移动到当前寿命进度。 */
    override mutate(particle: Particle, _dt: number, ratio: number) {
        particle.color.copy(particle.transform.colorA as ThreeColor);
        const target = particle.transform.colorB as ThreeColor | undefined;
        if (target) particle.color.lerp(target, this.easing(ratio));
    }
}

/** 随寿命改变三轴尺寸。 */
export class Scale extends Behaviour {
    /** 此行为应用的尺寸边界和曲线。 */
    scaleA: Vector3;
    scaleB?: Vector3;
    easing: ProgressCurve;
    constructor(from = new Vector3(), to?: Vector3, easing = ease.easeLinear, enabled?: boolean) {
        super(enabled);
        this.scaleA = from; this.scaleB = to; this.easing = easing;
    }
    /** 为粒子复制尺寸边界。 */
    override initialize(particle: Particle) {
        particle.transform.scaleA = this.scaleA.clone();
        particle.transform.scaleB = this.scaleB?.clone();
    }
    /** 应用当前进度对应的尺寸。 */
    override mutate(particle: Particle, _dt: number, ratio: number) {
        particle.scale.copy(particle.transform.scaleA as Vector3);
        const target = particle.transform.scaleB as Vector3 | undefined;
        if (target) particle.scale.lerp(target, this.easing(ratio));
    }
}

/** 在每个模拟步骤累加强度放大 100 倍的力。 */
export class Force extends Behaviour {
    /** 原版就地放大的外力向量。 */
    force: Vector3;
    constructor(force = new Vector3(), enabled?: boolean) {
        super(enabled);
        this.force = force.multiplyScalar(100);
    }
    /** 为粒子复制外力。 */
    override initialize(particle: Particle) { particle.transform.force = this.force.clone(); }
    /** 将力应用于帧累加值。 */
    override mutate(particle: Particle) { particle.acceleration.add(particle.transform.force as Vector3); }
}

/** 沿负 Y 轴施加重力。 */
export class Gravity extends Force {
    /** 默认重力标量。 */
    gravity: number;
    constructor(gravity = 10, enabled?: boolean) {
        super(new Vector3(0, -gravity, 0), enabled);
        this.gravity = gravity;
    }
}

/** 发射频率可使用固定值或随机区间。 */
type Range = number | [number, number];
/** 图集帧的 UV 和局部网格矩形。 */
interface ParticleFrame {
    /** 图集中帧占用区域。 */
    texCoords: Vector4;
    /** 局部顶点区域。 */
    meshCoords: Vector4;
    /** 可与图集共用的纹理。 */
    texture?: Texture | null;
}
/** 发射时传递给回调的选项。 */
interface EmitOptions {
    /** 此次创建的粒子数。 */
    count: number;
    /** 调用方可传入额外数据。 */
    [key: string]: unknown;
}

const defaultFrame = { texture: null, texCoords: new Vector4(), meshCoords: new Vector4() };
const automaticEmission: EmitOptions = { count: 1 };

/** 发射器控制发射计划、精灵帧与创建回调。 */
export class Controller {
    /** 首次加载的发射频率、次数和外观。 */
    spriteFrame: ParticleFrame = defaultFrame;
    count: Range = 1;
    interval: Range = 0;
    repeat = 1;
    billboard = true;
    behaviours: Behaviour[] = [];
    /** 客户端可在实例上安装的模拟回调。 */
    declare onParticleCreate?: (particle: Particle, options: EmitOptions) => void;
    declare onParticleUpdate?: (particle: Particle) => void;
    constructor(options: Partial<Controller> = {}) { setPrototypeByObj(this, options); }
}

/** 复用低开销对象的粒子池。 */
class ParticlePool {
    /** 已释放的粒子。 */
    list: Particle[] = [];
    /** 使用后进先出的方式复用。 */
    get(Constructor: new () => Particle) { return this.list.pop() ?? new Constructor(); }
    /** 接收结束的粒子。 */
    expire(particle: Particle) { this.list.push(particle); }
}

/** 每个步骤最多产生一批粒子。 */
class Rate {
    /** 已推进的秒数、上一批时刻和剩余次数。 */
    private elapsed = 0;
    private lastTime = 0;
    private nextInterval: number;
    private repeatCount: number;
    private count: Range;
    private interval: Range;
    private repeat: number;
    constructor(count: Range, interval: Range, repeat = 1) {
        this.count = count;
        this.interval = interval;
        this.repeatCount = this.repeat = repeat;
        this.nextInterval = this.sample(interval);
    }
    /** 重置为首次发射的状态。 */
    reset() {
        this.elapsed = this.lastTime = 0;
        this.repeatCount = this.repeat;
        this.nextInterval = this.sample(this.interval);
    }
    /** 复用原版拼写的发射时间查询。 */
    getVaue(dt: number) {
        if (this.repeatCount <= 0 && this.repeat >= 0) return 0;
        this.elapsed += dt;
        if (this.elapsed - this.lastTime < this.nextInterval) return 0;
        this.lastTime += this.nextInterval;
        this.nextInterval = this.sample(this.interval);
        this.repeatCount--;
        return this.sample(this.count) >> 0;
    }
    /** 从标量或区间产生一个数值。 */
    private sample(range: Range) {
        if (typeof range === "number") return range;
        const [min, max] = range;
        return min === max ? min : min + Math.random() * (max - min);
    }
}

/** 根据独立计时器产生并回收粒子。 */
export class Emitter extends Particle {
    /** 发射器的直接宿主为粒子系统。 */
    declare parent: System | null;
    /** 当前发射计划及存活的粒子。 */
    rate = new Rate(1, 0.1);
    playing = false;
    particles: Particle[] = [];
    damping = 0.006;
    controller = new Controller();
    constructor(options?: Partial<Emitter>) {
        super();
        setPrototypeByObj(this, options);
        this.initialize(this.controller);
    }
    /** 以控制器参数初始化发射计划。 */
    initialize({ count, interval, repeat, behaviours }: Controller) {
        this.rate = new Rate(count, interval, repeat);
        this.behaviours = behaviours;
    }
    /** 推进计时、生成和积分。 */
    override update(dt: number) {
        if (this.sleep || this.dead) return false;
        this.age += dt;
        if (this.age > this.life && this.particles.length === 0) this.destroy();
        if (this.playing) this.generate(dt);
        if (this.particles.length) this.integrate(dt);
        return true;
    }
    /** 触发粒子更新事件并使用原版有界时间步做欧拉积分。 */
    integrate(dt: number) {
        const step = MathUtils.clamp(60 * dt, 0.5, 1.5);
        for (let index = this.particles.length - 1; index >= 0; index--) {
            const particle = this.particles[index];
            if (particle.update(dt)) {
                this.parent?.emit("PARTICLE_UPDATE", particle);
                this.controller.onParticleUpdate?.(particle);
                if (!particle.sleep) {
                    if (particle.mass !== 1) particle.acceleration.multiplyScalar(1 / particle.mass);
                    particle.velocity.add(particle.acceleration.multiplyScalar(step));
                    particle.position.add(particle.velocity.multiplyScalar(step));
                    particle.acceleration.set(0, 0, 0);
                }
            }
            if (particle.dead) {
                this.particles.splice(index, 1);
                this.parent?.pool.expire(particle);
                this.parent?.emit("PARTICLE_DEAD", particle);
            }
        }
    }
    /** 获取池对象、应用行为并通知调用方。 */
    createParticle(options: EmitOptions) {
        const particle = this.parent!.pool.get(Particle);
        particle.reset();
        particle.addBehaviour(...this.behaviours);
        particle.parent = this;
        particle.index = this.particles.length;
        this.particles.push(particle);
        this.parent?.emit("PARTICLE_CREATED", particle);
        this.controller.onParticleCreate?.(particle, options);
    }
    /** 处理自动发射。 */
    generate(dt: number) {
        for (let count = automaticEmission.count = this.rate.getVaue(dt); count--;) this.createParticle(automaticEmission);
    }
    /** 手动发射指定粒子数，最少一个。 */
    emit(options: EmitOptions) {
        for (let count = options.count = Math.max(1, options.count); count--;) this.createParticle(options);
    }
    /** 从发射计划首项开始。 */
    play() { this.playing = true; this.rate.reset(); }
    /** 停止自动发射，已存在的粒子继续更新。 */
    stop() { this.playing = false; }
}

/** 场景树中的粒子系统。 */
export class System extends Component {
    /** 宿主用于挂接粒子网格。 */
    declare node: Object3D;
    /** 系统持有的播放状态、对象池、发射器和渲染器。 */
    playing = false;
    pool = new ParticlePool();
    emitters: Emitter[] = [];
    renderers: BaseRenderer[] = [];
    /** 保留原自动命名与节点属性设置。 */
    onLoad({ name, ...props }: { name?: string } & Record<string, unknown>) {
        this.name = name || "ParticleSystem-" + this.uuid;
        $p(this.node, props);
    }
    /** 将发射器加入当前系统。 */
    addEmitter(emitter: Emitter) {
        emitter.parent = this;
        this.emitters.push(emitter);
        this.emit("EMITTER_ADDED", emitter);
        return this;
    }
    /** 解除发射器与系统关联。 */
    removeEmitter(emitter: Emitter) {
        if (emitter.parent === this) {
            emitter.parent = null;
            this.emitters.splice(this.emitters.indexOf(emitter), 1);
            this.emit("EMITTER_REMOVED", emitter);
        }
        return this;
    }
    /** 加载渲染器网格及其订阅。 */
    addRenderer(renderer: BaseRenderer) { this.renderers.push(renderer.init(this)); return this; }
    /** 从系统解绑渲染器。 */
    removeRenderer(renderer: BaseRenderer) { this.renderers.splice(this.renderers.indexOf(renderer.reset()), 1); return this; }
    /** 并行启动已有发射器。 */
    play() {
        for (let index = this.emitters.length - 1; index >= 0; index--) this.emitters[index].play();
        this.playing = true;
        return this;
    }
    /** 暂停整个系统的更新。 */
    stop() { this.playing = false; return this; }
    /** 倒序更新发射器，最后提交本帧渲染。 */
    update(dt: number) {
        if (!this.playing) return;
        for (let index = this.emitters.length - 1; index >= 0; index--) {
            const emitter = this.emitters[index];
            emitter.update(dt);
            if (emitter.particles.length) this.emit("SYSTEM_UPDATE", this);
        }
        this.emit("SYSTEM_UPDATE_AFTER", this);
    }
    /** 返回所有发射器内的粒子数。 */
    getCount() { return this.emitters.reduce((count, emitter) => count + emitter.particles.length, 0); }
    /** 逐一销毁发射器与渲染器。 */
    onDestroy() {
        for (let index = this.emitters.length - 1; index >= 0; index--) this.emitters[index].destroy();
        for (let index = this.renderers.length - 1; index >= 0; index--) this.renderers[index].destroy();
        this.emitters.length = this.renderers.length = 0;
    }
}

/** 粒子渲染网格持有系统订阅。 */
export class BaseRenderer extends Mesh {
    /** 已挂载的系统。 */
    system?: System;
    /** 将网格加入节点并订阅两次更新通知。 */
    init(system: System) {
        this.system = system;
        system.node.add(this);
        system.on("SYSTEM_UPDATE", this.onSystemUpdate, this);
        system.on("SYSTEM_UPDATE_AFTER", this.onSystemUpdateAfter, this);
        return this;
    }
    /** 解除网格与订阅。 */
    reset() {
        if (this.system) {
            this.system.targetOff(this);
            this.system.node.remove(this);
            this.system = undefined;
        }
        return this;
    }
    /** 为原版渲染器子类保留销毁入口。 */
    destroy() {}
    /** 单个发射器步骤通知。 */
    onSystemUpdate(_system: System) {}
    /** 帧末提交入口。 */
    onSystemUpdateAfter(_system: System) {}
}

/** GPU 粒子渲染的容量、材质和额外网格属性。 */
interface GPURendererOptions extends Record<string, unknown> {
    /** 输出混合方式与深度配置。 */
    blending?: Blending;
    useAlphaSDF?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    transparent?: boolean;
    /** 每次可存储的最大实例数。 */
    maxParticles?: number;
    /** 使用的精灵纹理。 */
    map?: Texture;
}

const plane = new PlaneGeometry();
const particleRotation = new Quaternion();

/** 将图集、位姿与颜色打包成 GPU 实例属性。 */
export class GPURenderer extends BaseRenderer {
    /** 每个 GPU 实例使用 21 个交错浮点值。 */
    stride = 21;
    buffer: Float32Array;
    interleavedBuffer: InstancedInterleavedBuffer;
    declare geometry: InstancedBufferGeometry;
    declare material: ShaderMaterial;
    /** 原版预留的渲染模式值。 */
    renderMode = 0;

    constructor({
        blending = AdditiveBlending, useAlphaSDF, depthTest = true, depthWrite = false,
        transparent = true, maxParticles = 200, map, ...props
    }: GPURendererOptions = {}) {
        super();
        this.material = new ShaderMaterial({
            uniforms: { map: { value: map } },
            defines: { USE_ALPHA_SDF: Boolean(useAlphaSDF), IS_ADDITIVE_BLENDING: blending === AdditiveBlending },
            vertexShader, fragmentShader, blending, depthTest, depthWrite, transparent,
        });
        this.buffer = new Float32Array(maxParticles * this.stride);
        this.interleavedBuffer = new InstancedInterleavedBuffer(this.buffer, this.stride);
        this.interleavedBuffer.setUsage(DynamicDrawUsage);
        this.geometry = new InstancedBufferGeometry();
        this.geometry.setIndex(plane.index);
        this.geometry.setAttribute("position", plane.getAttribute("position"));
        this.geometry.setAttribute("uv", plane.getAttribute("uv"));
        for (const [name, size, offset] of [
            ["texCoords", 4, 0], ["meshCoords", 4, 4], ["spritePos", 3, 8],
            ["decorators", 2, 11], ["spriteQuat", 4, 13], ["spriteColor", 4, 17],
        ] as const) {
            this.geometry.setAttribute(name, new InterleavedBufferAttribute(this.interleavedBuffer, size, offset, false));
        }
        this.frustumCulled = false;
        $p(this, props);
    }

    /** 按原版倒序写入并更新实例数量。 */
    override onSystemUpdateAfter(system: System) {
        let count = 0;
        for (let index = system.emitters.length - 1; index >= 0; index--) {
            const particles = system.emitters[index].particles;
            for (let particle = particles.length - 1; particle >= 0; particle--) {
                this.commitInstanceBuffer(particles[particle], count++ * this.stride);
            }
        }
        this.interleavedBuffer.needsUpdate = true;
        this.geometry.instanceCount = count;
        this.visible = count > 0;
    }

    /** 将单个粒子的图集、位姿和颜色写入缓冲。 */
    commitInstanceBuffer(particle: Particle, offset = 0) {
        const { position, rotation, scale, color, alpha } = particle;
        const { billboard, spriteFrame } = (particle.parent as Emitter).controller;
        const { texCoords, meshCoords } = spriteFrame;
        if (billboard) particleRotation.x = rotation.x;
        else particleRotation.setFromEuler(rotation);
        // 逐项写入保留原版在容量不足时忽略越界属性的行为。
        for (const value of [
            texCoords.x, texCoords.y, texCoords.z, texCoords.w,
            meshCoords.x * scale.x, meshCoords.y * scale.y, meshCoords.z * scale.x, meshCoords.w * scale.y,
            position.x, position.y, position.z, billboard ? 1 : 0, 0,
            particleRotation.x, particleRotation.y, particleRotation.z, particleRotation.w,
            color.r, color.g, color.b, alpha,
        ]) this.buffer[offset++] = value;
    }
}
