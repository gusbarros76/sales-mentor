// Cliente AssemblyAI para streaming real-time

export interface TranscriptSegment {
  text: string;
  confidence: number;
  is_final: boolean;
  audio_start?: number;
  audio_end?: number;
}

export class AssemblyAIClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private onTranscript: (segment: TranscriptSegment) => void;
  private onError: (error: Error) => void;

  constructor(
    apiKey: string,
    onTranscript: (segment: TranscriptSegment) => void,
    onError: (error: Error) => void
  ) {
    this.apiKey = apiKey;
    this.onTranscript = onTranscript;
    this.onError = onError;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${this.apiKey}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('🎤 AssemblyAI WebSocket connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Ignorar mensagens de sessão
          if (data.message_type === 'SessionBegins') {
            console.log('✅ AssemblyAI session started:', data.session_id);
            return;
          }

          // Processar transcrição parcial
          if (data.message_type === 'PartialTranscript') {
            this.onTranscript({
              text: data.text,
              confidence: data.confidence || 0,
              is_final: false,
              audio_start: data.audio_start,
              audio_end: data.audio_end
            });
          }

          // Processar transcrição final
          if (data.message_type === 'FinalTranscript') {
            this.onTranscript({
              text: data.text,
              confidence: data.confidence || 0,
              is_final: true,
              audio_start: data.audio_start,
              audio_end: data.audio_end
            });
          }
        } catch (err) {
          console.error('❌ Erro ao processar mensagem AssemblyAI:', err);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ AssemblyAI WebSocket error:', error);
        this.onError(new Error('WebSocket connection failed'));
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('🔴 AssemblyAI WebSocket closed');
      };
    });
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Converter para base64 (AssemblyAI espera base64)
      const base64 = this.arrayBufferToBase64(audioData);
      this.ws.send(JSON.stringify({ audio_data: base64 }));
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
