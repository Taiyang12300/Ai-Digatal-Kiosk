/**
 * สมองกลน้องนำทาง - เวอร์ชั่นเสถียร (Anti-Freeze Edition)
 * รองรับ: ทักทายตามเวลา, สลับภาษา, ระบบ Mute (Volume 0), และบันทึก Log
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

// --- ตัวแปรระบบ ---
let currentLang = 'th'; 
let isMuted = false; // เชื่อมกับสถานะใน HTML
let isBusy = false; 
let idleTimer; 
const IDLE_TIME_LIMIT = 30000; 

let video = document.getElementById('video');
let cocoModel = null; 
let isDetecting = true; 
let hasGreeted = false;
let personInFrameTime = null; 
let lastSeenTime = 0;
let lastGreeting = "";

// 1. เริ่มต้นระบบ
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            cocoModel = await cocoSsd.load();
            
            // ล้างสถานะเสียงที่อาจค้างจาก Page Refresh
            window.speechSynthesis.cancel();
            
            renderFAQButtons();
            initCamera(); 
            displayResponse(currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยค่ะ" : "Please tap the microphone to ask for information.");
        }
    } catch (e) {
        console.error("System Load Error:", e);
    }
}

// 2. ระบบ Reset หน้าจอ (ยื้อเวลาถ้ายังมีคนอยู่)
function resetToHome() {
    if (window.speechSynthesis.speaking || personInFrameTime !== null) {
        restartIdleTimer(); 
        return;
    }

    window.speechSynthesis.cancel(); 
    const welcomeMsg = currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยค่ะ" : "Please tap the microphone to ask for information.";
    displayResponse(welcomeMsg);
    updateLottie('idle');
    
    isBusy = false; 
    hasGreeted = false; 
    personInFrameTime = null;
    restartIdleTimer();
}

function restartIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

// 3. ระบบตรวจจับคน (COCO-SSD)
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
    if (!isDetecting || isBusy || !cocoModel) { requestAnimationFrame(detectPerson); return; }
    
    const predictions = await cocoModel.detect(video);
    const person = predictions.find(p => {
        const [x, y, width] = p.bbox;
        const centerX = x + (width / 2);
        // ตรวจจับเฉพาะคนที่อยู่กลางเฟรมและมีขนาดใหญ่พอ (ยืนใกล้)
        return p.class === "person" && p.score > 0.65 && width > 160 && (centerX > 64 && centerX < 256);
    });

    if (person) {
        restartIdleTimer();
        if (personInFrameTime === null) personInFrameTime = Date.now();
        
        // ยืนแช่ 3-5 วินาทีค่อยทัก (ลดจาก 5 เหลือ 3 เพื่อความกระฉับกระเฉง)
        if (Date.now() - personInFrameTime >= 3000 && !hasGreeted) {
            greetUser();
        }
        lastSeenTime = Date.now(); 
    } else {
        // ถ้าคนเดินออกไปเกิน 10 วินาที ให้รีเซ็ตสถานะการทักทาย
        if (personInFrameTime !== null && (Date.now() - lastSeenTime > 10000)) { 
            personInFrameTime = null;
            hasGreeted = false;
        }
    }
    requestAnimationFrame(detectPerson);
}

// 4. ทักทายตามช่วงเวลา (ดึงจากโค้ดเก่าที่คุณชอบ)
function greetUser() {
    if (hasGreeted || isBusy) return; 
    isBusy = true; 

    const hour = new Date().getHours();
    let thTime = hour < 12 ? "สวัสดีตอนเช้าค่ะ" : (hour < 18 ? "สวัสดีตอนบ่ายค่ะ" : "สวัสดีค่ะ");
    let enTime = hour < 12 ? "Good morning" : (hour < 18 ? "Good afternoon" : "Good day");

    const greetings = {
        th: [`${thTime} มีอะไรให้น้องนำทางช่วยไหมคะ?`, "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีค่ะ สอบถามข้อมูลกับหนูได้นะ", "สอบถามข้อมูลเบื้องต้นกับน้องนำทางได้นะคะ"],
        en: [`${enTime}! How can I help you?`, "Welcome! Please feel free to ask any questions.", "How can I assist you today?"]
    };
    
    const list = greetings[currentLang] || greetings['th'];
    let finalGreet;
    do {
        finalGreet = list[Math.floor(Math.random() * list.length)];
    } while (finalGreet === lastGreeting && list.length > 1);

    lastGreeting = finalGreet;
    displayResponse(finalGreet);
    speak(finalGreet);
    hasGreeted = true; 
}

// 5. ค้นหาคำตอบ (Bilingual + Logging)
async function getResponse(userQuery) {
    if (!userQuery) return;
    isBusy = true;
    window.speechSynthesis.cancel(); // ตัดเสียงเก่าทิ้งทันทีป้องกันค้าง

    // บันทึก Log ลง Google Sheets
    fetch(`${GAS_URL}?query=${encodeURIComponent(userQuery.trim())}&action=logOnly`, { mode: 'no-cors' })
        .catch(e => console.warn("Log failed", e));

    restartIdleTimer(); 
    hasGreeted = true; 
    
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    Object.keys(localDatabase).forEach(sheetName => {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;

        localDatabase[sheetName].forEach((item) => {
            const rawKey = item[0] ? item[0].toString().toLowerCase().trim() : "";
            if (!rawKey) return;

            // เลือกคำตอบ (Index 1=TH, Index 2=EN)
            let ans = "";
            if (currentLang === 'th') {
                ans = item[1] || "ขออภัยค่ะ ไม่พบข้อมูลเนื้อหาภาษาไทย";
            } else {
                ans = item[2] || "I'm sorry, I couldn't find this information in English. Please contact the counter.";
            }

            const keywordsArray = rawKey.split(/\s+/); 
            keywordsArray.forEach(key => {
                if (key.length <= 2) return; 
                let score = query.includes(key) ? 0.9 + (key.length / 100) : calculateSimilarity(query, key);
                if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
            });
        });
    });

    if (bestMatch.score >= 0.45) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = (currentLang === 'th') ? "ขออภัยค่ะ น้องนำทางไม่พบข้อมูลเรื่องนี้ค่ะ" : "I'm sorry, I couldn't find information on that.";
        displayResponse(fallback);
        speak(fallback);
    }
}

// 6. ระบบเสียง (Anti-Freeze & Mute Support)
function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel(); // ล้าง Queue ทุกครั้งป้องกันการ Freeze

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (currentLang === 'th') ? 'th-TH' : 'en-US';
    
    // ตั้งค่า Volume ตามสถานะ Mute (เงียบแต่ปากยังขยับ)
    msg.volume = isMuted ? 0 : 1;

    // เลือกเสียง
    const voices = window.speechSynthesis.getVoices();
    if (currentLang === 'th') {
        msg.voice = voices.find(v => v.name.includes('Achara')) || voices.find(v => v.name.includes('Google ภาษาไทย'));
    }

    msg.onstart = () => updateLottie('talking');
    msg.onend = () => { 
        updateLottie('idle'); 
        isBusy = false; 
        restartIdleTimer(); 
    };
    
    // Error Handling เพื่อป้องกันอาการค้าง
    msg.onerror = (e) => {
        console.error("Speech Error:", e);
        updateLottie('idle');
        isBusy = false;
    };

    window.speechSynthesis.speak(msg);
}

// 7. UI & FAQ
function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase["FAQ"]) return;
    container.innerHTML = "";

    localDatabase["FAQ"].slice(1).forEach((row) => {
        const btnText = (currentLang === 'th') ? row[0] : row[1];
        if (btnText) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = btnText;
            // ใช้ค่าดั้งเดิม (Col A/B) เป็นคำถาม
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
    if (assets[state]) player.load(assets[state]);
}

function displayResponse(text) {
    const box = document.getElementById('response-text');
    if (box) box.innerText = text;
}

// (Similarity & EditDistance คงเดิม)
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
