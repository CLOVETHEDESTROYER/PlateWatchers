import React from 'react';

interface TutorialModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            <div className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="bg-orange-600 px-8 py-10 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                    >
                        ✕
                    </button>
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-4xl text-white">✨</span>
                        <h2 className="text-3xl font-black tracking-tight leading-none uppercase">How It Works</h2>
                    </div>
                    <p className="text-orange-100 font-medium text-lg leading-relaxed max-w-md">
                        PlateWatchers is a community-driven ranking of the best spots in Albuquerque. Your vote directly impacts the leaderboard.
                    </p>
                </div>

                {/* Content */}
                <div className="p-10 space-y-10">
                    {/* Step 1: Voting */}
                    <section className="flex gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-xl shrink-0">1</div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Cast Your Ballot</h3>
                            <p className="text-slate-500 font-medium leading-relaxed">
                                Browse through categories like BBQ, Pizza, or Mexican food. You get <span className="text-orange-600 font-black">2 votes per category</span>:
                            </p>
                            <ul className="mt-4 space-y-3">
                                <li className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="w-6 h-6 rounded-lg bg-orange-600 text-white flex items-center justify-center text-[10px] font-black">TOP</span>
                                    <span className="text-sm font-bold text-slate-700">Top Choice adds <span className="text-orange-600">+100 pts</span></span>
                                </li>
                                <li className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black font-sans">RUN</span>
                                    <span className="text-sm font-bold text-slate-700">Runner Up adds <span className="text-slate-900">+25 pts</span></span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    {/* Step 2: Ranking */}
                    <section className="flex gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-xl shrink-0">2</div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Community Ranking</h3>
                            <p className="text-slate-500 font-medium leading-relaxed">
                                The score you see on a restaurant is the <span className="font-black text-slate-800 underline decoration-orange-400">Total Community Impact</span>. It combines points from everyone in Albuquerque!
                            </p>
                        </div>
                    </section>

                    {/* Step 3: Global Pick */}
                    <section className="flex gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-xl shrink-0">3</div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">The "Overall Top Pick"</h3>
                            <p className="text-slate-500 font-medium leading-relaxed">
                                You can designate <span className="italic">one</span> restaurant as your ultimate local favorite across all categories for a massive <span className="text-orange-600 font-black">+500 pts</span> boost.
                            </p>
                        </div>
                    </section>

                    <button
                        onClick={onClose}
                        className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl active:scale-95"
                    >
                        Got it, Let's Vote!
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TutorialModal;
