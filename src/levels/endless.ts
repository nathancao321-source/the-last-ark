import type { Level } from '../game/types';
import { createBody } from '../game/entities';
import { firstLevel } from './first';
export const endlessLevel: Level = {
  id:'beyond-the-stars',name:'BEYOND THE STARS / 群星之间',width:1100,height:620,
  mode:'exploration',procedural:true,seed:20261017,shipHealth:100,
  players:structuredClone(firstLevel.players).map((p,i)=>({...p,position:{x:i?-90:120,y:i?140:-140}})) as Level['players'],
  bodies:[createBody({id:'ark',kind:'ship',radius:8,position:{x:0,y:0},velocity:{x:90,y:0}})],
  mission:{objectives:[],triggers:[],completeOnObjectives:false},
};
