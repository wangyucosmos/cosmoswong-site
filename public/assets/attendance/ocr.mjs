export function linesFromBlocks(blocks){const words=[];for(const b of blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[])for(const w of l.words||[]){if(w.text?.trim())words.push(w);}
  if(!words.length)return '';
  const height=words.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b)[Math.floor(words.length/2)];const groups=[];
  for(const word of words.sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1))){const cy=(word.bbox.y0+word.bbox.y1)/2;let group=groups.find(g=>Math.abs(g.y-cy)<Math.max(9,height*.7));if(!group){group={y:cy,words:[]};groups.push(group);}group.words.push(word);}
  return groups.sort((a,b)=>a.y-b.y).map(g=>g.words.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(w=>w.text).join(' ')).join('\n');
}
let worker=null,reportProgress=()=>{};
export async function recognize(file,onProgress){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw new Error('请上传PNG、JPG或WebP截图，每张不超过15MB');
  const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>30000000){bitmap.close();throw new Error('截图过大，请分成几张上传');}
  const scale=Math.min(2,2500/bitmap.width);const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  reportProgress=onProgress;
  if(!worker){worker=await Tesseract.createWorker('chi_sim+eng',1,{workerPath:'/assets/attendance/vendor/worker.min.js',corePath:'/assets/attendance/vendor/core',langPath:'/assets/attendance/vendor/lang',workerBlobURL:false,logger:m=>{if(m.status==='recognizing text')reportProgress(m.progress);},errorHandler:()=>{}});await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT,preserve_interword_spaces:'1'});}
  reportProgress=p=>onProgress(p*.5);
  const original=await worker.recognize(canvas,{}, {text:true,blocks:true});
  const originalText=linesFromBlocks(original.data.blocks)||original.data.text;
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixels.data.length;i+=4){const gray=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3;const value=gray>205?255:gray;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}
  ctx.putImageData(pixels,0,0);reportProgress=p=>onProgress(.5+p*.5);
  const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});onProgress(1);return originalText+'\n'+(linesFromBlocks(data.blocks)||data.text);
}
export async function releaseOCR(){if(worker){await worker.terminate();worker=null;}}
