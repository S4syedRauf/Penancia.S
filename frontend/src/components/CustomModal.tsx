import React from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';

interface CustomModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const CustomModal: React.FC<CustomModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={500}
      padding={5}
      purpose="form"
    >
      <DialogHeader
        title={title}
        subtitle={subtitle}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        hasDivider
      />
      <div className="pt-4">{children}</div>
    </Dialog>
  );
};
