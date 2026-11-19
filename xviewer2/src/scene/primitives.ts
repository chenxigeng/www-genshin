import {
    BoxGeometry, CapsuleGeometry, CircleGeometry, ConeGeometry, CylinderGeometry,
    DodecahedronGeometry, EdgesGeometry, ExtrudeGeometry, IcosahedronGeometry, LatheGeometry,
    Mesh, MeshStandardMaterial, OctahedronGeometry, PlaneGeometry, PolyhedronGeometry,
    QuadraticBezierCurve3, RingGeometry, Shape as ShapePath, ShapeGeometry, SphereGeometry,
    TetrahedronGeometry, TorusGeometry, TorusKnotGeometry, TubeGeometry, Vector2, Vector3, WireframeGeometry,
} from "three";
import type { BufferGeometry, Curve, ExtrudeGeometryOptions, Material } from "three";
import { Component } from "../core/Component.ts";
import { $p } from "../core/properties.ts";

/** 图元接受材质与可应用到网格的额外属性。 */
interface MeshOptions extends Record<string, unknown> {
    /** 未提供时创建独立的标准材质。 */
    material?: Material | Material[];
}

/** 统一创建带默认材质的网格，并应用其余属性。 */
function buildMesh<G extends BufferGeometry>(geometry: G, material: Material | Material[] = new MeshStandardMaterial(), props: object) {
    return $p(new Mesh(geometry, material), props);
}

/** 默认挤出图元使用边长为一的矩形。 */
function rectangle() {
    return new ShapePath([new Vector2(0.5, 0.5), new Vector2(-0.5, 0.5), new Vector2(-0.5, -0.5), new Vector2(0.5, -0.5)]);
}

/** 默认形状图元的三角轮廓。 */
function triangle() {
    return new ShapePath([new Vector2(0, 0.5), new Vector2(-0.5, -0.5), new Vector2(0.5, -0.5)]);
}

/** 默认旋转图元的径向轮廓。 */
function latheProfile() {
    return [new Vector2(0, -0.5), new Vector2(0.5, 0), new Vector2(0, 0.5)];
}

/** 默认管道图元的二次曲线路径。 */
function tubePath() {
    return new QuadraticBezierCurve3(new Vector3(-1, -1, 0), new Vector3(-1, 1, 0), new Vector3(1, 1, 0));
}

/** 创建 BoxGeometry 网格，额外属性经 $p 应用。 */
export class Box extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** width 几何参数。 */
        width?: number;
        /** height 几何参数。 */
        height?: number;
        /** depth 几何参数。 */
        depth?: number;
        /** widthSegments 几何参数。 */
        widthSegments?: number;
        /** heightSegments 几何参数。 */
        heightSegments?: number;
        /** depthSegments 几何参数。 */
        depthSegments?: number;
    }) {
        const { width = 1, height = 1, depth = 1, widthSegments = 1, heightSegments = 1, depthSegments = 1, material, ...meshProps } = props;
        return buildMesh(new BoxGeometry(width, height, depth, widthSegments, heightSegments, depthSegments), material, meshProps);
    }
}

/** 创建 CapsuleGeometry 网格，额外属性经 $p 应用。 */
export class Capsule extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** length 几何参数。 */
        length?: number;
        /** capSegments 几何参数。 */
        capSegments?: number;
        /** radialSegments 几何参数。 */
        radialSegments?: number;
    }) {
        const { radius = 1, length = 1, capSegments = 4, radialSegments = 8, material, ...meshProps } = props;
        return buildMesh(new CapsuleGeometry(radius, length, capSegments, radialSegments), material, meshProps);
    }
}

/** 创建 CircleGeometry 网格，额外属性经 $p 应用。 */
export class Circle extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** segments 几何参数。 */
        segments?: number;
        /** thetaStart 几何参数。 */
        thetaStart?: number;
        /** thetaLength 几何参数。 */
        thetaLength?: number;
    }) {
        const { radius, segments, thetaStart, thetaLength, material, ...meshProps } = props;
        return buildMesh(new CircleGeometry(radius, segments, thetaStart, thetaLength), material, meshProps);
    }
}

/** 创建 ConeGeometry 网格，额外属性经 $p 应用。 */
export class Cone extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** height 几何参数。 */
        height?: number;
        /** radialSegments 几何参数。 */
        radialSegments?: number;
        /** heightSegments 几何参数。 */
        heightSegments?: number;
        /** openEnded 几何参数。 */
        openEnded?: boolean;
        /** thetaStart 几何参数。 */
        thetaStart?: number;
        /** thetaLength 几何参数。 */
        thetaLength?: number;
    }) {
        const { radius = 1, height = 1, radialSegments = 32, heightSegments = 1, openEnded = false, thetaStart = 0, thetaLength = 2 * Math.PI, material, ...meshProps } = props;
        return buildMesh(new ConeGeometry(radius, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength), material, meshProps);
    }
}

/** 创建 CylinderGeometry 网格，额外属性经 $p 应用。 */
export class Cylinder extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radiusTop 几何参数。 */
        radiusTop?: number;
        /** radiusBottom 几何参数。 */
        radiusBottom?: number;
        /** height 几何参数。 */
        height?: number;
        /** radialSegments 几何参数。 */
        radialSegments?: number;
        /** heightSegments 几何参数。 */
        heightSegments?: number;
        /** openEnded 几何参数。 */
        openEnded?: boolean;
        /** thetaStart 几何参数。 */
        thetaStart?: number;
        /** thetaLength 几何参数。 */
        thetaLength?: number;
    }) {
        const { radiusTop = 1, radiusBottom = 1, height = 1, radialSegments = 32, heightSegments = 1, openEnded = false, thetaStart = 0, thetaLength = 2 * Math.PI, material, ...meshProps } = props;
        return buildMesh(new CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength), material, meshProps);
    }
}

/** 创建 DodecahedronGeometry 网格，额外属性经 $p 应用。 */
export class Dodecahedron extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** detail 几何参数。 */
        detail?: number;
    }) {
        const { radius = 1, detail = 0, material, ...meshProps } = props;
        return buildMesh(new DodecahedronGeometry(radius, detail), material, meshProps);
    }
}

/** 创建 EdgesGeometry 网格，额外属性经 $p 应用。 */
export class Edges extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** geometry 几何参数。 */
        geometry?: BufferGeometry | null;
        /** thresholdAngle 几何参数。 */
        thresholdAngle?: number;
    }) {
        const { geometry, thresholdAngle = 1, material, ...meshProps } = props;
        return buildMesh(new EdgesGeometry(geometry ?? undefined, thresholdAngle), material, meshProps);
    }
}

/** 创建 ExtrudeGeometry 网格，额外属性经 $p 应用。 */
export class Extrude extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** shapes 几何参数。 */
        shapes?: ShapePath | ShapePath[];
        /** options 几何参数。 */
        options?: ExtrudeGeometryOptions;
    }) {
        const { shapes = rectangle(), options = {}, material, ...meshProps } = props;
        return buildMesh(new ExtrudeGeometry(shapes, options), material, meshProps);
    }
}

/** 创建 IcosahedronGeometry 网格，额外属性经 $p 应用。 */
export class Icosahedron extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** detail 几何参数。 */
        detail?: number;
    }) {
        const { radius = 1, detail = 0, material, ...meshProps } = props;
        return buildMesh(new IcosahedronGeometry(radius, detail), material, meshProps);
    }
}

/** 创建 LatheGeometry 网格，额外属性经 $p 应用。 */
export class Lathe extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** points 几何参数。 */
        points?: Vector2[];
        /** segments 几何参数。 */
        segments?: number;
        /** phiStart 几何参数。 */
        phiStart?: number;
        /** phiLength 几何参数。 */
        phiLength?: number;
    }) {
        const { points = latheProfile(), segments = 12, phiStart = 0, phiLength = 2 * Math.PI, material, ...meshProps } = props;
        return buildMesh(new LatheGeometry(points, segments, phiStart, phiLength), material, meshProps);
    }
}

/** 创建 OctahedronGeometry 网格，额外属性经 $p 应用。 */
export class Octahedron extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** detail 几何参数。 */
        detail?: number;
    }) {
        const { radius = 1, detail = 0, material, ...meshProps } = props;
        return buildMesh(new OctahedronGeometry(radius, detail), material, meshProps);
    }
}

/** 创建 PlaneGeometry 网格，额外属性经 $p 应用。 */
export class Plane extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** width 几何参数。 */
        width?: number;
        /** height 几何参数。 */
        height?: number;
        /** widthSegments 几何参数。 */
        widthSegments?: number;
        /** heightSegments 几何参数。 */
        heightSegments?: number;
    }) {
        const { width = 1, height = 1, widthSegments = 1, heightSegments = 1, material, ...meshProps } = props;
        return buildMesh(new PlaneGeometry(width, height, widthSegments, heightSegments), material, meshProps);
    }
}

/** 创建 PolyhedronGeometry 网格，额外属性经 $p 应用。 */
export class Polyhedron extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** vertices 几何参数。 */
        vertices?: number[];
        /** indices 几何参数。 */
        indices?: number[];
        /** radius 几何参数。 */
        radius?: number;
        /** detail 几何参数。 */
        detail?: number;
    }) {
        const { vertices = [], indices = [], radius = 1, detail = 0, material, ...meshProps } = props;
        return buildMesh(new PolyhedronGeometry(vertices, indices, radius, detail), material, meshProps);
    }
}

/** 创建 RingGeometry 网格，额外属性经 $p 应用。 */
export class Ring extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** innerRadius 几何参数。 */
        innerRadius?: number;
        /** outerRadius 几何参数。 */
        outerRadius?: number;
        /** thetaSegments 几何参数。 */
        thetaSegments?: number;
        /** phiSegments 几何参数。 */
        phiSegments?: number;
        /** thetaStart 几何参数。 */
        thetaStart?: number;
        /** thetaLength 几何参数。 */
        thetaLength?: number;
    }) {
        const { innerRadius = 0.5, outerRadius = 1, thetaSegments = 32, phiSegments = 1, thetaStart = 0, thetaLength = 2 * Math.PI, material, ...meshProps } = props;
        return buildMesh(new RingGeometry(innerRadius, outerRadius, thetaSegments, phiSegments, thetaStart, thetaLength), material, meshProps);
    }
}

/** 创建 ShapeGeometry 网格，额外属性经 $p 应用。 */
export class Shape extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** shapes 几何参数。 */
        shapes?: ShapePath | ShapePath[];
        /** curveSegments 几何参数。 */
        curveSegments?: number;
    }) {
        const { shapes = triangle(), curveSegments = 12, material, ...meshProps } = props;
        return buildMesh(new ShapeGeometry(shapes, curveSegments), material, meshProps);
    }
}

/** 创建 SphereGeometry 网格，额外属性经 $p 应用。 */
export class Sphere extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** widthSegments 几何参数。 */
        widthSegments?: number;
        /** heightSegments 几何参数。 */
        heightSegments?: number;
    }) {
        const { radius, widthSegments, heightSegments, material, ...meshProps } = props;
        return buildMesh(new SphereGeometry(radius, widthSegments, heightSegments), material, meshProps);
    }
}

/** 创建 TetrahedronGeometry 网格，额外属性经 $p 应用。 */
export class Tetrahedron extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** detail 几何参数。 */
        detail?: number;
    }) {
        const { radius = 1, detail = 0, material, ...meshProps } = props;
        return buildMesh(new TetrahedronGeometry(radius, detail), material, meshProps);
    }
}

/** 创建 TorusGeometry 网格，额外属性经 $p 应用。 */
export class Torus extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** tube 几何参数。 */
        tube?: number;
        /** radialSegments 几何参数。 */
        radialSegments?: number;
        /** tubularSegments 几何参数。 */
        tubularSegments?: number;
        /** arc 几何参数。 */
        arc?: number;
    }) {
        const { radius = 1, tube = 0.4, radialSegments = 12, tubularSegments = 48, arc = 2 * Math.PI, material, ...meshProps } = props;
        return buildMesh(new TorusGeometry(radius, tube, radialSegments, tubularSegments, arc), material, meshProps);
    }
}

/** 创建 TorusKnotGeometry 网格，额外属性经 $p 应用。 */
export class TorusKnot extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** radius 几何参数。 */
        radius?: number;
        /** tube 几何参数。 */
        tube?: number;
        /** tubularSegments 几何参数。 */
        tubularSegments?: number;
        /** radialSegments 几何参数。 */
        radialSegments?: number;
        /** p 几何参数。 */
        p?: number;
        /** q 几何参数。 */
        q?: number;
    }) {
        const { radius = 1, tube = 0.4, tubularSegments = 64, radialSegments = 8, p = 2, q = 3, material, ...meshProps } = props;
        return buildMesh(new TorusKnotGeometry(radius, tube, tubularSegments, radialSegments, p, q), material, meshProps);
    }
}

/** 创建 TubeGeometry 网格，额外属性经 $p 应用。 */
export class Tube extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** path 几何参数。 */
        path?: Curve<Vector3>;
        /** tubularSegments 几何参数。 */
        tubularSegments?: number;
        /** radius 几何参数。 */
        radius?: number;
        /** radialSegments 几何参数。 */
        radialSegments?: number;
        /** closed 几何参数。 */
        closed?: boolean;
    }) {
        const { path = tubePath(), tubularSegments = 64, radius = 1, radialSegments = 8, closed = false, material, ...meshProps } = props;
        return buildMesh(new TubeGeometry(path, tubularSegments, radius, radialSegments, closed), material, meshProps);
    }
}

/** 创建 WireframeGeometry 网格，额外属性经 $p 应用。 */
export class Wireframe extends Component {
    /** 从调用方选项构造几何体及网格。 */
    create(props: MeshOptions & {
        /** geometry 几何参数。 */
        geometry?: BufferGeometry | null;
    }) {
        const { geometry, material, ...meshProps } = props;
        return buildMesh(new WireframeGeometry(geometry ?? undefined), material, meshProps);
    }
}
