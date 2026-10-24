import React, { useState } from 'react';
import { User as UserIcon, Phone, MapPin, Lock, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StateSelectModal } from '../components/StateSelectModal';
import { BackButton } from '../components/BackButton';

interface ProfilePageProps {
  onNavigate: (view: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [houseBuilding, setHouseBuilding] = useState(() => {
    if (!user?.address?.street) return '';
    const parts = user.address.street.split(',');
    return parts.length > 1 ? parts[0].trim() : '';
  });
  const [roadArea, setRoadArea] = useState(() => {
    if (!user?.address?.street) return '';
    const parts = user.address.street.split(',');
    return parts.length > 1 ? parts.slice(1).join(',').trim() : user.address.street;
  });
  const [state, setState] = useState(user?.address?.state || 'Andhra Pradesh');
  const [city, setCity] = useState(user?.address?.city || '');
  const [postalCode, setPostalCode] = useState(user?.address?.postalCode || '');
  const [isStateModalOpen, setIsStateModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const phoneClean = phone.replace(/\D/g, '');
  const isPhoneValid = phoneClean.length === 10;
  const phoneError = (phoneTouched || phone.length > 0) && !isPhoneValid;

  if (!user) {
    return null;
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (phone.trim()) {
      const cleanDigits = phone.replace(/\D/g, '');
      if (cleanDigits.length !== 10) {
        setPhoneTouched(true);
        setErrorMessage(
          `Phone number must be exactly 10 digits. You entered ${cleanDigits.length} digit${cleanDigits.length === 1 ? '' : 's'}.`
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const street = houseBuilding && roadArea ? `${houseBuilding}, ${roadArea}` : houseBuilding || roadArea;
      await updateProfile({
        name,
        phone: phone.trim() ? phone.replace(/\D/g, '').slice(0, 10) : '',
        address: {
          street,
          city,
          district: '',
          state,
          postalCode,
          country: 'India',
        },
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });

      setSuccessMessage('Profile and delivery details updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
      <div className="border-b border-slate-200 pb-4">
        <div className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-1">
          Account Settings
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Customer Profile &amp; Preferences
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Signed in as <span className="font-semibold text-slate-800">{user.email}</span> · Role:{' '}
          <span className="uppercase font-bold text-slate-700">{user.role}</span>
        </p>
      </div>

      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form
        onSubmit={handleUpdate}
        className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 space-y-6 shadow-xs"
      >
        {/* Personal Details */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-slate-500" />
            <span>Personal Information</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white">
              <label className="block text-[11px] font-medium text-slate-500">Recipient Full Name *</label>
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                />
                {name.trim().length > 0 && <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />}
              </div>
            </div>
            <div>
              <div
                className={`relative border rounded-xl px-3.5 pt-2.5 pb-2 bg-white transition-all ${
                  phoneError
                    ? 'border-rose-400 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500'
                    : 'border-slate-300 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600'
                }`}
              >
                <label className="block text-[11px] font-medium text-slate-500">
                  Contact Phone Number *
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhone(digits);
                      setPhoneTouched(true);
                    }}
                    onBlur={() => setPhoneTouched(true)}
                    className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                    placeholder="10-digit mobile number"
                  />
                  {isPhoneValid && (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                  )}
                  {phoneError && (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 ml-2" />
                  )}
                </div>
              </div>
              {phoneError && (
                <p className="text-[11px] text-rose-600 mt-1 px-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Phone number must be exactly 10 digits ({phoneClean.length}/10 entered).
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Default Shipping Address */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <span>Default Delivery Address</span>
          </h3>
          <div className="space-y-4">
            <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white">
              <label className="block text-[11px] font-medium text-slate-500">
                House No., Building Name *
              </label>
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={houseBuilding}
                  onChange={(e) => setHouseBuilding(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                  placeholder="e.g. Flat 302, Green Apartment"
                />
                {houseBuilding.trim().length > 0 && (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                )}
              </div>
            </div>

            <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white">
              <label className="block text-[11px] font-medium text-slate-500">
                Road Name, Area, Colony *
              </label>
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={roadArea}
                  onChange={(e) => setRoadArea(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                  placeholder="e.g. MG Road, Indiranagar"
                />
                {roadArea.trim().length > 0 && (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white">
                <label className="block text-[11px] font-medium text-slate-500">PIN Code *</label>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    maxLength={6}
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                    placeholder="6-digit PIN code"
                  />
                  {postalCode.trim().length >= 6 && (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                  )}
                </div>
              </div>

              <div
                onClick={() => setIsStateModalOpen(true)}
                className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 bg-white cursor-pointer hover:border-purple-500 transition-all select-none group"
              >
                <label className="block text-[11px] font-medium text-slate-500 cursor-pointer">State *</label>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900 truncate py-0.5">
                    {state || 'Select State'}
                  </span>
                  {state ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                  ) : (
                    <span className="text-xs text-purple-600 font-bold group-hover:underline">Choose</span>
                  )}
                </div>
              </div>
            </div>

            <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white">
              <label className="block text-[11px] font-medium text-slate-500">City *</label>
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                  placeholder="e.g. Hyderabad, Bengaluru, Mumbai"
                />
                {city.trim().length > 0 && <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />}
              </div>
            </div>
          </div>
        </div>

        <StateSelectModal
          isOpen={isStateModalOpen}
          onClose={() => setIsStateModalOpen(false)}
          selectedState={state}
          onSelectState={(st) => setState(st)}
        />

        {/* Change Password */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500" />
            <span>Update Password (Optional)</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Leave blank to keep unchanged"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? 'Saving Changes...' : 'Save Profile Changes'}
        </button>
      </form>
    </div>
  );
};
