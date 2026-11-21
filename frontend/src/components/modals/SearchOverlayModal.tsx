import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Microscope,
  Search,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { HEALTH_LIBRARY_ARTICLES, PANACEA_FOOD_CATALOG } from '../../data/panaceaCatalogs';
import { usePanacea } from '../../store/PanaceaContext';
import type { SubView } from '../../types/panacea';

interface SearchOverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSubView: (view: SubView) => void;
  onOpenAskTab: () => void;
}

export const SearchOverlayModal: React.FC<SearchOverlayModalProps> = ({
  isOpen,
  onClose,
  onOpenSubView,
  onOpenAskTab,
}) => {
  const { language } = usePanacea();
  const isAr = language === 'ar';
  const [query, setQuery] = useState('');

  const actions: Array<{
    id: string;
    title: string;
    subtitle: string;
    view: SubView;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'hc',
      title: isAr ? 'التقييم الصحي (٢٦ سؤالاً)' : 'Health Check (26-Q Adaptive)',
      subtitle: isAr
        ? 'تقييم الأعراض والتوجيه السريري المحدد'
        : 'Urgent safety gate & 4 deterministic pathways',
      view: 'health-check',
      icon: ClipboardCheck,
    },
    {
      id: 'rv',
      title: isAr ? 'خزنة التقارير و OCR' : 'Report Vault & OCR Confirmation',
      subtitle: isAr
        ? 'مراجعة القيم جنباً إلى جنب'
        : 'Quarantine, PII masking & side-by-side verification',
      view: 'report-vault',
      icon: FileText,
    },
    {
      id: 'lb',
      title: isAr ? 'حجز المختبر (نطاق ٥ كم)' : 'Lab Booking (5.000 km Boundary)',
      subtitle: isAr
        ? 'عروض دبي المحاكاة وحزمة الموافقة'
        : 'Verified Dubai fixture, ConsentPack & opaque ticket',
      view: 'lab-booking',
      icon: FlaskConical,
    },
    {
      id: 'hp',
      title: isAr ? 'الفحص المنزلي الأولي (بحثي)' : 'Home Pre-Screen (Research Mode)',
      subtitle: isAr
        ? 'فحص الجودة ومسار المراحل S0–S13'
        : 'Calibration, quality gate & non-numeric trace',
      view: 'semen-prescreen',
      icon: Microscope,
    },
  ];

  const qLower = query.trim().toLowerCase();

  const matchingActions = useMemo(
    () =>
      actions.filter(
        (a) =>
          !qLower ||
          a.title.toLowerCase().includes(qLower) ||
          a.subtitle.toLowerCase().includes(qLower)
      ),
    [qLower]
  );

  const matchingArticles = useMemo(
    () =>
      HEALTH_LIBRARY_ARTICLES.filter(
        (art) =>
          !qLower ||
          art.titleEn.toLowerCase().includes(qLower) ||
          art.titleAr.toLowerCase().includes(qLower) ||
          art.summaryEn.toLowerCase().includes(qLower)
      ).slice(0, 3),
    [qLower]
  );

  const matchingFoods = useMemo(
    () =>
      PANACEA_FOOD_CATALOG.filter(
        (f) =>
          !qLower ||
          f.nameEn.toLowerCase().includes(qLower) ||
          f.nameAr.toLowerCase().includes(qLower)
      ).slice(0, 4),
    [qLower]
  );

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={540}
      padding={5}
      purpose="info"
    >
      <DialogHeader
        title={isAr ? 'البحث في باناسيا والمكتبة' : 'Search Panacea & Library'}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        hasDivider
      />

      <VStack gap={4} className="pt-4">
        <TextInput
          label={isAr ? 'بحث' : 'Search'}
          isLabelHidden
          value={query}
          onChange={setQuery}
          hasAutoFocus
          hasClear
          startIcon={<Search className="w-4 h-4" />}
          placeholder={
            isAr
              ? 'ابحث عن الفحوصات، التقارير، 5 كم، نون...'
              : 'Search 26-Q, OCR, 5km lab, library...'
          }
        />

        <ClickableCard
          label={isAr ? 'فتح المساعد المقيد Ask' : 'Open Constrained Ask Assistant'}
          onClick={() => {
            onClose();
            onOpenAskTab();
          }}
          padding={3}
          variant="purple"
        >
          <HStack gap={3} vAlign="center" hAlign="between">
            <HStack gap={3} vAlign="center">
              <Sparkles className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
              <div>
                <Text weight="semibold">
                  {isAr ? 'اسأل المساعد المقيد (Ask)' : 'Open Constrained Ask Assistant'}
                </Text>
                <Text type="supporting" color="secondary" display="block">
                  {isAr
                    ? 'شرح التقارير المؤكدة، حالة العينة، والتوجيه السريع'
                    : 'Explain confirmed reports, track confirmed events, or navigate'}
                </Text>
              </div>
            </HStack>
            <ArrowRight className="w-4 h-4 text-[var(--color-accent)] rtl:rotate-180 shrink-0" />
          </HStack>
        </ClickableCard>

        {matchingActions.length > 0 && (
          <VStack gap={2}>
            <Text type="supporting" color="secondary" weight="semibold">
              {isAr ? 'مسارات الرعاية' : 'Care Workflows'}
            </Text>
            <List hasDividers density="compact" edge="flush">
              {matchingActions.map((item) => {
                const Icon = item.icon;
                return (
                  <ListItem
                    key={item.id}
                    label={item.title}
                    description={item.subtitle}
                    startContent={<Icon className="w-4 h-4 text-[var(--color-accent)]" />}
                    endContent={<ArrowRight className="w-4 h-4 text-secondary rtl:rotate-180" />}
                    onClick={() => {
                      onClose();
                      onOpenSubView(item.view);
                    }}
                  />
                );
              })}
            </List>
          </VStack>
        )}

        {matchingArticles.length > 0 && (
          <>
            <Divider />
            <VStack gap={2}>
              <Text type="supporting" color="secondary" weight="semibold">
                {isAr ? 'المكتبة الصحية المراجعة' : 'Reviewed Health Library'}
              </Text>
              <List hasDividers density="compact" edge="flush">
                {matchingArticles.map((art) => (
                  <ListItem
                    key={art.id}
                    label={isAr ? art.titleAr : art.titleEn}
                    description={isAr ? art.summaryAr : art.summaryEn}
                    startContent={<BookOpen className="w-4 h-4 text-[var(--color-accent)]" />}
                  />
                ))}
              </List>
            </VStack>
          </>
        )}

        {matchingFoods.length > 0 && (
          <>
            <Divider />
            <VStack gap={2}>
              <Text type="supporting" color="secondary" weight="semibold">
                {isAr ? 'مقترحات غذائية عامة' : 'Everyday Food Ideas'}
              </Text>
              <HStack gap={2} wrap="wrap">
                {matchingFoods.map((f) => (
                  <Badge key={f.id} label={isAr ? f.nameAr : f.nameEn} variant="neutral" />
                ))}
              </HStack>
            </VStack>
          </>
        )}
      </VStack>
    </Dialog>
  );
};
