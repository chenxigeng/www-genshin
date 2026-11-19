import { Controller, GUI as ThreeGUI } from "three/examples/jsm/libs/lil-gui.module.min.js";

/** 可作为缩略图显示的纹理来源。 */
type PreviewSource = HTMLImageElement | ImageBitmap | { width: number; height: number; data?: ArrayLike<number> };

const thumbnails = new WeakMap<object, string>();

/** 将贴图显示为缩略图，复用已经生成的预览。 */
export class ImageController extends Controller {
    /** 显示图集、纹理或离屏缓冲的图片。 */
    $img = document.createElement("img");

    constructor(parent: ThreeGUI, target: object, key: string) {
        super(parent, target, key, "image");
        this.$widget.appendChild(this.$img);
        this.updateDisplay();
    }

    /** 解析控制器值，更新对应缩略图。 */
    override updateDisplay() {
        const source = this.getValue() as PreviewSource | undefined;
        if (!source) return this;
        void this._sourceURL(source).then((url) => { this.$img.src = url; }).catch((error: unknown) => {
            console.error(error);
        });
        return this;
    }

    /** 将原始像素或位图转换为尺寸不超过 256×256 的预览。 */
    private async _sourceURL(source: PreviewSource) {
        if (source instanceof HTMLImageElement) return source.src;
        const cached = thumbnails.get(source);
        if (cached) return cached;
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(source.width, 256);
        canvas.height = Math.min(source.height, 256);
        const context = canvas.getContext("2d");
        if (!context) return "";
        if ("data" in source && source.data) {
            const data = context.createImageData(source.width, source.height);
            data.data.set(source.data);
            const image = await createImageBitmap(data);
            try {
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
            } finally {
                image.close();
            }
        } else if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
        } else return "";
        const url = canvas.toDataURL();
        thumbnails.set(source, url);
        return url;
    }
}

/** 使用 x、y、z、w 字段的可编辑向量。 */
type VectorFields = Partial<Record<"x" | "y" | "z" | "w", number>> & { clone?: () => VectorFields };

/** 在同一行提供向量分量编辑。 */
class VectorController extends Controller {
    /** 编辑用副本，通过基类 setValue 通知目标。 */
    vector: VectorFields;

    constructor(parent: ThreeGUI, target: object, key: string, min: number, max: number, step: number) {
        super(parent, target, key, "vector");
        const initial = this.initialValue as VectorFields;
        this.vector = initial.clone?.() || { ...initial };
        const fields = (["x", "y", "z", "w"] as const).filter((field) => initial[field] !== undefined);
        for (const [index, field] of fields.entries()) {
            const input = document.createElement("input");
            input.type = "number";
            input.setAttribute("aria-labelledby", this.$name.id);
            input.step = String(step);
            if (Number.isFinite(min)) input.min = String(min);
            if (Number.isFinite(max)) input.max = String(max);
            input.value = String(this.vector[field]);
            input.addEventListener("change", () => {
                const value = Math.min(max, Math.max(min, input.valueAsNumber));
                this.vector[field] = value;
                input.value = String(value);
                this.setValue(this.vector);
            });
            this.$widget.appendChild(input);
            if (index < fields.length - 1) {
                const spacer = document.createElement("div");
                spacer.classList.add("fill");
                this.$widget.appendChild(spacer);
            }
        }
    }
}

/** 原版在 lil-gui 参数上增加的文件夹选项。 */
type GUIOptions = NonNullable<ConstructorParameters<typeof ThreeGUI>[0]> & {
    /** 用于查找文件夹的标识，默认用标题。 */
    id?: string;
    /** 是否折叠后续添加的子文件夹。 */
    closeFolders?: boolean;
};

/** 基于同版本 lil-gui，补齐原版检查器需要的能力。 */
export class GUI extends ThreeGUI {
    /** 当前目录的唯一查找标识。 */
    id: string;
    /** 新增目录是否默认折叠，由根目录设置。 */
    private _closeFolders: boolean;
    /** 开合通知会沿目录层级向上传递。 */
    private _onOpenClose?: (folder: GUI) => void;

    constructor({ id, title = "Controls", closeFolders = false, ...options }: GUIOptions = {}) {
        super({ ...options, title });
        this.id = id ?? title;
        this._closeFolders = closeFolders;
    }

    /** 添加图片、位图或原始像素预览。 */
    addImage(target: object, key: string) { return new ImageController(this, target, key); }

    /** 添加同一行的向量分量输入。 */
    addVector(target: object, key: string, min = -Infinity, max = Infinity, step = 0.01) {
        return new VectorController(this, target, key, min, max, step);
    }

    /** 新建支持 xviewer 扩展的子目录。 */
    override addFolder(title: string, id = title) {
        const folder = new GUI({ parent: this, title, id });
        if ((this.root as GUI)._closeFolders) folder.close();
        return folder;
    }

    /** 按 ID 查找直接子文件夹。 */
    getFolder(id: string) { return (this.folders as GUI[]).find((folder) => folder.id === id); }

    /** 按 ID 销毁直接子文件夹。 */
    removeFolder(id: string) {
        this.getFolder(id)?.destroy();
        return this;
    }

    /** 用于监听目录开合状态变化。 */
    onOpenClose(callback: (folder: GUI) => void) {
        this._onOpenClose = callback;
        return this;
    }

    /** 更新原版状态并通知祖先。 */
    _setClosed(closed: boolean) {
        if (this._closed !== closed) {
            this._closed = closed;
            this._callOnOpenClose(this);
        }
    }

    /** 从根端依次通知到本目录。 */
    _callOnOpenClose(folder: GUI) {
        (this.parent as GUI | undefined)?._callOnOpenClose(folder);
        this._onOpenClose?.call(this, folder);
    }

    /** 保留即时开关和上游的 ARIA 更新。 */
    override open(open = true) {
        this._setClosed(!open);
        return super.open(open) as this;
    }

    /** 保留上游过渡动画，并在状态变化时发出通知。 */
    override openAnimated(open = true) {
        this._setClosed(!open);
        return super.openAnimated(open) as this;
    }

    /** 关闭当前目录。 */
    override close() { return this.open(false); }
}
