import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Building2,
  ChefHat,
  ClipboardCheck,
  Crown,
  Database,
  FileText,
  FlaskConical,
  Globe,
  Microscope,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Timer,
  User,
} from 'lucide-react';
import { LayerProvider } from '@astryxdesign/core';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MobileNav, MobileNavToggle } from '@astryxdesign/core/MobileNav';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { defaultThemeSlug, themes } from './astryx-themes';
import { BottomNavigation } from './components/BottomNavigation';
import { CalendarModal } from './components/modals/CalendarModal';
import { EmergencyOverlay } from './components/modals/EmergencyOverlay';
import { SearchOverlayModal } from './components/modals/SearchOverlayModal';
import { ScrollProgressLine } from './components/ScrollProgressLine';
import { ActivityScreen } from './screens/ActivityScreen';
import { DiaryScreen } from './screens/DiaryScreen';
import { MealsScreen } from './screens/MealsScreen';
import { HealthCheckView } from './screens/panacea/HealthCheckView';
import { LabBookingView } from './screens/panacea/LabBookingView';
import { PartnerPortalView } from './screens/panacea/PartnerPortalView';
import { ReportVaultView } from './screens/panacea/ReportVaultView';
import { SemenPreScreenView } from './screens/panacea/SemenPreScreenView';
import { PremiumScreen } from './screens/PremiumScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SubScreens } from './screens/SubScreens';
import { PanaceaProvider, usePanacea } from './store/PanaceaContext';
import type { PrimaryTab, SubView } from './types/panacea';

interface ShellProps {
  themeMode: 'light' | 'dark';
  onToggleThemeMode: () => void;
}

const PanaceaShell: React.FC<ShellProps> = ({ themeMode, onToggleThemeMode }) => {
  const {
    loading,
    language,
    setLanguage,
    t,
    activeTab,
    setActiveTab,
    subView,
    setSubView,
    unreadFollowUpCount,
    setEmergencyOpen,
  } = usePanacea();

  const [searchOpen, setSearchOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isAr = language === 'ar';

  const handleSelectTab = (tab: PrimaryTab) => {
    setSubView(null);
    setActiveTab(tab);
  };

  const handleOpenSubView = (view: SubView) => {
    setSubView(view);
  };

  const primaryTabs: Array<{
    id: PrimaryTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'diary', label: t.tabs.diary, Icon: BookOpen },
    { id: 'activity', label: t.tabs.activity, Icon: Timer },
    { id: 'meals', label: t.tabs.meals, Icon: ChefHat },
    { id: 'profile', label: t.tabs.profile, Icon: User },
    { id: 'premium', label: t.tabs.premium, Icon: Crown },
  ];

  const workflowNavItems: Array<{
    view: Exclude<SubView, null>;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { view: 'health-check', label: t.diary.cards.healthCheckTitle, Icon: ClipboardCheck },
    { view: 'report-vault', label: t.diary.cards.reportsTitle, Icon: FileText },
    { view: 'lab-booking', label: t.diary.cards.labBookingTitle, Icon: FlaskConical },
    { view: 'semen-prescreen', label: t.diary.cards.homePreScreenTitle, Icon: Microscope },
    {
      view: 'partner-portal',
      label: isAr ? 'بوابة المختبر' : 'Partner Staff Desk',
      Icon: Building2,
    },
    {
      view: 'consent-centre',
      label: isAr ? 'مركز الأذونات (٩)' : 'Consent Centre (9)',
      Icon: ShieldCheck,
    },
    {
      view: 'data-rights',
      label: isAr ? 'حقوق البيانات' : 'Export & Delete Data',
      Icon: Database,
    },
  ];

  const renderNavSections = () => (
    <>
      <SideNavSection title={isAr ? 'الأقسام الرئيسية' : 'Navigation'}>
        {primaryTabs.map(({ id, label, Icon }) => (
          <SideNavItem
            key={id}
            label={label}
            icon={<Icon className="w-4 h-4" />}
            isSelected={!subView && activeTab === id}
            onClick={() => handleSelectTab(id)}
          />
        ))}
      </SideNavSection>

      <SideNavSection title={isAr ? 'مسارات الرعاية' : 'Care Workflows'}>
        {workflowNavItems.map(({ view, label, Icon }) => (
          <SideNavItem
            key={view}
            label={label}
            icon={<Icon className="w-4 h-4" />}
            isSelected={subView === view}
            onClick={() => handleOpenSubView(view)}
          />
        ))}
      </SideNavSection>
    </>
  );

  const brandBadge = (
    <div className="w-8 h-8 rounded-md bg-accent-bg text-on-accent flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
      P
    </div>
  );

  const topNavNode = (
    <TopNav
      label={isAr ? 'شريط التنقل العلوي' : 'Top navigation'}
      startContent={<MobileNavToggle label={isAr ? 'فتح القائمة' : 'Open menu'} />}
      heading={
        <TopNavHeading
          logo={brandBadge}
          heading={t.brand}
          subheading={t.attribution}
        />
      }
      endContent={
        <HStack gap={1} vAlign="center">
          <div className="hidden sm:inline-flex">
            <IconButton
              label={isAr ? 'بحث' : 'Search Panacea'}
              icon={<Search className="w-4 h-4" />}
              variant="ghost"
              size="sm"
              onClick={() => setSearchOpen(true)}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Globe className="w-4 h-4" />}
            label={language === 'en' ? 'AR' : 'EN'}
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          />
          <IconButton
            label={themeMode === 'light' ? 'Dark mode' : 'Light mode'}
            icon={themeMode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            variant="ghost"
            size="sm"
            onClick={onToggleThemeMode}
          />
          <div className="hidden sm:inline-flex">
            <Button
              variant="ghost"
              size="sm"
              icon={<Bell className="w-4 h-4" />}
              label={isAr ? 'المتابعة' : 'Stay Alert'}
              isIconOnly={unreadFollowUpCount === 0}
              endContent={
                unreadFollowUpCount > 0 ? (
                  <Badge label={String(unreadFollowUpCount)} variant="info" />
                ) : undefined
              }
              onClick={() => handleOpenSubView('notifications')}
            />
          </div>
          <Button
            variant="destructive"
            size="sm"
            icon={<AlertTriangle className="w-4 h-4" />}
            label="998"
            onClick={() => setEmergencyOpen(true)}
          />
        </HStack>
      }
    />
  );

  const sideNavNode = (
    <SideNav
      collapsible
      header={
        <SideNavHeading
          icon={brandBadge}
          heading={t.brand}
          subheading={t.attribution}
        />
      }
    >
      {renderNavSections()}
    </SideNav>
  );

  const mobileNavNode = (
    <MobileNav
      header={t.brand}
      label={isAr ? 'قائمة باناسيا' : 'Panacea menu'}
    >
      {renderNavSections()}
    </MobileNav>
  );

  const renderMainContent = () => {
    if (loading) {
      return (
        <VStack gap={3} align="center" className="py-16">
          <Spinner size="lg" />
          <Text type="supporting" color="secondary">
            {isAr ? 'جاري تحميل باناسيا...' : 'Loading Panacea...'}
          </Text>
        </VStack>
      );
    }

    if (subView === 'health-check') {
      return (
        <HealthCheckView
          onBack={() => setSubView(null)}
          onOpenSubView={handleOpenSubView}
        />
      );
    }
    if (subView === 'report-vault') {
      return <ReportVaultView onBack={() => setSubView(null)} />;
    }
    if (subView === 'lab-booking') {
      return (
        <LabBookingView
          onBack={() => setSubView(null)}
          onOpenSubView={handleOpenSubView}
        />
      );
    }
    if (subView === 'semen-prescreen') {
      return (
        <SemenPreScreenView
          onBack={() => setSubView(null)}
          onOpenSubView={handleOpenSubView}
        />
      );
    }
    if (subView === 'partner-portal' || subView === 'partner-apply') {
      return (
        <PartnerPortalView
          onBack={() => setSubView(null)}
          initialMode={subView === 'partner-apply' ? 'apply' : 'staff'}
        />
      );
    }
    if (subView === 'ask-assistant') {
      return (
        <PremiumScreen
          onBack={() => setSubView(null)}
          onOpenSubView={handleOpenSubView}
        />
      );
    }
    if (subView) {
      return (
        <SubScreens
          view={subView}
          onBack={() => setSubView(null)}
          onOpenSubView={handleOpenSubView}
        />
      );
    }

    if (activeTab === 'diary') {
      return (
        <DiaryScreen
          onOpenSearch={() => setSearchOpen(true)}
          onOpenCalendar={() => setCalendarOpen(true)}
          onNavigateTab={handleSelectTab}
          onOpenSubView={handleOpenSubView}
        />
      );
    }
    if (activeTab === 'activity') {
      return (
        <ActivityScreen
          onBack={() => handleSelectTab('diary')}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenCalendar={() => setCalendarOpen(true)}
          onOpenSubView={handleOpenSubView}
        />
      );
    }
    if (activeTab === 'meals') {
      return (
        <MealsScreen
          onBack={() => handleSelectTab('diary')}
          onOpenSubView={handleOpenSubView}
        />
      );
    }
    if (activeTab === 'profile') {
      return (
        <ProfileScreen
          onBack={() => handleSelectTab('diary')}
          onOpenSubView={handleOpenSubView}
        />
      );
    }
    return (
      <PremiumScreen
        onBack={() => handleSelectTab('diary')}
        onOpenSubView={handleOpenSubView}
      />
    );
  };

  return (
    <>
      <ScrollProgressLine />
      <AppShell
        variant="elevated"
        contentPadding={4}
        topNav={topNavNode}
        sideNav={sideNavNode}
        mobileNav={mobileNavNode}
      >
        <div className="max-w-[1040px] mx-auto pb-24 md:pb-6">
          {renderMainContent()}
        </div>
      </AppShell>

      <BottomNavigation activeTab={activeTab} onSelectTab={handleSelectTab} />

      <CalendarModal isOpen={calendarOpen} onClose={() => setCalendarOpen(false)} />

      <SearchOverlayModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenSubView={handleOpenSubView}
        onOpenAskTab={() => handleSelectTab('premium')}
      />

      <EmergencyOverlay />
    </>
  );
};

export default function App() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');

  return (
    <Theme theme={themes[defaultThemeSlug]} mode={themeMode}>
      <LayerProvider inset={{ blockEnd: 56 }}>
        <PanaceaProvider>
          <PanaceaShell
            themeMode={themeMode}
            onToggleThemeMode={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))}
          />
        </PanaceaProvider>
      </LayerProvider>
    </Theme>
  );
}
