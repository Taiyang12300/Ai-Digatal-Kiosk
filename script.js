/**
 * สมองกลน้องนำทาง - เวอร์ชั่นเสถียร (Kiosk Optimized)
 */

// ใช้ window. เพื่อให้ HTML เรียกใช้และแก้ไขได้โดยตรง
window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer; 
const IDLE_TIME_LIMIT = 30000; 
let video = document.getElementById('video');
let cocoModel = null; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = 0;
let lastDetectionTime = 0; // สำหรับระบบ Throttling
const DETECTION_INTERVAL = 400; // ตรวจจับทุก 0.4 วินาที (ลดภาระเครื่อง)

// 1. ฟังก์ชันช่วยรีเซ็ตสถานะเสียง (เพื่อให้ปุ่มใน HTML เปลี่ยนตาม)
function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    const muteIcon = document.getElementById('muteIcon');
    if (muteBtn) muteBtn.classList.remove('muted');
    if (muteIcon) muteIcon.className = 'fas fa-volume-up';
}

// 2. เริ่มต้นระบบ
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            cocoModel = await cocoSsd.load();
            window.speechSynthesis.cancel();
            renderFAQButtons();
            initCamera(); 
            displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.");
        }
    } catch (e) { console.error("System Load Error:", e); }
}

// 3. ระบบ Reset หน้าจอ
function resetToHome() {
    if (window.speechSynthesis.speaking || personInFrameTime !== null) {
        restartIdleTimer(); 
        return;
    }

    forceUnmute(); // บังคับเปิดเสียงเมื่อกลับหน้าแรก
    
    window.speechSynthesis.cancel(); 
    const welcomeMsg = window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.";
    displayResponse(welcomeMsg);
    updateLottie('idle');
    window.isBusy = false; 
    window.hasGreeted = false; 
    restartIdleTimer();
}

function restartIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

// 4. ระบบดวงตา AI (COCO-SSD) พร้อมระบบ Throttling ป้องกันเครื่องค้าง
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 320, height: 240 } 
        });
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => { video.play(); requestAnimationFrame(detectPerson); };
        }
    } catch (err) { console.warn("Camera Error:", err); }
}

async function detectPerson() {
    if (!isDetecting || window.isBusy || !cocoModel) { 
        requestAnimationFrame(detectPerson); 
        return; 
    }

    const now = Date.now();
    // ถ้ายังไม่ถึงรอบการตรวจจับ (400ms) ให้ข้ามเฟรมนี้ไป
    if (now - lastDetectionTime < DETECTION_INTERVAL) {
        requestAnimationFrame(detectPerson);
        return;
    }
    lastDetectionTime = now;

    const predictions = await cocoModel.detect(video);
    const person = predictions.find(p => p.class === "person" && p.score > 0.65 && p.bbox[2] > 160);

    if (person) {
        restartIdleTimer();
        if (personInFrameTime === null) personInFrameTime = Date.now();
        if (Date.now() - personInFrameTime >= 3000 && !window.hasGreeted) greetUser();
        lastSeenTime = Date.now(); 
    } else {
        if (personInFrameTime !== null && (Date.now() - lastSeenTime > 10000)) { 
            personInFrameTime = null;
            window.hasGreeted = false;
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return; 
    window.isBusy = true; 
    forceUnmute(); // เปิดเสียงเพื่อทักทาย

    const hour = new Date().getHours();
    let thTime = hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 18 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีครับ");
    let enTime = hour < 12 ? "Good morning" : (hour < 18 ? "Good afternoon" : "Good day");

    const greetings = {
        th: [`${thTime} มีอะไรให้น้องนำทางช่วยไหมครับ?`, "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีครับ", "สอบถามข้อมูลกับน้องนำทางได้นะครับ"],
        en: [`${enTime}! How can I help you?`, "Welcome! Please feel free to ask questions.", "How can I assist you today?"]
    };
    
    const list = greetings[window.currentLang] || greetings['th'];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    displayResponse(finalGreet);
    speak(finalGreet);
    window.hasGreeted = true; 
}

async function getResponse(userQuery) {
    if (!userQuery) return;
    window.isBusy = true;
    forceUnmute(); // บังคับเปิดเสียงทุกครั้งที่มีการถามใหม่
    
    window.speechSynthesis.cancel(); 
    fetch(`${GAS_URL}?query=${encodeURIComponent(userQuery.trim())}&action=logOnly`, { mode: 'no-cors' });

    restartIdleTimer(); 
    window.hasGreeted = true; 
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    Object.keys(window.localDatabase).forEach(sheetName => {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;
        window.localDatabase[sheetName].forEach((item) => {
            const rawKey = item[0] ? item[0].toString().toLowerCase().trim() : "";
            if (!rawKey) return;
            let ans = window.currentLang === 'th' ? (item[1] || "ไม่มีข้อมูล") : (item[2] || "No data in English");
            
            rawKey.split(/\s+/).forEach(key => {
                if (key.length <= 2) return; 
                let score = query.includes(key) ? 0.95 : calculateSimilarity(query, key);
                if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
            });
        });
    });

    if (bestMatch.score >= 0.45) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = (window.currentLang === 'th') ? "ขออภัย น้องนำทางไม่มีข้อมูลเรื่องนี้ครับ กรุณาติดต่อเจ้าหน้าที่ที่เคาท์เตอร์ครับ" : "I'm sorry, I couldn't find any information on this topic. Please contact the officer at the counter.";
        displayResponse(fallback);
        speak(fallback);
    }
}

function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel(); 
    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.volume = window.isMuted ? 0 : 1;

    if (window.currentLang === 'th') {
        const voices = window.speechSynthesis.getVoices();
        msg.voice = voices.find(v => v.name.includes('Achara')) || voices.find(v => v.name.includes('Google ภาษาไทย'));
    }

    msg.onstart = () => updateLottie('talking');
    msg.onend = () => { updateLottie('idle'); window.isBusy = false; restartIdleTimer(); };
    window.speechSynthesis.speak(msg);
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qThai = row[0] ? row[0].toString().trim() : "";
        const qEng  = row[1] ? row[1].toString().trim() : "";
        let btnText = (window.currentLang === 'th') ? qThai : qEng;
        
        if (btnText !== "") {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = btnText;
            btn.onclick = () => getResponse(btnText);
            container.appendChild(btn);
        }
    });
}

function updateLottie(state) {
    const player = document.getElementById('lottie-canvas');
    if (!player) return;
    const assets = {
        'idle': 'https://lottie.host/568e8594-a319-4491-bf10-a0f5c012fc76/6S3urqybG5.json',
        'thinking': 'https://lottie.host/e742c203-f211-4521-a5aa-96cd5248d4b8/CKCd2cqmGj.json',
        'talking': 'https://lottie.host/79a24a65-7d74-4ff7-8ac5-bb3eeaa49073/4BES9eWBuE.json'
    };
    player.load(assets[state]);
}

function displayResponse(text) {
    const box = document.getElementById('response-text');
    if (box) box.innerText = text;
}

function calculateSimilarity(s1, s2) {
    let longer = s1.length < s2.length ? s2 : s1;
    let shorter = s1.length < s2.length ? s1 : s2;
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
                if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                    newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue; lastValue = newVal;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

initDatabase();
