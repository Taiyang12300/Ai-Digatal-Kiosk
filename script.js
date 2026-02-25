/**
 * สมองกลน้องนำทาง - ฉบับปรับปรุง (AI Object Detection & Bilingual Integration)
 * โครงสร้างข้อมูลหลัก: แถว 1 Keywords | แถว 2 ตอบไทย | แถว 3 ตอบอังกฤษ
 * โครงสร้าง FAQ: Col A: ปุ่มไทย | Col B: ปุ่มอังกฤษ | Col C: คำถามหลักที่ถูกถาม (Logging)
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbyoqeKLGpfGLIAO6d9nv0BkLers7PgezkPeuqZQxTvOlkBm5Atp-yMXxq_fpK806NLbNA/exec"; 

// --- ตัวแปรระบบ ---
let currentLang = 'th'; // ตัวแปรคุมภาษาหลัก
let idleTimer; 
const IDLE_TIME_LIMIT = 30000; 

let video = document.getElementById('video');
let cocoModel = null; 
let isDetecting = true; 
let hasGreeted = false;
let personInFrameTime = null; 
let isBusy = false; 

// 1. เริ่มต้นระบบ
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            cocoModel = await cocoSsd.load();
            resetToHome();
            renderFAQButtons();
            initCamera(); 
        }
    } catch (e) {
        console.error("System Load Error:", e);
    }
}

// 2. ระบบ Reset หน้าจอ
function resetToHome() {
    if (window.speechSynthesis.speaking || personInFrameTime !== null) {
        restartIdleTimer(); 
        return;
    }
    window.speechSynthesis.cancel(); 
    const welcomeMsg = currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.";
    displayResponse(welcomeMsg);
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
            video.onloadedmetadata = () => { video.play(); requestAnimationFrame(detectPerson); };
        }
    } catch (err) { console.warn("Camera Error:", err); }
}

async function detectPerson() {
    if (!isDetecting || isBusy || !cocoModel) { requestAnimationFrame(detectPerson); return; }
    const predictions = await cocoModel.detect(video);
    const person = predictions.find(p => {
        const [x, y, width, height] = p.bbox;
        return p.class === "person" && p.score > 0.65 && width > 160;
    });
    if (person) {
        restartIdleTimer(); 
        if (personInFrameTime === null) personInFrameTime = Date.now();
        else if (Date.now() - personInFrameTime >= 2000 && !hasGreeted) greetUser();
    } else if (personInFrameTime !== null && (Date.now() - personInFrameTime > 4000)) {
        personInFrameTime = null;
        hasGreeted = false;
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (hasGreeted || isBusy) return; 
    isBusy = true; 
    const greetings = {
        th: ["สวัสดีครับ มีอะไรให้น้องนำทางช่วยไหมครับ?", "สำนักงานขนส่งสวัสดีครับ สอบถามข้อมูลกับผมได้นะครับ"],
        en: ["Hello! How can I help you today?", "Welcome! Please feel free to ask any questions."]
    };
    const selected = greetings[currentLang] || greetings['th'];
    const randomGreeting = selected[Math.floor(Math.random() * selected.length)];
    displayResponse(randomGreeting);
    speak(randomGreeting);
    hasGreeted = true; 
}

// 4. ค้นหาคำตอบ (Step 3) และ บันทึก Log ลงคอลัมน์ C (นับสถิติ Col E)
async function getResponse(userQuery) {
    console.log(`DEBUG: [Search] รับคำถาม -> "${userQuery}" (${currentLang})`);
    isBusy = true;
    window.speechSynthesis.cancel(); 

    // --- 1. บันทึกคำถามลงคอลัมน์ C ใน Google Sheets ---
    if (userQuery && userQuery.trim() !== "") {
        fetch(`${GAS_URL}?query=${encodeURIComponent(userQuery.trim())}&action=logOnly`, { 
            mode: 'no-cors' 
        }).catch(err => console.warn("บันทึก FAQ ล้มเหลว:", err));
    }

    if (!localDatabase) {
        displayResponse(currentLang === 'th' ? "กรุณารอสักครู่..." : "Please wait...");
        isBusy = false; 
        return;
    }

    restartIdleTimer(); 
    hasGreeted = true; 
    
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    // --- 2. วนลูปหาข้อมูลจากทุกหน้า (ยกเว้นหน้าที่ไม่ใช่เนื้อหา) ---
    Object.keys(localDatabase).forEach(sheetName => {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;

        localDatabase[sheetName].forEach((item) => {
            // item[0] = Keywords/หัวข้อ
            const rawKey = item[0] ? item[0].toString().toLowerCase().trim() : "";
            if (!rawKey) return;

            // --- ส่วนสำคัญ: การเลือกคำตอบตามภาษาและเงื่อนไขค่าว่าง ---
            let ans = "";
            if (currentLang === 'th') {
                // ภาษาไทย: ดึงจาก item[1]
                ans = item[1] ? item[1].toString().trim() : "ขออภัยครับ ไม่พบข้อมูลเนื้อหาภาษาไทย";
            } else {
                // ภาษาอังกฤษ: ดึงจาก item[2]
                const engAns = item[2] ? item[2].toString().trim() : "";
                
                // เงื่อนไขของคุณ: ถ้าภาษาอังกฤษว่าง ให้ตอบขออภัยเป็นภาษาอังกฤษ
                ans = (engAns !== "") ? engAns : "I'm sorry, I couldn't find information on this topic in English. Please contact the officer at the counter.";
            }

            // --- 3. ตรรกะการหา Keyword (อ้างอิงจากโค้ดเดิมที่ดึงถูก) ---
            const keywordsArray = rawKey.split(/\s+/); 
            keywordsArray.forEach(key => {
                if (key.length <= 2) return; 

                let currentScore = 0;
                if (query.includes(key)) {
                    currentScore = 0.9 + (key.length / 100); 
                } else {
                    currentScore = calculateSimilarity(query, key);
                }

                if (currentScore > bestMatch.score) {
                    bestMatch = { answer: ans, score: currentScore };
                }
            });
        });
    });

    // --- 4. แสดงผลลัพธ์ ---
    if (bestMatch.score >= 0.45) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        // กรณีหา Keyword ไม่เจอเลย
        const fallback = (currentLang === 'th') 
            ? "ขออภัยครับ น้องนำทางไม่พบข้อมูลเรื่องนี้ กรุณาติดต่อเจ้าหน้าที่ที่เคาท์เตอร์ครับ" 
            : "I'm sorry, I couldn't find any information on this topic. Please contact the officer at the counter.";
        displayResponse(fallback);
        speak(fallback);
    }
}

// 5. ปรับปรุง FAQ (Col A: ไทย | Col B: อังกฤษ)
function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase["FAQ"]) return;
    
    // 1. ล้างปุ่มเดิมออกให้หมดก่อน
    container.innerHTML = "";

    // 2. วนลูปตามจำนวนแถวที่มีใน Sheets (ไม่จำกัดจำนวนปุ่มในอนาคต)
    localDatabase["FAQ"].slice(1).forEach((row) => {
        // คอลัมน์ A (index 0) = ไทย | คอลัมน์ B (index 1) = อังกฤษ
        const qThai = row[0] ? row[0].toString().trim() : "";
        const qEng  = row[1] ? row[1].toString().trim() : "";

        // 3. ดึงค่าจาก "คอลัมน์เดียว" ที่ตรงกับภาษาที่เลือกเท่านั้น
        // ไม่มีการใช้ || row[0] เพื่อป้องกันภาษาไทยมาปนในโหมด EN
        let btnText = (currentLang === 'th') ? qThai : qEng;
        
        // 4. เงื่อนไขสำคัญ: สร้างปุ่มเฉพาะเมื่อคอลัมน์นั้นมีข้อมูลเท่านั้น
        if (btnText !== "") {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = btnText;
            
            // เมื่อคลิก: ส่งไปหาคำตอบ (3 แถว) และบันทึก Log ลง Col C ทันที
            btn.onclick = () => {
                if (typeof getResponse === "function") {
                    getResponse(btnText);
                }
            };
            
            container.appendChild(btn);
        }
    });
}

// 6. ระบบเสียงและการแสดงผล
function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    
    // ตั้งค่าภาษาและเสียงตาม currentLang
    msg.lang = (currentLang === 'th') ? 'th-TH' : 'en-US';
    const voices = window.speechSynthesis.getVoices();
    if (currentLang === 'th') {
        msg.voice = voices.find(v => v.name.includes('Achara')) || voices.find(v => v.name.includes('Google ภาษาไทย'));
    } else {
        msg.voice = voices.find(v => v.name.includes('Google US English')) || voices.find(v => v.name.includes('English'));
    }

    msg.onstart = () => updateLottie('talking');
    msg.onend = () => { updateLottie('idle'); isBusy = false; restartIdleTimer(); };
    window.speechSynthesis.speak(msg);
}

function updateLottie(state) {
    const player = document.querySelector('lottie-player');
    if (!player || !localDatabase || !localDatabase["Lottie_State"]) return;
    const match = localDatabase["Lottie_State"].find(row => row[0]?.toString().toLowerCase().trim() === state.toLowerCase().trim());
    if (match && match[1]) player.src = match[1];
}

function displayResponse(text) {
    const box = document.getElementById('response-text') || document.getElementById('output');
    if (box) { box.innerText = text; box.style.opacity = 1; }
}

// 7. คำนวณความคล้ายคลึง
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
