/**
 * Encapsula acceso a cámara del tablet (getUserMedia).
 */
export class CameraService {
  private stream: MediaStream | null = null;

  async start(video: HTMLVideoElement, facingMode: 'user' | 'environment' = 'user'): Promise<void> {
    await this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
  }

  async stop(video?: HTMLVideoElement | null): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (video) {
      video.srcObject = null;
    }
  }

  get active(): boolean {
    return !!this.stream?.active;
  }
}

export const cameraService = new CameraService();
