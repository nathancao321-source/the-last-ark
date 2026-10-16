import type { Keyboard } from './keyboard';
import type { PlayerInputs, PlayerInputSource } from './sources';
import type { MouseInput } from './mouse';
import type { XboxInput } from './gamepad';
type Choice = 'keyboard' | 'mouse' | 'xbox0' | 'xbox1';
const labels: Record<Choice,string> = { keyboard:'键盘', mouse:'鼠标', xbox0:'Xbox / 手柄 1', xbox1:'Xbox / 手柄 2' };

export function mountDeviceUI(inputs: PlayerInputs, keyboard: Keyboard, mouse: MouseInput, pads: [XboxInput,XboxInput]) {
  const selected: [Choice,Choice] = ['keyboard','keyboard'];
  const select = [document.querySelector<HTMLSelectElement>('#p1-device')!,document.querySelector<HTMLSelectElement>('#p2-device')!];
  const status = [document.querySelector<HTMLElement>('#p1-device-status')!,document.querySelector<HTMLElement>('#p2-device-status')!];
  const source = (player: 0|1, choice: Choice): PlayerInputSource => choice === 'keyboard' ? keyboard.source(player) : choice === 'mouse' ? mouse : pads[choice === 'xbox0' ? 0 : 1];
  const handlers = select.map((element,index) => {
    for (const [value,label] of Object.entries(labels)) { const option=document.createElement('option'); option.value=value; option.textContent=label; element.append(option); }
    const change = () => {
      const choice=element.value as Choice;
      if (choice !== 'keyboard' && selected[1-index] === choice) { element.value=selected[index]; return; }
      inputs.setSource(index as 0|1,source(index as 0|1,choice)); selected[index]=choice;
      mouse.setSelected(selected.includes('mouse'));
      document.querySelector<HTMLCanvasElement>('#game')!.focus();
    };
    element.addEventListener('change',change); return change;
  });
  return {
    text(text: string): string {
      const move = (i:number) => selected[i] === 'mouse' ? '移动鼠标' : selected[i] === 'keyboard' ? (i === 0 ? '轻按 WASD' : '轻按方向键') : '轻推左摇杆';
      const ability = (i:number) => selected[i] === 'mouse' ? '鼠标左键' : selected[i] === 'keyboard' ? (i === 0 ? 'F' : 'Enter') : '手柄 A';
      return text.replace('轻按 WASD',move(0)).replace('轻按方向键',move(1)).replace(/\bF\b/g,ability(0)).replace(/\bEnter\b/g,ability(1));
    },
    update() {
      select.forEach((element,i)=> {
        for(const option of element.options) option.disabled=option.value!=='keyboard' && option.value===selected[1-i];
        const choice=selected[i];
        const message=choice==='keyboard' ? (i===0?'WASD 移动 / F 技能':'方向键移动 / Enter 技能') : choice==='mouse' ? `持续追踪屏幕鼠标 / 左键技能 / 右键切换制动 · ${mouse.isBraking?'已制动':'追踪中'}` : pads[choice==='xbox0'?0:1].status;
        if(status[i].textContent!==message)status[i].textContent=message;
        const help=document.querySelector<HTMLElement>(`#p${i+1}-controls`)!;
        const controls=choice==='keyboard' ? message : choice==='mouse' ? '鼠标追踪 · 左键技能 · 右键制动' : '左摇杆移动 · A 开 / 关';
        if(help.textContent!==controls)help.textContent=controls;
      });
    },
    dispose() { select.forEach((element,i)=>{element.removeEventListener('change',handlers[i]);element.replaceChildren();}); },
  };
}
