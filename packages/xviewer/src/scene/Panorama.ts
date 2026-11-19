import { BackSide, LinearFilter, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import type { Texture } from "three";
import { AssetManager } from "../assets/AssetManager.ts";
import type { LoadProperties } from "../assets/AssetManager.ts";
import { Component } from "../core/Component.ts";

/** 从球体内侧观察全景纹理的场景组件。 */
export class Panorama extends Component {
    /** 全景材质和球体由创建出的宿主节点持有。 */
    declare node: Mesh<SphereGeometry, MeshBasicMaterial>;

    /** 创建与原版相同尺寸和细分数的内侧球体。 */
    create() {
        return new Mesh(new SphereGeometry(500, 60, 40), new MeshBasicMaterial({ side: BackSide }));
    }
}

/** 为全景球体加载图片纹理。 */
export class ImagePanorama extends Panorama {
    /** 原版在线性过滤默认参数上合并加载配置，并在加载后刷新材质。 */
    onLoad(props: LoadProperties) {
        const request = { magFilter: LinearFilter, minFilter: LinearFilter, ...props };
        void AssetManager.Load<Texture>(request)
            .then((texture) => {
                this.node.material.map = texture;
                this.node.material.needsUpdate = true;
            }).catch((error: unknown) => {
                console.error(error);
            });
    }
}

/** 原版视频全景沿用全景球体，视频纹理由应用提供。 */
export class VideoPanorama extends Panorama {}
