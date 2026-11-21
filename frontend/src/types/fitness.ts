export type PrimaryTab = 'diary' | 'activity' | 'meals' | 'profile' | 'premium';

export type SubView =
  | null
  | 'analytics'
  | 'activity-history'
  | 'notifications'
  | 'watch'
  | 'food-database'
  | 'edit-profile'
  | 'nutrition-goals'
  | 'fitness-goals'
  | 'privacy'
  | 'help';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type ActivityCategory = 'cardio' | 'meal' | 'strength' | 'core' | 'hydration' | 'yoga';

export interface FoodItem {
  id: string;
  name: string;
  category: MealType;
  calories: number; // per serving
  carbs: number; // grams per serving
  protein: number; // grams per serving
  fat: number; // grams per serving
  servingUnit: string;
  servingGrams: number;
  image: string;
  description?: string;
}

export interface LoggedFoodEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
  foodId: string;
  name: string;
  image: string;
  servingMultiplier: number; // e.g., 1, 1.5, 2
  servingLabel: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  loggedAt: string;
}

export interface ActivityItem {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  startTime: string; // HH:mm (24h, e.g., "07:00")
  endTime: string; // HH:mm (24h, e.g., "07:30")
  category: ActivityCategory;
  completed: boolean;
  caloriesBurned: number;
  notes?: string;
}

export interface DailyGoals {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

export interface FitnessGoals {
  targetWeightKg: number;
  dailyActiveMinutes: number;
  weeklyWorkouts: number;
  dailyBurnTarget: number;
}

export interface WatchConnection {
  connected: boolean;
  deviceName: string;
  model: string;
  battery: number;
  lastSync: string;
  stepsToday: number;
  heartRateBpm: number;
}

export interface NotificationSettings {
  enabled: boolean;
  mealReminders: boolean;
  activityReminders: boolean;
  dailySummary: boolean;
  hydrationAlerts: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'meal' | 'activity' | 'goal' | 'device';
}

export interface UserProfile {
  greetingName: string;
  name: string;
  email: string;
  avatar: string;
  isPro: boolean;
  proPlan: 'monthly' | 'yearly';
  proRenewalDate: string;
  gender: 'Male' | 'Female' | 'Other';
  age: number;
  weightKg: number;
  heightCm: number;
  profileCompletion: number;
}

export interface MealPlanDay {
  dayLabel: string;
  breakfastId: string;
  lunchId: string;
  dinnerId: string;
  snackId: string;
}

export interface PrivacySettings {
  shareWeeklyStats: boolean;
  syncAppleHealth: boolean;
  biometricLock: boolean;
}

export interface FitnessState {
  selectedDate: string; // YYYY-MM-DD
  profile: UserProfile;
  dailyGoals: DailyGoals;
  fitnessGoals: FitnessGoals;
  foodLogs: LoggedFoodEntry[];
  activities: ActivityItem[];
  watch: WatchConnection;
  notifications: NotificationSettings;
  notificationFeed: AppNotification[];
  mealPlan: Record<string, MealPlanDay>; // keyed by day name or date
  privacy: PrivacySettings;
  isLoggedOut: boolean;
}
