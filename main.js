// 1. Global Variables & Setup
let scene, camera, renderer;
let groundPlane;
let buildingsMesh;
let explosionYield = 1.0;
const mapSize = 24000;
const buildingCount = 40000; // Increased building count for larger map
let buildingData = [];
let explosions = [];

let skytreeGroup;
let skytreeData = {};

const clock = new THREE.Clock();

const keys = {
    w: false, a: false, s: false, d: false,
    Shift: false, Control: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
};

const detonateBtn = document.getElementById('detonate-btn');
const yieldSlider = document.getElementById('yield-slider');
const yieldValue = document.getElementById('yield-value');

// 2. Initialization
function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x87CEEB); 
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.00005); // Reduced fog density for larger map

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 80000);
    camera.position.set(0, 3000, 6000);
    camera.lookAt(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(2000, 3000, 2000);
    scene.add(dirLight);

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', (e) => { if(keys.hasOwnProperty(e.key)) keys[e.key] = true; });
    document.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key)) keys[e.key] = false; });
    
    // Mouse Raycasting for left-click explosions
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        if (e.target.closest('#ui-container')) return; // Ignore clicks on UI

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        if (groundPlane) {
            const intersects = raycaster.intersectObject(groundPlane);
            if (intersects.length > 0) {
                triggerExplosionAt(intersects[0].point);
            }
        }
    });

    yieldSlider.addEventListener('input', (e) => {
        explosionYield = parseFloat(e.target.value);
        yieldValue.textContent = explosionYield.toFixed(1);
    });

    detonateBtn.addEventListener('click', () => {
        triggerExplosionAt(new THREE.Vector3(0, 0, 0));
    });

    generateCity();
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 3. Custom Controls
function updateControls(delta) {
    const moveSpeed = 6000 * delta; // Faster movement for larger map
    const rotSpeed = 1.5 * delta;

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(direction, camera.up).normalize();

    if (keys.w) camera.position.addScaledVector(direction, moveSpeed);
    if (keys.s) camera.position.addScaledVector(direction, -moveSpeed);
    if (keys.a) camera.position.addScaledVector(right, -moveSpeed);
    if (keys.d) camera.position.addScaledVector(right, moveSpeed);
    
    if (keys.Shift) camera.position.y += moveSpeed;
    if (keys.Control) camera.position.y -= moveSpeed;

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);

    if (keys.ArrowUp) euler.x += rotSpeed;
    if (keys.ArrowDown) euler.x -= rotSpeed;
    if (keys.ArrowLeft) euler.y += rotSpeed;
    if (keys.ArrowRight) euler.y -= rotSpeed;

    euler.x = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, euler.x));
    camera.quaternion.setFromEuler(euler);
}

// 4. City Generation
function createGroundTexture(size) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(0, 0, 2048, 2048);
    
    // Sumida River (Blue)
    ctx.lineWidth = (600 / size) * 2048; // 300 radius = 600 width
    ctx.strokeStyle = '#4488cc';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let z = -size/2; z <= size/2; z += 200) {
        const x = -1500 + z * 0.2;
        const cx = ((x / size) + 0.5) * 2048;
        const cy = (0.5 - (z / size)) * 2048;
        if (z === -size/2) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Arakawa River (Blue)
    ctx.lineWidth = (800 / size) * 2048; // 400 radius = 800 width
    ctx.beginPath();
    for (let z = -size/2; z <= size/2; z += 200) {
        const x = 1500 - z * 0.2;
        const cx = ((x / size) + 0.5) * 2048;
        const cy = (0.5 - (z / size)) * 2048;
        if (z === -size/2) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
}

function generateCity() {
    // Create Ground with painted rivers
    const groundGeo = new THREE.PlaneGeometry(mapSize, mapSize);
    const groundMat = new THREE.MeshLambertMaterial({ map: createGroundTexture(mapSize) });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    scene.add(groundPlane);

    buildingData = [];

    // Tokyo Skytree
    skytreeGroup = new THREE.Group();
    const skytreeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    
    const skytreeHeight = 634;
    const towerGeo = new THREE.CylinderGeometry(2, 40, skytreeHeight, 16);
    const towerMesh = new THREE.Mesh(towerGeo, skytreeMat);
    towerMesh.position.y = skytreeHeight / 2;
    skytreeGroup.add(towerMesh);

    const obs1Geo = new THREE.CylinderGeometry(50, 40, 25, 16);
    const obs1Mesh = new THREE.Mesh(obs1Geo, skytreeMat);
    obs1Mesh.position.y = 350;
    skytreeGroup.add(obs1Mesh);

    const obs2Geo = new THREE.CylinderGeometry(30, 25, 20, 16);
    const obs2Mesh = new THREE.Mesh(obs2Geo, skytreeMat);
    obs2Mesh.position.y = 450;
    skytreeGroup.add(obs2Mesh);

    skytreeGroup.position.set(0, 0, 0);
    scene.add(skytreeGroup);

    skytreeData = {
        pos: new THREE.Vector3(0, 0, 0),
        initialY: 0,
        velocity: new THREE.Vector3(0, 0, 0),
        angularVelocity: new THREE.Vector3(0,0,0),
        rotation: new THREE.Euler(0,0,0),
        isDestroyed: false,
        mass: 500000
    };

    // Procedural City
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    buildingsMesh = new THREE.InstancedMesh(boxGeo, boxMat, buildingCount);
    
    const dummy = new THREE.Object3D();
    const colorDummy = new THREE.Color();
    let instanceIdx = 0;

    const blockSize = 80;
    const streetWidth = 20;
    const gridLimit = Math.floor((mapSize / 2) / blockSize);

    for (let xIdx = -gridLimit; xIdx <= gridLimit; xIdx++) {
        for (let zIdx = -gridLimit; zIdx <= gridLimit; zIdx++) {
            if (instanceIdx >= buildingCount) break;

            const x = xIdx * blockSize + (Math.random() - 0.5) * (blockSize - streetWidth);
            const z = zIdx * blockSize + (Math.random() - 0.5) * (blockSize - streetWidth);
            
            // Exact river exclusion matching the drawing logic
            const sumidaRiverX = -1500 + z * 0.2;
            const arakawaRiverX = 1500 - z * 0.2;
            if (Math.abs(x - sumidaRiverX) < 400) continue; 
            if (Math.abs(x - arakawaRiverX) < 500) continue; 
        
        // Skytree exclusion
        const distToSkytree = Math.sqrt(x*x + z*z);
        if (distToSkytree < 180) continue;

        let height = 15 + Math.random() * 40;
        if (distToSkytree < 2000) {
            height += Math.random() * 80;
            if (Math.random() < 0.1) height += Math.random() * 150;
        }
        
        const width = 15 + Math.random() * 20;
        const depth = 15 + Math.random() * 20;
        
        dummy.position.set(x, height / 2, z);
        dummy.scale.set(width, height, depth);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        buildingsMesh.setMatrixAt(instanceIdx, dummy.matrix);

        const shade = 0.7 + Math.random() * 0.3;
        colorDummy.setRGB(shade, shade, shade);
        buildingsMesh.setColorAt(instanceIdx, colorDummy);

        buildingData.push({
            index: instanceIdx,
            pos: new THREE.Vector3(x, height / 2, z),
            initialY: height / 2,
            scale: new THREE.Vector3(width, height, depth),
            velocity: new THREE.Vector3(0, 0, 0),
            angularVelocity: new THREE.Vector3(0,0,0),
            rotation: new THREE.Euler(0,0,0),
            isDestroyed: false
        });
        
        instanceIdx++;
    }
    
    buildingsMesh.count = instanceIdx;
    buildingsMesh.instanceMatrix.needsUpdate = true;
    if (buildingsMesh.instanceColor) buildingsMesh.instanceColor.needsUpdate = true;
    scene.add(buildingsMesh);
}

// 5. Explosion Physics Class
class Explosion {
    constructor(pos, yieldVal) {
        this.time = 0;
        this.yield = yieldVal;
        this.pos = pos.clone();
        this.isDone = false;
        
        this.yieldMult = Math.pow(this.yield, 0.33);

        this.light = new THREE.PointLight(0xffffff, 0, 20000);
        this.light.position.set(pos.x, pos.y + 1000, pos.z);
        this.light.castShadow = false; // Disable shadows to prevent ground texture issues
        scene.add(this.light);

        const geo = new THREE.DodecahedronGeometry(1, 1); 
        this.mat = new THREE.MeshLambertMaterial({ 
            color: 0xffffff, 
            emissive: 0xff5500, 
            transparent: true,
            opacity: 0.95
        });

        this.puffs = 800;
        this.mesh = new THREE.InstancedMesh(geo, this.mat, this.puffs);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        this.data = [];
        for (let i = 0; i < this.puffs; i++) {
            let type;
            const rand = Math.random();
            if (rand < 0.15) type = 'base';
            else if (rand < 0.40) type = 'stem';
            else type = 'cap';

            this.data.push({
                type: type,
                theta: Math.random() * Math.PI * 2,
                radiusBase: Math.random(),
                offsetY: Math.random(),
                scaleBase: 0.5 + Math.random() * 1.5,
                delay: Math.random() * 0.5
            });
        }
        
        // Position the entire InstancedMesh at the explosion origin
        this.mesh.position.copy(this.pos);
        scene.add(this.mesh);
    }

    update(delta) {
        if (this.isDone) return;
        this.time += delta;
        const duration = 12.0;

        if (this.time > duration + 5.0) {
            if (this.mat.opacity > 0) {
                this.mat.opacity -= delta * 0.2;
            } else {
                scene.remove(this.mesh);
                scene.remove(this.light);
                this.isDone = true;
            }
            return;
        }

        // Light Update
        const intensityMult = Math.pow(this.yield, 0.5);
        if (this.time < 0.2) this.light.intensity = 50000000 * intensityMult * (this.time / 0.2);
        else this.light.intensity = Math.max(0, 50000000 * intensityMult * Math.exp(-(this.time - 0.2) * 2));

        // Cloud Visuals Update
        let globalT = Math.min(this.time / duration, 1.0);
        let easeOutQuart = 1 - Math.pow(1 - globalT, 4);

        const smokeT = Math.min(globalT / 0.4, 1.0); 
        const em = 1.0 - smokeT;
        this.mat.emissive.setRGB(em, em * 0.3, 0); 
        const c = 1.0 - smokeT * 0.8; 
        this.mat.color.setRGB(c, c, c);

        const maxCapHeight = 5500 * this.yieldMult;
        const maxCapRadius = 3500 * this.yieldMult;
        const maxStemRadius = 900 * this.yieldMult;
        const maxBaseRadius = 4500 * this.yieldMult;

        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < this.puffs; i++) {
            let d = this.data[i];
            let t = Math.max(0, Math.min((this.time - d.delay) / duration, 1.0));
            let tOut = 1 - Math.pow(1 - t, 3);
            
            let px = 0, py = 0, pz = 0;
            let s = 1;
            
            if (d.type === 'base') {
                const r = tOut * maxBaseRadius * (0.3 + 0.7 * d.radiusBase);
                px = Math.cos(d.theta) * r;
                pz = Math.sin(d.theta) * r;
                py = 50 + d.offsetY * 300 * this.yieldMult;
                s = (200 + tOut * 500) * this.yieldMult * d.scaleBase;
            } 
            else if (d.type === 'stem') {
                const r = maxStemRadius * d.radiusBase * (0.3 + 0.7 * Math.pow(tOut, 0.5));
                px = Math.cos(d.theta) * r;
                pz = Math.sin(d.theta) * r;
                py = (d.offsetY * maxCapHeight * 0.85) * easeOutQuart;
                s = (300 + tOut * 600) * this.yieldMult * d.scaleBase;
            } 
            else if (d.type === 'cap') {
                const r = Math.pow(tOut, 0.8) * maxCapRadius * d.radiusBase;
                px = Math.cos(d.theta) * r;
                pz = Math.sin(d.theta) * r;
                py = easeOutQuart * maxCapHeight;
                
                if (d.radiusBase > 0.4) {
                    py -= tOut * 1200 * this.yieldMult * (d.radiusBase - 0.4);
                }
                if (d.radiusBase < 0.3) {
                    py += d.offsetY * 800 * this.yieldMult;
                }

                s = (400 + tOut * 1000) * this.yieldMult * d.scaleBase;
            }
            
            dummy.position.set(px, py, pz);
            dummy.scale.set(s, s, s);
            dummy.rotation.set(
                d.theta + this.time * 0.1,
                d.offsetY + this.time * 0.15,
                d.radiusBase + this.time * 0.05
            );
            
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;

        // Apply explosion force to buildings (additive from multiple explosions)
        const shockwaveSpeed = 1500;
        const shockwaveRadius = this.time * shockwaveSpeed;
        const blastForceMult = this.yield * 15000000;

        for (let i = 0; i < buildingData.length; i++) {
            let b = buildingData[i];
            let dx = b.pos.x - this.pos.x;
            let dz = b.pos.z - this.pos.z;
            let dist = Math.sqrt(dx*dx + dz*dz);
            
            if (dist < shockwaveRadius && this.time < duration) {
                // If this explosion just hit the building, add force once
                if (!b.hitBy) b.hitBy = new Set();
                if (!b.hitBy.has(this)) {
                    b.isDestroyed = true;
                    b.hitBy.add(this);
                    
                    let force = blastForceMult / (dist + 500);
                    let dir = new THREE.Vector3(dx, 0, dz).normalize();
                    if (dir.lengthSq() === 0) dir.set(1, 0, 0); // fallback
                    
                    b.velocity.x += dir.x * force;
                    b.velocity.y += force * 0.8 + Math.random() * force * 0.4;
                    b.velocity.z += dir.z * force;
                    b.angularVelocity.x += (Math.random()-0.5)*5;
                    b.angularVelocity.y += (Math.random()-0.5)*5;
                    b.angularVelocity.z += (Math.random()-0.5)*5;
                }
            }
        }

        if (skytreeGroup) {
            let sd = skytreeData;
            let dx = sd.pos.x - this.pos.x;
            let dz = sd.pos.z - this.pos.z;
            let dist = Math.sqrt(dx*dx + dz*dz);
            
            if (dist < shockwaveRadius && this.time < duration) {
                if (!sd.hitBy) sd.hitBy = new Set();
                if (!sd.hitBy.has(this)) {
                    sd.isDestroyed = true;
                    sd.hitBy.add(this);

                    let force = (blastForceMult / (dist+600)) * 0.05; 
                    let dir = new THREE.Vector3(dx, 0, dz).normalize(); 
                    if (dir.lengthSq() === 0) dir.set(1,0,1).normalize();
                    
                    sd.velocity.x += dir.x * force;
                    sd.velocity.y += force * 0.5;
                    sd.velocity.z += dir.z * force;
                    sd.angularVelocity.x += dir.z * 0.1; 
                    sd.angularVelocity.z -= dir.x * 0.1; 
                }
            }
        }
    }
}

function triggerExplosionAt(pos) {
    explosions.push(new Explosion(pos, explosionYield));
}

// Global Physics Loop
function updatePhysics(delta) {
    let meshUpdated = false;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < buildingData.length; i++) {
        let b = buildingData[i];
        if (b.isDestroyed) {
            b.velocity.y -= 980 * delta; // Gravity
            b.pos.addScaledVector(b.velocity, delta);
            b.rotation.x += b.angularVelocity.x * delta;
            b.rotation.y += b.angularVelocity.y * delta;
            b.rotation.z += b.angularVelocity.z * delta;

            // Ground collision bounce
            if (b.pos.y < b.initialY) {
                b.pos.y = b.initialY;
                b.velocity.y *= -0.5;
                b.velocity.x *= 0.8;
                b.velocity.z *= 0.8;
                b.angularVelocity.multiplyScalar(0.8);
            }

            dummy.position.copy(b.pos);
            dummy.rotation.copy(b.rotation);
            dummy.scale.copy(b.scale);
            dummy.updateMatrix();
            buildingsMesh.setMatrixAt(b.index, dummy.matrix);
            meshUpdated = true;
        }
    }
    if (meshUpdated && buildingsMesh) buildingsMesh.instanceMatrix.needsUpdate = true;

    if (skytreeGroup && skytreeData.isDestroyed) {
        let sd = skytreeData;
        sd.velocity.y -= 980 * delta;
        sd.pos.addScaledVector(sd.velocity, delta);
        sd.rotation.x += sd.angularVelocity.x * delta;
        sd.rotation.y += sd.angularVelocity.y * delta;
        sd.rotation.z += sd.angularVelocity.z * delta;

        if (sd.pos.y < sd.initialY) {
            sd.pos.y = sd.initialY;
            sd.velocity.y *= -0.5;
            sd.velocity.x *= 0.8;
            sd.velocity.z *= 0.8;
            sd.angularVelocity.multiplyScalar(0.8);
        }
        skytreeGroup.position.copy(sd.pos);
        skytreeGroup.rotation.copy(sd.rotation);
    }
}

// 6. Main Loop
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1); // Cap delta to prevent huge jumps
    
    updateControls(delta);
    
    // Update all active explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].update(delta);
        if (explosions[i].isDone) {
            explosions.splice(i, 1);
        }
    }

    // Apply accumulated physics to buildings
    updatePhysics(delta);

    renderer.render(scene, camera);
}

init();
