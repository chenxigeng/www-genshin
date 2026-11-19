import type { Texture } from "three";
import { $ext } from "./paths.ts";

/** 一个主文件与其通过相对路径引用的附件。 */
export interface AssetFileSet {
    /** 决定加载器和缓存名称的主文件。 */
    mainFile: File;
    /** 主文件引用的贴图、缓冲区等附件。 */
    additionalFiles: File[];
}

/** 可由内建的纹理和 HDR 加载器直接应用的参数。 */
export type TextureSettings = Partial<Pick<Texture,
    "flipY" | "mapping" | "wrapS" | "wrapT" | "magFilter" | "minFilter" |
    "format" | "type" | "anisotropy" | "encoding" | "repeat"
>>;

/** 资源加载入口的公共参数。 */
export interface LoadProperties {
    /** URL、单个文件或主文件及附件。 */
    url?: string | File | AssetFileSet;
    /** 参与原版缓存键计算的配置。 */
    settings?: TextureSettings;
    /** 在加载器提供进度时调用。 */
    onProgress?: (event: ProgressEvent) => void;
}

/** 管理器归一化 URI 后交给加载器的参数。 */
export interface AssetLoadRequest extends Omit<LoadProperties, "url"> {
    /** 原始 URL 或主文件名。 */
    url: string;
    /** 可选的本地资源。 */
    file: File | AssetFileSet | null;
    /** 返回加载成功的对象。 */
    onLoad(value: unknown): void;
    /** 返回加载失败原因。 */
    onError(error: unknown): void;
}

/** 按扩展名注册，定义资源加载协议。 */
export abstract class AssetLoader {
    /** 原版可供调用方使用的加载器名称字段。 */
    name = "";
    /** 匹配大小写敏感的扩展名。 */
    abstract extensions: string[];
    /** 加载请求并调用对应的结果回调。 */
    abstract load(request: AssetLoadRequest): void;
}

/** 依扩展名分派资源请求，并缓存已成功加载的结果。 */
export class AssetManager {
    /** 扩展名到加载器实例。同一次注册的扩展名共享实例。 */
    static loaders = new Map<string, AssetLoader>();
    /** 缓存由 URL 和设置字段的枚举顺序共同决定。 */
    static caches = new Map<string, unknown>();

    /** 清空缓存引用。资产的 dispose 由持有者决定。 */
    static Clear() {
        this.caches.clear();
    }

    /** 安装加载器，后注册者覆盖同扩展名。 */
    static RegistLoader(Loader: new () => AssetLoader) {
        const loader = new Loader();
        for (const extension of loader.extensions) this.loaders.set(extension, loader);
    }

    /** 根据 URL 或 File 选择加载器，保留原版缓存键及缺失加载器错误。 */
    static Load<T = unknown>(request: LoadProperties): Promise<T> {
        return new Promise((resolve, reject) => {
            const input = request.url;
            const file = typeof input === "object" ? input : null;
            const url = typeof File !== "undefined" && input instanceof File
                ? input.name
                : typeof input === "object" ? (input as AssetFileSet).mainFile.name : String(input);
            const extension = $ext(url);
            const cacheParts = [url];
            for (const key in request.settings) {
                cacheParts.push(`${key}=${request.settings[key as keyof TextureSettings]}`);
            }
            const cacheKey = cacheParts.join(",");
            const cached = this.caches.get(cacheKey);
            if (cached) {
                resolve(cached as T);
                return;
            }
            const loader = this.loaders.get(extension);
            if (!loader) {
                reject("missing loader for" + extension);
                return;
            }
            loader.load({
                ...request,
                url,
                file,
                onLoad: (value) => {
                    this.caches.set(cacheKey, value);
                    resolve(value as T);
                },
                onError: reject,
            });
        });
    }
}
