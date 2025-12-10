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
    // 移动端由于是竖屏，需要离远一点才能看到全貌
    const startZ = isMobile ? 45 : 35; 
    const startY = isMobile ? 10 : 12;
    camera.position.set(0, startY, startZ);
    gameState.originalCameraPos.copy(camera.position);

    // 3. 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // 移动端限制像素比，防止过热
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
    // 移动端降低阴影贴图分辨率
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

// ... createStylizedTree 函数保持不变 ...
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
// ... startBlossomAnimation, blossomTree, resetTree, updateBlossom, addDecorations 函数保持不变 ...
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

// ... setupUIEvents, handleImageUpload, zoomToGift, resetCamera 保持不变 ...
function setupUIEvents() {
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

    document.getElementById('file-input').addEventListener('change', handleImageUpload);
    document.getElementById('cam-btn').addEventListener('click', enableCam);
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

function zoomToGift(giftMesh) {
    gameState.zoomedGift = giftMesh;
    gameState.isRotating = false; 
    controls.enabled = false; 

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
             controls.target.copy(targetPos);
        }
    }
    animateCamera();
    document.getElementById('ui-panel').style.opacity = '0.2'; 
}

function resetCamera() {
    gameState.zoomedGift = null;
    gameState.isRotating = true;
    controls.enabled = true; 

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
            controls.target.copy(endTarget); 
        }
    }
    animateCameraBack();
}

// --- 交互事件处理 (核心修改) ---
// 增加触摸支持，并将逻辑抽象出来
function onTouchStart(event) {
    if (event.touches.length > 1) return; // 忽略多指缩放
    // 防止 OrbitControls 的冲突，这里只记录位置，逻辑交给 Click 处理，或者直接在此处处理
    // 为了简单，我们复用 Raycaster 逻辑
    
    // 计算触摸点坐标
    mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
    
    checkIntersection();
}

function onMouseClick(event) {
    // 鼠标点击
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    checkIntersection();
}

function checkIntersection() {
    if (gameState.zoomedGift) {
        resetCamera();
        return;
    }

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

// --- MediaPipe 手势 ---
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
    // 移动端优先使用前置摄像头
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

// ... predictWebcam, onWindowResize, animate 函数保持不变 ...
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
    
    // 窗口大小变化时（比如横竖屏切换）可能需要调整相机距离
    // 简单处理：如果是移动端且相机不在特写模式，重置位置
    if (isMobile && !gameState.zoomedGift) {
       // 这里可以做更细致的逻辑，简化处理直接保持当前位置即可
       // 或 camera.position.set(0, 10, 45);
    }
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now() * 0.001;

    if (treeGroup && gameState.isRotating && !gameState.zoomedGift) {
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