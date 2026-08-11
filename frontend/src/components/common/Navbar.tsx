// frontend/src/components/common/Navbar.tsx
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProject } from '../../context/ProjectContext';
import { StatusBadge } from './StatusBadge';
import { LogOut, Shield, FolderGit2, Database } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, step, setStep, logout } = useAuth();
  const { currentProject, selectedMaster } = useProject();
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Project Info */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setStep(1)}>
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow font-sans text-xl">
                E
              </div>
              <div>
                <span className="font-extrabold text-lg tracking-tight text-white block leading-tight">
                  Expound Hub
                </span>
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
                  S/4HANA Migration Engine
                </span>
              </div>
            </div>

            {user && (
              <div className="hidden sm:flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 ml-4">
                <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold border border-blue-400/30">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-slate-200">{user.username}</span>
                <StatusBadge type="role" value={user.role} />
              </div>
            )}

            {currentProject && step === 2 && (
              <div className="hidden md:flex items-center space-x-2 pl-4 border-l border-slate-700">
                <span className="inline-flex items-center text-xs font-semibold text-slate-300 bg-slate-800 px-3 py-1 rounded-md border border-slate-700">
                  <FolderGit2 className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                  {currentProject}
                </span>
                <StatusBadge type="module" value={selectedMaster} />
              </div>
            )}
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center space-x-3">
            {user?.role === 'Admin' && step !== 4 && (
              <button
                onClick={() => setStep(4)}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-950/60 hover:bg-blue-900 border border-blue-800 rounded-lg transition-colors"
                title="Admin Control Panel"
              >
                <Shield className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                Admin Panel
              </button>
            )}

            {user && (
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-9 h-9 rounded-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 flex items-center justify-center text-sm font-bold border border-blue-400/30 transition-colors cursor-pointer"
                  title="Account Menu"
                >
                  {user.username.charAt(0).toUpperCase()}
                </button>

                {isDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-20 py-2 text-xs overflow-hidden">
                      {step !== 1 && (
                        <button
                          onClick={() => { setStep(1); setIsDropdownOpen(false); }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 font-medium flex items-center transition-colors"
                        >
                          <Database className="w-4 h-4 mr-2 text-slate-400" />
                          Switch Project
                        </button>
                      )}
                      <button
                        onClick={() => { logout(); setIsDropdownOpen(false); }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 text-rose-600 font-medium flex items-center transition-colors"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
