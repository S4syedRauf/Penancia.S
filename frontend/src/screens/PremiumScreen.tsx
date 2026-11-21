import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Crown,
  PhoneCall,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import {
  ChatComposer,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
} from '@astryxdesign/core/Chat';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { usePanacea } from '../store/PanaceaContext';
import type { AskMessage, SubView } from '../types/panacea';

interface PremiumScreenProps {
  onBack: () => void;
  onOpenSubView: (view: SubView) => void;
}

export const PremiumScreen: React.FC<PremiumScreenProps> = ({ onBack, onOpenSubView }) => {
  const {
    state,
    language,
    t,
    askMessages,
    setAskMessages,
    toggleFeatureFlags,
    setEmergencyOpen,
  } = usePanacea();

  const isAr = language === 'ar';
  const [promptInput, setPromptInput] = useState('');
  const [sending, setSending] = useState(false);

  const llmMode = state?.featureFlags.askLlmMode || 'Full';

  const quickPrompts = isAr
    ? [
        'اشرح لي آخر تقرير مؤكد',
        'ما هي حالة طلبي المخبري؟',
        'أين مسار التقييم الصحي؟',
        'لدي ألم شديد وتورم مفاجئ',
      ]
    : [
        'Explain my confirmed lab report',
        'Track my latest lab order',
        'Where is my 26-Q care pathway?',
        'Sudden severe testicular pain',
      ];

  const handleSend = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    const userMsg: AskMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    setAskMessages((prev) => [...prev, userMsg]);
    setPromptInput('');
    setSending(true);

    try {
      const resp = await fetch('/v1/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, language }),
      });
      const data = await resp.json();
      if (data.urgentAlert) {
        setEmergencyOpen(true);
      }
      const assistantMsg: AskMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: data.text || (isAr ? 'تم تجهيز الرد المقيد.' : 'Constrained reply ready.'),
        sourceLabels: data.sourceLabels || [],
        buttons: data.buttons || [],
        urgentAlert: Boolean(data.urgentAlert),
        modeUsed: data.modeUsed,
        createdAt: new Date().toISOString(),
      };
      setAskMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const fallbackMsg: AskMessage = {
        id: `a_off_${Date.now()}`,
        role: 'assistant',
        text: isAr
          ? 'الاتصال غير متاح الآن. إذا كان لديك ألم شديد أو تورم أو دم، اتصل فوراً على ٩٩٨.'
          : 'Network unavailable. If you have sudden severe pain, swelling, or blood, call UAE 998 immediately.',
        sourceLabels: [isAr ? 'الوضع دون اتصال' : 'Offline Safety Fallback'],
        modeUsed: 'Off',
        createdAt: new Date().toISOString(),
      };
      setAskMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <VStack gap={4}>
      <HStack gap={3} vAlign="center" hAlign="between">
        <IconButton
          label={t.common.back}
          icon={<ArrowLeft className="w-4 h-4 rtl:rotate-180" />}
          variant="secondary"
          size="sm"
          onClick={onBack}
        />
        <Heading level={1}>{isAr ? 'الوصول المفتوح والمساعد المقيد' : 'Open Access & Constrained Ask'}</Heading>
        <Badge label={isAr ? 'مجاني' : 'Open'} variant="success" />
      </HStack>

      <Banner
        status="success"
        title={isAr ? 'الرعاية والسلامة مجانية بدون جدار دفع' : 'Clinical & Safety Features Never Paywalled'}
        description={
          isAr
            ? 'جميع ميزات التقييم الصحي والخزنة وحجز المختبر والمتابعة متاحة دون اشتراك.'
            : '26-Q pathways, Report Vault, 5 km booking, Stay Alert, and Ask operate with open prototype access.'
        }
        icon={<Crown className="w-4 h-4" />}
        endContent={
          <HStack gap={1.5}>
            <Button
              size="sm"
              variant="secondary"
              icon={<Stethoscope className="w-3.5 h-3.5" />}
              label={isAr ? 'بوابة المختبر' : 'Staff Portal'}
              onClick={() => onOpenSubView('partner-portal')}
            />
            <Button
              size="sm"
              variant="destructive"
              icon={<PhoneCall className="w-3.5 h-3.5" />}
              label="998"
              onClick={() => setEmergencyOpen(true)}
            />
          </HStack>
        }
      />

      {/* Ask Assistant Mode Switch */}
      <Card padding={4} elevation="low">
        <VStack gap={3}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <HStack gap={2} vAlign="center">
              <Sparkles className="w-4 h-4 text-[var(--color-accent)]" />
              <Text weight="semibold">
                {isAr ? 'وضع المساعد المقيد' : 'Constrained Ask Mode'}
              </Text>
            </HStack>
            <SegmentedControl
              label={isAr ? 'وضع المساعد' : 'Ask mode'}
              size="sm"
              value={llmMode}
              onChange={(mode) =>
                toggleFeatureFlags({ askLlmMode: mode as 'Full' | 'TemplatesOnly' | 'Off' })
              }
            >
              <SegmentedControlItem value="Full" label={isAr ? 'كامل' : 'Full'} />
              <SegmentedControlItem value="TemplatesOnly" label={isAr ? 'قوالب' : 'TemplatesOnly'} />
              <SegmentedControlItem value="Off" label={isAr ? 'متوقف' : 'Off'} />
            </SegmentedControl>
          </HStack>

          <HStack gap={1.5} wrap="wrap">
            {quickPrompts.map((qp) => (
              <Button
                key={qp}
                variant="secondary"
                size="sm"
                label={qp}
                onClick={() => handleSend(qp)}
              />
            ))}
          </HStack>
        </VStack>
      </Card>

      {/* Astryx Chat Workspace */}
      <Card padding={4} elevation="low">
        <VStack gap={3}>
          <div className="max-h-[400px] overflow-y-auto pe-1">
            <ChatMessageList density="compact" gap={3}>
              <ChatSystemMessage variant="divider">
                {isAr ? 'مساعد موثق بالمصدر فقط' : 'Source-grounded & verified-only boundary'}
              </ChatSystemMessage>

              {askMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  sender={msg.role === 'user' ? 'user' : 'assistant'}
                  name={msg.role === 'user' ? state?.user.alias || 'You' : 'Panacea Ask'}
                >
                  <ChatMessageBubble variant={msg.role === 'user' ? 'filled' : 'ghost'}>
                    <VStack gap={2}>
                      {msg.urgentAlert && (
                        <HStack gap={1.5} vAlign="center">
                          <AlertTriangle className="w-4 h-4 text-[var(--color-error)]" />
                          <Badge label={isAr ? 'تنبيه عاجل' : 'Urgent Safety Alert'} variant="error" />
                        </HStack>
                      )}
                      <Text>{msg.text}</Text>
                      {msg.buttons && msg.buttons.length > 0 && (
                        <HStack gap={1.5} wrap="wrap">
                          {msg.buttons.map((btn) => (
                            <Button
                              key={btn.code}
                              size="sm"
                              variant="secondary"
                              icon={<ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />}
                              label={isAr ? btn.labelAr : btn.labelEn}
                              onClick={() => onOpenSubView(btn.view)}
                            />
                          ))}
                        </HStack>
                      )}
                    </VStack>
                  </ChatMessageBubble>
                  {msg.role === 'assistant' && (
                    <ChatMessageMetadata
                      timestamp={msg.modeUsed ? `Mode: ${msg.modeUsed}` : undefined}
                      footer={
                        msg.sourceLabels && msg.sourceLabels.length > 0
                          ? msg.sourceLabels.join(' · ')
                          : undefined
                      }
                    />
                  )}
                </ChatMessage>
              ))}
            </ChatMessageList>
          </div>

          <Divider />

          <ChatComposer
            value={promptInput}
            onChange={setPromptInput}
            onSubmit={handleSend}
            isDisabled={sending}
            density="compact"
            placeholder={
              isAr
                ? 'اسأل عن تقرير مؤكد، حالة المختبر، أو المسار...'
                : 'Ask about confirmed reports, lab order status, or pathway...'
            }
          />
        </VStack>
      </Card>
    </VStack>
  );
};
