'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { WS_INFER_URL } from '@/lib/endpoints';
import type {
  WsMessage,
  WsStep,
  WsResult,
  WsError,
  NeuralFrame,
  RunResult,
  FlyVote,
  SessionStats,
} from '@/types';

export interface UseInferenceReturn {
  isRunning: boolean;
  isConnected: boolean;
  currentFrame: NeuralFrame | null;
  lastResult: RunResult | null;
  activeChallenge: { captchaB64: string; type: string; difficulty: string } | null;
  sessionStats: SessionStats;
  error: string | null;
  runOnce: (type: string, difficulty: string, nFlies: number) => void;
  stop: () => void;
  reconnect: () => void;
  resetStats: () => void;
}

export function useInference(): UseInferenceReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectFnRef = useRef<(() => void) | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState<{
    captchaB64: string;
    type: string;
    difficulty: string;
  } | null>(null);
  const [currentFrame, setCurrentFrame] = useState<NeuralFrame | null>(null);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    totalRuns: 0,
    swarmCorrect: 0,
    singleCorrect: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let attempt = 0;

    const clearTimers = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      clearTimers();

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      const ws = new WebSocket(WS_INFER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setIsConnected(true);
        setError(null);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 25000);
      };

      ws.onclose = () => {
        if (disposed) return;
        setIsConnected(false);
        setIsRunning(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        const delay = Math.min(8000, 1500 * Math.pow(1.4, attempt));
        attempt += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        if (disposed) return;
        setError('Backend WebSocket unreachable — retrying connection.');
      };

      ws.onmessage = (evt) => {
        if (disposed || evt.data === 'pong') return;
        let msg: WsMessage;
        try {
          msg = JSON.parse(evt.data) as WsMessage;
        } catch {
          return;
        }

        if (msg.event === 'start') {
          setCurrentFrame(null);
          setLastResult(null);
          setError(null);
        } else if (msg.event === 'challenge') {
          setActiveChallenge({
            captchaB64: msg.captcha_b64,
            type: msg.captcha_type,
            difficulty: msg.difficulty,
          });
        } else if (msg.event === 'step') {
          const m = msg as WsStep;
          setCurrentFrame({
            step: m.step,
            total: m.total,
            spikeRate: m.spike_rate,
            firedNeurons: m.fired_neurons ?? [],
            flyFired: m.fly_fired ?? [],
            eyeActivity: m.eye_activity ?? [],
          });
        } else if (msg.event === 'result') {
          const m = msg as WsResult;
          const votes: FlyVote[] = m.fly_answers.map((ans, i) => ({
            flyIndex: i,
            answer: ans,
            confidence: m.confidences[i] ?? 0,
          }));
          setLastResult({
            captchaB64: m.captcha_b64,
            flyVotes: votes,
            swarmAnswer: m.swarm_answer,
            groundTruth: m.ground_truth,
            correct: m.correct,
            singleCorrect: m.single_correct,
            hadTie: m.had_tie,
            nearSymmetric: Boolean(m.near_symmetric),
          });
          setSessionStats((prev) => ({
            totalRuns: prev.totalRuns + 1,
            swarmCorrect: prev.swarmCorrect + (m.correct ? 1 : 0),
            singleCorrect: prev.singleCorrect + (m.single_correct ? 1 : 0),
          }));
          setIsRunning(false);
        } else if (msg.event === 'error') {
          const errMsg = msg as WsError;
          setError(errMsg.message);
          setIsRunning(false);
        }
      };
    };

    connectFnRef.current = connect;
    connect();

    return () => {
      disposed = true;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  const runOnce = useCallback((type: string, difficulty: string, nFlies: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Backend stream not connected yet.');
      connectFnRef.current?.();
      return;
    }
    setIsRunning(true);
    setError(null);
    wsRef.current.send(JSON.stringify({ type, difficulty, n_flies: nFlies }));
  }, []);

  const stop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'stop' }));
    }
    setIsRunning(false);
  }, []);

  const reconnect = useCallback(() => {
    setError(null);
    connectFnRef.current?.();
  }, []);

  const resetStats = useCallback(() => {
    setSessionStats({ totalRuns: 0, swarmCorrect: 0, singleCorrect: 0 });
  }, []);

  return {
    isRunning,
    isConnected,
    currentFrame,
    lastResult,
    activeChallenge,
    sessionStats,
    error,
    runOnce,
    stop,
    reconnect,
    resetStats,
  };
}
