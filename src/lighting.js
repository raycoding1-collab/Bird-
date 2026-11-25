import * as THREE from 'three';

/**
 * Sets up cinema-grade Mediterranean morning lighting & procedural PMREM IBL reflections:
 * - Custom sunlit Mediterranean sky-and-warm-ground light dome rendered through PMREMGenerator
 * - Warm low-angle golden morning key sun casting 2048x2048 PCFSoftShadowMap shadows
 * - Cool-sky / warm-ochre-ground GI HemisphereLight
 * - Warm rim backlight cleanly separating the white pelican feathers from sunlit storefronts
 * - Gentle cool morning fill so shadow sides of white feathers stay luminous & colorful
 */
export function setupLighting(scene, renderer) {
  // Golden morning sun direction: slanting diagonally from front-left-high across street & storefronts
  // Throws crisp shadows toward (+X, -Z) across cobblestones & village facades AND lights the pelican in 3/4 golden key!
  const sunPosition = new THREE.Vector3(-14.0, 9.0, 10.5);
  const sunDirection = sunPosition.clone().normalize();

  // =========================================================================
  // 1. PROCEDURAL MEDITERRANEAN SKY DOME + PMREM IBL ENVIRONMENT MAP
  // =========================================================================
  const skyDomeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: sunDirection.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;

        // Mediterranean morning sky gradient: Provence azure zenith -> soft luminous cream-apricot horizon
        vec3 zenithCol = vec3(0.24, 0.50, 0.82);
        vec3 midSkyCol = vec3(0.56, 0.76, 0.94);
        vec3 horizonCol = vec3(1.00, 0.89, 0.74);
        vec3 groundWarm = vec3(0.68, 0.49, 0.33);
        vec3 groundDeep = vec3(0.32, 0.24, 0.18);

        vec3 col;
        if (y >= 0.0) {
          float t1 = smoothstep(0.0, 0.28, y);
          float t2 = smoothstep(0.22, 0.88, y);
          col = mix(horizonCol, midSkyCol, t1);
          col = mix(col, zenithCol, t2);
        } else {
          float g = smoothstep(0.0, -0.55, y);
          col = mix(horizonCol * 0.82, groundWarm, smoothstep(0.0, -0.15, y));
          col = mix(col, groundDeep, g);
        }

        // Radiant warm golden morning sun disc + atmospheric Mie halo (powers crisp chrome & eye catchlights!)
        float sunDot = max(dot(d, uSunDir), 0.0);
        float sunHalo = pow(sunDot, 10.0) * 0.55 + pow(sunDot, 64.0) * 1.4;
        float sunDisc = smoothstep(0.9965, 0.9992, sunDot) * 9.0;
        col += vec3(1.0, 0.86, 0.64) * sunHalo;
        col += vec3(1.0, 0.95, 0.82) * sunDisc;

        // Subtle opposite sunlit village warm bounce glow near horizon for realistic IBL reflections
        float villageBounce = max(0.0, -d.z) * (1.0 - abs(y)) * 0.26;
        col += vec3(0.95, 0.76, 0.55) * villageBounce;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // Visible sky dome in main scene (rendered last with Early-Z so hidden pixels behind storefronts skip shading!)
  const mainSkyDome = new THREE.Mesh(new THREE.SphereGeometry(65, 32, 20), skyDomeMat);
  mainSkyDome.renderOrder = 999;
  scene.add(mainSkyDome);

  // Subtle warm Mediterranean morning atmospheric depth fog (very gentle so hero is crisp & distant roofs soften)
  scene.fog = new THREE.FogExp2(0xf5e4cc, 0.0115);

  // Generate real PMREM IBL environment map from dedicated light-dome scene!
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 20), skyDomeMat);
  envScene.add(envDome);

  // Add subtle bright sky-panel highlights & warm stucco bounce cards inside the IBL dome for extra jewel-like reflections on chrome spokes, cherry-red clearcoat & pelican eyes
  const sunPanel = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 3.8, 2.8) })
  );
  sunPanel.position.copy(sunDirection).multiplyScalar(14);
  envScene.add(sunPanel);

  const skyBouncePanel = new THREE.Mesh(
    new THREE.SphereGeometry(3.5, 12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.9, 2.6) })
  );
  skyBouncePanel.position.set(6, 12, 6);
  envScene.add(skyBouncePanel);

  const envRT = pmrem.fromScene(envScene, 0.035);
  scene.environment = envRT.texture;
  pmrem.dispose();

  // =========================================================================
  // 2. GOLDEN MORNING KEY SUN + CRISP 2048x2048 TIGHT-FRUSTUM PCF SHADOWS
  // =========================================================================
  const sunLight = new THREE.DirectionalLight(0xffe6be, 2.75);
  sunLight.position.copy(sunPosition);
  sunLight.target.position.set(0, 0.65, -0.4);
  scene.add(sunLight);
  scene.add(sunLight.target);

  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -6.8;
  sunLight.shadow.camera.right = 6.8;
  sunLight.shadow.camera.top = 5.4;
  sunLight.shadow.camera.bottom = -2.6;
  sunLight.shadow.camera.near = 3.0;
  sunLight.shadow.camera.far = 36.0;
  sunLight.shadow.bias = -0.00038;
  sunLight.shadow.normalBias = 0.018;
  sunLight.shadow.radius = 2.6;

  // =========================================================================
  // 3. GI HEMISPHERE BOUNCE + WARM FEATHER-SEPARATING RIM + COOL FILL
  // =========================================================================
  const hemiLight = new THREE.HemisphereLight(0x94bee8, 0xcf945e, 0.78);
  scene.add(hemiLight);

  // Warm golden rim backlight separating the white pelican cleanly from sunlit storefronts
  const rimLight = new THREE.DirectionalLight(0xffd79e, 0.80);
  rimLight.position.set(5.5, 6.2, -9.5);
  scene.add(rimLight);

  // Soft cool morning sky fill from front-right so shadow sides of white feathers read cool-ivory & sculptural
  const fillLight = new THREE.DirectionalLight(0xbdd7f5, 0.28);
  fillLight.position.set(8.0, 4.5, 8.5);
  scene.add(fillLight);

  return {
    sunLight,
    sunDirection,
    envRT,
  };
}
