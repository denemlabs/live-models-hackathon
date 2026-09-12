export class SpeechTurn {
  private started: number;
  private lastSpeech: number;
  private voiced = 0;
  constructor(now: number) {
    this.started = now;
    this.lastSpeech = now;
  }
  sample(level: number, now: number): "send" | "empty" | null {
    if (level > 0.018) {
      this.voiced++;
      this.lastSpeech = now;
    }
    if (this.voiced >= 3 && now - this.lastSpeech >= 1500) return "send";
    if (this.voiced < 3 && now - this.started >= 10000) return "empty";
    return null;
  }
}
