const fs = require('fs');

const jsCode = `
/* ==========================================================================
   i18n - MULTI-LANGUAGE SYSTEM
   ========================================================================== */
const languages = {
    en: { name: "English", flag: "🇬🇧", dict: { tabHome: "Home", tabTasks: "Tasks", tabSurveys: "Surveys", tabRefer: "Refer", tabRewards: "Rewards", tabWallet: "Wallet", selectLanguage: "🌐 Select Language" } },
    ru: { name: "Русский", flag: "🇷🇺", dict: { tabHome: "Главная", tabTasks: "Задания", tabSurveys: "Опросы", tabRefer: "Рефералы", tabRewards: "Награды", tabWallet: "Кошелек", selectLanguage: "🌐 Выберите язык" } },
    es: { name: "Español", flag: "🇪🇸", dict: { tabHome: "Inicio", tabTasks: "Tareas", tabSurveys: "Encuestas", tabRefer: "Referir", tabRewards: "Premios", tabWallet: "Billetera", selectLanguage: "🌐 Seleccionar idioma" } },
    hi: { name: "हिन्दी", flag: "🇮🇳", dict: { tabHome: "होम", tabTasks: "कार्य", tabSurveys: "सर्वेक्षण", tabRefer: "संदर्भ", tabRewards: "इनाम", tabWallet: "बटुआ", selectLanguage: "🌐 भाषा चुनें" } },
    id: { name: "Bahasa", flag: "🇮🇩", dict: { tabHome: "Beranda", tabTasks: "Tugas", tabSurveys: "Survei", tabRefer: "Rujuk", tabRewards: "Hadiah", tabWallet: "Dompet", selectLanguage: "🌐 Pilih Bahasa" } },
    pt: { name: "Português", flag: "🇧🇷", dict: { tabHome: "Início", tabTasks: "Tarefas", tabSurveys: "Pesquisas", tabRefer: "Indicar", tabRewards: "Prêmios", tabWallet: "Carteira", selectLanguage: "🌐 Escolha o Idioma" } },
    vi: { name: "Tiếng Việt", flag: "🇻🇳", dict: { tabHome: "Trang chủ", tabTasks: "Nhiệm vụ", tabSurveys: "Khảo sát", tabRefer: "Giới thiệu", tabRewards: "Phần thưởng", tabWallet: "Ví", selectLanguage: "🌐 Chọn Ngôn ngữ" } },
    tr: { name: "Türkçe", flag: "🇹🇷", dict: { tabHome: "Ana Sayfa", tabTasks: "Görevler", tabSurveys: "Anketler", tabRefer: "Davet", tabRewards: "Ödüller", tabWallet: "Cüzdan", selectLanguage: "🌐 Dil Seç" } },
    uk: { name: "Українська", flag: "🇺🇦", dict: { tabHome: "Головна", tabTasks: "Завдання", tabSurveys: "Опитування", tabRefer: "Реферали", tabRewards: "Нагороди", tabWallet: "Гаманець", selectLanguage: "🌐 Оберіть мову" } },
    fr: { name: "Français", flag: "🇫🇷", dict: { tabHome: "Accueil", tabTasks: "Tâches", tabSurveys: "Sondages", tabRefer: "Parrainer", tabRewards: "Récompenses", tabWallet: "Portefeuille", selectLanguage: "🌐 Choisir la langue" } },
    de: { name: "Deutsch", flag: "🇩🇪", dict: { tabHome: "Start", tabTasks: "Aufgaben", tabSurveys: "Umfragen", tabRefer: "Einladen", tabRewards: "Belohnungen", tabWallet: "Brieftasche", selectLanguage: "🌐 Sprache wählen" } },
    it: { name: "Italiano", flag: "🇮🇹", dict: { tabHome: "Home", tabTasks: "Compiti", tabSurveys: "Sondaggi", tabRefer: "Invita", tabRewards: "Premi", tabWallet: "Portafoglio", selectLanguage: "🌐 Scegli lingua" } },
    ar: { name: "العربية", flag: "🇸🇦", dict: { tabHome: "الرئيسية", tabTasks: "مهام", tabSurveys: "استطلاعات", tabRefer: "إحالة", tabRewards: "مكافآت", tabWallet: "محفظة", selectLanguage: "🌐 اختر اللغة" } },
    fa: { name: "فارسی", flag: "🇮🇷", dict: { tabHome: "خانه", tabTasks: "وظایف", tabSurveys: "نظرسنجی", tabRefer: "معرفی", tabRewards: "جوایز", tabWallet: "کیف پول", selectLanguage: "🌐 انتخاب زبان" } },
    zh: { name: "中文", flag: "🇨🇳", dict: { tabHome: "首页", tabTasks: "任务", tabSurveys: "问卷", tabRefer: "推荐", tabRewards: "奖励", tabWallet: "钱包", selectLanguage: "🌐 选择语言" } }
};

let currentLang = "en";

function initLanguage() {
    let detectLang = "en";
    if (WebApp && WebApp.initDataUnsafe && WebApp.initDataUnsafe.user) {
        const userLang = WebApp.initDataUnsafe.user.language_code;
        if (userLang && languages[userLang]) {
            detectLang = userLang;
        }
    }
    const savedLang = localStorage.getItem("th_lang");
    if (savedLang && languages[savedLang]) {
        detectLang = savedLang;
    }
    
    setLanguage(detectLang);
    renderLanguageModal();
}

function setLanguage(langCode) {
    if (!languages[langCode]) return;
    currentLang = langCode;
    localStorage.setItem("th_lang", langCode);
    
    const dict = languages[langCode].dict;
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (dict[key]) {
            el.innerText = dict[key];
        }
    });
    
    // update modal active state if open
    renderLanguageModal();
}

function renderLanguageModal() {
    const container = document.getElementById("language-modal-body");
    if (!container) return;
    
    container.innerHTML = "";
    Object.keys(languages).forEach(code => {
        const lang = languages[code];
        const isActive = code === currentLang;
        const div = document.createElement("div");
        div.className = \`lang-card \${isActive ? 'active' : ''}\`;
        div.innerHTML = \`<div style="font-size: 20px;">\${lang.flag}</div><div>\${lang.name}</div>\`;
        div.onclick = () => {
            setLanguage(code);
            closeLangModal();
        };
        container.appendChild(div);
    });
}

function openLangModal() {
    const m = document.getElementById("language-modal");
    if(m) m.classList.add("active");
}

function closeLangModal() {
    const m = document.getElementById("language-modal");
    if(m) m.classList.remove("active");
}

// Ensure initLanguage runs on load
document.addEventListener("DOMContentLoaded", () => {
    initLanguage();
});
// Since DOMContentLoaded might have fired already depending on script placement
initLanguage();
`;

fs.appendFileSync('frontend/app.js', jsCode);
