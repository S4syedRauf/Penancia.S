import React from 'react';
import { BookOpen, ChefHat, Crown, Timer, User } from 'lucide-react';
import { usePanacea } from '../store/PanaceaContext';
import type { PrimaryTab } from '../types/panacea';

interface BottomNavigationProps {
  activeTab: PrimaryTab;
  onSelectTab: (tab: PrimaryTab) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const { t } = usePanacea();

  const NAV_ITEMS: {
    id: PrimaryTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'diary', label: t.tabs.diary, Icon: BookOpen },
    { id: 'activity', label: t.tabs.activity, Icon: Timer },
    { id: 'meals', label: t.tabs.meals, Icon: ChefHat },
    { id: 'profile', label: t.tabs.profile, Icon: User },
    { id: 'premium', label: t.tabs.premium, Icon: Crown },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-2 inset-x-0 z-40 px-3 pb-safe pointer-events-none"
    >
      <div className="max-w-[520px] mx-auto bg-inverted text-on-dark rounded-full px-2 py-1.5 shadow-lg border border-border/20 pointer-events-auto grid grid-cols-5 items-center gap-1">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-full px-1 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${
                isActive
                  ? 'bg-accent-bg text-on-accent font-semibold shadow-xs'
                  : 'text-on-dark/70 hover:text-on-dark'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span className="text-[10px] leading-none tracking-tight whitespace-nowrap">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
