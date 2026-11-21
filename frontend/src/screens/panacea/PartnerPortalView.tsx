import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Ticket,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { usePanacea } from '../../store/PanaceaContext';
import type { SpecimenOrderState } from '../../types/panacea';

interface PartnerPortalViewProps {
  onBack: () => void;
  initialMode?: 'staff' | 'apply';
}

const NEXT_STEPS: Array<{
  state: SpecimenOrderState;
  label: string;
  role: 'collector' | 'lab_tech' | 'lab_director';
}> = [
  { state: 'CollectorAssigned', label: 'Assign Collector', role: 'collector' },
  { state: 'Collected', label: 'Mark Collected', role: 'collector' },
  { state: 'InTransit', label: 'Mark InTransit', role: 'collector' },
  { state: 'Received', label: 'Lab Received', role: 'lab_tech' },
  { state: 'Accepted', label: 'Lab Accepted', role: 'lab_tech' },
  { state: 'Processing', label: 'Processing', role: 'lab_tech' },
  { state: 'ReportReady', label: 'Deliver Signed Report', role: 'lab_director' },
];

export const PartnerPortalView: React.FC<PartnerPortalViewProps> = ({
  onBack,
  initialMode = 'staff',
}) => {
  const { state, language, refreshState, acknowledgeFollowUp, resolveFollowUpHuman } =
    usePanacea();
  const isAr = language === 'ar';

  const [tab, setTab] = useState<'staff' | 'apply'>(initialMode);
  const [ticketQuery, setTicketQuery] = useState('');
  const [deliverCritical, setDeliverCritical] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState(
    'Called patient directly, discussed signed lab findings & scheduled urology visit.'
  );

  // Self-registration form state
  const [labName, setLabName] = useState('');
  const [emirate, setEmirate] = useState('Dubai');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [appSubmittedMsg, setAppSubmittedMsg] = useState<string | null>(null);

  const orders = state?.orders || [];
  const filteredOrders = ticketQuery.trim()
    ? orders.filter((o) => o.ticketCode.toLowerCase().includes(ticketQuery.trim().toLowerCase()))
    : orders;
  const followUps = state?.followUpTasks || [];
  const applications = state?.partnerApplications || [];

  const triggerTransition = async (
    orderId: string,
    nextState: SpecimenOrderState,
    role: 'collector' | 'lab_tech' | 'lab_director' | 'system',
    rejectionReason?: string
  ) => {
    const resp = await fetch(`/v1/partner/orders/${orderId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nextState,
        actorRole: role,
        actorName: role === 'lab_director' ? 'Dr. Tariq Al-Mansoor' : 'DHCC Partner Staff #14',
        rejectionReason,
        deliverCriticalSample: deliverCritical,
      }),
    });
    const data = await resp.json();
    setStatusFeedback(isAr ? data.message_ar : data.message_en);
    await refreshState();
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    const resp = await fetch('/v1/partner/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labName,
        emirate,
        licenceNumber,
        contactEmail,
        servicesOffered: ['WHO 6th-Ed Semen Analysis', 'Home Collection <= 5 km'],
      }),
    });
    if (resp.ok) {
      setLabName('');
      setLicenceNumber('');
      setContactEmail('');
      setAppSubmittedMsg(
        isAr
          ? 'تم إرسال الطلب إلى قائمة المراجعة البشرية المقيدة (PendingHumanReview). لا يُنشر أي مختبر تلقائياً.'
          : 'Submitted to PendingHumanReview queue. Uploaded evidence is never auto-published as a bookable lab.'
      );
      await refreshState();
    }
  };

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
              {isAr ? 'بوابة موظفي المختبر والتسجيل' : 'Partner Staff Portal & Onboarding'}
            </Heading>
            <Text type="supporting" color="accent">
              {isAr
                ? 'جلسة شريك مقيدة · بدون بحث عام'
                : 'Tenant-Scoped Staff Desk · Simulated Events'}
            </Text>
          </div>
        </HStack>
      </HStack>

      <SegmentedControl
        label={isAr ? 'وضع البوابة' : 'Portal mode'}
        value={tab}
        onChange={(v) => setTab(v as 'staff' | 'apply')}
        layout="fill"
      >
        <SegmentedControlItem
          value="staff"
          label={isAr ? 'مكتب موظفي المختبر' : 'Staff Order Desk'}
        />
        <SegmentedControlItem
          value="apply"
          label={isAr ? 'تسجيل مختبر شريك' : 'Lab Self-Registration'}
        />
      </SegmentedControl>

      {tab === 'staff' ? (
        <VStack gap={4}>
          <Banner
            status="info"
            title={isAr ? 'وصول مقيد برمز التذكرة' : 'Restricted ConsentPack Access'}
            description={
              isAr
                ? 'الوصول مقيد برمز التذكرة المخصص فقط. لا يمكن لموظف المختبر استعراض الاستبيان الصحي أو الخزنة الخاصة.'
                : 'Staff inspect assigned opaque tickets only (ConsentPack fields) and never access the patient 26-Q answers or private vault.'
            }
          />

          <TextInput
            label={isAr ? 'البحث برمز التذكرة' : 'Lookup Opaque Ticket'}
            isLabelHidden
            hasClear
            value={ticketQuery}
            onChange={setTicketQuery}
            placeholder={
              isAr ? 'ابحث برمز التذكرة (PNC-...)' : 'Lookup exact Opaque Ticket (e.g. PNC-...)'
            }
          />

          <CheckboxInput
            label={
              isAr
                ? 'عند إصدار التقرير: إرسال عينة حرجة (٠ مليون) لاختبار التصعيد البشري'
                : 'On ReportReady: Deliver Critical Lab Fixture (0.0 million/mL -> triggers Stay Alert)'
            }
            value={deliverCritical}
            onChange={setDeliverCritical}
          />

          {statusFeedback && <Banner status="info" title={statusFeedback} />}

          {filteredOrders.length === 0 ? (
            <Card padding={4}>
              <EmptyState
                isCompact
                title={isAr ? 'لا توجد طلبات مختبر حالياً' : 'No Matching Bookings'}
                description={
                  isAr
                    ? 'قم بحجز موعد من شاشة حجز المختبر أولاً.'
                    : 'Create a simulated lab booking first to test partner staff transitions.'
                }
              />
            </Card>
          ) : (
            filteredOrders.map((ord) => (
              <Card key={ord.orderId} padding={4} elevation="low">
                <VStack gap={3}>
                  <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                    <HStack gap={2} vAlign="center">
                      <Ticket className="w-4 h-4 text-[var(--color-accent)]" />
                      <div>
                        <Text weight="bold" className="tabular-nums">
                          Ticket: {ord.ticketCode}
                        </Text>
                        <Text type="supporting" color="secondary" display="block">
                          {ord.consentPack?.selectedFields.join(' · ')}
                        </Text>
                      </div>
                    </HStack>
                    <Badge label={`${ord.state} (v${ord.stateVersion})`} variant="info" />
                  </HStack>

                  <Divider />

                  <HStack gap={1.5} wrap="wrap">
                    {NEXT_STEPS.map((st) => (
                      <Button
                        key={st.state}
                        size="sm"
                        variant={ord.state === st.state ? 'primary' : 'secondary'}
                        label={st.label}
                        onClick={() => triggerTransition(ord.orderId, st.state, st.role)}
                      />
                    ))}
                    <Button
                      size="sm"
                      variant="destructive"
                      label="Reject Specimen"
                      onClick={() =>
                        triggerTransition(
                          ord.orderId,
                          'SpecimenRejected',
                          'lab_tech',
                          'Sample exceeded 45-min handling temperature window.'
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      label="Test Out-of-Order Block"
                      onClick={() => triggerTransition(ord.orderId, 'Booked', 'system')}
                    />
                  </HStack>
                </VStack>
              </Card>
            ))
          )}

          {/* Stay Alert Human Ownership Queue */}
          <VStack gap={3} className="pt-2">
            <Heading level={2}>
              {isAr
                ? 'مهام المتابعة (Stay Alert)'
                : 'Stay Alert Follow-Up Queue (Human-Owned)'}
            </Heading>

            {followUps.map((task) => (
              <Card
                key={task.taskId}
                padding={4}
                elevation="low"
                variant={task.priority === 'critical' && task.status !== 'Completed' ? 'red' : 'default'}
              >
                <VStack gap={2}>
                  <HStack gap={2} vAlign="start" hAlign="between">
                    <div>
                      <Text weight="bold">{isAr ? task.titleAr : task.titleEn}</Text>
                      <Text type="supporting" color="secondary" display="block">
                        Owner: {task.ownerName}
                      </Text>
                    </div>
                    <Badge
                      label={task.status}
                      variant={task.status === 'Completed' ? 'success' : 'warning'}
                    />
                  </HStack>

                  <Text type="supporting">
                    <strong>Known:</strong> {task.whatIsKnownEn}
                  </Text>
                  <Text type="supporting" color="secondary">
                    <strong>Unknown:</strong> {task.whatIsUnknownEn}
                  </Text>

                  {task.status !== 'Completed' && (
                    <VStack gap={2} className="pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={Boolean(task.userAcknowledgedAt)}
                        label={
                          task.userAcknowledgedAt
                            ? 'Patient Read Receipt Recorded (Still Open)'
                            : 'Patient Acknowledge (Cannot Close Critical)'
                        }
                        onClick={() => acknowledgeFollowUp(task.taskId)}
                      />

                      <HStack gap={2} vAlign="end">
                        <div className="flex-1">
                          <TextInput
                            label="Resolution note"
                            isLabelHidden
                            value={resolutionNote}
                            onChange={setResolutionNote}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<UserCheck className="w-3.5 h-3.5" />}
                          label="Clinician Resolve"
                          onClick={() =>
                            resolveFollowUpHuman(
                              task.taskId,
                              'Dr. Tariq Al-Mansoor (Clinician Owner)',
                              resolutionNote
                            )
                          }
                        />
                      </HStack>
                    </VStack>
                  )}
                </VStack>
              </Card>
            ))}
          </VStack>
        </VStack>
      ) : (
        <VStack gap={4}>
          <Banner
            status="info"
            title={isAr ? 'مراجعة بشرية إلزامية' : 'Human Governance Gate'}
            description={
              isAr
                ? 'رفع طلب الشراكة يضع المختبر في قائمة المراجعة البشرية فقط ولا ينشر أي خدمة للحجز تلقائياً.'
                : 'Restricted onboarding submission places candidate UAE labs in PendingHumanReview queue only. Never auto-publishes bookable slots.'
            }
          />

          <Card padding={4} elevation="low">
            <form onSubmit={handleSubmitApplication}>
              <VStack gap={3}>
                <TextInput
                  label={isAr ? 'اسم المختبر المرخص' : 'Laboratory Name'}
                  isRequired
                  value={labName}
                  onChange={setLabName}
                  placeholder="e.g., Emirates Andrology Reference Lab"
                />
                <HStack gap={3} wrap="wrap">
                  <div className="flex-1 min-w-[160px]">
                    <Selector
                      label={isAr ? 'الإمارة' : 'Emirate'}
                      value={emirate}
                      onChange={setEmirate}
                      options={[
                        { value: 'Dubai', label: 'Dubai (Primary Scope)' },
                        { value: 'Abu Dhabi', label: 'Abu Dhabi' },
                        { value: 'Sharjah', label: 'Sharjah' },
                      ]}
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <TextInput
                      label={isAr ? 'رقم ترخيص DHA/DOH' : 'DHA / DOH Licence No.'}
                      isRequired
                      value={licenceNumber}
                      onChange={setLicenceNumber}
                      placeholder="DHA-FAC-XXXX"
                    />
                  </div>
                </HStack>
                <TextInput
                  type="email"
                  label={isAr ? 'البريد الإلكتروني الرسمي' : 'Clinical Governance Email'}
                  isRequired
                  value={contactEmail}
                  onChange={setContactEmail}
                  placeholder="director@lab-uae.example"
                />
                <Button
                  type="submit"
                  variant="primary"
                  width="100%"
                  label={isAr ? 'إرسال لقائمة المراجعة البشرية' : 'Submit to Human Review Queue'}
                />
              </VStack>
            </form>
          </Card>

          {appSubmittedMsg && <Banner status="success" title={appSubmittedMsg} />}

          {applications.length > 0 && (
            <Card padding={4} elevation="low">
              <VStack gap={2}>
                <Heading level={3}>
                  {isAr ? 'طلبات قيد المراجعة' : 'Unlisted Review Queue'}
                </Heading>
                <List hasDividers density="compact" edge="flush">
                  {applications.map((a) => (
                    <ListItem
                      key={a.applicationId}
                      label={a.labName}
                      description={`${a.emirate} · ${a.licenceNumber}`}
                      startContent={<Building2 className="w-4 h-4 text-[var(--color-accent)]" />}
                      endContent={<Badge label={a.status} variant="warning" />}
                    />
                  ))}
                </List>
              </VStack>
            </Card>
          )}
        </VStack>
      )}
    </VStack>
  );
};
