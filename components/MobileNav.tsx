import React from 'react';


interface MobileNavProps {
    currentView: 'dashboard' | 'list' | 'admin';
    setView: (view: 'dashboard' | 'list' | 'admin') => void;
    isAdmin: boolean;
    onAdminLogin?: () => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ currentView, setView, isAdmin, onAdminLogin }) => {
    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-200 z-50 pb-safe">
            <div className="flex justify-around items-center h-16">
                <button
                    onClick={() => setView('dashboard')}
                    className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${currentView === 'dashboard' ? 'text-orange-600' : 'text-slate-400'
                        }`}
                >
                    <span className="text-xl">🏆</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">Leaders</span>
                </button>

                <button
                    onClick={() => setView('list')}
                    className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${currentView === 'list' ? 'text-slate-900' : 'text-slate-400'
                        }`}
                >
                    <span className="text-xl">🍽️</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">All Spots</span>
                </button>

                {isAdmin ? (
                    <button
                        onClick={() => setView('admin')}
                        className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${currentView === 'admin' ? 'text-slate-900' : 'text-slate-400'
                            }`}
                    >
                        <span className="text-xl">⚙️</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Admin</span>
                    </button>
                ) : (
                    <button
                        onClick={onAdminLogin}
                        className="flex flex-col items-center justify-center w-full h-full gap-1 transition-colors text-slate-300 hover:text-slate-500"
                    >
                        <span className="text-xl opacity-50">🔒</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Login</span>
                    </button>
                )}
            </div>
        </nav>
    );
};

export default MobileNav;
