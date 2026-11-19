import assert from "node:assert/strict";
import test from "node:test";
import * as upstream from "three";
import * as candidate from "../src/index.ts";

const originalUrl = new URL("../../src/libs/xviewer/xviewer.module.min.js", import.meta.url);
const original: typeof candidate = await import(originalUrl.href);

test("候选入口与原版 491 个运行时名称、类型及常量值一致", () => {
    const keys = Object.keys(candidate) as (keyof typeof candidate)[];
    assert.equal(keys.length, 491);
    assert.deepEqual(keys.sort(), Object.keys(original).sort());
    for (const key of keys) {
        assert.ok(Object.hasOwn(original, key), key);
        assert.equal(typeof candidate[key], typeof original[key], key);
        if (typeof candidate[key] !== "function" && typeof candidate[key] !== "object") {
            assert.equal(candidate[key], original[key], key);
        }
    }
});

test("property 支持标准成员装饰器的实例初始化协议", () => {
    const initializers: ((this: object) => void)[] = [];
    class Parent {}
    class Child extends Parent {}
    candidate.property({ min: 0 })(Parent.prototype, "inherited");
    candidate.property({ max: 1 })(undefined, {
        name: "next",
        addInitializer: (initializer) => { initializers.push(initializer); },
    });
    const child = new Child();
    for (const initialize of initializers) initialize.call(child);
    assert.deepEqual(Reflect.get(child, "__properties"), { inherited: { min: 0 }, next: { max: 1 } });
    assert.deepEqual(Reflect.get(Parent.prototype, "__properties"), { inherited: { min: 0 } });
});

test("r150 旧几何体构造器仍保留继承与重命名告警", (context) => {
    const warn = context.mock.method(console, "warn", () => {});
    for (const lib of [candidate, original]) {
        const geometry: candidate.BoxBufferGeometry = new lib.BoxBufferGeometry(2, 3, 4);
        assert.ok(geometry instanceof lib.BoxGeometry);
        assert.equal(geometry.parameters.width, 2);
        assert.equal(geometry.parameters.height, 3);
        assert.equal(geometry.parameters.depth, 4);
        geometry.dispose();
    }
    assert.equal(warn.mock.callCount(), 2);
    assert.deepEqual(warn.mock.calls[0].arguments, warn.mock.calls[1].arguments);
});

test("复用的 Three.js 构造器保持实例身份，并具有原版的原型成员", () => {
    const keys = Object.keys(candidate).filter((name) => Object.hasOwn(upstream, name)) as
        (keyof typeof candidate & keyof typeof upstream)[];
    for (const key of keys) {
        const value = candidate[key];
        // 文件纹理加载器额外支持原版的第五个参数。
        if (key === "TextureLoader" || key === "AudioLoader" || key === "DataTextureLoader" || key === "FileLoader" || key === "ImageLoader") {
            assert.equal(Object.getPrototypeOf(value), upstream[key]);
            continue;
        }
        if (key === "ShaderChunk" || key === "ShaderLib") continue;
        assert.equal(value, upstream[key], key);
        if (typeof value === "function" && value.prototype) {
            const baseline = original[key] as typeof value;
            assert.deepEqual(
                Object.getOwnPropertyNames(value.prototype).sort(),
                Object.getOwnPropertyNames(baseline.prototype).sort(),
                key,
            );
        }
    }
    const mesh = new candidate.Mesh(new candidate.PlaneGeometry(), new candidate.MeshBasicMaterial());
    assert.ok(mesh instanceof candidate.Object3D);
    assert.ok(mesh instanceof upstream.Object3D);
});

/** 记录场景挂载、数学扩展及静态向量的可观察结果。 */
function extensionsTrace(lib: typeof candidate) {
    const parent = new lib.Scene();
    const child = new lib.Mesh();
    assert.equal(parent.addObject(child), child);
    assert.equal(child.parent, parent);
    assert.equal(parent.removeObject(child), child);
    assert.equal(child.parent, null);
    const matrix = new lib.Matrix3();
    assert.equal(matrix.makeRotationY(0.75), matrix);
    return {
        matrix: matrix.toArray(),
        vector: [
            lib.Vector3.UNIT_X, lib.Vector3.UNIT_Y, lib.Vector3.UNIT_Z, lib.Vector3.RIGHT,
            lib.Vector3.UP, lib.Vector3.ZERO, lib.Vector3.ONE, lib.Vector3.NEG_ONE,
        ].map((item) => item.toArray()),
        directionAliasesShareReference: [lib.Vector3.RIGHT === lib.Vector3.UNIT_X, lib.Vector3.UP === lib.Vector3.UNIT_Y],
        clamp: [-Infinity, -1, 0, 0.5, 1, 2, Infinity, NaN].map(lib.MathUtils.clamp01),
        rotation: lib.$r(0.1, 0.2, 0.3).toArray(),
        enumerable: Object.prototype.propertyIsEnumerable.call(lib.Object3D.prototype, "addObject"),
    };
}

test("xviewer 的节点与数学扩展和原版一致", () => {
    assert.deepEqual(extensionsTrace(candidate), extensionsTrace(original));
});

test("property 共享父级配置值，派生类写入时分离元数据表", () => {
    for (const lib of [candidate, original]) {
        class Base {}
        class Child extends Base {}
        const shared = { min: 0, max: 1 };
        lib.property(shared)(Base.prototype, "opacity");
        lib.property()(Child.prototype, "roughness");
        const baseMetadata: unknown = Reflect.get(Base.prototype, "__properties");
        const childMetadata: unknown = Reflect.get(Child.prototype, "__properties");
        assert.deepEqual(baseMetadata, { opacity: shared });
        assert.deepEqual(childMetadata, { opacity: shared, roughness: {} });
        assert.notEqual(baseMetadata, childMetadata);
        assert.equal(Reflect.get(Object.getPrototypeOf(Child.prototype), "__properties"), baseMetadata);
    }
});

/** 采样便捷构造器的默认值和全屏几何体的对应缓冲。 */
function geometryTrace(lib: typeof candidate) {
    const triangle = lib.getFullscreenTriangle();
    try {
        const position = triangle.getAttribute("position");
        const uv = triangle.getAttribute("uv");
        assert.ok(position instanceof lib.BufferAttribute);
        assert.ok(uv instanceof lib.BufferAttribute);
        return {
            vectors: [
                lib.$v2(2).toArray(), lib.$v3(3, undefined, 0).toArray(), lib.$v4().toArray(),
                lib.$v4(4, 0, undefined, 2).toArray(),
            ],
            quaternion: [lib.$q().toArray(), lib.$q(0.1, 0.2, 0.3, 0.4).toArray()],
            colors: [lib.$c().toArray(), lib.$c("#118899").toArray(), lib.$c(0.2, 0.4, 0.6).toArray()],
            index: triangle.index,
            positions: Array.from(position.array),
            uvs: Array.from(uv.array),
        };
    } finally {
        triangle.dispose();
    }
}

test("颜色、向量、四元数和全屏三角形工具与原版一致", () => {
    assert.deepEqual(geometryTrace(candidate), geometryTrace(original));
});

/** 采样本阶段复用的材质、动画轨道、曲线和光线计算。 */
function extendedTrace(lib: typeof candidate) {
    const curve = new lib.QuadraticBezierCurve3(
        new lib.Vector3(0, 0, 0), new lib.Vector3(1, 2, 0), new lib.Vector3(2, 0, 0),
    );
    const track = new lib.NumberKeyframeTrack(".material.opacity", [0, 1], [0, 0.8]);
    const interpolant = track.InterpolantFactoryMethodLinear(new Float32Array(1));
    const material = new lib.MeshPhongMaterial({ shininess: 17, opacity: 0.5 });
    const ray = new lib.Ray(new lib.Vector3(0, 0, 4), new lib.Vector3(0, 0, -1));
    const hit = ray.intersectSphere(new lib.Sphere(new lib.Vector3(), 2), new lib.Vector3());
    return [
        curve.getPoint(0.25).toArray(),
        Array.from(interpolant.evaluate(0.25)),
        material.clone().shininess,
        material.clone().opacity,
        hit?.toArray(),
    ];
}

test("复用的曲线、动画轨道、材质及光线计算与原版一致", () => {
    assert.deepEqual(extendedTrace(candidate), extendedTrace(original));
});

/** 对比实例分组、同名材质、筛选和父级世界变换。 */
function instancingTrace(lib: typeof candidate) {
    const model = new lib.Group();
    model.position.set(10, 0, 0);
    const parent = new lib.Group();
    parent.visible = false;
    parent.position.set(0, 5, 0);
    model.add(parent);
    const geometry = new lib.BoxGeometry();
    const material = new lib.MeshBasicMaterial({ name: "shared" });
    const alternate = new lib.MeshBasicMaterial({ name: "shared" });
    const distinct = new lib.MeshBasicMaterial({ name: "other" });
    const first = new lib.Mesh(geometry, material);
    const second = new lib.Mesh(geometry, alternate);
    const third = new lib.Mesh(geometry, distinct);
    const ignored = new lib.Mesh(geometry, material);
    const hidden = new lib.Mesh(geometry, material);
    first.position.set(1, 0, 0);
    second.position.set(2, 0, 0);
    hidden.visible = false;
    model.add(first);
    parent.add(second, third, ignored, hidden);
    const screened: number[] = [];
    const batch = lib.makeInstanced(model, { castShadow: true }, (mesh) => {
        screened.push([first, second, third, ignored, hidden].findIndex((object) => object === mesh));
        return mesh === ignored;
    });
    return {
        screened,
        retainedParents: [first.parent === model, second.parent === parent],
        groups: batch.children.map((node) => {
            assert.ok(node instanceof lib.InstancedMesh);
            const matrix = new lib.Matrix4();
            const positions = Array.from({ length: node.count }, (_, index) => {
                node.getMatrixAt(index, matrix);
                return new lib.Vector3().setFromMatrixPosition(matrix).toArray();
            });
            return [node.geometry === geometry, node.material === material, node.material === distinct, node.castShadow, positions];
        }),
    };
}

test("makeInstanced 的分组、过滤与世界矩阵和原版一致", () => {
    assert.deepEqual(instancingTrace(candidate), instancingTrace(original));
});
