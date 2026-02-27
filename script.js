/**
 * สมองกลน้องนำทาง - เวอร์ชั่น Ultra Stable (Kiosk Professional)
 * แก้ไข: ป้องกันอาการค้าง, รองรับการสัมผัส, และระบบ Safety Timeout
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer; 
let speechSafetyTimeout; 
const IDLE_TIME_LIMIT = 45000; // ปรับเป็น 45 วินาทีเพื่อให้คนมีเวลาอ่าน
let video = document.getElementById('video');
let cocoModel = null; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = 0;
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 500; 

/**
 * 1. ระบบจัดการสถานะและความเสถียร (Centralized State Control)
 */

function resetSystemState() {
    window.speechSynthesis.cancel();
    clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    updateLottie('idle');
}

// อัปเดตเวลาล่าสุดที่มีการใช้งาน (ทั้งจากกล้องและการสัมผัส)
function updateInteractionTime() {
    lastSeenTime = Date.now();
    restartIdleTimer();
}

// ลงทะเบียนการตรวจจับการสัมผัสหน้าจอ
document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);

window.switchLanguage = function(lang) {
    resetSystemState(); 
    window.currentLang = lang;
    const welcomeMsg = (lang === 'th') 
        ? "เปลี่ยนเป็นภาษาไทยแล้วครับ มีอะไรให้ช่วยไหม?" 
        : "Switched to English. How can I help you?";
    displayResponse(welcomeMsg);
    renderFAQButtons(); 
    updateInteractionTime();
};

function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    const muteIcon = document.getElementById('muteIcon');
    if (muteBtn) muteBtn.classList.remove('muted');
    if (muteIcon) muteIcon.className = 'fas fa-volume-up';
}

/**
 * 2. ระบบ Reset หน้าจอ (Smart Reset)
 */
function resetToHome() {
    const now = Date.now();
    const noInteraction = (now - lastSeenTime > IDLE_TIME_LIMIT);

    if (window.isBusy || personInFrameTime !== null || !noInteraction) {
        restartIdleTimer(); 
        return;
    }

    resetSystemState();
    forceUnmute(); 

    // --- เพิ่ม 2 บรรทัดนี้ เพื่อล้างสถานะให้พร้อมทักทายคนใหม่ ---
    window.hasGreeted = false;      // อนุญาตให้ระบบส่งเสียงทักทายได้อีกครั้ง
    personInFrameTime = null;       // ล้างประวัติการเจอคน เพื่อเริ่มนับ 1.5 วินาทีใหม่
    // --------------------------------------------------

    const welcomeMsg = window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.";
    displayResponse(welcomeMsg);
    restartIdleTimer();
}

function restartIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

/**
 * 3. ระบบดวงตา AI (Detection Logic)
 */
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 320, height: 240 } 
        });
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => { 
                video.play(); 
                requestAnimationFrame(detectPerson); 
            };
        }
    } catch (err) { console.warn("Camera access denied:", err); }
}

async function detectPerson() {
    if (!isDetecting || !cocoModel) { 
        requestAnimationFrame(detectPerson); 
        return; 
    }

    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) {
        requestAnimationFrame(detectPerson);
        return;
    }
    lastDetectionTime = now;

    const predictions = await cocoModel.detect(video);
    const person = predictions.find(p => p.class === "person" && p.score > 0.8 && p.bbox[2] > 120);

    if (person) {
        updateInteractionTime(); // อัปเดตเวลาการใช้งานเมื่อเจอคน
        if (personInFrameTime === null) personInFrameTime = Date.now();

        if (!window.isBusy && !window.hasGreeted) {
            if (Date.now() - personInFrameTime >= 1500) {
                greetUser();
            }
        }
    } else {
        // ต้องไม่เจอคน 7 วินาที ถึงจะถือว่าคนเดินจากไป
        if (personInFrameTime !== null && (Date.now() - lastSeenTime > 7000)) { 
            personInFrameTime = null;
            window.hasGreeted = false;
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return; 
    forceUnmute();
    const hour = new Date().getHours();
    let thTime = hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 18 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีครับ");
    let enTime = hour < 12 ? "Good morning" : (hour < 18 ? "Good afternoon" : "Good day");

    const greetings = {
        th: [`${thTime} มีอะไรให้น้องนำทางช่วยไหมครับ?`, "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีครับ", "สอบถามข้อมูลกับน้องนำทางได้นะครับ"],
        en: [`${enTime}! How can I help you?`, "Welcome! How can I assist you today?"]
    };
    
    const list = greetings[window.currentLang] || greetings['th'];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    
    window.hasGreeted = true; 
    displayResponse(finalGreet);
    speak(finalGreet);
}

/**
 * 4. ระบบประมวลผลคำตอบ (Search & Fetch)
 */
async function getResponse(userQuery) {
    if (!userQuery || window.isBusy) return;
    
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');
    
    // Safety: ป้องกันกรณีเน็ตค้าง (10 วินาที)
    const fetchTimeout = setTimeout(() => {
        if (window.isBusy) {
            window.isBusy = false;
            displayResponse("ขออภัยครับ ระบบเชื่อมต่อฐานข้อมูลล่าช้า ลองใหม่อีกครั้งนะครับ");
            updateLottie('idle');
        }
    }, 10000);

    try {
        // บันทึก Log (ไม่รอผล)
        fetch(`${GAS_URL}?query=${encodeURIComponent(userQuery.trim())}&action=logOnly`, { mode: 'no-cors' });
        
        const query = userQuery.toLowerCase().trim();
        let bestMatch = { answer: "", score: 0 };

        Object.keys(window.localDatabase).forEach(sheetName => {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;
            window.localDatabase[sheetName].forEach((item) => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase().trim() : "";
                if (!rawKeys) return;

                const keyList = rawKeys.split(/[,|]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "ไม่มีข้อมูล") : (item[2] || "No data");
                
                keyList.forEach(key => {
                    let currentScore = 0;
                    if (query === key) currentScore = 1.0;
                    else if (query.includes(key) && key.length > 4) currentScore = 0.85;
                    else currentScore = calculateSimilarity(query, key);

                    if (currentScore > bestMatch.score) {
                        bestMatch = { answer: ans, score: currentScore };
                    }
                });
            });
        });

        clearTimeout(fetchTimeout);
        if (bestMatch.score >= 0.60) {
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else {
            const fallback = (window.currentLang === 'th') 
                ? "ขออภัย น้องนำทางไม่พบข้อมูลที่ตรงกันครับ" 
                : "I'm sorry, I couldn't find a matching answer.";
            displayResponse(fallback);
            speak(fallback);
        }
    } catch (err) {
        clearTimeout(fetchTimeout);
        resetSystemState();
    }
}

/**
 * 5. ระบบเสียง (Speech with Safety Unlock)
 */
function speak(text) {
    if (!text) return;
    
    // Safety Unlock: คำนวณเวลาสูงสุดที่ควรพูดเสร็จ (อักษรละ 200ms + 5 วิ)
    const safetyTime = (text.length * 200) + 5000;
    
    clearTimeout(speechSafetyTimeout);
    speechSafetyTimeout = setTimeout(() => {
        window.isBusy = false;
        updateLottie('idle');
        console.warn("Safety Unlock: Force idle status.");
    }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.volume = window.isMuted ? 0 : 1;

    const voices = window.speechSynthesis.getVoices();
    if (window.currentLang === 'th') {
        msg.voice = voices.find(v => v.name.includes('Achara')) || voices.find(v => v.name.includes('Google ภาษาไทย'));
    }

    msg.onstart = () => {
        window.isBusy = true;
        updateLottie('talking');
    };
    
    msg.onend = () => { 
        clearTimeout(speechSafetyTimeout);
        window.isBusy = false;
        updateLottie('idle'); 
        restartIdleTimer(); 
    };

    msg.onerror = () => {
        clearTimeout(speechSafetyTimeout);
        window.isBusy = false;
        updateLottie('idle');
    };

    window.speechSynthesis.speak(msg);
}

/**
 * 6. ฟังก์ชันเริ่มต้นและ UI
 */
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            cocoModel = await cocoSsd.load();
            resetSystemState();
            renderFAQButtons();
            initCamera(); 
            displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.");
        }
    } catch (e) { 
        console.error("Initialization Error:", e);
        setTimeout(initDatabase, 5000); // ลองโหลดใหม่ถ้าล้มเหลว
    }
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
