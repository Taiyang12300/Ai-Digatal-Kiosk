/**
 * สมองกลน้องนำทาง - ฉบับสมบูรณ์ (2026 Optimized)
 * Feature: Motion Tracking, Automatic Voice Selection, Idle Reset
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbzNIrKYpb8OeoLXTlso7xtb4Ir2aeL4uSOjtzZejf8K8wVfmCWcOsGmQsAPPAb8L9Coew/exec"; 

// --- ตัวแปรสำหรับระบบ Motion Detection & Idle ---
let idleTimer; 
const IDLE_TIME_LIMIT = 30000; // 30 วินาที
let lastMotionTime = Date.now(); 

let video = document.getElementById('video');
let canvas = document.getElementById('motionCanvas');
let ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
let prevFrame = null;

let isDetecting = true; 
let hasGreeted = false;
let motionStartTime = null; 
const DETECTION_THRESHOLD = 3000; // ยืนนิ่ง 3 วินาทีเพื่อทักทาย
let isBusy = false; 

// 1. เริ่มต้นระบบและโหลดคลังข้อมูล
async function initDatabase() {
    console.log("DEBUG: [Init] กำลังโหลดฐานข้อมูล...");
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("DEBUG: [Init] คลังข้อมูลพร้อมใช้งาน");
            resetToHome();
            renderFAQButtons();
            initCamera(); 
        }
    } catch (e) {
        console.error("DEBUG ERROR: Database Load Error:", e);
    }
}

// 2. ฟังก์ชันรีเซ็ตกลับหน้าโฮม (True Home)
function resetToHome() {
    console.log("DEBUG: [System] กำลังรีเซ็ตสถานะกลับหน้าแรก...");
    window.speechSynthesis.cancel(); 
    
    displayResponse("กดที่ปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยค่ะ");
    updateLottie('idle');
    
    isBusy = false; 
    hasGreeted = false; 
    isDetecting = true; 
    motionStartTime = null; 
    
    restartIdleTimer();
}

// 3. ระบบนับเวลา Idle (ถ้าไม่มีคนขยับหรือไม่มีการแตะจอ)
function restartIdleTimer() {
    clearTimeout(idleTimer);
    
    idleTimer = setTimeout(() => {
        if (!isBusy) {
            // ถ้าไม่มีคนอยู่หน้าตู้ (motionStartTime เป็น null) ให้รีเซ็ต
            if (motionStartTime === null) {
                resetToHome();
            } else {
                // ถ้าคนยังอยู่แต่ไม่ขยับหน้าจอ ให้ต่อเวลา 10 วิ
                console.log("DEBUG: [System] คนยังอยู่หน้าตู้แต่ไม่มี Action -> ต่อเวลา");
                restartIdleTimer(); 
            }
        }
    }, IDLE_TIME_LIMIT);
}

// ผูกเหตุการณ์การสัมผัสจอ
window.addEventListener('mousedown', restartIdleTimer);
window.addEventListener('touchstart', restartIdleTimer); 
window.addEventListener('keypress', restartIdleTimer);

// 4. ระบบดวงตา AI (Motion Detection)
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (video) {
            video.srcObject = stream;
            console.log("DEBUG: [Camera] ระบบดวงตาพร้อมทำงาน");
            requestAnimationFrame(detectMotion);
        }
    } catch (err) {
        console.warn("DEBUG ERROR: ไม่สามารถเข้าถึงกล้องได้:", err);
    }
}

function detectMotion() {
    if (!isDetecting || !ctx || isBusy) {
        requestAnimationFrame(detectMotion);
        return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (prevFrame) {
        let diff = 0;
        const data = currentFrame.data;
        const prevData = prevFrame.data;

        for (let i = 0; i < data.length; i += 4) {
            const rDiff = Math.abs(data[i] - prevData[i]);
            const gDiff = Math.abs(data[i+1] - prevData[i+1]);
            const bDiff = Math.abs(data[i+2] - prevData[i+2]);
            if (rDiff + gDiff + bDiff > 400) diff++;
        }

        // เกณฑ์การตรวจจับ (จูนค่าตามความสว่างหน้าตู้)
        if (diff > 40000) { 
            onMotionDetected(diff);
            lastMotionTime = Date.now(); 
        } else {
            if (motionStartTime !== null) onMotionDetected(0);

            // ถ้าไม่มีใครหน้าตู้เกิน 3 วินาที ให้เตรียมพร้อมรับคนใหม่
            if (Date.now() - lastMotionTime > 3000) {
                if (motionStartTime !== null) {
                    console.log("DEBUG: [System] พื้นที่ว่าง -> เคลียร์สถานะการติดตาม");
                    motionStartTime = null;
                }
            }
        }
    }
    
    prevFrame = currentFrame;
    requestAnimationFrame(detectMotion);
}

function onMotionDetected(diffValue) {
    if (hasGreeted || !isDetecting || isBusy) return;

    const currentTime = Date.now();
    if (motionStartTime === null) {
        motionStartTime = currentTime;
        console.log(`DEBUG: [Detection] เริ่มพบวัตถุ (Diff: ${diffValue})`);
    } else {
        const duration = currentTime - motionStartTime;
        if (duration >= DETECTION_THRESHOLD) {
            console.log("DEBUG: [Confirm] ยืนยันพบคน -> สั่งทักทาย");
            greetUser();
            motionStartTime = null; 
        }
    }
}

// 5. ระบบพูดและค้นหาคำตอบ
function greetUser() {
    if (hasGreeted || isBusy) return; 
    isBusy = true; 
    isDetecting = false; 
    updateLottie('talking');

    const greetings = [
        "สวัสดีค่ะ มีอะไรให้น้องนำทางช่วยไหมคะ?",
        "ยินดีต้อนรับค่ะ สอบถามข้อมูลกับหนูได้เลยนะคะ",
        "สวัสดีค่ะ เชิญสอบถามข้อมูลที่ต้องการได้เลยค่ะ"
    ];
    const text = greetings[Math.floor(Math.random() * greetings.length)];
    displayResponse(text);
    speak(text);
    hasGreeted = true; 
}

async function getResponse(userQuery) {
    console.log(`DEBUG: [Search] คำถาม -> "${userQuery}"`);
    isBusy = true;
    isDetecting = false;
    window.speechSynthesis.cancel(); 

    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลค่ะ...");
        isBusy = false; return;
    }

    restartIdleTimer(); 
    hasGreeted = true; 
    
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    Object.keys(localDatabase).forEach(sheetName => {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;
        localDatabase[sheetName].forEach(item => {
            const key = item[0] ? item[0].toString().toLowerCase().trim() : "";
            const ans = item[1] ? item[1].toString().trim() : "";
            if (!key || !ans) return;

            let score = (query === key) ? 1.0 : (query.includes(key) || key.includes(query)) ? 0.8 : calculateSimilarity(query, key);
            if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
        });
    });

    if (bestMatch.score >= 0.50) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยค่ะ น้องนำทางไม่พบข้อมูลเรื่องนี้ กรุณาลองใช้คำถามอื่นนะคะ";
        displayResponse(fallback);
        speak(fallback);
    }
}

function speak(text) {
    window.speechSynthesis.cancel(); 
    isBusy = true; 
    
    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    const voices = window.speechSynthesis.getVoices();
    
    // เลือกเสียงผู้หญิง (Google Thai หรือ Narisa)
    const femaleVoice = voices.find(v => v.lang.includes('th') && (v.name.includes('Google') || v.name.includes('Narisa'))) || voices.find(v => v.lang.includes('th'));

    if (femaleVoice) msg.voice = femaleVoice;
    msg.lang = 'th-TH';
    msg.rate = 1.0;

    msg.onstart = () => { updateLottie('talking'); };
    msg.onend = () => { 
        isBusy = false; 
        isDetecting = true; // กลับมาตรวจจับใหม่เมื่อพูดจบ
        updateLottie('idle'); 
        restartIdleTimer();
    };
    msg.onerror = () => { isBusy = false; isDetecting = true; };

    window.speechSynthesis.resume();
    window.speechSynthesis.speak(msg);
}

// 6. ฟังก์ชันเสริม (Similarity, UI, FAQ)
function calculateSimilarity(s1, s2) {
    let longer = s1.length > s2.length ? s1 : s2;
    let shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1, s2) {
    let costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newVal = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue; lastValue = newVal;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

function displayResponse(text) {
    const box = document.getElementById('response-text') || document.getElementById('output');
    if (box) box.innerText = text;
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase?.FAQ) return;
    container.innerHTML = "";
    localDatabase.FAQ.slice(1).forEach(row => {
        if (row[0]) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = row[0];
            btn.onclick = () => getResponse(row[0].toString());
            container.appendChild(btn);
        }
    });
}

function updateLottie(state) {
    const player = document.querySelector('lottie-player');
    if (!player || !localDatabase?.Lottie_State) return;
    const match = localDatabase.Lottie_State.find(row => row[0]?.toString().toLowerCase() === state.toLowerCase());
    if (match?.[1]) player.src = match[1];
}

// โหลดระบบ
initDatabase();
window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
