import React, { useEffect, useState } from 'react';
import { CustomModal } from '../CustomModal';
import { useFitness } from '../../store/FitnessContext';

interface MacroGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MacroGoalModal: React.FC<MacroGoalModalProps> = ({ isOpen, onClose }) => {
  const { state, updateDailyGoals } = useFitness();
  const [calories, setCalories] = useState(String(state.dailyGoals.calories));
  const [carbs, setCarbs] = useState(String(state.dailyGoals.carbs));
  const [protein, setProtein] = useState(String(state.dailyGoals.protein));
  const [fat, setFat] = useState(String(state.dailyGoals.fat));

  useEffect(() => {
    if (isOpen) {
      setCalories(String(state.dailyGoals.calories));
      setCarbs(String(state.dailyGoals.carbs));
      setProtein(String(state.dailyGoals.protein));
      setFat(String(state.dailyGoals.fat));
    }
  }, [isOpen, state.dailyGoals]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateDailyGoals({
      calories: Math.max(800, parseInt(calories, 10) || 2200),
      carbs: Math.max(20, parseInt(carbs, 10) || 359),
      protein: Math.max(20, parseInt(protein, 10) || 143),
      fat: Math.max(15, parseInt(fat, 10) || 370),
    });
    onClose();
  };

  return (
    <CustomModal isOpen={isOpen} onClose={onClose} title="Daily Nutrition Goals">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
              Calories (kcal)
            </label>
            <input
              type="number"
              min={800}
              max={6000}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F5F7] text-[14px] font-semibold text-[#171717] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#7955E8]/30"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
              Carbs (g)
            </label>
            <input
              type="number"
              min={20}
              max={800}
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F5F7] text-[14px] font-semibold text-[#171717] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#82B52F]/40"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
              Protein (g)
            </label>
            <input
              type="number"
              min={20}
              max={500}
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F5F7] text-[14px] font-semibold text-[#171717] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#F5A92F]/40"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#171717] mb-1.5">
              Fat (g)
            </label>
            <input
              type="number"
              min={15}
              max={500}
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#F5F5F7] text-[14px] font-semibold text-[#171717] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#B9A4F5]/50"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 rounded-2xl bg-[#7955E8] text-white text-[14px] font-semibold hover:bg-[#6945D8] transition-colors cursor-pointer"
        >
          Update Goals
        </button>
      </form>
    </CustomModal>
  );
};
