/**
 * CanvasEditor.types.ts
 * TypeScript interfaces and types extracted from CanvasEditor.tsx
 */
import type { FabricObject } from 'fabric';

export interface LayerItemData {
    id: string;
    type: string;
    preview?: string;
    visible: boolean;
    locked: boolean;
    name: string;
    fabricObject?: FabricObject;
}

export interface FrameTemplate {
    id: string;
    name: string;
    category?: string;
    imageUrl: string;
    clipPathPoints: { x: number; y: number }[];
    width: number;
    height: number;
}
