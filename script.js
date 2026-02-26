* สมองกลน้องนำทาง - ฉบับปรับปรุง (AI Object Detection & Bilingual Integration)
 
let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

// --- ตัวแปรระบบ ---
let currentLang = 'th'; // ตัวแปรคุมภาษาหลัก
let idleTimer; 
const IDLE_TIME_LIMIT = 30000; 
let lastSeenTime = 0;
let video = document.getElementById('video');
let cocoModel = null; 
let isDetecting = true; 
let hasGreeted = false;
let personInFrameTime = null; 
let isBusy = false; 
let lastGreeting = "";

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
    // แก้ไข: ถ้ากำลังพูดอยู่ หรือ AI ยังเห็นคนยืนอยู่หน้าตู้ 
    // ให้ต่อเวลา (Restart Timer) ไปเรื่อยๆ และ "ห้าม" รีเซ็ต hasGreeted
    if (window.speechSynthesis.speaking || personInFrameTime !== null) {
        restartIdleTimer(); 
        return;
    }

    // ส่วนนี้จะทำงานเฉพาะเมื่อ "ไม่มีคนอยู่จริงๆ" เท่านั้น
    window.speechSynthesis.cancel(); 
    const welcomeMsg = currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.";
    displayResponse(welcomeMsg);
    updateLottie('idle');
    
    isBusy = false; 
    hasGreeted = false; // รีเซ็ตตรงนี้ปลอดภัย เพราะคนเดินออกไปแล้ว
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
        restartIdleTimer(); // ยื้อเวลา Idle ไว้ ไม่ให้หน้าจอกลับหน้าโฮม
        
        if (personInFrameTime === null) {
            personInFrameTime = Date.now();
        } 
        
        // ยืนแช่ 5 วินาทีค่อยทัก (ตามโค้ดคุณ) และต้องยังไม่ได้ทัก
        if (Date.now() - personInFrameTime >= 5000 && !hasGreeted) {
            greetUser();
        }
        
        // เก็บเวลาล่าสุดที่เห็นคนไว้
        lastSeenTime = Date.now(); 

    } else {
        // แก้ไข: ถ้าไม่เจอคน ให้รอจนแน่ใจว่าเขาไปแล้วจริงๆ (เช่น 10-15 วินาที)
        // เพื่อไม่ให้ hasGreeted ดีดกลับเป็น false เร็วเกินไปจนทักซ้ำคนเดิม
        if (personInFrameTime !== null && (Date.now() - lastSeenTime > 15000)) { 
            console.log("DEBUG: Person actually left. Resetting...");
            personInFrameTime = null;
            hasGreeted = false;
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (hasGreeted || isBusy) return; 
    isBusy = true; 

    // --- ส่วนเช็คช่วงเวลา ---
    const hour = new Date().getHours();
    let timeGreetingTH = "สวัสดีครับ";
    let timeGreetingEN = "Good day";

    if (hour < 12) {
        timeGreetingTH = "สวัสดีตอนเช้าครับ";
        timeGreetingEN = "Good morning";
    } else if (hour < 18) {
        timeGreetingTH = "สวัสดีตอนบ่ายครับ";
        timeGreetingEN = "Good afternoon";
    }

    // --- รายการประโยคทักทาย ---
    const greetings = {
        th: [
            `${timeGreetingTH} มีอะไรให้น้องนำทางช่วยไหมครับ?`,
            "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีครับ สอบถามข้อมูลกับน้องนำทางได้นะครับ",
            "สอบถามข้อมูลเบื้องต้นกับน้องนำทางได้นะครับ"
        ],
        en: [
            `${timeGreetingEN}! How can I help you today?`,
            "Welcome! Please feel free to ask any questions.",
            "Please feel free to ask me for any basic information."
        ]
    };
    
    const selectedList = greetings[currentLang] || greetings['th'];
    let randomGreeting;

    // --- ตรรกะการสุ่มแบบห้ามซ้ำคำล่าสุด ---
    if (selectedList.length > 1) {
        do {
            randomGreeting = selectedList[Math.floor(Math.random() * selectedList.length)];
        } while (randomGreeting === lastGreeting); // ถ้าสุ่มได้คำเดิม ให้สุ่มใหม่จนกว่าจะเปลี่ยนคำ
    } else {
        randomGreeting = selectedList[0];
    }

    // บันทึกคำที่เพิ่งพูดไป เพื่อใช้เช็คในรอบถัดไป
    lastGreeting = randomGreeting;

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
