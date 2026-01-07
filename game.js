// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Debug mode - enable with ?debug=1 in URL
const urlParams = new URLSearchParams(window.location.search);
const DEBUG_MODE = urlParams.get('debug') === '1';
let collisionEnabled = true; // Can be toggled with 'C' key in debug mode

// Audio elements
const bgMusic = new Audio('8-bit Winter Music  Chiptune for Retro Games  Snowy Hill (edited with Audjust) (1).mp3');
bgMusic.loop = true;
bgMusic.volume = 0.5;

const fallSound = new Audio('fallsound.wav');
fallSound.volume = 0.7;

// Loading state
let loadProgress = 0;

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
    finish: new Image(),
    titleBackground: new Image(),
    logo: new Image(),
    scoreboard: new Image()
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
sprites.titleBackground.src = 'screens/titlescreenwithcontrols.png';
sprites.logo.src = 'screens/Logo voorkant.png';
sprites.scoreboard.src = 'scoreboard.png';

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

// Finish line dimensions (full width, maintain aspect ratio)
const FINISH_WIDTH = CANVAS_WIDTH;
const FINISH_HEIGHT = 300; // Adjusted to maintain ratio with wider width

// Preload start animation video
const startVideo = document.createElement('video');
startVideo.src = 'startanim.mp4';
startVideo.preload = 'auto';
startVideo.muted = true; // Muted to allow autoplay
startVideo.playsInline = true;

// Game state
const gameState = {
    speed: 16,
    skiAngle: 0,
    skierX: CANVAS_WIDTH / 2,
    skierY: CANVAS_HEIGHT / 3,
    keys: {},
    gameOver: false,
    // Race mode
    phase: 'loading', // 'loading', 'menu', 'startanim', 'racing', 'finished', 'crashed', 'scoreboard'
    phaseStartTime: 0, // When current phase started
    distance: 0,
    raceStartTime: 0,
    raceTime: 0,
    playerName: '',
    nameSubmitted: false,
    // Score info for scoreboard
    scoreType: null, // 'time' or 'distance'
    scoreValue: 0,
    playerRank: 0 // Player's rank after submission
};

// Transition state for fade effects
const transitionState = {
    active: false,
    phase: 'none', // 'none', 'fadeOut', 'fadeIn'
    alpha: 0,
    startTime: 0,
    delayMs: 2000,  // 2 second delay before fade starts
    fadeMs: 500     // 500ms fade duration
};

// When video ends, start the actual race
startVideo.addEventListener('ended', () => {
    if (gameState.phase === 'startanim') {
        startRace();
    }
});

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

// Logo glimmer animation
let glimmerOffset = -100; // Start position off-screen left
const GLIMMER_SPEED = 3;
const GLIMMER_WIDTH = 80;

// Start prompt pulse animation
let pulseTime = 0;

// Loading spinner animation
let spinnerAngle = 0;

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
        gameState.skiAngle -= 0.08;
        if (gameState.skiAngle < -MAX_SKI_ANGLE) gameState.skiAngle = -MAX_SKI_ANGLE;
    }
    if (gameState.keys['d'] || gameState.keys['arrowright']) {
        gameState.skiAngle += 0.08;
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

    // Auto-guide player towards the finish line empty spot (x=200) when approaching
    const FINISH_TARGET_X = 200; // The empty spot in the finish line
    if (distanceToFinish < 400) {
        // Gradually guide player towards the target X position
        const guideFactor = 0.1; // How strongly to guide (higher = faster)
        const diff = FINISH_TARGET_X - gameState.skierX;
        gameState.skierX += diff * guideFactor;
        // Also gradually straighten the ski angle
        gameState.skiAngle *= 0.95;
    }

    // Check for race completion (when skier is well past finish line)
    if (finishLineY !== null && finishLineY < gameState.skierY - 150) {
        gameState.phase = 'finished';
        gameState.phaseStartTime = performance.now();
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

    // Spawn new trees based on distance traveled (stop after 18000m)
    if (gameState.distance < 18000) {
        distanceSinceLastTree += downhillSpeed;
        // Add randomization: spawn between 0.7x and 1.3x the base distance
        const nextTreeDistance = TREE_SPAWN_DISTANCE * (0.3 + Math.random() * 2);
        if (distanceSinceLastTree >= nextTreeDistance) {
            distanceSinceLastTree = 0;
            // Random x position, spawn below screen
            const treeX = TREE_WIDTH / 2 + Math.random() * (CANVAS_WIDTH - TREE_WIDTH);
            trees.push({ x: treeX, y: CANVAS_HEIGHT + TREE_HEIGHT });
        }
    }

    // Collision detection with trees - circular hitboxes on bottom half of sprites
    if (collisionEnabled) {
        const treeRadius = TREE_WIDTH / 3; // ~30px - covers bottom half of tree
        const skierRadius = 12; // Small hitbox for more forgiving collision
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
                gameState.phaseStartTime = performance.now();
                // Stop music and play fall sound
                bgMusic.pause();
                bgMusic.currentTime = 0;
                fallSound.currentTime = 0.5; // Skip 500ms of silence at the start
                fallSound.play().catch(() => {});
            }
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

// Draw debug overlay (collision boxes)
function drawDebug() {
    if (!DEBUG_MODE) return;

    const treeRadius = TREE_WIDTH / 3;
    const skierRadius = 12;

    // Draw tree collision circles
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.lineWidth = 2;
    for (let tree of trees) {
        const treeHitX = tree.x;
        const treeHitY = tree.y + TREE_HEIGHT / 4;
        ctx.beginPath();
        ctx.arc(treeHitX, treeHitY, treeRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Draw skier collision circle
    ctx.strokeStyle = collisionEnabled ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 255, 0, 0.7)';
    ctx.lineWidth = 2;
    const skierHitX = gameState.skierX;
    const skierHitY = gameState.skierY + 15;
    ctx.beginPath();
    ctx.arc(skierHitX, skierHitY, skierRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw debug info text
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(5, CANVAS_HEIGHT - 60, 200, 55);
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('DEBUG MODE', 10, CANVAS_HEIGHT - 45);
    ctx.fillText(`Collision: ${collisionEnabled ? 'ON' : 'OFF'} (press C to toggle)`, 10, CANVAS_HEIGHT - 28);
    ctx.fillText(`Trees: ${trees.length}`, 10, CANVAS_HEIGHT - 11);
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
    // Draw title background image (scaled to fit canvas)
    ctx.drawImage(sprites.titleBackground, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw logo at top center with glimmer effect on non-transparent pixels
    const logoWidth = 400;
    const logoHeight = logoWidth * (sprites.logo.height / sprites.logo.width) || 150;
    const logoX = CANVAS_WIDTH / 2 - logoWidth / 2;
    const logoY = 30;

    // Create off-screen canvas for compositing
    const offCanvas = document.createElement('canvas');
    offCanvas.width = logoWidth;
    offCanvas.height = logoHeight;
    const offCtx = offCanvas.getContext('2d');

    // Draw logo to off-screen canvas
    offCtx.drawImage(sprites.logo, 0, 0, logoWidth, logoHeight);

    // Apply glimmer only on non-transparent pixels using source-atop
    offCtx.globalCompositeOperation = 'source-atop';

    // Create diagonal glimmer gradient
    const gradient = offCtx.createLinearGradient(
        glimmerOffset, 0,
        glimmerOffset + GLIMMER_WIDTH, logoHeight
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    // Draw slanted glimmer bar
    offCtx.fillStyle = gradient;
    offCtx.beginPath();
    offCtx.moveTo(glimmerOffset, 0);
    offCtx.lineTo(glimmerOffset + GLIMMER_WIDTH, 0);
    offCtx.lineTo(glimmerOffset + GLIMMER_WIDTH + 50, logoHeight);
    offCtx.lineTo(glimmerOffset + 50, logoHeight);
    offCtx.closePath();
    offCtx.fill();

    // Draw the composited logo to main canvas
    ctx.drawImage(offCanvas, logoX, logoY);

    // Update glimmer position
    glimmerOffset += GLIMMER_SPEED;
    if (glimmerOffset > logoWidth + 100) {
        glimmerOffset = -GLIMMER_WIDTH - 100;
    }

    ctx.textAlign = 'center';

    // Start prompt with pulse animation
    pulseTime += 0.08;
    const pulseScale = 1 + Math.sin(pulseTime) * 0.1; // Scale between 0.9 and 1.1
    const baseFontSize = 44;
    const fontSize = Math.round(baseFontSize * pulseScale);

    ctx.font = `bold ${fontSize}px Fibberish`;
    ctx.fillStyle = '#e74c3c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText('Press SPACE to start', CANVAS_WIDTH / 2, 250);
    ctx.fillText('Press SPACE to start', CANVAS_WIDTH / 2, 250);

    ctx.textAlign = 'left';
}

// Draw leaderboard table
function drawLeaderboardTable(x, y) {
    ctx.font = '18px Fibberish';
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    if (leaderboardData.length === 0) {
        ctx.fillStyle = '#fff';
        ctx.strokeText('No scores yet!', x + 60, y + 20);
        ctx.fillText('No scores yet!', x + 60, y + 20);
        return;
    }

    for (let i = 0; i < Math.min(leaderboardData.length, 10); i++) {
        const entry = leaderboardData[i];
        const rowY = y + i * 28;
        ctx.fillStyle = '#fff';
        ctx.strokeText(`${i + 1}.`, x, rowY);
        ctx.fillText(`${i + 1}.`, x, rowY);
        ctx.strokeText(entry.name, x + 35, rowY);
        ctx.fillText(entry.name, x + 35, rowY);
        ctx.fillStyle = '#e74c3c';
        ctx.textAlign = 'right';
        ctx.strokeText(formatTime(entry.time), x + 240, rowY);
        ctx.fillText(formatTime(entry.time), x + 240, rowY);
        ctx.textAlign = 'left';
    }
}

// Draw finish screen
function drawFinishScreen() {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 56px Fibberish';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText('RACE COMPLETE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);
    ctx.fillText('RACE COMPLETE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px Fibberish';
    ctx.lineWidth = 3;
    ctx.strokeText(formatTime(gameState.raceTime), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    ctx.fillText(formatTime(gameState.raceTime), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);

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

    ctx.textAlign = 'left';
}

// Draw start animation video
function drawStartAnim() {
    // Draw video frame to canvas, scaled to fit
    ctx.drawImage(startVideo, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// Compare scores for sorting (time > distance, lower time better, higher distance better)
function compareScores(a, b) {
    // Time scores always rank above distance scores
    if (a.type === 'time' && b.type === 'distance') return -1;
    if (a.type === 'distance' && b.type === 'time') return 1;

    // Same type: lower time is better, higher distance is better
    if (a.type === 'time') return a.value - b.value;
    return b.value - a.value;
}

// Calculate what rank a score would achieve
function calculateRank(type, value) {
    const tempEntry = { type, value, name: '' };
    const sorted = [...leaderboardData, tempEntry].sort(compareScores);
    return sorted.findIndex(e => e === tempEntry) + 1;
}

// Format score for display
function formatScore(entry) {
    if (entry.type === 'time') {
        return formatTime(entry.value);
    } else {
        return `${Math.floor(entry.value)}m`;
    }
}

// Draw scoreboard screen
function drawScoreboardScreen() {
    // Draw scoreboard background
    ctx.drawImage(sprites.scoreboard, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw leaderboard entries on the wooden board
    ctx.textAlign = 'left';
    ctx.font = '20px Fibberish';

    const startY = 235;
    const rowHeight = 26;
    const nameX = 180;
    const scoreX = 440;

    // Show loading spinner or leaderboard entries
    if (leaderboardLoading) {
        // Draw loading spinner in center of board
        const centerX = CANVAS_WIDTH / 2;
        const centerY = 340;
        const radius = 25;

        // Update spinner angle
        spinnerAngle += 0.1;

        // Draw spinner arc
        ctx.strokeStyle = '#3d2314';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, spinnerAngle, spinnerAngle + Math.PI * 1.5);
        ctx.stroke();

        // Draw "Loading..." text
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#3d2314';
        ctx.lineWidth = 3;
        ctx.font = '22px Fibberish';
        ctx.strokeText('Loading...', centerX, centerY + 50);
        ctx.fillText('Loading...', centerX, centerY + 50);
        ctx.textAlign = 'left';
    } else {
        for (let i = 0; i < Math.min(leaderboardData.length, 10); i++) {
            const entry = leaderboardData[i];
            const rowY = startY + i * rowHeight;

            // Dark brown outline for wooden board readability
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#3d2314';
            ctx.lineWidth = 3;

            // Rank
            ctx.strokeText(`${i + 1}.`, nameX - 40, rowY);
            ctx.fillText(`${i + 1}.`, nameX - 40, rowY);

            // Name
            ctx.strokeText(entry.name || '???', nameX, rowY);
            ctx.fillText(entry.name || '???', nameX, rowY);

            // Score
            ctx.textAlign = 'right';
            const scoreText = formatScore(entry);
            ctx.strokeText(scoreText, scoreX, rowY);
            ctx.fillText(scoreText, scoreX, rowY);
            ctx.textAlign = 'left';
        }
    }

    // Show player's result at bottom of the board
    ctx.textAlign = 'center';
    ctx.font = '22px Fibberish';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#3d2314';
    ctx.lineWidth = 3;

    const resultText = gameState.scoreType === 'time'
        ? `Your time: ${formatTime(gameState.scoreValue)}`
        : `Your distance: ${Math.floor(gameState.scoreValue)}m`;
    ctx.strokeText(resultText, CANVAS_WIDTH / 2, 490);
    ctx.fillText(resultText, CANVAS_WIDTH / 2, 490);

    // Name input or rank display - positioned below the wooden board
    // Don't show controls while loading
    if (!leaderboardLoading) {
        if (!gameState.nameSubmitted) {
            // Show name input for everyone
            ctx.fillStyle = '#fff';
            ctx.font = '18px Fibberish';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText('Enter your name:', CANVAS_WIDTH / 2, 560);
            ctx.fillText('Enter your name:', CANVAS_WIDTH / 2, 560);

            // Name input box (wider for 16 chars)
            ctx.fillStyle = '#fff';
            ctx.fillRect(CANVAS_WIDTH / 2 - 120, 580, 240, 35);
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 3;
            ctx.strokeRect(CANVAS_WIDTH / 2 - 120, 580, 240, 35);

            ctx.fillStyle = '#333';
            ctx.font = '22px Fibberish';
            ctx.fillText(gameState.playerName + '_', CANVAS_WIDTH / 2, 605);

            ctx.fillStyle = '#aaa';
            ctx.font = '14px Fibberish';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeText('Press ENTER to submit', CANVAS_WIDTH / 2, 640);
            ctx.fillText('Press ENTER to submit', CANVAS_WIDTH / 2, 640);
        } else {
            // Show player's rank after submission
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.font = '24px Fibberish';
            ctx.fillStyle = '#4CAF50';
            ctx.strokeText(`You ranked #${gameState.playerRank}!`, CANVAS_WIDTH / 2, 560);
            ctx.fillText(`You ranked #${gameState.playerRank}!`, CANVAS_WIDTH / 2, 560);

            ctx.font = '20px Fibberish';
            ctx.fillStyle = '#fff';
            ctx.strokeText('Press SPACE to continue', CANVAS_WIDTH / 2, 600);
            ctx.fillText('Press SPACE to continue', CANVAS_WIDTH / 2, 600);
        }
    }

    ctx.textAlign = 'left';
}

// Start fade transition to scoreboard
function startFadeTransition() {
    transitionState.active = true;
    transitionState.phase = 'fadeOut';
    transitionState.startTime = performance.now();
    transitionState.alpha = 0;

    // Store score info
    if (gameState.phase === 'finished') {
        gameState.scoreType = 'time';
        gameState.scoreValue = gameState.raceTime;
    } else {
        gameState.scoreType = 'distance';
        gameState.scoreValue = gameState.distance;
    }
    gameState.playerName = '';
    gameState.nameSubmitted = false;
    gameState.playerRank = 0;

    // Refresh leaderboard data
    fetchLeaderboard();
}

// Update transition state
function updateTransition() {
    if (!transitionState.active) return;

    const elapsed = performance.now() - transitionState.startTime;

    if (transitionState.phase === 'fadeOut') {
        transitionState.alpha = Math.min(1, elapsed / transitionState.fadeMs);
        if (elapsed >= transitionState.fadeMs) {
            // Fade out complete, switch to scoreboard phase and start fade in
            gameState.phase = 'scoreboard';
            transitionState.phase = 'fadeIn';
            transitionState.startTime = performance.now();
        }
    } else if (transitionState.phase === 'fadeIn') {
        transitionState.alpha = Math.max(0, 1 - elapsed / transitionState.fadeMs);
        if (elapsed >= transitionState.fadeMs) {
            // Fade in complete
            transitionState.active = false;
            transitionState.phase = 'none';
            transitionState.alpha = 0;
        }
    }
}

// Draw fade overlay
function drawTransition() {
    if (!transitionState.active || transitionState.alpha <= 0) return;
    ctx.fillStyle = `rgba(0, 0, 0, ${transitionState.alpha})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// Main render function
function render() {
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw based on game phase
    if (gameState.phase === 'loading') {
        drawLoadingScreen();
    } else if (gameState.phase === 'menu') {
        drawMenuScreen();
    } else if (gameState.phase === 'startanim') {
        drawStartAnim();
    } else if (gameState.phase === 'scoreboard') {
        drawScoreboardScreen();
    } else {
        // Draw game world
        drawBackground();
        drawPisteBorders();
        drawTrails();
        drawSkier(); // Draw skier before finish line so they go underneath
        drawFinishLine();
        drawTrees();
        drawHUD();
        drawDebug();

        // Draw overlay screens
        if (gameState.phase === 'finished') {
            drawFinishScreen();
        } else if (gameState.phase === 'crashed') {
            drawCrashScreen();
        }
    }

    // Draw fade transition overlay on top of everything
    drawTransition();
}

// Preload all resources (images, fonts, video, audio)
function preloadResources() {
    const resources = [];
    let loaded = 0;
    const totalResources = Object.keys(sprites).length + 4; // sprites + font + video + 2 audio

    const updateProgress = () => {
        loaded++;
        loadProgress = loaded / totalResources;
    };

    // Image promises
    for (const sprite of Object.values(sprites)) {
        resources.push(new Promise(resolve => {
            if (sprite.complete) {
                updateProgress();
                resolve();
            } else {
                sprite.onload = () => { updateProgress(); resolve(); };
                sprite.onerror = () => { updateProgress(); resolve(); }; // Continue even if image fails
            }
        }));
    }

    // Font promise
    resources.push(document.fonts.ready.then(updateProgress));

    // Video promise
    resources.push(new Promise(resolve => {
        if (startVideo.readyState >= 3) {
            updateProgress();
            resolve();
        } else {
            startVideo.addEventListener('canplaythrough', () => { updateProgress(); resolve(); }, { once: true });
        }
    }));

    // Background music promise
    resources.push(new Promise(resolve => {
        if (bgMusic.readyState >= 3) {
            updateProgress();
            resolve();
        } else {
            bgMusic.addEventListener('canplaythrough', () => { updateProgress(); resolve(); }, { once: true });
        }
    }));

    // Fall sound promise
    resources.push(new Promise(resolve => {
        if (fallSound.readyState >= 3) {
            updateProgress();
            resolve();
        } else {
            fallSound.addEventListener('canplaythrough', () => { updateProgress(); resolve(); }, { once: true });
        }
    }));

    return Promise.all(resources);
}

// Draw loading screen with progress bar
function drawLoadingScreen() {
    // Draw background
    ctx.fillStyle = '#e8f4f8';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw "LOADING..." text
    ctx.fillStyle = '#333';
    ctx.font = '48px Fibberish';
    ctx.textAlign = 'center';
    ctx.fillText('LOADING...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

    // Draw progress bar background
    const barWidth = 300;
    const barHeight = 20;
    const barX = (CANVAS_WIDTH - barWidth) / 2;
    const barY = CANVAS_HEIGHT / 2 + 20;
    ctx.fillStyle = '#ccc';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Draw progress bar fill
    ctx.fillStyle = '#3498db';
    ctx.fillRect(barX, barY, barWidth * loadProgress, barHeight);

    // Draw progress percentage
    ctx.font = '20px Fibberish';
    ctx.fillStyle = '#666';
    ctx.fillText(`${Math.floor(loadProgress * 100)}%`, CANVAS_WIDTH / 2, barY + 50);

    ctx.textAlign = 'left';
}

// Reset game state
function resetGame() {
    gameState.speed = 16;
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
    gameState.speed = 16;
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

    // Check for transition to scoreboard after delay
    if ((gameState.phase === 'finished' || gameState.phase === 'crashed') && !transitionState.active) {
        const elapsed = performance.now() - gameState.phaseStartTime;
        if (elapsed >= transitionState.delayMs) {
            startFadeTransition();
        }
    }

    // Update transition animation
    updateTransition();

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

    // Debug: Toggle collision with C key
    if (DEBUG_MODE && key.toLowerCase() === 'c') {
        collisionEnabled = !collisionEnabled;
        return;
    }

    // Menu: SPACE to start animation
    if (gameState.phase === 'menu' && key === ' ') {
        e.preventDefault();
        bgMusic.play().catch(() => {}); // Start music (ignore autoplay errors)
        gameState.phase = 'startanim';
        startVideo.currentTime = 0;
        startVideo.play();
        return;
    }

    // Scoreboard: name input handling (if not submitted and not loading)
    if (gameState.phase === 'scoreboard' && !gameState.nameSubmitted && !leaderboardLoading) {
        if (key === 'Enter' && gameState.playerName.length >= 3) {
            // Calculate rank before submitting
            gameState.playerRank = calculateRank(gameState.scoreType, gameState.scoreValue);
            // Submit score
            submitScore(gameState.playerName, gameState.scoreType, gameState.scoreValue);
            gameState.nameSubmitted = true;
        } else if (key === 'Backspace') {
            e.preventDefault();
            gameState.playerName = gameState.playerName.slice(0, -1);
        } else if (key.length === 1 && /[a-zA-Z0-9]/.test(key) && gameState.playerName.length < 16) {
            gameState.playerName += key.toUpperCase();
        }
        return;
    }

    // Scoreboard: SPACE to go back to menu (after submitting and not loading)
    if (gameState.phase === 'scoreboard' && gameState.nameSubmitted && !leaderboardLoading) {
        if (key === ' ') {
            e.preventDefault();
            bgMusic.play().catch(() => {}); // Resume music
            resetGame();
            return;
        }
    }
});

// Start game with preloading
gameLoop(); // Start the loop (will show loading screen)
preloadResources().then(() => {
    gameState.phase = 'menu';
});
