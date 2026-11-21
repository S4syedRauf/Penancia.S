import { Language } from '../types/panacea';

export interface PanaceaTranslations {
  brand: string;
  attribution: string;
  greetingHello: string;
  tabs: {
    diary: string;
    activity: string;
    meals: string;
    profile: string;
    premium: string;
  };
  diary: {
    scheduledTitle: string;
    calendarBtn: string;
    summaryTitle: string;
    detailsBtn: string;
    consistencyLabel: string;
    consistencyDisclaimer: string;
    pillars: {
      plan: string;
      screening: string;
      stayAlert: string;
    };
    actionsHeading: string;
    viewAllBtn: string;
    cards: {
      healthCheckTitle: string;
      healthCheckSub: string;
      reportsTitle: string;
      reportsSub: string;
      labBookingTitle: string;
      labBookingSub: string;
      homePreScreenTitle: string;
      homePreScreenSub: string;
    };
  };
  activity: {
    title: string;
    subtitle: string;
    completedLabel: string;
    historyBtn: string;
    addActivity: string;
  };
  meals: {
    title: string;
    plannerTab: string;
    libraryTab: string;
    nutritionDisclaimer: string;
    noonComingSoon: string;
    copyNoonList: string;
    openInNoon: string;
    bookableTestsTitle: string;
    gatedTestsTitle: string;
  };
  profile: {
    title: string;
    grid: {
      language: string;
      planDays: string;
      area: string;
      discreet: string;
    };
    watchRow: string;
    notificationsRow: string;
    accountHeading: string;
  };
  emergency: {
    bannerTitle: string;
    bannerBody: string;
    call998: string;
    openCare: string;
  };
  common: {
    back: string;
    save: string;
    cancel: string;
    confirm: string;
    close: string;
    prototypeBadge: string;
    researchBadge: string;
    simulatedBadge: string;
    on: string;
    off: string;
    daysSuffix: string;
    recommended: string;
  };
}

export const PANACEA_I18N: Record<Language, PanaceaTranslations> = {
  en: {
    brand: 'Panacea',
    attribution: 'Developed with love by Syed',
    greetingHello: 'Hello',
    // Original tab names preserved per user request
    tabs: {
      diary: 'Diary',
      activity: 'Activity',
      meals: 'Meals',
      profile: 'Profile',
      premium: 'Pro',
    },
    diary: {
      scheduledTitle: 'Scheduled Your Plan',
      calendarBtn: 'Calendar',
      summaryTitle: 'Summary',
      detailsBtn: 'Details',
      consistencyLabel: 'consistency',
      consistencyDisclaimer:
        'This measures plan actions completed. It does not measure sperm, fertility, recovery, or whether you can skip a test.',
      pillars: {
        plan: 'Plan',
        screening: 'Pathway',
        stayAlert: 'Stay Alert',
      },
      actionsHeading: 'Care & Actions',
      viewAllBtn: 'View all',
      cards: {
        healthCheckTitle: 'Health Check (26-Q)',
        healthCheckSub: 'Adaptive intake · Deterministic routing',
        reportsTitle: 'Report Vault & OCR',
        reportsSub: 'Private upload · Mandatory confirmation',
        labBookingTitle: 'Lab Booking (5 km)',
        labBookingSub: 'Dubai-first fixture · Consent pack',
        homePreScreenTitle: 'Home Pre-Screen',
        homePreScreenSub: 'Research mode · Capture quality gate',
      },
    },
    activity: {
      title: 'Schedule',
      subtitle: 'Week Days',
      completedLabel: 'done',
      historyBtn: 'History',
      addActivity: 'Log Symptom / Habit',
    },
    meals: {
      title: 'Nutrition & Tests',
      plannerTab: 'Nutrition & Noon',
      libraryTab: 'Tests & Library',
      nutritionDisclaimer:
        'Balanced everyday food ideas only. Foods do not treat infertility or replace clinical care.',
      noonComingSoon: 'Auto-ordering Coming Soon',
      copyNoonList: 'Copy List',
      openInNoon: 'Search Noon',
      bookableTestsTitle: 'Bookable Diagnostic Tests',
      gatedTestsTitle: 'Gated Future Tests (Clinician Order Required)',
    },
    profile: {
      title: 'Profile',
      grid: {
        language: 'Language',
        planDays: 'Plan Cycle',
        area: 'Location',
        discreet: 'Discreet',
      },
      watchRow: 'Wearable Connectors',
      notificationsRow: 'Stay Alert & Notifications',
      accountHeading: 'Privacy, Partner & Data Rights',
    },
    emergency: {
      bannerTitle: 'Urgent Medical Evaluation Recommended',
      bannerBody:
        'Sudden severe testicular pain, swelling, injury, or blood requires prompt clinical evaluation today. Do not wait for a home pre-screen or habit plan. Call UAE 998 for emergency transport or visit an urgent urology department.',
      call998: 'UAE Emergency: 998',
      openCare: 'View Urgent Care Centres',
    },
    common: {
      back: 'Back',
      save: 'Save',
      cancel: 'Cancel',
      confirm: 'Confirm',
      close: 'Close',
      prototypeBadge: 'Prototype / Simulated Fixture',
      researchBadge: 'Research Mode Only — Not a Diagnostic Result',
      simulatedBadge: 'Simulated Partner & Checkout',
      on: 'On',
      off: 'Off',
      daysSuffix: 'Days',
      recommended: 'Recommended',
    },
  },
  ar: {
    brand: 'باناسيا',
    attribution: 'طُوّر بحب بواسطة سيد',
    greetingHello: 'مرحباً',
    tabs: {
      diary: 'Diary',
      activity: 'Activity',
      meals: 'Meals',
      profile: 'Profile',
      premium: 'Pro',
    },
    diary: {
      scheduledTitle: 'جدول خطتك اليومية',
      calendarBtn: 'التقويم',
      summaryTitle: 'الملخص',
      detailsBtn: 'التفاصيل',
      consistencyLabel: 'التزام الخطة',
      consistencyDisclaimer:
        'يقيس هذا المؤشر إتمام إجراءات الخطة فقط. ولا يقيس الحيوانات المنوية أو الخصوبة أو التعافي أو الاستغناء عن الفحص.',
      pillars: {
        plan: 'الخطة',
        screening: 'المسار',
        stayAlert: 'المتابعة',
      },
      actionsHeading: 'الرعاية والإجراءات',
      viewAllBtn: 'عرض الكل',
      cards: {
        healthCheckTitle: 'التقييم الصحي (٢٦ سؤالاً)',
        healthCheckSub: 'أسئلة تكيفية · توجيه سريري محدد',
        reportsTitle: 'خزنة التقارير و OCR',
        reportsSub: 'رفع خاص · مراجعة إلزامية للقيم',
        labBookingTitle: 'حجز المختبر (٥ كم)',
        labBookingSub: 'بيانات دبي التجريبية · حزمة الموافقة',
        homePreScreenTitle: 'الفحص المنزلي الأولي',
        homePreScreenSub: 'وضع بحثي · فحص جودة التصوير',
      },
    },
    activity: {
      title: 'الجدول اليومي',
      subtitle: 'أيام الأسبوع',
      completedLabel: 'مكتمل',
      historyBtn: 'السجل',
      addActivity: 'تسجيل عرض أو عادة',
    },
    meals: {
      title: 'التغذية والفحوصات',
      plannerTab: 'التغذية ونون',
      libraryTab: 'الفحوصات والمكتبة',
      nutritionDisclaimer:
        'مقترحات غذائية يومية متوازنة فقط. الغذاء لا يعالج العقم ولا يغني عن الرعاية الطبية.',
      noonComingSoon: 'الطلب التلقائي قريباً',
      copyNoonList: 'نسخ القائمة',
      openInNoon: 'بحث في نون',
      bookableTestsTitle: 'الفحوصات المتاحة للحجز',
      gatedTestsTitle: 'فحوصات مستقبلية مقيدة (تتطلب طلباً طبياً)',
    },
    profile: {
      title: 'الملف الشخصي',
      grid: {
        language: 'اللغة',
        planDays: 'مدة الخطة',
        area: 'المنطقة',
        discreet: 'الوضع الخفي',
      },
      watchRow: 'موصلات الأجهزة القابلة للارتداء',
      notificationsRow: 'تنبيهات المتابعة والإشعارات',
      accountHeading: 'الخصوصية والشركاء وحقوق البيانات',
    },
    emergency: {
      bannerTitle: 'يُنصح بتقييم طبي عاجل فوراً',
      bannerBody:
        'الألم المفاجئ الشديد في الخصية أو التورم أو الإصابة أو الدم يتطلب تقييماً طبياً عاجلاً اليوم. لا تنتظر الفحص المنزلي أو خطة العادات. اتصل على ٩٩٨ للإسعاف في الإمارات أو توجه للطوارئ.',
      call998: 'طوارئ الإمارات: 998',
      openCare: 'عرض مراكز الرعاية العاجلة',
    },
    common: {
      back: 'رجوع',
      save: 'حفظ',
      cancel: 'إلغاء',
      confirm: 'تأكيد',
      close: 'إغلاق',
      prototypeBadge: 'نموذج أولي / بيانات محاكاة',
      researchBadge: 'وضع بحثي فقط — ليس نتيجة تشخيصية',
      simulatedBadge: 'شريك ودفع محاكى',
      on: 'مفعّل',
      off: 'متوقف',
      daysSuffix: 'يوماً',
      recommended: 'موصى به',
    },
  },
};
