/**
 * สมองกลน้องนำทาง - ฉบับปรับปรุงรองรับ 2 ภาษา (Bilingual Edition)
 * โครงสร้างฐานข้อมูล: แถว 1 คำถาม (Keywords) | แถว 2 ตอบไทย | แถว 3 ตอบอังกฤษ
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbyoqeKLGpfGLIAO6d9nv0BkLers7PgezkPeuqZQxTvOlkBm5Atp-yMXxq_fpK806NLbNA/exec"; 

// --- ตัวแปรระบบ ---
let currentLang = 'th'; // ตัวแปรควบคุมภาษาหลัก
let idleTimer; 
const IDLE_TIME_LIMIT = 30000; 
let lastMotionTime = Date.now(); 

let video = document.getElementById('video');
let cocoModel = null; 
let isDetecting = true; 
let hasGreeted = false;
let personInFrameTime = null; 
const DETECTION_THRESHOLD = 5000; 
let isBusy = false; 

// 1. เริ่มต้นระบบและโหลดคลังข้อมูล + โหลด AI
async function initDatabase() {
    console.log("DEBUG: [Init] กำลังโหลดฐานข้อมูล และ สมองกล AI...");
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("DEBUG: [Init] คลังข้อมูลพร้อมใช้งาน");
            
            cocoModel = await cocoSsd.load();
            console.log("DEBUG: [Init] สมองกล COCO-SSD พร้อมใช้งาน");

            resetToHome();
            renderFAQButtons();
            initCamera(); 
        }
    } catch (e) {
        console.error("DEBUG ERROR: System Load Error:", e);
    }
}

// 2. ระบบ Reset
function resetToHome() {
    if (window.speechSynthesis.speaking) {
        restartIdleTimer(); 
        return;
    }

    if (personInFrameTime !== null) {
        restartIdleTimer();
        return;
    }

    console.log("DEBUG: [System] รีเซ็ตหน้าจอเริ่มต้น");
    window.speechSynthesis.cancel(); 
    
    // ปรับข้อความ Reset ตามภาษาปัจจุบัน
    const resetMsg = currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Tap the mic to ask any questions.";
    displayResponse(resetMsg);
    
    updateLottie('idle');
    isBusy = false; 
    hasGreeted = false; 
    isDetecting = true; 
    personInFrameTime = null;
    restartIdleTimer();
}

function restartIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

// 3. ระบบดวงตา AI (COCO-SSD)
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
    } catch (err) {
        console.warn("DEBUG ERROR: ไม่สามารถเข้าถึงกล้องได้:", err);
    }
}

async function detectPerson() {
    if (!isDetecting || isBusy || !cocoModel) {
        requestAnimationFrame(detectPerson);
        return;
    }

    const predictions = await cocoModel.detect(video);
    const person = predictions.find(p => {
        const [x, y, width, height] = p.bbox;
        const isNear = width > 160; 
        const centerX = x + (width / 2);
        const isInRange = centerX > (320 * 0.2) && centerX < (320 * 0.8);
        return p.class === "person" && p.score > 0.65 && isNear && isInRange;
    });

    if (person) {
        restartIdleTimer(); 
        if (personInFrameTime === null) {
            personInFrameTime = Date.now();
        } else {
            const duration = Date.now() - personInFrameTime;
            if (duration >= 2000 && !hasGreeted) {
                greetUser();
            }
        }
    } else {
        if (personInFrameTime !== null && (Date.now() - personInFrameTime > 4000)) {
            personInFrameTime = null;
            hasGreeted = false;
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (hasGreeted || isBusy) return; 
    isBusy = true; 

    // แยกชุดคำทักทายตามภาษา (ใช้ตัวแปร currentLang)
    const greetings = {
        th: [
            "สวัสดีครับ มีอะไรให้น้องนำทางช่วยไหมครับ?",
            "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีครับ สอบถามข้อมูลกับผมได้นะครับ",
            "สวัสดีครับ เชิญสอบถามข้อมูลที่ต้องการได้เลยครับ"
        ],
        en: [
            "Hello! How can I help you today?",
            "Welcome to the Transport Office. Feel free to ask me anything.",
            "Hi! I'm here to help. What would you like to know?"
        ]
    };

    const selectedList = greetings[currentLang] || greetings['th'];
    const randomGreeting = selectedList[Math.floor(Math.random() * selectedList.length)];
    
    displayResponse(randomGreeting);
    speak(randomGreeting);
    hasGreeted = true; 
}

// 4. ฟังก์ชันค้นหาคำตอบ (ปรับปรุงข้ามทีละ 3 แถว)
async function getResponse(userQuery) {
    console.log(`DEBUG: [Search] (${currentLang}) -> "${userQuery}"`);
    isBusy = true;
    window.speechSynthesis.cancel(); 

    if (userQuery && userQuery.trim() !== "") {
        fetch(`${GAS_URL}?query=${encodeURIComponent(userQuery.trim())}&action=logOnly`, { 
            mode: 'no-cors' 
        }).catch(err => console.warn("บันทึก FAQ ล้มเหลว:", err));
    }

    if (!localDatabase) {
        const loadingMsg = currentLang === 'th' ? "กรุณารอสักครู่..." : "Please wait a moment...";
        displayResponse(loadingMsg);
        isBusy = false; 
        return;
    }

    restartIdleTimer(); 
    hasGreeted = true; 
    
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    Object.keys(localDatabase).forEach(sheetName => {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;

        const data = localDatabase[sheetName];
        
        // วนลูปข้ามทีละ 3 แถว เพื่อรองรับโครงสร้าง ถาม-ตอบไทย-ตอบอังกฤษ
        for (let i = 0; i < data.length; i += 3) {
            const rawKey = data[i] && data[i][0] ? data[i][0].toString().toLowerCase().trim() : "";
            
            // เลือกคำตอบตามภาษา
            let ans = "";
            if (currentLang === 'th') {
                ans = data[i+1] && data[i+1][0] ? data[i+1][0].toString().trim() : "";
            } else {
                ans = data[i+2] && data[i+2][0] ? data[i+2][0].toString().trim() : "";
            }

            if (!rawKey || !ans) continue;

            const keywordsArray = rawKey.split(/\s+/); 
            keywordsArray.forEach(key => {
                if (key.length <= 2) return;
                let currentScore = query.includes(key) ? (0.9 + (key.length / 100)) : calculateSimilarity(query, key);
                if (currentScore > bestMatch.score) {
                    bestMatch = { answer: ans, score: currentScore };
                }
            });
        }
    });

    if (bestMatch.score >= 0.45) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = currentLang === 'th' ? 
            "ขออภัยครับ น้องนำทางไม่พบข้อมูลเรื่องนี้ กรุณาติดต่อเจ้าหน้าที่ครับ" : 
            "Sorry, I couldn't find any information on this. Please contact our staff.";
        displayResponse(fallback);
        speak(fallback);
    }
}

// --- ฟังก์ชันเสริม (Similarity, Display, Lottie) เหมือนเดิม ---

function displayResponse(text) {
    const box = document.getElementById('response-text') || document.getElementById('output');
    if (box) { box.innerText = text; box.style.opacity = 1; }
}

function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    
    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    
    // ตั้งค่าภาษาและเสียงตาม currentLang
    msg.lang = currentLang === 'th' ? 'th-TH' : 'en-US';

    const voices = window.speechSynthesis.getVoices();
    if (currentLang === 'th') {
        const thVoice = voices.find(v => v.name.includes('Achara')) || voices.find(v => v.name.includes('Google ภาษาไทย'));
        if (thVoice) msg.voice = thVoice;
    } else {
        const enVoice = voices.find(v => v.name.includes('Google US English')) || voices.find(v => v.name.includes('English'));
        if (enVoice) msg.voice = enVoice;
    }

    msg.onstart = () => updateLottie('talking');
    msg.onend = () => {
        updateLottie('idle');
        isBusy = false;
        restartIdleTimer();
    };
    window.speechSynthesis.speak(msg);
}

function updateLottie(state) {
    const player = document.querySelector('lottie-player') || document.getElementById('lottie-canvas');
    if (!player || !localDatabase || !localDatabase["Lottie_State"]) return;
    const match = localDatabase["Lottie_State"].find(row => row[0]?.toString().toLowerCase().trim() === state.toLowerCase().trim());
    if (match && match[1]) {
        player.src = match[1];
    }
}

// ปรับปรุงการวาดปุ่ม FAQ ให้รองรับ 3 แถว
function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase["FAQ"]) return;
    container.innerHTML = "";
    
    const faqData = localDatabase["FAQ"];
    // วนลูปข้ามทีละ 3 แถว
    for (let i = 0; i < faqData.length; i += 3) {
        const questionTh = faqData[i][0];
        const questionEn = faqData[i+2] ? faqData[i+2][0] : questionTh; 
        
        if (questionTh) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            // แสดงข้อความบนปุ่มตามภาษาที่เลือก
            btn.innerText = currentLang === 'th' ? questionTh : questionEn;
            btn.onclick = () => getResponse(questionTh.toString());
            container.appendChild(btn);
        }
    }
}

// --- ฟังก์ชันคำนวณ Similarity คงเดิม ---
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
                costs[j - 1] = lastValue;
                lastValue = newVal;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

initDatabase();
