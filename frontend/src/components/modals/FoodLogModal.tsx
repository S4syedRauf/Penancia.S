import React, { useMemo, useState } from 'react';
import { Minus, Plus, Search, Trash2, Utensils } from 'lucide-react';
import { CustomModal } from '../CustomModal';
import { FOOD_DATABASE } from '../../data/initialData';
import { useFitness } from '../../store/FitnessContext';
import { FoodItem, LoggedFoodEntry, MealType } from '../../types/fitness';

interface FoodLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  mealType: MealType;
  initialMode?: 'add' | 'logged';
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

const SERVING_PRESETS = [0.5, 1, 1.5, 2];

export const FoodLogModal: React.FC<FoodLogModalProps> = ({
  isOpen,
  onClose,
  mealType,
  initialMode = 'add',
}) => {
  const { state, addFoodLog, updateFoodLog, deleteFoodLog } = useFitness();
  const [tab, setTab] = useState<'add' | 'logged'>(initialMode);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MealType>(mealType);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [servingMultiplier, setServingMultiplier] = useState<number>(1);
  const [editingEntry, setEditingEntry] = useState<LoggedFoodEntry | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTab(initialMode);
      setCategoryFilter(mealType);
      setSelectedFood(null);
      setEditingEntry(null);
      setServingMultiplier(1);
    }
  }, [isOpen, mealType, initialMode]);

  const loggedForMeal = useMemo(
    () =>
      state.foodLogs.filter(
        (entry) => entry.date === state.selectedDate && entry.mealType === mealType
      ),
    [state.foodLogs, state.selectedDate, mealType]
  );

  const filteredFoods = useMemo(() => {
    return FOOD_DATABASE.filter((item) => {
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesQuery =
        !query.trim() ||
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [categoryFilter, query]);

  const handleConfirmAdd = () => {
    if (!selectedFood) return;
    addFoodLog({
      date: state.selectedDate,
      mealType,
      foodId: selectedFood.id,
      name: selectedFood.name,
      image: selectedFood.image,
      servingMultiplier,
      servingLabel: `${servingMultiplier} × ${selectedFood.servingUnit}`,
      calories: Math.round(selectedFood.calories * servingMultiplier),
      carbs: Math.round(selectedFood.carbs * servingMultiplier),
      protein: Math.round(selectedFood.protein * servingMultiplier),
      fat: Math.round(selectedFood.fat * servingMultiplier),
      loggedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    setSelectedFood(null);
    setServingMultiplier(1);
    setTab('logged');
  };

  const handleSaveEdit = () => {
    if (!editingEntry) return;
    const baseFood = FOOD_DATABASE.find((f) => f.id === editingEntry.foodId);
    if (baseFood) {
      updateFoodLog(editingEntry.id, {
        servingMultiplier,
        servingLabel: `${servingMultiplier} × ${baseFood.servingUnit}`,
        calories: Math.round(baseFood.calories * servingMultiplier),
        carbs: Math.round(baseFood.carbs * servingMultiplier),
        protein: Math.round(baseFood.protein * servingMultiplier),
        fat: Math.round(baseFood.fat * servingMultiplier),
      });
    } else {
      const ratio = servingMultiplier / Math.max(0.25, editingEntry.servingMultiplier);
      updateFoodLog(editingEntry.id, {
        servingMultiplier,
        servingLabel: `${servingMultiplier} serving(s)`,
        calories: Math.round(editingEntry.calories * ratio),
        carbs: Math.round(editingEntry.carbs * ratio),
        protein: Math.round(editingEntry.protein * ratio),
        fat: Math.round(editingEntry.fat * ratio),
      });
    }
    setEditingEntry(null);
  };

  return (
    <CustomModal isOpen={isOpen} onClose={onClose} title={`${MEAL_LABELS[mealType]} Diary`}>
      {/* Mode switcher */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#F5F5F7] mb-4">
        <button
          type="button"
          onClick={() => {
            setTab('add');
            setEditingEntry(null);
          }}
          className={`py-2 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
            tab === 'add' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#858585]'
          }`}
        >
          Add Food
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('logged');
            setSelectedFood(null);
          }}
          className={`py-2 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
            tab === 'logged' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#858585]'
          }`}
        >
          Logged ({loggedForMeal.length})
        </button>
      </div>

      {tab === 'add' ? (
        selectedFood ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#F6F3FF]">
              <img
                src={selectedFood.image}
                alt={selectedFood.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover shrink-0 border border-white"
              />
              <div className="min-w-0 flex-1">
                <h4 className="text-[15px] font-semibold text-[#171717]">{selectedFood.name}</h4>
                <p className="text-[12px] text-[#858585]">{selectedFood.servingUnit}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFood(null)}
                className="text-[12px] font-semibold text-[#7955E8] px-2.5 py-1 rounded-lg hover:bg-white cursor-pointer"
              >
                Change
              </button>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#171717] mb-2">
                Serving Size & Quantity
              </label>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5">
                  {SERVING_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setServingMultiplier(preset)}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold tabular-nums transition-colors cursor-pointer ${
                        servingMultiplier === preset
                          ? 'bg-[#7955E8] text-white'
                          : 'bg-[#F5F5F7] text-[#171717] hover:bg-[#EEEEF2]'
                      }`}
                    >
                      {preset}×
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-[#F5F5F7] rounded-xl px-2 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      setServingMultiplier((v) => Math.max(0.25, Number((v - 0.25).toFixed(2))))
                    }
                    className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-[#171717] cursor-pointer"
                    aria-label="Decrease serving"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[13px] font-bold w-9 text-center tabular-nums">
                    {servingMultiplier}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setServingMultiplier((v) => Math.min(10, Number((v + 0.25).toFixed(2))))
                    }
                    className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-[#171717] cursor-pointer"
                    aria-label="Increase serving"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 p-3 rounded-2xl bg-[#F5F5F7] text-center">
              <div>
                <div className="text-[11px] text-[#858585]">Calories</div>
                <div className="text-[15px] font-bold text-[#7955E8] tabular-nums">
                  {Math.round(selectedFood.calories * servingMultiplier)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#858585]">Carbs</div>
                <div className="text-[15px] font-bold text-[#171717] tabular-nums">
                  {Math.round(selectedFood.carbs * servingMultiplier)}g
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#858585]">Protein</div>
                <div className="text-[15px] font-bold text-[#171717] tabular-nums">
                  {Math.round(selectedFood.protein * servingMultiplier)}g
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#858585]">Fat</div>
                <div className="text-[15px] font-bold text-[#171717] tabular-nums">
                  {Math.round(selectedFood.fat * servingMultiplier)}g
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirmAdd}
              className="w-full py-3 rounded-2xl bg-[#7955E8] text-white text-[14px] font-semibold hover:bg-[#6945D8] transition-colors cursor-pointer"
            >
              Add to {MEAL_LABELS[mealType]}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#858585] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search foods, oats, salmon..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#F5F5F7] text-[13px] text-[#171717] placeholder:text-[#858585] focus:outline-none focus:ring-2 focus:ring-[#7955E8]/30"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {(['all', 'breakfast', 'lunch', 'dinner', 'snacks'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-medium capitalize whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    categoryFilter === cat
                      ? 'bg-[#7955E8] text-white'
                      : 'bg-[#F5F5F7] text-[#858585] hover:text-[#171717]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {filteredFoods.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => {
                    setSelectedFood(food);
                    setServingMultiplier(1);
                  }}
                  className="w-full flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-[#F8F8FA] hover:bg-[#F6F3FF] border border-[#EEEEF2] transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={food.image}
                      alt={food.name}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#171717] truncate">
                        {food.name}
                      </p>
                      <p className="text-[11px] text-[#858585] tabular-nums">
                        {food.calories} kcal · C {food.carbs}g · P {food.protein}g · F {food.fat}g
                      </p>
                    </div>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-white border border-[#B9A4F5] text-[#7955E8] flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      ) : editingEntry ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#F6F3FF]">
            <img
              src={editingEntry.image}
              alt={editingEntry.name}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[#171717]">{editingEntry.name}</p>
              <p className="text-[12px] text-[#858585]">Adjust serving multiplier</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 bg-[#F5F5F7] rounded-2xl p-3">
            <button
              type="button"
              onClick={() =>
                setServingMultiplier((v) => Math.max(0.25, Number((v - 0.25).toFixed(2))))
              }
              className="w-9 h-9 rounded-xl bg-white flex items-center justify-center cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-[16px] font-bold w-16 text-center tabular-nums">
              {servingMultiplier}×
            </span>
            <button
              type="button"
              onClick={() =>
                setServingMultiplier((v) => Math.min(10, Number((v + 0.25).toFixed(2))))
              }
              className="w-9 h-9 rounded-xl bg-white flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditingEntry(null)}
              className="flex-1 py-2.5 rounded-2xl bg-[#F5F5F7] text-[#171717] text-[13px] font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="flex-1 py-2.5 rounded-2xl bg-[#7955E8] text-white text-[13px] font-semibold cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : loggedForMeal.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-[#F6F3FF] text-[#7955E8] flex items-center justify-center mx-auto mb-3">
            <Utensils className="w-5 h-5" />
          </div>
          <p className="text-[14px] font-semibold text-[#171717]">
            No items logged for {MEAL_LABELS[mealType]}
          </p>
          <p className="text-[12px] text-[#858585] mt-1 mb-4">
            Switch to Add Food to log your meal.
          </p>
          <button
            type="button"
            onClick={() => setTab('add')}
            className="px-4 py-2 rounded-full bg-[#7955E8] text-white text-[13px] font-semibold cursor-pointer"
          >
            Browse Foods
          </button>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[340px] overflow-y-auto">
          {loggedForMeal.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#F8F8FA] border border-[#EEEEF2]"
            >
              <button
                type="button"
                onClick={() => {
                  setEditingEntry(entry);
                  setServingMultiplier(entry.servingMultiplier);
                }}
                className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
              >
                <img
                  src={entry.image}
                  alt={entry.name}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#171717] truncate">{entry.name}</p>
                  <p className="text-[11px] text-[#858585] tabular-nums">
                    {entry.servingLabel} · {entry.calories} kcal
                  </p>
                  <p className="text-[11px] text-[#7955E8] tabular-nums">
                    C {entry.carbs}g · P {entry.protein}g · F {entry.fat}g
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => deleteFoodLog(entry.id)}
                aria-label={`Delete ${entry.name}`}
                className="w-9 h-9 rounded-full bg-white text-[#858585] hover:text-red-500 border border-[#EEEEF2] flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </CustomModal>
  );
};
