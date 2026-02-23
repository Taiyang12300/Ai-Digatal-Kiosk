/**
 * สมองกลน้องนำทาง - ฉบับปรับปรุงตามโครงสร้าง JSON จริง
 * ระบบพึ่งพาตัวเอง 100% ไม่ต้องผ่าน AI เพื่อความเสถียรบนมือถือ
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbxV8PF0SyAw3tK8WZUcyZMfBIpLmChF8sDHkWhkfUn2z9wOx2K6PxwXq1es9GJQUDTEzA/exec/exec"; 

// 1. โหลดคลังข้อมูลทันทีที่เปิดหน้าเว็บ
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("น้องนำทาง: คลังข้อมูลพร้อมใช้งาน");
            
            // เปลี่ยนข้อความต้อนรับเมื่อโหลดข้อมูลเสร็จ
            const welcomeBox = document.getElementById('response-text') || document.getElementById('output');
            if (welcomeBox) {
                welcomeBox.innerText = "โหลดข้อมูลเสร็จแล้วค่ะ พร้อมให้บริการแล้วนะคะ!";
            }
            // อัปเดต Lottie เป็นท่าทางปกติ
            updateLottie('idle');
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

// 3. ฟังก์ชันหลักในการค้นหาคำตอบ (ดึงข้อมูลจาก localDatabase ที่โหลดมา)
async function getResponse(userQuery, category) {
    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลค่ะ...");
        return;
    }

    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    // ค้นหาในหมวดที่เลือก และหมวดเสริม (KnowledgeBase)
    const targets = [category, "KnowledgeBase"];

    targets.forEach(cat => {
        if (localDatabase[cat]) {
            const data = localDatabase[cat]; 
            // โครงสร้าง JSON ของคุณคือ [ [คำถาม1, คำตอบ1, สถานะ], [คำถาม2, คำตอบ2] ]
            data.forEach((row, index) => {
                if (index === 0 && row[0] === "คำถาม") return; // ข้ามหัวตาราง

                const key = row[0] ? row[0].toString().toLowerCase().trim() : "";
                const ans = row[1] ? row[1].toString().trim() : "";

                if (!key || !ans) return;

                let score = 0;
                // ตรวจสอบว่าคำถามมีคำที่ระบุไหม (Keyword Match)
                if (query.includes(key) || key.includes(query)) {
                    score = 0.95; 
                } else {
                    // ถ้าไม่ตรงเป๊ะ ให้ใช้ Fuzzy Search
                    score = calculateSimilarity(query, key);
                }

                if (score > bestMatch.score) {
                    bestMatch = { answer: ans, score: score };
                }
            });
        }
    });

    // แสดงผล (ใช้เกณฑ์ความเหมือน 40% ขึ้นไป)
    if (bestMatch.score >= 0.40) {
        updateLottie('talking');
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยค่ะ น้องนำทางยังไม่มีข้อมูลเรื่องนี้ในระบบ กรุณาสอบถามเจ้าหน้าที่ประชาสัมพันธ์นะคะ";
        displayResponse(fallback);
        speak(fallback);
    }
}

// 4. ฟังก์ชันแสดงข้อความบนหน้าจอ (รองรับทั้ง id 'response-text' และ 'output')
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
    
    // 1. ล้างอักขระพิเศษและจัดการตัวเลข
    let cleanText = text
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "") // ล้าง "ช่องว่างที่มองไม่เห็น" ทั้งหมดออก
        .replace(/[*#-_]/g, " ")                    // ล้างสัญลักษณ์พิเศษ
        .replace(/(\d+)/g, " $1 ")                  // เว้นวรรคหน้า-หลังตัวเลขให้ชัดเจน
        .replace(/\(/g, " ")                        // ล้างวงเล็บเปิด
        .replace(/\)/g, " ")                        // ล้างวงเล็บปิด
        .trim();

    // 2. สร้างคำสั่งเสียง
    const msg = new SpeechSynthesisUtterance(cleanText);
    msg.lang = 'th-TH';

    // 3. เลือกเสียงภาษาไทยที่ฉลาดที่สุด
    const voices = window.speechSynthesis.getVoices();
    const thaiVoice = voices.find(v => v.lang === 'th-TH' && v.name.includes('Google')) || 
                      voices.find(v => v.lang === 'th-TH');
    
    if (thaiVoice) msg.voice = thaiVoice;
    
    msg.rate = 1.0; 
    msg.pitch = 1.0;

    msg.onend = () => updateLottie('idle');

    // สำหรับมือถือ/แท็บเล็ต ต้องใช้ Delay เล็กน้อย
    setTimeout(() => {
        window.speechSynthesis.speak(msg);
    }, 250);
}


// 6. ฟังก์ชันเปลี่ยนท่าทาง Lottie (ดึง URL จากฐานข้อมูล JSON)
function updateLottie(state) {
    const player = document.querySelector('lottie-player') || document.getElementById('lottie-canvas');
    if (!player) return;

    if (localDatabase && localDatabase["Lottie_State"]) {
        const data = localDatabase["Lottie_State"];
        // ค้นหาแถวที่มีชื่อ State ตรงกัน
        const match = data.find(row => row[0].toString().toLowerCase() === state.toLowerCase());
        
        if (match && match[1] && match[1].includes('http')) {
            // โหลด URL ใหม่ (ต้องเป็นลิงก์ .json ตรงๆ)
            player.load(match[1]);
            return;
        }
    }
    
    // ถ้าหาในฐานข้อมูลไม่เจอ ให้ปรับความเร็วแทน
    state === 'talking' ? player.setSpeed(1.5) : player.setSpeed(1.0);
}

// เริ่มต้นโหลดฐานข้อมูลเมื่อเปิดหน้าเว็บ
initDatabase();
