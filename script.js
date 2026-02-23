let localDatabase = null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbx2nrJ9FDn6m4azBvQycHM57rBfrZWMwwcBuejvb1m912r7ijAd6AOvFUxjqR7VClV3Rg/exec"; 

// 1. โหลดคลังข้อมูลทันทีที่เปิดหน้าเว็บ
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            localDatabase = json.database;
            console.log("น้องนำทาง: คลังข้อมูลพร้อมใช้งาน (รันระบบพึ่งพาตัวเอง)");
        }
    } catch (e) {
        console.error("Database Load Error:", e);
    }
}

// 2. ฟังก์ชันคำนวณความเหมือน (Fuzzy Matching) - ช่วยให้พิมพ์ผิดก็ยังหาเจอ
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
                if (!key) continue;

                let score = 0;
                // ถ้ามีคำสำคัญอยู่ในประโยค (Keyword Match)
                if (query.includes(key) || key.includes(query)) {
                    score = 0.9; 
                } else {
                    // ถ้าไม่ตรงเป๊ะ ให้คำนวณความเหมือน (Fuzzy Match)
                    score = calculateSimilarity(query, key);
                }

                if (score > bestMatch.score) {
                    bestMatch = { answer: answers[i], score: score };
                }
            }
        }
    });

    // แสดงผล (เกณฑ์คะแนน 0.45 คือความเหมือนที่ยอมรับได้)
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

// เริ่มต้นโหลดฐานข้อมูล
initDatabase();
