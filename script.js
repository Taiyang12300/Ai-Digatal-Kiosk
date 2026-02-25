/**
 * สมองกลน้องนำทาง - ฉบับปรับปรุง (AI Object Detection Integration)
 * แทนที่ระบบ Pixel Diff ด้วย COCO-SSD เพื่อความแม่นยำในการทักทายคน
 */

let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbyoqeKLGpfGLIAO6d9nv0BkLers7PgezkPeuqZQxTvOlkBm5Atp-yMXxq_fpK806NLbNA/exec"; 

// --- ตัวแปรระบบ ---
let idleTimer; 
const IDLE_TIME_LIMIT = 60000; 
let lastMotionTime = Date.now(); 

let video = document.getElementById('video');
let cocoModel = null; // เพิ่มตัวแปรเก็บโมเดล AI
let isDetecting = true; 
let hasGreeted = false;
let personInFrameTime = null; // เวลาที่เริ่มพบคนในกล้อง
const DETECTION_THRESHOLD = 5000; // ต้องเห็นคนนาน 5 วินาทีถึงจะทัก (ป้องกันคนเดินผ่านไวๆ)
let isBusy = false; 

// 1. เริ่มต้นระบบและโหลดคลังข้อมูล + โหลด AI
async function initDatabase() {
    console.log("DEBUG: [Init] กำลังโหลดฐานข้อมูล และ สมองกล AI...");
    try {
        // โหลดข้อมูลจาก Google Sheets
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("DEBUG: [Init] คลังข้อมูลพร้อมใช้งาน");
            
            // โหลด COCO-SSD ต่อทันที
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
    // 1. ตรวจสอบว่าน้องยังพูดไม่จบใช่หรือไม่? 
    // หากกำลังพูดอยู่ (Speaking) ให้เริ่มนับเวลา Idle ใหม่อีกครั้ง และหยุดการรีเซ็ต
    if (window.speechSynthesis.speaking) {
        console.log("DEBUG: [System] ยังพูดไม่จบ เลื่อนการรีเซ็ตออกไป");
        restartIdleTimer(); 
        return;
    }

    // 2. ตรวจสอบว่า AI ยังตรวจจับคนได้อยู่ในช่วง 5 วินาทีล่าสุดหรือไม่?
    // ถ้ายังมีคนยืนอยู่ (personInFrameTime ไม่เป็น null) ให้เริ่มนับเวลา Idle ใหม่อีกครั้ง
    if (personInFrameTime !== null) {
        console.log("DEBUG: [System] ยังมีคนอยู่หน้าตู้ เลื่อนการรีเซ็ตออกไป");
        restartIdleTimer();
        return;
    }

    // --- ถ้าผ่านเงื่อนไขด้านบนมาได้ (ไม่มีคนอยู่และพูดจบแล้ว) ถึงจะทำการรีเซ็ตจริงๆ ---
    console.log("DEBUG: [System] รีเซ็ตหน้าจอเริ่มต้น");
    window.speechSynthesis.cancel(); 
    displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
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
                console.log("DEBUG: [Camera] ระบบดวงตา AI เริ่มทำงาน");
                requestAnimationFrame(detectPerson); // เปลี่ยนมาใช้ฟังก์ชันตรวจจับคน
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
        
        // --- ส่วนจูนระยะ (Distance Tuning) ---
        // เนื่องจากจอความละเอียด 320px
        // ถ้าคนยืนใกล้ตู้ (ระยะ 1-1.5 เมตร) ความกว้าง (width) ควรจะอยู่ที่ 150-200px
        const isNear = width > 160; 

        // --- ส่วนจูนพื้นที่ (Position Tuning) ---
        // กล้องอยู่ด้านข้าง คนจะยืนอยู่กลางเฟรมหรือค่อนไปฝั่งหนึ่ง
        // เราจะทักเฉพาะคนที่ยืนอยู่ในช่วง 20% ถึง 80% ของหน้าจอ เพื่อตัดคนเดินผ่านขอบๆ
        const centerX = x + (width / 2);
        const isInRange = centerX > (320 * 0.2) && centerX < (320 * 0.8);

        return p.class === "person" && p.score > 0.65 && isNear && isInRange;
    });

    if (person) {
        // เพิ่มบรรทัดนี้เพื่อเชื่อมกับระบบ Idle Timer ที่เราแก้กันก่อนหน้า
        restartIdleTimer(); 

        if (personInFrameTime === null) {
            personInFrameTime = Date.now();
            console.log(`DEBUG: [AI] พบคน (Width: ${Math.round(person.bbox[2])}px)`);
        } else {
            const duration = Date.now() - personInFrameTime;
            // ต้องยืนแช่หน้าตู้ 2 วินาที ถึงจะทัก (ป้องกันคนเดินตัดหน้ากล้อง)
            if (duration >= 2000 && !hasGreeted) {
                console.log("DEBUG: [AI] ยืนยันพบคนในระยะ -> ทักทาย");
                greetUser();
            }
        }
    } else {
        // ถ้าคนเดินถอยออกไปจนตัวเล็ก หรือหายไปจากเฟรมเกิน 4 วินาที
        if (personInFrameTime !== null && (Date.now() - personInFrameTime > 4000)) {
            personInFrameTime = null;
            hasGreeted = false;
            console.log("DEBUG: [AI] คนเดินออกไปแล้ว");
        }
    }

    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (hasGreeted || isBusy) return; 
    
    isBusy = true; 
    console.log("DEBUG: [Greet] ทักทายลูกค้า");

    const greetings = [
        "สวัสดีครับ มีอะไรให้น้องนำทางช่วยไหมครับ?",
        "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีครับ สอบถามข้อมูลการทำใบขับขี่กับผมได้นะครับ",
        "สวัสดีครับ เชิญสอบถามข้อมูลที่ต้องการได้เลยครับ"
        ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    displayResponse(randomGreeting);
    speak(randomGreeting);

    hasGreeted = true; 
}

// 4. ฟังก์ชันค้นหาคำตอบ (getResponse) และ 5-7 (Similarity, Display, Speak, FAQ)

function displayResponse(text) {
    const box = document.getElementById('response-text') || document.getElementById('output');
    if (box) {
        box.innerText = text;
        box.style.opacity = 1;
    }
}

async function getResponse(userQuery) {
    console.log(`DEBUG: [Search] รับคำถาม -> "${userQuery}"`);
    isBusy = true;
    window.speechSynthesis.cancel(); 

    // --- ส่วนบันทึก FAQ ลง Google Sheets ---
    if (userQuery && userQuery.trim() !== "") {
        fetch(`${GAS_URL}?query=${encodeURIComponent(userQuery.trim())}&action=logOnly`, { 
            mode: 'no-cors' 
        }).catch(err => console.warn("บันทึก FAQ ล้มเหลว:", err));
    }

    if (!localDatabase) {
        displayResponse("กรุณารอสักครู่ น้องนำทางกำลังเตรียมข้อมูลครับ...");
        isBusy = false; 
        return;
    }

    restartIdleTimer(); 
    hasGreeted = true; 
    
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    // --- ส่วนที่ปรับปรุงใหม่: วนลูปหา Keyword แบบแยกคำ (Split) ---
    Object.keys(localDatabase).forEach(sheetName => {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;

        localDatabase[sheetName].forEach((item) => {
            // item[0] คือ แถวบน (Keywords), item[1] คือ แถวล่าง (Answer)
            const rawKey = item[0] ? item[0].toString().toLowerCase().trim() : "";
            const ans = item[1] ? item[1].toString().trim() : "";
            if (!rawKey || !ans) return;

            // หั่นคำใน Header ออกเป็น Array (เช่น "เสริมคอก เสริมหลังคา" -> ["เสริมคอก", "เสริมหลังคา"])
            const keywordsArray = rawKey.split(/\s+/); 
            
            keywordsArray.forEach(key => {
                if (key.length <= 2) return; // ข้ามคำที่สั้นเกินไป

                let currentScore = 0;
                
                // 1. ถ้าสิ่งที่ผู้ใช้พูด มีคำคีย์เวิร์ดนี้อยู่ (ความแม่นยำสูง)
                if (query.includes(key)) {
                    currentScore = 0.9 + (key.length / 100); // ให้คะแนนสูงตามความยาวคำ
                } 
                // 2. ถ้าไม่เจอตรงๆ ให้ใช้ Similarity เดิมช่วย
                else {
                    currentScore = calculateSimilarity(query, key);
                }

                if (currentScore > bestMatch.score) {
                    bestMatch = { answer: ans, score: currentScore };
                }
            });
        });
    });

    // แสดงคำตอบ (ปรับเกณฑ์คะแนนเล็กน้อย)
    if (bestMatch.score >= 0.45) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const fallback = "ขออภัยครับ น้องนำทางไม่พบข้อมูลเรื่องนี้ กรุณาติดต่อเจ้าหน้าที่ที่เคาท์เตอร์ครับ";
        displayResponse(fallback);
        speak(fallback);
    }
}

function calculateSimilarity(s1, s2) {
    // (ฟังก์ชันเดิมของคุณ...)
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

function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    
    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';

    // ค้นหาเสียงที่เหมาะสม (โค้ดเดิมของคุณ)
    const voices = window.speechSynthesis.getVoices();
    const bestVoice = 
        voices.find(v => v.name.includes('Achara')) || 
        voices.find(v => v.name.includes('Premwadee')) ||
        voices.find(v => v.name.includes('Google ภาษาไทย'));

    if (bestVoice) msg.voice = bestVoice;

    // --- ส่วนที่ต้องเพิ่ม/แก้ไข ---
    msg.onstart = () => {
        console.log("DEBUG: [Lottie] กำลังพูด -> เปลี่ยนเป็น talking");
        updateLottie('talking'); // สั่งให้ Lottie ขยับ
    };

    msg.onend = () => {
        console.log("DEBUG: [Lottie] พูดจบแล้ว -> กลับเป็น idle");
        updateLottie('idle'); // สั่งให้ Lottie กลับมานิ่ง
        restartIdleTimer();    // เริ่มนับเวลาถอยหลังการรีเซ็ตหน้าจอ
    };
    // --------------------------

    window.speechSynthesis.speak(msg);
}

function updateLottie(state) {
    const player = document.querySelector('lottie-player') || document.getElementById('lottie-canvas');
    if (!player || !localDatabase || !localDatabase["Lottie_State"]) return;

    const match = localDatabase["Lottie_State"].find(row => 
        row[0] && row[0].toString().toLowerCase().trim() === state.toLowerCase().trim()
    );

    if (match && match[1]) {
        if (typeof player.load === 'function') {
            player.load(match[1]);
        } else {
            player.src = match[1];
        }
    }
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !localDatabase["FAQ"]) return;
    container.innerHTML = "";
    localDatabase["FAQ"].slice(1).forEach((row) => {
        if (row[0]) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = row[0];
            btn.onclick = () => getResponse(row[0].toString());
            container.appendChild(btn);
        }
    });
}

initDatabase();
