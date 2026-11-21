import React, { useState } from 'react';
import { Check, Lock, Mail, UserPlus } from 'lucide-react';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { resetPasswordForEmail, signInUser, signUpUser } from '../../services/authService';
import { AuthUser } from '../../types/questionnaire';

interface AuthGateScreenProps {
  onboardingComplete: boolean;
  initialMode?: 'signup' | 'signin';
  onBack: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthGateScreen: React.FC<AuthGateScreenProps> = ({
  onboardingComplete,
  initialMode = 'signup',
  onBack,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'signup' | 'signin' | 'verify' | 'forgot'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!onboardingComplete) {
      setError('Please complete the 4 setup questions first.');
      return;
    }
    const res = signUpUser({
      fullName,
      email,
      password,
      onboardingCompleted: true,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPendingUser(res.user);
    setMode('verify');
    setStatusMessage(`Verification code sent to ${res.user.email} (enter any 6 digits, e.g. 123456).`);
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = signInUser({ email, password });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAuthenticated(res.user);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (verifyCode.trim().length < 4) {
      setError('Please enter the verification code.');
      return;
    }
    if (pendingUser) {
      onAuthenticated(pendingUser);
    }
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = resetPasswordForEmail(email, newPassword);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStatusMessage('Password updated. You can now sign in with your new password.');
    setMode('signin');
    setPassword('');
    setNewPassword('');
  };

  return (
    <OnboardingLayout
      titleDark={
        mode === 'signup'
          ? 'Create your'
          : mode === 'signin'
            ? 'Welcome'
            : mode === 'verify'
              ? 'Verify your'
              : 'Reset your'
      }
      titleMuted={
        mode === 'signup'
          ? 'AuraFit profile'
          : mode === 'signin'
            ? 'back'
            : mode === 'verify'
              ? 'email'
              : 'password'
      }
      description={
        mode === 'signup'
          ? 'Save your fitness goals and unlock your daily nutrition and activity dashboard.'
          : mode === 'signin'
            ? 'Sign in to continue to your dashboard.'
            : mode === 'verify'
              ? 'Confirm your email address to enter your dashboard.'
              : 'Enter your account email and choose a new password.'
      }
      onBack={onBack}
    >
      <div className="space-y-4">
        {(mode === 'signup' || mode === 'signin') && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-[#ECEEEB]">
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`py-2.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${
                mode === 'signup' ? 'bg-[#FFF45A] text-[#191A12]' : 'text-[#5C605C]'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`py-2.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${
                mode === 'signin' ? 'bg-[#FFF45A] text-[#191A12]' : 'text-[#5C605C]'
              }`}
            >
              Sign In
            </button>
          </div>
        )}

        {statusMessage && (
          <div className="rounded-2xl bg-[#FFF45A]/60 px-4 py-3 text-[12px] font-medium text-[#191A12] flex items-start gap-2">
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{statusMessage}</span>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-[#C94B45]/10 border border-[#C94B45]/30 px-4 py-3 text-[12px] font-semibold text-[#A3302B]">
            {error}
          </div>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="rounded-[24px] bg-[#F1F2F0] p-5 space-y-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#7B807B] mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Esther Howard"
                className="w-full px-4 py-3 rounded-2xl bg-white text-[14px] text-[#191A12] placeholder:text-[#A5AAA7] focus:outline-none focus:ring-2 focus:ring-[#FFF45A]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#7B807B] mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-4 py-3 rounded-2xl bg-white text-[14px] text-[#191A12] placeholder:text-[#A5AAA7] focus:outline-none focus:ring-2 focus:ring-[#FFF45A]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#7B807B] mb-1">
                Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                className="w-full px-4 py-3 rounded-2xl bg-white text-[14px] text-[#191A12] placeholder:text-[#A5AAA7] focus:outline-none focus:ring-2 focus:ring-[#FFF45A]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-[#171706] text-white text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[#2B2B10] transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-[#FFF45A]" />
              <span>Create Account & Continue</span>
            </button>
          </form>
        )}

        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="rounded-[24px] bg-[#F1F2F0] p-5 space-y-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#7B807B] mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-4 py-3 rounded-2xl bg-white text-[14px] text-[#191A12] placeholder:text-[#A5AAA7] focus:outline-none focus:ring-2 focus:ring-[#FFF45A]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#7B807B] mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 rounded-2xl bg-white text-[14px] text-[#191A12] placeholder:text-[#A5AAA7] focus:outline-none focus:ring-2 focus:ring-[#FFF45A]"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                }}
                className="text-[12px] font-semibold text-[#5C605C] hover:text-[#191A12] underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-[#171706] text-white text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[#2B2B10] transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4 text-[#FFF45A]" />
              <span>Sign In to Dashboard</span>
            </button>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerify} className="rounded-[24px] bg-[#F1F2F0] p-5 space-y-3.5">
            <div className="flex items-center gap-2.5 text-[#191A12]">
              <Mail className="w-5 h-5 text-[#78978A]" />
              <p className="text-[13px] font-semibold">Email Verification</p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              required
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="Enter 6-digit code (e.g. 123456)"
              className="w-full px-4 py-3 rounded-2xl bg-white text-[16px] font-bold tracking-widest text-center text-[#191A12] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#FFF45A]"
            />
            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-[#171706] text-white text-[13px] font-semibold cursor-pointer"
            >
              Verify & Enter Dashboard
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleResetPassword} className="rounded-[24px] bg-[#F1F2F0] p-5 space-y-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#7B807B] mb-1">
                Account Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-4 py-3 rounded-2xl bg-white text-[14px] text-[#191A12]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#7B807B] mb-1">
                New Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Choose a new password"
                className="w-full px-4 py-3 rounded-2xl bg-white text-[14px] text-[#191A12]"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-[#171706] text-white text-[13px] font-semibold cursor-pointer"
            >
              Reset Password
            </button>
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="w-full py-2 text-[12px] font-semibold text-[#5C605C] cursor-pointer"
            >
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </OnboardingLayout>
  );
};
