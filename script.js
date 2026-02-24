/**
 * สมองกลน้องนำทาง - ฉบับสมบูรณ์ (รวมความเร็วและการบันทึกข้อมูล)
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbzNIrKYpb8OeoLXTlso7xtb4Ir2aeL4uSOjtzZejf8K8wVfmCWcOsGmQsAPPAb8L9Coew/exec"; 

// 1. โหลดคลังข้อมูล
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("น้องนำทาง: คลังข้อมูลพร้อมใช้งาน");
            
            const welcomeBox = document.getElementById('response-text') || document.getElementById('output');
            if (welcomeBox) {
                welcomeBox.innerText = "กดที่ปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยค่ะ";
            }
            updateLottie('idle');
            renderFAQButtons();
        }
    } catch (e) {
        console.error("Database Load Error:", e);
    }
}

// 2. ฟังก์ชันคำนวณความเหมือน
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

// 3. ฟังก์ชันหลักในการค้นหาคำตอบ
async function getResponse(userQuery, category) {
    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลค่ะ...");
        return;
    }

    // บันทึกคำถาม (Background Log)
    fetch(`${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`, { mode: 'no-cors' }).catch(e => {});

    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };
    let foundExact = false;

    const targets = [category, "KnowledgeBase"];

    for (const cat of targets) {
        if (foundExact) break;
        if (localDatabase[cat]) {
            const data = localDatabase[cat]; 
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                const key = row[0] ? row[0].toString().toLowerCase().trim() : "";
                const ans = row[1] ? row[1].toString().trim() : "";
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
        updateLottie('talking');
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยค่ะ น้องนำทางยังไม่มีข้อมูลเรื่องนี้ในระบบ กรุณาสอบถามเจ้าหน้าที่ประชาสัมพันธ์นะคะ";
        displayResponse(fallback);
        speak(fallback);
    }
}

// 4. แสดงผล
function displayResponse(text) {
    const box = document.getElementById('response-text') || document.getElementById('output');
    if (box) {
        box.innerText = text;
        box.style.opacity = 0;
        setTimeout(() => { box.style.opacity = 1; }, 50);
    }
}

// 5. สั่งงานเสียง
function speak(text) {
    // 1. หยุดเสียงเก่าทันที
    window.speechSynthesis.cancel(); 

    // 2. ทำความสะอาดสัญลักษณ์ แต่คงตัวเลขและช่องว่างไว้ครบถ้วน
    const cleanText = text.replace(/[*#-]/g, ""); 
    
    // 3. สร้างการอ่าน
    const msg = new SpeechSynthesisUtterance(cleanText);
    msg.lang = 'th-TH';

    // 4. บังคับเลือกเสียงผู้หญิง (ถ้ามีในระบบ) เพื่อความลื่นหูแบบมือถือ
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => 
        (v.lang === 'th-TH' || v.lang === 'th_TH') && 
        (v.name.includes('Google') || v.name.includes('Narisa') || v.name.includes('Premium'))
    );
    if (femaleVoice) msg.voice = femaleVoice;

    // 5. ปรับ Pitch ให้เสียงดูนุ่มนวลขึ้น (1.05 - 1.1 จะช่วยให้เสียงผู้ชายดูซอฟต์ลง หรือเสียงผู้หญิงดูใจดีขึ้น)
    msg.pitch = 1.05; 
    msg.rate = 1.0; // คงความเร็วที่ 1.0 เพื่อไม่ให้ตัวเลขถูกอ่านรวบจนข้าม

    msg.onstart = () => updateLottie('talking');
    msg.onend = () => updateLottie('idle');

    window.speechSynthesis.speak(msg);
}


// 6. เปลี่ยนท่าทาง Lottie
function updateLottie(state) {
    const player = document.querySelector('lottie-player') || document.getElementById('lottie-canvas');
    if (!player) return;

    if (localDatabase && localDatabase["Lottie_State"]) {
        const data = localDatabase["Lottie_State"];
        const match = data.find(row => row[0].toString().toLowerCase() === state.toLowerCase());
        if (match && match[1] && match[1].includes('http')) {
            player.load(match[1]);
            return;
        }
    }
    state === 'talking' ? player.setSpeed(1.5) : player.setSpeed(1.0);
}

// 7. สร้างปุ่ม FAQ
function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase || !localDatabase["FAQ"]) return;
    container.innerHTML = "";
    localDatabase["FAQ"].forEach((row, index) => {
        if (index === 0 || !row[0]) return; 
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.innerText = row[0];
        btn.onclick = () => {
            // เรียกใช้ processQuery จากไฟล์ HTML
            if (typeof processQuery === "function") {
                processQuery(row[0]); 
            } else {
                getResponse(row[0], 'KnowledgeBase');
            }
        };
        container.appendChild(btn);
    });
}

initDatabase();
// เตรียมรายการเสียงให้พร้อมใช้งานทันที
window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

