import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Building2,
  Calendar as CalendarIcon,
  ChevronRight,
  Database,
  EyeOff,
  FileCheck,
  Globe,
  HelpCircle,
  Lock,
  MapPin,
  ShieldCheck,
  Watch,
} from 'lucide-react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { CustomModal } from '../components/CustomModal';
import { ProfileAvatarRing } from '../components/ProfileAvatarRing';
import { DUBAI_LOCATION_PRESETS, PLAN_DURATION_OPTIONS } from '../data/panaceaCatalogs';
import { usePanacea } from '../store/PanaceaContext';
import type { PlanDurationChoice, SubView } from '../types/panacea';

interface ProfileScreenProps {
  onBack: () => void;
  onOpenSubView: (view: SubView) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack, onOpenSubView }) => {
  const { state, language, setLanguage, t, updateProfile } = usePanacea();
  const isAr = language === 'ar';

  const [modalKind, setModalKind] = useState<'plan' | 'area' | 'recovery' | null>(null);
  const [customDaysInput, setCustomDaysInput] = useState(
    String(state?.user.customPlanDays || 45)
  );
  const [aliasInput, setAliasInput] = useState(state?.user.alias || '');
  const [emailInput, setEmailInput] = useState(state?.user.recoveryEmail || '');
  const [phoneInput, setPhoneInput] = useState(state?.user.recoveryPhone || '');

  const setupCompletion = useMemo(() => {
    if (!state) return 35;
    let score = 40;
    if (state.questionnaireResponses.length >= 10) score += 20;
    if (state.reports.some((r) => r.state === 'Summarised')) score += 20;
    if (state.user.recoveryEmail || state.user.recoveryPhone) score += 20;
    return Math.min(100, score);
  }, [state]);

  const currentPlanDays =
    state?.user.planDuration === 'custom'
      ? state.user.customPlanDays
      : state?.user.planDuration || 74;

  const noRecovery =
    !state?.user.recoveryEmail.trim() && !state?.user.recoveryPhone.trim();

  const governanceItems: Array<{
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    view: SubView;
  }> = [
    {
      label: isAr ? 'مركز الأذونات (٩ موافقات مستقلة)' : 'Consent Centre (9 Granular Toggles)',
      subtitle: isAr ? 'تحكم بالبيانات والمشاركة والذكاء' : 'Withdraw or grant any consent anytime',
      icon: ShieldCheck,
      view: 'consent-centre',
    },
    {
      label: isAr ? 'بوابة موظفي المختبر الشريك' : 'Partner Staff Portal (Restricted)',
      subtitle: isAr
        ? 'انتقالات حالة العينة وإغلاق مهام المتابعة'
        : 'Collector, lab tech transitions & human follow-up closure',
      icon: FileCheck,
      view: 'partner-portal',
    },
    {
      label: isAr ? 'تسجيل مختبر شريك جديد' : 'Partner Lab Self-Registration',
      subtitle: isAr
        ? 'تقديم طلب للمراجعة البشرية (PendingHumanReview)'
        : 'Submit lab onboarding for human compliance review',
      icon: Building2,
      view: 'partner-apply',
    },
    {
      label: isAr ? 'حقوق البيانات والتصدير والحذف' : 'Data Rights · Export JSON/CSV & Delete',
      subtitle: isAr ? 'تصدير فوري أو مسح السجلات النشطة' : 'Export full JSON/CSV or erase active data',
      icon: Database,
      view: 'data-rights',
    },
    {
      label: isAr ? 'الخصوصية وسجل التدقيق والرسائل الصادرة' : 'Privacy, Redacted Audit & Outbox',
      subtitle: isAr
        ? 'سجل خالٍ من المعرفات الصحية وفحص التسرب'
        : 'Zero-PHI audit log, outbox & zero-numeric check',
      icon: Lock,
      view: 'privacy',
    },
    {
      label: isAr ? `عن باناسيا (${t.attribution})` : `About Panacea (${t.attribution})`,
      subtitle: isAr ? 'الحدود السريرية والشفافية المرحلية' : 'Phase scope, safety rules & reviewed FAQs',
      icon: HelpCircle,
      view: 'help',
    },
  ];

  const handleSavePlanChoice = async (choice: PlanDurationChoice) => {
    const customNum = Math.max(14, Math.min(180, parseInt(customDaysInput, 10) || 45));
    await updateProfile({ planDuration: choice, customPlanDays: customNum });
    setModalKind(null);
  };

  const handleSaveRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({
      alias: aliasInput.trim() || state?.user.alias,
      recoveryEmail: emailInput.trim(),
      recoveryPhone: phoneInput.trim(),
    });
    setModalKind(null);
  };

  return (
    <VStack gap={5}>
      <HStack gap={3} vAlign="center" hAlign="between">
        <IconButton
          label={t.common.back}
          icon={<ArrowLeft className="w-4 h-4 rtl:rotate-180" />}
          variant="secondary"
          size="sm"
          onClick={onBack}
        />
        <Heading level={1}>{t.profile.title}</Heading>
        <div className="w-8" />
      </HStack>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column */}
        <VStack gap={4} className="lg:col-span-6">
          <Card padding={5} elevation="low">
            <VStack gap={3} align="center">
              <ProfileAvatarRing
                avatar={state?.user.avatar || ''}
                name={state?.user.alias || 'amber-falcon-42'}
                badgeText={state?.user.discreetMode ? (isAr ? 'مخفي' : 'Discreet') : 'Panacea'}
                discreet={Boolean(state?.user.discreetMode)}
                completionPercent={setupCompletion}
                onClick={() => {
                  setAliasInput(state?.user.alias || '');
                  setEmailInput(state?.user.recoveryEmail || '');
                  setPhoneInput(state?.user.recoveryPhone || '');
                  setModalKind('recovery');
                }}
              />
              <VStack gap={0.5} align="center">
                <Heading level={2}>{state?.user.alias || 'amber-falcon-42'}</Heading>
                <Text type="supporting" color="secondary">
                  {state?.user.recoveryEmail ||
                    state?.user.recoveryPhone ||
                    (isAr ? 'حساب خاص مستعار (اضغط لإعداد الاسترداد)' : 'Alias-only mode (tap to set recovery)')}
                </Text>
              </VStack>
            </VStack>
          </Card>

          {noRecovery && (
            <Banner
              status="warning"
              title={
                isAr ? 'لم يتم تعيين وسيلة استرداد للحساب' : 'Recovery Contact Recommended'
              }
              description={
                isAr
                  ? 'يمكنك الاستمرار بالاسم المستعار فقط، لكن الاسترداد يحمي سجلاتك.'
                  : 'Add an optional email or phone so you do not lose access to reports.'
              }
              endContent={
                <Button
                  size="sm"
                  variant="secondary"
                  label={isAr ? 'إضافة' : 'Set'}
                  onClick={() => setModalKind('recovery')}
                />
              }
            />
          )}

          {/* 2x2 Quick Preference Cards */}
          <Grid columns={2} gap={3}>
            <ClickableCard
              label={t.profile.grid.language}
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              padding={3}
              elevation="low"
            >
              <HStack gap={3} vAlign="center">
                <Globe className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
                <div className="min-w-0">
                  <Text type="supporting" color="secondary" display="block">
                    {t.profile.grid.language}
                  </Text>
                  <Text weight="semibold" maxLines={1}>
                    {language === 'en' ? 'English (LTR)' : 'العربية (RTL)'}
                  </Text>
                </div>
              </HStack>
            </ClickableCard>

            <ClickableCard
              label={t.profile.grid.planDays}
              onClick={() => setModalKind('plan')}
              padding={3}
              elevation="low"
            >
              <HStack gap={3} vAlign="center">
                <CalendarIcon className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
                <div className="min-w-0">
                  <Text type="supporting" color="secondary" display="block">
                    {t.profile.grid.planDays}
                  </Text>
                  <Text weight="semibold" className="tabular-nums" maxLines={1}>
                    {currentPlanDays} {t.common.daysSuffix}
                  </Text>
                </div>
              </HStack>
            </ClickableCard>

            <ClickableCard
              label={t.profile.grid.area}
              onClick={() => setModalKind('area')}
              padding={3}
              elevation="low"
            >
              <HStack gap={3} vAlign="center">
                <MapPin className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
                <div className="min-w-0">
                  <Text type="supporting" color="secondary" display="block">
                    {t.profile.grid.area}
                  </Text>
                  <Text weight="semibold" maxLines={1}>
                    {state?.user.dubaiDistrict || 'Dubai DHCC'}
                  </Text>
                </div>
              </HStack>
            </ClickableCard>

            <Card padding={3} elevation="low">
              <HStack gap={2} vAlign="center" hAlign="between">
                <HStack gap={2} vAlign="center">
                  <EyeOff className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                  <Text weight="semibold" maxLines={1}>
                    {t.profile.grid.discreet}
                  </Text>
                </HStack>
                <Switch
                  label={t.profile.grid.discreet}
                  isLabelHidden
                  value={Boolean(state?.user.discreetMode)}
                  onChange={(checked) => updateProfile({ discreetMode: checked })}
                />
              </HStack>
            </Card>
          </Grid>
        </VStack>

        {/* Right Column */}
        <VStack gap={4} className="lg:col-span-6">
          <Card padding={0} elevation="low">
            <List hasDividers edge="bleed">
              <ListItem
                label={t.profile.watchRow}
                description={isAr ? 'مزامنة قراءة فقط لعادات النوم والنشاط' : 'Read-only sleep, HR & step habits'}
                startContent={<Watch className="w-4 h-4 text-[var(--color-accent)]" />}
                endContent={<ChevronRight className="w-4 h-4 text-secondary rtl:rotate-180" />}
                onClick={() => onOpenSubView('watch')}
              />
              <ListItem
                label={t.profile.notificationsRow}
                description={isAr ? 'تذكيرات محايدة ومتابعة المهام البشرية' : 'Neutral lock screen & Stay Alert human follow-ups'}
                startContent={<Bell className="w-4 h-4 text-[var(--color-accent)]" />}
                endContent={<ChevronRight className="w-4 h-4 text-secondary rtl:rotate-180" />}
                onClick={() => onOpenSubView('notifications')}
              />
            </List>
          </Card>

          <VStack gap={2}>
            <Text type="supporting" color="secondary" weight="semibold">
              {t.profile.accountHeading}
            </Text>
            <Card padding={0} elevation="low">
              <List hasDividers edge="bleed">
                {governanceItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <ListItem
                      key={item.view}
                      label={item.label}
                      description={item.subtitle}
                      startContent={<Icon className="w-4 h-4 text-[var(--color-accent)]" />}
                      endContent={<ChevronRight className="w-4 h-4 text-secondary rtl:rotate-180" />}
                      onClick={() => onOpenSubView(item.view)}
                    />
                  );
                })}
              </List>
            </Card>
          </VStack>
        </VStack>
      </div>

      {/* Plan Duration Modal */}
      <CustomModal
        isOpen={modalKind === 'plan'}
        onClose={() => setModalKind(null)}
        title={isAr ? 'اختيار مدة الخطة المرنة' : 'Flexible Habit Plan Duration'}
      >
        <VStack gap={4}>
          <Text type="supporting" color="secondary">
            {isAr
              ? '٧٤ يوماً هي نقطة مرجعية افتراضية للخطة فقط وليست دورة بيولوجية إلزامية ولا بديلاً عن موعد إعادة الفحص السريري.'
              : '74 days is an optional default checkpoint for effort tracking only — not a fixed biological countdown or clinical retest date.'}
          </Text>

          <Grid columns={2} gap={2}>
            {PLAN_DURATION_OPTIONS.map((opt) => {
              const active = state?.user.planDuration === opt.value;
              return (
                <Button
                  key={String(opt.value)}
                  variant={active ? 'primary' : 'secondary'}
                  width="100%"
                  label={`${isAr ? opt.labelAr : opt.labelEn}${
                    opt.recommended ? ` · ${t.common.recommended}` : ''
                  }`}
                  onClick={() => {
                    if (opt.value !== 'custom') handleSavePlanChoice(opt.value);
                  }}
                />
              );
            })}
          </Grid>

          <HStack gap={2} vAlign="end">
            <div className="flex-1">
              <TextInput
                label={isAr ? 'أيام مخصصة (١٤–١٨٠)' : 'Custom Days (14–180)'}
                value={customDaysInput}
                onChange={setCustomDaysInput}
                inputMode="numeric"
              />
            </div>
            <Button
              variant="primary"
              label={t.common.save}
              onClick={() => handleSavePlanChoice('custom')}
            />
          </HStack>
        </VStack>
      </CustomModal>

      {/* Dubai Area / Boundary Modal */}
      <CustomModal
        isOpen={modalKind === 'area'}
        onClose={() => setModalKind(null)}
        title={isAr ? 'تحديد الموقع (نطاق ٥ كم في دبي)' : 'Dubai Location (5.000 km Boundary)'}
      >
        <List hasDividers edge="flush">
          {DUBAI_LOCATION_PRESETS.map((preset) => (
            <ListItem
              key={preset.id}
              label={isAr ? preset.labelAr : preset.labelEn}
              description={isAr ? preset.expectedNoteAr : preset.expectedNoteEn}
              isSelected={state?.user.dubaiDistrict === preset.labelEn}
              onClick={async () => {
                await updateProfile({
                  dubaiDistrict: preset.labelEn,
                  userLat: preset.lat,
                  userLng: preset.lng,
                });
                setModalKind(null);
              }}
            />
          ))}
        </List>
      </CustomModal>

      {/* Alias & Recovery Modal */}
      <CustomModal
        isOpen={modalKind === 'recovery'}
        onClose={() => setModalKind(null)}
        title={isAr ? 'الاسم المستعار وبيانات الاسترداد' : 'Private Alias & Account Recovery'}
      >
        <form onSubmit={handleSaveRecovery}>
          <VStack gap={4}>
            <TextInput
              label={isAr ? 'الاسم المستعار' : 'Display Alias'}
              value={aliasInput}
              onChange={setAliasInput}
            />
            <TextInput
              type="email"
              label={isAr ? 'بريد الاسترداد (اختياري)' : 'Recovery Email (Optional)'}
              value={emailInput}
              onChange={setEmailInput}
              placeholder="name@example.com"
            />
            <TextInput
              type="tel"
              label={isAr ? 'هاتف الاسترداد (اختياري)' : 'Recovery Phone (Optional)'}
              value={phoneInput}
              onChange={setPhoneInput}
              placeholder="+971 50 ..."
            />
            <HStack gap={2} hAlign="end">
              <Button variant="ghost" label={t.common.cancel} onClick={() => setModalKind(null)} />
              <Button type="submit" variant="primary" label={t.common.save} />
            </HStack>
          </VStack>
        </form>
      </CustomModal>
    </VStack>
  );
};
