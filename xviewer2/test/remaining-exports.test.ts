import assert from "node:assert/strict";
import test from "node:test";
import * as candidate from "../src/index.ts";

const originalUrl = new URL("../../src/libs/xviewer/xviewer.module.min.js", import.meta.url);
const original: typeof candidate = await import(originalUrl.href);

/** 移除注释与格式，保留后续用于比较的 GLSL 字符和宏。 */
function normalizeShader(source: string) {
    return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").replace(/\s+/g, "");
}

test("命名空间成员及公开 GLSL 与原版一致", () => {
    for (const name of ["Particle", "TWEEN", "examples", "primitives", "CinetationMath", "ShaderLib", "UniformsLib"] as const) {
        assert.deepEqual(Object.keys(candidate[name]).sort(), Object.keys(original[name]).sort(), name);
    }
    for (const [name, shader] of Object.entries(candidate.ShaderChunk)) {
        assert.equal(normalizeShader(shader), normalizeShader(Reflect.get(original.ShaderChunk, name) as string), name);
    }
    assert.deepEqual(Object.keys(candidate.ShaderChunk).sort(), Object.keys(original.ShaderChunk).sort());
});

/** 使用人工时间推进包含循环、嵌套值和链回调的补间。 */
function tweenTrace(lib: typeof candidate) {
    const { Tween, TweenManager, Group, removeAll, getAll, update } = lib.TWEEN;
    const target = { value: 0, nested: { value: 2 } };
    const traces: unknown[] = [];
    const group = new Group();
    const tween = new Tween(target, group).from({ value: 2 }).to({ value: 6, nested: { value: 10 } }, 2)
        .call(() => traces.push("finish")).repeat(1).yoyo(true).onRepeat(() => traces.push("repeat"));
    tween.start(10);
    group.update(11);
    traces.push(target.value, target.nested.value);
    tween.pause(11);
    group.update(12);
    traces.push(target.value);
    tween.resume(13);
    for (const time of [14, 15, 16]) {
        group.update(time);
        traces.push(target.value, target.nested.value, tween.isPlaying());
    }
    try {
        const object = { x: 1 };
        const sequence = TweenManager.Timeline(object)
            .to({ x: 4 }, 1).delay(0.5).call(() => traces.push(["timeline", object.x]))
            .union().repeat(1).start();
        const t0 = Reflect.get(getAll()[0], "_startTime") as number;
        for (const offset of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) {
            update(t0 + offset);
            traces.push(object.x);
        }
        sequence.stop();
        return traces;
    } finally {
        removeAll();
    }
}

test("秒级补间、暂停恢复和合并时间线与原版一致", () => {
    assert.deepEqual(tweenTrace(candidate), tweenTrace(original));
});

/** 运行粒子创建、死亡、池复用与本帧 GPU 缓冲提交。 */
function particleTrace(lib: typeof candidate) {
    const { Particle } = lib;
    const system = new Particle.System();
    system.node = new lib.Object3D();
    const renderer = new Particle.GPURenderer({ maxParticles: 4 });
    const controller = new Particle.Controller({ count: 2, behaviours: [new Particle.Alpha(1, 0), new Particle.Force(new lib.Vector3(0.01, 0, 0))] });
    controller.onParticleCreate = (particle) => { particle.life = 1; };
    const emitter = new Particle.Emitter({ controller });
    const events: string[] = [];
    system.on("PARTICLE_CREATED", () => events.push("created"));
    system.on("PARTICLE_DEAD", () => events.push("dead"));
    system.addEmitter(emitter).addRenderer(renderer).play();
    const frames = [0.25, 0.5, 0.5, 0.25].map((time) => {
        system.update(time);
        return [
            system.getCount(),
            renderer.geometry.instanceCount,
            renderer.visible,
            Array.from(renderer.buffer.slice(0, renderer.stride)),
        ];
    });
    emitter.emit({ count: 1 });
    const returned = { frames, events, pooled: system.pool.list.length, blend: renderer.material.blending };
    system.removeRenderer(renderer);
    renderer.geometry.dispose();
    renderer.material.dispose();
    system.onDestroy();
    return returned;
}

test("粒子创建、积分、回收以及实例缓冲与原版一致", () => {
    assert.deepEqual(particleTrace(candidate), particleTrace(original));
});

/** 比较相机和后处理的代表性计算及着色配置。 */
function cameraAndEffects(lib: typeof candidate) {
    const result: unknown[] = [];
    const lens = new lib.VCamLens();
    const aim = new lib.VCamAim();
    result.push(lens, aim.trackedObjectOffset.toArray(), { ...new lib.VCamFreeLook() });
    const math = lib.CinetationMath;
    const from = new lib.Vector3(0, 0, 0);
    const to = new lib.Vector3(3, 4, 0);
    result.push(math.VInterpConstantTo(from, to, 0.1, 2, new lib.Vector3()).toArray());
    result.push(math.VInterpTo(from, to, 0.1, 2, new lib.Vector3()).toArray());
    result.push(math.exponentialDamp(0, 1, 1, 0.25), math.quarticDamp(0, 1, 1, 0.25));

    const bloom = new lib.BloomPlugin();
    bloom.initialize({ intensity: 1.2, luminanceThreshold: 0.75 });
    const fxaa = new lib.FXAAPlugin();
    fxaa.initialize({});
    fxaa.samples = 8;
    const toneMapping = new lib.ToneMappingPlugin();
    toneMapping.initialize({ mode: lib.ToneMappingMode.ACES_FILMIC });
    for (const plugin of [bloom, fxaa, toneMapping]) {
        const fragment = Reflect.get(plugin.effect, "fragmentShader") as string;
        result.push([plugin.name, plugin.effect.getName(), normalizeShader(fragment)]);
        plugin.effect.dispose();
    }
    result.push(bloom.intensity, bloom.luminanceThreshold, fxaa.samples, toneMapping.mode);
    return result.map((item) => item === lens ? { ...lens } : item);
}

test("相机参数、插值和泛光、抗锯齿、色调映射配置与原版一致", () => {
    assert.deepEqual(cameraAndEffects(candidate), cameraAndEffects(original));
});
