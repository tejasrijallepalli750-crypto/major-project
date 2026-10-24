import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BackButton } from '../components/BackButton';

interface LoginPageProps {
  onNavigate: (view: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const authenticatedUser = await login(email, password);
      onNavigate(authenticatedUser.role === 'admin' ? 'admin' : 'home');
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'We could not sign you in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-16">
      <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 font-black text-white">A</div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Welcome back</h1>
        <p className="text-xs text-slate-500">Sign in to track orders, update your details and download invoices.</p>
      </div>

      {errorMessage && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /><span>{errorMessage}</span></div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-700">
            Email address
            <span className="relative mt-1 block"><Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-xs focus:ring-1 focus:ring-slate-900" /></span>
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Password
            <span className="relative mt-1 block"><Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-xs focus:ring-1 focus:ring-slate-900" /></span>
          </label>
          <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50">
            {isSubmitting ? 'Signing in…' : 'Sign in'} <ArrowRight className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">New to AURA? <button onClick={() => onNavigate('register')} className="font-semibold text-slate-900 hover:underline">Create an account</button></p>
      </div>
    </div>
  );
};
