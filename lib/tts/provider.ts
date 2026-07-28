export interface TTSProvider {
  synthesize(text: string, signal?: AbortSignal): Promise<Blob>;
}
