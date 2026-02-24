/**
 * สมองกลน้องนำทาง - ฉบับปรับปรุง (Horizontal Search + Idle Reset)
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbzNIrKYpb8OeoLXTlso7xtb4Ir2aeL4uSOjtzZejf8K8wVfmCWcOsGmQsAPPAb8L9Coew/exec"; 

// --- ส่วนที่เพิ่ม: ระบบ Idle Timeout (รีเซ็ตหน้าจอ) ---
let idleTimer; 
const IDLE_TIME_LIMIT = 120000; // 2 นาที (หน่วยมิลลิวินาที)

function resetToHome() {
    console.log("น้องนำทาง: รีเซ็ตสถานะหน้าจอเริ่มต้น");
    window.speechSynthesis.cancel(); // หยุดเสียง
    displayResponse("กดที่ปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยค่ะ");
    updateLottie('idle');
}

function restartIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

// ตรวจจับการแตะหน้าจอเพื่อเริ่มนับเวลาใหม่
window.addEventListener('mousedown', restartIdleTimer);
// ----------------------------------------------

// 1. โหลดคลังข้อมูล
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("น้องนำทาง: คลังข้อมูลพร้อมใช้งาน");
            resetToHome();
            renderFAQButtons();
        }
    } catch (e) {
        console.error("Database Load Error:", e);
    }
}

// 2. ฟังก์ชันคำนวณความเหมือน (Levenshtein Distance)
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

// 3. ฟังก์ชันหลักในการค้นหาคำตอบ (ปรับปรุงการค้นหาแนวนอนทุกคอลัมน์)
async function getResponse(userQuery) {
    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลค่ะ...");
        return;
    }

    restartIdleTimer(); // เริ่มนับเวลาถอยหลังใหม่
    fetch(`${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`, { mode: 'no-cors' }).catch(e => {});

    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };
    let foundExact = false;

    const allSheetNames = Object.keys(localDatabase); 

    for (const sheetName of allSheetNames) {
        if (sheetName === "Lottie_State" || sheetName === "Config" || sheetName === "FAQ") continue; 
        if (foundExact) break;

        const data = localDatabase[sheetName]; 
        
        // แก้ไข: ตรวจสอบข้อมูลแถว 1 (คำถาม) และแถว 2 (คำตอบ)
        if (data && data[0] && data[1]) {
            const questions = data[0]; 
            const answers = data[1];

            // วนลูปจาก j = 0 เพื่อให้อ่านตั้งแต่คอลัมน์ A (ข้อมูลแรก)
            for (let j = 0; j < questions.length; j++) {
                const key = questions[j] ? questions[j].toString().toLowerCase().trim() : "";
                const ans = answers[j] ? answers[j].toString().trim() : "";

                if (!key || !ans) continue;

                let score = 0;
                if (query.includes(key) || key.includes(query)) {
                    score = 0.95; 
                    foundExact = true;
                } else {
                    score = calculateSimilarity(query, key);
                }

                if (score > bestMatch.score) {
                    bestMatch = { answer: ans, score: score };
                }
                if (foundExact) break;
            }
        }
    }

    if (bestMatch.score >= 0.40) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยค่ะ น้องนำทางยังไม่มีข้อมูลเรื่องนี้ในระบบ กรุณาสอบถามเจ้าหน้าที่ประชาสัมพันธ์นะคะ";
        displayResponse(fallback);
        speak(fallback);
    }
}

// 4. แสดงผลข้อความ
function displayResponse(text) {
    const box = document.getElementById('response-text') || document.getElementById('output');
    if (box) {
        box.innerText = text;
        box.style.opacity = 0;
        setTimeout(() => { box.style.opacity = 1; }, 50);
    }
}

// 5. ระบบเสียง (ปรับปรุงการหยุดเสียงเก่าและนับเวลา Idle ใหม่)
function speak(text) {
    window.speechSynthesis.cancel(); // หยุดเสียงเก่าทันที

    const cleanText = text.replace(/[*#-]/g, ""); 
    const msg = new SpeechSynthesisUtterance(cleanText);
    msg.lang = 'th-TH';

    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => 
        (v.lang === 'th-TH' || v.lang === 'th_TH') && 
        (v.name.includes('Google') || v.name.includes('Narisa') || v.name.includes('Premium') || v.name.includes('Hemlata'))
    );
    if (femaleVoice) msg.voice = femaleVoice;

    msg.pitch = 1.05; 
    msg.rate = 1.0; 

    msg.onstart = () => {
        updateLottie('talking');
        restartIdleTimer(); // รีเซ็ตเวลาขณะเริ่มพูด
    };
    msg.onend = () => {
        updateLottie('idle');
        restartIdleTimer(); // รีเซ็ตเวลาเมื่อพูดจบ
    };

    window.speechSynthesis.speak(msg);
}

// 6. เปลี่ยนท่าทาง Lottie (รองรับการหาจาก Sheet)
function updateLottie(state) {
    const player = document.querySelector('lottie-player') || document.getElementById('lottie-canvas');
    if (!player) return;

    if (localDatabase && localDatabase["Lottie_State"]) {
        const data = localDatabase["Lottie_State"];
        // ค้นหาสถานะในแนวตั้งปกติสำหรับ Lottie_State
        const match = data.find(row => row[0] && row[0].toString().toLowerCase() === state.toLowerCase());
        if (match && match[1] && match[1].includes('http')) {
            player.load(match[1]);
            return;
        }
    }
    state === 'talking' ? player.setSpeed(1.5) : player.setSpeed(1.0);
}

// 7. สร้างปุ่ม FAQ (ดึงหัวข้อจากแถวแรกแนวนอน)
function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase || !localDatabase["FAQ"]) return;
    container.innerHTML = "";
    
    // ดึงเฉพาะแถวแรกมาทำปุ่ม
    const faqRow = localDatabase["FAQ"][0]; 
    if (faqRow) {
        faqRow.forEach((topic) => {
            if (!topic) return; 
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = topic;
            btn.onclick = () => getResponse(topic);
            container.appendChild(btn);
        });
    }
}

// เริ่มต้นระบบ
initDatabase();

window.speechSynthesis.onvoiceschanged = () => {
    console.log("Voice list updated");
};
