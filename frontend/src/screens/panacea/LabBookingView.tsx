import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  Clock,
  MapPin,
  Ticket,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { DUBAI_LOCATION_PRESETS } from '../../data/panaceaCatalogs';
import { usePanacea } from '../../store/PanaceaContext';
import type { PartnerLabSite, SubView } from '../../types/panacea';
import { postApiJson } from '../../services/penanciaApiClient';

interface LabBookingViewProps {
  onBack: () => void;
  onOpenSubView: (view: SubView) => void;
}

interface QuoteResult {
  partner: PartnerLabSite;
  distanceKm: number;
  within5KmBoundary: boolean;
  homeCollectionEligible: boolean;
  ineligibilityReasonEn: string | null;
  ineligibilityReasonAr: string | null;
  centreSlots: string[];
  homeSlots: string[];
  totalCentreAed: number;
  totalHomeAed: number;
}

export const LabBookingView: React.FC<LabBookingViewProps> = ({ onBack, onOpenSubView }) => {
  const { state, language, refreshState, updateProfile, toggleConsent } = usePanacea();
  const isAr = language === 'ar';

  const [selectedPresetId, setSelectedPresetId] = useState(DUBAI_LOCATION_PRESETS[0].id);
  const [locationDenied, setLocationDenied] = useState(false);
  const [quotes, setQuotes] = useState<QuoteResult[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [chosenPartnerId, setChosenPartnerId] = useState<string>('partner-dhc-simulated');
  const [chosenMode, setChosenMode] = useState<'home_collection' | 'centre_appointment'>(
    'centre_appointment'
  );
  const [chosenSlot, setChosenSlot] = useState<string>('Tomorrow 08:30 AM (Centre)');

  const [includeAbstinenceNote, setIncludeAbstinenceNote] = useState(true);
  const [includeScreeningReason, setIncludeScreeningReason] = useState(false);
  const [consentApproved, setConsentApproved] = useState(true);
  const [activeIdemKey, setActiveIdemKey] = useState<string>(() => `idem_${Date.now()}`);
  const [bookingMsg, setBookingMsg] = useState<string | null>(null);
  const [bookingErr, setBookingErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activePreset =
    DUBAI_LOCATION_PRESETS.find((p) => p.id === selectedPresetId) || DUBAI_LOCATION_PRESETS[0];

  const fetchQuotes = async (
    lat: number,
    lng: number,
    denied: boolean,
    forceCapZero?: boolean
  ) => {
    setLoadingQuotes(true);
    setQuoteError(null);
    try {
      const data = await postApiJson<{ quotes: QuoteResult[] }>('/v1/quotes', {
        userLat: lat,
        userLng: lng,
        locationDenied: denied,
        forceCapacityZero: Boolean(forceCapZero),
      });
      setQuotes(data.quotes);
      const primary =
        data.quotes.find((q) => q.partner.partnerId === chosenPartnerId) || data.quotes[0];
      if (primary) {
        if (primary.homeCollectionEligible && primary.homeSlots.length > 0) {
          setChosenMode('home_collection');
          setChosenSlot(primary.homeSlots[0]);
        } else {
          setChosenMode('centre_appointment');
          setChosenSlot(primary.centreSlots[0] || 'Tomorrow 08:30 AM (Centre)');
        }
      }
    } catch (err) {
      setQuotes([]);
      setQuoteError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تحميل عروض المختبر من الخادم.'
            : 'Could not load lab quotes from the backend.',
      );
    } finally {
      setLoadingQuotes(false);
    }
  };

  useEffect(() => {
    fetchQuotes(
      activePreset.lat,
      activePreset.lng,
      locationDenied,
      activePreset.forceCapacityZero
    );
  }, [selectedPresetId, locationDenied]);

  const handleSelectPreset = async (presetId: string) => {
    setSelectedPresetId(presetId);
    setActiveIdemKey(`idem_${Date.now()}`);
    const p = DUBAI_LOCATION_PRESETS.find((x) => x.id === presetId);
    if (p) {
      await updateProfile({ dubaiDistrict: p.labelEn, userLat: p.lat, userLng: p.lng });
    }
  };

  const handleBookOrder = async (explicitDeclineConsent?: boolean) => {
    setSubmitting(true);
    setBookingErr(null);
    setBookingMsg(null);
    try {
      const approveShare = explicitDeclineConsent ? false : consentApproved;
      const optionalFields: string[] = [];
      if (includeAbstinenceNote) optionalFields.push('Abstinence timing note');
      if (includeScreeningReason) optionalFields.push('Summary routing flag');

      const data = await postApiJson<{
        order: { ticketCode: string };
        idempotentReplay?: boolean;
      }>('/v1/orders', {
        partnerId: chosenPartnerId,
        mode: chosenMode,
        slotLabel: chosenSlot,
        selectedFields: ['Opaque Ticket Code', 'Selected Test: Semen Analysis', 'Slot Window'],
        optionalFieldsIncluded: optionalFields,
        consentApproved: approveShare,
      }, { 'Idempotency-Key': activeIdemKey });
      setBookingMsg(
        data.idempotentReplay
          ? isAr
            ? `تم منع التكرار بنجاح (Idempotency Replay): نفس التذكرة ${data.order.ticketCode}.`
            : `Idempotent Replay Verified: Returned same ticket ${data.order.ticketCode} without double-booking.`
          : isAr
            ? `تم تأكيد الحجز المحاكى! رقم التذكرة: ${data.order.ticketCode}`
            : `Simulated Booking Confirmed! Opaque Ticket: ${data.order.ticketCode}`
      );
      await refreshState();
    } catch (err) {
      setBookingErr(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تأكيد الحجز على الخادم.'
            : 'The backend could not confirm this booking.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const orders = state?.orders || [];
  const shareConsentOn = Boolean(state?.consents.share_clinic?.state);

  return (
    <VStack gap={5}>
      <HStack gap={3} vAlign="center" hAlign="between">
        <HStack gap={3} vAlign="center" className="min-w-0">
          <IconButton
            label={isAr ? 'رجوع' : 'Back'}
            icon={<ArrowLeft className="w-4 h-4 rtl:rotate-180" />}
            variant="secondary"
            size="sm"
            onClick={onBack}
          />
          <div className="min-w-0">
            <Heading level={1}>
              {isAr ? 'حجز المختبر وقاعدة ٥ كم' : 'Lab Booking & 5.000 km Rule'}
            </Heading>
            <Text type="supporting" color="accent" weight="semibold">
              {isAr ? 'نطاق دبي · دفع وشريك محاكى' : 'Dubai-First Fixture · Simulated Partner & Checkout'}
            </Text>
          </div>
        </HStack>

        <Button
          size="sm"
          variant="secondary"
          icon={<Building2 className="w-4 h-4" />}
          label={isAr ? 'بوابة المختبر' : 'Staff Portal'}
          onClick={() => onOpenSubView('partner-portal')}
        />
      </HStack>

      {/* Location & 5.000 km Boundary Tester */}
      <Card padding={4} elevation="low">
        <VStack gap={3}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <HStack gap={2} vAlign="center">
              <MapPin className="w-4 h-4 text-[var(--color-accent)]" />
              <Heading level={2}>
                {isAr ? 'منطقة دبي واختبار حد ٥٫٠٠٠ كم' : 'Dubai Location & 5.000 km Boundary'}
              </Heading>
            </HStack>
            <Button
              size="sm"
              variant={locationDenied ? 'primary' : 'secondary'}
              label={
                locationDenied
                  ? isAr
                    ? 'الموقع مرفوض (يدوي)'
                    : 'Location Denied: ON'
                  : isAr
                    ? 'محاكاة رفض الموقع'
                    : 'Simulate Location Denied'
              }
              onClick={() => setLocationDenied((v) => !v)}
            />
          </HStack>

          <Grid columns={{ minWidth: 230, max: 2 }} gap={2}>
            {DUBAI_LOCATION_PRESETS.map((preset) => (
              <SelectableCard
                key={preset.id}
                label={isAr ? preset.labelAr : preset.labelEn}
                isSelected={selectedPresetId === preset.id}
                onChange={() => handleSelectPreset(preset.id)}
                padding={3}
              >
                <VStack gap={0.5}>
                  <Text weight="semibold">{isAr ? preset.labelAr : preset.labelEn}</Text>
                  <Text type="supporting" color="secondary">
                    {isAr ? preset.expectedNoteAr : preset.expectedNoteEn}
                  </Text>
                </VStack>
              </SelectableCard>
            ))}
          </Grid>
        </VStack>
      </Card>

      {/* Verified Partner Quotes */}
      <VStack gap={3}>
        <Heading level={2}>
          {isAr ? 'عروض الشركاء المؤكدة (محاكاة)' : 'Verified Partner Quotes (Simulated Adapter)'}
        </Heading>

        {quoteError && <Banner status="error" title={quoteError} />}

        {loadingQuotes ? (
          <Card padding={4}>
            <Text type="supporting" color="secondary">
              {isAr ? 'جاري احتساب المسافة والسعة...' : 'Calculating server-side distance & slot capacity...'}
            </Text>
          </Card>
        ) : (
          quotes.map((q) => {
            const isSelectedPartner = q.partner.partnerId === chosenPartnerId;
            return (
              <Card
                key={q.partner.partnerId}
                padding={4}
                elevation={isSelectedPartner ? 'med' : 'low'}
                variant={isSelectedPartner ? 'purple' : 'default'}
              >
                <VStack gap={3}>
                  <HStack gap={2} vAlign="start" hAlign="between" wrap="wrap">
                    <div className="min-w-0">
                      <HStack gap={1.5} wrap="wrap">
                        <Badge
                          label={
                            q.partner.isSyntheticFixture
                              ? isAr
                                ? 'نموذج أبوظبي اصطناعي'
                                : 'Synthetic Abu Dhabi Fixture'
                              : isAr
                                ? 'نموذج دبي الأساسي'
                                : 'Dubai-First Simulated Fixture'
                          }
                          variant="info"
                        />
                        <Badge label={`${q.distanceKm.toFixed(3)} km`} variant="neutral" />
                      </HStack>
                      <Heading level={3} className="mt-1.5">
                        {isAr ? q.partner.nameAr : q.partner.nameEn}
                      </Heading>
                      <Text type="supporting" color="secondary">
                        {isAr ? q.partner.addressAr : q.partner.addressEn}
                      </Text>
                    </div>
                    {!isSelectedPartner && (
                      <Button
                        size="sm"
                        variant="secondary"
                        label={isAr ? 'اختيار المختبر' : 'Choose Lab'}
                        onClick={() => setChosenPartnerId(q.partner.partnerId)}
                      />
                    )}
                  </HStack>

                  <Banner
                    status={q.homeCollectionEligible ? 'success' : 'warning'}
                    title={
                      q.homeCollectionEligible
                        ? isAr
                          ? `مؤهل للاستلام المنزلي (<= ٥٫٠٠٠ كم · نافذة ${q.partner.homeWindowMinutes} دقيقة · ${q.partner.homeSlotsAvailable} مواعيد)`
                          : `Home Collection Eligible (<= 5.000 km · ${q.partner.homeWindowMinutes}m handling window · ${q.partner.homeSlotsAvailable} slots)`
                        : isAr
                          ? q.ineligibilityReasonAr || ''
                          : q.ineligibilityReasonEn || ''
                    }
                  />

                  {isSelectedPartner && (
                    <VStack gap={3}>
                      <Divider />
                      <Grid columns={2} gap={2}>
                        <ClickableCard
                          label={isAr ? 'استلام منزلي' : 'Home Collection'}
                          isDisabled={!q.homeCollectionEligible}
                          variant={chosenMode === 'home_collection' ? 'purple' : 'default'}
                          onClick={() => {
                            if (!q.homeCollectionEligible) return;
                            setChosenMode('home_collection');
                            if (q.homeSlots[0]) setChosenSlot(q.homeSlots[0]);
                          }}
                          padding={3}
                        >
                          <VStack gap={0.5}>
                            <Text type="supporting" weight="semibold">
                              {isAr ? 'استلام منزلي' : 'Home Collection'}
                            </Text>
                            <Heading level={3} color="accent" className="tabular-nums">
                              {q.totalHomeAed} AED
                            </Heading>
                          </VStack>
                        </ClickableCard>

                        <ClickableCard
                          label={isAr ? 'موعد بالمركز' : 'Centre Appointment'}
                          variant={chosenMode === 'centre_appointment' ? 'purple' : 'default'}
                          onClick={() => {
                            setChosenMode('centre_appointment');
                            if (q.centreSlots[0]) setChosenSlot(q.centreSlots[0]);
                          }}
                          padding={3}
                        >
                          <VStack gap={0.5}>
                            <Text type="supporting" weight="semibold">
                              {isAr ? 'موعد بالمركز' : 'Centre Appointment'}
                            </Text>
                            <Heading level={3} color="accent" className="tabular-nums">
                              {q.totalCentreAed} AED
                            </Heading>
                          </VStack>
                        </ClickableCard>
                      </Grid>

                      <HStack gap={2} wrap="wrap">
                        {(chosenMode === 'home_collection' ? q.homeSlots : q.centreSlots).map(
                          (slot) => (
                            <Button
                              key={slot}
                              size="sm"
                              variant={chosenSlot === slot ? 'primary' : 'secondary'}
                              label={slot}
                              onClick={() => setChosenSlot(slot)}
                            />
                          )
                        )}
                      </HStack>

                      <Text type="supporting" color="secondary">
                        {isAr
                          ? 'موعدك مجدول. قد يظل المركز بحاجة لاستكمال التحقق من الهوية والسلامة، وقد يختلف وقت الانتظار.'
                          : 'Your appointment is scheduled. The centre still completes identity and safety checks; waiting time can vary.'}
                      </Text>
                    </VStack>
                  )}
                </VStack>
              </Card>
            );
          })
        )}
      </VStack>

      {/* ConsentPack Preview & Simulated Checkout */}
      <Card padding={4} elevation="low" variant="purple">
        <VStack gap={3}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <Heading level={2}>
              {isAr ? 'معاينة حزمة الموافقة (ConsentPack)' : 'ConsentPack Preview (Before Dispatch)'}
            </Heading>
            {!shareConsentOn && (
              <Button
                size="sm"
                variant="primary"
                label={isAr ? 'تفعيل share_clinic' : 'Enable share_clinic'}
                onClick={() => toggleConsent('share_clinic', true)}
              />
            )}
          </HStack>

          <Card padding={3}>
            <VStack gap={2}>
              <Text>
                <strong>{isAr ? 'المستلم:' : 'Recipient:'}</strong> {chosenPartnerId}
              </Text>
              <Text type="supporting" color="secondary">
                {isAr
                  ? 'الحقول الأساسية: رمز التذكرة المجهول، الفحص المحدد (Semen Analysis)، ونافذة الموعد. لا يتم إرسال تاريخك الشخصي أو الاستبيان الكامل.'
                  : 'Required minimum fields: Opaque Ticket ID, Selected Test (Semen Analysis), and Slot Window. Full health history is NEVER auto-sent.'}
              </Text>
              <Divider />
              <CheckboxInput
                label={
                  isAr ? 'إرفاق ملاحظة أيام الامتناع (اختياري)' : 'Optional: Include abstinence window note'
                }
                value={includeAbstinenceNote}
                onChange={setIncludeAbstinenceNote}
              />
              <CheckboxInput
                label={
                  isAr ? 'إرفاق ملخص التوجيه فقط (اختياري)' : 'Optional: Include 1-line pathway summary'
                }
                value={includeScreeningReason}
                onChange={setIncludeScreeningReason}
              />
              <CheckboxInput
                label={
                  isAr
                    ? 'أوافق على إرسال حزمة الموافقة المحددة أعلاه'
                    : 'Approve sending this exact ConsentPack'
                }
                value={consentApproved}
                onChange={setConsentApproved}
              />
            </VStack>
          </Card>

          {bookingErr && <Banner status="error" title={bookingErr} />}
          {bookingMsg && <Banner status="success" title={bookingMsg} />}

          <HStack gap={2} wrap="wrap">
            <Button
              variant="primary"
              isLoading={submitting}
              label={
                isAr ? 'تأكيد الحجز المحاكى (دون خصم فعلي)' : 'Confirm Simulated Booking (No Charge)'
              }
              onClick={() => handleBookOrder(false)}
            />
            <Button
              variant="secondary"
              isDisabled={submitting}
              label={isAr ? 'اختبار رفض المشاركة' : 'Test Decline Share'}
              onClick={() => handleBookOrder(true)}
            />
          </HStack>

          <Text type="supporting" color="secondary" className="font-mono">
            Idempotency-Key: {activeIdemKey} (
            {isAr
              ? 'الضغط مرتين يمنع الحجز المكرر'
              : 'double-tap returns same ticket without duplicate charge'}
            )
          </Text>
        </VStack>
      </Card>

      {/* Active Tickets */}
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <Heading level={2}>
            {isAr
              ? `التذاكر ومسار العينة (${orders.length})`
              : `Active Tickets & Confirmed Events (${orders.length})`}
          </Heading>
          {orders.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              label={isAr ? 'تحديث موظف المختبر ->' : 'Advance in Staff Portal ->'}
              onClick={() => onOpenSubView('partner-portal')}
            />
          )}
        </HStack>

        {orders.length === 0 ? (
          <Card padding={4}>
            <EmptyState
              isCompact
              title={isAr ? 'لا توجد حجوزات بعد' : 'No Active Bookings Yet'}
              description={
                isAr
                  ? 'أكد حجزاً محاكى أعلاه لإصدار تذكرة مجهولة الهوية.'
                  : 'Confirm a simulated booking above to generate an opaque ticket.'
              }
            />
          </Card>
        ) : (
          orders.map((ord) => (
            <Card key={ord.orderId} padding={4} elevation="low">
              <VStack gap={3}>
                <HStack gap={2} vAlign="center" hAlign="between">
                  <HStack gap={2} vAlign="center">
                    <Ticket className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
                    <div>
                      <Text weight="bold" className="tabular-nums">
                        {ord.ticketCode} ·{' '}
                        {ord.mode === 'home_collection'
                          ? isAr
                            ? 'منزلي'
                            : 'Home Pickup'
                          : isAr
                            ? 'مركز'
                            : 'Centre'}
                      </Text>
                      <Text type="supporting" color="secondary" display="block">
                        {ord.slotLabel}
                      </Text>
                    </div>
                  </HStack>
                  <Badge label={ord.state} variant="info" />
                </HStack>

                <Divider />

                <VStack gap={2}>
                  {ord.events.slice(0, 4).map((ev) => (
                    <HStack key={ev.eventId} gap={2} vAlign="start">
                      <Clock className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0 mt-1" />
                      <div>
                        <Text weight="semibold">
                          {ev.state}{' '}
                          <Text type="supporting" color="secondary">
                            ({ev.actorName})
                          </Text>
                        </Text>
                        <Text type="supporting" color="secondary" display="block">
                          {ev.note}
                        </Text>
                      </div>
                    </HStack>
                  ))}
                </VStack>

                {ord.state === 'SpecimenRejected' && (
                  <Button
                    variant="secondary"
                    icon={<ClipboardList className="w-4 h-4" />}
                    label={
                      isAr
                        ? 'إنشاء طلب إعادة جمع مرتبط بالطلب الأصلي'
                        : 'Schedule Linked Recollection Order'
                    }
                    onClick={() => {
                      setActiveIdemKey(`recollect_${Date.now()}`);
                      handleBookOrder(false);
                    }}
                  />
                )}
              </VStack>
            </Card>
          ))
        )}
      </VStack>
    </VStack>
  );
};
