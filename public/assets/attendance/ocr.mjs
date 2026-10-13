export function linesFromBlocks(blocks){const words=[];for(const b of blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[])for(const w of l.words||[]){if(w.text?.trim())words.push(w);}
  if(!words.length)return '';
  const height=words.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b)[Math.floor(words.length/2)];const groups=[];
  for(const word of words.sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1))){const cy=(word.bbox.y0+word.bbox.y1)/2;let group=groups.find(g=>Math.abs(g.y-cy)<Math.max(9,height*.7));if(!group){group={y:cy,words:[]};groups.push(group);}group.words.push(word);}
  return groups.sort((a,b)=>a.y-b.y).map(g=>g.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(w=>w.text).join(' ')).join('\n');
}
// 增强：转灰度，最深的 0.5% 当作黑、230 以上当作白，中间拉开再加一点 gamma，让浅灰小字变深、白底不变
export function enhance(ctx,w,h){const im=ctx.getImageData(0,0,w,h),d=im.data,n=d.length/4,gray=new Uint8ClampedArray(n),hist=new Uint32Array(256);
  for(let i=0,j=0;j<n;i+=4,j++){const v=d[i]*.299+d[i+1]*.587+d[i+2]*.114;gray[j]=v;hist[gray[j]]++;}
  let lo=0,acc=0;for(let v=0;v<256;v++){acc+=hist[v];if(acc>n*.005){lo=v;break;}}lo=Math.min(lo,180);
  for(let i=0,j=0;j<n;i+=4,j++){let v=(gray[j]-lo)/(230-lo);v=v<0?0:v>1?1:v;d[i]=d[i+1]=d[i+2]=Math.pow(v,1.6)*255;}
  ctx.putImageData(im,0,0);}
let worker=null,reportProgress=()=>{};
export async function recognize(file,onProgress){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw new Error('请上传PNG、JPG或WebP截图，每张不超过15MB');
  const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>30000000){bitmap.close();throw new Error('截图过大，请分成几张上传');}
  // 放大：OA 表格是 13px 左右的浅灰小字，截图再被缩小 / 压缩后，原来只按宽度放大（最多 2 倍、宽不超过 2500）会小到读不准。
  // 改成尽量放大到约 4200 宽（最多 3 倍），总像素封顶 2400 万，避免长截图撑爆内存。2026-10-13 用复刻的 OA 截图实测：缩小到 75% 的截图从 9/22 提到 22/22
  let scale=Math.max(1,Math.min(3,4200/bitmap.width));scale=Math.min(scale,Math.sqrt(24000000/(bitmap.width*bitmap.height)));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  enhance(ctx,canvas.width,canvas.height);
  reportProgress=onProgress;
  if(!worker){worker=await Tesseract.createWorker('chi_sim+eng',1,{workerPath:'/assets/attendance/vendor/worker.min.js',corePath:'/assets/attendance/vendor/core',langPath:'/assets/attendance/vendor/lang',workerBlobURL:false,logger:m=>{if(m.status==='recognizing text')reportProgress(m.progress);},errorHandler:()=>{}});await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT,preserve_interword_spaces:'1'});}
  reportProgress=p=>onProgress(p*.5);
  const original=await worker.recognize(canvas,{}, {text:true,blocks:true});
  const originalText=linesFromBlocks(original.data.blocks)||original.data.text;
  // 第二轮：在增强后的灰度上二值化（深于 150 算字），和第一轮互补
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixels.data.length;i+=4){const value=pixels.data[i]<150?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}
  ctx.putImageData(pixels,0,0);reportProgress=p=>onProgress(.5+p*.5);
  const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});onProgress(1);return originalText+'\n'+(linesFromBlocks(data.blocks)||data.text);
}
export async function releaseOCR(){if(worker){await worker.terminate();worker=null;}}
