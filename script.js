/**
 * สมองกลน้องนำทาง - ฉบับปรับปรุง (แก้ไข Syntax + เพิ่ม Log ตรวจสอบ)
 * (Horizontal Search + Idle Reset + Motion Detection + Busy Lock)
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbzNIrKYpb8OeoLXTlso7xtb4Ir2aeL4uSOjtzZejf8K8wVfmCWcOsGmQsAPPAb8L9Coew/exec"; 

// --- ตัวแปรสำหรับระบบ Motion Detection & Idle ---
let idleTimer; 
const IDLE_TIME_LIMIT = 30000; // 30 วินาที

let video = document.getElementById('video');
let canvas = document.getElementById('motionCanvas');
let ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
let prevFrame = null;
let isDetecting = true; 
let hasGreeted = false;
let motionStartTime = null; 
const DETECTION_THRESHOLD = 1000; // ยืนนิ่ง 1 วินาที
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

// 2. ระบบ Idle Timeout & Reset
function resetToHome() {
    console.log("DEBUG: [System] รีเซ็ตหน้าจอเริ่มต้น (Idle Reset)");
    window.speechSynthesis.cancel(); 
    displayResponse("กดที่ปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยค่ะ");
    updateLottie('idle');
    
    isBusy = false; 
    hasGreeted = false; 
    isDetecting = true; 
    motionStartTime = null;
    restartIdleTimer();
}

function restartIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

window.addEventListener('mousedown', restartIdleTimer);

// 3. ระบบ Motion Detection (ดวงตา AI)
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
            if (rDiff + gDiff + bDiff > 500) diff++;
        }

        if (diff > 200) { 
            onMotionDetected(diff);
        } else {
            //motionStartTime = null; 
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
        console.log(`DEBUG: [Motion] พบการเคลื่อนไหว (Diff: ${diffValue}) เริ่มนับเวลาทักทาย...`);
    } else {
        const duration = currentTime - motionStartTime;
        if (duration >= DETECTION_THRESHOLD) {
            console.log(`DEBUG: [Motion] ยืนนิ่งครบ ${DETECTION_THRESHOLD}ms -> เริ่มทักทาย`);
            greetUser();
            motionStartTime = null; 
        }
    }
}

function greetUser() {
    if (hasGreeted || isBusy) return; 
    
    isBusy = true; 
    isDetecting = false; 
    
    console.log("DEBUG: [Greet] กำลังสุ่มคำทักทาย...");
    updateLottie('talking');

    const greetings = [
        "สวัสดีค่ะ มีอะไรให้น้องนำทางช่วยไหมคะ?",
        "ยินดีต้อนรับค่ะ สอบถามข้อมูลการทำใบขับขี่กับหนูได้นะคะ",
        "สวัสดีค่ะ เชิญสอบถามข้อมูลที่ต้องการได้เลยค่ะ"
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    displayResponse(randomGreeting);

    setTimeout(() => {
        speak(randomGreeting);
    }, 100);

    hasGreeted = true; 
}

// 4. ฟังก์ชันค้นหาคำตอบ
async function getResponse(userQuery, category) {
    console.log(`DEBUG: [Search] รับคำถาม -> "${userQuery}"`);
    isBusy = true;
    isDetecting = false;
    window.speechSynthesis.cancel(); 

    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลค่ะ...");
        isBusy = false; 
        return;
    }

    restartIdleTimer(); 
    hasGreeted = true; 
    
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0, sheet: "" };
    let foundExact = false;

    const allSheets = Object.keys(localDatabase);

    allSheets.forEach(sheetName => {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;
        if (foundExact) return;

        const data = localDatabase[sheetName]; 
        data.forEach((item) => {
            const key = item[0] ? item[0].toString().toLowerCase().trim() : "";
            const ans = item[1] ? item[1].toString().trim() : "";
            
            if (!key || !ans) return;

            let score = 0;
            if (query === key) {
                score = 1.0;
                foundExact = true;
            } 
            else if (query.includes(key) || key.includes(query)) {
                score = key.length > 3 ? 0.90 : 0.65;
            } 
            else if (typeof calculateSimilarity === "function") {
                score = calculateSimilarity(query, key);
            }

            if (score > bestMatch.score) {
                bestMatch = { answer: ans, score: score, sheet: sheetName };
            }
        });
    });

    console.log(`DEBUG: [Search] ค้นหาพบที่ Sheet: ${bestMatch.sheet} (Score: ${bestMatch.score.toFixed(2)})`);

    if (bestMatch.score >= 0.50) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยค่ะ น้องนำทางไม่พบข้อมูลเรื่องนี้ในระบบ กรุณาลองใช้คำถามอื่นนะคะ";
        console.log("DEBUG: [Search] ไม่พบคำตอบที่ใกล้เคียงเกณฑ์");
        displayResponse(fallback);
        speak(fallback);
    }
}

// 5. คำนวณความเหมือน
function calculateSimilarity(s1, s2) {
    let longer = s1.toLowerCase().trim();
    let shorter = s2.toLowerCase().trim();
    if (s1.length < s2.length) { [longer, shorter] = [shorter, s1]; }
    let longerLength = longer.length;
    if (longerLength === 0) return 1.0;

    const editDistance = (s1, s2) => {
        let costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) costs[j] = j;
                else if (j > 0) {
                    let newVal = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                        newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newVal;
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    };
    return (longerLength - editDistance(longer, shorter)) / longerLength;
}

// 6. การแสดงผลและเสียง
function displayResponse(text) {
    const box = document.getElementById('response-text') || document.getElementById('output');
    if (box) {
        box.innerText = text;
        box.style.opacity = 0;
        setTimeout(() => { box.style.opacity = 1; }, 50);
    }
}

function speak(text) {
    window.speechSynthesis.cancel(); 
    isBusy = true; 
    isDetecting = false; 
    
    const cleanText = text.replace(/[*#-]/g, ""); 
    const msg = new SpeechSynthesisUtterance(cleanText);
    msg.lang = 'th-TH';

    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => 
        (v.lang.includes('th')) && 
        (v.name.includes('Google') || v.name.includes('Narisa') || v.name.includes('Premium'))
    );
    if (femaleVoice) msg.voice = femaleVoice;

    msg.pitch = 1.05; 
    msg.rate = 1.0; 

    msg.onstart = () => { 
        console.log("DEBUG: [Voice] กำลังเริ่มพูด...");
        updateLottie('talking'); 
        restartIdleTimer();
    };

    msg.onend = () => { 
        console.log("DEBUG: [Voice] พูดจบแล้ว ปลดล็อคระบบ");
        updateLottie('idle'); 
        isBusy = false; 
        restartIdleTimer();
    };
    
    window.speechSynthesis.speak(msg);
}

// 7. Lottie & FAQ
function updateLottie(state) {
    const player = document.querySelector('lottie-player') || document.getElementById('lottie-canvas');
    if (!player || !localDatabase || !localDatabase["Lottie_State"]) return;

    const match = localDatabase["Lottie_State"].find(row => 
        row[0] && row[0].toString().toLowerCase().trim() === state.toLowerCase().trim()
    );

    if (match && match[1]) {
        if (typeof player.load === 'function') {
            player.load(match[1]);
        } else {
            player.src = match[1];
        }
    }
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase || !localDatabase["FAQ"]) return;
    container.innerHTML = "";
    
    const faqData = localDatabase["FAQ"]; 
    faqData.slice(1).forEach((row) => {
        const topic = row[0]; 
        if (topic && topic.toString().trim() !== "") {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = topic.toString().trim();
            btn.onclick = () => {
                console.log(`DEBUG: [UI] คลิกปุ่ม FAQ: ${topic}`);
                getResponse(topic.toString().trim());
            };
            container.appendChild(btn);
        }
    });
}

initDatabase();

window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
};
