import React from 'react';
import { X, Check } from 'lucide-react';

export const INDIAN_STATES: string[] = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

interface StateSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedState: string;
  onSelectState: (state: string) => void;
}

export const StateSelectModal: React.FC<StateSelectModalProps> = ({
  isOpen,
  onClose,
  selectedState,
  onSelectState,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Sheet / Modal */}
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 flex flex-col max-h-[85vh] sm:max-h-[75vh] animate-in fade-in slide-in-from-bottom duration-200">
        {/* Header matching video: 'SELECT STATE' and '✕' */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold tracking-wider text-slate-800 uppercase">
            SELECT STATE
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-full transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* States List with Radio Buttons */}
        <div className="overflow-y-auto divide-y divide-slate-100 py-1">
          {INDIAN_STATES.map((stateName) => {
            const isSelected = selectedState === stateName;
            return (
              <button
                key={stateName}
                type="button"
                onClick={() => {
                  onSelectState(stateName);
                  onClose();
                }}
                className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors cursor-pointer ${
                  isSelected ? 'bg-purple-50/60' : 'hover:bg-slate-50'
                }`}
              >
                {/* Radio button circle */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected ? 'border-purple-600 bg-white' : 'border-slate-300'
                  }`}
                >
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                  )}
                </div>

                <span
                  className={`text-xs sm:text-sm font-medium ${
                    isSelected ? 'text-purple-900 font-bold' : 'text-slate-700'
                  }`}
                >
                  {stateName}
                </span>

                {isSelected && (
                  <Check className="w-4 h-4 text-purple-600 ml-auto shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
