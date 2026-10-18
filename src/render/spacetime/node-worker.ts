import { nodeFrame,NODE_FRAMES,NODE_SIZE } from './node-texture';
const scope=self as unknown as {onmessage:()=>void;postMessage:(message:unknown,transfer:Transferable[])=>void};
scope.onmessage=()=>{
  const width=NODE_SIZE*NODE_FRAMES,height=NODE_SIZE*2,data=new Uint8ClampedArray(width*height*4),start=performance.now();
  for(let row=0;row<2;row++)for(let frame=0;frame<NODE_FRAMES;frame++){
    const pixels=nodeFrame(row===0?1:-1,frame);
    for(let y=0;y<NODE_SIZE;y++)data.set(pixels.subarray(y*NODE_SIZE*4,(y+1)*NODE_SIZE*4),((row*NODE_SIZE+y)*width+frame*NODE_SIZE)*4);
  }scope.postMessage({data,width,height,ms:performance.now()-start},[data.buffer]);
};
