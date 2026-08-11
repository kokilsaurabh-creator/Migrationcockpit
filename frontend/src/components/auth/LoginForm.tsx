// frontend/src/components/auth/LoginForm.tsx
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { loginUser } from '../../services/authService';
import { Toast } from '../common/Toast';
import { Lock, User, ArrowRight, Loader2, Database, HelpCircle, Settings } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const { setUser, setStep } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const { user, error } = await loginUser(username.trim(), password.trim());
    setLoading(false);

    if (error || !user) {
      setErrorMsg(error || 'Authentication failed.');
    } else {
      setUser(user);
      setStep(1); // Proceed to Project Setup
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[#0f172a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-[#0f172a] to-[#020617]">
      {/* Top Navigation */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-20">
        <div className="text-slate-200 font-bold tracking-wide flex items-center space-x-2">
          <span>SAP Migration Cockpit</span>
        </div>
        <div className="flex space-x-4 text-slate-400">
          <button className="hover:text-slate-200 transition-colors"><HelpCircle className="w-5 h-5" /></button>
          <button className="hover:text-slate-200 transition-colors"><Settings className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8 z-10">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 shadow-[0_0_40px_-10px_rgba(59,130,246,0.6)] text-white font-extrabold text-3xl mb-6 tracking-tight">
            E
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Expound Master Data Hub</h1>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400/80">
            S/4HANA Migration Engine <span className="text-slate-600 mx-2">|</span> Enterprise Secure Login
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 w-full">
          <div className="bg-[#1e293b]/70 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl border border-slate-700/50 sm:px-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              {errorMsg && <Toast type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#0f172a]/50 border border-slate-700/80 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#0f172a]/50 border border-slate-700/80 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[0_0_15px_-3px_rgba(59,130,246,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <span>Secure Login</span>
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-8 pt-5 border-t border-slate-700/50 text-center">
              <p className="text-[11px] text-slate-500 flex items-center justify-center space-x-1.5 font-medium">
                <Database className="w-3.5 h-3.5 text-slate-600" />
                <span>Multi-Master S/4HANA Cockpit (MM, P2P, SD)</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Elements */}
      <div className="absolute bottom-0 left-0 w-full p-6 flex flex-col sm:flex-row justify-between items-center z-20 text-[10px] text-slate-500 font-medium">
        <div>
          v4.2.1-stable Build 2024.08
        </div>
        <div className="flex space-x-6 mt-4 sm:mt-0">
          <a href="#" className="hover:text-slate-400 transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-slate-400 transition-colors">System Status</a>
        </div>
      </div>
    </div>
  );
};
