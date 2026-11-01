'use client';

import { useState, useCallback, useEffect } from 'react';
import { WS_TRAIN_URL, MODELS_URL } from '@/lib/endpoints';
import type {
  WsTrainProgress,
  WsTrainDone,
  WsError,
  TrainingState,
  TrainedModel,
} from '@/types';

export interface UseTrainingReturn {
  training: TrainingState;
  models: TrainedModel[];
  startTraining: (type: string, difficulty: string, nTrain: number) => void;
  refreshModels: () => Promise<void>;
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
      if (!res.ok) return;
      const data = (await res.json()) as TrainedModel[];
      if (Array.isArray(data)) {
        setModels(data);
      }
    } catch {
      // Backend may still be waking up
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(MODELS_URL)
      .then((res) => (res.ok ? (res.json() as Promise<TrainedModel[]>) : null))
      .then((data) => {
        if (active && Array.isArray(data)) {
          setModels(data);
        }
      })
      .catch(() => {
        // Ignore initial offline state
      });
    return () => {
      active = false;
    };
  }, []);

  const startTraining = useCallback(
    (type: string, difficulty: string, nTrain: number) => {
      const ws = new WebSocket(WS_TRAIN_URL);

      setTraining({
        isTraining: true,
        progress: 0,
        message: 'Opening training stream...',
        lastCvScore: null,
      });

      ws.onopen = () => {
        ws.send(JSON.stringify({ type, difficulty, n_train: nTrain }));
      };

      ws.onmessage = (evt) => {
        let msg: WsTrainProgress | WsTrainDone | WsError;
        try {
          msg = JSON.parse(evt.data) as WsTrainProgress | WsTrainDone | WsError;
        } catch {
          return;
        }

        if (msg.event === 'progress') {
          setTraining((prev) => ({
            ...prev,
            progress: msg.frac,
            message: msg.message,
          }));
        } else if (msg.event === 'done') {
          setTraining({
            isTraining: false,
            progress: 1,
            message: `Readout saved — CV score ${msg.cv_score.toFixed(3)}`,
            lastCvScore: msg.cv_score,
          });
          void refreshModels();
          ws.close();
        } else if (msg.event === 'error') {
          setTraining((prev) => ({
            ...prev,
            isTraining: false,
            message: `Error: ${msg.message}`,
          }));
          ws.close();
        }
      };

      ws.onerror = () => {
        setTraining((prev) => ({
          ...prev,
          isTraining: false,
          message: 'Error: Unable to connect to training WebSocket.',
        }));
      };
    },
    [refreshModels]
  );

  return { training, models, startTraining, refreshModels };
}
