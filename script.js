import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/OrbitControls.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm';

// --- 全局变量 ---
let scene, camera, renderer, controls;
let treeGroup, snowSystem, ground;
let handLandmarker, webcam;
let lightsList = []; 
let treeLayers = [];

// 判定是否为移动设备
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

let gameState = {
    isRotating: true,
    rotationSpeed: 0.003,
    baseSpeed: 0.003,
    fastSpeed: 0.04,
    isMusicPlaying: false,
    zoomedGift: null, 
    // 增加一个状态：相机是否正在动画中
    isCameraAnimating: false, 
    originalCameraPos: new THREE.Vector3(),
    isBlossomed: false, 
    blossomProgress: 0.0, 
    blossomDirection: 0 
};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// MediaPipe 手势识别相关变量 - 移到前面确保初始化
let lastVideoTime = -1;
let lastPredictionTime = 0;

// --- 初始化 ---
init();
animate();
setupMediaPipe();
setupUIEvents();

function init() {
    // 1. 场景
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1b2845, 0.015);

    // 2. 相机 - 移动端适配视角
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    const startZ = isMobile ? 45 : 35; 
    const startY = isMobile ? 10 : 12;
    camera.position.set(0, startY, startZ);
    gameState.originalCameraPos.copy(camera.position);

    // 3. 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = isMobile ? 0.1 : 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; 
    controls.minDistance = 5;
    controls.maxDistance = 80;
    // 优化移动端控制
    if (isMobile) {
        controls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
        };
        controls.enableZoom = true;
        controls.enablePan = false;
        controls.rotateSpeed = 0.8;
        controls.zoomSpeed = 0.5;
    }

    setupEnvironment();
    createStylizedTree();
    createSnow();

    window.addEventListener('resize', onWindowResize);
    
    // 兼容触摸和点击
    window.addEventListener('click', onMouseClick);
    window.addEventListener('touchstart', onTouchStart, { passive: false });

    // Hide Loading
    setTimeout(() => {
        const loading = document.getElementById('loading');
        loading.style.opacity = 0;
        setTimeout(() => loading.remove(), 600);
    }, 1500);
}

function setupEnvironment() {
    const ambientLight = new THREE.AmbientLight(0xffe0b5, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffd1a6, 1.2);
    mainLight.position.set(20, 30, 20);
    mainLight.castShadow = true;
    const shadowSize = isMobile ? 1024 : 2048;
    mainLight.shadow.mapSize.width = shadowSize;
    mainLight.shadow.mapSize.height = shadowSize;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 100;
    mainLight.shadow.camera.left = -30; mainLight.shadow.camera.right = 30;
    mainLight.shadow.camera.top = 30; mainLight.shadow.camera.bottom = -30;
    scene.add(mainLight);

    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        roughness: 1,
        metalness: 0.0
    });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}

function createStylizedTree() {
    treeGroup = new THREE.Group();
    treeLayers = []; 

    const leafMat = new THREE.MeshStandardMaterial({
        color: 0x2d9e5b,
        roughness: 0.7,
        flatShading: true,
        transparent: true,
        opacity: 1.0
    });

    const layerParams = [
        { rTop: 0.5, rBot: 9, h: 8, y: 4, seg: 8, offset: 5.5 }, 
        { rTop: 0.5, rBot: 7, h: 7, y: 9, seg: 8, offset: 4.5 },
        { rTop: 0.5, rBot: 5, h: 6, y: 13.5, seg: 7, offset: 3.5 },
        { rTop: 0.1, rBot: 3, h: 5, y: 17.5, seg: 6, offset: 2.5 }
    ];

    layerParams.forEach((p, index) => {
        const geo = new THREE.CylinderGeometry(p.rTop, p.rBot, p.h, p.seg);
        const positionAttribute = geo.attributes.position;
        for (let i = 0; i < positionAttribute.count; i++) {
            positionAttribute.setY(i, positionAttribute.getY(i) + (Math.random() - 0.5) * 0.5);
        }
        geo.computeVertexNormals();
        
        const mesh = new THREE.Mesh(geo, leafMat);
        mesh.position.y = p.y;
        mesh.castShadow = true; 
        
        mesh.userData.originalY = p.y;
        mesh.userData.blossomOffset = p.offset;
        mesh.userData.layerIndex = index;

        treeGroup.add(mesh);
        treeLayers.push(mesh);
    });

    const trunkGeo = new THREE.CylinderGeometry(1.2, 1.6, 5, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a23, roughness: 0.9, flatShading: true });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const starGeo = new THREE.OctahedronGeometry(1.2, 0);
    const starMat = new THREE.MeshStandardMaterial({ 
        color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.8, flatShading: true 
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.y = 20.5;
    star.userData.originalY = 20.5;
    treeGroup.add(star);
    lightsList.push(star); 

    addDecorations();

    scene.add(treeGroup);
}

function startBlossomAnimation() {
    if (gameState.isBlossomed) {
        resetTree(); 
    } else {
        blossomTree(); 
        // 绽放时增强雪花效果
        if (snowSystem) {
            snowSystem.material.opacity = 1.0;
        }
    }
}

function blossomTree() {
    gameState.blossomDirection = 1; 
    gameState.isBlossomed = true;
    gameState.isRotating = false; 
}

function resetTree() {
    gameState.blossomDirection = -1; 
    gameState.isBlossomed = false;
    gameState.isRotating = true; 
    // 重置雪花效果
    if (snowSystem) {
        snowSystem.material.opacity = 0.7;
    }
}

function updateBlossom() {
    if (gameState.blossomDirection === 0) return;
    
    // 使用缓动函数，让动画更流畅
    const easeFactor = gameState.blossomDirection > 0 ? 0.08 : 0.1;
    gameState.blossomProgress += gameState.blossomDirection * easeFactor; 
    gameState.blossomProgress = Math.min(1.0, Math.max(0.0, gameState.blossomProgress));
    
    if (gameState.blossomProgress === 1.0 && gameState.blossomDirection === 1) {
        gameState.blossomDirection = 0;
    } else if (gameState.blossomProgress === 0.0 && gameState.blossomDirection === -1) {
        gameState.blossomDirection = 0;
    }

    // 计算绽放进度的缓动值
    let easedProgress;
    if (gameState.blossomDirection > 0) {
        // 绽放时使用加速缓动
        easedProgress = 1 - Math.pow(1 - gameState.blossomProgress, 3);
    } else {
        // 重置时使用减速缓动
        easedProgress = Math.pow(gameState.blossomProgress, 3);
    }

    treeLayers.forEach(layer => {
        const p = easedProgress;
        
        // 垂直位移效果
        const offset = layer.userData.blossomOffset * p;
        layer.position.y = layer.userData.originalY + offset; 
        
        // 旋转效果
        layer.rotation.y = layer.userData.layerIndex * p * 0.8; 
        
        // 缩放效果 - 增强绽放感
        const scaleFactor = 1 + p * 0.2;
        layer.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // 透明度变化
        layer.material.opacity = 1 - p * 0.1;
    });
    
    // 处理礼物跟随绽放动画，避免重叠
    treeGroup.children.forEach(child => {
        if (child.name === "gift") {
            const p = easedProgress;
            
            // 获取礼物的原始位置（如果没有保存，先保存）
            if (!child.userData.originalPosition) {
                child.userData.originalPosition = child.position.clone();
            }
            
            const originalPos = child.userData.originalPosition;
            
            // 估算礼物所属树层
            const layerIndex = Math.floor((originalPos.y - 2) / 4);
            
            // 跟随树层的垂直移动
            const treeLayerOffset = layerIndex * 3 * p;
            
            // 径向偏移，使礼物向外扩散，避免重叠
            const radialOffset = originalPos.length() * p * 0.15;
            const direction = new THREE.Vector3(originalPos.x, 0, originalPos.z).normalize();
            
            // 更新礼物位置
            child.position.x = originalPos.x + direction.x * radialOffset;
            child.position.y = originalPos.y + treeLayerOffset;
            child.position.z = originalPos.z + direction.z * radialOffset;
            
            // 礼物缩放效果
            const giftScale = 1 + p * 0.15;
            child.scale.set(giftScale, giftScale, giftScale);
            
            // 礼物旋转效果
            child.rotation.y += p * 0.02;
        }
    });
    
    // 星星效果增强
    const star = lightsList[0];
    if (star.userData.originalY) {
        // 垂直移动
        star.position.y = star.userData.originalY + easedProgress * 7;
        
        // 缩放效果
        const starScale = 1 + easedProgress * 0.5;
        star.scale.set(starScale, starScale, starScale);
        
        // 增强发光效果
        if (star.material.emissiveIntensity) {
            star.material.emissiveIntensity = 0.8 + easedProgress * 1.2;
        }
    }
    
    // 增强灯光效果
    lightsList.forEach((light, index) => {
        if (light !== star && light.material.emissiveIntensity) {
            const intensityVariation = Math.sin(Date.now() * 0.002 + index) * 0.3;
            light.material.emissiveIntensity = 0.6 + easedProgress * 0.8 + intensityVariation;
        }
    });
    
    // 旋转整个树组，增强视觉效果
    if (gameState.isBlossomed) {
        treeGroup.rotation.y += 0.01;
    }
}

function addDecorations() {
      const bulbColors = [0xff3333, 0xffd700, 0x3333ff, 0x00ff00, 0xffffff];
      const decorationCount = isMobile ? 25 : 40; // 移动端减少装饰数量
      for (let i = 0; i < decorationCount; i++) {
          const color = bulbColors[Math.floor(Math.random() * bulbColors.length)];
          const mat = new THREE.MeshStandardMaterial({
              color: color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3
           });
          // 移动端减少几何体精度
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, isMobile ? 8 : 12, isMobile ? 8 : 12), mat);
          
          const angle = i * 0.5 + Math.random() * 0.2;
          const y = Math.random() * 16 + 2;
          const currentR = Math.max(1.5, 9 * (1 - (y-2)/20)) + 0.5;

          bulb.position.set(Math.cos(angle)*currentR, y, Math.sin(angle)*currentR);
          
          bulb.userData = { baseIntensity: 0.6 + Math.random() * 0.4, speed: Math.random() * 0.05 }; 
          treeGroup.add(bulb);
          lightsList.push(bulb);
      }
}

function createSnow() {
    // 移动端大量减少粒子数量以保证流畅度
    const particleCount = isMobile ? 300 : 1500;
    const geo = new THREE.BufferGeometry();
    const pos = []; const vel = [];
    for (let i = 0; i < particleCount; i++) {
        pos.push(Math.random()*100-50, Math.random()*80, Math.random()*100-50);
        vel.push((Math.random()-0.5)*0.1, Math.random()*-0.15-0.05, (Math.random()-0.5)*0.1);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ 
        color: 0xffffff, 
        size: isMobile ? 0.3 : 0.4, 
        transparent: true, 
        opacity: 0.7, 
        blending: THREE.AdditiveBlending
    });
    snowSystem = new THREE.Points(geo, mat);
    snowSystem.userData = { velocities: vel };
    scene.add(snowSystem);
}

function setupUIEvents() {
    const musicBtn = document.getElementById('music-btn');
    const bgMusic = document.getElementById('bg-music');
    const musicInput = document.getElementById('music-input');

    // --- 1. 音乐播放/暂停逻辑 (优化用户体验) ---
    musicBtn.addEventListener('click', () => {
        // 检查音乐源是否为空
        if (!bgMusic.currentSrc || bgMusic.currentSrc === window.location.href) {
            alert("请先选择一首音乐文件~");
            return;
        }
        
        if (gameState.isMusicPlaying) {
            // 暂停音乐
            bgMusic.pause();
            musicBtn.textContent = "🎵 播放音乐";
            gameState.isMusicPlaying = false;
        } else {
            // 尝试播放
            bgMusic.play().then(() => {
                musicBtn.textContent = "⏸ 暂停音乐";
                gameState.isMusicPlaying = true;
            }).catch(e => {
                console.log("播放失败或被拦截:", e);
                if (e.name === 'NotAllowedError') {
                    alert("播放被浏览器拦截，请先点击屏幕再尝试播放音乐~");
                } else if (e.name === 'NotSupportedError') {
                    alert("当前浏览器不支持播放此音频文件，请尝试其他格式~");
                } else {
                    alert("播放失败，请检查音频文件是否有效~");
                }
            });
        }
    });

    // --- 2. 新增：监听音乐上传 ---
    musicInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // 检查是不是音频文件
        if (!file.type.startsWith('audio/')) {
            alert('请上传音频文件 (mp3, wav, etc.)');
            return;
        }

        // 创建本地播放地址 (Blob URL)
        const fileURL = URL.createObjectURL(file);
        
        // 替换音频源
        bgMusic.src = fileURL;
        
        // 重置播放状态
        gameState.isMusicPlaying = false;
        
        // 显示加载状态
        musicBtn.textContent = "⏳ 加载中...";
        musicBtn.disabled = true;
        
        // 监听音频加载完成事件
        bgMusic.onloadeddata = () => {
            // 音频加载完成后更新UI
            musicBtn.textContent = "🎵 播放新歌";
            musicBtn.disabled = false;
            alert(`已切换为: ${file.name}`);
        };
        
        // 监听加载错误事件
        bgMusic.onerror = () => {
            musicBtn.textContent = "📂 选歌";
            musicBtn.disabled = false;
            alert(`无法加载音频文件: ${file.name}`);
        };
    });

    // --- 其他原有事件保持不变 ---
    document.getElementById('file-input').addEventListener('change', handleImageUpload);
    document.getElementById('cam-btn').addEventListener('click', enableCam);
    
    // 3. 主题文本更新逻辑 - 添加空值检查
    const themeTextInput = document.getElementById('theme-text-input');
    const headerTitle = document.querySelector('#ui-panel h1');
    if (themeTextInput && headerTitle) {
        themeTextInput.addEventListener('input', (event) => {
            const text = event.target.value.trim() === "" ? "My Christmas Gift For You" : event.target.value;
            headerTitle.textContent = text;
        });
    }
    
    // 4. 互动说明弹窗逻辑
    const showGestureModalBtn = document.getElementById('show-gesture-modal-btn');
    const gestureModal = document.getElementById('gesture-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    
    // 显示弹窗
    if (showGestureModalBtn && gestureModal) {
        showGestureModalBtn.addEventListener('click', () => {
            gestureModal.classList.add('visible');
        });
    }
    
    // 隐藏弹窗
    if (closeModalBtn && gestureModal) {
        closeModalBtn.addEventListener('click', () => {
            gestureModal.classList.remove('visible');
        });
        
        // 点击弹窗外部关闭弹窗
        gestureModal.addEventListener('click', (event) => {
            if (event.target === gestureModal) {
                gestureModal.classList.remove('visible');
            }
        });
    }
}

function handleImageUpload(event) {
    const files = event.target.files;
    if (!files.length) return;
    
    Array.from(files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const texture = new THREE.TextureLoader().load(e.target.result);
            texture.encoding = THREE.sRGBEncoding; 

            const boxSize = 2.2;
            const boxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize * 0.1); 
            const giftMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }); 
            const photoMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4 });

            // Z+ 面 (索引 4) 放置照片，其他面是礼盒材质
            const materials = [giftMat, giftMat, giftMat, giftMat, photoMat, giftMat];
            const gift = new THREE.Mesh(boxGeo, materials);
            gift.name = "gift"; 
            gift.castShadow = true;

            const angle = index * 1.1 + Math.PI;
            const y = 3.5 + index * 1.8;
            const currentR = Math.max(3, 9 * (1 - (y-3)/20)) + 0.5;

            gift.position.set(Math.cos(angle) * currentR, y, Math.sin(angle) * currentR);
            gift.lookAt(0, y, 0);
            gift.rotateY(Math.PI); 
            treeGroup.add(gift);
        };
        reader.readAsDataURL(file);
    });
}

/**
 * 修复的关键函数：放大到礼物盒
 */
function zoomToGift(giftMesh) {
    // 阻止重复或中断的动画
    if (gameState.isCameraAnimating) return;
    gameState.isCameraAnimating = true;

    gameState.zoomedGift = giftMesh;
    gameState.isRotating = false; 
    controls.enabled = false; 

    const targetPos = new THREE.Vector3();
    giftMesh.getWorldPosition(targetPos);
    
    // 计算相机最终位置：在礼物盒前方 5 个单位 (稍微拉近到 4.5)
    const offset = new THREE.Vector3(0, 0, 4.5);
    offset.applyQuaternion(giftMesh.getWorldQuaternion(new THREE.Quaternion()));
    const camEndPos = targetPos.clone().add(offset);

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone(); // 记录起始控制目标
    let progress = 0;
    
    function animateCamera() {
        if (!gameState.zoomedGift && gameState.isCameraAnimating) return; 
        
        progress += 0.04; // 略微加快动画速度
        if (progress <= 1) {
            // 使用 Lerp 平滑移动相机位置
            camera.position.lerpVectors(startPos, camEndPos, progress);
            // 同时平滑移动 controls 目标点到礼物盒中心
            controls.target.lerpVectors(startTarget, targetPos, progress);
            requestAnimationFrame(animateCamera);
        } else {
             controls.target.copy(targetPos);
             gameState.isCameraAnimating = false; // 动画完成
        }
    }
    animateCamera();
    document.getElementById('ui-panel').style.opacity = '0.2'; 
}

/**
 * 修复的关键函数：复位相机
 */
function resetCamera() {
    // 阻止重复或中断的动画
    if (gameState.isCameraAnimating) return;
    gameState.isCameraAnimating = true;

    gameState.zoomedGift = null;
    gameState.isRotating = true;
    
    // controls.enabled 必须在动画结束后再开启，否则会干扰动画
    
    const startPos = camera.position.clone();
    const endPos = gameState.originalCameraPos;
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(0, 0, 0); // 复位到原点

    let progress = 0;
    function animateCameraBack() {
        if (gameState.zoomedGift && gameState.isCameraAnimating) return; 
        
        progress += 0.04;
        if (progress <= 1) {
            camera.position.lerpVectors(startPos, endPos, progress);
            controls.target.lerpVectors(startTarget, endTarget, progress);
            requestAnimationFrame(animateCameraBack);
        } else {
            document.getElementById('ui-panel').style.opacity = '1';
            controls.target.copy(endTarget); 
            controls.enabled = true; // 动画完成后重新启用 controls
            gameState.isCameraAnimating = false; // 动画完成
        }
    }
    animateCameraBack();
}

/**
 * 修复的关键函数：点击检测
 */
function checkIntersection() {
    // 增加判断：如果相机正在动画中，则忽略所有点击
    if (gameState.isCameraAnimating) return; 

    if (gameState.zoomedGift) {
        resetCamera(); // 如果已放大，则点击任何地方都复位
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(treeGroup.children, true);
    
    for (let i = 0; i < intersects.length; i++) {
        let target = intersects[i].object;
        // 向上遍历父级直到找到名为 'gift' 的 Mesh
        while(target && target.name !== 'gift' && target.parent !== treeGroup) {
            target = target.parent;
        }
        
        if (target && target.name === 'gift') {
            zoomToGift(target);
            break;
        }
    }
}

function onTouchStart(event) {
    if (event.touches.length > 1) return;
    mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
    // 优化触摸事件，立即执行但检测是否有移动
    checkIntersection();
}

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    checkIntersection();
}


// --- MediaPipe 函数优化 --- 

async function setupMediaPipe() {
    try {
        // 尝试从CDN加载MediaPipe资源，添加超时处理
        const visionPromise = FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
        
        // 添加30秒超时
        const vision = await Promise.race([
            visionPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('MediaPipe加载超时')), 30000))
        ]);
        
        // 创建HandLandmarker实例
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU" // 始终使用GPU以提高识别速度和准确性
            },
            runningMode: "VIDEO", 
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        console.log("MediaPipe加载成功");
    } catch (error) {
        console.error("MediaPipe加载失败:", error);
        // 可以选择向用户显示友好的错误信息
        // alert("手势识别功能加载失败，请检查网络连接后刷新页面重试。");
        // 不中断应用运行，其他功能仍可使用
        handLandmarker = null;
    }
}

function enableCam() {
    webcam = document.getElementById('webcam');
    const constraints = { video: { facingMode: "user", width: isMobile ? 320 : 640 } };
    
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        webcam.srcObject = stream;
        document.querySelector('.cam-wrapper').style.display = 'block';
        webcam.addEventListener('loadeddata', predictWebcam);
        document.getElementById('cam-btn').style.display = 'none';
    }).catch(err => {
        console.error("摄像头开启失败", err);
        alert("无法开启摄像头，请检查权限。");
    });
}

async function predictWebcam() {
    // 控制预测频率，调整为更适合手势识别的频率
    const currentTime = performance.now();
    const predictionInterval = isMobile ? 60 : 40; // 提高预测频率，确保手势及时识别
    
    if (handLandmarker && webcam.currentTime !== lastVideoTime && currentTime - lastPredictionTime > predictionInterval) {
        lastVideoTime = webcam.currentTime;
        lastPredictionTime = currentTime;
        
        try {
            const results = await handLandmarker.detectForVideo(webcam, currentTime);

            let targetSpeed = gameState.baseSpeed;
            let isOKGesture = false;

            if (results.landmarks.length > 0 && !gameState.zoomedGift) { 
                const landmarks = results.landmarks[0];
                const wrist = landmarks[0];
                const fingersTips = [8, 12, 16, 20].map(i => landmarks[i]);
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];
                
                // 1. 握拳/张手 - 调整阈值，提高灵敏度
                const avgDist = fingersTips.reduce((acc, p) => acc + Math.hypot(p.x - wrist.x, p.y - wrist.y), 0) / 4;

                if (avgDist < 0.3) { // 降低阈值，更容易识别握拳
                    targetSpeed = gameState.fastSpeed; 
                } else if (avgDist > 0.4) { // 降低阈值，更容易识别张手
                    targetSpeed = 0; 
                } else {
                    targetSpeed = gameState.baseSpeed;
                }
                
                // 2. OK 手势 - 调整阈值，提高灵敏度
                const distThumbIndex = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
                const middleWristDist = Math.hypot(landmarks[12].x - wrist.x, landmarks[12].y - wrist.y);

                if (distThumbIndex < 0.08 && middleWristDist > 0.25) { // 调整阈值，提高OK手势识别率
                    isOKGesture = true;
                }
            }
            
            gameState.rotationSpeed += (targetSpeed - gameState.rotationSpeed) * 0.1;
            
            if (isOKGesture) {
                if (!webcam.gestureLock || currentTime - webcam.gestureLock > 1000) {
                    startBlossomAnimation();
                    webcam.gestureLock = currentTime;
                }
            } else {
                if (webcam.gestureLock && currentTime - webcam.gestureLock > 1000) {
                    webcam.gestureLock = 0;
                }
            }
        } catch (error) {
            console.error("手势识别错误:", error);
        }
    }
    requestAnimationFrame(predictWebcam);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now() * 0.001;

    // 只有在不特写且相机未动画时才旋转
    if (treeGroup && gameState.isRotating && !gameState.zoomedGift && !gameState.isCameraAnimating) {
        treeGroup.rotation.y += gameState.rotationSpeed;
    }

    if (gameState.blossomDirection !== 0) {
        updateBlossom();
    }

    lightsList.forEach(bulb => {
        if (bulb.material.emissiveIntensity) {
             const intensity = bulb.userData.baseIntensity + Math.sin(time * 5 + bulb.position.x) * 0.2;
             bulb.material.emissiveIntensity = Math.max(0.2, intensity);
        }
    });

    if (snowSystem) {
        const positions = snowSystem.geometry.attributes.position.array;
        const vels = snowSystem.userData.velocities;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i+1] += vels[i+1];
            positions[i] = (positions[i] + vels[i] + 50) % 100 - 50;
            positions[i+2] = (positions[i+2] + vels[i+2] + 50) % 100 - 50;
            if (positions[i+1] < 0) positions[i+1] = 80; 
        }
        snowSystem.geometry.attributes.position.needsUpdate = true;
        snowSystem.rotation.y += 0.001;
    }

    controls.update();
    renderer.render(scene, camera);
}