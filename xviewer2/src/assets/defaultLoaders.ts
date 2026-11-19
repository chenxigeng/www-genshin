import { AudioLoader, FileLoader, LoadingManager, TextureLoader } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { AssetLoader, AssetManager } from "./AssetManager.ts";
import type { AssetLoadRequest } from "./AssetManager.ts";
import { $basename, $dirname } from "./paths.ts";
import { TextureAtlas } from "./TextureAtlas.ts";
import type { JsonAtlas } from "./TextureAtlas.ts";

/** 通过 Three.js 的 URL 映射使用本地附件，在加载结束时释放临时 Blob URL。 */
async function loadLocal<T>(request: AssetLoadRequest, load: (manager: LoadingManager | undefined) => Promise<T>) {
    if (!request.file) return load(undefined);
    const { file } = request;
    const files = "mainFile" in file ? [file.mainFile, ...file.additionalFiles] : [file];
    const byName = new Map(files.map((entry) => [entry.name, entry]));
    const objectURLs = new Map<File, string>();
    const manager = new LoadingManager().setURLModifier((url) => {
        const matched = byName.get($basename(url));
        if (!matched) return url;
        let objectURL = objectURLs.get(matched);
        if (objectURL === undefined) {
            objectURL = URL.createObjectURL(matched);
            objectURLs.set(matched, objectURL);
        }
        return objectURL;
    });
    try {
        return await load(manager);
    } finally {
        for (const url of objectURLs.values()) URL.revokeObjectURL(url);
    }
}

/** 共用 Three.js 异步加载协议和本地文件适配。 */
abstract class ThreeAssetLoader extends AssetLoader {
    /** 每种资源返回自己的结果类型。 */
    protected abstract read(request: AssetLoadRequest, manager?: LoadingManager): Promise<unknown>;

    /** 将 Three.js 的 Promise 转换为 AssetManager 的回调。 */
    load(request: AssetLoadRequest) {
        void loadLocal(request, (manager) => this.read(request, manager)).then(request.onLoad, request.onError);
    }
}

class FBXAssetLoader extends ThreeAssetLoader {
    extensions = ["fbx"];
    /** 加载带材质、骨骼及动画的 FBX 对象树。 */
    protected read({ url, onProgress }: AssetLoadRequest, manager?: LoadingManager) {
        return new FBXLoader(manager).loadAsync(url, onProgress);
    }
}

class GLTFAssetLoader extends ThreeAssetLoader {
    extensions = ["gltf", "glb"];
    /** 加载 glTF 场景并将 animations 挂到返回的节点上。 */
    protected async read({ url, onProgress }: AssetLoadRequest, manager?: LoadingManager) {
        const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.5/");
        try {
            const gltf = await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(draco).loadAsync(url, onProgress);
            return Object.assign(gltf.scene, { animations: gltf.animations });
        } finally {
            draco.dispose();
        }
    }
}

class HDRAssetLoader extends ThreeAssetLoader {
    extensions = ["hdr"];
    /** 加载 HDR 纹理后合并配置。 */
    protected async read({ url, onProgress, settings }: AssetLoadRequest, manager?: LoadingManager) {
        return Object.assign(await new RGBELoader(manager).loadAsync(url, onProgress), settings);
    }
}

class JSONAssetLoader extends ThreeAssetLoader {
    extensions = ["json"];
    /** 以文本方式读取并解析 JSON。 */
    protected async read({ url, onProgress }: AssetLoadRequest, manager?: LoadingManager) {
        const text = await new FileLoader(manager).loadAsync(url, onProgress);
        return JSON.parse(text as string) as unknown;
    }
}

class TextureAssetLoader extends ThreeAssetLoader {
    extensions = ["png", "jpg", "webp", "avif"];
    /** 加载纹理后按原版方式直接赋值设置。 */
    protected async read({ url, onProgress, settings }: AssetLoadRequest, manager?: LoadingManager) {
        return Object.assign(await new TextureLoader(manager).loadAsync(url, onProgress), settings);
    }
}

class AudioAssetLoader extends ThreeAssetLoader {
    extensions = ["mp3", "wav", "ogg"];
    /** 加载并解码音频缓冲。 */
    protected read({ url, onProgress }: AssetLoadRequest, manager?: LoadingManager) {
        return new AudioLoader(manager).loadAsync(url, onProgress);
    }
}

class AtlasAssetLoader extends ThreeAssetLoader {
    extensions = ["atlas"];
    /** 先读描述文件，再按相对路径加载共用纹理。 */
    protected async read({ url, onProgress, settings }: AssetLoadRequest, manager?: LoadingManager) {
        const description = await new FileLoader(manager).loadAsync(url);
        const json = JSON.parse(description as string) as JsonAtlas;
        const texture = await new TextureLoader(manager).loadAsync(`${$dirname(url)}/${json.meta.image}`, onProgress);
        return new TextureAtlas(json, Object.assign(texture, settings));
    }
}

/** 注册入口初始化时可用的内建加载器。 */
for (const Loader of [AtlasAssetLoader, FBXAssetLoader, GLTFAssetLoader, HDRAssetLoader, JSONAssetLoader, TextureAssetLoader, AudioAssetLoader]) {
    AssetManager.RegistLoader(Loader);
}
