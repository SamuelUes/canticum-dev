declare module 'opensheetmusicdisplay' {
  export interface OpenSheetMusicDisplayOptions {
    autoResize?: boolean;
    drawTitle?: boolean;
    drawingParameters?: string;
  }

  export class OpenSheetMusicDisplay {
    constructor(container: HTMLElement, options?: OpenSheetMusicDisplayOptions);
    load(content: string | Uint8Array): Promise<void>;
    render(): void;
  }
}
