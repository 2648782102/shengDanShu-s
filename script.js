import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/OrbitControls.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm';

// --- 全局变量 ---
let scene, camera, renderer, controls;
let treeGroup, snowSystem, ground;
let handLandmarker, webcam;
let lightsList = []; 
let treeLayers = []; // 存储树叶层，用于“绽放”动画

// 状态控制
let gameState = {
    isRotating: true,
    rotationSpeed: 0.003,
    baseSpeed: 0.003,
    fastSpeed: 0.04,
    isMusicPlaying: false,
    zoomedGift: null, 
    originalCameraPos: new THREE.Vector3(),
    isBlossomed: false, // 新增：圣诞树是否处于绽放状态
    blossomProgress: 0.0, // 绽放动画进度 (0到1)
    blossomDirection: 0 // -1: 聚合, 0: 停止, 1: 绽放
};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// --- 初始化 ---
init();
animate();
setupMediaPipe();
setupUIEvents();

function init() {
    // 1. 场景与相机
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1b2845, 0.015);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 12, 35);
    gameState.originalCameraPos.copy(camera.position);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; 
    controls.minDistance = 5;
    controls.maxDistance = 60;

    // 2. 环境与灯光
    setupEnvironment();

    // 3. 创建主体
    createStylizedTree();
    createSnow();

    // 4. 事件监听
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onMouseClick);
    
    // 隐藏 Loading
    setTimeout(() => {
        const loading = document.getElementById('loading');
        loading.style.opacity = 0;
        setTimeout(() => loading.remove(), 600);
    }, 1500);
}

// --- 环境设置 ---
function setupEnvironment() {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0xffe0b5, 0.4);
    scene.add(ambientLight);

    // 主光源
    const mainLight = new THREE.DirectionalLight(0xffd1a6, 1.2);
    mainLight.position.set(20, 30, 20);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 100;
    mainLight.shadow.camera.left = -30; mainLight.shadow.camera.right = 30;
    mainLight.shadow.camera.top = 30; mainLight.shadow.camera.bottom = -30;
    scene.add(mainLight);

    // 地面
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

// --- 创建低多边形风格圣诞树 ---
function createStylizedTree() {
    treeGroup = new THREE.Group();
    treeLayers = []; // 重置层数组

    const leafMat = new THREE.MeshStandardMaterial({
        color: 0x2d9e5b,
        roughness: 0.7,
        flatShading: true
    });

    const layerParams = [
        { rTop: 0.5, rBot: 9, h: 8, y: 4, seg: 8, offset: 5.5 }, // offset用于绽放的中心偏移量
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
        
        // 存储原始位置和绽放偏移量
        mesh.userData.originalY = p.y;
        mesh.userData.blossomOffset = p.offset;
        mesh.userData.layerIndex = index;

        treeGroup.add(mesh);
        treeLayers.push(mesh);
    });

    // 树干
    const trunkGeo = new THREE.CylinderGeometry(1.2, 1.6, 5, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a23, roughness: 0.9, flatShading: true });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    // 顶部星星
    const starGeo = new THREE.OctahedronGeometry(1.2, 0);
    const starMat = new THREE.MeshStandardMaterial({ 
        color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.8, flatShading: true 
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.y = 20.5;
    star.userData.originalY = 20.5; // 存储原始Y坐标
    treeGroup.add(star);
    lightsList.push(star); 

    // 装饰灯泡
    addDecorations();

    scene.add(treeGroup);
}

// --- 圣诞树“绽放”逻辑 ---

function startBlossomAnimation() {
    if (gameState.isBlossomed) {
        resetTree(); // 如果已经绽放，则收拢
    } else {
        blossomTree(); // 否则，绽放
    }
}

function blossomTree() {
    gameState.blossomDirection = 1; // 标记为绽放
    gameState.isBlossomed = true;
    gameState.isRotating = false; // 绽放时停止旋转
    console.log("Tree Blossomed!");
}

function resetTree() {
    gameState.blossomDirection = -1; // 标记为聚合
    gameState.isBlossomed = false;
    gameState.isRotating = true; // 收拢后恢复旋转
    console.log("Tree Reset!");
}

function updateBlossom() {
    if (gameState.blossomDirection === 0) return;

    // 调整进度
    gameState.blossomProgress += gameState.blossomDirection * 0.05; // 速度可以调整
    gameState.blossomProgress = Math.min(1.0, Math.max(0.0, gameState.blossomProgress));
    
    // 如果动画结束，停止方向
    if (gameState.blossomProgress === 1.0 && gameState.blossomDirection === 1) {
        gameState.blossomDirection = 0;
    } else if (gameState.blossomProgress === 0.0 && gameState.blossomDirection === -1) {
        gameState.blossomDirection = 0;
    }

    // 更新树层位置
    treeLayers.forEach(layer => {
        const p = gameState.blossomProgress;
        const offset = layer.userData.blossomOffset * p;
        
        // 使用指数函数（或任何平滑函数）实现更自然的过渡效果
        // 向上平移
        layer.position.y = layer.userData.originalY + offset; 

        // 旋转平移，但由于树叶是圆柱，不需要径向位移
        // 我们可以让它在展开时快速旋转一下
        layer.rotation.y = layer.userData.layerIndex * p * 0.5; 
    });
    
    // 顶部星星的位移
    const star = lightsList[0];
    if (star.userData.originalY) {
         star.position.y = star.userData.originalY + gameState.blossomProgress * 5; // 星星抬高
    }
}
// --- 其他函数 (保持不变) ---
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
    const particleCount = 1500;
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

// --- UI 与交互事件 ---
function setupUIEvents() {
    // 音乐控制 (不变)
    const musicBtn = document.getElementById('music-btn');
    const bgMusic = document.getElementById('bg-music');
    musicBtn.addEventListener('click', () => {
        if (gameState.isMusicPlaying) {
            bgMusic.pause(); musicBtn.textContent = "🎵 播放音乐";
        } else {
            bgMusic.play().then(()=>{ musicBtn.textContent = "⏸ 暂停音乐"; }).catch(e => console.log("需要用户交互才能播放"));
        }
        gameState.isMusicPlaying = !gameState.isMusicPlaying;
    });

    // 图片上传 (不变)
    document.getElementById('file-input').addEventListener('change', handleImageUpload);
    // 摄像头开启 (不变)
    document.getElementById('cam-btn').addEventListener('click', enableCam);
}

// 处理照片上传，制作成精致的礼物盒 (不变)
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

            const materials = [giftMat, giftMat, giftMat, giftMat, photoMat, giftMat];
            const gift = new THREE.Mesh(boxGeo, materials);
            gift.name = "gift"; 
            gift.castShadow = true;

            const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.3, roughness: 0.2 });
            const ribbonV = new THREE.Mesh(new THREE.BoxGeometry(0.2, boxSize + 0.1, boxSize * 0.15), ribbonMat);
            const ribbonH = new THREE.Mesh(new THREE.BoxGeometry(boxSize + 0.1, 0.2, boxSize * 0.15), ribbonMat);
            ribbonV.position.z = 0.01; ribbonH.position.z = 0.01; 
            gift.add(ribbonV); gift.add(ribbonH);

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

// --- 鼠标点击交互 (查看照片) ---
function onMouseClick(event) {
    if (gameState.zoomedGift) {
        resetCamera();
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(treeGroup.children, true);
    
    for (let i = 0; i < intersects.length; i++) {
        let target = intersects[i].object;
        while(target && target.name !== 'gift' && target.parent !== treeGroup) {
            target = target.parent;
        }
        
        if (target && target.name === 'gift') {
            zoomToGift(target);
            break;
        }
    }
}

function zoomToGift(giftMesh) {
    gameState.zoomedGift = giftMesh;
    gameState.isRotating = false; 
    controls.enabled = false; // 缩放时禁用用户自由控制

    const targetPos = new THREE.Vector3();
    giftMesh.getWorldPosition(targetPos);
    const offset = new THREE.Vector3(0, 0, 5);
    offset.applyQuaternion(giftMesh.getWorldQuaternion(new THREE.Quaternion()));
    const camEndPos = targetPos.clone().add(offset);

    const startPos = camera.position.clone();
    let progress = 0;
    
    function animateCamera() {
        if (!gameState.zoomedGift) return; 
        progress += 0.03;
        if (progress <= 1) {
            camera.position.lerpVectors(startPos, camEndPos, progress);
            controls.target.lerp(targetPos, progress);
            requestAnimationFrame(animateCamera);
        } else {
            // 动画结束后，确保target和position设置好
             controls.target.copy(targetPos);
        }
    }
    animateCamera();
    document.getElementById('ui-panel').style.opacity = '0.2'; 
}

function resetCamera() {
    gameState.zoomedGift = null;
    gameState.isRotating = true;
    controls.enabled = true; // 恢复用户自由控制

    const startPos = camera.position.clone();
    const endPos = gameState.originalCameraPos;
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(0, 0, 0);

    let progress = 0;
    function animateCameraBack() {
        if (gameState.zoomedGift) return; 
        progress += 0.03;
        if (progress <= 1) {
            camera.position.lerpVectors(startPos, endPos, progress);
            controls.target.lerp(startTarget, endTarget, progress);
            requestAnimationFrame(animateCameraBack);
        } else {
            document.getElementById('ui-panel').style.opacity = '1';
            controls.target.copy(endTarget); // 确保controls目标回到原点
        }
    }
    animateCameraBack();
}


// --- MediaPipe 手势 (增加 OK 手势识别) ---
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
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
        webcam.srcObject = stream;
        document.querySelector('.cam-wrapper').style.display = 'block';
        webcam.addEventListener('loadeddata', predictWebcam);
        document.getElementById('cam-btn').style.display = 'none';
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
            
            // 1. 握拳/张手判断 (用于旋转控制)
            const avgDist = fingersTips.reduce((acc, p) => acc + Math.hypot(p.x - wrist.x, p.y - wrist.y), 0) / 4;

            if (avgDist < 0.25) { 
                targetSpeed = gameState.fastSpeed; 
                console.log("✊ 握拳加速"); 
            } else if (avgDist > 0.35) { 
                targetSpeed = 0; 
                console.log("🖐 张手停止"); 
            } else {
                 targetSpeed = gameState.baseSpeed;
            }
            
            // 2. OK 手势判断 (用于绽放)
            // OK 手势：拇指尖(4)和食指尖(8)非常靠近
            const distThumbIndex = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
            // 同时，其他手指应该伸直 (中指尖(12)和手腕(0)距离较远)
            const middleWristDist = Math.hypot(landmarks[12].x - wrist.x, landmarks[12].y - wrist.y);

            if (distThumbIndex < 0.06 && middleWristDist > 0.3) {
                isOKGesture = true;
                console.log("👌 OK 手势：触发绽放/聚合");
            }
        }
        
        // 旋转速度平滑过渡 (Lerp)
        gameState.rotationSpeed += (targetSpeed - gameState.rotationSpeed) * 0.1;
        
        // 绽放手势触发逻辑：只在手势出现的那一刻触发一次
        if (isOKGesture) {
            // 确保只触发一次：使用一个简单的计时器或状态来限制
            if (!webcam.gestureLock || performance.now() - webcam.gestureLock > 1000) {
                 startBlossomAnimation();
                 webcam.gestureLock = performance.now();
            }
        } else {
             // 允许在没有手势的 1 秒后再次触发
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

// --- 动画循环 ---
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now() * 0.001;

    // 1. 旋转树
    if (treeGroup && gameState.isRotating && !gameState.zoomedGift) {
        treeGroup.rotation.y += gameState.rotationSpeed;
    }

    // 2. 绽放动画更新 (新增)
    if (gameState.blossomDirection !== 0) {
        updateBlossom();
    }

    // 3. 灯光闪烁动画
    lightsList.forEach(bulb => {
        if (bulb.material.emissiveIntensity) {
             const intensity = bulb.userData.baseIntensity + Math.sin(time * 5 + bulb.position.x) * 0.2;
             bulb.material.emissiveIntensity = Math.max(0.2, intensity);
        }
    });

    // 4. 雪花飘落
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