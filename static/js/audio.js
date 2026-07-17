// ---------------------------------------------------------
// AUDIO SYNTHESIZER (HTML5 Web Audio API)
// ---------------------------------------------------------

let audioCtx = null;
let lastHoverSoundTime = 0;
let bgGainNode = null;
let droneOscs = [];
let melodyInterval = null;
let bgAudioElement = null;
let bgSourceNode = null;
let usingSynthesizedBackup = false;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Start background ambient music (low-volume detuned drones and bell arpeggiator)
function startBackgroundMusic() {
    initAudio();
    if (!audioCtx) return;
    if (bgGainNode) return; // Already running

    bgGainNode = audioCtx.createGain();
    
    // Scale volume: maximum gain of 0.3 for MP3 (keep it gentle)
    const slider = document.getElementById("bg-music-volume");
    const sliderVal = slider ? parseFloat(slider.value) / 100 : 0.2;
    bgGainNode.gain.setValueAtTime(sliderVal * 0.3, audioCtx.currentTime);
    bgGainNode.connect(audioCtx.destination);

    // Try playing the custom MP3 file first
    bgAudioElement = new Audio();
    bgAudioElement.src = "/Music/Background Music.mp3";
    bgAudioElement.loop = true;
    bgAudioElement.crossOrigin = "anonymous";

    // When the file is ready, attempt playback
    bgAudioElement.addEventListener("canplaythrough", () => {
        if (usingSynthesizedBackup) return;
        try {
            if (!bgSourceNode) {
                bgSourceNode = audioCtx.createMediaElementSource(bgAudioElement);
                bgSourceNode.connect(bgGainNode);
            }
            bgAudioElement.play().catch(err => {
                console.warn("Failed to play MP3 background track, falling back:", err);
                startSynthesizedBackup();
            });
        } catch (e) {
            console.warn("MediaElementSource connection failed, falling back:", e);
            startSynthesizedBackup();
        }
    });

    // Fallback if loading fails/network fails
    bgAudioElement.addEventListener("error", (err) => {
        console.warn("Error loading background MP3, falling back to synth:", err);
        startSynthesizedBackup();
    });

    // Trigger loading
    bgAudioElement.load();
}

function startSynthesizedBackup() {
    if (usingSynthesizedBackup) return;
    usingSynthesizedBackup = true;
    
    if (bgAudioElement) {
        try { bgAudioElement.pause(); } catch(e){}
    }

    const slider = document.getElementById("bg-music-volume");
    const sliderVal = slider ? parseFloat(slider.value) / 100 : 0.2;
    // Scale volume: maximum gain of 0.15 for synthesized audio
    bgGainNode.gain.setValueAtTime(sliderVal * 0.15, audioCtx.currentTime);

    // Detuned low drone oscillators (A2 at 110Hz, slightly detuned at 110.5Hz, E3 fifth at 165Hz)
    const frequencies = [110.00, 110.50, 165.00];
    frequencies.forEach(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        const oscGain = audioCtx.createGain();
        oscGain.gain.setValueAtTime(0.40, audioCtx.currentTime); // Soft individual volume (40% gain)

        osc.connect(oscGain);
        oscGain.connect(bgGainNode);
        osc.start();
        droneOscs.push(osc);
    });

    // Spooky pentatonic chime notes arpeggiator (slow distant bells)
    const bellNotes = [329.63, 392.00, 440.00, 493.88, 587.33]; // E4, G4, A4, B4, D5

    function playDistantBell() {
        if (!audioCtx || audioCtx.state === 'suspended') return;
        
        try {
            const bellOsc = audioCtx.createOscillator();
            const bellGain = audioCtx.createGain();
            const filterNode = audioCtx.createBiquadFilter();

            const freq = bellNotes[Math.floor(Math.random() * bellNotes.length)];
            bellOsc.type = "triangle";
            bellOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            filterNode.type = "lowpass";
            filterNode.frequency.setValueAtTime(400, audioCtx.currentTime); // Deep lowpass filter

            bellGain.gain.setValueAtTime(0, audioCtx.currentTime);
            bellGain.gain.linearRampToValueAtTime(0.60, audioCtx.currentTime + 1.5); // Warm slow attack (60% gain)
            bellGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 6.0); // Ring out 6s

            bellOsc.connect(filterNode);
            filterNode.connect(bellGain);
            bellGain.connect(bgGainNode);

            bellOsc.start();
            bellOsc.stop(audioCtx.currentTime + 6.0);
        } catch (e) {
            console.warn("Melody bell error:", e);
        }
    }

    playDistantBell();
    melodyInterval = setInterval(playDistantBell, 6500); // Trigger every 6.5s
}

// Update volume dynamically when slider is moved
function updateMusicVolume() {
    initAudio();
    if (!audioCtx) return;

    const slider = document.getElementById("bg-music-volume");
    if (!slider) return;
    const val = parseFloat(slider.value) / 100;

    if (bgGainNode) {
        // Use proper volume scale depending on active source
        const factor = usingSynthesizedBackup ? 0.15 : 0.3;
        bgGainNode.gain.linearRampToValueAtTime(val * factor, audioCtx.currentTime + 0.15);
    } else if (val > 0) {
        startBackgroundMusic();
    }
}

// Initialize on user clicks anywhere
document.addEventListener("click", () => {
    initAudio();
    startBackgroundMusic();
});

function playHoverSound() {
    initAudio();
    if (!audioCtx) return;

    const now = Date.now();
    if (now - lastHoverSoundTime < 200) return; // Throttle to max 1 sound per 200ms
    lastHoverSoundTime = now;

    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        const freq = 392.00; // Fixed G4 note (warm, mellow chime)

        osc.type = 'sine'; // Smooth pure tone
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        // Subtly soft chime envelope (volume peak at 1.2%)
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.010); // Peak at 10ms
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) {
        console.warn("Web Audio API error:", e);
    }
}


function playSynthPerkSound() {
    initAudio();
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio arcing upwards!
        freqs.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'triangle'; // Sweet flute/woodwind-like texture
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            
            gain.gain.setValueAtTime(0, now + idx * 0.08);
            gain.gain.linearRampToValueAtTime(0.015, now + idx * 0.08 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.5);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.5);
        });
    } catch(e) {
        console.warn("Web Audio API error playing perk sound:", e);
    }
}

// Sound effect played whenever any hero picks up an item
function playItemPickupSound() {
    try {
        const sfx = new Audio("/Music/pickup_item.wav");
        sfx.volume = 0.5;
        sfx.play().catch(e => console.warn("Pickup sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing pickup sound:", e);
    }
}

// Sound effect played whenever a Monster Card is drawn from the deck
function playDrawCardSound() {
    try {
        const sfx = new Audio("/Music/draw_card.mp3");
        sfx.volume = 0.5;
        sfx.play().catch(e => console.warn("Draw card sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing draw card sound:", e);
    }
}

// Sound effect played once when the heroes lose the game
function playGameLostSound() {
    try {
        const sfx = new Audio("/Music/game_lost.wav");
        sfx.volume = 0.6;
        sfx.play().catch(e => console.warn("Game lost sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing game lost sound:", e);
    }
}

function playGameWonSound() {
    try {
        const sfx = new Audio("/Music/Victory%20sound.wav");
        sfx.volume = 0.6;
        sfx.play().catch(e => console.warn("Victory sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing victory sound:", e);
    }
}

// Per-monster defeat sound files, keyed by monster name.
const MONSTER_DEFEAT_SOUNDS = {
    "Yeti": "/Music/Yeti%20dies.wav"
};

function playMonsterDefeatSound(monsterName) {
    const src = MONSTER_DEFEAT_SOUNDS[monsterName];
    if (!src) return;
    try {
        const sfx = new Audio(src);
        sfx.volume = 0.6;
        sfx.play().catch(e => console.warn(`${monsterName} defeat sound playback failed:`, e));
    } catch (e) {
        console.warn(`Error playing ${monsterName} defeat sound:`, e);
    }
}


// Sound effect played whenever the Terror Level increases
function playTerrorIncreaseSound() {
    try {
        const sfx = new Audio("/Music/Terror%20level%20increase.wav");
        sfx.volume = 0.6;
        sfx.play().catch(e => console.warn("Terror increase sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing terror increase sound:", e);
    }
}

