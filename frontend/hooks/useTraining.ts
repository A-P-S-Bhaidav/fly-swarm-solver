'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { WsTrainProgress, WsTrainDone, TrainingState, TrainedModel } from '@/types';

const WS_TRAIN_URL = 'ws://localhost:8000/ws/train';
const MODELS_URL   = 'http://localhost:8000/models';

export interface UseTrainingReturn {
  training: TrainingState;
  models: TrainedModel[];
  startTraining: (type: string, difficulty: string, nTrain: number) => void;
  refreshModels: () => void;
}

export function useTraining(): UseTrainingReturn {
  const [training, setTraining] = useState<TrainingState>({
    isTraining: false,
    progress: 0,
    message: '',
    lastCvScore: null,
  });
  const [models, setModels] = useState<TrainedModel[]>([]);

  const refreshModels = useCallback(async () => {
    try {
      const res = await fetch(MODELS_URL);
      const data = await res.json();
      setModels(data);
    } catch {
      // Server might not be ready yet
    }
  }, []);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const startTraining = useCallback((type: string, difficulty: string, nTrain: number) => {
    const ws = new WebSocket(WS_TRAIN_URL);

    setTraining({ isTraining: true, progress: 0, message: 'Connecting…', lastCvScore: null });

    ws.onopen = () => {
      ws.send(JSON.stringify({ type, difficulty, n_train: nTrain }));
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data) as WsTrainProgress | WsTrainDone | { event: 'error'; message: string };

      if (msg.event === 'progress') {
        const m = msg as WsTrainProgress;
        setTraining(prev => ({ ...prev, progress: m.frac, message: m.message }));
      }

      if (msg.event === 'done') {
        const m = msg as WsTrainDone;
        setTraining({ isTraining: false, progress: 1, message: `Done! CV score: ${m.cv_score.toFixed(3)}`, lastCvScore: m.cv_score });
        refreshModels();
        ws.close();
      }

      if (msg.event === 'error') {
        setTraining(prev => ({ ...prev, isTraining: false, message: `Error: ${(msg as any).message}` }));
        ws.close();
      }
    };

    ws.onerror = () => {
      setTraining(prev => ({ ...prev, isTraining: false, message: 'Connection error' }));
    };
  }, [refreshModels]);

  return { training, models, startTraining, refreshModels };
}
