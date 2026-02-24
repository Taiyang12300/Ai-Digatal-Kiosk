/**
 * สมองกลน้องนำทาง - ฉบับรวมร่างสมบูรณ์ 
 * (Horizontal Search + Idle Reset + Motion Detection)
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbzNIrKYpb8OeoLXTlso7xtb4Ir2aeL4uSOjtzZejf8K8wVfmCWcOsGmQsAPPAb8L9Coew/exec"; 

// --- ตัวแปรสำหรับระบบ Motion Detection & Idle ---
let idleTimer; 
const IDLE_TIME_LIMIT = 120000; // 2 นาที

let video = document.getElementById('video');
let canvas = document.getElementById('motionCanvas');
let ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
let prevFrame = null;
let isDetecting = true; 
let hasGreeted = false;
let motionStartTime = null; 
const DETECTION_THRESHOLD = 2000; // ต้องยืนนิ่ง/ขยับหน้ากล้องนาน 2 วินาทีถึงจะทัก

// 1. เริ่มต้นระบบและโหลดคลังข้อมูล
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("น้องนำทาง: คลังข้อมูลพร้อมใช้งาน");
            resetToHome();
            renderFAQButtons();
            initCamera(); // เริ่มทำงานกล้องตรวจจับ
        }
    } catch (e) {
        console.error("Database Load Error:", e);
    }
}

// 2. ระบบ Idle Timeout & Reset
function resetToHome() {
    console.log("น้องนำทาง: รีเซ็ตสถานะหน้าจอเริ่มต้น");
    window.speechSynthesis.cancel(); 
    displayResponse("กดที่ปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยค่ะ");
    updateLottie('idle');
    
    // รีเซ็ตสถานะการตรวจจับคนใหม่
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
            console.log("น้องนำทาง: ระบบดวงตาพร้อมทำงาน");
            requestAnimationFrame(detectMotion);
        }
    } catch (err) {
        console.warn("ไม่สามารถเข้าถึงกล้องได้ (ระบบทักทายอัตโนมัติจะไม่ทำงาน):", err);
    }
}

function detectMotion() {
    if (!isDetecting || !ctx) {
        requestAnimationFrame(detectMotion);
        return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (prevFrame) {
        let diff = 0;
        for (let i = 0; i < currentFrame.data.length; i += 4) {
            const rDiff = Math.abs(currentFrame.data[i] - prevFrame.data[i]);
            const gDiff = Math.abs(currentFrame.data[i+1] - prevFrame.data[i+1]);
            const bDiff = Math.abs(currentFrame.data[i+2] - prevFrame.data[i+2]);
            if (rDiff + gDiff + bDiff > 100) diff++;
        }

        if (diff > 500) { 
            onMotionDetected();
        } else {
            motionStartTime = null; // รีเซ็ตเวลาถ้าไม่มีความเคลื่อนไหวต่อเนื่อง
        }
    }
    prevFrame = currentFrame;
    requestAnimationFrame(detectMotion);
}

function onMotionDetected() {
    if (hasGreeted || !isDetecting) return;

    const currentTime = Date.now();
    if (motionStartTime === null) {
        motionStartTime = currentTime;
    } else {
        if (currentTime - motionStartTime >= DETECTION_THRESHOLD) {
            greetUser();
            motionStartTime = null; 
        }
    }
}

function greetUser() {
    if (hasGreeted) return;
    const greetings = [
        "สวัสดีค่ะ มีอะไรให้น้องนำทางช่วยไหมคะ?",
        "ยินดีต้อนรับค่ะ สอบถามข้อมูลกับหนูได้เลยนะคะ"
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    displayResponse(randomGreeting);
    speak(randomGreeting);
    hasGreeted = true; 
    isDetecting = false; // ปิดการตรวจจับชั่วคราวขณะคุย
}

// 4. ฟังก์ชันค้นหาคำตอบ (Horizontal Search)
async function getResponse(userQuery) {
    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลค่ะ...");
        return;
    }

    restartIdleTimer(); 
    hasGreeted = true; 
    
    // ส่ง Log ไปยัง Google Sheets
    fetch(`${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`, { mode: 'no-cors' }).catch(e => {});

    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };
    let foundExact = false;

    const allSheetNames = Object.keys(localDatabase); 

    for (const sheetName of allSheetNames) {
        // ข้ามชีตที่ไม่ใช่ข้อมูลคำถาม-คำตอบ
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue; 
        if (foundExact) break;

        const data = localDatabase[sheetName]; 
        
        // โครงสร้าง: data[0] = แถวคำถาม, data[1] = แถวคำตอบ
        if (data && data[0] && data[1]) {
            const questions = data[0]; 
            const answers = data[1];

            for (let j = 0; j < questions.length; j++) {
                const key = questions[j] ? questions[j].toString().toLowerCase().trim() : "";
                const ans = answers[j] ? answers[j].toString().trim() : "";
                
                if (!key || !ans) continue;

                let score = 0;

                // 1. ถ้าคำถามตรงกันเป๊ะ (Perfect Match)
                if (query === key) {
                    score = 1.0;
                    foundExact = true;
                } 
                // 2. ตรวจสอบ Keyword (ถ้าคำถามผู้ใช้มีคำใน Sheet หรือใน Sheet มีคำที่ผู้ใช้ถาม)
                else if (query.includes(key) || key.includes(query)) {
                    // คำนวณคะแนนตามความยาวของ Keyword เพื่อความแม่นยำ
                    // ถ้าคำสั้นเกินไป (เช่น "ทำ") จะได้คะแนนน้อยกว่าคำยาว (เช่น "ทำใบขับขี่ใหม่")
                    score = key.length > 3 ? 0.85 : 0.60;
                } 
                // 3. ใช้ Fuzzy Logic (Similarity) เป็นตัวสำรอง
                else {
                    score = calculateSimilarity(query, key);
                }

                if (score > bestMatch.score) {
                    bestMatch = { answer: ans, score: score };
                }
                
                if (foundExact) break;
            }
        }
    }

    // ปรับ Threshold เป็น 0.50 เพื่อกรองคำตอบที่ไม่ค่อยตรงออกไป
    if (bestMatch.score >= 0.50) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยค่ะ น้องนำทางยังไม่มีข้อมูลเรื่องนี้ในระบบ กรุณาลองใช้คำถามอื่น หรือสอบถามเจ้าหน้าที่ประชาสัมพันธ์นะคะ";
        displayResponse(fallback);
        speak(fallback);
    }
}

// 5. ระบบคำนวณ ความเหมือน (Similarity)
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
        updateLottie('talking');
        restartIdleTimer(); 
    };
    msg.onend = () => {
        updateLottie('idle');
        restartIdleTimer(); 
    };
    window.speechSynthesis.speak(msg);
}

// 7. Lottie & FAQ Buttons
function updateLottie(state) {
    const player = document.querySelector('lottie-player') || document.getElementById('lottie-canvas');
    if (!player) return;
    if (localDatabase && localDatabase["Lottie_State"]) {
        const data = localDatabase["Lottie_State"];
        const match = data.find(row => row[0] && row[0].toString().toLowerCase() === state.toLowerCase());
        if (match && match[1] && match[1].includes('http')) {
            player.load(match[1]);
            return;
        }
    }
    state === 'talking' ? player.setSpeed(1.5) : player.setSpeed(1.0);
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase || !localDatabase["FAQ"]) return;
    container.innerHTML = "";
    
    const faqData = localDatabase["FAQ"]; 
    
    // ใช้ .slice(1) เพื่อเริ่มอ่านตั้งแต่แถวที่ 2 เป็นต้นไป (ข้ามหัวคอลัมน์แถวแรก)
    faqData.slice(1).forEach((row) => {
        const topic = row[0]; // ดึงข้อมูลคอลัมน์ A
        
        // ตรวจสอบว่ามีข้อมูล และไม่ใช่ค่าว่าง
        if (topic && topic.toString().trim() !== "") {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = topic.toString().trim();
            btn.onclick = () => getResponse(topic.toString().trim());
            container.appendChild(btn);
        }
    });
}


initDatabase();

window.speechSynthesis.onvoiceschanged = () => {
    console.log("Voice list updated");
};
