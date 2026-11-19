import {
    AudioContext, AudioLoader as ThreeAudioLoader, Cache, DataTextureLoader as ThreeDataTextureLoader,
    FileLoader as ThreeFileLoader, ImageLoader as ThreeImageLoader, Texture, TextureLoader as ThreeTextureLoader,
} from "three";
import type { AssetFileSet } from "./AssetManager.ts";

/** 从 Three.js 原签名取得各加载器的回调类型。 */
type FileCallbacks = Parameters<ThreeFileLoader["load"]>;
type ImageCallbacks = Parameters<ThreeImageLoader["load"]>;
type DataTextureCallbacks = Parameters<ThreeDataTextureLoader["load"]>;
type AudioCallbacks = Parameters<ThreeAudioLoader["load"]>;

/** 保留原版的第五个本地文件参数，网络行为复用 Three.js。 */
export class FileLoader extends ThreeFileLoader {
    /** 读取文本或二进制文件，与 URL 模式共享 Three.js 缓存。 */
    override load(url: string, onLoad?: FileCallbacks[1], onProgress?: FileCallbacks[2], onError?: FileCallbacks[3], file?: File) {
        if (!file) return super.load(url, onLoad, onProgress, onError) as string | ArrayBuffer | undefined;
        const key = this.manager.resolveURL(this.path + (url ?? ""));
        const cached = Cache.get(key) as string | ArrayBuffer | undefined;
        this.manager.itemStart(key);
        if (cached !== undefined) {
            setTimeout(() => {
                onLoad?.(cached);
                this.manager.itemEnd(key);
            }, 0);
            return cached;
        }
        const read = this.responseType === "arraybuffer" ? file.arrayBuffer() : file.text();
        void read.then((data) => {
            Cache.add(key, data);
            onLoad?.(data);
            this.manager.itemEnd(key);
        }).catch((error: unknown) => {
            this.manager.itemError(key);
            this.manager.itemEnd(key);
            onError?.(error as ErrorEvent);
        });
    }
}

/** 可从调用者提供的本地图像文件创建 DOM 图片。 */
export class ImageLoader extends ThreeImageLoader {
    /** 保留原始地址作为缓存键，并在完成后释放临时对象 URL。 */
    override load(url: string, onLoad?: ImageCallbacks[1], onProgress?: ImageCallbacks[2], onError?: ImageCallbacks[3], file?: File) {
        if (!file) return super.load(url, onLoad, onProgress, onError);
        const key = this.manager.resolveURL(this.path + (url ?? ""));
        const cached = Cache.get(key) as HTMLImageElement | undefined;
        this.manager.itemStart(key);
        if (cached !== undefined) {
            setTimeout(() => {
                onLoad?.(cached);
                this.manager.itemEnd(key);
            }, 0);
            return cached;
        }
        const image = document.createElementNS("http://www.w3.org/1999/xhtml", "img") as HTMLImageElement;
        const objectURL = URL.createObjectURL(file);
        const controller = new AbortController();
        image.addEventListener("load", () => {
            controller.abort();
            URL.revokeObjectURL(objectURL);
            Cache.add(key, image);
            onLoad?.(image);
            this.manager.itemEnd(key);
        }, { signal: controller.signal });
        image.addEventListener("error", (event) => {
            controller.abort();
            URL.revokeObjectURL(objectURL);
            onError?.(event as ErrorEvent);
            this.manager.itemError(key);
            this.manager.itemEnd(key);
        }, { signal: controller.signal });
        image.src = objectURL;
        return image;
    }
}

/** 可从文件或 URL 加载普通纹理。 */
export class TextureLoader extends ThreeTextureLoader {
    /** 文件路径沿用 ImageLoader 的解码、缓存及进度契约。 */
    override load(url: string, onLoad?: (texture: Texture) => void, onProgress?: ImageCallbacks[2], onError?: ImageCallbacks[3], file?: File) {
        if (!file) return super.load(url, onLoad, onProgress, onError);
        const texture = new Texture();
        new ImageLoader(this.manager).setCrossOrigin(this.crossOrigin).setPath(this.path).load(url, (image) => {
            texture.image = image;
            texture.needsUpdate = true;
            onLoad?.(texture);
        }, onProgress, onError, file);
        return texture;
    }
}

/** 可从本地二进制文件解析数据纹理。 */
export class DataTextureLoader extends ThreeDataTextureLoader {
    /** 使用相同解析器和回调，给单次加载创建临时地址。 */
    override load(url: string, onLoad?: DataTextureCallbacks[1], onProgress?: DataTextureCallbacks[2], onError?: DataTextureCallbacks[3], file?: File) {
        if (!file) return super.load(url, onLoad, onProgress, onError);
        const objectURL = URL.createObjectURL(file);
        const loader = Object.assign(Object.create(this) as DataTextureLoader, { path: "" });
        try {
            return ThreeDataTextureLoader.prototype.load.call(loader, objectURL, (texture, data) => {
                URL.revokeObjectURL(objectURL);
                onLoad?.(texture, data);
            }, onProgress, (error) => {
                URL.revokeObjectURL(objectURL);
                onError?.(error);
            });
        } catch (error) {
            URL.revokeObjectURL(objectURL);
            throw error;
        }
    }
}

/** 解码音频，以原版格式接收带主文件的本地资源。 */
export class AudioLoader extends ThreeAudioLoader {
    /** 使用 FileLoader 读取文件数据，再交给共享音频上下文。 */
    override load(url: string, onLoad: AudioCallbacks[1], onProgress?: AudioCallbacks[2], onError?: AudioCallbacks[3], file?: AssetFileSet) {
        if (!file?.mainFile) return super.load(url, onLoad, onProgress, onError);
        const loader = new FileLoader(this.manager);
        loader.setPath(this.path).setRequestHeader(this.requestHeader)
            .setWithCredentials(this.withCredentials).setResponseType("arraybuffer");
        loader.load(url, (response) => {
                const buffer = (response as ArrayBuffer).slice(0);
                void AudioContext.getContext().decodeAudioData(buffer, onLoad).catch((error: unknown) => {
                    this.manager.itemError(url);
                    if (onError) onError(error as ErrorEvent);
                    else console.error(error);
                });
            }, onProgress, onError, file.mainFile);
    }
}
