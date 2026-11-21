import { Language } from '../types/sahatna';

export interface Translations {
  appName: string;
  tagline: string;
  firstOpenNote: string;
  switchToArabicPrompt: string;
  switchToArabicAction: string;
  dismiss: string;
  continue: string;
  back: string;
  save: string;
  cancel: string;
  confirm: string;
  delete: string;
  nav: {
    home: string;
    questionnaire: string;
    semen: string;
    reports: string;
    plan: string;
    ask: string;
    wearables: string;
    care: string;
    settings: string;
  };
  onboarding: {
    chooseLang: string;
    privacyTitle: string;
    privacySummary: string;
    usernameTitle: string;
    usernameSubtitle: string;
    generateAnother: string;
    recoveryOptionalTitle: string;
    recoveryWarning: string;
    enterApp: string;
    signInExisting: string;
    emailPlaceholder: string;
    phonePlaceholder: string;
    consentIntro: string;
  };
  screening: {
    greenLabel: string;
    yellowLabel: string;
    redLabel: string;
    disclaimer: string;
    whatWeUsed: string;
    whatIsMissing: string;
    nextStep: string;
    urgentTitle: string;
    urgentSubtitle: string;
    urgentBody: string;
    bookLabCta: string;
  };
  semen: {
    prototypeBadge: string;
    validatedBadge: string;
    concBand: string;
    motilityBand: string;
    preScreenFixedLine: string;
    noDeviceMsg: string;
    demoBanner: string;
    unclearCalm: string;
  };
  noon: {
    askTitle: string;
    pricesDisclaimer: string;
    copyList: string;
    copyName: string;
    openInNoon: string;
    comingSoonToggle: string;
    comingSoonBadge: string;
  };
  wearables: {
    disclaimer: string;
    evidenceNote: string;
  };
}

export const TRANSLATIONS: Record<Language, Translations> = {
  en: {
    appName: 'Sahatna',
    tagline: 'Male Reproductive-Health Companion · UAE',
    firstOpenNote:
      'Sahatna helps you understand your reproductive health privately. We do not ask for your name.',
    switchToArabicPrompt: 'Arabic detected on your device. Switch interface to Arabic (RTL)?',
    switchToArabicAction: 'Switch to Arabic',
    dismiss: 'Keep English',
    continue: 'Continue',
    back: 'Back',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    nav: {
      home: 'Home',
      questionnaire: 'Check',
      semen: 'Pre-Screen',
      reports: 'Vault',
      plan: '74-Day',
      ask: 'Ask',
      wearables: 'Habits',
      care: 'Care',
      settings: 'Settings',
    },
    onboarding: {
      chooseLang: 'Choose your language',
      privacyTitle: 'Your privacy comes first',
      privacySummary:
        'Sahatna protects your privacy in line with UAE data principles. We assign a random username and never ask for your real name. You control separate permissions for storing reports, running home video pre-screens, wearable habits, and sharing summaries with a clinic. You can export or delete everything anytime.',
      usernameTitle: 'Your private username',
      usernameSubtitle: 'Only this random alias is shown. No real name is collected.',
      generateAnother: 'Generate another username',
      recoveryOptionalTitle: 'Optional account recovery',
      recoveryWarning:
        'If you lose this device and have no recovery method, we cannot restore your account.',
      enterApp: 'Continue to Consent & Screening',
      signInExisting: 'Sign in with existing username or recovery',
      emailPlaceholder: 'Optional recovery email',
      phonePlaceholder: 'Optional UAE phone (+971...)',
      consentIntro: 'Control each use of your data separately. Withdraw anytime.',
    },
    screening: {
      greenLabel: 'Green — No concerns found',
      yellowLabel: 'Yellow — Work on factors & recheck',
      redLabel: 'Red — See a clinician / lab test',
      disclaimer:
        'This is a pre-screen. It shows direction, not a diagnosis. It does not replace a laboratory test.',
      whatWeUsed: 'What we used',
      whatIsMissing: 'What is missing',
      nextStep: 'Recommended next step',
      urgentTitle: 'Prompt Medical Care Recommended',
      urgentSubtitle: 'Clinician-approved urgent guidance (available offline)',
      urgentBody:
        'Because you reported sudden or severe pain, swelling, injury, or blood, please do not wait for a home pre-screen or lifestyle plan. Seek prompt evaluation at a UAE emergency department or urology urgent clinic today (call 998 for ambulance if pain is sudden or severe).',
      bookLabCta: 'Open Care Directory',
    },
    semen: {
      prototypeBadge: 'Prototype pre-screen (not clinically validated yet)',
      validatedBadge: 'Pre-screen · Validated mode',
      concBand: 'Concentration Band',
      motilityBand: 'Motility Band',
      preScreenFixedLine: 'This is a pre-screen. It does not replace a laboratory test.',
      noDeviceMsg:
        'To record, you need a clip-on microscope lens or a microscope with a phone adapter. Without it we cannot look at a sample.',
      demoBanner: 'Demo data. Not your sample. Excluded from plan, reminders, and research.',
      unclearCalm:
        'We could not be sure from this video. That does not mean something is wrong. You can retake it or book a lab test.',
    },
    noon: {
      askTitle: 'Do you want me to find any of these on Noon?',
      pricesDisclaimer: 'Prices and stock are shown by Noon, not by us.',
      copyList: 'Copy full list',
      copyName: 'Copy name',
      openInNoon: 'Open in Noon',
      comingSoonToggle: 'Auto-list products and offer to order from Noon',
      comingSoonBadge: 'Coming soon',
    },
    wearables: {
      disclaimer: 'Your watch helps track habits like sleep. It cannot measure fertility.',
      evidenceNote:
        'Sleep and stress affect general and hormonal health; effects on sperm are small and uncertain. Sahatna uses this only as encouragement, never as a screening colour or fertility result.',
    },
  },
  ar: {
    appName: 'صحتنا',
    tagline: 'رفيق الصحة الإنجابية للرجل · الإمارات',
    firstOpenNote: 'تطبيق صحتنا يساعدك على فهم صحتك الإنجابية بخصوصية تامة. لا نطلب اسمك الحقيقي.',
    switchToArabicPrompt: 'تم اكتشاف اللغة العربية. هل ترغب في التبديل إلى العربية؟',
    switchToArabicAction: 'التبديل إلى العربية',
    dismiss: 'الاستمرار بالإنجليزية',
    continue: 'متابعة',
    back: 'رجوع',
    save: 'حفظ',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    delete: 'حذف',
    nav: {
      home: 'الرئيسية',
      questionnaire: 'الاستبيان',
      semen: 'الفحص',
      reports: 'التقارير',
      plan: '٧٤ يوماً',
      ask: 'اسأل',
      wearables: 'العادات',
      care: 'العيادات',
      settings: 'الإعدادات',
    },
    onboarding: {
      chooseLang: 'اختر لغتك',
      privacyTitle: 'خصوصيتك أولاً',
      privacySummary:
        'يحمي تطبيق صحتنا خصوصيتك وفق مبادئ حماية البيانات في الإمارات. ننشئ لك اسم مستخدم عشوائياً دون طلب اسمك الحقيقي. يمكنك التحكم في كل إذن على حدة لتخزين التقارير أو تحليل الفيديو المنزلي أو مشاركة الملخص مع عيادة، ويمكنك التصدير أو الحذف في أي وقت.',
      usernameTitle: 'اسم المستخدم الخاص بك',
      usernameSubtitle: 'يظهر هذا الاسم المستعار فقط دون أي اسم حقيقي.',
      generateAnother: 'توليد اسم آخر',
      recoveryOptionalTitle: 'استعادة الحساب (اختياري)',
      recoveryWarning: 'إذا فقدت هذا الجهاز دون وسيلة استعادة، فلن نتمكن من استرجاع حسابك.',
      enterApp: 'متابعة إلى الأذونات والفحص',
      signInExisting: 'تسجيل الدخول بحساب حالي',
      emailPlaceholder: 'بريد إلكتروني للاستعادة (اختياري)',
      phonePlaceholder: 'رقم هاتف إماراتي (+971... اختياري)',
      consentIntro: 'تحكم في كل استخدام لبياناتك بشكل منفصل، ويمكنك السحب في أي وقت.',
    },
    screening: {
      greenLabel: 'أخضر — لا توجد مؤشرات مقلقة',
      yellowLabel: 'أصفر — عوامل للتحسين وإعادة الفحص',
      redLabel: 'أحمر — يُنصح بمراجعة طبيب / مختبر',
      disclaimer: 'هذا فحص أولي يوضح الاتجاه وليس تشخيصاً ولا يغني عن الفحص المخبري.',
      whatWeUsed: 'المعلومات المستخدمة',
      whatIsMissing: 'المعلومات الناقصة',
      nextStep: 'الخطوة التالية المقترحة',
      urgentTitle: 'يُنصح بمراجعة طبية عاجلة',
      urgentSubtitle: 'إرشادات عاجلة معتمدة طبياً (متاحة دون إنترنت)',
      urgentBody:
        'نظراً لإبلاغك عن ألم مفاجئ أو شديد أو تورم أو إصابة أو دم، يُرجى عدم انتظار الفحص المنزلي أو الخطة اليومية. توجّه لتقييم طبي عاجل في قسم الطوارئ أو عيادة المسالك البولية اليوم (اتصل على 998 للإسعاف عند الألم المفاجئ الشديد).',
      bookLabCta: 'فتح دليل العيادات والمختبرات',
    },
    semen: {
      prototypeBadge: 'فحص أولي تجريبي (غير معتمد سريرياً بعد)',
      validatedBadge: 'فحص أولي · الوضع المعتمد',
      concBand: 'نطاق التركيز',
      motilityBand: 'نطاق الحركة',
      preScreenFixedLine: 'هذا فحص أولي ولا يغني عن التحليل المخبري.',
      noDeviceMsg:
        'للتسجيل تحتاج إلى عدسة مجهر للهاتف أو مجهر مع محول هاتف. بدون ذلك لا يمكننا فحص العينة.',
      demoBanner: 'بيانات تجريبية وليست عينتك. مستبعدة من الخطة والتذكيرات والأبحاث.',
      unclearCalm:
        'لم نتمكن من التأكد من هذا الفيديو. هذا لا يعني وجود مشكلة. يمكنك إعادة التصوير أو حجز فحص مخبري.',
    },
    noon: {
      askTitle: 'هل تريد البحث عن أي من هذه العناصر في نون؟',
      pricesDisclaimer: 'الأسعار والتوفر يعرضهما موقع نون وليس تطبيقنا.',
      copyList: 'نسخ القائمة كاملة',
      copyName: 'نسخ الاسم',
      openInNoon: 'فتح في نون',
      comingSoonToggle: 'إدراج المنتجات تلقائياً وعرض الطلب من نون',
      comingSoonBadge: 'قريباً',
    },
    wearables: {
      disclaimer: 'ساعتك تساعد في تتبع العادات مثل النوم، ولا يمكنها قياس الخصوبة.',
      evidenceNote:
        'النوم والتوتر يؤثران على الصحة العامة والهرمونات، لكن تأثيرهما على السائل المنوي محدود وغير مؤكد. نستخدم ذلك للتشجيع فقط وليس كنتيجة فحص.',
    },
  },
};
