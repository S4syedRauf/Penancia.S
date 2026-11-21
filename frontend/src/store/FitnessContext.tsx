import React, { createContext, useContext, useEffect, useState } from 'react';
import { INITIAL_FITNESS_STATE } from '../data/initialData';
import {
  ActivityItem,
  DailyGoals,
  FitnessGoals,
  FitnessState,
  LoggedFoodEntry,
  MealPlanDay,
  NotificationSettings,
  PrivacySettings,
  UserProfile,
} from '../types/fitness';

const STORAGE_KEY = 'aurafit_tracker_state_v1';

interface FitnessContextValue {
  state: FitnessState;
  setSelectedDate: (date: string) => void;
  addFoodLog: (entry: Omit<LoggedFoodEntry, 'id'>) => void;
  updateFoodLog: (id: string, patch: Partial<LoggedFoodEntry>) => void;
  deleteFoodLog: (id: string) => void;
  addActivity: (activity: Omit<ActivityItem, 'id'>) => void;
  updateActivity: (id: string, patch: Partial<ActivityItem>) => void;
  deleteActivity: (id: string) => void;
  toggleActivityCompleted: (id: string) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  updateDailyGoals: (patch: Partial<DailyGoals>) => void;
  updateFitnessGoals: (patch: Partial<FitnessGoals>) => void;
  toggleWatchConnection: () => void;
  syncWatchNow: () => void;
  updateNotifications: (patch: Partial<NotificationSettings>) => void;
  markAllNotificationsRead: () => void;
  updateMealPlanDay: (dayLabel: string, patch: Partial<MealPlanDay>) => void;
  updatePrivacy: (patch: Partial<PrivacySettings>) => void;
  upgradeToPro: (plan: 'monthly' | 'yearly') => void;
  setLoggedOut: (loggedOut: boolean) => void;
  resetDemoData: () => void;
}

const FitnessContext = createContext<FitnessContextValue | null>(null);

function loadInitialState(): FitnessState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_FITNESS_STATE;
    const parsed = JSON.parse(raw) as Partial<FitnessState>;
    return {
      ...INITIAL_FITNESS_STATE,
      ...parsed,
      profile: { ...INITIAL_FITNESS_STATE.profile, ...parsed.profile },
      dailyGoals: { ...INITIAL_FITNESS_STATE.dailyGoals, ...parsed.dailyGoals },
      fitnessGoals: { ...INITIAL_FITNESS_STATE.fitnessGoals, ...parsed.fitnessGoals },
      watch: { ...INITIAL_FITNESS_STATE.watch, ...parsed.watch },
      notifications: { ...INITIAL_FITNESS_STATE.notifications, ...parsed.notifications },
      privacy: { ...INITIAL_FITNESS_STATE.privacy, ...parsed.privacy },
    };
  } catch {
    return INITIAL_FITNESS_STATE;
  }
}

export const FitnessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<FitnessState>(loadInitialState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  const setSelectedDate = (date: string) => {
    setState((prev) => ({ ...prev, selectedDate: date }));
  };

  const addFoodLog = (entry: Omit<LoggedFoodEntry, 'id'>) => {
    const newEntry: LoggedFoodEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setState((prev) => ({
      ...prev,
      foodLogs: [...prev.foodLogs, newEntry],
    }));
  };

  const updateFoodLog = (id: string, patch: Partial<LoggedFoodEntry>) => {
    setState((prev) => ({
      ...prev,
      foodLogs: prev.foodLogs.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const deleteFoodLog = (id: string) => {
    setState((prev) => ({
      ...prev,
      foodLogs: prev.foodLogs.filter((item) => item.id !== id),
    }));
  };

  const addActivity = (activity: Omit<ActivityItem, 'id'>) => {
    const newAct: ActivityItem = {
      ...activity,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setState((prev) => ({
      ...prev,
      activities: [...prev.activities, newAct],
    }));
  };

  const updateActivity = (id: string, patch: Partial<ActivityItem>) => {
    setState((prev) => ({
      ...prev,
      activities: prev.activities.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const deleteActivity = (id: string) => {
    setState((prev) => ({
      ...prev,
      activities: prev.activities.filter((item) => item.id !== id),
    }));
  };

  const toggleActivityCompleted = (id: string) => {
    setState((prev) => ({
      ...prev,
      activities: prev.activities.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      ),
    }));
  };

  const updateProfile = (patch: Partial<UserProfile>) => {
    setState((prev) => ({
      ...prev,
      profile: { ...prev.profile, ...patch },
    }));
  };

  const updateDailyGoals = (patch: Partial<DailyGoals>) => {
    setState((prev) => ({
      ...prev,
      dailyGoals: { ...prev.dailyGoals, ...patch },
    }));
  };

  const updateFitnessGoals = (patch: Partial<FitnessGoals>) => {
    setState((prev) => ({
      ...prev,
      fitnessGoals: { ...prev.fitnessGoals, ...patch },
    }));
  };

  const toggleWatchConnection = () => {
    setState((prev) => ({
      ...prev,
      watch: {
        ...prev.watch,
        connected: !prev.watch.connected,
        lastSync: !prev.watch.connected ? 'Just now' : 'Disconnected',
      },
    }));
  };

  const syncWatchNow = () => {
    setState((prev) => ({
      ...prev,
      watch: {
        ...prev.watch,
        connected: true,
        lastSync: 'Synced just now',
        stepsToday: prev.watch.stepsToday + 142,
      },
    }));
  };

  const updateNotifications = (patch: Partial<NotificationSettings>) => {
    setState((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, ...patch },
    }));
  };

  const markAllNotificationsRead = () => {
    setState((prev) => ({
      ...prev,
      notificationFeed: prev.notificationFeed.map((n) => ({ ...n, read: true })),
    }));
  };

  const updateMealPlanDay = (dayLabel: string, patch: Partial<MealPlanDay>) => {
    setState((prev) => ({
      ...prev,
      mealPlan: {
        ...prev.mealPlan,
        [dayLabel]: {
          ...prev.mealPlan[dayLabel],
          ...patch,
        },
      },
    }));
  };

  const updatePrivacy = (patch: Partial<PrivacySettings>) => {
    setState((prev) => ({
      ...prev,
      privacy: { ...prev.privacy, ...patch },
    }));
  };

  const upgradeToPro = (plan: 'monthly' | 'yearly') => {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        isPro: true,
        proPlan: plan,
        proRenewalDate: plan === 'yearly' ? 'Nov 15, 2027' : 'Dec 15, 2026',
      },
    }));
  };

  const setLoggedOut = (loggedOut: boolean) => {
    setState((prev) => ({ ...prev, isLoggedOut: loggedOut }));
  };

  const resetDemoData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_FITNESS_STATE);
  };

  return (
    <FitnessContext.Provider
      value={{
        state,
        setSelectedDate,
        addFoodLog,
        updateFoodLog,
        deleteFoodLog,
        addActivity,
        updateActivity,
        deleteActivity,
        toggleActivityCompleted,
        updateProfile,
        updateDailyGoals,
        updateFitnessGoals,
        toggleWatchConnection,
        syncWatchNow,
        updateNotifications,
        markAllNotificationsRead,
        updateMealPlanDay,
        updatePrivacy,
        upgradeToPro,
        setLoggedOut,
        resetDemoData,
      }}
    >
      {children}
    </FitnessContext.Provider>
  );
};

export function useFitness() {
  const ctx = useContext(FitnessContext);
  if (!ctx) throw new Error('useFitness must be used inside FitnessProvider');
  return ctx;
}
