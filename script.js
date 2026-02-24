/**
 * สมองกลน้องนำทาง - ฉบับสมบูรณ์ (AI Full Feature)
 * (Horizontal Search + Idle Reset + Motion Detection + FAQ Column A)
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
const DETECTION_THRESHOLD = 800; // ต้องยืนนิ่ง/ขยับหน้ากล้องนาน 0.8 วินาทีถึงจะทัก

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
            initCamera(); 
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
        console.warn("ไม่สามารถเข้าถึงกล้องได้:", err);
    }
}

function detectMotion() {
    // 1. ถ้าไม่ได้อยู่ในโหมดตรวจจับ หรือไม่มี Canvas ให้รอรอบถัดไป
    if (!isDetecting || !ctx) {
        requestAnimationFrame(detectMotion);
        return;
    }

    // วาดภาพจากวิดีโอลง Canvas เพื่ออ่านพิกเซล
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (prevFrame) {
        let diff = 0;
        const data = currentFrame.data;
        const prevData = prevFrame.data;

        // 2. คำนวณหาความต่างของภาพ (ขยับทีละ 4 คือ R,G,B,A)
        for (let i = 0; i < data.length; i += 4) {
            const rDiff = Math.abs(data[i] - prevData[i]);
            const gDiff = Math.abs(data[i+1] - prevData[i+1]);
            const bDiff = Math.abs(data[i+2] - prevData[i+2]);
            
            // ถ้าความต่างของสีรวมกันเกิน 100 ถือว่าจุดนั้นมีการขยับ
            if (rDiff + gDiff + bDiff > 100) diff++;
        }

        // --- จุดทดสอบสถานะ ---
        // console.log("คะแนนความเคลื่อนไหวปัจจุบัน:", diff); 

        // 3. ปรับเกณฑ์ (Threshold) ให้เหมาะสม
        if (diff > 200) { // ลดจาก 500 เหลือ 200 เพื่อให้ทักง่ายขึ้น
            onMotionDetected();
        } else {
            // ถ้านิ่งเกินไป (ไม่มีคนขยับ) ให้ล้างเวลาทิ้ง
            //motionStartTime = null; 
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
        const duration = currentTime - motionStartTime;
        // เพิ่มบรรทัดนี้เพื่อดูเวลาที่ระบบกำลังนับ
        console.log("กำลังตรวจจับคนนิ่ง: " + duration + "ms"); 

        if (duration >= DETECTION_THRESHOLD) {
            console.log("!!! กำลังเรียกฟังก์ชันทักทาย !!!");
            greetUser();
            motionStartTime = null; 
        }
    }
}

function greetUser() {
    // ป้องกันการทักซ้อนซ้อน
    if (hasGreeted) return;
    
    console.log("น้องนำทาง: เริ่มการทักทาย");
    
    // 1. เปลี่ยนท่าทางเป็นพูดทันที (ดึงจาก Lottie_State ที่เราอัปเดตใหม่)
    updateLottie('talking');

    const greetings = [
        "สวัสดีค่ะ มีอะไรให้น้องนำทางช่วยไหมคะ?",
        "ยินดีต้อนรับค่ะ สอบถามข้อมูลการทำใบขับขี่กับหนูได้นะคะ",
        "สวัสดีค่ะ เชิญสอบถามข้อมูลที่ต้องการได้เลยค่ะ"
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    // 2. แสดงข้อความบนจอ
    displayResponse(randomGreeting);

    // 3. สั่งพูด (ใส่ Delay เล็กน้อยเผื่อระบบเสียงยังไม่พร้อม)
    setTimeout(() => {
        speak(randomGreeting);
    }, 100);

    // 4. ล็อกสถานะ เพื่อไม่ให้ทักซ้ำจนกว่าจะรีเซ็ต (Idle)
    hasGreeted = true; 
    isDetecting = false; 
}

// 4. ฟังก์ชันค้นหาคำตอบ (Smart Horizontal Search)
async function getResponse(userQuery, category) {
    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลค่ะ...");
        return;
    }

    restartIdleTimer(); 
    hasGreeted = true; 
    
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };
    let foundExact = false;

    // ค้นหาในทุกชีตที่มีข้อมูล (หรือระบุเฉพาะเจาะจง)
    const allSheets = Object.keys(localDatabase);

    allSheets.forEach(sheetName => {
        // ข้ามชีตตั้งค่าและชีตบันทึก Log
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;
        if (foundExact) return;

        const data = localDatabase[sheetName]; 
        
        /**
         * วิเคราะห์โครงสร้างจาก JSON ที่คุณส่งมา:
         * data เป็น Array ของแต่ละ "ชุดข้อมูล"
         * ใน 1 ชุดข้อมูล (เช่น data[0]):
         * index 0 = คำถาม (เช่น "ทำใบขับขี่ใหม่")
         * index 1 = คำตอบ (เนื้อหาละเอียด)
         * index 2 = สถานะ (เช่น "talking")
         */
        data.forEach((item) => {
            const key = item[0] ? item[0].toString().toLowerCase().trim() : "";
            const ans = item[1] ? item[1].toString().trim() : "";
            
            if (!key || !ans) return;

            let score = 0;
            // 1. ตรวจสอบว่าตรงกันเป๊ะไหม
            if (query === key) {
                score = 1.0;
                foundExact = true;
            } 
            // 2. ตรวจสอบ Keyword (Partial Match)
            else if (query.includes(key) || key.includes(query)) {
                score = key.length > 3 ? 0.90 : 0.65;
            } 
            // 3. ใช้ Fuzzy Search (ถ้ามีฟังก์ชัน calculateSimilarity)
            else if (typeof calculateSimilarity === "function") {
                score = calculateSimilarity(query, key);
            }

            if (score > bestMatch.score) {
                bestMatch = { answer: ans, score: score };
            }
        });
    });

    // แสดงผลและออกเสียง
    if (bestMatch.score >= 0.50) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยค่ะ น้องนำทางไม่พบข้อมูลเรื่องนี้ในระบบ กรุณาลองใช้คำถามอื่นนะคะ";
        displayResponse(fallback);
        speak(fallback);
    }
}


// 5. ระบบคำนวณ ความเหมือน (Levenshtein Distance)
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

    msg.onstart = () => { updateLottie('talking'); restartIdleTimer(); };
    msg.onend = () => { updateLottie('idle'); restartIdleTimer(); };
    window.speechSynthesis.speak(msg);
}

// 7. Lottie & FAQ Buttons (ดึงจากคอลัมน์ A ข้ามหัวแถว)
function updateLottie(state) {
    const player = document.querySelector('lottie-player') || document.getElementById('lottie-canvas');
    if (!player || !localDatabase || !localDatabase["Lottie_State"]) {
        console.warn("น้องนำทาง: ไม่พบตัวเล่น Lottie หรือฐานข้อมูลยังไม่พร้อม");
        return;
    }

    // ค้นหาแถวที่มีชื่อ State ตรงกัน (เพิ่ม .trim() เพื่อความแม่นยำ)
    const match = localDatabase["Lottie_State"].find(row => 
        row[0] && row[0].toString().toLowerCase().trim() === state.toLowerCase().trim()
    );

    if (match && match[1]) {
        console.log(`น้องนำทาง: เปลี่ยนสถานะ Lottie เป็น -> ${state}`);
        // สำหรับ <lottie-player> การใช้ .load(url) คือวิธีที่ถูกต้องและไวที่สุด
        if (typeof player.load === 'function') {
            player.load(match[1]);
        } else {
            // กรณีเป็น lottie-canvas หรือ element อื่นๆ
            player.src = match[1];
        }
    } else {
        console.error(`น้องนำทาง: ไม่พบ URL สำหรับสถานะ "${state}" ในฐานข้อมูล`);
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
            btn.onclick = () => getResponse(topic.toString().trim());
            container.appendChild(btn);
        }
    });
}

initDatabase();

window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
};
