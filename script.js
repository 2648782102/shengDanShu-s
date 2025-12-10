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
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; 
    controls.minDistance = 5;
    controls.maxDistance = 80;

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
        flatShading: true
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
}

function updateBlossom() {
    if (gameState.blossomDirection === 0) return;
    gameState.blossomProgress += gameState.blossomDirection * 0.05; 
    gameState.blossomProgress = Math.min(1.0, Math.max(0.0, gameState.blossomProgress));
    
    if (gameState.blossomProgress === 1.0 && gameState.blossomDirection === 1) {
        gameState.blossomDirection = 0;
    } else if (gameState.blossomProgress === 0.0 && gameState.blossomDirection === -1) {
        gameState.blossomDirection = 0;
    }

    treeLayers.forEach(layer => {
        const p = gameState.blossomProgress;
        const offset = layer.userData.blossomOffset * p;
        layer.position.y = layer.userData.originalY + offset; 
        layer.rotation.y = layer.userData.layerIndex * p * 0.5; 
    });
    
    const star = lightsList[0];
    if (star.userData.originalY) {
         star.position.y = star.userData.originalY + gameState.blossomProgress * 5; 
    }
}

function addDecorations() {
      const bulbColors = [0xff3333, 0xffd700, 0x3333ff, 0x00ff00, 0xffffff];
      for (let i = 0; i < 40; i++) {
          const color = bulbColors[Math.floor(Math.random() * bulbColors.length)];
          const mat = new THREE.MeshStandardMaterial({
              color: color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3
           });
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), mat);
          
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
    const particleCount = isMobile ? 500 : 1500;
    const geo = new THREE.BufferGeometry();
    const pos = []; const vel = [];
    for (let i = 0; i < particleCount; i++) {
        pos.push(Math.random()*100-50, Math.random()*80, Math.random()*100-50);
        vel.push((Math.random()-0.5)*0.1, Math.random()*-0.15-0.05, (Math.random()-0.5)*0.1);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, transparent: true, opacity: 0.8 });
    snowSystem = new THREE.Points(geo, mat);
    snowSystem.userData = { velocities: vel };
    scene.add(snowSystem);
}

function setupUIEvents() {
    const musicBtn = document.getElementById('music-btn');
    const bgMusic = document.getElementById('bg-music');
    const musicInput = document.getElementById('music-input');

    // --- 1. 音乐播放/暂停逻辑 (保持原有逻辑，增加一点容错) ---
    musicBtn.addEventListener('click', () => {
        if (gameState.isMusicPlaying) {
            bgMusic.pause();
            musicBtn.textContent = "🎵 播放音乐";
        } else {
            // 尝试播放，如果报错（比如没加载好）则捕获错误
            bgMusic.play().then(() => {
                musicBtn.textContent = "⏸ 暂停音乐";
            }).catch(e => {
                console.log("播放失败或被拦截:", e);
                alert("请先点击屏幕或上传有效的音乐文件~");
            });
        }
        gameState.isMusicPlaying = !gameState.isMusicPlaying;
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
        
        // 提示用户并重置状态
        musicBtn.textContent = "🎵 播放新歌";
        gameState.isMusicPlaying = false; // 重置播放状态标记
        
        alert(`已切换为: ${file.name}`);
    });

    // --- 其他原有事件保持不变 ---
    document.getElementById('file-input').addEventListener('change', handleImageUpload);
    document.getElementById('cam-btn').addEventListener('click', enableCam);
    
    // 3. 主题文本更新逻辑 (确保 2D HTML 标题更新)
    const themeTextInput = document.getElementById('theme-text-input');
    const headerTitle = document.querySelector('#ui-panel h1');
    themeTextInput.addEventListener('input', (event) => {
        const text = event.target.value.trim() === "" ? "My Christmas Gift For You" : event.target.value;
        headerTitle.textContent = text;
    });
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
    // 触摸事件需要延迟一点点执行，避免和 controls 冲突
    setTimeout(checkIntersection, 100); 
}

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    checkIntersection();
}


// --- MediaPipe 及其他函数保持不变 ---

async function setupMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO", numHands: 1
    });
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

let lastVideoTime = -1;
async function predictWebcam() {
    if (handLandmarker && webcam.currentTime !== lastVideoTime) {
        lastVideoTime = webcam.currentTime;
        const results = handLandmarker.detectForVideo(webcam, performance.now());

        let targetSpeed = gameState.baseSpeed;
        let isOKGesture = false;

        if (results.landmarks.length > 0 && !gameState.zoomedGift) { 
            const landmarks = results.landmarks[0];
            const wrist = landmarks[0];
            const fingersTips = [8, 12, 16, 20].map(i => landmarks[i]);
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];
            
            // 1. 握拳/张手
            const avgDist = fingersTips.reduce((acc, p) => acc + Math.hypot(p.x - wrist.x, p.y - wrist.y), 0) / 4;

            if (avgDist < 0.25) { 
                targetSpeed = gameState.fastSpeed; 
            } else if (avgDist > 0.35) { 
                targetSpeed = 0; 
            } else {
                targetSpeed = gameState.baseSpeed;
            }
            
            // 2. OK 手势
            const distThumbIndex = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
            const middleWristDist = Math.hypot(landmarks[12].x - wrist.x, landmarks[12].y - wrist.y);

            if (distThumbIndex < 0.06 && middleWristDist > 0.3) {
                isOKGesture = true;
            }
        }
        
        gameState.rotationSpeed += (targetSpeed - gameState.rotationSpeed) * 0.1;
        
        if (isOKGesture) {
            if (!webcam.gestureLock || performance.now() - webcam.gestureLock > 1000) {
                startBlossomAnimation();
                webcam.gestureLock = performance.now();
            }
        } else {
            if (webcam.gestureLock && performance.now() - webcam.gestureLock > 1000) {
                webcam.gestureLock = 0;
            }
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