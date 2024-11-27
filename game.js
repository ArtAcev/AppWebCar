// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false }); // Desactivar antialiasing para mejor rendimiento
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87CEEB);
document.body.appendChild(renderer.domElement);

// Iluminación básica
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

// Game variables
let score = 0;
const MOVE_SPEED = 0.2;
const GRAVITY = -0.2;
const FALL_THRESHOLD = -5;
let gameStarted = false;
let currentLevel = 1;
const LEVEL_THRESHOLD = 1500;
const MAX_LEVEL = 50; // Aumentado a 50 niveles

// Función para calcular el tiempo de colapso basado en el nivel
function getCollapseTime() {
    // Nivel 1: 900 frames
    // Nivel 50: 50 frames
    // Progresión no lineal para hacer más gradual el inicio y más rápido el final
    const minCollapseTime = 50; // Tiempo mínimo en el nivel máximo
    const maxCollapseTime = 900; // Tiempo máximo en el nivel 1
    
    // Usar una función exponencial para la progresión
    const progress = (currentLevel - 1) / (MAX_LEVEL - 1);
    const exponentialFactor = Math.pow(progress, 2); // Hace la progresión más pronunciada
    
    return Math.max(
        Math.floor(maxCollapseTime - (maxCollapseTime - minCollapseTime) * exponentialFactor),
        minCollapseTime
    );
}

// Actualizar nivel basado en la puntuación
function updateDifficulty() {
    const newLevel = Math.min(Math.floor(score / LEVEL_THRESHOLD) + 1, MAX_LEVEL);
    if (newLevel !== currentLevel) {
        currentLevel = newLevel;
        // Mostrar mensaje de nuevo nivel con el tiempo de colapso actual
        const levelElement = document.createElement('div');
        levelElement.style.position = 'fixed';
        levelElement.style.top = '50%';
        levelElement.style.left = '50%';
        levelElement.style.transform = 'translate(-50%, -50%)';
        levelElement.style.color = 'white';
        levelElement.style.fontSize = '48px';
        levelElement.style.fontFamily = 'Arial';
        levelElement.style.zIndex = '100';
        levelElement.textContent = `¡Nivel ${currentLevel}!\nTiempo de colapso: ${getCollapseTime()}ms`;
        document.body.appendChild(levelElement);
        setTimeout(() => document.body.removeChild(levelElement), 2000);
    }
}

// Car object with minimal required properties
const car = {
    mesh: null,
    speed: 0.2
};

// Create car
function createCar() {
    // Grupo principal del coche
    car.mesh = new THREE.Group();

    // Cuerpo principal del coche simplificado
    const bodyGeometry = new THREE.BoxGeometry(2, 0.5, 4);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xe74c3c,
        shininess: 50
    });
    const carBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
    car.mesh.add(carBody);

    // Techo del coche
    const roofGeometry = new THREE.BoxGeometry(1.5, 0.4, 2);
    const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
    roof.position.y = 0.45;
    car.mesh.add(roof);

    // Ruedas simplificadas
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8);
    const wheelMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x333333,
        shininess: 30
    });

    const wheelPositions = [
        { x: -1.1, z: -1.5 },
        { x: 1.1, z: -1.5 },
        { x: -1.1, z: 1.5 },
        { x: 1.1, z: 1.5 }
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, -0.2, pos.z);
        car.mesh.add(wheel);
    });

    car.mesh.position.set(0, 1, 0);
    scene.add(car.mesh);
}

// Process movement input
function processMovementInput() {
    let dx = 0;
    let dz = 0;

    if (keys['w'] || keys['ArrowUp']) dz = -car.speed;
    if (keys['s'] || keys['ArrowDown']) dz = car.speed;
    if (keys['d'] || keys['ArrowRight']) dx = -car.speed;
    if (keys['a'] || keys['ArrowLeft']) dx = car.speed;

    return { dx, dz };
}

// Update car position
const GAME_BOUNDS = {
    minX: -50,  // Duplicado el espacio
    maxX: 50,
    minZ: -50,
    maxZ: 50
};

function updateCarPosition() {
    const { dx, dz } = processMovementInput();
    const newPosition = car.mesh.position.clone();
    
    // Aplicar movimiento sin restricciones
    newPosition.x += dx;
    newPosition.z -= dz; // Invertir el eje Z para corregir la dirección

    // Limitar el movimiento dentro de los límites del juego
    newPosition.x = Math.max(GAME_BOUNDS.minX, Math.min(GAME_BOUNDS.maxX, newPosition.x));
    newPosition.z = Math.max(GAME_BOUNDS.minZ, Math.min(GAME_BOUNDS.maxZ, newPosition.z));

    // Actualizar la posición sin importar si hay plataforma
    car.mesh.position.copy(newPosition);
    
    // Actualizar la rotación del coche
    if (dx !== 0 || dz !== 0) {
        const angle = Math.atan2(dx, -dz); // Invertir solo el eje Z para la rotación
        car.mesh.rotation.y = angle;
    }

    // Manejar el colapso de plataformas en la nueva posición
    handlePlatformCollapse();
}

// Check if position has platform support
function checkPlatformSupport(position) {
    let hasSupport = false;
    const SUPPORT_CHECK_RADIUS = 2;

    roadSegments.forEach(segment => {
        if (segment.solid) {  // Solo considerar plataformas sólidas
            const distance = new THREE.Vector2(
                position.x - segment.mesh.position.x,
                position.z - segment.mesh.position.z
            ).length();
            
            if (distance < SUPPORT_CHECK_RADIUS) {
                hasSupport = true;
            }
        }
    });

    return hasSupport;
}

// Handle platform collapse
function handlePlatformCollapse() {
    const COLLAPSE_RADIUS = 4; // Aumentado de 2.5 a 4
    const COLLAPSE_CHECK_RADIUS = 5; // Radio para verificar plataformas

    roadSegments.forEach(segment => {
        const distance = new THREE.Vector2(
            car.mesh.position.x - segment.mesh.position.x,
            car.mesh.position.z - segment.mesh.position.z
        ).length();

        // Iniciar colapso si está dentro del radio
        if (distance < COLLAPSE_RADIUS) {
            segment.startCollapse();
        }
    });
}

// Handle vertical movement
function handleVerticalMovement() {
    if (!checkPlatformSupport(car.mesh.position)) {
        car.mesh.position.y += GRAVITY;
        
        if (car.mesh.position.y < FALL_THRESHOLD) {
            gameOver();
        }
    }
}

// Camera setup
const cameraOffset = new THREE.Vector3(0, 15, -20); // Cámara más alejada y elevada
let currentCameraPosition = new THREE.Vector3();
let currentCameraLookAt = new THREE.Vector3();

function updateCamera() {
    // Calcular posición objetivo de la cámara
    const targetCameraPosition = car.mesh.position.clone().add(cameraOffset);
    const targetLookAt = car.mesh.position.clone();

    // Suavizar movimiento de la cámara
    currentCameraPosition.lerp(targetCameraPosition, 0.1);
    currentCameraLookAt.lerp(targetLookAt, 0.1);

    camera.position.copy(currentCameraPosition);
    camera.lookAt(currentCameraLookAt);
}

// Input handling
const keys = {};
document.addEventListener('keydown', (e) => keys[e.key] = true);
document.addEventListener('keyup', (e) => keys[e.key] = false);

// Road segments array
const roadSegments = [];
const segmentLength = 2; // Match platform size
const numInitialSegments = 20; // Increased number of segments to cover similar area

// Create initial road segments in a denser grid
function createInitialRoad() {
    const gridSize = 20; // Increased grid size to maintain coverage
    const offset = Math.floor(gridSize / 2);
    
    for (let x = -offset; x < offset; x++) {
        for (let z = -offset; z < offset; z++) {
            roadSegments.push(new RoadSegment(x * segmentLength, z * segmentLength));
        }
    }
}

// Modified RoadSegment class with smaller platforms
class RoadSegment {
    constructor(x, z) {
        this.mesh = new THREE.Group();
        
        // Simplificar geometría de la plataforma
        const roadGeometry = new THREE.BoxGeometry(2, 0.1, 2);
        const roadMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x95a5a6,
            shininess: 30,
            transparent: true,
            opacity: 0.9
        });
        this.road = new THREE.Mesh(roadGeometry, roadMaterial);
        
        // Bordes simplificados
        const edgeGeometry = new THREE.BoxGeometry(2.2, 0.15, 2.2);
        const edgeMaterial = new THREE.MeshPhongMaterial({
            color: 0x7f8c8d,
            shininess: 30,
            transparent: true,
            opacity: 0.9
        });
        this.edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        this.edge.position.y = -0.05;
        
        this.mesh.add(this.edge);
        this.mesh.add(this.road);
        
        this.mesh.position.set(x, 0, z);
        this.solid = true;
        this.collapsing = false;
        this.collapseTimer = getCollapseTime();
        this.initialY = 0;
        this.baseColor = new THREE.Color(0x95a5a6);
        this.warningColor = new THREE.Color(0xe74c3c);
        
        scene.add(this.mesh);
    }

    startCollapse() {
        if (!this.collapsing) {
            this.collapsing = true;
        }
    }

    update() {
        if (this.collapsing) {
            this.collapseTimer--;
            
            const progress = this.collapseTimer / getCollapseTime();
            this.mesh.position.y = this.initialY - (1 - progress) * 2;
            
            // Efecto visual mejorado para plataformas cayendo
            if (this.collapseTimer > 300) {
                // Fase inicial: parpadeo suave en amarillo
                const warningProgress = (this.collapseTimer - 300) / (getCollapseTime() - 300);
                this.road.material.color.setRGB(
                    0.95,
                    0.95 * warningProgress,
                    0.2
                );
                this.road.material.opacity = 0.9;
                this.edge.material.opacity = 0.9;
            } else {
                // Fase final: desvanecimiento gradual
                const fadeProgress = this.collapseTimer / 300;
                this.road.material.opacity = fadeProgress * 0.7;
                this.edge.material.opacity = fadeProgress * 0.7;
                this.road.material.color.setRGB(
                    0.3,
                    0.3,
                    0.3
                );
            }

            // Cuando el temporizador llega a 0, la plataforma ya no es sólida
            if (this.collapseTimer <= 300) {
                this.solid = false;
            }

            if (this.collapseTimer <= 0) {
                scene.remove(this.mesh);
                return false;
            }
        }
        return true;
    }
}

// Update road segments
function updateRoadSegments() {
    // Update and clean up road segments
    for (let i = roadSegments.length - 1; i >= 0; i--) {
        if (!roadSegments[i].update()) {
            roadSegments.splice(i, 1);
        }
    }

    // Generate new platforms
    const playerGridX = Math.floor(car.mesh.position.x / 2);
    const playerGridZ = Math.floor(car.mesh.position.z / 2);
    const renderDistance = 15;  // Aumentado para cubrir más área

    for (let x = playerGridX - renderDistance; x <= playerGridX + renderDistance; x++) {
        for (let z = playerGridZ - renderDistance; z <= playerGridZ + renderDistance; z++) {
            if (!roadSegments.some(seg => 
                Math.floor(seg.mesh.position.x / 2) === x && 
                Math.floor(seg.mesh.position.z / 2) === z
            )) {
                roadSegments.push(new RoadSegment(x * 2, z * 2));
            }
        }
    }
}

// Crear límites visuales del juego
function createBoundaryWalls() {
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x2c3e50,
        transparent: true,
        opacity: 0.5
    });
    
    // Crear paredes
    const wallHeight = 5;
    const wallThickness = 0.5;
    
    // Pared Norte
    const northWall = new THREE.Mesh(
        new THREE.BoxGeometry(GAME_BOUNDS.maxX * 2, wallHeight, wallThickness),
        wallMaterial
    );
    northWall.position.set(0, wallHeight/2, GAME_BOUNDS.minZ);
    scene.add(northWall);
    
    // Pared Sur
    const southWall = new THREE.Mesh(
        new THREE.BoxGeometry(GAME_BOUNDS.maxX * 2, wallHeight, wallThickness),
        wallMaterial
    );
    southWall.position.set(0, wallHeight/2, GAME_BOUNDS.maxZ);
    scene.add(southWall);
    
    // Pared Este
    const eastWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, GAME_BOUNDS.maxZ * 2),
        wallMaterial
    );
    eastWall.position.set(GAME_BOUNDS.maxX, wallHeight/2, 0);
    scene.add(eastWall);
    
    // Pared Oeste
    const westWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, GAME_BOUNDS.maxZ * 2),
        wallMaterial
    );
    westWall.position.set(GAME_BOUNDS.minX, wallHeight/2, 0);
    scene.add(westWall);
}

// Game loop
function gameLoop() {
    if (!gameStarted) return;

    updateCarPosition();
    handleVerticalMovement();
    updateCamera();
    updateRoadSegments();
    updateDifficulty();

    // Update score
    score++;
    scoreElement.textContent = 'Score: ' + Math.floor(score/10) + ' | Nivel: ' + currentLevel;

    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

// Window resize handling
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Reset game function
function resetGame() {
    // Reiniciar variables de juego
    score = 0;
    currentLevel = 1;
    gameStarted = false;

    // Limpiar plataformas existentes
    while(roadSegments.length > 0) {
        const segment = roadSegments.pop();
        scene.remove(segment.mesh);
    }

    // Reiniciar posición del coche
    car.mesh.position.set(0, 1, 0);
    car.mesh.rotation.set(0, 0, 0);

    // Recrear plataformas iniciales
    createInitialRoad();
    
    // Reiniciar la puntuación en pantalla
    scoreElement.textContent = 'Score: 0 | Nivel: 1';
    
    // Iniciar cuenta atrás
    startCountdown();
}

function gameOver() {
    gameStarted = false;
    alert('¡Game Over!\nPuntuación: ' + Math.floor(score/10) + '\nNivel alcanzado: ' + currentLevel);
    resetGame();
}

function startCountdown() {
    let count = 3; // Reducido a 3 segundos para una experiencia más ágil
    countdownElement.style.display = 'block';
    countdownElement.textContent = count;
    
    const countInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownElement.textContent = count;
        } else {
            clearInterval(countInterval);
            countdownElement.style.display = 'none';
            countdownElement.textContent = '';
            gameStarted = true;
            score = 0;
            currentLevel = 1;
            gameLoop();
        }
    }, 1000);
}

// Initialize game
const scoreElement = document.getElementById('score');
const countdownElement = document.getElementById('countdown');

createCar();
createInitialRoad();
createBoundaryWalls();
startCountdown();
