/** ???????? GLSL???????????????? Three.js? */
export const vertexShader = `
precision highp float;
attribute vec4 texCoords;
attribute vec4 meshCoords;
attribute vec3 spritePos;
attribute vec4 spriteQuat;
attribute vec4 spriteColor;
attribute vec2 decorators;

varying vec2 vUv;
varying vec4 vColor;


mat4 getInstanceMatrix(vec3 p, vec4 q, vec3 s) {
    mat4 m;
    float x = q.x;
    float y = q.y;
    float z = q.z;
    float w = q.w;
    float x2 = x + x;
    float y2 = y + y;
    float z2 = z + z;
    float xx = x * x2;
    float xy = x * y2;
    float xz = x * z2;
    float yy = y * y2;
    float yz = y * z2;
    float zz = z * z2;
    float wx = w * x2;
    float wy = w * y2;
    float wz = w * z2;
    float sx = s.x;
    float sy = s.y;
    float sz = s.z;
    m[0][0] = (1. - (yy + zz)) * sx;
    m[0][1] = (xy + wz) * sx;
    m[0][2] = (xz - wy) * sx;
    m[0][3] = 0.;
    m[1][0] = (xy - wz) * sy;
    m[1][1] = (1. - (xx + zz)) * sy;
    m[1][2] = (yz + wx) * sy;
    m[1][3] = 0.;
    m[2][0] = (xz + wy) * sz;
    m[2][1] = (yz - wx) * sz;
    m[2][2] = (1. - (xx + yy)) * sz;
    m[2][3] = 0.;
    m[3][0] = p.x;
    m[3][1] = p.y;
    m[3][2] = p.z;
    m[3][3] = 1.;
    return m;
}
mat3 getInstanceRotationMatrix(vec4 q) {
    mat3 m;
    float x = q.x;
    float y = q.y;
    float z = q.z;
    float w = q.w;
    float x2 = x + x;
    float y2 = y + y;
    float z2 = z + z;
    float xx = x * x2;
    float xy = x * y2;
    float xz = x * z2;
    float yy = y * y2;
    float yz = y * z2;
    float zz = z * z2;
    float wx = w * x2;
    float wy = w * y2;
    float wz = w * z2;
    m[0][0] = (1. - (yy + zz));
    m[0][1] = (xy + wz);
    m[0][2] = (xz - wy);
    m[1][0] = (xy - wz);
    m[1][1] = (1. - (xx + zz));
    m[1][2] = (yz + wx);
    m[2][0] = (xz + wy);
    m[2][1] = (yz - wx);
    m[2][2] = (1. - (xx + yy));
    return m;
}


mat2 makeRotateMatrix(in float rad) {
    float c = cos(rad);
    float s = sin(rad);
    return mat2(c,-s,s,c);
}

void main() {
    vColor = spriteColor;
    vUv = uv * texCoords.zw + texCoords.xy;
    vUv.y = 1. - vUv.y;

    mat4 instanceMatrix = getInstanceMatrix(spritePos, spriteQuat, vec3(1.));
    mat4 mvMatrix = modelViewMatrix * instanceMatrix;

    vec4 transformed = vec4(position,1.);
    transformed.xy = transformed.xy * meshCoords.zw + meshCoords.xy;

    vec4 mvPosition = mvMatrix * transformed;
    vec4 bbPosition = mvMatrix * vec4(0.,0.,0.,1.);
    vec2 scale = vec2(length(mvMatrix[0].xyz), length(mvMatrix[1].xyz));
    bbPosition.xy += makeRotateMatrix(spriteQuat.x) * transformed.xy * scale;
    mvPosition = mix(mvPosition, bbPosition, decorators.x);

    gl_Position = projectionMatrix * mvPosition;
}
`;

export const fragmentShader = `
precision highp float;
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;

float luma(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }

void main() {
    vec4 color = texture2D(map, vUv);
    float shape = color.r;

#ifdef USE_ALPHA_SDF
#ifdef IS_ADDITIVE_BLENDING
    float l = vColor.a * luma(vColor.rgb);
    shape = max(smoothstep(0.48, 0.52, shape), shape * l);
#else
    shape = smoothstep(0.48, 0.52, shape);
#endif
#endif

    float alpha = color.a * vColor.a;
    vec3 col = vColor.rgb * vColor.a * shape;
    gl_FragColor = vec4(col, alpha * shape);
}
`;
