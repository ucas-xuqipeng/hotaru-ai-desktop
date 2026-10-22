import { useEffect, useRef } from 'react';
import { LAppDelegate } from '../../../WebSDK/src/lappdelegate';
import { petHitTarget, petModelPoint } from '@/utils/pet-hit';
import { idleGaze } from '@/utils/pet-gaze';
import { useAiState } from '@/context/ai-state-context';

export function usePortablePet(active: boolean) {
  const api = (window as any).api;
  const dragging = useRef(false);
  const { aiState } = useAiState();
  const stateRef = useRef(aiState);
  stateRef.current = aiState;
  const lastInteraction = useRef(0);
  const hitModel = (x: number, y: number) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
    const model = (window as any).getLAppAdapter?.()?.getModel?.();
    const view = LAppDelegate.getInstance().getView() as any;
    if (!canvas || !model?._model || !view?._deviceToScreen) return false;
    const rect = canvas.getBoundingClientRect();
    const point = petModelPoint({ x: x - rect.left, y: y - rect.top }, rect.width, rect.height);
    return model.anyHitTestWithFallback(view._viewMatrix.invertTransformX(point.x),
      view._viewMatrix.invertTransformY(point.y));
  };
  useEffect(() => {
    if (!active || !api?.portablePet) return undefined;
    const cleanup = api.onPetCursor((point: { x: number; y: number }) => {
      const panels = Array.from(document.querySelectorAll('[data-pet-panel]'))
        .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
      const target = petHitTarget(point, window.innerWidth, window.innerHeight, panels, hitModel);
      api.updateComponentHover('live2d-model', target === 'live2d-model');
      api.updateComponentHover('input-subtitle', target === 'input-subtitle');
      const focused = document.activeElement as HTMLElement | null;
      const editing = document.hasFocus() && Boolean(focused?.matches('input, textarea, [contenteditable="true"]'));
      const gaze = idleGaze(point, window.innerWidth, window.innerHeight, stateRef.current,
        dragging.current, editing, Date.now() - lastInteraction.current);
      (window as any).getLAppAdapter?.()?.getModel?.()?.setDragging(gaze.x, gaze.y);
    });
    const interacted = () => { lastInteraction.current = Date.now(); };
    const stop = () => {
      if (dragging.current) { dragging.current = false; api.setPetDragging(false); }
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    window.addEventListener('keydown', interacted);
    window.addEventListener('pointerdown', interacted);
    return () => {
      cleanup(); stop(); window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop); window.removeEventListener('blur', stop);
      window.removeEventListener('keydown', interacted); window.removeEventListener('pointerdown', interacted);
      (window as any).getLAppAdapter?.()?.getModel?.()?.setDragging(0, 0);
      api.updateComponentHover('live2d-model', false);
    };
  }, [active, api]);
  return {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!active || !api?.portablePet || event.button !== 0 || !hitModel(event.clientX, event.clientY)) return;
      dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId);
      api.setPetDragging(true);
    },
    onDoubleClick: () => { if (active && api?.portablePet) (window as any).inputSubtitle?.toggle(); },
    onWheelCapture: (event: React.WheelEvent) => {
      if (active && api?.portablePet) {
        event.preventDefault(); event.stopPropagation(); api.resizePet(event.deltaY < 0 ? 1 : -1);
      }
    },
  };
}
