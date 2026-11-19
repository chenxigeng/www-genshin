/** ??????????? GLSL? */
export const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`;

export const fragmentShader = `
    precision highp float;

    #include <packing>

    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform sampler2D tNoise;
    uniform vec4      uSamples[32];
    uniform vec4      uAoParams;
    uniform vec4      uScreenSize;
    uniform vec4      uSsaoProjectionInfo;
    uniform float     uFrameModTaaSS;
    varying vec2      vUv;

    //x = far - near
    //y = near
    //z = tanFov * aspect
    //w = tanFov
    uniform vec4      uClippingParams;

    #define uRadius     uAoParams.x
    #define uSampleCnt  uAoParams.y
    #define uGiBoost    uAoParams.z
    #define uBias       uAoParams.w

    uniform float cameraNear;
    uniform float cameraFar;
    uniform mat4 cameraProjectionMatrix;
    uniform mat4 cameraInverseProjectionMatrix;

    vec3 ndcToView(vec2 ndc, float depth) {
        float z = depth * uClippingParams.x + uClippingParams.y;
        return vec3(ndc * uClippingParams.zw, -1.0) * z;
    }

    vec2 viewToNdc(vec3 view) {
        return -view.xy / (uClippingParams.zw * view.z);
    }

    vec3 textureNormal(sampler2D map, vec2 uv) {
	    return unpackRGBToNormal(texture(map, uv).xyz);
    }

    float textureDepth(sampler2D map, vec2 uv) {
        return (-perspectiveDepthToViewZ(texture(map, uv).r, cameraNear, cameraFar ) - cameraNear) / (cameraFar - cameraNear);
    }

    float zValueFromScreenSpacePosition(const in float depth) {
        return (depth * uClippingParams.x + uClippingParams.y);
    }

    vec3 reconstructCSPosition(const in vec2 ssP, const in float z) {
        return vec3((ssP.xy * uSsaoProjectionInfo.xy + uSsaoProjectionInfo.zw) * z, z);
    }

    vec3 getPosition(const in vec2 uv) {
        return reconstructCSPosition(uv * uScreenSize.xy, zValueFromScreenSpacePosition(textureDepth(tDepth, uv)));
    }

    vec3 getOffsetedPixelPos(const in vec2 uv, const in vec2 unitOffset, const in float screenSpaceRadius) {
        vec2 uvOff = uv + floor(screenSpaceRadius * unitOffset) / uScreenSize.xy;
        float d = zValueFromScreenSpacePosition(textureDepth(tDepth, uvOff));
        return reconstructCSPosition(uvOff * uScreenSize.xy, d);
    }

    float interleavedGradientNoise(const in vec2 fragCoord, const in float frameMod) {
        vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
        return fract(magic.z * fract(dot(fragCoord.xy + frameMod * vec2(47.0, 17.0) * 0.695, magic.xy)));
    }

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    vec2 hash2(vec2 p) { // replace this by something better
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453123);
    }

    vec3 hash3(vec2 p){
        // p += uFrameModTaaSS * vec2(0.05);
        vec3 q = vec3(dot(p,vec2(127.1,311.7)),
                    dot(p,vec2(269.5,183.3)),
                    dot(p,vec2(419.2,371.9)) );
        return fract(sin(q)*43758.5453);
    }


    vec3 ssao() {
        vec2 uv = vUv;

        float uSsaoRadius = uRadius;
        float uSsaoIntensity = uGiBoost;
        float uSsaoProjectionScale = -1559.1949;
        float uSsaoBias = 0.008;

        vec3 cameraSpacePosition = getPosition(uv);
        float ssRadius = -uSsaoProjectionScale * uSsaoRadius / cameraSpacePosition.z;

        float d = textureDepth(tDepth, vUv);
        if(d >= 0.999) {
             return vec3(1.);
        }
        if (ssRadius < 1.) {
            return vec3(1.);
        }

        vec3 normal = normalize(cross(dFdy(cameraSpacePosition), dFdx(cameraSpacePosition)));
        // vec3 normal = -textureNormal(tNormal, uv);
        // return normal * 0.5 + 0.5;

        float nFalloff = mix(1.0, max(0.0, 1.5 * normal.z), 0.35);
        // return vec3(nFalloff);

        float randomAngle = 6.28 * interleavedGradientNoise(gl_FragCoord.xy, uFrameModTaaSS);
        float invRadius2 = 1.0 / (uSsaoRadius * uSsaoRadius);
        float contrib = 0.0;
        float vv;
        float vn;
        float screenSpaceRadius;
        float angle;
        vec3 occludingPoint;
        vec2 offsetUnitVec;

        float offset = 0.;
        float nbSamples = 32.;
        for (float i = 0.; i < nbSamples; i++) {
            screenSpaceRadius = (offset + i + 0.5) * (1.0 / nbSamples);
            angle = screenSpaceRadius * (3.0 * 6.28) + randomAngle;
            screenSpaceRadius = max(0.75, screenSpaceRadius * ssRadius);
            offsetUnitVec = vec2(cos(angle), sin(angle));
            occludingPoint = getOffsetedPixelPos(uv, offsetUnitVec, screenSpaceRadius);
            occludingPoint -= cameraSpacePosition;
            vv = dot(occludingPoint, occludingPoint);
            vn = dot(occludingPoint, normal);
            contrib += max(1. - vv * invRadius2, 0.0) * max((vn - uSsaoBias) * inversesqrt(vv), 0.0);
        }
        float aoValue = max(0.0, 1.0 - sqrt(contrib * nFalloff / nbSamples));
        aoValue = pow(aoValue, 10.0 * uSsaoIntensity);
        return vec3(mix(1.0, aoValue, clamp(ssRadius - 1.0, 0.0, 1.0)));
    }

    // vec3 ssao2() {
    //     const float ATTF = 1e-5;
    //     float d = textureDepth(tDepth, vUv);
    //     if( d >= 0.999) {
    //         discard;
    //     }
    //     float occ = 0.;
    //     float occCnt = 0.;
    //     vec3 p = ndcToView(vUv * 2. - 1., d);
    //     // vec3 n = textureNormal(tNormal, vUv);
    //     vec3 n = normalize(cross(dFdx(p), dFdy(p)));

    //     vec3  rvec = normalize(texture(tNoise, gl_FragCoord.xy/64.0).rgb*2.-1.);
    //     for(int i = 0; i<32 && d < 1.; i++) {
    //         vec3 dir = reflect(uSamples[i].xyz, rvec); // a la Crysis
    //         dir -= 2.*dir*step(dot(n,dir), 0.);  // a la Starcraft
    //         vec3 sp = p + (dir*uRadius) * (d*1e2); // scale radius with depth
    //         vec2 spNdc = viewToNdc(sp); // get sample ndc coords

    //         bvec4 outOfScreen = bvec4(false); // check if sample projects to screen
    //         outOfScreen.xy = lessThan(spNdc, vec2(-1));
    //         outOfScreen.zw = greaterThan(spNdc, vec2(1));
    //         if(any(outOfScreen)) continue;

    //         float spd = textureDepth(tDepth, (spNdc*0.5+0.5));
    //         vec3  occEye = -sp/sp.z*(spd*uClippingParams.x+uClippingParams.y); // compute correct pos
    //         vec3  occVec = occEye - p; // vector
    //         float att2 = 1.0+ATTF*length(occVec); // quadratic attenuation
    //         occ += max(0.0,dot(normalize(occVec),n)-0.25) / (att2*att2);
    //         ++occCnt;
    //     }
    //     return occCnt > 0.0 ? vec3(1.0-occ*uGiBoost/occCnt) : vec3(1.);
    // }

    vec3 ssao2() {
        const float ATTF = 1e-5;
        float d = textureDepth(tDepth, vUv);
        if( d >= 0.999) {
            discard;
        }
        float occ = 0.;
        float occCnt = 0.;
        vec3 p = ndcToView(vUv * 2. - 1., d);
        vec3 n = textureNormal(tNormal, vUv);
        // vec3 n = normalize(cross(dFdx(p), dFdy(p)));

        float invRadius2 = 1.0 / (uRadius * uRadius);
        vec2 sUv = gl_FragCoord.xy/64.;
        vec3 rvec = normalize(hash3(sUv)*2.-1.);
        float nbSamples = 8.; //采样率太低会出现水波纹
        // for(int i = 0; i < 32 && d < 1.; i++) {
        for(float i = 0.; i<nbSamples && d < 1.; i++) {
            vec2 st = sUv * i;
            vec3 s = (hash3(st)*2.-1.) * mix(1e-5,.5,hash(st)); //随机缩放步长,固定步长更容易收敛,随机步长AO更准确
            vec3 dir = reflect(s, rvec); // a la Crysis
            // vec3 dir = reflect(uSamples[i].xyz, rvec); // a la Crysis
            dir -= 2.*dir*step(dot(n,dir), 0.);  // a la Starcraft
            vec3 sp = p + (dir*uRadius) * (d*5.); // scale radius with depth
            vec2 spNdc = viewToNdc(sp); // get sample ndc coords

            bvec4 outOfScreen = bvec4(false); // check if sample projects to screen
            outOfScreen.xy = lessThan(spNdc, vec2(-1));
            outOfScreen.zw = greaterThan(spNdc, vec2(1));
            if(any(outOfScreen)) continue;

            float spd = textureDepth(tDepth, (spNdc*0.5+0.5));
            vec3  occEye = -sp/sp.z*(spd*uClippingParams.x+uClippingParams.y); // compute correct pos
            vec3  occVec = occEye - p; // vector
            float att2 = 1.0+ATTF*length(occVec); // quadratic attenuation
            occ += max(0.0,dot(normalize(occVec),n)-0.25) / (att2*att2) * max(0., 1.-dot(occVec,occVec) * invRadius2);
            ++occCnt;
        }
        return occCnt > 0.0 ? vec3(1.0-occ*uGiBoost*10./occCnt) : vec3(1.);
    }

    void main() {
        gl_FragColor.rgb = ssao2();
        // gl_FragColor.rgb = vec3(interleavedGradientNoise(vUv, 0.));
        // gl_FragColor.rgb = vec3(hash(gl_FragCoord.xy/64.));
        // gl_FragColor.rgb = texture(tNoise, gl_FragCoord.xy/64.0).rgb;
        gl_FragColor.a = 1.;
    }
    `;
