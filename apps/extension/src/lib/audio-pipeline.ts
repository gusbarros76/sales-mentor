// Pipeline de processamento de áudio

export class AudioPipeline {
  private audioContext: AudioContext;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudioData: (data: ArrayBuffer) => void;

  constructor(onAudioData: (data: ArrayBuffer) => void) {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.onAudioData = onAudioData;
  }

  async start(stream: MediaStream): Promise<void> {
    console.log('🎵 Iniciando pipeline de áudio...');

    // Criar source do MediaStream
    this.source = this.audioContext.createMediaStreamSource(stream);

    // Criar processor (4096 samples por chunk)
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);

      // Converter Float32Array para Int16Array (PCM 16-bit)
      const pcm16 = this.floatTo16BitPCM(inputData);

      // Enviar para AssemblyAI
      this.onAudioData(pcm16.buffer);
    };

    // Conectar: source → processor → destination
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    console.log('✅ Pipeline de áudio iniciado');
  }

  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);

    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    return int16Array;
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    console.log('🔴 Pipeline de áudio parado');
  }
}
