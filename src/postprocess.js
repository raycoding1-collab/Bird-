import * as THREE from 'three';

/**
 * Self-contained Film-Grade HalfFloat Post-Processing Pipeline (AAA Half-Res Bokeh + Full-Res Hero FXAA Composite):
 * 1. Main Scene + DepthTexture render into Full-Res HalfFloat WebGLRenderTarget
 * 2. Half-Res DepthTexture-driven 16-Tap Vogel-Disk CoC-Aware Circular Bokeh DOF
 *    (Zero harsh halo artifacts: tack-sharp hero plane, creamy background bokeh, soft foreground lamppost blur)
 * 3. Selective Quarter-Res HDR Bloom (threshold extract + separable H/V Gaussian blur)
 * 4. Full-Res Cinema Composite:
 *    - Inline FXAA anti-aliasing directly on sharp hero pixels (silky chrome spokes & feather rims without an extra full-res pass!)
 *    - Full-resolution DepthTexture CoC blend into creamy half-res background & foreground bokeh
 *    - Analytical ACES Filmic tone mapping + warm Mediterranean grading + light vignette + deterministic grain
 * 5. Optional 2-subframe 180-degree shutter accumulation pass for offline cinema video rendering
 */
export function createPostPipeline(renderer, width, height) {
  const gl = renderer.getContext();
  const supportsHalfFloat =
    !!gl.getExtension('EXT_color_buffer_half_float') ||
    !!gl.getExtension('EXT_color_buffer_float');
  const halfFloat = supportsHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  function makeRT(w, h, withDepthTex = false) {
    const opts = {
      type: halfFloat,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: withDepthTex,
      stencilBuffer: false,
    };
    const rt = new THREE.WebGLRenderTarget(w, h, opts);
    if (withDepthTex) {
      rt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
      rt.depthTexture.minFilter = THREE.NearestFilter;
      rt.depthTexture.magFilter = THREE.NearestFilter;
    }
    return rt;
  }

  let rtScene = makeRT(width, height, true);
  let rtDofHalf = makeRT(Math.max(2, width >> 1), Math.max(2, height >> 1), false);
  let rtBloomA = makeRT(Math.max(2, width >> 2), Math.max(2, height >> 2), false);
  let rtBloomB = makeRT(Math.max(2, width >> 2), Math.max(2, height >> 2), false);
  let rtAccumA = makeRT(width, height, false);
  let rtAccumB = makeRT(width, height, false);

  const commonVert = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  // =========================================================================
  // PASS 1: HALF-RES 16-TAP VOGEL-DISK CIRCULAR BOKEH DOF (ZERO HALO!)
  // =========================================================================
  const dofMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
      uNear: { value: 0.15 },
      uFar: { value: 95.0 },
      uFocusDist: { value: 6.2 },
      uFocusDeadZone: { value: 0.68 },
      uBgRange: { value: 3.6 },
      uFgRange: { value: 2.0 },
      uMaxBlurBg: { value: 11.0 },
      uMaxBlurFg: { value: 58.0 },
      uResScale: { value: height / 1080.0 },
      uDofEnabled: { value: 1.0 },
    },
    vertexShader: commonVert,
    fragmentShader: `
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform vec2 uTexel;
      uniform float uNear;
      uniform float uFar;
      uniform float uFocusDist;
      uniform float uFocusDeadZone;
      uniform float uBgRange;
      uniform float uFgRange;
      uniform float uMaxBlurBg;
      uniform float uMaxBlurFg;
      uniform float uResScale;
      uniform float uDofEnabled;
      varying vec2 vUv;

      float linearizeDepth(float d) {
        float z = d * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
      }

      float computeSignedCoC(float depth) {
        float diff = depth - uFocusDist;
        if (abs(diff) <= uFocusDeadZone) return 0.0;
        if (diff > 0.0) {
          return clamp((diff - uFocusDeadZone) / uBgRange, 0.0, 1.0);
        } else {
          return clamp((diff + uFocusDeadZone) / uFgRange, -1.0, 0.0);
        }
      }

      void main() {
        vec3 centerCol = texture2D(tColor, vUv).rgb;
        if (uDofEnabled < 0.5) {
          gl_FragColor = vec4(centerCol, 0.0);
          return;
        }

        float centerDepth = linearizeDepth(texture2D(tDepth, vUv).r);
        float centerCoC = computeSignedCoC(centerDepth);

        // Fast horizontal + diagonal foreground silhouette expansion probe for passing lampposts
        float maxFgCoC = max(0.0, -centerCoC);
        float fgSearchPx = uMaxBlurFg * uResScale * 0.96;
        vec2 offsets[6];
        offsets[0] = vec2(-0.5, 0.0);
        offsets[1] = vec2( 0.5, 0.0);
        offsets[2] = vec2(-1.0, 0.0);
        offsets[3] = vec2( 1.0, 0.0);
        offsets[4] = vec2( 0.0,-0.75);
        offsets[5] = vec2( 0.0, 0.75);
        for (int k = 0; k < 6; k++) {
          vec2 probeUv = vUv + offsets[k] * fgSearchPx * uTexel;
          float pd = linearizeDepth(texture2D(tDepth, probeUv).r);
          float pc = computeSignedCoC(pd);
          if (pc < -0.15) {
            maxFgCoC = max(maxFgCoC, -pc);
          }
        }

        float bgRadiusPx = max(0.0, centerCoC) * uMaxBlurBg * uResScale;
        float fgRadiusPx = maxFgCoC * uMaxBlurFg * uResScale;
        float sampleRadiusPx = max(bgRadiusPx, fgRadiusPx);

        if (sampleRadiusPx < 0.5) {
          gl_FragColor = vec4(centerCol, 0.0);
          return;
        }

        const int SAMPLES = 16;
        const float GOLDEN_ANGLE = 2.39996323;

        vec3 bgAccum = (centerCoC >= -0.10) ? centerCol : vec3(0.0);
        float bgWeight = (centerCoC >= -0.10) ? 1.0 : 0.0;

        vec3 fgAccum = vec3(0.0);
        float fgWeight = 0.0;
        float fgTotalKernel = 0.0;

        for (int i = 0; i < SAMPLES; i++) {
          float fi = float(i) + 0.5;
          float rNorm = sqrt(fi / float(SAMPLES));
          float ang = fi * GOLDEN_ANGLE;
          vec2 dir = vec2(cos(ang), sin(ang));

          // 1. Background Bokeh Gather (strictly rejects closer sharp hero pixels -> zero halo!)
          if (bgRadiusPx > 0.5) {
            vec2 uvBg = vUv + dir * (rNorm * bgRadiusPx) * uTexel;
            float tapD = linearizeDepth(texture2D(tDepth, uvBg).r);
            float tapCoC = computeSignedCoC(tapD);
            if (tapCoC > 0.02) {
              float w = smoothstep(0.0, 0.25, tapCoC);
              if (tapD < centerDepth - 0.18) {
                w *= smoothstep(0.0, 0.4, tapCoC / max(centerCoC, 0.001));
              }
              vec3 tapCol = texture2D(tColor, uvBg).rgb;
              float bright = 1.0 + 0.55 * smoothstep(1.0, 2.6, max(tapCol.r, max(tapCol.g, tapCol.b)));
              bgAccum += tapCol * (w * bright);
              bgWeight += w * bright;
            }
          }

          // 2. Creamy Translucent Foreground Optical Bokeh Gather (zero hard dark inner core!)
          if (fgRadiusPx > 0.5) {
            vec2 uvFg = vUv + dir * (rNorm * fgRadiusPx) * uTexel;
            float tapD = linearizeDepth(texture2D(tDepth, uvFg).r);
            float tapCoC = computeSignedCoC(tapD);
            float kernelW = exp(-rNorm * rNorm * 0.65);
            fgTotalKernel += kernelW;
            if (tapCoC < -0.12) {
              float wFg = smoothstep(-0.12, -0.45, tapCoC) * kernelW;
              vec3 tapCol = texture2D(tColor, uvFg).rgb;
              fgAccum += tapCol * wFg;
              fgWeight += wFg;
            } else if (centerCoC < -0.12) {
              vec3 tapCol = texture2D(tColor, uvFg).rgb;
              bgAccum += tapCol * kernelW;
              bgWeight += kernelW;
            }
          }
        }

        vec3 outCol = (bgWeight > 0.001) ? (bgAccum / bgWeight) : centerCol;
        float fgCoverage = 0.0;
        if (fgWeight > 0.001 && fgTotalKernel > 0.001) {
          vec3 fgCol = fgAccum / fgWeight;
          fgCoverage = clamp((fgWeight / fgTotalKernel) * 1.05, 0.0, 0.86);
          outCol = mix(outCol, fgCol, fgCoverage);
        }

        gl_FragColor = vec4(outCol, fgCoverage);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  // =========================================================================
  // PASS 2: SELECTIVE QUARTER-RES HDR BLOOM
  // =========================================================================
  const bloomExtractMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uThreshold: { value: 1.48 },
    },
    vertexShader: commonVert,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uThreshold;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float soft = smoothstep(uThreshold, uThreshold + 0.90, lum);
        gl_FragColor = vec4(col * soft * 0.55, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const bloomBlurMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uDirection: { value: new THREE.Vector2(1, 0) },
      uTexel: { value: new THREE.Vector2(4 / width, 4 / height) },
    },
    vertexShader: commonVert,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uDirection;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec2 off = uDirection * uTexel * 1.65;
        vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
        sum += texture2D(tDiffuse, vUv + off * 1.0).rgb * 0.1945946;
        sum += texture2D(tDiffuse, vUv - off * 1.0).rgb * 0.1945946;
        sum += texture2D(tDiffuse, vUv + off * 2.0).rgb * 0.1216216;
        sum += texture2D(tDiffuse, vUv - off * 2.0).rgb * 0.1216216;
        sum += texture2D(tDiffuse, vUv + off * 3.0).rgb * 0.054054;
        sum += texture2D(tDiffuse, vUv - off * 3.0).rgb * 0.054054;
        sum += texture2D(tDiffuse, vUv + off * 4.0).rgb * 0.016216;
        sum += texture2D(tDiffuse, vUv - off * 4.0).rgb * 0.016216;
        gl_FragColor = vec4(sum, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  // =========================================================================
  // PASS 3: FULL-RES CINEMA COMPOSITE (Inline Hero FXAA + Bokeh Blend + ACES + Grading + Grain)
  // =========================================================================
  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      tSharp: { value: null },
      tBokeh: { value: null },
      tDepth: { value: null },
      tBloom: { value: null },
      uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
      uNear: { value: 0.15 },
      uFar: { value: 95.0 },
      uFocusDist: { value: 6.2 },
      uFocusDeadZone: { value: 0.68 },
      uBgRange: { value: 3.6 },
      uFgRange: { value: 2.0 },
      uDofEnabled: { value: 1.0 },
      uBloomStrength: { value: 0.22 },
      uExposure: { value: 1.04 },
      uGrainSeed: { value: 0.0 },
      uGrainStrength: { value: 0.013 },
    },
    vertexShader: commonVert,
    fragmentShader: `
      uniform sampler2D tSharp;
      uniform sampler2D tBokeh;
      uniform sampler2D tDepth;
      uniform sampler2D tBloom;
      uniform vec2 uTexel;
      uniform float uNear;
      uniform float uFar;
      uniform float uFocusDist;
      uniform float uFocusDeadZone;
      uniform float uBgRange;
      uniform float uFgRange;
      uniform float uDofEnabled;
      uniform float uBloomStrength;
      uniform float uExposure;
      uniform float uGrainSeed;
      uniform float uGrainStrength;
      varying vec2 vUv;

      float linearizeDepth(float d) {
        float z = d * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
      }

      float computeSignedCoC(float depth) {
        float diff = depth - uFocusDist;
        if (abs(diff) <= uFocusDeadZone) return 0.0;
        if (diff > 0.0) {
          return clamp((diff - uFocusDeadZone) / uBgRange, 0.0, 1.0);
        } else {
          return clamp((diff + uFocusDeadZone) / uFgRange, -1.0, 0.0);
        }
      }

      float fxaaLuma(vec3 c) {
        vec3 m = c / (1.0 + c);
        return dot(m, vec3(0.299, 0.587, 0.114));
      }

      // Fast inline FXAA executed ONLY on sharp in-focus pixels (silky chrome spokes & feathers, zero wasted work on blurred bg!)
      vec3 sampleSharpFXAA(vec2 uv) {
        vec3 rgbM  = texture2D(tSharp, uv).rgb;
        vec3 rgbNW = texture2D(tSharp, uv + vec2(-1.0, -1.0) * uTexel).rgb;
        vec3 rgbNE = texture2D(tSharp, uv + vec2( 1.0, -1.0) * uTexel).rgb;
        vec3 rgbSW = texture2D(tSharp, uv + vec2(-1.0,  1.0) * uTexel).rgb;
        vec3 rgbSE = texture2D(tSharp, uv + vec2( 1.0,  1.0) * uTexel).rgb;

        float lumaM  = fxaaLuma(rgbM);
        float lumaNW = fxaaLuma(rgbNW);
        float lumaNE = fxaaLuma(rgbNE);
        float lumaSW = fxaaLuma(rgbSW);
        float lumaSE = fxaaLuma(rgbSE);

        float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
        float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
        if (lumaMax - lumaMin < max(0.0312, lumaMax * 0.125)) return rgbM;

        vec2 dir;
        dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
        dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
        float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 0.0078125);
        float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
        dir = clamp(dir * rcpDirMin, vec2(-5.0), vec2(5.0)) * uTexel;

        vec3 rgbA = 0.5 * (
          texture2D(tSharp, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
          texture2D(tSharp, uv + dir * (2.0 / 3.0 - 0.5)).rgb
        );
        vec3 rgbB = rgbA * 0.5 + 0.25 * (
          texture2D(tSharp, uv + dir * -0.5).rgb +
          texture2D(tSharp, uv + dir *  0.5).rgb
        );
        float lumaB = fxaaLuma(rgbB);
        return (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
      }

      vec3 ACESFilm(vec3 x) {
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec3 hdr;
        if (uDofEnabled > 0.5) {
          vec4 bokehSample = texture2D(tBokeh, vUv);
          float depth = linearizeDepth(texture2D(tDepth, vUv).r);
          float coc = computeSignedCoC(depth);

          float bgBlend = smoothstep(0.0, 0.20, coc);
          float fgBlend = max(smoothstep(-0.02, -0.25, coc), smoothstep(0.01, 0.20, bokehSample.a));
          float dofBlend = max(bgBlend, fgBlend);

          if (dofBlend >= 0.99) {
            hdr = bokehSample.rgb;
          } else {
            vec3 sharpCol = sampleSharpFXAA(vUv);
            hdr = mix(sharpCol, bokehSample.rgb, dofBlend);
          }
        } else {
          hdr = sampleSharpFXAA(vUv);
        }

        hdr += texture2D(tBloom, vUv).rgb * uBloomStrength;
        hdr *= uExposure;

        hdr = pow(max(hdr, vec3(0.0)), vec3(0.99, 1.00, 1.035));
        hdr *= vec3(1.03, 1.005, 0.965);

        vec3 col = ACESFilm(hdr);

        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(luma), col, 1.08);

        vec2 centered = (vUv - 0.5) * vec2(1.18, 1.0);
        float vig = smoothstep(0.95, 0.36, length(centered));
        col *= mix(0.84, 1.0, vig);

        col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));

        float grain = (hash12(gl_FragCoord.xy + fract(uGrainSeed * 17.31) * 1000.0) - 0.5) * uGrainStrength;
        col = clamp(col + grain, 0.0, 1.0);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const blendMat = new THREE.ShaderMaterial({
    uniforms: {
      tA: { value: null },
      tB: { value: null },
      uWeight: { value: 0.5 },
    },
    vertexShader: commonVert,
    fragmentShader: `
      uniform sampler2D tA;
      uniform sampler2D tB;
      uniform float uWeight;
      varying vec2 vUv;
      void main() {
        vec3 a = texture2D(tA, vUv).rgb;
        vec3 b = texture2D(tB, vUv).rgb;
        gl_FragColor = vec4(mix(a, b, uWeight), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const quadMesh = new THREE.Mesh(quadGeo, dofMat);
  const quadScene = new THREE.Scene();
  quadScene.add(quadMesh);

  function renderPass(mat, target) {
    quadMesh.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, orthoCam);
  }

  function resize(w, h) {
    width = Math.max(2, Math.floor(w));
    height = Math.max(2, Math.floor(h));
    const hw = Math.max(2, width >> 1);
    const hh = Math.max(2, height >> 1);
    const bw = Math.max(2, width >> 2);
    const bh = Math.max(2, height >> 2);

    rtScene.setSize(width, height);
    rtDofHalf.setSize(hw, hh);
    rtBloomA.setSize(bw, bh);
    rtBloomB.setSize(bw, bh);
    rtAccumA.setSize(width, height);
    rtAccumB.setSize(width, height);

    dofMat.uniforms.uTexel.value.set(1 / width, 1 / height);
    dofMat.uniforms.uResScale.value = height / 1080.0;
    compositeMat.uniforms.uTexel.value.set(1 / width, 1 / height);
    bloomBlurMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
  }

  function renderToTarget(scene, camera, focusDist, timeSeed, targetRT = null, dofConfig = null) {
    // 1. Full-Res Main Scene + DepthTexture
    renderer.setRenderTarget(rtScene);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    // 2. Half-Res 16-Tap Vogel-Disk Circular Bokeh DOF
    const deadZone = dofConfig?.deadZone ?? 0.68;
    const bgRange = dofConfig?.bgRange ?? 3.6;
    const fgRange = dofConfig?.fgRange ?? 2.0;
    const maxBlurBg = dofConfig?.maxBlurBg ?? 11.0;
    const maxBlurFg = dofConfig?.maxBlurFg ?? 58.0;
    const enabledVal = dofConfig?.enabled === false ? 0.0 : 1.0;

    dofMat.uniforms.tColor.value = rtScene.texture;
    dofMat.uniforms.tDepth.value = rtScene.depthTexture;
    dofMat.uniforms.uNear.value = camera.near;
    dofMat.uniforms.uFar.value = camera.far;
    dofMat.uniforms.uFocusDist.value = focusDist;
    dofMat.uniforms.uFocusDeadZone.value = deadZone;
    dofMat.uniforms.uBgRange.value = bgRange;
    dofMat.uniforms.uFgRange.value = fgRange;
    dofMat.uniforms.uMaxBlurBg.value = maxBlurBg;
    dofMat.uniforms.uMaxBlurFg.value = maxBlurFg;
    dofMat.uniforms.uDofEnabled.value = enabledVal;
    renderPass(dofMat, rtDofHalf);

    // 3. Quarter-Res Selective HDR Bloom
    bloomExtractMat.uniforms.tDiffuse.value = rtDofHalf.texture;
    renderPass(bloomExtractMat, rtBloomA);

    bloomBlurMat.uniforms.tDiffuse.value = rtBloomA.texture;
    bloomBlurMat.uniforms.uDirection.value.set(1, 0);
    renderPass(bloomBlurMat, rtBloomB);

    bloomBlurMat.uniforms.tDiffuse.value = rtBloomB.texture;
    bloomBlurMat.uniforms.uDirection.value.set(0, 1);
    renderPass(bloomBlurMat, rtBloomA);

    // 4. Full-Res Cinema Composite (Inline Sharp Hero FXAA + Creamy Bokeh + ACES + Grading + Grain)
    compositeMat.uniforms.tSharp.value = rtScene.texture;
    compositeMat.uniforms.tBokeh.value = rtDofHalf.texture;
    compositeMat.uniforms.tDepth.value = rtScene.depthTexture;
    compositeMat.uniforms.tBloom.value = rtBloomA.texture;
    compositeMat.uniforms.uNear.value = camera.near;
    compositeMat.uniforms.uFar.value = camera.far;
    compositeMat.uniforms.uFocusDist.value = focusDist;
    compositeMat.uniforms.uFocusDeadZone.value = deadZone;
    compositeMat.uniforms.uBgRange.value = bgRange;
    compositeMat.uniforms.uFgRange.value = fgRange;
    compositeMat.uniforms.uDofEnabled.value = enabledVal;
    compositeMat.uniforms.uGrainSeed.value = timeSeed;
    renderPass(compositeMat, targetRT);
  }

  function render(scene, camera, focusDist, timeSeed, dofConfig = null) {
    renderToTarget(scene, camera, focusDist, timeSeed, null, dofConfig);
  }

  function renderShutterBlended(scene, camera, applyStateFn, t, dt, dofConfig = null) {
    const f1 = applyStateFn(t - dt * 0.25);
    renderToTarget(scene, camera, f1, t, rtAccumA, dofConfig);

    const f2 = applyStateFn(t + dt * 0.25);
    renderToTarget(scene, camera, f2, t, rtAccumB, dofConfig);

    blendMat.uniforms.tA.value = rtAccumA.texture;
    blendMat.uniforms.tB.value = rtAccumB.texture;
    blendMat.uniforms.uWeight.value = 0.5;
    renderPass(blendMat, null);
  }

  return {
    render,
    renderShutterBlended,
    resize,
    dofMat,
    compositeMat,
  };
}
