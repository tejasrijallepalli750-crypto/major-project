import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, ArrowRight, Shield, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  onNavigate: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login, loginAsDemoAdmin, loginAsDemoCustomer } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      onNavigate('home');
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoAdmin = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await loginAsDemoAdmin();
      onNavigate('admin');
    } catch (err: any) {
      setErrorMessage(err.message || 'Demo admin login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoCustomer = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await loginAsDemoCustomer();
      onNavigate('catalog');
    } catch (err: any) {
      setErrorMessage(err.message || 'Demo customer login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black mx-auto">
          A
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Sign In to Your Account
        </h1>
        <p className="text-xs text-slate-500">
          Enter credentials or use the 1-click Academic Evaluator accounts below
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* 1-Click Evaluation Shortcuts */}
      <div className="bg-slate-100/80 p-3.5 rounded-xl border border-slate-200 space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
          Academic Project Evaluator Shortcuts:
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleDemoAdmin}
            disabled={isSubmitting}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Admin Demo</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">admin@aura.store</div>
          </button>

          <button
            type="button"
            onClick={handleDemoCustomer}
            disabled={isSubmitting}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Customer Demo</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">student@college.edu</div>
          </button>
        </div>
      </div>

      {/* Standard Form */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg pl-9 focus:ring-1 focus:ring-slate-900"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg pl-9 focus:ring-1 focus:ring-slate-900"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          <span>Don't have an account yet? </span>
          <button
            onClick={() => onNavigate('register')}
            className="text-slate-900 font-semibold hover:underline cursor-pointer"
          >
            Register new account
          </button>
        </div>
      </div>
    </div>
  );
};
