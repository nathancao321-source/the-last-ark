/** One persistent music element for menus and all levels. */
export function mountMusic(parent:HTMLElement,src:string){
 const audio=document.createElement('audio');audio.src=src;audio.loop=true;audio.preload='auto';audio.volume=.35;audio.dataset.role='background-music';
 const button=document.createElement('button');button.type='button';button.id='music-toggle';button.textContent='开启音乐';button.setAttribute('aria-label','背景音乐播放开关');parent.append(button,audio);
 let muted=false,disposed=false,pending:Promise<void>|undefined;
 const play=()=>{if(disposed||muted||!audio.paused)return;if(pending)return pending;pending=audio.play().then(()=>{if(disposed||muted){audio.pause();return;}button.textContent='音乐：开';}).catch(()=>{if(!disposed)button.textContent='点击开启音乐';}).finally(()=>{pending=undefined;});return pending;};
 const gesture=(event:Event)=>{if(event.target===button)return;void play();};
 const click=()=>{if(!audio.paused){muted=true;audio.pause();button.textContent='音乐：关';}else{muted=false;void play();}};
 button.addEventListener('click',click);window.addEventListener('pointerdown',gesture);window.addEventListener('keydown',gesture);
 audio.addEventListener('error',()=>{button.textContent='音乐加载失败';});void play();
 return {audio,dispose:()=>{disposed=true;audio.pause();audio.removeAttribute('src');audio.load();window.removeEventListener('pointerdown',gesture);window.removeEventListener('keydown',gesture);button.remove();audio.remove();}};
}
