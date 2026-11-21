import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CustomModal } from '../CustomModal';
import { useFitness } from '../../store/FitnessContext';
import { ActivityCategory, ActivityItem } from '../../types/fitness';

interface ActivityFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingActivity: ActivityItem | null;
  defaultStartHour?: number;
}

const CATEGORIES: { id: ActivityCategory; label: string; color: string }[] = [
  { id: 'cardio', label: 'Cardio', color: '#82B52F' },
  { id: 'strength', label: 'Strength', color: '#F59E2B' },
  { id: 'core', label: 'Core', color: '#F4B936' },
  { id: 'meal', label: 'Meal Prep', color: '#2166E8' },
  { id: 'yoga', label: 'Mobility', color: '#7955E8' },
  { id: 'hydration', label: 'Hydration', color: '#0EA5E9' },
];

export const ActivityFormModal: React.FC<ActivityFormModalProps> = ({
  isOpen,
  onClose,
  editingActivity,
  defaultStartHour = 7,
}) => {
  const { state, addActivity, updateActivity, deleteActivity } = useFitness();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('cardio');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('07:30');
  const [caloriesBurned, setCaloriesBurned] = useState('220');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingActivity) {
      setTitle(editingActivity.title);
      setCategory(editingActivity.category);
      setStartTime(editingActivity.startTime);
      setEndTime(editingActivity.endTime);
      setCaloriesBurned(String(editingActivity.caloriesBurned));
      setCompleted(editingActivity.completed);
    } else {
      const hh = String(defaultStartHour).padStart(2, '0');
      setTitle('');
      setCategory('cardio');
      setStartTime(`${hh}:00`);
      setEndTime(`${hh}:30`);
      setCaloriesBurned('200');
      setCompleted(false);
    }
  }, [isOpen, editingActivity, defaultStartHour]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const payload = {
      date: editingActivity ? editingActivity.date : state.selectedDate,
      title: title.trim(),
      category,
      startTime,
      endTime,
      caloriesBurned: Math.max(0, parseInt(caloriesBurned, 10) || 0),
      completed,
    };
    if (editingActivity) {
      updateActivity(editingActivity.id, payload);
    } else {
      addActivity(payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editingActivity) return;
    deleteActivity(editingActivity.id);
    onClose();
  };

  return (
    <CustomModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingActivity ? 'Edit Activity' : 'New Activity'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
            Activity Name
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Evening Run, HIIT Circuit"
            className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F5F7] text-[13px] text-[#171717] placeholder:text-[#858585] focus:outline-none focus:ring-2 focus:ring-[#7955E8]/30"
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
            Category
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium border transition-colors cursor-pointer ${
                  category === cat.id
                    ? 'border-[#7955E8] bg-[#F6F3FF] text-[#171717]'
                    : 'border-[#EEEEF2] bg-white text-[#858585]'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="truncate">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-2xl bg-[#F5F5F7] text-[13px] text-[#171717] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#7955E8]/30"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
              End Time
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-2xl bg-[#F5F5F7] text-[13px] text-[#171717] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#7955E8]/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
              Est. Calories Burned
            </label>
            <input
              type="number"
              min={0}
              max={3000}
              value={caloriesBurned}
              onChange={(e) => setCaloriesBurned(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F5F7] text-[13px] text-[#171717] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#7955E8]/30"
            />
          </div>

          <button
            type="button"
            onClick={() => setCompleted((c) => !c)}
            className={`py-2.5 px-3 rounded-2xl text-[13px] font-semibold border transition-colors cursor-pointer ${
              completed
                ? 'bg-[#F6F3FF] border-[#7955E8] text-[#7955E8]'
                : 'bg-[#F5F5F7] border-transparent text-[#858585]'
            }`}
          >
            {completed ? 'Completed' : 'Pending'}
          </button>
        </div>

        <div className="flex items-center gap-2 pt-2">
          {editingActivity && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete activity"
              className="w-11 h-11 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors cursor-pointer shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            className="flex-1 py-3 rounded-2xl bg-[#7955E8] text-white text-[14px] font-semibold hover:bg-[#6945D8] transition-colors cursor-pointer"
          >
            {editingActivity ? 'Save Activity' : 'Add to Timeline'}
          </button>
        </div>
      </form>
    </CustomModal>
  );
};
