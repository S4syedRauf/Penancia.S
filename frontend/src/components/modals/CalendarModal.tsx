import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Calendar } from '@astryxdesign/core/Calendar';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { usePanacea } from '../../store/PanaceaContext';
import { formatISODate } from '../../utils/dateUtils';

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({ isOpen, onClose }) => {
  const { language, selectedDate, setSelectedDate } = usePanacea();
  const isAr = language === 'ar';

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={380}
      padding={5}
      purpose="info"
    >
      <DialogHeader
        title={isAr ? 'اختيار التاريخ' : 'Select Plan Date'}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        hasDivider
      />
      <VStack gap={4} className="pt-4" align="center">
        <Calendar
          mode="single"
          value={selectedDate as `${number}${number}${number}${number}-${number}${number}-${number}${number}`}
          weekStartsOn="mon"
          onChange={(nextIso) => {
            setSelectedDate(nextIso);
            onClose();
          }}
        />
        <HStack gap={2} hAlign="between" className="w-full">
          <Button
            variant="ghost"
            size="sm"
            label={isAr ? 'إغلاق' : 'Close'}
            onClick={onClose}
          />
          <Button
            variant="secondary"
            size="sm"
            label={isAr ? 'اليوم' : 'Jump to Today'}
            onClick={() => {
              setSelectedDate(formatISODate(new Date()));
              onClose();
            }}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
};
