'use client';

import type { FlyVote } from '@/types';

interface SwarmVotesProps {
  votes: FlyVote[];
  swarmAnswer: string | null;
  groundTruth: string | null;
  isRunning: boolean;
}

const FLY_COLORS = [
  'from-cyan-400 to-cyan-600',
  'from-purple-400 to-purple-600',
  'from-green-400 to-green-600',
  'from-amber-400 to-amber-600',
  'from-pink-400 to-pink-600',
  'from-blue-400 to-blue-600',
  'from-teal-400 to-teal-600',
  'from-rose-400 to-rose-600',
];

export default function SwarmVotes({ votes, swarmAnswer, groundTruth, isRunning }: SwarmVotesProps) {
  const nFlies = votes.length || 5;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-cyan-400/70">
        Swarm Votes ({nFlies} flies)
      </h2>

      {/* Per-fly rows */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: Math.max(nFlies, votes.length) }, (_, i) => {
          const vote = votes[i];
          const conf = vote?.confidence ?? 0;
          const answer = vote?.answer ?? '…';
          const isCorrect = groundTruth && vote ? vote.answer === groundTruth : null;

          return (
            <div key={i} className="flex items-center gap-2">
              {/* Fly index */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  bg-gradient-to-br ${FLY_COLORS[i % FLY_COLORS.length]} text-white`}
              >
                {i + 1}
              </div>

              {/* Confidence bar */}
              <div className="flex-1 h-5 bg-white/5 rounded-md overflow-hidden relative">
                <div
                  className={`h-full bg-gradient-to-r ${FLY_COLORS[i % FLY_COLORS.length]} opacity-70 rounded-md transition-all duration-500`}
                  style={{ width: vote ? `${conf * 100}%` : isRunning ? '0%' : '0%' }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  <span className="font-mono text-xs text-white/80 font-semibold">
                    {vote ? answer : isRunning ? '…' : '—'}
                  </span>
                  <span className="font-mono text-xs text-white/50">
                    {vote ? `${(conf * 100).toFixed(0)}%` : ''}
                  </span>
                </div>
              </div>

              {/* Correct indicator */}
              <div className="w-4 shrink-0 text-center">
                {isCorrect === true && <span className="text-green-400 text-xs">✓</span>}
                {isCorrect === false && <span className="text-red-400 text-xs">✗</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Swarm consensus */}
      {swarmAnswer && (
        <div className="glass rounded-xl p-3 border border-cyan-400/20">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Swarm Consensus</div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xl font-bold text-cyan-400 text-glow">
              {swarmAnswer}
            </span>
            {groundTruth && (
              <span className={`text-sm font-semibold ${swarmAnswer === groundTruth ? 'text-green-400' : 'text-red-400'}`}>
                {swarmAnswer === groundTruth ? '✅ Correct' : `❌ Was: ${groundTruth}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Live spike activity mini-visualizer */}
      {isRunning && (
        <div className="glass rounded-xl p-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Neural Activity</div>
          <div className="flex items-end gap-0.5 h-10">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-cyan-400/60 transition-all duration-100"
                style={{
                  height: `${20 + Math.random() * 80}%`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
