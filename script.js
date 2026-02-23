/**
 * สมองกลน้องนำทาง - ฉบับปรับปรุงตามโครงสร้าง JSON จริง
 * ระบบพึ่งพาตัวเอง 100% ไม่ต้องผ่าน AI เพื่อความเสถียรบนมือถือ
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbzNIrKYpb8OeoLXTlso7xtb4Ir2aeL4uSOjtzZejf8K8wVfmCWcOsGmQsAPPAb8L9Coew/exec"; 

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
                welcomeBox.innerText = "กดที่ปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยค่ะ";
            }
            // อัปเดต Lottie เป็นท่าทางปกติ
            updateLottie('idle');
            // เรียกสร้างปุ่ม FAQ ทันทีที่โหลดข้อมูลเสร็จ
            renderFAQButtons();
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

    // 1. บันทึกคำถามลงคอลัมน์ B (ส่งแบบเงียบๆ ไม่ต้องรอผล)
    fetch(`${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`, { mode: 'no-cors' }).catch(e => {});

    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    // 2. ค้นหาเฉพาะหมวดที่เลือก และ KnowledgeBase เท่านั้น (ช่วยให้เร็วขึ้นมาก)
    const targets = [category, "KnowledgeBase"];

    targets.forEach(cat => {
        if (localDatabase[cat]) {
            const data = localDatabase[cat]; 
            // โครงสร้าง: [ [คำถาม1, คำตอบ1], [คำถาม2, คำตอบ2] ]
            data.forEach((row, index) => {
                if (index === 0) return; // ข้ามหัวตาราง

                const key = row[0] ? row[0].toString().toLowerCase().trim() : "";
                const ans = row[1] ? row[1].toString().trim() : "";

                if (!key || !ans) return;

                let score = 0;
                // ตรวจสอบคีย์เวิร์ด (Keyword Match)
                if (query.includes(key) || key.includes(query)) {
                    score = 0.95; 
                } else {
                    // ถ้าไม่ตรงเป๊ะ ใช้ Fuzzy Search
                    score = calculateSimilarity(query, key);
                }

                if (score > bestMatch.score) {
                    bestMatch = { answer: ans, score: score };
                }
            });
        }
    });

    // 3. แสดงผล (ใช้เกณฑ์ 40% ขึ้นไป)
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


    // 4. แสดงผลและสั่งงานเสียง
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
    // 1. หยุดเสียงเก่าทันที
    window.speechSynthesis.cancel(); 

    // 2. ใช้การจัดการข้อความแบบน้อยที่สุด (ตามโค้ดที่คุณส่งมาว่าใช้ได้)
    const cleanText = text.replace(/[*#-]/g, ""); 
    const msg = new SpeechSynthesisUtterance(cleanText);
    msg.lang = 'th-TH';

    // 3. เมื่อเริ่มพูดให้เปลี่ยนท่าทางเป็น 'talking'
    msg.onstart = () => {
        updateLottie('talking');
    };

    // 4. เมื่อพูดจบให้กลับเป็นท่าทางปกติ 'idle'
    msg.onend = () => {
        updateLottie('idle');
    };

    // 5. สั่งให้พูดทันที (แบบโค้ดเก่าที่คุณใช้)
    window.speechSynthesis.speak(msg);
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

// ฟังก์ชันสร้างปุ่มจากชีต FAQ คอลัมน์ A
function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase || !localDatabase["FAQ"]) return;
    
    container.innerHTML = "";
    
    localDatabase["FAQ"].forEach((row, index) => {
        if (index === 0 || !row[0]) return; // ข้ามหัวตารางและแถวว่าง
        
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.innerText = row[0];

        // *** จุดสำคัญ: สั่งให้ทำงานเหมือนการพิมพ์ถาม หรือพูดถาม ***
        btn.onclick = () => {
            // ส่งข้อความบนปุ่มเข้าสู่ฟังก์ชันหลัก processQuery 
            // ซึ่งจะไปเรียก getResponse ตามหมวดหมู่ที่เลือกไว้อยู่แล้ว
            processQuery(row[0]); 
        };
        
        container.appendChild(btn);
    });
}

// เริ่มต้นโหลดฐานข้อมูลเมื่อเปิดหน้าเว็บ
initDatabase();

