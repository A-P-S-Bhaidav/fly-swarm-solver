'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  WsMessage, WsStep, WsResult, WsStart, NeuralFrame, RunResult, FlyVote,
} from '@/types';

const WS_INFER_URL = 'ws://localhost:8000/ws/infer';

export interface UseInferenceReturn {
  isRunning: boolean;
  isConnected: boolean;
  currentFrame: NeuralFrame | null;
  lastResult: RunResult | null;
  activeChallenge: { captchaB64: string; type: string; difficulty: string } | null;
  error: string | null;
  runOnce: (type: string, difficulty: string, nFlies: number) => void;
  stop: () => void;
}

export function useInference(): UseInferenceReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState<{ captchaB64: string; type: string; difficulty: string } | null>(null);
  const [currentFrame, setCurrentFrame] = useState<NeuralFrame | null>(null);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep persistent connection
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_INFER_URL);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => {
        setIsConnected(false);
        setIsRunning(false);
        // Reconnect after 2 s
        setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        setError('WebSocket connection failed — is the server running?');
      };

      ws.onmessage = (evt) => {
        const msg: WsMessage = JSON.parse(evt.data);

        if (msg.event === 'start') {
          setCurrentFrame(null);
          setLastResult(null);
          setError(null);
        }

        if (msg.event === 'challenge') {
          setActiveChallenge({
            captchaB64: msg.captcha_b64,
            type: msg.captcha_type,
            difficulty: msg.difficulty,
          });
        }

        if (msg.event === 'step') {
          const m = msg as WsStep;
          setCurrentFrame({
            step: m.step,
            total: m.total,
            spikeRate: m.spike_rate,
            firedNeurons: m.fired_neurons,
            flyFired: m.fly_fired,
            eyeActivity: m.eye_activity,
          });
        }

        if (msg.event === 'result') {
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
          });
          setIsRunning(false);
        }

        if (msg.event === 'error') {
          setError((msg as any).message);
          setIsRunning(false);
        }
      };
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  const runOnce = useCallback((type: string, difficulty: string, nFlies: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to server');
      return;
    }
    setIsRunning(true);
    setError(null);
    wsRef.current.send(JSON.stringify({ type, difficulty, n_flies: nFlies }));
  }, []);

  const stop = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: 'stop' }));
    setIsRunning(false);
  }, []);

  return { isRunning, isConnected, currentFrame, lastResult, activeChallenge, error, runOnce, stop };
}
