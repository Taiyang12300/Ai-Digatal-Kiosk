/**
 * สมองกลน้องนำทาง - ฉบับสมบูรณ์ (Hybrid Search)
 * ทำงานบนเครื่องผู้ใช้ 100% เสถียรทั้งคอมและมือถือ
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbxESGw9im7q8wHms4SyFq97gKX572A5cXkIVMgEX8DxqbGQgKq9wu3YITZvyVFbJBxgUA/exec"; // *** อย่าลืมเปลี่ยนเป็นลิงก์ Web App ของคุณ ***

// 1. โหลดคลังข้อมูลทันทีที่เปิดหน้าเว็บ
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("น้องนำทาง: คลังข้อมูลพร้อมใช้งาน (รันระบบพึ่งพาตัวเอง)");
            // ถ้ามีข้อความต้อนรับในหน้าเว็บ ให้แสดงผลเมื่อโหลดเสร็จ
            if(document.getElementById('response-text')) {
                console.log("Database Sync: Success");
            }
        }
    } catch (e) {
        console.error("Database Load Error:", e);
    }
}

// 2. ฟังก์ชันคำนวณความเหมือน (Fuzzy Matching)
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

// 3. ฟังก์ชันหลักในการค้นหาคำตอบ (ทำงานแทน AI)
async function getResponse(userQuery, category) {
    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลค่ะ...");
        return;
    }

    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    // ค้นหาทั้งในหมวดที่เลือก และใน KnowledgeBase ทั่วไป
    const targets = [category, "KnowledgeBase"];

    targets.forEach(cat => {
        if (localDatabase[cat]) {
            const data = localDatabase[cat];
            const keywords = data[0]; // แถว 1: คำถาม/คีย์เวิร์ด
            const answers = data[1];  // แถว 2: คำตอบ

            for (let i = 0; i < keywords.length; i++) {
                const key = keywords[i].toString().toLowerCase().trim();
                if (!key || key === "คำถาม") continue; // ข้ามหัวตาราง

                let score = 0;
                if (query.includes(key) || key.includes(query)) {
                    score = 0.95; 
                } else {
                    score = calculateSimilarity(query, key);
                }

                if (score > bestMatch.score) {
                    bestMatch = { answer: answers[i], score: score };
                }
            }
        }
    });

    if (bestMatch.score >= 0.45) {
        updateLottie('talking');
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยค่ะ น้องนำทางยังไม่มีข้อมูลเรื่องนี้ในระบบ กรุณาสอบถามเจ้าหน้าที่ประชาสัมพันธ์นะคะ";
        displayResponse(fallback);
        speak(fallback);
    }
}

// 4. ฟังก์ชันแสดงข้อความบนหน้าจอ
function displayResponse(text) {
    const box = document.getElementById('response-text');
    if (box) {
        box.innerText = text;
        // เอฟเฟกต์ Fade In
        box.style.opacity = 0;
        setTimeout(() => { box.style.opacity = 1; }, 50);
    }
}

// 5. ฟังก์ชันเสียงพูด (รองรับมือถือ)
function speak(text) {
    window.speechSynthesis.cancel(); // หยุดเสียงเก่าก่อน
    
    // ลบสัญลักษณ์พิเศษเพื่อให้เสียงไม่อ่านสะดุด
    const cleanText = text.replace(/[*#-_]/g, "").trim();
    const msg = new SpeechSynthesisUtterance(cleanText);
    msg.lang = 'th-TH';

    // เลือกเสียงภาษาไทย
    const voices = window.speechSynthesis.getVoices();
    const thaiVoice = voices.find(v => v.lang === 'th-TH' && v.name.includes('Google')) || 
                      voices.find(v => v.lang === 'th-TH');
    
    if (thaiVoice) msg.voice = thaiVoice;
    msg.rate = 1.1; // ความเร็วในการพูด

    // เมื่อพูดจบให้กลับเป็นท่าทางปกติ
    msg.onend = () => updateLottie('idle');

    // ต้องใช้ Timeout เล็กน้อยเพื่อให้เบราว์เซอร์มือถือยอมรับ
    setTimeout(() => {
        window.speechSynthesis.speak(msg);
    }, 200);
}

// 6. ฟังก์ชันเปลี่ยนท่าทาง Lottie
function updateLottie(state) {
    const player = document.querySelector('lottie-player');
    if (!player) return;

    // ถ้าฐานข้อมูลโหลดมาแล้ว ให้ดึง URL จาก Sheet
    if (localDatabase && localDatabase["Lottie_State"]) {
        const data = localDatabase["Lottie_State"];
        const match = data.find(row => row[0].toString().toLowerCase() === state.toLowerCase());
        if (match) {
            player.load(match[1]);
            return;
        }
    }
    
    // ถ้ายังโหลดฐานข้อมูลไม่เสร็จ ให้ขยับความเร็วแทน
    state === 'talking' ? player.setSpeed(1.5) : player.setSpeed(1.0);
}

// เริ่มต้นโหลดฐานข้อมูล
initDatabase();
