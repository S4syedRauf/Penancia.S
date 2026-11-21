import React from 'react';
import { PhoneCall } from 'lucide-react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { usePanacea } from '../../store/PanaceaContext';

export const EmergencyOverlay: React.FC = () => {
  const { emergencyOpen, setEmergencyOpen, t, language, setSubView } = usePanacea();
  const isAr = language === 'ar';

  return (
    <Dialog
      isOpen={emergencyOpen}
      onOpenChange={setEmergencyOpen}
      width={480}
      padding={5}
      purpose="required"
    >
      <DialogHeader
        title={t.emergency.bannerTitle}
        subtitle={
          isAr ? 'توجيه سلامة فوري (يعمل بدون إنترنت)' : 'OFFLINE SAFETY INTERVENTION'
        }
        onOpenChange={setEmergencyOpen}
        hasDivider
      />
      <VStack gap={4} className="pt-4">
        <Banner
          status="error"
          role="alert"
          title={t.emergency.bannerTitle}
          description={t.emergency.bannerBody}
        />

        <Text type="supporting" color="secondary">
          {isAr
            ? 'تم إيقاف مسارات العادات والاختبار المنزلي مؤقتاً حتى استبعاد الحالات العاجلة. هذا التنبيه لا يمثل تشخيصاً طبياً.'
            : 'Routine habit plans, commerce, and home pre-screens are paused when an urgent trigger is present. This guidance is a safety triage prompt, not a diagnosis.'}
        </Text>

        <HStack gap={2} wrap="wrap" hAlign="end">
          <Button
            variant="ghost"
            label={t.common.close}
            onClick={() => setEmergencyOpen(false)}
          />
          <Button
            variant="secondary"
            label={t.emergency.openCare}
            onClick={() => {
              setEmergencyOpen(false);
              setSubView('lab-booking');
            }}
          />
          <Button
            variant="destructive"
            icon={<PhoneCall className="w-4 h-4" />}
            label={t.emergency.call998}
            href="tel:998"
          />
        </HStack>
      </VStack>
    </Dialog>
  );
};
