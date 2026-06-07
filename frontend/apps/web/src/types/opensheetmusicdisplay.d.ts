declare module 'opensheetmusicdisplay' {
  export interface OpenSheetMusicDisplayOptions {
    autoResize?: boolean;
    drawTitle?: boolean;
    drawingParameters?: string;
    drawPartNames?: boolean;
    drawMeasureNumbers?: boolean;
    drawComposer?: boolean;
    drawCredits?: boolean;
    drawSubtitle?: boolean;
    drawFingerings?: boolean;
    backend?: 'svg' | 'canvas';
    scale?: number;
    pageBackgroundColor?: string;
    measureBackgrounds?: string[];
    systemBreakDistance?: number;
    stemHeight?: number;
    staffPadding?: number;
    measurePadding?: number;
    measureIndexing?: boolean;
    defaultFontFamily?: string;
    titleFontFamily?: string;
    subtitleFontFamily?: string;
    composerFontFamily?: string;
    creditFontFamily?: string;
    measureNumberFontFamily?: string;
    partNameFontFamily?: string;
    fingeringFontFamily?: string;
    fingeringPosition?: 'above' | 'below';
    followCursor?: boolean;
    cursorType?: 'rectangle' | 'bubble';
    highlightEditedMeasures?: boolean;
    musicalSymbolFontSize?: number;
    musicalSymbolType?: 'bravura' | 'gonville' | 'petaluma' | 'smufl';
  }

  export class OpenSheetMusicDisplay {
    constructor(container: HTMLElement, options?: OpenSheetMusicDisplayOptions);
    load(content: string | Uint8Array): Promise<void>;
    render(): void;
    resize(): void;
    clear(): void;
  }
}
