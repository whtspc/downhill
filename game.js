// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Constants - Portrait orientation
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const MIN_SPEED = 1;
const MAX_SPEED_STRAIGHT = 20; // Max speed when going straight
const MAX_SPEED_TURNING = 16; // Max speed at full turn angle
const MAX_SKI_ANGLE = Math.PI / 3; // 60 degrees
const TURN_SPEED_PENALTY = 0.3; // How much turning reduces downhill speed (0 = none, 1 = full stop at max angle)

// Skier dimensions
const BODY_WIDTH = 32;
const BODY_HEIGHT = 48;
const SKI_WIDTH = 4;
const SKI_HEIGHT = 30;
const SKI_SPACING = 20;

// Tree dimensions
const TREE_WIDTH = 64;
const TREE_HEIGHT = 96;

// Game state
const gameState = {
    speed: 3,
    skiAngle: 0,
    skierX: CANVAS_WIDTH / 2,
    skierY: CANVAS_HEIGHT / 3,
    keys: {},
    gameOver: false
};

// Background - two large tiles that cycle
const background = {
    tile1Y: 0,
    tile2Y: CANVAS_HEIGHT,
    tileHeight: CANVAS_HEIGHT
};

// Pre-generate random dot positions for background (seeded for consistency)
const backgroundDots = [];
const NUM_DOTS = 75;
for (let i = 0; i < NUM_DOTS; i++) {
    backgroundDots.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        radius: 1.5 + Math.random() * 1.5
    });
}

// Trail points in screen coordinates - array of {leftX, leftY, rightX, rightY}
const trailPoints = [];

// Trees - array of {x, y}
const trees = [];
const TREE_SPAWN_DISTANCE = 350; // base distance between tree spawns
let distanceSinceLastTree = 0;

// Input handling
document.addEventListener('keydown', (e) => {
    gameState.keys[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
    gameState.keys[e.key.toLowerCase()] = false;
});

// Update game physics
function update() {
    // Calculate dynamic max speed based on ski angle (interpolate between straight and turning max)
    const angleRatio = Math.abs(gameState.skiAngle) / MAX_SKI_ANGLE;
    const currentMaxSpeed = MAX_SPEED_STRAIGHT - (MAX_SPEED_STRAIGHT - MAX_SPEED_TURNING) * angleRatio;

    // Speed control (S/W or Arrow Down/Up)
    if (gameState.keys['s'] || gameState.keys['arrowdown']) {
        gameState.speed += 0.15;
    } else if (gameState.keys['w'] || gameState.keys['arrowup']) {
        gameState.speed -= 0.25;
    } else {
        gameState.speed -= 0.05;
    }

    // Clamp speed to current max (which depends on angle)
    if (gameState.speed > currentMaxSpeed) gameState.speed = currentMaxSpeed;
    if (gameState.speed < MIN_SPEED) gameState.speed = MIN_SPEED;

    // Ski angle control (A/D or Arrow Left/Right)
    if (gameState.keys['a'] || gameState.keys['arrowleft']) {
        gameState.skiAngle -= 0.04;
        if (gameState.skiAngle < -MAX_SKI_ANGLE) gameState.skiAngle = -MAX_SKI_ANGLE;
    }
    if (gameState.keys['d'] || gameState.keys['arrowright']) {
        gameState.skiAngle += 0.04;
        if (gameState.skiAngle > MAX_SKI_ANGLE) gameState.skiAngle = MAX_SKI_ANGLE;
    }

    // X-axis drift based on ski angle and speed
    // Wider turn radius at higher speeds
    const turnFactor = 1 - (gameState.speed / MAX_SPEED_STRAIGHT) * 0.6;
    const effectiveAngle = gameState.skiAngle * turnFactor;
    const drift = Math.sin(effectiveAngle) * gameState.speed * 0.8;

    gameState.skierX += drift;

    // Clamp skier to canvas bounds
    const halfBody = BODY_WIDTH / 2 + SKI_SPACING;
    if (gameState.skierX < halfBody) gameState.skierX = halfBody;
    if (gameState.skierX > CANVAS_WIDTH - halfBody) gameState.skierX = CANVAS_WIDTH - halfBody;

    // Calculate effective downhill speed (reduced when turning)
    const anglePenalty = 1 - Math.abs(Math.sin(gameState.skiAngle)) * TURN_SPEED_PENALTY;
    const downhillSpeed = gameState.speed * anglePenalty;

    // Update background tiles - scroll upward and round to avoid seams
    background.tile1Y -= downhillSpeed;
    background.tile2Y -= downhillSpeed;

    // When a tile goes completely off the top, move it below the other tile
    if (background.tile1Y <= -background.tileHeight) {
        background.tile1Y = background.tile2Y + background.tileHeight;
    }
    if (background.tile2Y <= -background.tileHeight) {
        background.tile2Y = background.tile1Y + background.tileHeight;
    }

    // Round tile positions to avoid sub-pixel seams
    background.tile1Y = Math.round(background.tile1Y);
    background.tile2Y = Math.round(background.tile2Y);

    // Scroll all trail points upward
    for (let point of trailPoints) {
        point.leftY -= downhillSpeed;
        point.rightY -= downhillSpeed;
    }

    // Remove trail points that are off screen
    while (trailPoints.length > 0 && trailPoints[0].leftY < -10) {
        trailPoints.shift();
    }

    // Calculate back of each ski position (screen coordinates)
    const skiY = gameState.skierY + BODY_HEIGHT / 2;
    const skiRotation = -gameState.skiAngle;
    const skiBackOffset = SKI_HEIGHT / 2;

    // Left ski back position
    const leftSkiCenterX = gameState.skierX - SKI_SPACING / 2;
    const leftBackX = leftSkiCenterX + Math.sin(skiRotation) * skiBackOffset;
    const leftBackY = skiY - Math.cos(skiRotation) * skiBackOffset;

    // Right ski back position
    const rightSkiCenterX = gameState.skierX + SKI_SPACING / 2;
    const rightBackX = rightSkiCenterX + Math.sin(skiRotation) * skiBackOffset;
    const rightBackY = skiY - Math.cos(skiRotation) * skiBackOffset;

    // Add new trail point
    trailPoints.push({
        leftX: leftBackX,
        leftY: leftBackY,
        rightX: rightBackX,
        rightY: rightBackY
    });

    // Update trees - scroll upward
    for (let tree of trees) {
        tree.y -= downhillSpeed;
    }

    // Remove trees that are off screen
    while (trees.length > 0 && trees[0].y < -TREE_HEIGHT) {
        trees.shift();
    }

    // Spawn new trees based on distance traveled
    distanceSinceLastTree += downhillSpeed;
    // Add randomization: spawn between 0.7x and 1.3x the base distance
    const nextTreeDistance = TREE_SPAWN_DISTANCE * (0.3 + Math.random() * 2);
    if (distanceSinceLastTree >= nextTreeDistance) {
        distanceSinceLastTree = 0;
        // Random x position, spawn below screen
        const treeX = TREE_WIDTH / 2 + Math.random() * (CANVAS_WIDTH - TREE_WIDTH);
        trees.push({ x: treeX, y: CANVAS_HEIGHT + TREE_HEIGHT });
    }

    // Collision detection with trees - circle at bottom half (trunk area)
    const treeTrunkRadius = 16; // Scaled up for larger trees
    for (let tree of trees) {
        // Tree trunk center is at bottom half of tree
        const trunkX = tree.x;
        const trunkY = tree.y + TREE_HEIGHT / 4;

        // Check distance from skier center to trunk center
        const dx = gameState.skierX - trunkX;
        const dy = gameState.skierY - trunkY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Collision if distance is less than trunk radius + skier radius
        const skierRadius = BODY_WIDTH / 3; // Slightly smaller than body for forgiving collisions
        if (distance < treeTrunkRadius + skierRadius) {
            gameState.gameOver = true;
        }
    }
}

// Draw background with random dots
function drawBackground() {
    // Fill entire canvas with snow color
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw random dots on both tiles
    ctx.fillStyle = '#c8c8c8'; // Darker dots

    for (let dot of backgroundDots) {
        // Draw dot on tile 1
        const y1 = background.tile1Y + dot.y;
        if (y1 >= -dot.radius && y1 <= CANVAS_HEIGHT + dot.radius) {
            ctx.beginPath();
            ctx.arc(dot.x, y1, dot.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw dot on tile 2
        const y2 = background.tile2Y + dot.y;
        if (y2 >= -dot.radius && y2 <= CANVAS_HEIGHT + dot.radius) {
            ctx.beginPath();
            ctx.arc(dot.x, y2, dot.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Draw trees - green triangles
function drawTrees() {
    ctx.fillStyle = '#228B22'; // Forest green

    for (let tree of trees) {
        ctx.beginPath();
        ctx.moveTo(tree.x, tree.y - TREE_HEIGHT / 2); // Top point
        ctx.lineTo(tree.x - TREE_WIDTH / 2, tree.y + TREE_HEIGHT / 2); // Bottom left
        ctx.lineTo(tree.x + TREE_WIDTH / 2, tree.y + TREE_HEIGHT / 2); // Bottom right
        ctx.closePath();
        ctx.fill();
    }
}

// Draw ski trails - lines connecting consecutive points
function drawTrails() {
    if (trailPoints.length < 2) return;

    ctx.strokeStyle = '#d0dbe5'; // Very light greyish-blue
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw left trail
    ctx.beginPath();
    ctx.moveTo(trailPoints[0].leftX, trailPoints[0].leftY);
    for (let i = 1; i < trailPoints.length; i++) {
        ctx.lineTo(trailPoints[i].leftX, trailPoints[i].leftY);
    }
    ctx.stroke();

    // Draw right trail
    ctx.beginPath();
    ctx.moveTo(trailPoints[0].rightX, trailPoints[0].rightY);
    for (let i = 1; i < trailPoints.length; i++) {
        ctx.lineTo(trailPoints[i].rightX, trailPoints[i].rightY);
    }
    ctx.stroke();
}

// Draw the skier
function drawSkier() {
    const x = gameState.skierX;
    const y = gameState.skierY;

    // Draw skis FIRST (so they appear behind/under the body)
    const skiY = y + BODY_HEIGHT / 2; // Skis positioned below body
    const skiRotation = -gameState.skiAngle; // Negate angle so skis point in movement direction

    // Left ski
    ctx.save();
    ctx.translate(x - SKI_SPACING / 2, skiY);
    ctx.rotate(skiRotation);
    ctx.fillStyle = '#2c3e50'; // Dark blue skis
    ctx.fillRect(-SKI_WIDTH / 2, -SKI_HEIGHT / 2, SKI_WIDTH, SKI_HEIGHT);
    ctx.restore();

    // Right ski
    ctx.save();
    ctx.translate(x + SKI_SPACING / 2, skiY);
    ctx.rotate(skiRotation);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-SKI_WIDTH / 2, -SKI_HEIGHT / 2, SKI_WIDTH, SKI_HEIGHT);
    ctx.restore();

    // Draw body AFTER skis (so it appears on top)
    const bodyTilt = -gameState.skiAngle * 0.1; // Very slight body tilt (also negated)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bodyTilt);
    ctx.fillStyle = '#e74c3c'; // Red jacket
    ctx.fillRect(-BODY_WIDTH / 2, -BODY_HEIGHT / 2, BODY_WIDTH, BODY_HEIGHT);
    ctx.restore();
}

// Draw HUD
function drawHUD() {
    ctx.fillStyle = '#333';
    ctx.font = '16px Arial';

    // Speed display
    const speedText = `Speed: ${gameState.speed.toFixed(1)}`;
    ctx.fillText(speedText, 20, 30);

    // Angle display (for debugging)
    const angleDegrees = (gameState.skiAngle * 180 / Math.PI).toFixed(1);
    const angleText = `Angle: ${angleDegrees}°`;
    ctx.fillText(angleText, 20, 55);

    // Controls hint
    ctx.font = '12px Arial';
    ctx.fillStyle = '#666';
    ctx.fillText('Controls: A/D or Arrows = Turn/Speed', 20, CANVAS_HEIGHT - 20);
}

// Draw game over screen
function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    ctx.font = '20px Arial';
    ctx.fillText('Press R to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
    ctx.textAlign = 'left';
}

// Main render function
function render() {
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw in order (back to front)
    drawBackground();
    drawTrails();
    drawTrees();
    drawSkier();
    drawHUD();

    if (gameState.gameOver) {
        drawGameOver();
    }
}

// Reset game state
function resetGame() {
    gameState.speed = 3;
    gameState.skiAngle = 0;
    gameState.skierX = CANVAS_WIDTH / 2;
    gameState.gameOver = false;
    trees.length = 0;
    trailPoints.length = 0;
    distanceSinceLastTree = 0;
}

// Game loop
function gameLoop() {
    if (!gameState.gameOver) {
        update();
    }
    render();
    requestAnimationFrame(gameLoop);
}

// Handle restart
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && gameState.gameOver) {
        resetGame();
    }
});

// Start game
gameLoop();
