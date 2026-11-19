import * as candidate from "../src/index.ts";
// 构建时把原版和候选库都放入独立页面，避免改动应用入口。
import * as original from "../../src/libs/xviewer/xviewer.module.min.js";

/** 在真实 WebGL 上采样背景与网格，检查输入解绑和重复销毁。 */
function run(lib: typeof candidate) {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const viewer = new lib.Viewer({ canvas, antialias: false, preserveDrawingBuffer: true });
    const geometry = new lib.BoxGeometry();
    const material = new lib.MeshBasicMaterial({ color: 0xd04020 });
    let resized = 0;
    try {
        viewer.stop();
        viewer.camera.position.z = 4;
        viewer.scene.background = new lib.Color(0x14284c);
        viewer.addNode(new lib.Mesh(geometry, material));
        viewer.resize(96, 64);
        const gl = viewer.renderer.getContext();
        const sample = (x: number, y: number) => {
            const pixel = new Uint8Array(4);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL readPixels failed");
            return Array.from(pixel);
        };
        viewer.update(0.016);
        const base = [sample(48, 32), sample(2, 2)];
        if (base[0][0] === base[1][0]) throw new Error("Mesh and background rendered the same color");

        viewer.addPlugin(lib.FXAAPlugin);
        viewer.addPlugin(lib.BloomPlugin, { intensity: 0.3, luminanceThreshold: 0.2 });
        viewer.addPlugin(lib.ToneMappingPlugin, { mode: lib.ToneMappingMode.ACES_FILMIC });
        viewer.emit(lib.DeviceInput.RESIZE, 96, 64);
        viewer.update(0.016);
        const effects = [sample(48, 32), sample(2, 2)];
        if (effects[0][0] === effects[1][0]) throw new Error("Postprocessing rendered a flat frame");
        if (JSON.stringify(base) === JSON.stringify(effects)) throw new Error("Postprocessing did not change the frame");

        viewer.on(lib.DeviceInput.RESIZE, () => { resized++; });
        window.dispatchEvent(new Event("resize"));
        const destroyed = viewer.destroy();
        window.dispatchEvent(new Event("resize"));
        if (!destroyed || viewer.destroy() || resized !== 1) throw new Error("Viewer cleanup or input detachment failed");
        return { base, effects, webgl: gl.getParameter(gl.VERSION) as string, resizeEvents: resized };
    } finally {
        if (viewer.isValid) viewer.destroy();
        geometry.dispose();
        material.dispose();
        canvas.remove();
    }
}

const output = document.querySelector("output")!;

/** 加载项目实际模型，记录资源结构、门动画与一次 Draw Call。 */
async function runModels(lib: typeof candidate) {
    const canvas = document.createElement("canvas");
    const viewer = new lib.Viewer({ canvas, preserveDrawingBuffer: true });
    try {
        viewer.stop();
        viewer.resize(96, 64);
        const doorURL = "/Genshin/Login/DOOR.glb";
        const door = await viewer.load({ url: doorURL, castShadow: true });
        const road = await viewer.load({ url: "/Genshin/Login/SM_Road.glb", receiveShadow: true });
        if (await lib.AssetManager.Load({ url: doorURL }) !== door) throw new Error("Door cache missed");
        if (door.parent !== viewer.scene || road.parent !== viewer.scene) throw new Error("Model was not attached");
        const models = [door, road].map((model) => {
            let meshes = 0;
            let vertices = 0;
            let maps = 0;
            model.traverse((node) => {
                if (!(node instanceof lib.Mesh)) return;
                meshes++;
                vertices += node.geometry.getAttribute("position").count;
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                maps += materials.filter((material) => "map" in material && material.map instanceof lib.Texture).length;
            });
            if (!meshes || !vertices || !maps) throw new Error("GLB mesh or embedded WebP missing");
            return { meshes, vertices, maps };
        });
        const clip = door.animations.find((animation) => animation.name.startsWith("DOOR_RIGHT"));
        if (!clip) throw new Error("Door animation missing");
        const rotation = clip.tracks.find((track) => track.name.endsWith(".quaternion"));
        if (!rotation) throw new Error("Door rotation track missing");
        const { nodeName } = lib.PropertyBinding.parseTrackName(rotation.name);
        const animated = door.getObjectByName(nodeName);
        if (!animated) throw new Error("Animated door node missing: " + nodeName);
        const mixer = new lib.AnimationMixer(door);
        mixer.clipAction(clip).setLoop(lib.LoopOnce, 1).play();
        mixer.setTime(0);
        const before = animated.quaternion.toArray();
        mixer.setTime(clip.duration * 0.99);
        const after = animated.quaternion.toArray();
        if (before.every((value, index) => value === after[index])) throw new Error("Door animation did not rotate " + nodeName);

        road.visible = false;
        const bounds = new lib.Box3().setFromObject(door);
        const center = bounds.getCenter(new lib.Vector3());
        const distance = bounds.getSize(new lib.Vector3()).length();
        viewer.camera.near = Math.max(distance / 10000, 0.01);
        viewer.camera.far = distance * 4;
        viewer.camera.updateProjectionMatrix();
        viewer.camera.position.copy(center).add(new lib.Vector3(0, 0, distance));
        viewer.camera.lookAt(center);
        viewer.scene.add(new lib.HemisphereLight(0xffffff, 0x909090, 2));
        viewer.render(0);
        const drawCalls = viewer.renderer.info.render.calls;
        const gl = viewer.renderer.getContext();
        const error = gl.getError();
        if (drawCalls === 0 || error !== gl.NO_ERROR) throw new Error(`Door render failed: draws=${drawCalls}, GL=${error}`);
        return { models, animations: door.animations.length, before, after, drawCalls };
    } finally {
        viewer.scene.traverse((node) => {
            if (!(node instanceof lib.Mesh)) return;
            node.geometry.dispose();
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                for (const value of Object.values(material)) if (value instanceof lib.Texture) value.dispose();
                material.dispose();
            }
        });
        viewer.destroy();
    }
}

/** 对照页仅将原版硬编码的 Draco CDN 请求导向本地固定解码器。 */
async function main() {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (resource, options) => {
        const url = new URL(resource instanceof Request ? resource.url : resource, location.href);
        const cdn = "https://www.gstatic.com/draco/versioned/decoders/1.5.5/";
        return url.href.startsWith(cdn)
            ? fetchOriginal("/decoder/" + url.href.slice(cdn.length), options)
            : fetchOriginal(resource, options);
    };
    try {
        const baseline = run(original);
        const result = run(candidate);
        const pixels = [...baseline.base, ...baseline.effects].flat();
        const candidatePixels = [...result.base, ...result.effects].flat();
        const maxChannelDelta = Math.max(...pixels.map((channel, index) => Math.abs(channel - candidatePixels[index])));
        const baselineModels = await runModels(original);
        const candidateModels = await runModels(candidate);
        const sameModels = JSON.stringify(baselineModels) === JSON.stringify(candidateModels);
        output.value = JSON.stringify({ baseline, candidate: result, maxChannelDelta, baselineModels, candidateModels, sameModels });
        output.dataset.status = maxChannelDelta <= 2 && sameModels ? "passed" : "product_failed";
    } catch (error) {
        output.value = error instanceof Error ? error.stack ?? error.message : String(error);
        output.dataset.status = "product_failed";
    } finally {
        window.fetch = fetchOriginal;
        await fetchOriginal("/done", { method: "POST" });
    }
}

void main();
