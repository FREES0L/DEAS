import { createContext, type PointerEvent } from 'react';
import type { MediaItem } from '../../lib/media';

export const MediaTileDrag = createContext<((item:MediaItem,event:PointerEvent<HTMLButtonElement>,onOtherTarget:(target:Element|null)=>void)=>void)|null>(null);
