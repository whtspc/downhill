// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Load character sprites
const sprites = {
    vooruit: new Image(),
    flauweLinks: new Image(),
    flauweRechts: new Image(),
    scherpeLinks: new Image(),
    scherpeRechts: new Image(),
    sprongie: new Image(),
    vallen: new Image(),
    tree: new Image(),
    pisteBorder: new Image(),
    finish: new Image()
};

sprites.vooruit.src = 'Character/Vooruit.png';
sprites.flauweLinks.src = 'Character/Flauwe bocht naar links.png';
sprites.flauweRechts.src = 'Character/Flauwe bocht naar rechts.png';
sprites.scherpeLinks.src = 'Character/Scherpe bocht naar links.png';
sprites.scherpeRechts.src = 'Character/Scherpe bocht naar rechts.png';
sprites.sprongie.src = 'Character/Sprongie.png';
sprites.vallen.src = 'Character/Vallen.png';
sprites.tree.src = 'Piste/Boom sneeuw.png';
sprites.pisteBorder.src = 'Piste/Zijkant piste.png';
sprites.finish.src = 'Piste/Einde.png';

// Constants - Portrait orientation
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const MIN_SPEED = 1;
const MAX_SPEED_STRAIGHT = 20; // Max speed when going straight
const MAX_SPEED_TURNING = 16; // Max speed at full turn angle
const MAX_SKI_ANGLE = Math.PI / 3; // 60 degrees
const TURN_SPEED_PENALTY = 0.3; // How much turning reduces downhill speed (0 = none, 1 = full stop at max angle)
const RACE_DISTANCE = 20000; // Distance to finish the race

// Skier dimensions
const BODY_WIDTH = 32;
const BODY_HEIGHT = 48;
const SKI_WIDTH = 4;
const SKI_HEIGHT = 30;
const SKI_SPACING = 20;

// Tree dimensions
const TREE_WIDTH = 90;
const TREE_HEIGHT = 110;

// Finish line dimensions
const FINISH_WIDTH = 400;
const FINISH_HEIGHT = 200;

// Game state
const gameState = {
    speed: 3,
    skiAngle: 0,
    skierX: CANVAS_WIDTH / 2,
    skierY: CANVAS_HEIGHT / 3,
    keys: {},
    gameOver: false,
    // Race mode
    phase: 'menu', // 'menu', 'racing', 'finished', 'crashed'
    distance: 0,
    raceStartTime: 0,
    raceTime: 0,
    playerName: '',
    nameSubmitted: false
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

// Finish line position (Y coordinate on screen, null when not visible)
let finishLineY = null;

// Leaderboard data (fetched from API)
let leaderboardData = [];

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

    // Track distance and time
    gameState.distance += downhillSpeed;
    gameState.raceTime = performance.now() - gameState.raceStartTime;

    // Spawn finish line when approaching the end
    const distanceToFinish = RACE_DISTANCE - gameState.distance;
    if (distanceToFinish < CANVAS_HEIGHT && finishLineY === null) {
        // Spawn finish line below the screen
        finishLineY = CANVAS_HEIGHT + distanceToFinish;
    }

    // Update finish line position
    if (finishLineY !== null) {
        finishLineY -= downhillSpeed;
    }

    // Check for race completion (when skier crosses finish line)
    if (finishLineY !== null && finishLineY < gameState.skierY) {
        gameState.phase = 'finished';
        return; // Stop updating
    }

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

    // Collision detection with trees - circular hitboxes on bottom half of sprites
    const treeRadius = TREE_WIDTH / 3; // ~30px - covers bottom half of tree
    const skierRadius = 25; // Covers bottom half of 80px sprite
    for (let tree of trees) {
        // Tree hitbox center is in the bottom half of the tree sprite
        const treeHitX = tree.x;
        const treeHitY = tree.y + TREE_HEIGHT / 4;

        // Skier hitbox center is in the bottom half of the skier sprite
        const skierHitX = gameState.skierX;
        const skierHitY = gameState.skierY + 15; // Offset down into bottom half

        // Check distance between hitbox centers
        const dx = skierHitX - treeHitX;
        const dy = skierHitY - treeHitY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < treeRadius + skierRadius) {
            gameState.gameOver = true;
            gameState.phase = 'crashed';
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

// Draw trees
function drawTrees() {
    for (let tree of trees) {
        ctx.drawImage(
            sprites.tree,
            tree.x - TREE_WIDTH / 2,
            tree.y - TREE_HEIGHT / 2,
            TREE_WIDTH,
            TREE_HEIGHT
        );
    }
}

// Draw piste borders (scrolling with background)
function drawPisteBorders() {
    const borderWidth = 50; // Width of each border strip
    const borderHeight = CANVAS_HEIGHT; // Match the tile height

    // Draw left border - tile 1
    ctx.drawImage(
        sprites.pisteBorder,
        0, 0, sprites.pisteBorder.width / 2, sprites.pisteBorder.height, // Source: left half of image
        0, background.tile1Y, borderWidth, borderHeight // Dest: left side
    );
    // Draw left border - tile 2
    ctx.drawImage(
        sprites.pisteBorder,
        0, 0, sprites.pisteBorder.width / 2, sprites.pisteBorder.height,
        0, background.tile2Y, borderWidth, borderHeight
    );

    // Draw right border - tile 1
    ctx.drawImage(
        sprites.pisteBorder,
        sprites.pisteBorder.width / 2, 0, sprites.pisteBorder.width / 2, sprites.pisteBorder.height, // Source: right half of image
        CANVAS_WIDTH - borderWidth, background.tile1Y, borderWidth, borderHeight // Dest: right side
    );
    // Draw right border - tile 2
    ctx.drawImage(
        sprites.pisteBorder,
        sprites.pisteBorder.width / 2, 0, sprites.pisteBorder.width / 2, sprites.pisteBorder.height,
        CANVAS_WIDTH - borderWidth, background.tile2Y, borderWidth, borderHeight
    );
}

// Draw finish line
function drawFinishLine() {
    if (finishLineY === null) return;

    ctx.drawImage(
        sprites.finish,
        CANVAS_WIDTH / 2 - FINISH_WIDTH / 2,
        finishLineY - FINISH_HEIGHT / 2,
        FINISH_WIDTH,
        FINISH_HEIGHT
    );
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
    const angle = gameState.skiAngle;
    const angleAbs = Math.abs(angle);

    // Angle thresholds for sprite selection
    const gentleTurnThreshold = MAX_SKI_ANGLE * 0.25; // ~15 degrees
    const sharpTurnThreshold = MAX_SKI_ANGLE * 0.6;   // ~36 degrees

    // Select sprite based on angle and game state
    let sprite;

    if (gameState.phase === 'crashed') {
        sprite = sprites.vallen;
    } else if (angleAbs < gentleTurnThreshold) {
        sprite = sprites.vooruit;
    } else if (angleAbs < sharpTurnThreshold) {
        sprite = angle < 0 ? sprites.flauweLinks : sprites.flauweRechts;
    } else {
        sprite = angle < 0 ? sprites.scherpeLinks : sprites.scherpeRechts;
    }

    // Draw the character sprite
    const spriteWidth = 80;
    const spriteHeight = 80;

    ctx.drawImage(
        sprite,
        x - spriteWidth / 2,
        y - spriteHeight / 2,
        spriteWidth,
        spriteHeight
    );
}

// Format time as MM:SS.ms
function formatTime(ms) {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

// Draw HUD
function drawHUD() {
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';

    // Speed display (left side, top)
    ctx.font = '22px Fibberish';
    const speedText = `Speed: ${gameState.speed.toFixed(1)}`;
    ctx.fillText(speedText, 20, 35);

    // Timer display (left side, below speed)
    ctx.font = 'bold 32px Fibberish';
    const timeText = formatTime(gameState.raceTime);
    ctx.fillText(timeText, 20, 70);

    // Distance display (right side)
    ctx.textAlign = 'right';
    ctx.font = '22px Fibberish';
    const distanceText = `${Math.floor(gameState.distance)} / ${RACE_DISTANCE}m`;
    ctx.fillText(distanceText, CANVAS_WIDTH - 20, 35);

    // Progress bar (right side, below distance)
    const barWidth = 150;
    const barHeight = 10;
    const barX = CANVAS_WIDTH - 20 - barWidth;
    const barY = 50;
    const progress = Math.min(gameState.distance / RACE_DISTANCE, 1);

    ctx.fillStyle = '#ddd';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);

    ctx.textAlign = 'left';
}

// Draw menu screen
function drawMenuScreen() {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(240, 240, 240, 0.95)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';

    // Title
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 52px Fibberish';
    ctx.fillText('BRIGHTFOX', CANVAS_WIDTH / 2, 120);
    ctx.font = 'bold 36px Fibberish';
    ctx.fillText('Ski Adventure', CANVAS_WIDTH / 2, 165);

    // Subtitle
    ctx.font = '24px Fibberish';
    ctx.fillStyle = '#666';
    ctx.fillText(`Race to ${RACE_DISTANCE}m as fast as you can!`, CANVAS_WIDTH / 2, 210);

    // Start prompt
    ctx.font = 'bold 34px Fibberish';
    ctx.fillStyle = '#e74c3c';
    ctx.fillText('Press SPACE to start', CANVAS_WIDTH / 2, 300);

    // Controls
    ctx.font = '20px Fibberish';
    ctx.fillStyle = '#888';
    ctx.fillText('Controls:', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 130);
    ctx.fillText('A/D or ←/→ = Turn', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 100);
    ctx.fillText('W/S or ↑/↓ = Brake/Accelerate', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 70);

    // Leaderboard placeholder
    ctx.font = 'bold 26px Fibberish';
    ctx.fillStyle = '#333';
    ctx.fillText('TOP 10', CANVAS_WIDTH / 2, 380);

    drawLeaderboardTable(CANVAS_WIDTH / 2 - 120, 400);

    ctx.textAlign = 'left';
}

// Draw leaderboard table
function drawLeaderboardTable(x, y) {
    ctx.font = '18px Fibberish';
    ctx.textAlign = 'left';

    if (leaderboardData.length === 0) {
        ctx.fillStyle = '#999';
        ctx.fillText('No scores yet!', x + 60, y + 20);
        return;
    }

    for (let i = 0; i < Math.min(leaderboardData.length, 10); i++) {
        const entry = leaderboardData[i];
        const rowY = y + i * 28;
        ctx.fillStyle = '#666';
        ctx.fillText(`${i + 1}.`, x, rowY);
        ctx.fillStyle = '#333';
        ctx.fillText(entry.name, x + 35, rowY);
        ctx.fillStyle = '#e74c3c';
        ctx.textAlign = 'right';
        ctx.fillText(formatTime(entry.time), x + 240, rowY);
        ctx.textAlign = 'left';
    }
}

// Draw finish screen
function drawFinishScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 56px Fibberish';
    ctx.fillText('RACE COMPLETE!', CANVAS_WIDTH / 2, 150);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px Fibberish';
    ctx.fillText(formatTime(gameState.raceTime), CANVAS_WIDTH / 2, 220);

    if (!gameState.nameSubmitted) {
        // Name input prompt
        ctx.font = '26px Fibberish';
        ctx.fillStyle = '#ccc';
        ctx.fillText('Enter your name:', CANVAS_WIDTH / 2, 290);

        // Name input box
        ctx.fillStyle = '#fff';
        ctx.fillRect(CANVAS_WIDTH / 2 - 120, 305, 240, 50);
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 3;
        ctx.strokeRect(CANVAS_WIDTH / 2 - 120, 305, 240, 50);

        ctx.fillStyle = '#333';
        ctx.font = '30px Fibberish';
        ctx.fillText(gameState.playerName + '_', CANVAS_WIDTH / 2, 340);

        ctx.font = '18px Fibberish';
        ctx.fillStyle = '#999';
        ctx.fillText('Press ENTER to submit (3-10 characters)', CANVAS_WIDTH / 2, 380);
    } else {
        ctx.font = '26px Fibberish';
        ctx.fillStyle = '#4CAF50';
        ctx.fillText('Score submitted!', CANVAS_WIDTH / 2, 300);
    }

    // Leaderboard
    ctx.font = 'bold 26px Fibberish';
    ctx.fillStyle = '#fff';
    ctx.fillText('TOP 10', CANVAS_WIDTH / 2, 420);
    drawLeaderboardTable(CANVAS_WIDTH / 2 - 120, 450);

    ctx.font = '22px Fibberish';
    ctx.fillStyle = '#888';
    ctx.fillText('Press R to race again', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40);

    ctx.textAlign = 'left';
}

// Draw crash screen (no overlay - game world stays visible)
function drawCrashScreen() {
    ctx.textAlign = 'center';

    // Draw text with dark outline for visibility
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 64px Fibberish';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText('CRASHED!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);
    ctx.fillText('CRASHED!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

    ctx.fillStyle = '#fff';
    ctx.font = '32px Fibberish';
    ctx.lineWidth = 3;
    ctx.strokeText(`Distance: ${Math.floor(gameState.distance)}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.fillText(`Distance: ${Math.floor(gameState.distance)}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    ctx.font = '26px Fibberish';
    ctx.fillStyle = '#fff';
    ctx.strokeText('Press SPACE to try again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
    ctx.fillText('Press SPACE to try again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);

    ctx.textAlign = 'left';
}

// Main render function
function render() {
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw based on game phase
    if (gameState.phase === 'menu') {
        drawBackground();
        drawMenuScreen();
    } else {
        // Draw game world
        drawBackground();
        drawPisteBorders();
        drawTrails();
        drawFinishLine();
        drawTrees();
        drawSkier();
        drawHUD();

        // Draw overlay screens
        if (gameState.phase === 'finished') {
            drawFinishScreen();
        } else if (gameState.phase === 'crashed') {
            drawCrashScreen();
        }
    }
}

// Reset game state
function resetGame() {
    gameState.speed = 3;
    gameState.skiAngle = 0;
    gameState.skierX = CANVAS_WIDTH / 2;
    gameState.gameOver = false;
    gameState.phase = 'menu';
    gameState.distance = 0;
    gameState.raceTime = 0;
    gameState.raceStartTime = 0;
    gameState.playerName = '';
    gameState.nameSubmitted = false;
    trees.length = 0;
    trailPoints.length = 0;
    distanceSinceLastTree = 0;
    finishLineY = null;
}

// Start the race
function startRace() {
    gameState.phase = 'racing';
    gameState.distance = 0;
    gameState.raceStartTime = performance.now();
    gameState.raceTime = 0;
    gameState.playerName = '';
    gameState.nameSubmitted = false;
    gameState.gameOver = false;
    gameState.speed = 3;
    gameState.skiAngle = 0;
    gameState.skierX = CANVAS_WIDTH / 2;
    trees.length = 0;
    trailPoints.length = 0;
    distanceSinceLastTree = 0;
    finishLineY = null;
}

// Game loop
function gameLoop() {
    if (gameState.phase === 'racing') {
        update();
    } else if (gameState.phase === 'crashed') {
        updateCrashed();
    }
    render();
    requestAnimationFrame(gameLoop);
}

// Update physics during crash - skier slides and slows down
function updateCrashed() {
    // Gradually slow down
    gameState.speed *= 0.98;
    if (gameState.speed < 0.1) gameState.speed = 0;

    // Continue moving based on last ski angle
    const drift = Math.sin(-gameState.skiAngle) * gameState.speed * 0.8;
    gameState.skierX += drift;

    // Clamp skier to canvas bounds
    const halfBody = BODY_WIDTH / 2 + SKI_SPACING;
    if (gameState.skierX < halfBody) gameState.skierX = halfBody;
    if (gameState.skierX > CANVAS_WIDTH - halfBody) gameState.skierX = CANVAS_WIDTH - halfBody;

    // Scroll world
    const downhillSpeed = gameState.speed;

    // Update background tiles
    background.tile1Y -= downhillSpeed;
    background.tile2Y -= downhillSpeed;

    if (background.tile1Y <= -background.tileHeight) {
        background.tile1Y = background.tile2Y + background.tileHeight;
    }
    if (background.tile2Y <= -background.tileHeight) {
        background.tile2Y = background.tile1Y + background.tileHeight;
    }

    background.tile1Y = Math.round(background.tile1Y);
    background.tile2Y = Math.round(background.tile2Y);

    // Scroll trail points
    for (let point of trailPoints) {
        point.leftY -= downhillSpeed;
        point.rightY -= downhillSpeed;
    }

    // Scroll trees
    for (let tree of trees) {
        tree.y -= downhillSpeed;
    }

    // Remove off-screen trees
    while (trees.length > 0 && trees[0].y < -TREE_HEIGHT) {
        trees.shift();
    }
}

// Handle keyboard input for game control and name entry
document.addEventListener('keydown', (e) => {
    const key = e.key;

    // Menu: SPACE to start
    if (gameState.phase === 'menu' && key === ' ') {
        e.preventDefault();
        startRace();
        return;
    }

    // Crashed: SPACE to restart
    if (gameState.phase === 'crashed' && key === ' ') {
        e.preventDefault();
        resetGame();
        return;
    }

    // Finished: name input handling
    if (gameState.phase === 'finished' && !gameState.nameSubmitted) {
        if (key === 'Enter' && gameState.playerName.length >= 3) {
            // Submit score
            submitScore(gameState.playerName, gameState.raceTime);
            gameState.nameSubmitted = true;
        } else if (key === 'Backspace') {
            gameState.playerName = gameState.playerName.slice(0, -1);
        } else if (key.length === 1 && /[a-zA-Z0-9]/.test(key) && gameState.playerName.length < 10) {
            gameState.playerName += key.toUpperCase();
        }
        return;
    }

    // Finished after submission: R to restart
    if (gameState.phase === 'finished' && gameState.nameSubmitted && key.toLowerCase() === 'r') {
        resetGame();
        return;
    }
});

// Start game
gameLoop();
