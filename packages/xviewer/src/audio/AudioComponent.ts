import { Audio, AudioListener, PositionalAudio } from "three";
import type { Object3D } from "three";
import { AssetManager } from "../assets/AssetManager.ts";
import { Component } from "../core/Component.ts";
import type { Viewer } from "../core/Viewer.ts";

/** 原版音频播放选项。 */
interface PlaybackOptions {
    /** 交给 AssetManager 加载的音频地址。 */
    url: string;
    /** 是否循环播放，默认关闭。 */
    loop?: boolean;
    /** 线性音量，默认 1。 */
    volume?: number;
    /** 是否先停止当前录音再播放。 */
    force?: boolean;
    /** 在原版声明中保留，实际播放逻辑忽略该值。 */
    delay?: number;
}

/** 音频监听器的可选挂载位置。 */
interface ListenerOptions {
    /** 指定接收监听器的场景节点，默认用活动相机。 */
    listener?: Object3D;
}

/** 普通音频组件，使用 Viewer 挂载 Three.js 音频和监听器。 */
export class AudioComponent extends Component {
    /** 挂载后可用于检查播放状态或调用 Three.js 音频 API。 */
    declare node: Audio<AudioNode>;

    /** 创建音频节点及其监听器。 */
    create(): Audio<AudioNode> {
        return new Audio(new AudioListener());
    }

    /** 将监听器添加到指定节点或活动相机。 */
    onLoad({ listener }: ListenerOptions) {
        const viewer = this.viewer as Viewer;
        viewer.addNode(this.node.listener, {}, listener || viewer.camera);
    }

    /** 加载音频并配置播放，force 打开时先停止当前播放。 */
    play({ url, loop = false, volume = 1, force = false }: PlaybackOptions) {
        void AssetManager.Load<AudioBuffer>({ url }).then((buffer) => {
            if (force) this.node.stop();
            this.node.setBuffer(buffer);
            this.node.setLoop(loop);
            this.node.setVolume(volume);
            if (!this.node.isPlaying) this.node.play();
        }).catch((error: unknown) => {
            console.error(error);
        });
    }

    /** 停止当前音源。 */
    stop() {
        this.node.stop();
    }
}

/** 单独挂载时提供 Three.js 音频监听器。 */
export class AudioListenerComponent extends Component {
    /** 已挂载的监听器节点。 */
    declare node: AudioListener;

    /** 为此组件创建监听器节点。 */
    create() {
        return new AudioListener();
    }

    /** 原版在挂载时读取节点，保留这一生命周期入口。 */
    onLoad() {
        void this.node;
    }
}

/** 带空间衰减的音频播放选项。 */
interface PositionalPlaybackOptions extends PlaybackOptions {
    /** 开始衰减的距离，默认 20 个世界单位。 */
    refDistance?: number;
    /** 衰减模型使用的最大距离，默认 10000 个世界单位。 */
    maxDistance?: number;
}

/** 根据监听器相对位置播放的音频组件。 */
export class PositionalAudioComponent extends AudioComponent {
    /** 挂载的空间音源。 */
    declare node: PositionalAudio;

    /** 创建空间音源和监听器。 */
    override create() {
        return new PositionalAudio(new AudioListener());
    }

    /** 发起加载后立即更新衰减参数。 */
    override play({ refDistance = 20, maxDistance = 10000, ...options }: PositionalPlaybackOptions) {
        super.play(options);
        this.node.setRefDistance(refDistance);
        this.node.setMaxDistance(maxDistance);
    }
}
