/**
 * Core navigation/sign-in translations. Operational and safety copy stays in
 * English until reviewed. These are source-controlled strings, never remote
 * translations of fleet data, credentials, commands or API responses.
 *
 * Add a locale here and a same-length row below. The catalog test rejects
 * missing/extra strings and mismatched interpolation tokens.
 */
export const messages = [
  "Language", "Search languages", "Close", "Display density", "Compact", "Comfortable",
  "Refresh", "Refreshing…", "Sign out", "Control plane", "Connected", "Stale data",
  "Workspace", "Devices", "Tasks", "Approvals", "Notifications", "Audit", "Policies",
  "Connections", "Logs", "Users", "Management & notifications", "Connect to AI Bridge",
  "Sign-in method", "Admin token", "Account", "Username", "Password", "Sign in",
  "Signing in…", "Sign in with your identity provider", "Explore demo workspace",
  "Unable to sign in", "Search", "Cancel", "Save", "Previous page", "Next page",
  "Not reported", "Not loaded", "{count} results · Page {page} of {pages}",
  "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
] as const;
export type Message = typeof messages[number];

export const languages = [
  { code: "en", name: "English", native: "English", dir: "ltr" },
  { code: "ar", name: "Arabic", native: "العربية", dir: "rtl" },
  { code: "bn", name: "Bengali", native: "বাংলা", dir: "ltr" },
  { code: "zh-Hans", name: "Chinese (Simplified)", native: "简体中文", dir: "ltr" },
  { code: "zh-Hant", name: "Chinese (Traditional)", native: "繁體中文", dir: "ltr" },
  { code: "fr", name: "French", native: "Français", dir: "ltr" },
  { code: "de", name: "German", native: "Deutsch", dir: "ltr" },
  { code: "he", name: "Hebrew", native: "עברית", dir: "rtl" },
  { code: "hi", name: "Hindi", native: "हिन्दी", dir: "ltr" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", dir: "ltr" },
  { code: "ja", name: "Japanese", native: "日本語", dir: "ltr" },
  { code: "ko", name: "Korean", native: "한국어", dir: "ltr" },
  { code: "fa", name: "Persian", native: "فارسی", dir: "rtl" },
  { code: "pt", name: "Portuguese", native: "Português", dir: "ltr" },
  { code: "ru", name: "Russian", native: "Русский", dir: "ltr" },
  { code: "es", name: "Spanish", native: "Español", dir: "ltr" },
  { code: "ta", name: "Tamil", native: "தமிழ்", dir: "ltr" },
  { code: "tr", name: "Turkish", native: "Türkçe", dir: "ltr" },
  { code: "ur", name: "Urdu", native: "اردو", dir: "rtl" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", dir: "ltr" },
] as const;
export type Locale = typeof languages[number]["code"];

type TranslationRow<T extends readonly unknown[]> = { readonly [Index in keyof T]: string };
export const catalogRows: Record<Exclude<Locale, "en">, TranslationRow<typeof messages>> = {
  ar: [
    "اللغة", "البحث عن لغة", "إغلاق", "كثافة العرض", "مضغوط", "مريح",
    "تحديث", "جارٍ التحديث…", "تسجيل الخروج", "لوحة التحكم", "متصل", "بيانات قديمة",
    "مساحة العمل", "الأجهزة", "المهام", "الموافقات", "الإشعارات", "التدقيق", "السياسات",
    "الاتصالات", "السجلات", "المستخدمون", "الإدارة والإشعارات", "الاتصال بـ AI Bridge",
    "طريقة تسجيل الدخول", "رمز المسؤول", "الحساب", "اسم المستخدم", "كلمة المرور", "تسجيل الدخول",
    "جارٍ تسجيل الدخول…", "تسجيل الدخول باستخدام موفر الهوية", "استكشاف مساحة العمل التجريبية",
    "تعذّر تسجيل الدخول", "بحث", "إلغاء", "حفظ", "الصفحة السابقة", "الصفحة التالية",
    "لم يتم الإبلاغ", "لم يتم التحميل", "{count} نتيجة · الصفحة {page} من {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  bn: [
    "ভাষা", "ভাষা খুঁজুন", "বন্ধ করুন", "প্রদর্শনের ঘনত্ব", "সংক্ষিপ্ত", "প্রশস্ত",
    "রিফ্রেশ", "রিফ্রেশ হচ্ছে…", "সাইন আউট", "নিয়ন্ত্রণ প্যানেল", "সংযুক্ত", "পুরোনো তথ্য",
    "ওয়ার্কস্পেস", "ডিভাইস", "কাজ", "অনুমোদন", "বিজ্ঞপ্তি", "নিরীক্ষা", "নীতি",
    "সংযোগ", "লগ", "ব্যবহারকারী", "ব্যবস্থাপনা ও বিজ্ঞপ্তি", "AI Bridge-এ সংযুক্ত হোন",
    "সাইন ইন পদ্ধতি", "অ্যাডমিন টোকেন", "অ্যাকাউন্ট", "ব্যবহারকারীর নাম", "পাসওয়ার্ড", "সাইন ইন",
    "সাইন ইন হচ্ছে…", "আপনার পরিচয় প্রদানকারীর মাধ্যমে সাইন ইন করুন", "ডেমো ওয়ার্কস্পেস দেখুন",
    "সাইন ইন করা যায়নি", "খুঁজুন", "বাতিল", "সংরক্ষণ", "আগের পৃষ্ঠা", "পরের পৃষ্ঠা",
    "জানানো হয়নি", "লোড হয়নি", "{count} ফলাফল · পৃষ্ঠা {page} / {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  "zh-Hans": [
    "语言", "搜索语言", "关闭", "显示密度", "紧凑", "舒适",
    "刷新", "正在刷新…", "退出登录", "控制面板", "已连接", "数据已过期",
    "工作区", "设备", "任务", "审批", "通知", "审计", "策略",
    "连接", "日志", "用户", "管理与通知", "连接到 AI Bridge",
    "登录方式", "管理员令牌", "账户", "用户名", "密码", "登录",
    "正在登录…", "使用身份提供商登录", "探索演示工作区",
    "无法登录", "搜索", "取消", "保存", "上一页", "下一页",
    "未报告", "未加载", "{count} 条结果 · 第 {page} 页，共 {pages} 页",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  "zh-Hant": [
    "語言", "搜尋語言", "關閉", "顯示密度", "緊湊", "舒適",
    "重新整理", "正在重新整理…", "登出", "控制面板", "已連線", "資料已過期",
    "工作區", "裝置", "工作", "核准", "通知", "稽核", "原則",
    "連線", "記錄", "使用者", "管理與通知", "連線至 AI Bridge",
    "登入方式", "管理員權杖", "帳戶", "使用者名稱", "密碼", "登入",
    "正在登入…", "使用身分提供者登入", "探索示範工作區",
    "無法登入", "搜尋", "取消", "儲存", "上一頁", "下一頁",
    "未回報", "未載入", "{count} 筆結果 · 第 {page} 頁，共 {pages} 頁",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  fr: [
    "Langue", "Rechercher une langue", "Fermer", "Densité d’affichage", "Compact", "Confortable",
    "Actualiser", "Actualisation…", "Se déconnecter", "Plan de contrôle", "Connecté", "Données obsolètes",
    "Espace de travail", "Appareils", "Tâches", "Approbations", "Notifications", "Audit", "Politiques",
    "Connexions", "Journaux", "Utilisateurs", "Gestion et notifications", "Se connecter à AI Bridge",
    "Méthode de connexion", "Jeton administrateur", "Compte", "Nom d’utilisateur", "Mot de passe", "Se connecter",
    "Connexion…", "Se connecter avec votre fournisseur d’identité", "Explorer l’espace de démonstration",
    "Connexion impossible", "Rechercher", "Annuler", "Enregistrer", "Page précédente", "Page suivante",
    "Non renseigné", "Non chargé", "{count} résultats · Page {page} sur {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  de: [
    "Sprache", "Sprachen suchen", "Schließen", "Anzeigedichte", "Kompakt", "Komfortabel",
    "Aktualisieren", "Wird aktualisiert…", "Abmelden", "Steuerungsebene", "Verbunden", "Veraltete Daten",
    "Arbeitsbereich", "Geräte", "Aufgaben", "Genehmigungen", "Benachrichtigungen", "Audit", "Richtlinien",
    "Verbindungen", "Protokolle", "Benutzer", "Verwaltung und Benachrichtigungen", "Mit AI Bridge verbinden",
    "Anmeldemethode", "Administrator-Token", "Konto", "Benutzername", "Passwort", "Anmelden",
    "Anmeldung läuft…", "Mit Ihrem Identitätsanbieter anmelden", "Demo-Arbeitsbereich erkunden",
    "Anmeldung nicht möglich", "Suchen", "Abbrechen", "Speichern", "Vorherige Seite", "Nächste Seite",
    "Nicht gemeldet", "Nicht geladen", "{count} Ergebnisse · Seite {page} von {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  he: [
    "שפה", "חיפוש שפות", "סגירה", "צפיפות תצוגה", "קומפקטי", "מרווח",
    "רענון", "מתרענן…", "יציאה", "לוח בקרה", "מחובר", "נתונים לא עדכניים",
    "סביבת עבודה", "מכשירים", "משימות", "אישורים", "התראות", "ביקורת", "מדיניות",
    "חיבורים", "יומנים", "משתמשים", "ניהול והתראות", "התחברות אל AI Bridge",
    "שיטת כניסה", "אסימון מנהל", "חשבון", "שם משתמש", "סיסמה", "כניסה",
    "מתבצעת כניסה…", "כניסה באמצעות ספק הזהות שלך", "סיור בסביבת ההדגמה",
    "לא ניתן להיכנס", "חיפוש", "ביטול", "שמירה", "העמוד הקודם", "העמוד הבא",
    "לא דווח", "לא נטען", "{count} תוצאות · עמוד {page} מתוך {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  hi: [
    "भाषा", "भाषाएँ खोजें", "बंद करें", "प्रदर्शन घनत्व", "सघन", "आरामदायक",
    "रीफ़्रेश करें", "रीफ़्रेश हो रहा है…", "साइन आउट", "नियंत्रण पैनल", "कनेक्टेड", "पुराना डेटा",
    "कार्यस्थान", "डिवाइस", "कार्य", "अनुमोदन", "सूचनाएँ", "ऑडिट", "नीतियाँ",
    "कनेक्शन", "लॉग", "उपयोगकर्ता", "प्रबंधन और सूचनाएँ", "AI Bridge से कनेक्ट करें",
    "साइन इन का तरीका", "व्यवस्थापक टोकन", "खाता", "उपयोगकर्ता नाम", "पासवर्ड", "साइन इन",
    "साइन इन हो रहा है…", "अपने पहचान प्रदाता से साइन इन करें", "डेमो कार्यस्थान देखें",
    "साइन इन नहीं हो सका", "खोजें", "रद्द करें", "सहेजें", "पिछला पृष्ठ", "अगला पृष्ठ",
    "रिपोर्ट नहीं किया गया", "लोड नहीं हुआ", "{count} परिणाम · पृष्ठ {page} / {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  id: [
    "Bahasa", "Cari bahasa", "Tutup", "Kepadatan tampilan", "Ringkas", "Nyaman",
    "Segarkan", "Menyegarkan…", "Keluar", "Panel kontrol", "Terhubung", "Data kedaluwarsa",
    "Ruang kerja", "Perangkat", "Tugas", "Persetujuan", "Notifikasi", "Audit", "Kebijakan",
    "Koneksi", "Log", "Pengguna", "Pengelolaan & notifikasi", "Hubungkan ke AI Bridge",
    "Metode masuk", "Token administrator", "Akun", "Nama pengguna", "Kata sandi", "Masuk",
    "Sedang masuk…", "Masuk dengan penyedia identitas Anda", "Jelajahi ruang kerja demo",
    "Tidak dapat masuk", "Cari", "Batal", "Simpan", "Halaman sebelumnya", "Halaman berikutnya",
    "Belum dilaporkan", "Belum dimuat", "{count} hasil · Halaman {page} dari {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  ja: [
    "言語", "言語を検索", "閉じる", "表示密度", "コンパクト", "ゆったり",
    "更新", "更新中…", "サインアウト", "コントロールプレーン", "接続済み", "古いデータ",
    "ワークスペース", "デバイス", "タスク", "承認", "通知", "監査", "ポリシー",
    "接続", "ログ", "ユーザー", "管理と通知", "AI Bridge に接続",
    "サインイン方法", "管理者トークン", "アカウント", "ユーザー名", "パスワード", "サインイン",
    "サインイン中…", "ID プロバイダーでサインイン", "デモワークスペースを見る",
    "サインインできません", "検索", "キャンセル", "保存", "前のページ", "次のページ",
    "未報告", "未読み込み", "{count} 件 · {page} / {pages} ページ",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  ko: [
    "언어", "언어 검색", "닫기", "화면 밀도", "간결하게", "여유롭게",
    "새로고침", "새로고침 중…", "로그아웃", "제어 패널", "연결됨", "오래된 데이터",
    "작업 공간", "기기", "작업", "승인", "알림", "감사", "정책",
    "연결", "로그", "사용자", "관리 및 알림", "AI Bridge에 연결",
    "로그인 방법", "관리자 토큰", "계정", "사용자 이름", "비밀번호", "로그인",
    "로그인 중…", "ID 공급자로 로그인", "데모 작업 공간 둘러보기",
    "로그인할 수 없음", "검색", "취소", "저장", "이전 페이지", "다음 페이지",
    "보고되지 않음", "로드되지 않음", "결과 {count}개 · {page} / {pages} 페이지",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  fa: [
    "زبان", "جستجوی زبان‌ها", "بستن", "تراکم نمایش", "فشرده", "راحت",
    "تازه‌سازی", "در حال تازه‌سازی…", "خروج", "پنل کنترل", "متصل", "داده‌های قدیمی",
    "فضای کاری", "دستگاه‌ها", "وظایف", "تأییدها", "اعلان‌ها", "حسابرسی", "خط‌مشی‌ها",
    "اتصال‌ها", "گزارش‌ها", "کاربران", "مدیریت و اعلان‌ها", "اتصال به AI Bridge",
    "روش ورود", "توکن مدیر", "حساب", "نام کاربری", "گذرواژه", "ورود",
    "در حال ورود…", "ورود با ارائه‌دهنده هویت", "مشاهده فضای کاری نمایشی",
    "ورود امکان‌پذیر نیست", "جستجو", "لغو", "ذخیره", "صفحه قبل", "صفحه بعد",
    "گزارش نشده", "بارگذاری نشده", "{count} نتیجه · صفحه {page} از {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  pt: [
    "Idioma", "Pesquisar idiomas", "Fechar", "Densidade da interface", "Compacto", "Confortável",
    "Atualizar", "Atualizando…", "Sair", "Painel de controle", "Conectado", "Dados desatualizados",
    "Área de trabalho", "Dispositivos", "Tarefas", "Aprovações", "Notificações", "Auditoria", "Políticas",
    "Conexões", "Registros", "Usuários", "Gestão e notificações", "Conectar ao AI Bridge",
    "Método de acesso", "Token de administrador", "Conta", "Nome de usuário", "Senha", "Entrar",
    "Entrando…", "Entrar com seu provedor de identidade", "Explorar a área de demonstração",
    "Não foi possível entrar", "Pesquisar", "Cancelar", "Salvar", "Página anterior", "Próxima página",
    "Não informado", "Não carregado", "{count} resultados · Página {page} de {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  ru: [
    "Язык", "Поиск языков", "Закрыть", "Плотность интерфейса", "Компактно", "Просторно",
    "Обновить", "Обновление…", "Выйти", "Панель управления", "Подключено", "Устаревшие данные",
    "Рабочая область", "Устройства", "Задачи", "Согласования", "Уведомления", "Аудит", "Политики",
    "Подключения", "Журналы", "Пользователи", "Управление и уведомления", "Подключиться к AI Bridge",
    "Способ входа", "Токен администратора", "Учётная запись", "Имя пользователя", "Пароль", "Войти",
    "Вход…", "Войти через поставщика удостоверений", "Открыть демонстрационную среду",
    "Не удалось войти", "Поиск", "Отмена", "Сохранить", "Предыдущая страница", "Следующая страница",
    "Нет данных", "Не загружено", "Результатов: {count} · Страница {page} из {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  es: [
    "Idioma", "Buscar idiomas", "Cerrar", "Densidad de pantalla", "Compacto", "Cómodo",
    "Actualizar", "Actualizando…", "Cerrar sesión", "Panel de control", "Conectado", "Datos desactualizados",
    "Espacio de trabajo", "Dispositivos", "Tareas", "Aprobaciones", "Notificaciones", "Auditoría", "Políticas",
    "Conexiones", "Registros", "Usuarios", "Gestión y notificaciones", "Conectar a AI Bridge",
    "Método de inicio de sesión", "Token de administrador", "Cuenta", "Nombre de usuario", "Contraseña", "Iniciar sesión",
    "Iniciando sesión…", "Iniciar sesión con tu proveedor de identidad", "Explorar el espacio de demostración",
    "No se pudo iniciar sesión", "Buscar", "Cancelar", "Guardar", "Página anterior", "Página siguiente",
    "No informado", "Sin cargar", "{count} resultados · Página {page} de {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  ta: [
    "மொழி", "மொழிகளைத் தேடு", "மூடு", "காட்சி அடர்த்தி", "சுருக்கம்", "வசதி",
    "புதுப்பி", "புதுப்பிக்கிறது…", "வெளியேறு", "கட்டுப்பாட்டுப் பலகம்", "இணைக்கப்பட்டது", "பழைய தரவு",
    "பணியிடம்", "சாதனங்கள்", "பணிகள்", "ஒப்புதல்கள்", "அறிவிப்புகள்", "தணிக்கை", "கொள்கைகள்",
    "இணைப்புகள்", "பதிவுகள்", "பயனர்கள்", "நிர்வாகம் மற்றும் அறிவிப்புகள்", "AI Bridge உடன் இணை",
    "உள்நுழைவு முறை", "நிர்வாகி டோக்கன்", "கணக்கு", "பயனர்பெயர்", "கடவுச்சொல்", "உள்நுழை",
    "உள்நுழைகிறது…", "உங்கள் அடையாள வழங்குநர் மூலம் உள்நுழையவும்", "மாதிரி பணியிடத்தைப் பார்",
    "உள்நுழைய முடியவில்லை", "தேடு", "ரத்து", "சேமி", "முந்தைய பக்கம்", "அடுத்த பக்கம்",
    "தெரிவிக்கப்படவில்லை", "ஏற்றப்படவில்லை", "{count} முடிவுகள் · பக்கம் {page} / {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  tr: [
    "Dil", "Dil ara", "Kapat", "Görünüm yoğunluğu", "Kompakt", "Rahat",
    "Yenile", "Yenileniyor…", "Çıkış yap", "Kontrol paneli", "Bağlı", "Güncel olmayan veriler",
    "Çalışma alanı", "Cihazlar", "Görevler", "Onaylar", "Bildirimler", "Denetim", "İlkeler",
    "Bağlantılar", "Günlükler", "Kullanıcılar", "Yönetim ve bildirimler", "AI Bridge'e bağlan",
    "Giriş yöntemi", "Yönetici belirteci", "Hesap", "Kullanıcı adı", "Parola", "Giriş yap",
    "Giriş yapılıyor…", "Kimlik sağlayıcınızla giriş yapın", "Demo çalışma alanını keşfet",
    "Giriş yapılamadı", "Ara", "İptal", "Kaydet", "Önceki sayfa", "Sonraki sayfa",
    "Bildirilmedi", "Yüklenmedi", "{count} sonuç · Sayfa {page} / {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  ur: [
    "زبان", "زبانیں تلاش کریں", "بند کریں", "ڈسپلے کی کثافت", "مختصر", "کشادہ",
    "تازہ کریں", "تازہ ہو رہا ہے…", "سائن آؤٹ", "کنٹرول پینل", "منسلک", "پرانا ڈیٹا",
    "ورک اسپیس", "آلات", "کام", "منظوریاں", "اطلاعات", "آڈٹ", "پالیسیاں",
    "رابطے", "لاگز", "صارفین", "انتظام اور اطلاعات", "AI Bridge سے جڑیں",
    "سائن ان کا طریقہ", "منتظم ٹوکن", "اکاؤنٹ", "صارف نام", "پاس ورڈ", "سائن ان",
    "سائن ان ہو رہا ہے…", "اپنے شناخت فراہم کنندہ کے ذریعے سائن ان کریں", "ڈیمو ورک اسپیس دیکھیں",
    "سائن ان نہیں ہو سکا", "تلاش", "منسوخ", "محفوظ کریں", "پچھلا صفحہ", "اگلا صفحہ",
    "اطلاع نہیں دی گئی", "لوڈ نہیں ہوا", "{count} نتائج · صفحہ {page} از {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
  vi: [
    "Ngôn ngữ", "Tìm ngôn ngữ", "Đóng", "Mật độ hiển thị", "Gọn", "Thoáng",
    "Làm mới", "Đang làm mới…", "Đăng xuất", "Bảng điều khiển", "Đã kết nối", "Dữ liệu cũ",
    "Không gian làm việc", "Thiết bị", "Tác vụ", "Phê duyệt", "Thông báo", "Kiểm toán", "Chính sách",
    "Kết nối", "Nhật ký", "Người dùng", "Quản lý và thông báo", "Kết nối với AI Bridge",
    "Phương thức đăng nhập", "Mã quản trị", "Tài khoản", "Tên người dùng", "Mật khẩu", "Đăng nhập",
    "Đang đăng nhập…", "Đăng nhập bằng nhà cung cấp danh tính", "Khám phá không gian minh họa",
    "Không thể đăng nhập", "Tìm kiếm", "Hủy", "Lưu", "Trang trước", "Trang sau",
    "Chưa báo cáo", "Chưa tải", "{count} kết quả · Trang {page} / {pages}",
    "Theme", "Switch to light theme", "Switch to dark theme", "Light", "Dark",
  ],
};

export function resolveLocale(input: string): Locale {
  try {
    const canonical = Intl.getCanonicalLocales(input)[0];
    const exact = languages.find(language => language.code.toLowerCase() === canonical.toLowerCase());
    if (exact) return exact.code;
    const locale = new Intl.Locale(canonical);
    if (locale.language === "zh") return locale.maximize().script === "Hant" ? "zh-Hant" : "zh-Hans";
    return languages.find(language => language.code === locale.language)?.code || "en";
  } catch { return "en"; }
}

const catalogs = Object.fromEntries(Object.entries(catalogRows).map(([code, row]) =>
  [code, Object.fromEntries(messages.map((message, index) => [message, row[index]]))],
)) as Record<Exclude<Locale, "en">, Record<Message, string>>;

export function translate(locale: Locale, message: Message, values: Record<string, string | number> = {}): string {
  const template = locale === "en" ? message : catalogs[locale]?.[message] || message;
  return template.replace(/\{(\w+)\}/g, (token, name: string) => String(values[name] ?? token));
}
