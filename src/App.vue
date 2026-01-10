<template>
  <div id="scene-container" ref="containerRef" class="scene-container">
    <!-- three.js 场景挂载在这里 -->
    <LightDialog />

    <!-- 右上角控制面板 -->
    <div class="control-panel">
      <div class="panel-header">
        <div>
          <h3>三维传动演示</h3>
          <p>调节视角与主动 / 传动轴转速</p>
        </div>
        <button class="chip-btn" @click="resetAll">复位</button>
      </div>

      <div class="panel-section">
        <div class="section-title">视角预设</div>
        <div class="view-row">
          <button @click="setView('iso')">等轴测</button>
          <button @click="setView('front')">正视图</button>
          <button @click="setView('side')">侧视图</button>
          <button @click="setView('top')">俯视图</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-title">
          旋转控制
          <button class="chip-btn small" @click="toggleRotate">
            {{ isRotating ? '暂停' : '开始' }}
          </button>
        </div>

        <div class="control-row">
          <div class="label">主动轴转速 (rad/s)</div>
          <input
            type="range"
            min="-6.28"
            max="6.28"
            step="0.05"
            v-model.number="activeSpeed"
          />
          <input
            class="number-input"
            type="number"
            step="0.1"
            v-model.number="activeSpeed"
          />
        </div>

        <div class="ratio-row">
          <label>
            <input type="checkbox" v-model="lockRatio" />
            按传动比联动传动轴
          </label>
          <span class="ratio-text">当前比：{{ gearRatio.toFixed(2) }}</span>
        </div>

        <div class="control-row">
          <div class="label">
            传动轴转速 (rad/s)
            <span v-if="lockRatio" class="hint">由主动轴推导</span>
          </div>
          <input
            type="range"
            min="-6.28"
            max="6.28"
            step="0.05"
            v-model.number="drivenSpeed"
            :disabled="lockRatio"
          />
          <input
            class="number-input"
            type="number"
            step="0.1"
            v-model.number="drivenSpeed"
            :disabled="lockRatio"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import LightDialog from './LightDialog.vue';

const containerRef = ref(null);
// 主动轴 / 传动轴角速度（弧度每秒），初始大约 ±45°/s
const activeSpeed = ref(Math.PI * 0.25);
const drivenSpeed = ref(-Math.PI * 0.2);
const isRotating = ref(true);
const lockRatio = ref(true);
const gearRatio = ref(-2); // 传动轴 / 主动轴

// 当前模型半径（用于计算不同视角的相机距离）
const modelRadius = ref(3);

// 为了更直观地观察，将旋转轴统一设置为 three.js 世界坐标系的 Y 轴
//（即竖直方向），如需改为 X / Z 轴，只需调整下方两个常量
const ACTIVE_ROT_AXIS = 'z';  // 主动轴围绕哪一轴旋转
const DRIVEN_ROT_AXIS = 'z';  // 传动轴围绕哪一轴旋转

// 切换视角
const setView = (type) => {
  // 相机、控制器在 onMounted 里挂到 window 上，避免在模板中直接引用 three 对象
  const camera = window.__threeCamera;
  const controls = window.__threeControls;
  if (!camera || !controls) return;

  const r = modelRadius.value || 6;

  if (type === 'iso') {
    camera.position.set(r * 0.8, r * 0.9, r * 1.8);
  } else if (type === 'front') {
    camera.position.set(0, r * 0.3, r * 2.2);
  } else if (type === 'side') {
    camera.position.set(r * 2.2, r * 0.3, 0.01);
  } else if (type === 'top') {
    camera.position.set(0.01, r * 2.2, 0.01);
  }

  controls.target.set(0, 0, 0);
  camera.lookAt(0, 0, 0);
  controls.update();
};

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;

  // 1. 场景
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  // 2. 相机
  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(0, 4, 10);
  camera.lookAt(0, 0, 0);

  // 暴露给视角控制函数使用
  window.__threeCamera = camera;

  // 3. 渲染器
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // 4. 环境光 + 平行光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7);
  scene.add(directionalLight);

  // 5. 轨道控制器
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);

  window.__threeControls = controls;

  // 6. 加载 glb 模型
  const loader = new GLTFLoader();
  let emptyObj = null;
  let emptyObj001 = null;

  // 创建文字精灵（用于标注主动轴 / 传动轴）
  const createLabelSprite = (text, color = '#ffffff') => {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(32, 96, size - 64, 64, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 56px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.8, 1.8, 1.8);
    return sprite;
  };

  loader.load(
    '/models/Assembly.glb',
    (gltf) => {
      const model = gltf.scene;

      // 模型整体居中并适当缩放
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      model.position.sub(center); // 居中到原点

      const maxAxis = Math.max(size.x, size.y, size.z) || 1;
      // 放大一点，让模型在视野里更占据主体
      const scale = 15 / maxAxis;
      model.scale.setScalar(scale);

      // 遍历上色
      const colorPalette = [
        new THREE.Color(0x4fc3f7),
        new THREE.Color(0xffb74d),
        new THREE.Color(0xa5d6a7),
        new THREE.Color(0xce93d8),
        new THREE.Color(0xff8a65),
      ];
      let colorIndex = 0;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          const color = colorPalette[colorIndex % colorPalette.length];
          colorIndex += 1;

          child.material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.3,
            roughness: 0.4,
          });
        }

        // 记录需要旋转的空物体
        if (child.name === '空物体') {
          emptyObj = child;
        } else if (child.name === '空物体001') {
          emptyObj001 = child;
        }
      });

      // 根据模型尺寸适当调整相机距离和控制器目标
      const radius = (maxAxis * scale) * 0.6;
      modelRadius.value = radius;
      controls.target.set(0, 0, 0);
      camera.position.set(radius * 0.6, radius * 0.7, radius * 1.8);
      camera.lookAt(0, 0, 0);

      // 在空物体上添加“主动轴”“传动轴”标签
      if (emptyObj) {
        const sprite = createLabelSprite('主动轴', '#ffeb3b');
        if (sprite) {
          sprite.position.set(0, radius * 0.2, 0);
          emptyObj.add(sprite);
        }
      }
      if (emptyObj001) {
        const sprite = createLabelSprite('传动轴', '#4fc3f7');
        if (sprite) {
          sprite.position.set(0, radius * 0.2, 0);
          emptyObj001.add(sprite);
        }
      }

      scene.add(model);
    },
    undefined,
    (error) => {
      console.error('加载 Assembly.glb 失败:', error);
    }
  );

  // 7. 动画循环：让空物体绕 Z 轴旋转
  let animationId = null;
  const clock = new THREE.Clock();

  function animate() {
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // 使用 Vue 中可调的角速度控制旋转
    if (isRotating.value) {
      if (emptyObj) {
        emptyObj.rotation[ACTIVE_ROT_AXIS] += activeSpeed.value * delta;
      }
      if (emptyObj001) {
        emptyObj001.rotation[DRIVEN_ROT_AXIS] += drivenSpeed.value * delta;
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // 窗口自适应
  const onResize = () => {
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener('resize', onResize);

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
    if (animationId !== null) cancelAnimationFrame(animationId);
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  });

  // 根据主动轴速度自动更新传动轴（当锁定传动比时）
  watch(
    [activeSpeed, lockRatio, gearRatio],
    () => {
      if (lockRatio.value) {
        drivenSpeed.value = activeSpeed.value * gearRatio.value;
      }
    },
    { immediate: true }
  );

  // 控制函数
  const toggleRotate = () => {
    isRotating.value = !isRotating.value;
  };

  const resetAll = () => {
    activeSpeed.value = Math.PI * 0.25;
    gearRatio.value = -2;
    lockRatio.value = true;
    isRotating.value = true;
    // 视角回到等轴测
    setView('iso');
  };
});
</script>

<style>
.scene-container {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  position: relative;
}

.scene-container canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.control-panel {
  position: absolute;
  right: 16px;
  top: 16px;
  padding: 14px 16px 12px;
  background: radial-gradient(circle at top left, rgba(96, 165, 250, 0.35), rgba(15, 23, 42, 0.9));
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  min-width: 260px;
  backdrop-filter: blur(4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 9;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.panel-header p {
  margin: 2px 0 0;
  font-size: 11px;
  opacity: 0.8;
}

.panel-section {
  padding-top: 6px;
  margin-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
  color: #e5e7eb;
}

.chip-btn {
  border: none;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  background: rgba(15, 118, 110, 0.9);
  color: #e0f2f1;
}

.chip-btn.small {
  padding: 2px 8px;
  font-size: 10px;
}

.chip-btn:hover {
  background: rgba(13, 148, 136, 1);
}

.view-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.view-row button {
  flex: 1;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  background: #2196f3;
  color: #fff;
}

.view-row button:hover {
  background: #1976d2;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.control-row .label {
  white-space: nowrap;
}

.control-row input[type='range'] {
  flex: 1;
}

.number-input {
  width: 60px;
  padding: 2px 4px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid rgba(148, 163, 184, 0.8);
  background: rgba(15, 23, 42, 0.8);
  color: #e5e7eb;
}

.number-input:disabled {
  opacity: 0.5;
}

.ratio-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  font-size: 11px;
}

.ratio-text {
  opacity: 0.9;
}

.hint {
  margin-left: 4px;
  font-size: 10px;
  opacity: 0.8;
}
</style>