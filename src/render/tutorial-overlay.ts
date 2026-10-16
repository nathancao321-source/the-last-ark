/** Visual time only; no physical entities or game clock are modified here. */
export class TutorialOverlay {
  key?: string;
  text = '';
  alpha = 0;
  private closing = false;
  private done = false;
  sync(key: string | undefined, text = ''): void {
    this.text = text;
    if (key === this.key) return;
    this.key = key; this.text = text; this.alpha = 0; this.closing = false; this.done = false;
  }
  dismiss(): boolean {
    if (!this.key || this.done) return false;
    this.closing = true; return true;
  }
  update(dt: number): string | undefined {
    if (!this.key || this.done) return;
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    this.alpha = this.closing ? Math.max(0,this.alpha-dt/0.3) : Math.min(1,this.alpha+dt/0.45);
    if (this.closing && this.alpha < 1e-6) { this.alpha=0; this.done = true; return this.key; }
  }
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.key || this.alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = this.alpha;
    const boxWidth = Math.min(680,width-32), padding = 20;
    ctx.font = '17px system-ui';
    const lines: string[] = [];
    for (const paragraph of this.text.split('\n')) {
      let line = '';
      for (const character of paragraph) {
        if (line && ctx.measureText(line+character).width > boxWidth-padding*2) { lines.push(line); line=''; }
        line += character;
      }
      if (line) lines.push(line);
    }
    const boxHeight = lines.length*28+82, x=(width-boxWidth)/2, y=Math.max(60,Math.min(height/4,height-boxHeight-16));
    ctx.fillStyle='#080d16ee'; ctx.fillRect(x,y,boxWidth,boxHeight);
    ctx.strokeStyle='#6987af'; ctx.strokeRect(x,y,boxWidth,boxHeight);
    ctx.fillStyle='#e5eaf4'; ctx.textAlign='left';
    lines.forEach((line,i)=>ctx.fillText(line,x+padding,y+34+i*28));
    ctx.font='13px system-ui'; ctx.fillStyle='#a8c4e8'; ctx.fillText('Space / 手柄 Menu：继续',x+padding,y+boxHeight-22);
    ctx.restore();
  }
}
