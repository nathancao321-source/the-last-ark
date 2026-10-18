/** Shared Canvas tokens for the standalone tuning page and main-line renderer. */
export const SPACE = {
  background:'#0c1220ff', dark:'#01030aff', light:'#9fb6d8ff',
  blue:'#409effff', gold:'#e9bd48ff', text:'#92a0b3ff',
  blueHalo:'#409eff2e', goldHalo:'#e9bd482e', clear:'#00000000',
  stars:['#a5b9cf32','#b8cce354','#d2e0ee8c'],
} as const;
export const HAZARD = {
  debugArea:'#ff24c8ff',debugAxis:'#8cffa6ff',
  jetCore:'#d9f7ffff',jetLight:'#86c9ffff',jetPlume:'#5046aaff',warning:'#7399dfff',
  waveCore:'#fff3caff',waveGold:'#ffc55aff',waveEdge:'#e46b2fff',impact:'#e75c6880',
  jetRim:'#4189dd66',jetClear:'#4189dd00',jetWhite:'#f2fcffff',
} as const;

/** Celestial accents stay separate from gameplay collision colors. */
export const ASTRO={sunBase:'#e38c26ff',coldBase:'#9ed7f2ff',plasmaHot:'#ffe3a3ff',plasmaWarm:'#ff7e29ff',cold:'#a4dcffff',void:'#000000ff',diskHot:'#fff0c8ff',diskWarm:'#bd762dff',portal:'#7fced1ff',portalDim:'#426e8aff',portalVoid:'#030711ff',clear:'#00000000'} as const;
export const CELESTIAL = {
  sunCore:'#fff2c2', sunMid:'#ffe6a0', sunHalo:'#ff9a3d66', sunClear:'#ff7c1700',
  ring:'#e9c98b', ringHighlight:'#fff0bd', rockLight:'#c5cbd0', rockMid:'#737d8a', rockDark:'#303741',
  wormhole:'#64d98b', wormholeVoid:'#071525', holeVoid:'#03030a', holeRing:'#f0b7cf88',
  shipGlow:'#ffffff', starArc:'#ffb454', holeWarm:'#f0c18a', holeCool:'#d4a1d8',
  earth:['#bfe8ff','#2875b8','#10264e'], mars:['#f1ba86','#ad4e37','#4a1d25'],
  jupiter:['#f1d3a5','#ad7655','#503b3b'], saturn:['#f4d99d','#c2965e','#5b4637'],
  uranus:['#c7fbf4','#58aebc','#245b73'], neptune:['#a8c8ff','#416dca','#172b68'],
  planet:['#e2d2bf','#8f7b6e','#383542'],
} as const;
