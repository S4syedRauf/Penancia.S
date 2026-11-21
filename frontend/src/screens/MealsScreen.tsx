import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FlaskConical,
  Lock,
  ShoppingBag,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import {
  HEALTH_LIBRARY_ARTICLES,
  PANACEA_FOOD_CATALOG,
  PANACEA_TEST_CATALOG,
} from '../data/panaceaCatalogs';
import { usePanacea } from '../store/PanaceaContext';
import type { LibraryArticle, SubView } from '../types/panacea';

interface MealsScreenProps {
  onBack: () => void;
  onOpenSubView: (view: SubView) => void;
}

export const MealsScreen: React.FC<MealsScreenProps> = ({ onBack, onOpenSubView }) => {
  const { state, language, t, toggleConsent } = usePanacea();
  const isAr = language === 'ar';
  const [section, setSection] = useState<'nutrition' | 'library'>('nutrition');
  const [articleFilter, setArticleFilter] = useState<'all' | LibraryArticle['category']>('all');
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  const userAllergies = state?.user.allergies || [];
  const noonAssistAllowed = Boolean(state?.consents.noon_assist?.state);

  const safeFoods = useMemo(() => {
    return PANACEA_FOOD_CATALOG.filter(
      (food) => !food.allergyTags.some((tag) => userAllergies.includes(tag))
    );
  }, [userAllergies]);

  const filteredArticles = useMemo(() => {
    if (articleFilter === 'all') return HEALTH_LIBRARY_ARTICLES;
    return HEALTH_LIBRARY_ARTICLES.filter((a) => a.category === articleFilter);
  }, [articleFilter]);

  const handleCopyNoonList = async () => {
    const itemNames = safeFoods.map((f) => (isAr ? f.nameAr : f.nameEn)).join('\n');
    try {
      await navigator.clipboard.writeText(itemNames);
      setCopiedMsg(
        isAr
          ? 'تم نسخ أسماء الأصناف الغذائية فقط (دون أي معرفات صحية).'
          : 'Copied food item names only (zero health IDs or clinical context).'
      );
    } catch {
      setCopiedMsg(itemNames);
    }
    setTimeout(() => setCopiedMsg(null), 3200);
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
        <Heading level={1}>{t.meals.title}</Heading>
        <Button
          variant="secondary"
          size="sm"
          label={isAr ? 'حجز مختبر' : 'Book Lab'}
          onClick={() => onOpenSubView('lab-booking')}
        />
      </HStack>

      <TabList
        value={section}
        onChange={(v) => setSection(v as 'nutrition' | 'library')}
        layout="fill"
        hasDivider
      >
        <Tab value="nutrition" label={t.meals.plannerTab} />
        <Tab value="library" label={t.meals.libraryTab} />
      </TabList>

      {copiedMsg && (
        <Banner
          status="success"
          title={copiedMsg}
          icon={<Check className="w-4 h-4" />}
        />
      )}

      {section === 'nutrition' ? (
        <VStack gap={4}>
          <Banner
            status="info"
            title={isAr ? 'مقترحات غذائية عامة فقط' : 'Everyday Whole-Food Guidance'}
            description={t.meals.nutritionDisclaimer}
            endContent={
              userAllergies.length > 0 ? (
                <Badge
                  label={
                    isAr
                      ? `مصفى للحساسية: ${userAllergies.join(', ')}`
                      : `Filtered: ${userAllergies.join(', ')}`
                  }
                  variant="success"
                />
              ) : undefined
            }
          />

          <HStack gap={2} wrap="wrap" vAlign="center" hAlign="between">
            <Button
              variant="secondary"
              size="sm"
              icon={<Copy className="w-4 h-4" />}
              label={t.meals.copyNoonList}
              onClick={handleCopyNoonList}
            />
            <Button
              variant="secondary"
              size="sm"
              isDisabled
              icon={<ShoppingBag className="w-4 h-4" />}
              label={t.meals.noonComingSoon}
              tooltip={
                isAr
                  ? 'الطلب التلقائي غير مفعل في هذه المرحلة'
                  : 'Automated grocery checkout is disabled by design'
              }
            />
          </HStack>

          {!noonAssistAllowed && (
            <Banner
              status="warning"
              title={
                isAr
                  ? 'روابط البحث في نون متوقفة في مركز الأذونات'
                  : 'Noon Search Links are turned off in Consent Centre'
              }
              endContent={
                <Button
                  size="sm"
                  variant="secondary"
                  label={isAr ? 'تفعيل' : 'Enable'}
                  onClick={() => toggleConsent('noon_assist', true)}
                />
              }
            />
          )}

          <Grid columns={{ minWidth: 280, max: 2 }} gap={3}>
            {safeFoods.map((food) => {
              const title = isAr ? food.nameAr : food.nameEn;
              const noonUrl = `https://www.noon.com/uae-en/search/?q=${encodeURIComponent(food.nameEn)}`;

              return (
                <Card key={food.id} padding={4} elevation="low">
                  <VStack gap={3}>
                    <HStack gap={3} vAlign="center">
                      <img
                        src={food.image}
                        alt={title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-md object-cover border border-border shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <Text type="supporting" color="accent" weight="semibold" display="block">
                          {isAr ? food.categoryAr : food.categoryEn}
                        </Text>
                        <Text weight="semibold" maxLines={1}>
                          {title}
                        </Text>
                      </div>
                    </HStack>

                    <Text type="supporting" color="secondary">
                      {isAr ? food.reasonAr : food.reasonEn}
                    </Text>

                    <HStack gap={2} vAlign="center" hAlign="between">
                      <Text type="supporting" color="secondary">
                        {isAr ? 'اسم الصنف فقط' : 'Item name only'}
                      </Text>
                      {noonAssistAllowed ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<ExternalLink className="w-3.5 h-3.5" />}
                          label={t.meals.openInNoon}
                          href={noonUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          isDisabled
                          label={t.meals.openInNoon}
                        />
                      )}
                    </HStack>
                  </VStack>
                </Card>
              );
            })}
          </Grid>
        </VStack>
      ) : (
        <VStack gap={5}>
          {/* Bookable vs Gated Tests */}
          <VStack gap={3}>
            <Heading level={2}>{t.meals.bookableTestsTitle}</Heading>
            {PANACEA_TEST_CATALOG.filter((item) => item.bookableInPrototype).map((item) => (
              <Card key={item.id} padding={4} elevation="low">
                <VStack gap={3}>
                  <HStack gap={3} vAlign="start" hAlign="between">
                    <HStack gap={3} vAlign="center">
                      <span className="w-10 h-10 rounded-md bg-accent-muted border border-border flex items-center justify-center shrink-0">
                        <FlaskConical className="w-5 h-5 text-accent" />
                      </span>
                      <div>
                        <Text weight="semibold" display="block">
                          {isAr ? item.nameAr : item.nameEn}
                        </Text>
                        <Text type="supporting" color="secondary">
                          {isAr ? item.purposeAr : item.purposeEn}
                        </Text>
                      </div>
                    </HStack>
                    <Badge label={`${item.indicativePriceAed} AED`} variant="success" />
                  </HStack>

                  <Text type="supporting" color="secondary">
                    {isAr ? item.limitsAr : item.limitsEn}
                  </Text>

                  <HStack gap={2} hAlign="end">
                    <Button
                      variant="primary"
                      size="sm"
                      label={isAr ? 'متابعة لحجز المختبر' : 'Proceed to Lab Booking'}
                      onClick={() => onOpenSubView('lab-booking')}
                    />
                  </HStack>
                </VStack>
              </Card>
            ))}

            <Heading level={3}>{t.meals.gatedTestsTitle}</Heading>
            <Card padding={0} elevation="low">
              <List hasDividers edge="bleed">
                {PANACEA_TEST_CATALOG.filter((item) => !item.bookableInPrototype).map((item) => (
                  <ListItem
                    key={item.id}
                    label={isAr ? item.nameAr : item.nameEn}
                    description={isAr ? item.gatedReasonAr : item.gatedReasonEn}
                    startContent={<Lock className="w-4 h-4 text-secondary" />}
                    endContent={<Badge label={isAr ? 'مقيد' : 'Gated'} variant="neutral" />}
                  />
                ))}
              </List>
            </Card>
          </VStack>

          <Divider />

          {/* Health Library */}
          <VStack gap={3}>
            <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
              <Heading level={2}>
                {isAr ? 'المكتبة الصحية المراجعة' : 'Reviewed Health Library'}
              </Heading>
              <div className="max-w-full overflow-x-auto no-scrollbar">
                <SegmentedControl
                  label={isAr ? 'تصنيف المقالات' : 'Library categories'}
                  size="sm"
                  value={articleFilter}
                  onChange={(v) => setArticleFilter(v as typeof articleFilter)}
                >
                  <SegmentedControlItem value="all" label={isAr ? 'الكل' : 'All'} />
                  <SegmentedControlItem value="library" label={isAr ? 'المكتبة' : 'Library'} />
                  <SegmentedControlItem
                    value="know_your_normal"
                    label={isAr ? 'الطبيعي' : 'Normal'}
                  />
                  <SegmentedControlItem
                    value="life_stages"
                    label={isAr ? 'المراحل' : 'Stages'}
                  />
                </SegmentedControl>
              </div>
            </HStack>

            <VStack gap={3}>
              {filteredArticles.map((art) => (
                <Card key={art.id} padding={4} elevation="low">
                  <VStack gap={2}>
                    <HStack gap={2} vAlign="center">
                      <BookOpen className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                      <Text weight="semibold">{isAr ? art.titleAr : art.titleEn}</Text>
                    </HStack>
                    <Text type="supporting" color="secondary">
                      {isAr ? art.summaryAr : art.summaryEn}
                    </Text>
                    <MetadataList columns="multi">
                      <MetadataListItem label={isAr ? 'المصدر' : 'Source'}>
                        {art.sourceCitation}
                      </MetadataListItem>
                      <MetadataListItem label={isAr ? 'المراجعة' : 'Reviewed'}>
                        {art.version} · {art.reviewedDate}
                      </MetadataListItem>
                    </MetadataList>
                  </VStack>
                </Card>
              ))}
            </VStack>
          </VStack>
        </VStack>
      )}
    </VStack>
  );
};
