import { Vector4 } from "three";
import type { Texture } from "three";

/** 像素位置与尺寸。 */
interface FrameRect {
    /** 图集左侧起算的横坐标。 */
    x: number;
    /** 图集顶部起算的纵坐标。 */
    y: number;
    /** 宽度，像素。 */
    w: number;
    /** 高度，像素。 */
    h: number;
}

/** 图集帧使用的像素尺寸。 */
type FrameSize = Pick<FrameRect, "w" | "h">;

/** TexturePacker 图集的原版计算输入。 */
export interface JsonAtlas {
    /** 按精灵帧名索引的裁剪数据。 */
    frames: Record<string, {
        /** 图集内的区块位置。 */
        frame: FrameRect;
        /** 裁剪前的尺寸。 */
        sourceSize: FrameSize;
        /** 裁剪区在原始精灵内的坐标和尺寸。 */
        spriteSourceSize: FrameRect;
        /** 原始精灵内归一化的锚点，默认居中。 */
        anchor?: { x: number; y: number };
    }>;
    /** 按动画名索引的帧名序列。 */
    animations: Record<string, string[]>;
    /** 图集共用的纹理数据。 */
    meta: {
        /** 图集纹理的像素尺寸。 */
        size: FrameSize;
        /** 精灵网格相对图集分辨率的缩放。 */
        scale: number;
        /** 相对图集描述文件的图片路径。 */
        image: string;
    };
}

/** 保存单帧使用的图集区域与网格区域。 */
class SpriteFrame {
    /** 图集的共享纹理。 */
    texture: Texture;
    /** 左下原点的归一化 UV 范围。 */
    texCoords: Vector4;
    /** 以锚点为基准的网格范围。 */
    meshCoords: Vector4;

    constructor(texture: Texture, texCoords: Vector4, meshCoords: Vector4) {
        this.texture = texture;
        this.texCoords = texCoords;
        this.meshCoords = meshCoords;
    }
}

/** 将图集帧和动画名称映射到可重复使用的坐标数据。 */
export class TextureAtlas {
    /** 未变更的图集描述。 */
    json: JsonAtlas;
    /** 所有帧共享的纹理。 */
    texture: Texture;
    /** 按帧名和动画名保存派生结果。 */
    private _spriteFrames: Record<string, SpriteFrame> = {};
    private _animations: Record<string, SpriteFrame[]> = {};

    constructor(json: JsonAtlas, texture: Texture) {
        this.json = json;
        this.texture = texture;
        const { w, h } = json.meta.size;
        const scale = json.meta.scale / Math.max(w, h);
        for (const name in json.frames) {
            const { frame, sourceSize, spriteSourceSize: bounds, anchor: frameAnchor } = json.frames[name];
            const anchor = frameAnchor || { x: 0.5, y: 0.5 };
            const texCoords = new Vector4(frame.x / w, 1 - (frame.y / h + frame.h / h), frame.w / w, frame.h / h);
            const meshCoords = new Vector4(
                bounds.x + 0.5 * bounds.w - sourceSize.w * anchor.x,
                -(bounds.y + 0.5 * bounds.h - sourceSize.h * anchor.y),
                bounds.w,
                bounds.h,
            ).multiplyScalar(scale);
            this._spriteFrames[name] = new SpriteFrame(texture, texCoords, meshCoords);
        }
        for (const name in json.animations) {
            this._animations[name] = json.animations[name].map((frame) => this._spriteFrames[frame]);
        }
    }

    /** 获取动画帧序列，名称未知时返回 undefined。 */
    getAnimation(name: string): SpriteFrame[] | undefined { return this._animations[name]; }

    /** 获取一个精灵帧，名称未知时返回 undefined。 */
    getSpriteFrame(name: string): SpriteFrame | undefined { return this._spriteFrames[name]; }
}
